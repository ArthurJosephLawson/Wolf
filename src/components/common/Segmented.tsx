/**
 * Horizontal segmented control.
 *
 * A radio group rather than a set of buttons so arrow keys work and screen
 * readers announce the selected option.
 */
import type { ReactNode } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div
      className="row"
      role="radiogroup"
      aria-label={label}
      style={{ gap: 2 }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`btn btn--small${selected ? " btn--primary" : " btn--ghost"}`}
            onClick={() => onChange(option.value)}
          >
            {option.icon ? <span aria-hidden="true">{option.icon}</span> : null}
            {option.label}
            {typeof option.count === "number" ? (
              <span className="faint">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
