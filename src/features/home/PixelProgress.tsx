export function PixelProgress({
  value,
  max,
  label,
  tone = "accent",
  segments = 10,
}: {
  value: number;
  max: number;
  label: string;
  tone?: "accent" | "ok" | "warn" | "danger";
  segments?: number;
}) {
  const safeMax = Math.max(1, max);
  const ratio = Math.min(1, Math.max(0, value / safeMax));
  const filled = Math.round(ratio * segments);
  const colour = {
    accent: "var(--accent)",
    ok: "var(--success)",
    warn: "var(--warning)",
    danger: "var(--danger)",
  }[tone];

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${segments}, 1fr)`,
        gap: 2,
        height: 8,
      }}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            background: i < filled ? colour : "var(--bg-sunken)",
            borderTop: "2px solid",
            borderColor: i < filled ? colour : "var(--border)",
          }}
        />
      ))}
    </div>
  );
}
