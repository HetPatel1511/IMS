import { FormEvent, ReactNode, useEffect } from 'react';
import { useConfirm } from './confirm';
import { useFocusTrap } from './useFocusTrap';

type FormModalProps = {
  open: boolean;
  /** Title shown when creating (editingLabel is empty). */
  title: string;
  /** When set, the header shows an "Editing <label>" badge and the modal uses edit styling. */
  editingLabel?: string | null;
  subtitle?: string;
  submitLabel: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  /** When true, closing via Esc / backdrop / Cancel asks to discard first. */
  dirty?: boolean;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
  children: ReactNode;
};

/**
 * The app's standard create/edit dialog — backdrop, focus-trap + return-focus,
 * Esc / backdrop close with an unsaved-changes guard, an "Editing <label>" header
 * treatment, a `noValidate` form (so screens show their own inline errors), and a
 * consistent submit/cancel footer. Extracted from the Items modal so every CRUD
 * screen shares one interaction pattern.
 */
export function FormModal({
  open,
  title,
  editingLabel,
  subtitle,
  submitLabel,
  submitting,
  submitDisabled,
  dirty,
  onSubmit,
  onClose,
  children,
}: FormModalProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const confirm = useConfirm();

  async function requestClose() {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Close without saving?',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        danger: true,
      });
      if (!ok) return;
    }
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={() => void requestClose()}>
      <div
        ref={trapRef}
        className={`modal card stack${editingLabel ? ' edit-mode' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={editingLabel ? `Edit ${editingLabel}` : title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row spread">
          <div>
            <h3 className="page-title">
              {editingLabel ? (
                <>
                  <span className="edit-badge">Editing</span> {editingLabel}
                </>
              ) : (
                title
              )}
            </h3>
            {subtitle ? <p className="modal-subtitle">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={() => void requestClose()}
          >
            ×
          </button>
        </div>

        <form className="stack" onSubmit={onSubmit} noValidate>
          {children}
          <div className="row actions">
            <button className="btn" type="submit" disabled={submitting || submitDisabled}>
              {submitting ? 'Saving…' : submitLabel}
            </button>
            <button type="button" className="btn secondary" onClick={() => void requestClose()}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
