import express from 'express'; //import express from 'express' → como un using en C#, importa la librería
import pool from './db.js';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { verificarToken } from './middleware/auth.js';

const app = express(); //const app = express() → creás la instancia de tu aplicación/servidor (pensalo como instanciar tu clase Startup en ASP.NET)
app.use(cors());
app.use(express.json());
const PORT = 3000;



app.get('/ping', (req, res) => { //app.get('/ping', callback) → definís una ruta. Cuando alguien hace GET a /ping, se ejecuta esa función. Es literalmente como definir un endpoint en un Controller de ASP.NET, pero sin la ceremonia de atributos/clases
  res.send('pong'); //(req, res) => {...} → esto es una arrow function, la forma moderna de JS de escribir funciones cortas. req es la request (lo que llega), res es la response (lo que vos devolvés)
});


// Nuevo endpoint: busca animes por nombre usando la API de Jikan
app.get('/anime/buscar', async (req, res) => {
  const nombre = req.query.nombre;

  if (!nombre) {
    return res.status(400).json({ error: 'Falta el parámetro nombre' });
  }

  const query = `
    query ($search: String) {
      Page(perPage: 10) {
        media(search: $search, type: ANIME) {
          id
          title {
            romaji
          }
          episodes
          coverImage {
            large
          }
          description
          status
        }
      }
    }
  `;

  try {
    const respuesta = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        variables: { search: nombre },
      }),
    });

    const data = await respuesta.json();

    if (!respuesta.ok) {
      return res.status(respuesta.status).json({ error: 'AniList devolvió un error', detalle: data });
    }

    const resultados = data.data.Page.media.map((anime) => ({
      anilist_id: anime.id,
      titulo: anime.title.romaji,
      imagen: anime.coverImage.large,
      episodios: anime.episodes,
      sinopsis: anime.description,
      estado: anime.status,
    }));

    res.json(resultados);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al consultar la API de anime' });
  }
});

app.get('/test-db', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT NOW()');
    res.json({ mensaje: 'Conexión exitosa', hora: resultado.rows[0].now });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo conectar a la base' });
  }
});

app.get('/mi-lista', verificarToken, async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT 
        mi_lista.id,
        mi_lista.estado,
        mi_lista.episodio_actual,
        mi_lista.mi_rating,
        mi_lista.fecha_actualizacion,
        animes.anilist_id,
        animes.titulo,
        animes.imagen,
        animes.episodios,
        animes.sinopsis
      FROM mi_lista
      JOIN animes ON mi_lista.anime_id = animes.id
      WHERE mi_lista.usuario_id = $1
      ORDER BY mi_lista.fecha_actualizacion DESC
    `, [req.usuario.id]);

    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al traer la lista' });
  }
});

app.post('/mi-lista', verificarToken, async (req, res) => {
  const { anilist_id, titulo, imagen, episodios, sinopsis, estado } = req.body;

  if (!anilist_id || !titulo) {
    return res.status(400).json({ error: 'Faltan datos obligatorios (anilist_id, titulo)' });
  }

  try {
    // 1. Insertamos el anime en la tabla "animes", o lo ignoramos si ya existe (por el UNIQUE)
    const animeResult = await pool.query(
      `INSERT INTO animes (anilist_id, titulo, imagen, episodios, sinopsis)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (anilist_id) DO UPDATE SET titulo = EXCLUDED.titulo
       RETURNING id`,
      [anilist_id, titulo, imagen, episodios, sinopsis]
    );

    const animeId = animeResult.rows[0].id;

    // 2. Lo agregamos a "mi_lista"
    const listaResult = await pool.query(
      `INSERT INTO mi_lista (anime_id, estado, usuario_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [animeId, estado || 'plan_to_watch', req.usuario.id]
    );

    res.status(201).json(listaResult.rows[0]);
    } catch (error) {
    // 23505 = código de Postgres para "violación de restricción UNIQUE"
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ese anime ya está en tu lista' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al guardar en la lista' });
  }
});

app.post('/auth/registro', async (req, res) => {
  const { nombre_usuario, email, password } = req.body;

  if (!nombre_usuario || !email || !password) {
    return res.status(400).json({ error: 'Faltan datos (nombre_usuario, email, password)' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const resultado = await pool.query(
      `INSERT INTO usuarios (nombre_usuario, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, nombre_usuario, email, fecha_registro`,
      [nombre_usuario, email, passwordHash]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ese usuario o email ya está registrado' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});


app.post('/auth/login', async (req, res) => {
  const { nombre_usuario, password } = req.body;

  if (!nombre_usuario || !password) {
    return res.status(400).json({ error: 'Faltan datos (nombre_usuario, password)' });
  }

  try {
    const resultado = await pool.query(
      `SELECT id, nombre_usuario, password_hash FROM usuarios WHERE nombre_usuario = $1`,
      [nombre_usuario]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const usuario = resultado.rows[0];
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordValida) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const token = jwt.sign(
      { id: usuario.id, nombre_usuario: usuario.nombre_usuario },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, usuario: { id: usuario.id, nombre_usuario: usuario.nombre_usuario } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

app.patch('/mi-lista/:id', verificarToken, async (req, res) => {
  const { id } = req.params;
  const { estado, episodio_actual, mi_rating } = req.body;

  try {
    const resultado = await pool.query(
      `UPDATE mi_lista
       SET 
         estado = COALESCE($1, estado),
         episodio_actual = COALESCE($2, episodio_actual),
         mi_rating = COALESCE($3, mi_rating),
         fecha_actualizacion = NOW()
       WHERE id = $4 AND usuario_id = $5
       RETURNING *`,
      [estado, episodio_actual, mi_rating, id, req.usuario.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontró ese registro en la lista' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});


app.delete('/mi-lista/:id', verificarToken, async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      `DELETE FROM mi_lista WHERE id = $1 AND usuario_id = $2 RETURNING *`,
      [id, req.usuario.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontró ese registro en la lista' });
    }

    res.json({ mensaje: 'Eliminado correctamente', eliminado: resultado.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

app.listen(PORT, () => { //app.listen(PORT, callback) → arranca el servidor escuchando en el puerto 3000
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

