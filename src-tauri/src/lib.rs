//! Wolf — a local-first pixel-art productivity companion for Linux desktops.
//!
//! Everything lives on this machine: data in SQLite under the user's config
//! directory, AI through a locally running Ollama, notifications through the
//! freedesktop D-Bus service. There is no telemetry and no cloud dependency.

pub mod assistant;
pub mod commands;
pub mod database;
pub mod error;
pub mod models;
pub mod notifications;
pub mod ollama;
pub mod state;
pub mod tray;
pub mod windows;

use tauri::{Emitter, Manager, RunEvent, WindowEvent};

use crate::database::Database;
use crate::state::AppState;

/// Emitted when the tray menu is used.
/// Payload: `{ route?: "tasks" | "settings", focus?: "start" | "pause" }`.
pub const TRAY_EVENT: &str = tray::TRAY_EVENT;
/// Emitted when the companion window could not be created.
pub const COMPANION_ERROR_EVENT: &str = "wolf://companion-error";

fn bootstrap_database() -> Result<Database, String> {
    let path = database::default_database_path().map_err(|e| e.to_string())?;
    Database::open(&path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = match bootstrap_database() {
        Ok(db) => db,
        Err(reason) => {
            // Without a database Wolf cannot do anything useful, and an empty
            // window would hide the reason. Say so and stop.
            eprintln!("wolf: could not open the local database: {reason}");
            eprintln!(
                "wolf: expected it under $XDG_CONFIG_HOME/wolf/wolf.db (usually ~/.config/wolf/wolf.db)"
            );
            std::process::exit(1);
        }
    };

    let settings = match database.load_settings() {
        Ok(settings) => settings,
        Err(err) => {
            log::warn!("falling back to default settings: {err}");
            models::Settings::default()
        }
    };

    let companion_enabled = settings.companion_enabled;
    let start_minimized = settings.start_minimized;

    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = windows::show_main(app);
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new(database, settings))
        .invoke_handler(tauri::generate_handler![
            // Tasks
            commands::tasks::list_tasks,
            commands::tasks::create_task,
            commands::tasks::update_task,
            commands::tasks::set_task_completed,
            commands::tasks::delete_task,
            commands::tasks::task_stats,
            commands::tasks::task_overview,
            // Habits
            commands::habits::list_habits,
            commands::habits::create_habit,
            commands::habits::update_habit,
            commands::habits::set_habit_archived,
            commands::habits::delete_habit,
            commands::habits::complete_habit,
            commands::habits::uncomplete_habit,
            commands::habits::list_habit_completions,
            // Calendar
            commands::calendar::list_events,
            commands::calendar::upcoming_events,
            commands::calendar::create_event,
            commands::calendar::update_event,
            commands::calendar::delete_event,
            commands::calendar::month_summaries,
            commands::calendar::events_for_day,
            commands::calendar::due_event_reminders,
            commands::calendar::mark_event_notified,
            commands::calendar::calendar_overview,
            // Focus
            commands::focus::list_focus_sessions,
            commands::focus::create_focus_session,
            commands::focus::delete_focus_session,
            commands::focus::focus_stats,
            // Settings
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::select_model,
            // Local AI
            commands::ollama::ollama_status,
            commands::ollama::list_ollama_models,
            commands::ollama::suggested_model,
            commands::ollama::ask_ollama,
            commands::ollama::ask_ollama_stream,
            commands::assistant::assistant_context,
            // Desktop integration
            commands::desktop::show_main_window,
            commands::desktop::hide_main_window,
            commands::desktop::set_companion_visible,
            commands::desktop::toggle_companion,
            commands::desktop::set_companion_always_on_top,
            commands::desktop::save_companion_position,
            commands::desktop::quit_app,
            commands::desktop::send_notification,
            commands::desktop::notifications_available,
            commands::desktop::environment,
        ])
        .setup(move |app| {
            if let Err(err) = tray::build_tray(app.handle()) {
                eprintln!("wolf: tray unavailable ({err}); the app will keep running");
            }

            let handle = app.handle().clone();
            if companion_enabled {
                if let Err(err) = windows::ensure_companion(&handle) {
                    log::warn!("companion window unavailable: {err}");
                    let _ = handle.emit(COMPANION_ERROR_EVENT, err.to_string());
                }
            }
            if start_minimized {
                if let Err(err) = windows::hide_main(&handle) {
                    log::warn!("could not hide the main window: {err}");
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            let app = window.app_handle();
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == windows::MAIN_WINDOW
                    && commands::desktop::handle_close_requested(app)
                {
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("wolf: failed to start the desktop application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                let _ = windows::persist_companion_position(app);
            }
        });
}
