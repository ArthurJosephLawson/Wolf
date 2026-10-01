import { useEffect } from "react";
import { useUiStore, type Toast } from "./uiStore";

const LIFETIME = 4_000;
const LIFETIME_ERROR = 8_000;

export function ToastHost() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  return (
    <div className="toasts" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
}

function ToastRow({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const id = window.setTimeout(
      () => onDismiss(toast.id),
      toast.tone === "error" ? LIFETIME_ERROR : LIFETIME,
    );
    return () => window.clearTimeout(id);
  }, [toast.id, toast.tone, onDismiss]);

  return (
    <div
      className="toast anim-slide-in"
      data-tone={toast.tone}
      role={toast.tone === "error" ? "alert" : "status"}
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
    >
      <span className="toast__bar" aria-hidden="true" />
      <div>
        <strong style={{ display: "block" }}>{toast.title}</strong>
        {toast.body ? <span className="faint">{toast.body}</span> : null}
      </div>
      <button
        type="button"
        className="toast__close"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
