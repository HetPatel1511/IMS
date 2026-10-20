import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../shared/auth';
import { getTheme, nextTheme, saveTheme, themeIcon, themeLabel } from '../../shared/theme';

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(() => getTheme());

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <button
        type="button"
        className="icon-btn login-theme"
        aria-label={`Theme: ${themeLabel(theme)}. Click to change.`}
        title={`Theme: ${themeLabel(theme)}`}
        onClick={() => {
          const t = nextTheme(theme);
          setTheme(t);
          saveTheme(t);
        }}
      >
        {themeIcon(theme)}
      </button>
      <form className="card login-card stack" onSubmit={onSubmit}>
        <div>
          <h1>IMS</h1>
          <p className="muted">Manufacturing inventory, configured by metadata.</p>
        </div>
        <label className="label" htmlFor="login-email">
          Email
          <input
            id="login-email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="label" htmlFor="login-password">
          Password
          <input
            id="login-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        {import.meta.env.DEV ? (
          <p className="muted login-hint">Dev login: admin@ims.local / Admin123!</p>
        ) : null}
      </form>
    </div>
  );
}
