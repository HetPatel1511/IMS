import type { ReactNode } from 'react';

/**
 * The app's one empty-state component (B4). Pages render it instead of ad-hoc
 * `<p class="muted">` / `colSpan` cells so "nothing here" reads the same everywhere.
 */
export function EmptyState({
  title,
  message,
  icon,
  action,
}: {
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon ?? (
        <svg
          className="es-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 7v10l9 4 9-4V7" />
          <path d="M12 11v10" />
        </svg>
      )}
      <h4>{title}</h4>
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  );
}
