import type { Route } from "../types";

export const NAV: readonly { route: Route; label: string; icon: string }[] = [
  { route: "home", label: "Today", icon: "◆" },
  { route: "tasks", label: "Tasks", icon: "✓" },
  { route: "habits", label: "Habits", icon: "◉" },
  { route: "calendar", label: "Calendar", icon: "▤" },
  { route: "focus", label: "Focus", icon: "◐" },
  { route: "assistant", label: "Assistant", icon: "? " },
  { route: "settings", label: "Settings", icon: "⚙" },
];
