import { useWolfFrame } from "./useWolfFrames";
import { useWolfStore } from "./wolfStore";
import { useOllamaSummary } from "../assistant/ollamaStore";
import { WolfSprite } from "./WolfSprite";

interface WolfWidgetProps {
  scale?: number;
  showStatus?: boolean;
  onClick?: () => void;
  title?: string;
}

export function WolfWidget({
  scale = 3,
  showStatus = true,
  onClick,
  title,
}: WolfWidgetProps) {
  const state = useWolfStore((s) => s.state);
  const { frame, label } = useWolfFrame(state);
  const ollama = useOllamaSummary();

  return (
    <div className="wolf">
      <div
        className="wolf__sprite-wrap"

        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={
          onClick
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
      >
        <WolfSprite
          frame={frame}
          scale={scale}
          data-state={state}
          title={`${label}. ${title ?? "Wolf"}`}
        />
      </div>
      {showStatus ? (
        <p className="wolf__status" aria-live="polite">
          <span
            className="wolf__dot"
            data-tone={ollama.tone}
            aria-hidden="true"
          />
          {label}
        </p>
      ) : null}
    </div>
  );
}
