import { useState, useEffect } from 'react';
import Auth from './Auth';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL;

const ESTADOS = [
  { value: 'viendo', label: 'Viendo' },
  { value: 'plan_to_watch', label: 'Pendiente' },
  { value: 'completado', label: 'Completado' },
  { value: 'dropeado', label: 'Dropeado' },
];

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [usuario, setUsuario] = useState(
    JSON.parse(localStorage.getItem('usuario') || 'null')
  );

  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);

  function manejarLogin(nuevoToken, nuevoUsuario) {
    localStorage.setItem('token', nuevoToken);
    localStorage.setItem('usuario', JSON.stringify(nuevoUsuario));
    setToken(nuevoToken);
    setUsuario(nuevoUsuario);
  }

  function cerrarSesion() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setToken(null);
    setUsuario(null);
    setLista([]);
  }

  async function cargarLista() {
    try {
      const respuesta = await fetch(`${API_URL}/mi-lista`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (respuesta.status === 401) {
        cerrarSesion();
        return;
      }

      if (!respuesta.ok) throw new Error('Error al traer la lista');
      const data = await respuesta.json();
      setLista(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (token) cargarLista();
  }, [token]);

  async function buscar() {
    if (!busqueda.trim()) return;
    setBuscando(true);
    try {
      const respuesta = await fetch(
        `${API_URL}/anime/buscar?nombre=${encodeURIComponent(busqueda)}`
      );
      if (!respuesta.ok) throw new Error('Error al buscar');
      const data = await respuesta.json();
      setResultados(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setBuscando(false);
    }
  }

  async function agregar(anime) {
    const respuesta = await fetch(`${API_URL}/mi-lista`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...anime, estado: 'plan_to_watch' }),
    });
    if (!respuesta.ok) {
      const data = await respuesta.json();
      alert(data.error);
      return;
    }
    await cargarLista();
  }

  async function borrar(id) {
    const confirmar = window.confirm('¿Seguro que querés borrarlo de tu lista?');
    if (!confirmar) return;

    await fetch(`${API_URL}/mi-lista/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await cargarLista();
  }

  async function cambiarEstado(id, nuevoEstado) {
    await fetch(`${API_URL}/mi-lista/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    await cargarLista();
  }

  async function cambiarEpisodio(item, delta) {
    const nuevoEpisodio = item.episodio_actual + delta;
    if (nuevoEpisodio < 0) return;
    if (item.episodios && nuevoEpisodio > item.episodios) return;
    await actualizarEpisodio(item, nuevoEpisodio);
  }

  async function actualizarEpisodio(item, valor) {
    let nuevoEpisodio = parseInt(valor, 10);

    if (isNaN(nuevoEpisodio) || nuevoEpisodio < 0) nuevoEpisodio = 0;
    if (item.episodios && nuevoEpisodio > item.episodios) {
      nuevoEpisodio = item.episodios;
    }

    await fetch(`${API_URL}/mi-lista/${item.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ episodio_actual: nuevoEpisodio }),
    });
    await cargarLista();
  }

  if (!token) {
    return <Auth onLogin={manejarLogin} />;
  }

  if (cargando) return <p>Cargando...</p>;
  if (error) return <p>Error: {error}</p>;

  const idsEnLista = new Set(lista.map((item) => item.anilist_id));

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-header">
          <h1>Mi lista de anime</h1>
          <div className="usuario-info">
            <span>{usuario?.nombre_usuario}</span>
            <button onClick={cerrarSesion}>Cerrar Sesión</button>
          </div>
        </div>
        <div className="buscador">
          <input
            type="text"
            placeholder="Buscar anime..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
          />
          <button onClick={buscar}>{buscando ? 'Buscando...' : 'Buscar'}</button>
        </div>
      </div>

      {resultados.length > 0 && (
        <>
          <h2>Resultados</h2>
          <div className="grid">
            {resultados.map((anime) => (
              <div className="card" key={anime.anilist_id}>
                <img src={anime.imagen} alt={anime.titulo} />
                <h3>{anime.titulo}</h3>
                {idsEnLista.has(anime.anilist_id) ? (
                  <button disabled>Ya en tu lista</button>
                ) : (
                  <button onClick={() => agregar(anime)}>+ Agregar</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {ESTADOS.map((estadoInfo) => {
        const animesDeEsteEstado = lista.filter(
          (item) => item.estado === estadoInfo.value
        );
        if (animesDeEsteEstado.length === 0) return null;

        return (
          <div key={estadoInfo.value} className="seccion">
            <h2>
              {estadoInfo.label} ({animesDeEsteEstado.length})
            </h2>
            <div className="grid">
              {animesDeEsteEstado.map((item) => (
                <div className={`card estado-${item.estado}`} key={item.id}>
                  <img src={item.imagen} alt={item.titulo} />
                  <h3>{item.titulo}</h3>
                  <span className={`badge-estado badge-${item.estado}`}>
                    {ESTADOS.find((e) => e.value === item.estado)?.label}
                  </span>
                  <select
                    value={item.estado}
                    onChange={(e) => cambiarEstado(item.id, e.target.value)}
                  >
                    {ESTADOS.map((e) => (
                      <option key={e.value} value={e.value}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                  <div className="episodios">
                    <button onClick={() => cambiarEpisodio(item, -1)}>-</button>
                    <input
                      type="number"
                      className="input-episodio"
                      value={item.episodio_actual}
                      min={0}
                      max={item.episodios ?? undefined}
                      onChange={(e) => actualizarEpisodio(item, e.target.value)}
                    />
                    <span>/ {item.episodios ?? '?'}</span>
                    <button onClick={() => cambiarEpisodio(item, 1)}>+</button>
                  </div>
                  <button onClick={() => borrar(item.id)}>Borrar</button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {lista.length === 0 && <p>Tu lista está vacía.</p>}
    </div>
  );
}

export default App;