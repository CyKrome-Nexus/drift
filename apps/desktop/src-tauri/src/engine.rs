//! The wallpaper engine — the part that puts a loop *behind* the desktop.
//!
//! Each wallpaper is a borderless webview (`wallpaper.html`) per display, or one spanning all
//! of them. The page renders the same art the app shows; when the catalog ships real loops it
//! plays a `<video>` there instead, and nothing here changes.
//!
//! - macOS: done. The window sits at `kCGDesktopWindowLevel` — above the desktop picture, below
//!   the icons — on every Space, ignoring the mouse.
//! - Windows: NOT IMPLEMENTED. Needs the window reparented into the `WorkerW` behind the icons
//!   (spawned by sending `0x052C` to `Progman`). A plain bottom-most window would cover the
//!   icons, so nothing is created and the UI is told `live: false`.
//! - Linux: NOT IMPLEMENTED. Per desktop: `_NET_WM_WINDOW_TYPE_DESKTOP` on X11; on Wayland
//!   only compositors with layer-shell allow it.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindowBuilder};

/// Wallpaper windows are labelled with this prefix; the main window never is.
pub const LABEL_PREFIX: &str = "wallpaper-";
/// Emitted to the app whenever the running wallpaper changes, including from the tray.
pub const CHANGED_EVENT: &str = "wallpaper-changed";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyRequest {
    pub wallpaper_id: u32,
    /// "Desktop" | "Lock screen" | "Both". Only the desktop is reachable on macOS.
    pub target: String,
    /// "Same" | "Span" | "Per display"
    pub displays: String,
    pub fps: String,
    pub muted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOutcome {
    /// True when a native layer is actually showing the loop.
    pub live: bool,
    pub note: Option<String>,
}

/// The wallpaper on the desktop right now, and when its loop started.
///
/// `started_at_ms` is the shared clock: the desktop windows and the app's preview both place
/// themselves at `(now - started_at_ms) mod loop length`, so they show the same frame.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Running {
    #[serde(flatten)]
    pub request: ApplyRequest,
    /// Unix epoch milliseconds.
    pub started_at_ms: u64,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(Default)]
pub struct EngineState {
    current: Mutex<Option<Running>>,
    /// Held for the whole of an apply or stop, so two can never interleave and leave two
    /// wallpapers stacked. Counts applies, which keeps each one's window labels unique.
    generation: Mutex<u64>,
}

impl EngineState {
    pub fn current(&self) -> Option<Running> {
        self.current.lock().expect("engine state poisoned").clone()
    }

    pub fn is_running(&self) -> bool {
        self.current().is_some()
    }

    fn set(&self, running: Option<Running>) {
        *self.current.lock().expect("engine state poisoned") = running;
    }
}

/// What a wallpaper page reads on load (as `window.__DRIFT_WALLPAPER__`).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PagePayload<'a> {
    wallpaper_id: u32,
    started_at_ms: u64,
    fps: &'a str,
    muted: bool,
}

/// A rectangle in physical pixels, in the global desktop coordinate space.
#[derive(Clone, Copy)]
struct Frame {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
}

fn frames<R: Runtime>(app: &AppHandle<R>, displays: &str) -> Result<Vec<Frame>, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let mut out: Vec<Frame> = monitors
        .iter()
        .map(|m| Frame { x: m.position().x, y: m.position().y, w: m.size().width, h: m.size().height })
        .collect();
    if out.is_empty() {
        return Err("No displays found".into());
    }
    if displays == "Span" {
        // One window across the bounding box of every display.
        let left = out.iter().map(|f| f.x).min().unwrap_or(0);
        let top = out.iter().map(|f| f.y).min().unwrap_or(0);
        let right = out.iter().map(|f| f.x + f.w as i32).max().unwrap_or(0);
        let bottom = out.iter().map(|f| f.y + f.h as i32).max().unwrap_or(0);
        out = vec![Frame { x: left, y: top, w: (right - left) as u32, h: (bottom - top) as u32 }];
    }
    // "Per display" (a different wallpaper on each screen) needs a per-display choice in the UI;
    // until that exists it behaves like "Same".
    Ok(out)
}

/// Close every wallpaper window. Safe to call when none are open.
fn close_windows<R: Runtime>(app: &AppHandle<R>) {
    for (label, window) in app.webview_windows() {
        if label.starts_with(LABEL_PREFIX) {
            let _ = window.destroy();
        }
    }
}

pub fn apply<R: Runtime>(app: &AppHandle<R>, state: &EngineState, req: ApplyRequest) -> Result<ApplyOutcome, String> {
    if !cfg!(target_os = "macos") {
        return Ok(ApplyOutcome {
            live: false,
            note: Some(format!("The live wallpaper engine is not built for {} yet", std::env::consts::OS)),
        });
    }

    let mut generation = state.generation.lock().expect("engine state poisoned");
    *generation += 1;
    close_windows(app);
    let started_at_ms = now_ms();
    let payload = serde_json::to_string(&PagePayload { wallpaper_id: req.wallpaper_id, started_at_ms, fps: &req.fps, muted: req.muted })
        .map_err(|e| e.to_string())?;

    for (i, frame) in frames(app, &req.displays)?.into_iter().enumerate() {
        let label = format!("{LABEL_PREFIX}{}-{i}", *generation);
        let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App("wallpaper.html".into()))
            .title("Drift wallpaper")
            .decorations(false)
            .resizable(false)
            .skip_taskbar(true)
            .focused(false)
            .shadow(false)
            .visible(false)
            .initialization_script(format!("window.__DRIFT_WALLPAPER__ = {payload};"))
            .build()
            .map_err(|e| e.to_string())?;
        window.set_position(PhysicalPosition::new(frame.x, frame.y)).map_err(|e| e.to_string())?;
        window.set_size(PhysicalSize::new(frame.w, frame.h)).map_err(|e| e.to_string())?;

        // AppKit must be touched on the main thread; commands run elsewhere.
        let w = window.clone();
        window
            .run_on_main_thread(move || {
                #[cfg(target_os = "macos")]
                if let Err(e) = macos::pin_to_desktop(&w) {
                    eprintln!("[engine] could not pin wallpaper window: {e}");
                }
                let _ = w.show();
            })
            .map_err(|e| e.to_string())?;
    }

    let target_note = (req.target != "Desktop").then(|| "macOS does not allow apps to change the lock screen".to_string());
    let running = Running { request: req, started_at_ms };
    state.set(Some(running.clone()));
    let _ = app.emit(CHANGED_EVENT, Some(&running));
    Ok(ApplyOutcome { live: true, note: target_note })
}

pub fn stop<R: Runtime>(app: &AppHandle<R>, state: &EngineState) {
    let _guard = state.generation.lock().expect("engine state poisoned");
    close_windows(app);
    state.set(None);
    let _ = app.emit(CHANGED_EVENT, None::<Running>);
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
    use tauri::{Runtime, WebviewWindow};

    /// `kCGDesktopWindowLevelKey` from CGWindowLevel.h.
    const DESKTOP_WINDOW_LEVEL_KEY: i32 = 2;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWindowLevelForKey(key: i32) -> i32;
    }

    /// Put the window behind the desktop icons, on every Space, out of the way of the mouse and
    /// of Cmd-Tab / Mission Control.
    pub fn pin_to_desktop<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
        let ptr = window.ns_window().map_err(|e| e.to_string())? as *mut NSWindow;
        // SAFETY: Tauri hands back the live NSWindow for this webview window; we are on the main
        // thread (see `run_on_main_thread` in `apply`) and only send it messages.
        let ns_window = unsafe { ptr.as_ref() }.ok_or("window has no NSWindow")?;
        unsafe {
            ns_window.setLevel(CGWindowLevelForKey(DESKTOP_WINDOW_LEVEL_KEY) as isize);
        }
        ns_window.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::IgnoresCycle,
        );
        ns_window.setIgnoresMouseEvents(true);
        ns_window.setHasShadow(false);
        Ok(())
    }
}
