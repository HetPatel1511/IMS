export type Theme = 'system' | 'light' | 'dark';

export function getTheme(): Theme {
  try {
    return (localStorage.getItem('ims_theme') as Theme) || 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

export function saveTheme(t: Theme) {
  try {
    localStorage.setItem('ims_theme', t);
  } catch {
    /* ignore */
  }
  applyTheme(t);
}

export function nextTheme(t: Theme): Theme {
  return t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system';
}

export function themeIcon(t: Theme) {
  return t === 'dark' ? '🌙' : t === 'light' ? '☀' : '◐';
}

export function themeLabel(t: Theme) {
  return t === 'dark' ? 'Dark' : t === 'light' ? 'Light' : 'Auto';
}

// Apply the persisted theme as soon as this module loads, so every route
// (including the standalone login page) reflects it.
applyTheme(getTheme());
