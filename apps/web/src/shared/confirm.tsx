import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useFocusTrap } from './useFocusTrap';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(Boolean(pending));

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const close = useCallback(
    (ok: boolean) => {
      setPending((p) => {
        p?.resolve(ok);
        return null;
      });
    },
    [],
  );

  useEffect(() => {
    if (!pending) return;
    confirmBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <div className="modal-backdrop" onClick={() => close(false)}>
          <div
            ref={trapRef}
            className="modal card stack confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={pending.title ?? 'Confirm'}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="page-title">{pending.title ?? 'Are you sure?'}</h3>
            <p className="muted">{pending.message}</p>
            <div className="row actions">
              <button
                ref={confirmBtn}
                type="button"
                className={`btn${pending.danger ? ' btn-danger' : ''}`}
                onClick={() => close(true)}
              >
                {pending.confirmLabel ?? 'Confirm'}
              </button>
              <button type="button" className="btn secondary" onClick={() => close(false)}>
                {pending.cancelLabel ?? 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
