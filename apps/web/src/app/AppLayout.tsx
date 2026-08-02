import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../shared/auth';

export function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [navOpen]);

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className={`shell${navOpen ? ' nav-open' : ''}`}>
      <header className="mobile-header">
        <button
          type="button"
          className="icon-btn"
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={navOpen}
          aria-controls="app-sidebar"
          onClick={() => setNavOpen((open) => !open)}
        >
          {navOpen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
        <h1 className="mobile-brand">IMS</h1>
      </header>

      <button
        type="button"
        className="nav-backdrop"
        aria-label="Close menu"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />

      <aside id="app-sidebar" className="sidebar">
        <h1 className="brand">IMS</h1>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/inventory-types">Inventory Types</NavLink>
          <NavLink to="/items">Items</NavLink>
          <NavLink to="/stock">Stock</NavLink>
          <NavLink to="/suppliers">Suppliers</NavLink>
          <NavLink to="/buyers">Buyers</NavLink>
          <NavLink to="/settings">Settings</NavLink>
          <NavLink to="/audit">Audit</NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="muted user-meta">
            {user.fullName}
            <br />
            {user.role}
          </div>
          <button type="button" className="btn secondary" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
