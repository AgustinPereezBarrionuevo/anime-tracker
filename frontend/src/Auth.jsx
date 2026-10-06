import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

function Auth({ onLogin }) {
  const [modo, setModo] = useState('login'); // 'login' o 'registro'
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function manejarSubmit(e) {
    e.preventDefault();
    setError('');
    setCargando(true);

    const endpoint = modo === 'login' ? '/auth/login' : '/auth/registro';
    const body =
      modo === 'login'
        ? { nombre_usuario: nombreUsuario, password }
        : { nombre_usuario: nombreUsuario, email, password };

    try {
      const respuesta = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(data.error || 'Algo salió mal');
      }

      if (modo === 'login') {
        onLogin(data.token, data.usuario);
      } else {
        setModo('login');
        setError('Cuenta creada. Ahora iniciá sesión.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="auth-container">
      <form className="auth-form" onSubmit={manejarSubmit}>
        <h2>{modo === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>

        <input
          type="text"
          placeholder="Nombre de usuario"
          value={nombreUsuario}
          onChange={(e) => setNombreUsuario(e.target.value)}
          required
        />

        {modo === 'registro' && (
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        )}

        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={cargando}>
          {cargando ? 'Cargando...' : modo === 'login' ? 'Entrar' : 'Registrarme'}
        </button>

        <p className="auth-switch">
          {modo === 'login' ? (
            <>
              ¿No tenés cuenta?{' '}
              <span onClick={() => setModo('registro')}>Registrate</span>
            </>
          ) : (
            <>
              ¿Ya tenés cuenta?{' '}
              <span onClick={() => setModo('login')}>Iniciá sesión</span>
            </>
          )}
        </p>
      </form>
    </div>
  );
}

export default Auth;