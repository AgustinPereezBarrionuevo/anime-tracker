import express from 'express'; //import express from 'express' → como un using en C#, importa la librería
import pool from './db.js';
import cors from 'cors';

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

app.get('/mi-lista', async (req, res) => {
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
      ORDER BY mi_lista.fecha_actualizacion DESC
    `);

    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al traer la lista' });
  }
});

app.post('/mi-lista', async (req, res) => {
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
      `INSERT INTO mi_lista (anime_id, estado)
       VALUES ($1, $2)
       RETURNING *`,
      [animeId, estado || 'plan_to_watch']
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

app.patch('/mi-lista/:id', async (req, res) => {
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
       WHERE id = $4
       RETURNING *`,
      [estado, episodio_actual, mi_rating, id]
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


app.delete('/mi-lista/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      `DELETE FROM mi_lista WHERE id = $1 RETURNING *`,
      [id]
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

