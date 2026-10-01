use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

use crate::error::{WolfError, WolfResult};

pub const MAIN_WINDOW: &str = "main";
pub const COMPANION_WINDOW: &str = "companion";

pub const COMPANION_WIDTH: u32 = 132;
pub const COMPANION_HEIGHT: u32 = 148;

pub fn main_window<R: Runtime>(app: &AppHandle<R>) -> WolfResult<tauri::WebviewWindow<R>> {
    app.get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| WolfError::desktop("The main Wolf window is not available."))
}

pub fn companion_window<R: Runtime>(app: &AppHandle<R>) -> WolfResult<tauri::WebviewWindow<R>> {
    app.get_webview_window(COMPANION_WINDOW)
        .ok_or_else(|| WolfError::desktop("The Wolf companion window is not available."))
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) -> WolfResult<()> {
    let window = main_window(app)?;
    window.unminimize().ok();
    window
        .show()
        .map_err(|e| WolfError::desktop(e.to_string()))?;
    window
        .set_focus()
        .map_err(|e| WolfError::desktop(e.to_string()))?;
    Ok(())
}

pub fn hide_main<R: Runtime>(app: &AppHandle<R>) -> WolfResult<()> {
    let window = main_window(app)?;
    window.hide().map_err(|e| WolfError::desktop(e.to_string()))
}

pub fn ensure_companion<R: Runtime>(app: &AppHandle<R>) -> WolfResult<tauri::WebviewWindow<R>> {
    if let Some(existing) = app.get_webview_window(COMPANION_WINDOW) {
        if existing.is_visible().unwrap_or(false) {
            return Ok(existing);
        }
        existing
            .show()
            .map_err(|e| WolfError::desktop(e.to_string()))?;
        return Ok(existing);
    }

    let settings = crate::state::state(app)?.settings();

    let mut builder = WebviewWindowBuilder::new(
        app,
        COMPANION_WINDOW,
        WebviewUrl::App("companion.html".into()),
    )
    .title("Wolf Companion")
    .inner_size(COMPANION_WIDTH as f64, COMPANION_HEIGHT as f64)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(settings.companion_always_on_top)
    .skip_taskbar(true)
    .resizable(false)
    .visible(false);

    if let (Some(x), Some(y)) = (settings.companion_x, settings.companion_y) {
        builder = builder.position(x, y);
    } else {
        if let Some(monitor) = app.primary_monitor().ok().flatten() {
            let size = *monitor.size();
            let position = *monitor.position();
            let scale = monitor.scale_factor();
            let width = COMPANION_WIDTH as f64 * scale;
            let height = COMPANION_HEIGHT as f64 * scale;
            let x = (position.x as f64 + size.width as f64 - width - 24.0 * scale).max(0.0);
            let y = (position.y as f64 + size.height as f64 - height - 48.0 * scale).max(0.0);
            builder = builder.position(x, y);
        }
    }

    builder
        .build()
        .map_err(|e| WolfError::desktop(format!("Wolf could not open the companion window: {e}")))
}

pub fn set_companion_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> WolfResult<()> {
    if visible {
        let window = ensure_companion(app)?;
        window
            .show()
            .map_err(|e| WolfError::desktop(e.to_string()))?;
    } else if let Some(window) = app.get_webview_window(COMPANION_WINDOW) {
        window
            .hide()
            .map_err(|e| WolfError::desktop(e.to_string()))?;
    }
    Ok(())
}

pub fn toggle_companion<R: Runtime>(app: &AppHandle<R>) -> WolfResult<bool> {
    let visible = app
        .get_webview_window(COMPANION_WINDOW)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    set_companion_visible(app, !visible)?;
    Ok(!visible)
}

pub fn set_companion_always_on_top<R: Runtime>(app: &AppHandle<R>, value: bool) -> WolfResult<()> {
    if let Some(window) = app.get_webview_window(COMPANION_WINDOW) {
        window
            .set_always_on_top(value)
            .map_err(|e| WolfError::desktop(e.to_string()))?;
    }
    Ok(())
}

pub fn persist_companion_position<R: Runtime>(app: &AppHandle<R>) -> WolfResult<()> {
    let Some(window) = app.get_webview_window(COMPANION_WINDOW) else {
        return Ok(());
    };
    let (Ok(position), Ok(size), Ok(scale)) = (
        window.outer_position(),
        window.inner_size(),
        window.scale_factor(),
    ) else {
        return Ok(());
    };
    let scale = if scale > 0.0 { scale } else { 1.0 };

    crate::state::state(app)?.patch_settings(crate::models::SettingsPatch {
        companion_x: Some(position.x as f64 / scale),
        companion_y: Some(position.y as f64 / scale),
        companion_scale: Some((size.width as f64 / COMPANION_WIDTH as f64).clamp(0.5, 2.0)),
        ..crate::models::SettingsPatch::default()
    })?;
    Ok(())
}

pub fn quit<R: Runtime>(app: &AppHandle<R>) {
    if app.tray_by_id(crate::tray::TRAY_ID).is_some() {
        app.remove_tray_by_id(crate::tray::TRAY_ID);
    }
    if let Some(window) = app.get_webview_window(COMPANION_WINDOW) {
        let _ = window.destroy();
    }
    app.exit(0);
}
