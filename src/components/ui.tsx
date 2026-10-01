/** Small, dependency-free UI primitives shared across screens. */
import { useEffect, useRef, type ReactNode } from "react";

interface PanelProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  tight?: boolean;
  className?: string;
}

export function Panel({
  title,
  actions,
  children,
  tight,
  className,
}: PanelProps) {
  return (
    <section
      className={`panel${tight ? " panel--tight" : ""}${className ? ` ${className}` : ""}`}
    >
      {title || actions ? (
        <header
          className="panel__header"
          style={tight ? { padding: "8px 8px 0" } : undefined}
        >
          {title ? <h2 className="panel__title">{title}</h2> : null}
          {actions ? <div className="panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Chip({
  tone = "default",
  children,
  title,
}: {
  tone?: "default" | "ok" | "warn" | "danger" | "accent" | "solid";
  children: ReactNode;
  title?: string;
}) {
  const cls = tone === "default" ? "chip" : `chip chip--${tone}`;
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <span className="faint">{hint}</span> : null}
    </div>
  );
}

/** Inline error, used instead of a toast when the failure is tied to a form. */
export function ErrorNote({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss?: () => void;
}) {
  if (!message) return null;
  return (
    <div className="toast anim-slide-in" data-tone="error" role="alert">
      <span className="toast__bar" aria-hidden="true" />
      <div>
        <p style={{ margin: 0 }}>{message}</p>
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="toast__close"
          onClick={onDismiss}
          aria-label="Dismiss error"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * A keyboard-friendly dialog: focus moves in on open, Escape closes, and Tab is
 * trapped inside while it is open.
 */
export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current
      ?.querySelector<HTMLElement>(
        "input, select, textarea, button, [tabindex]",
      )
      ?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;

      const focusable = Array.from(
        panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panel}
      >
        <header className="panel__header">
          <h2 className="panel__title">{title}</h2>
          <div className="panel__actions">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={onClose}
              aria-label="Close dialog"
            >
              ×
            </button>
          </div>
        </header>
        {children}
        {footer ? (
          <div
            className="row"
            style={{ marginTop: 10, justifyContent: "flex-end" }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A labelled statistic, used all over the dashboard. */
export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "ok" | "warn" | "danger";
}) {
  return (
    <div className="panel" style={{ padding: 8 }}>
      <div className="mono-label">{label}</div>
      <div
        style={{
          fontFamily: "var(--font-pixel)",
          fontSize: 18,
          marginTop: 4,
          color:
            tone === "ok"
              ? "var(--success)"
              : tone === "warn"
                ? "var(--warning)"
                : tone === "danger"
                  ? "var(--danger)"
                  : "var(--text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
