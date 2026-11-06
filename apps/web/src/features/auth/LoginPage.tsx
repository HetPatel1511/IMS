import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../shared/auth';
import { getTheme, nextTheme, saveTheme, themeIcon, themeLabel } from '../../shared/theme';

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

      <div className="login-shell">
        <aside className="login-brand-panel" aria-hidden>
          <div className="lb-logo">
            <span className="brand-mark">IM</span> IMS
          </div>
          <div>
            <div className="lb-headline">Manufacturing inventory, configured by metadata.</div>
            <p className="lb-sub">
              Define your own item types and fields, track every stock movement, and keep a full
              audit trail — all in one place.
            </p>
          </div>
          <ul className="lb-points">
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              Dynamic, per-type field schemas
            </li>
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              Buy, sell & adjust with a live movement log
            </li>
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              Role-based access and change history
            </li>
          </ul>
        </aside>

        <form className="card login-card stack" onSubmit={onSubmit}>
          <div className="login-logo">
            <span className="brand-mark" aria-hidden>IM</span>
            <h1>IMS</h1>
          </div>
          <p className="muted">Sign in to your workspace.</p>

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
            <div className="password-field">
              <input
                id="login-password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-reveal"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                title={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          {error ? <div className="error">{error}</div> : null}

          <button className="btn block" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {import.meta.env.DEV ? (
            <p className="login-hint">Dev login: admin@ims.local / Admin123!</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
