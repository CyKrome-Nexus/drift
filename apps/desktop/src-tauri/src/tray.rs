//! The menu-bar / tray icon: the way back into Drift while the window is hidden behind a running
//! wallpaper, and a remote for the wallpaper itself.
//!
//! On macOS and Windows clicking the icon opens a popover (`tray.html`): a frameless, translucent
//! window anchored to the icon, with a live preview, playback controls, recents, lists and stats.
//! The page only draws; what it shows comes from the main window's store and what it asks for
//! goes back there (`src/lib/trayBridge.ts`). It hides as soon as it loses focus, like a menu.
//!
//! Linux trays report no clicks, only menus, so Linux keeps a short native menu.

use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::tray::{MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Rect, Runtime};

use crate::engine::{self, EngineState};

pub const ID: &str = "drift";
/// The popover window's label.
pub const LABEL: &str = "tray";
/// Told to the popover each time it shows or hides, so it plays its preview and polls stats only
/// while someone can see them.
const VISIBILITY_EVENT: &str = "tray-visibility";
/// Logical pixels. The height follows the page (`tray_fit`).
const WIDTH: f64 = 264.0;
const START_HEIGHT: f64 = 520.0;
/// Between the icon and the popover, and the popover and the screen edge.
const GAP: f64 = 6.0;
/// A click on the icon that lands this soon after the popover hid (it lost focus to that very
/// click) closes it rather than opening it again.
const REOPEN_GUARD: Duration = Duration::from_millis(300);

/// Where the popover hangs from: the icon, in physical pixels, and the work area of its display.
#[derive(Clone, Copy)]
struct Anchor {
    icon: (f64, f64, f64, f64),
    screen: (i32, i32, u32, u32),
    scale: f64,
}

#[derive(Default)]
pub struct TrayState {
    anchor: Mutex<Option<Anchor>>,
    hidden_at: Mutex<Option<Instant>>,
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    hide(app);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// Stop the wallpaper and quit. Off the main thread: an apply in progress may be waiting on the
/// main thread to build its window, and stopping waits for that apply.
pub fn quit<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        engine::stop(&app, &app.state::<EngineState>());
        app.exit(0);
    });
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let mut tray = TrayIconBuilder::with_id(ID).tooltip("Drift");
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    #[cfg(target_os = "linux")]
    {
        use tauri::menu::{Menu, MenuItem};
        let open = MenuItem::with_id(app, "open", "Open Drift", true, None::<&str>)?;
        let stop = MenuItem::with_id(app, "stop", "Remove wallpaper", true, None::<&str>)?;
        let quit = MenuItem::with_id(app, "quit", "Quit Drift", true, Some("CmdOrCtrl+Q"))?;
        let menu = Menu::with_items(app, &[&open, &stop, &quit])?;
        tray = tray.menu(&menu).on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "stop" => {
                let app = app.clone();
                std::thread::spawn(move || engine::stop(&app, &app.state::<EngineState>()));
            }
            "quit" => self::quit(app),
            _ => {}
        });
    }

    #[cfg(not(target_os = "linux"))]
    {
        build_popover(app)?;
        tray = tray.on_tray_icon_event(|icon, event| {
            if let TrayIconEvent::Click { rect, position, button_state: MouseButtonState::Up, .. } = event {
                toggle(icon.app_handle(), rect, position);
            }
        });
    }

    tray.build(app)?;
    Ok(())
}

/// Built hidden at launch so the first click opens it at once.
#[cfg(not(target_os = "linux"))]
fn build_popover<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    use tauri::window::{Effect, EffectState, EffectsBuilder};

    let effects = EffectsBuilder::new()
        // The menu material on macOS, acrylic on Windows; the first one the OS has wins.
        .effects([Effect::Menu, Effect::Acrylic])
        .state(EffectState::Active)
        .radius(12.0)
        .build();
    tauri::WebviewWindowBuilder::new(app, LABEL, tauri::WebviewUrl::App("tray.html".into()))
        .title("Drift")
        .inner_size(WIDTH, START_HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        // Drift is dark; the material follows the window's appearance, not the system's.
        .theme(Some(tauri::Theme::Dark))
        .effects(effects)
        .build()?;
    Ok(())
}

// Linux has no popover; its tray only shows a menu.
#[cfg_attr(target_os = "linux", allow(dead_code))]
fn toggle<R: Runtime>(app: &AppHandle<R>, icon: Rect, at: PhysicalPosition<f64>) {
    let Some(window) = app.get_webview_window(LABEL) else { return };
    let state = app.state::<TrayState>();
    if window.is_visible().unwrap_or(false) {
        hide(app);
        return;
    }
    if lock(&state.hidden_at).is_some_and(|t| t.elapsed() < REOPEN_GUARD) {
        return;
    }

    let monitor = app.monitor_from_point(at.x, at.y).ok().flatten().or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };
    let scale = monitor.scale_factor();
    let (pos, size) = (icon.position.to_physical::<f64>(scale), icon.size.to_physical::<f64>(scale));
    let area = monitor.work_area();
    let anchor = Anchor {
        icon: (pos.x, pos.y, size.width, size.height),
        screen: (area.position.x, area.position.y, area.size.width, area.size.height),
        scale,
    };
    *lock(&state.anchor) = Some(anchor);

    let height = window.inner_size().map(|s| s.height as f64 / window.scale_factor().unwrap_or(scale)).unwrap_or(START_HEIGHT);
    place(&window, anchor, height);
    let _ = window.show();
    let _ = window.set_focus();
    let _ = app.emit_to(LABEL, VISIBILITY_EVENT, true);
}

pub fn hide<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(LABEL) else { return };
    if !window.is_visible().unwrap_or(false) {
        return;
    }
    let _ = window.hide();
    *lock(&app.state::<TrayState>().hidden_at) = Some(Instant::now());
    let _ = app.emit_to(LABEL, VISIBILITY_EVENT, false);
}

/// Size the popover to `height` logical pixels and hang it from the icon: below it when the icon
/// is at the top of the screen (the macOS menu bar), above it when at the bottom (the Windows
/// taskbar). Kept inside the display.
fn place<R: Runtime>(window: &tauri::WebviewWindow<R>, anchor: Anchor, height: f64) {
    let Anchor { icon: (ix, iy, iw, ih), screen: (sx, sy, sw, sh), scale } = anchor;
    let (w, h, gap) = (WIDTH * scale, height * scale, GAP * scale);

    // macOS menus line up with the icon's left edge; Windows flyouts centre on the icon.
    let x = if cfg!(target_os = "macos") { ix } else { ix + iw / 2.0 - w / 2.0 };
    let below = iy + ih / 2.0 < sy as f64 + sh as f64 / 2.0;
    let y = if below { iy + ih + gap } else { iy - h - gap };

    let x = x.min(sx as f64 + sw as f64 - w - gap).max(sx as f64 + gap);
    let y = y.min(sy as f64 + sh as f64 - h - gap).max(sy as f64 + gap);
    let _ = window.set_size(tauri::LogicalSize::new(WIDTH, height));
    let _ = window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

/// The page measured itself: fit the window to it, keeping it hung from the icon.
#[tauri::command]
pub fn tray_fit(app: AppHandle, state: tauri::State<'_, TrayState>, height: f64) {
    let Some(window) = app.get_webview_window(LABEL) else { return };
    let height = height.clamp(120.0, 900.0);
    match *lock(&state.anchor) {
        Some(anchor) => place(&window, anchor, height),
        None => drop(window.set_size(tauri::LogicalSize::new(WIDTH, height))),
    }
}

#[tauri::command]
pub fn tray_hide(app: AppHandle) {
    hide(&app);
}

#[tauri::command]
pub fn open_main(app: AppHandle) {
    show_main(&app);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    quit(&app);
}
