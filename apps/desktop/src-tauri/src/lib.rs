mod engine;
mod media;
mod secrets;

use engine::{ApplyOutcome, ApplyRequest, Display, EngineState, Playback, Running};
use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};

// Async so window creation happens off the main thread; creating windows from a sync command
// deadlocks on Windows.
#[tauri::command]
async fn apply_wallpaper(app: AppHandle, request: ApplyRequest) -> Result<ApplyOutcome, String> {
    engine::apply(&app, &app.state::<EngineState>(), request)
}

#[tauri::command]
async fn stop_wallpaper(app: AppHandle) {
    engine::stop(&app, &app.state::<EngineState>());
}

#[tauri::command]
async fn list_displays(app: AppHandle) -> Result<Vec<Display>, String> {
    engine::list_displays(&app)
}

/// Frame rate, quality and the pause rules. Sent at startup and on every change.
#[tauri::command]
async fn set_playback(app: AppHandle, playback: Playback) {
    engine::set_playback(&app, &app.state::<EngineState>(), playback);
}

/// The body is the PNG itself (raw bytes, not JSON).
#[tauri::command]
async fn set_lock_screen(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    match request.body() {
        tauri::ipc::InvokeBody::Raw(png) => engine::set_lock_screen(&app, png.clone()),
        _ => Err("expected the image as raw bytes".into()),
    }
}

/// The lock screen from a provider's poster (real wallpapers); `set_lock_screen` paints generated art.
#[tauri::command]
async fn set_lock_screen_url(app: AppHandle, url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || engine::set_lock_screen_url(&app, &url)).await.map_err(|e| e.to_string())?
}

/// Save a wallpaper's file into the download folder; returns the path it was saved to.
#[tauri::command]
async fn download_wallpaper(url: String, dir: String, name: String, ext: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || media::download(&url, &dir, &name, &ext).map(|p| p.display().to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Settings › General › "Show in system tray".
#[tauri::command]
fn set_tray_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    match app.tray_by_id("drift") {
        Some(tray) => tray.set_visible(visible).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[tauri::command]
fn current_wallpaper(state: tauri::State<'_, EngineState>) -> Option<Running> {
    state.current()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemInfo {
    os: &'static str,
    arch: &'static str,
    family: &'static str,
    tauri: &'static str,
    /// Whether this system has a working wallpaper engine.
    engine: bool,
}

/// What Settings › About and "Copy diagnostics" show.
#[tauri::command]
fn system_info() -> SystemInfo {
    SystemInfo {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        family: std::env::consts::FAMILY,
        tauri: tauri::VERSION,
        // Checked at run time: on Linux it depends on X11 vs Wayland and the compositor.
        engine: engine::supported(),
    }
}

/// Passed by the login item, so a login launch can start hidden.
const AUTOSTART_ARG: &str = "--autostart";

/// The window covers this share of the display's width and height, and is not resizable.
const WINDOW_SCALE: f64 = 0.75;

/// Size the main window to 75% of the display it opens on, centred. The window starts hidden
/// (see tauri.conf.json) so it is never seen at its placeholder size.
fn fit_to_display(window: &tauri::WebviewWindow) {
    let monitor = window.current_monitor().ok().flatten().or_else(|| window.primary_monitor().ok().flatten());
    let Some(m) = monitor else {
        let _ = window.center();
        return;
    };
    let (screen, origin) = (m.size(), m.position());
    let w = (screen.width as f64 * WINDOW_SCALE).round() as u32;
    let h = (screen.height as f64 * WINDOW_SCALE).round() as u32;
    let _ = window.set_size(tauri::PhysicalSize::new(w, h));
    // Positioned explicitly: on macOS the resize lands asynchronously, so `center()` straight
    // after it would centre the old size.
    let _ = window.set_position(tauri::PhysicalPosition::new(
        origin.x + ((screen.width - w) / 2) as i32,
        origin.y + ((screen.height - h) / 2) as i32,
    ));
}

fn show_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// Menu-bar / tray icon: the way back into Drift while the window is hidden behind a running
/// wallpaper.
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Drift", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "Remove wallpaper", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Drift", true, Some("CmdOrCtrl+Q"))?;
    let menu = Menu::with_items(app, &[&open, &stop, &quit])?;

    let mut tray = TrayIconBuilder::with_id("drift").tooltip("Drift").menu(&menu).on_menu_event(|app, event| match event.id().as_ref() {
        "open" => show_main(app),
        // Off the main thread: an apply in progress may be waiting on the main thread to build
        // its window, and stopping waits for that apply.
        "stop" => {
            let app = app.clone();
            std::thread::spawn(move || engine::stop(&app, &app.state::<EngineState>()));
        }
        "quit" => {
            let app = app.clone();
            std::thread::spawn(move || {
                engine::stop(&app, &app.state::<EngineState>());
                app.exit(0);
            });
        }
        _ => {}
    });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(EngineState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        // "Launch Drift at login". A LaunchAgent on macOS, the Run key on Windows, XDG autostart on Linux.
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![AUTOSTART_ARG])));

    let app = builder
        .setup(|app| {
            build_tray(app.handle())?;
            engine::start_monitor(app.handle().clone());
            if let Some(main) = app.get_webview_window("main") {
                fit_to_display(&main);
                // Launched at login: stay out of the way. The webview still loads and resumes the
                // last wallpaper; the tray or Dock brings the window back.
                if !std::env::args().any(|a| a == AUTOSTART_ARG) {
                    let _ = main.show();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window must not take the wallpaper with it: while one is running, the
            // close button hides Drift to the tray instead of quitting.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && window.app_handle().state::<EngineState>().is_running() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            apply_wallpaper,
            stop_wallpaper,
            current_wallpaper,
            list_displays,
            set_playback,
            set_lock_screen,
            set_lock_screen_url,
            download_wallpaper,
            set_tray_visible,
            system_info,
            secrets::session_token_get,
            secrets::session_token_set,
            secrets::session_token_clear
        ])
        .build(tauri::generate_context!())
        .expect("error while building Drift");

    // Wallpaper windows stay open while the main window is hidden, so Drift keeps running on its
    // own; an explicit Quit (menu, ⌘Q or tray) still exits and takes the wallpaper with it.
    app.run(|_app, _event| {
        // Clicking the Dock icon brings a hidden window back.
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = _event {
            show_main(_app);
        }
    });
}
