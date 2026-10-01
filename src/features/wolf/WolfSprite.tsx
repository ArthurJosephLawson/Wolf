/**
 * Renders one wolf frame as SVG.
 *
 * The sprite is 28x28 pixels; a frame collapses to a few dozen `<rect>` runs
 * instead of 784 individual pixels, which keeps the animation cheap enough to
 * run in two windows at once. Dimensions come from the sprite module so the
 * artwork can be resized without editing this file.
 */
import { useMemo } from "react";
import {
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  toRuns,
  type Matrix,
} from "../../assets/wolf/sprites";

interface WolfSpriteProps {
  frame: Matrix;
  /** Rendered edge length of one sprite pixel, in CSS pixels. */
  scale?: number;
  className?: string;
  title?: string;
  /** Called when the sprite is clicked (the companion window). */
  onClick?: () => void;
}

export function WolfSprite({
  frame,
  scale = 4,
  className,
  title,
  onClick,
}: WolfSpriteProps) {
  const runs = useMemo(() => toRuns(frame), [frame]);
  const width = SPRITE_WIDTH * scale;
  const height = SPRITE_HEIGHT * scale;

  return (
    <svg
      className={`pixel-sprite wolf-sprite${className ? ` ${className}` : ""}`}
      viewBox={`0 0 ${SPRITE_WIDTH} ${SPRITE_HEIGHT}`}
      width={width}
      height={height}
      shapeRendering="crispEdges"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      onClick={onClick}
    >
      {runs.map((run) => (
        <rect
          key={`${run.y}-${run.x}-${run.fill}`}
          x={run.x}
          y={run.y}
          width={run.width}
          height={run.height}
          fill={run.fill}
        />
      ))}
    </svg>
  );
}

export { SPRITE_WIDTH, SPRITE_HEIGHT };
