import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * Toast system (design doc §4): bottom-right, tonal tint per action kind,
 * 4s auto-dismiss; undo suffix keeps a button for its 7s fuse window.
 */

export type ToastKind = 'saved' | 'approved' | 'removed' | 'withdrawn' | 'update-applied' | 'info' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  kind: ToastKind;
  message: string;
  /** e.g. " Undo" — a live button rendered after the message. */
  action?: ToastAction;
}

interface ToastEntry extends ToastOptions {
  id: number;
}

interface ToastApi {
  show: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const KIND_TONES: Record<ToastKind, { bg: string; color: string; border: string }> = {
  saved: { bg: 'color-mix(in oklab, var(--cat-on-campus) 10%, white)', color: 'var(--cat-on-campus)', border: 'color-mix(in oklab, var(--cat-on-campus) 30%, white)' },
  approved: { bg: 'color-mix(in oklab, var(--cat-on-campus) 10%, white)', color: 'var(--cat-on-campus)', border: 'color-mix(in oklab, var(--cat-on-campus) 30%, white)' },
  removed: { bg: 'color-mix(in oklab, var(--cat-training) 10%, white)', color: 'var(--cat-training)', border: 'color-mix(in oklab, var(--cat-training) 30%, white)' },
  withdrawn: { bg: 'color-mix(in oklab, var(--cat-experiential) 10%, white)', color: 'var(--cat-experiential)', border: 'color-mix(in oklab, var(--cat-experiential) 30%, white)' },
  'update-applied': { bg: 'color-mix(in oklab, var(--cat-fellowships) 10%, white)', color: 'var(--cat-fellowships)', border: 'color-mix(in oklab, var(--cat-fellowships) 30%, white)' },
  info: { bg: 'var(--surface)', color: 'var(--ink)', border: 'var(--mist)' },
  error: { bg: 'color-mix(in oklab, #8A3B3B 10%, white)', color: '#8A3B3B', border: 'color-mix(in oklab, #8A3B3B 30%, white)' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  const show = useCallback((opts: ToastOptions) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { ...opts, id }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-6 right-6 z-50 flex flex-col gap-2"
      >
        {toasts.map((t) => {
          const tone = KIND_TONES[t.kind];
          return (
            <div
              key={t.id}
              role="status"
              className="flex items-center gap-3 rounded-xl border px-4 py-3 text-[14px] shadow-[0_8px_24px_rgba(26,43,42,0.12)]"
              style={{ background: tone.bg, color: tone.color, borderColor: tone.border }}
            >
              <span>{t.message}</span>
              {t.action ? (
                <button
                  type="button"
                  className="font-semibold underline underline-offset-2 hover:opacity-80"
                  style={{ color: tone.color }}
                  onClick={() => {
                    t.action?.onClick();
                    setToasts((x) => x.filter((y) => y.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
