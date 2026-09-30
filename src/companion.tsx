/**
 * Companion window entry point.
 *
 * A separate page (and a separate Tauri window) so the wolf can be shown over
 * the desktop independently of the main window.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Companion } from "./components/WolfWidget/Companion";
import { useSettingsStore } from "./stores/settingsStore";
import "./styles/globals.css";

document.documentElement.dataset.window = "companion";
document.body.dataset.window = "companion";

const container = document.getElementById("root");
if (!container) throw new Error("Wolf could not find its root element.");

// The companion needs the same preferences as the main window (scale, name)
// but none of its data, so it only loads settings.
void useSettingsStore.getState().load();

createRoot(container).render(
  <StrictMode>
    <Companion />
  </StrictMode>,
);
