import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../shared/auth';
import { api } from '../shared/api';
import { setFormatConfig } from '../shared/format';
import {
  getTheme,
  nextTheme,
  saveTheme,
  themeIcon as themeIconFor,
  themeLabel as themeLabelFor,
  type Theme,
} from '../shared/theme';

type OrgSetting = { key: string; value: { locale?: string; defaultUnit?: string } };

const ICONS: Record<string, string> = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  types: 'M4 7h16M4 12h16M4 17h10',
  items: 'M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4',
  stock: 'M3 3v18h18M7 14l3-3 3 3 5-6',
  suppliers: 'M3 21V9l9-6 9 6v12h-6v-7H9v7H3z',
  buyers: 'M6 2l1.5 4h9L18 2M5 6h14l-1 14H6L5 6zm4 4v6m6-6v6',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM4 12l-1.5 2 2 3.5 2.5-.5a7 7 0 002 1.2l.5 2.3h4l.5-2.3a7 7 0 002-1.2l2.5.5 2-3.5L20 12l1.5-2-2-3.5-2.5.5a7 7 0 00-2-1.2L12.5 3.3h-4L8 5.6a7 7 0 00-2 1.2L3.5 6.3l-2 3.5L4 12z',
  audit: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 7h6m-6 4h4',
};

const NAV = [
  { to: '/', label: 'Dashboard', end: true, icon: 'dashboard' },
  { to: '/inventory-types', label: 'Inventory Types', icon: 'types' },
  { to: '/items', label: 'Items', icon: 'items' },
  { to: '/stock', label: 'Stock', icon: 'stock' },
  { to: '/suppliers', label: 'Suppliers', icon: 'suppliers' },
  { to: '/buyers', label: 'Buyers', icon: 'buyers' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
  { to: '/audit', label: 'Audit', icon: 'audit' },
];

function NavIcon({ name }: { name: string }) {
  return (
    <svg className="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

export function AppLayout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [railed, setRailed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ims_sidebar_rail') === '1';
    } catch {
      return false;
    }
  });
  const [theme, setTheme] = useState<Theme>(() => getTheme());

  useEffect(() => {
    saveTheme(theme);
  }, [theme]);

  const pageTitle = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))?.label ?? 'IMS';

  // Configure app-wide number/locale formatting from org settings.
  const settings = useQuery({
    queryKey: ['settings'],
    enabled: Boolean(user),
    queryFn: async () => (await api<OrgSetting[]>('/settings')).data,
  });
  useEffect(() => {
    const org = settings.data?.find((s) => s.key === 'org');
    if (org?.value?.locale) setFormatConfig({ locale: org.value.locale });
  }, [settings.data]);

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

  if (loading) {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        <span className="spinner" aria-hidden />
        <span>Loading…</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  function toggleRail() {
    setRailed((r) => {
      const next = !r;
      try {
        localStorage.setItem('ims_sidebar_rail', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const cycleTheme = () => setTheme((t) => nextTheme(t));
  const themeIcon = themeIconFor(theme);
  const themeLabel = themeLabelFor(theme);

  return (
    <div className={`shell${navOpen ? ' nav-open' : ''}${railed ? ' rail' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
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
        <h1 className="mobile-brand">{pageTitle}</h1>
        <button
          type="button"
          className="icon-btn mobile-theme"
          aria-label={`Theme: ${themeLabel}. Click to change.`}
          title={`Theme: ${themeLabel}`}
          onClick={cycleTheme}
        >
          {themeIcon}
        </button>
      </header>

      <button
        type="button"
        className="nav-backdrop"
        aria-label="Close menu"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />

      <aside id="app-sidebar" className="sidebar">
        <div className="brand-row">
          <h1 className="brand">IMS</h1>
          <div className="brand-row-actions">
            <button
              type="button"
              className="collapse-rail-btn"
              aria-label={`Theme: ${themeLabel}. Click to change.`}
              title={`Theme: ${themeLabel}`}
              onClick={cycleTheme}
            >
              {themeIcon}
            </button>
            <button
              type="button"
              className="collapse-rail-btn"
              aria-label={railed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={railed}
              title={railed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={toggleRail}
            >
              {railed ? '»' : '«'}
            </button>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} title={railed ? n.label : undefined}>
              <NavIcon name={n.icon} />
              <span className="nav-label">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="muted user-meta">
            {user.fullName}
            <br />
            {user.role}
          </div>
          <div className="row theme-row">
            <button
              type="button"
              className="btn secondary block"
              onClick={() => logout()}
              title="Log out"
            >
              ⏻<span className="btn-text"> Log out</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="main" id="main-content">
        {location.pathname !== '/' ? (
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <NavLink to="/">Dashboard</NavLink>
            <span aria-hidden className="crumb-sep">›</span>
            <span aria-current="page">{pageTitle}</span>
          </nav>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}
