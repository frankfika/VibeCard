import { createContext, useCallback, useContext, useMemo, useState, type ReactNode, type JSX, type Key } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle, AlertCircle, Info, Loader2 } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'error' | 'loading';

export interface Toast {
  id: string;
  title?: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
  update: (id: string, toast: Partial<Omit<Toast, 'id'>>) => void;
  promise: <T>(
    promise: Promise<T>,
    messages: { loading: string; success: string | ((value: T) => string); error: string | ((err: unknown) => string) },
    opts?: { duration?: number }
  ) => Promise<T>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const ICONS: Record<ToastType, typeof Info> = {
  info: Info,
  success: CheckCircle,
  error: AlertCircle,
  loading: Loader2,
};

const TYPE_STYLES: Record<ToastType, string> = {
  info: 'bg-background border-border text-foreground',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  error: 'bg-rose-50 border-rose-200 text-rose-900',
  loading: 'bg-background border-border text-foreground',
};

const ICON_COLORS: Record<ToastType, string> = {
  info: 'text-muted-foreground',
  success: 'text-emerald-600',
  error: 'text-rose-600',
  loading: 'text-muted-foreground',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setToasts(prev => [...prev, { ...toast, id }]);
    if (toast.type !== 'loading' && toast.duration !== 0) {
      setTimeout(() => dismiss(id), toast.duration ?? 4000);
    }
    return id;
  }, [dismiss]);

  const update = useCallback((id: string, toast: Partial<Omit<Toast, 'id'>>) => {
    setToasts(prev =>
      prev.map(t => (t.id === id ? { ...t, ...toast } : t))
    );
  }, []);

  const promise = useCallback<ToastContextValue['promise']>(
    async (promiseFn, messages, opts) => {
      const id = show({ message: messages.loading, type: 'loading', duration: 0 });
      try {
        const value = await promiseFn;
        const successMsg = typeof messages.success === 'function' ? messages.success(value) : messages.success;
        update(id, { message: successMsg, type: 'success', duration: opts?.duration ?? 4000 });
        setTimeout(() => dismiss(id), opts?.duration ?? 4000);
        return value;
      } catch (err) {
        const errorMsg = typeof messages.error === 'function' ? messages.error(err) : messages.error;
        update(id, { message: errorMsg, type: 'error', duration: opts?.duration ?? 6000 });
        setTimeout(() => dismiss(id), opts?.duration ?? 6000);
        throw err;
      }
    },
    [show, update, dismiss]
  );

  const value = useMemo(() => ({ toasts, show, dismiss, update, promise }), [toasts, show, dismiss, update, promise]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-0 left-0 right-0 z-[100] pointer-events-none p-4 flex flex-col items-center gap-3 md:items-end md:right-4 md:left-auto md:top-4 md:bottom-auto md:flex-col-reverse"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map(toast => (
            <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void; key?: Key }): JSX.Element {
  const Icon = ICONS[toast.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.96 }}
      transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      className={`pointer-events-auto w-full max-w-sm md:max-w-xs rounded-2xl border shadow-xl px-4 py-3.5 flex items-start gap-3 ${TYPE_STYLES[toast.type]}`}
    >
      <div className={`shrink-0 mt-0.5 ${ICON_COLORS[toast.type]}`}>
        <Icon className={`w-5 h-5 ${toast.type === 'loading' ? 'animate-spin' : ''}`} />
      </div>
      <div className="flex-1 min-w-0">
        {toast.title && <div className="text-[13px] font-bold mb-0.5">{toast.title}</div>}
        <div className="text-[13px] font-medium leading-snug break-words">{toast.message}</div>
        {toast.action && (
          <button
            onClick={() => {
              toast.action!.onClick();
              onDismiss();
            }}
            className="mt-2 text-[12px] font-bold underline underline-offset-2 opacity-80 hover:opacity-100"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 -mr-1 -mt-1 p-1.5 rounded-full opacity-60 hover:opacity-100 transition-opacity"
        aria-label="关闭通知"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}
