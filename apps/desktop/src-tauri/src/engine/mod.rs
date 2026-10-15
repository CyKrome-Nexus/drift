//! The wallpaper engine — the part that puts a loop *behind* the desktop.
//!
//! Each wallpaper is a borderless webview (`wallpaper.html`) per display, or one spanning all
//! of them. The page plays the wallpaper's video, or paints Drift's generated art. What it
//! plays (`media`) comes from the app and passes through here untouched.
//!
//! Per OS (each in its own file, behind the same small set of functions):
//! - macOS: the window sits at `kCGDesktopWindowLevel` — above the desktop picture, below the
//!   icons — on every Space, ignoring the mouse.
//! - Windows: the window becomes a child of the `WorkerW` behind the desktop icons (spawned by
//!   sending `0x052C` to `Progman`); on Windows 11 24H2 and later, of `Progman` itself, below
//!   the icon view.
//! - Linux: X11 gets a `_NET_WM_WINDOW_TYPE_DESKTOP` window; Wayland gets a background
//!   layer-shell surface where the compositor offers layer-shell (not GNOME).
//!
//! A monitor thread ([`start_monitor`]) checks every couple of seconds for the things that
//! pause a wallpaper (battery, a fullscreen app, a busy CPU) and for displays coming and going,
//! and pushes playback state (paused, frame rate, quality) into each wallpaper page.

mod conditions;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
use linux as os;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as os;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
use windows as os;

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
mod os {
    use super::Frame;
    use tauri::{Runtime, WebviewWindow};
    pub fn support() -> Result<(), String> {
        Err(format!("The live wallpaper engine is not built for {} yet", std::env::consts::OS))
    }
    pub fn span_supported() -> bool {
        false
    }
    pub fn attach<R: Runtime>(_: &WebviewWindow<R>, _: Frame, _: Frame) -> Result<(), String> {
        support()
    }
    pub fn after_stop() {}
    pub fn set_lock_screen(_: impl FnOnce() -> Result<std::path::PathBuf, String>) -> Result<(), String> {
        Err("This system does not let apps change the lock screen".into())
    }
    pub fn on_battery() -> bool {
        false
    }
    pub fn cpu_ticks() -> Option<(u64, u64)> {
        None
    }
    pub struct FullscreenProbe;
    impl FullscreenProbe {
        pub fn new() -> Self {
            Self
        }
        pub fn covered(&mut self, _: &[super::Display]) -> Vec<String> {
            vec![]
        }
    }
}

pub use conditions::Conditions;

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Wallpaper windows are labelled with this prefix; the main window never is.
pub const LABEL_PREFIX: &str = "wallpaper-";
/// Emitted to the app whenever the running wallpaper changes, including from the tray, a
/// display being plugged in, or playback pausing.
pub const CHANGED_EVENT: &str = "wallpaper-changed";
/// How often the monitor thread looks at power, fullscreen apps, CPU and displays.
const TICK: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ApplyRequest {
    /// `<provider>:<id>`, e.g. `coverr:S1YbPl1NfI` or `drift:6`.
    pub wallpaper_id: String,
    /// What the page plays: the app's `WallpaperMedia` plus the file it picked, or null for
    /// generated art. Opaque here.
    #[serde(default)]
    pub media: serde_json::Value,
    /// "Desktop" | "Lock screen" | "Both". The app sends the lock screen separately
    /// ([`set_lock_screen`]); the engine always places the desktop layer.
    pub target: String,
    /// "Same" | "Span" | "Per display"
    pub displays: String,
    pub fps: String,
    pub muted: bool,
    /// "Per display" only: the display (an id from [`list_displays`]) that gets this wallpaper.
    /// `None` puts it on every display.
    #[serde(default)]
    pub display: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOutcome {
    /// True when a native layer is actually showing the loop.
    pub live: bool,
    pub note: Option<String>,
}

/// One display's wallpaper and when its loop started.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Assignment {
    pub display: String,
    pub wallpaper_id: String,
    /// Kept so a display that comes back gets its wallpaper again; the app does not need it.
    #[serde(skip)]
    pub media: serde_json::Value,
    pub started_at_ms: u64,
}

/// The wallpaper on the desktop right now, and when its loop started.
///
/// `started_at_ms` is the shared clock: the desktop windows and the app's preview both place
/// themselves at `(now - started_at_ms) mod loop length`, so they show the same frame. With
/// "Per display" each display has its own wallpaper and clock, in `assignments`; the top-level
/// fields describe the one applied last.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Running {
    #[serde(flatten)]
    pub request: ApplyRequest,
    /// Unix epoch milliseconds.
    pub started_at_ms: u64,
    /// What each connected display shows.
    pub assignments: Vec<Assignment>,
    /// Why playback is paused (battery, fullscreen app, CPU), or `None` while it plays.
    pub paused: Option<String>,
}

/// Playback settings the app pushes whenever they change ([`set_playback`]).
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Playback {
    /// "30" | "60" | "Unlimited"
    pub fps: String,
    /// "Low" | "Balanced" | "High"
    pub quality: String,
    pub pause_on_battery: bool,
    pub pause_fullscreen: bool,
    pub pause_high_cpu: bool,
}

impl Default for Playback {
    // Mirrors DEFAULT_DESKTOP_SETTINGS until the app sends the real ones.
    fn default() -> Self {
        Self { fps: "60".into(), quality: "High".into(), pause_on_battery: true, pause_fullscreen: true, pause_high_cpu: false }
    }
}

/// A connected display, in physical pixels in the global desktop space.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Display {
    /// Stable for as long as the display stays connected; what "Per display" assignments key on.
    pub id: String,
    pub name: String,
    pub primary: bool,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
}

impl Display {
    fn frame(&self) -> Frame {
        Frame { x: self.x, y: self.y, w: self.width, h: self.height }
    }
}

/// A rectangle in physical pixels, in the global desktop coordinate space.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Frame {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

impl Frame {
    /// The smallest frame holding all of `frames`.
    fn bounding(frames: impl IntoIterator<Item = Frame>) -> Option<Frame> {
        let mut it = frames.into_iter();
        let first = it.next()?;
        let (mut l, mut t, mut r, mut b) = (first.x, first.y, first.x + first.w as i32, first.y + first.h as i32);
        for f in it {
            l = l.min(f.x);
            t = t.min(f.y);
            r = r.max(f.x + f.w as i32);
            b = b.max(f.y + f.h as i32);
        }
        Some(Frame { x: l, y: t, w: (r - l) as u32, h: (b - t) as u32 })
    }
}

/// What the page in a wallpaper window is told about playback.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct PagePlayback {
    paused: Option<String>,
    fps: String,
    quality: String,
}

/// What a wallpaper page reads on load (as `window.__DRIFT_WALLPAPER__`).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PagePayload {
    wallpaper_id: String,
    media: serde_json::Value,
    started_at_ms: u64,
    muted: bool,
}

/// A window the engine wants on screen.
#[derive(Debug, Clone, PartialEq)]
struct Want {
    frame: Frame,
    /// The displays this window covers (one, or all of them for "Span").
    displays: Vec<String>,
    wallpaper_id: String,
    media: serde_json::Value,
    started_at_ms: u64,
}

/// A window the engine has on screen.
struct Placed {
    label: String,
    want: Want,
}

#[derive(Default)]
struct Inner {
    running: Option<Running>,
    windows: Vec<Placed>,
    /// The displays the current windows were laid out for.
    displays: Vec<Display>,
    /// Counts windows made, which keeps each one's label unique.
    generation: u64,
}

#[derive(Default)]
pub struct EngineState {
    /// Held for the whole of an apply, stop or re-layout, so two can never interleave and leave
    /// two wallpapers stacked. Never taken on the main thread: building a window from another
    /// thread waits for the main thread, so taking it there could deadlock.
    work: Mutex<Inner>,
    /// What [`current`](Self::current) returns; only ever held for a copy.
    snapshot: Mutex<Option<Running>>,
    running: AtomicBool,
    playback: Mutex<Playback>,
    conditions: Mutex<Conditions>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    // A panic elsewhere must not take the wallpaper down with it.
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl EngineState {
    pub fn current(&self) -> Option<Running> {
        lock(&self.snapshot).clone()
    }

    /// Lock-free, so the main thread can ask (the close button does).
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    fn playback(&self) -> Playback {
        lock(&self.playback).clone()
    }

    /// Publish what is running to the app; the app hears about it only when it changed.
    fn publish<R: Runtime>(&self, app: &AppHandle<R>, running: Option<Running>) {
        self.running.store(running.is_some(), Ordering::SeqCst);
        let changed = {
            let mut snap = lock(&self.snapshot);
            let changed = *snap != running;
            *snap = running.clone();
            changed
        };
        if changed {
            let _ = app.emit(CHANGED_EVENT, running);
        }
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Connected displays, main display first. Ids are the OS's monitor name, numbered when two
/// share one (two identical external screens).
pub fn list_displays<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<Display>, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let primary = app.primary_monitor().ok().flatten().map(|m| *m.position());
    let raw = monitors
        .iter()
        .map(|m| {
            let name = m.name().cloned().unwrap_or_else(|| "Display".into());
            (name, Some(*m.position()) == primary, Frame { x: m.position().x, y: m.position().y, w: m.size().width, h: m.size().height }, m.scale_factor())
        })
        .collect();
    let displays = name_displays(raw);
    if displays.is_empty() {
        return Err("No displays found".into());
    }
    Ok(displays)
}

fn name_displays(raw: Vec<(String, bool, Frame, f64)>) -> Vec<Display> {
    let mut raw = raw;
    // Main display first, then left to right, top to bottom: the order people number them in.
    raw.sort_by_key(|(_, primary, f, _)| (!primary, f.x, f.y));
    let mut out: Vec<Display> = Vec::with_capacity(raw.len());
    for (name, primary, f, scale) in raw {
        let same = out.iter().filter(|d| d.name == name).count();
        let id = if same == 0 { name.clone() } else { format!("{name} ({})", same + 1) };
        out.push(Display { id, name, primary, x: f.x, y: f.y, width: f.w, height: f.h, scale });
    }
    out
}

/// What each display shows. "Same" and "Span" put the one wallpaper on all of them; "Per
/// display" keeps the per-display choices, dropping none when a display goes away so it gets
/// its wallpaper back when it returns.
fn assignments_for(running: &Running, displays: &[Display]) -> Vec<Assignment> {
    if running.request.displays == "Per display" {
        return running.assignments.clone();
    }
    displays
        .iter()
        .map(|d| Assignment {
            display: d.id.clone(),
            wallpaper_id: running.request.wallpaper_id.clone(),
            media: running.request.media.clone(),
            started_at_ms: running.started_at_ms,
        })
        .collect()
}

/// The windows to have on screen for `running` on `displays`.
fn desired(running: &Running, displays: &[Display], span_supported: bool) -> Vec<Want> {
    if running.request.displays == "Span" && span_supported {
        let Some(frame) = Frame::bounding(displays.iter().map(Display::frame)) else { return vec![] };
        return vec![Want {
            frame,
            displays: displays.iter().map(|d| d.id.clone()).collect(),
            wallpaper_id: running.request.wallpaper_id.clone(),
            media: running.request.media.clone(),
            started_at_ms: running.started_at_ms,
        }];
    }
    displays
        .iter()
        .filter_map(|d| {
            let a = running.assignments.iter().find(|a| a.display == d.id)?;
            Some(Want {
                frame: d.frame(),
                displays: vec![d.id.clone()],
                wallpaper_id: a.wallpaper_id.clone(),
                media: a.media.clone(),
                started_at_ms: a.started_at_ms,
            })
        })
        .collect()
}

/// Why a window covering `displays` should be paused, if it should.
fn pause_reason(playback: &Playback, c: &Conditions, displays: &[String]) -> Option<String> {
    if playback.pause_on_battery && c.on_battery {
        return Some("On battery power".into());
    }
    if playback.pause_fullscreen && !displays.is_empty() && displays.iter().all(|d| c.fullscreen.contains(d)) {
        return Some("An app is fullscreen".into());
    }
    if playback.pause_high_cpu && c.cpu_busy {
        return Some("CPU above 80%".into());
    }
    None
}

/// Run `f` on the main thread and wait for its result. Never call this from the main thread.
fn on_main<R: Runtime, T: Send + 'static>(window: &WebviewWindow<R>, f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    window.run_on_main_thread(move || drop(tx.send(f()))).map_err(|e| e.to_string())?;
    rx.recv().map_err(|_| "the main thread went away".to_string())
}

fn script(payload: &PagePayload, playback: &PagePlayback) -> Result<String, String> {
    let payload = serde_json::to_string(payload).map_err(|e| e.to_string())?;
    let playback = serde_json::to_string(playback).map_err(|e| e.to_string())?;
    Ok(format!("window.__DRIFT_WALLPAPER__ = {payload}; window.__DRIFT_PLAYBACK__ = {playback};"))
}

/// Bring the windows on screen in line with `inner.running` on `displays`. Windows that already
/// show the right thing in the right place are left alone, so applying to one display, or
/// plugging in another, does not restart the loops elsewhere.
fn layout<R: Runtime>(app: &AppHandle<R>, state: &EngineState, inner: &mut Inner, displays: Vec<Display>) -> Result<(), String> {
    let Some(running) = inner.running.as_mut() else { return Ok(()) };
    running.assignments = assignments_for(running, &displays);
    let wants = desired(running, &displays, os::span_supported());
    let muted = running.request.muted;
    inner.displays = displays;

    let mut old = std::mem::take(&mut inner.windows);
    let mut create = Vec::new();
    for want in wants {
        match old.iter().position(|p| p.want == want) {
            Some(i) => inner.windows.push(old.remove(i)),
            None => create.push(want),
        }
    }
    for gone in old {
        if let Some(w) = app.get_webview_window(&gone.label) {
            let _ = w.destroy();
        }
    }

    let playback = state.playback();
    let conditions = lock(&state.conditions).clone();
    let desktop = Frame::bounding(inner.displays.iter().map(Display::frame)).unwrap_or(Frame { x: 0, y: 0, w: 0, h: 0 });
    for want in create {
        inner.generation += 1;
        let label = format!("{LABEL_PREFIX}{}", inner.generation);
        let page = PagePlayback { paused: pause_reason(&playback, &conditions, &want.displays), fps: playback.fps.clone(), quality: playback.quality.clone() };
        let payload = PagePayload { wallpaper_id: want.wallpaper_id.clone(), media: want.media.clone(), started_at_ms: want.started_at_ms, muted };
        let init = script(&payload, &page)?;
        let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("wallpaper.html".into()))
            .title("Drift wallpaper")
            .decorations(false)
            .resizable(false)
            .skip_taskbar(true)
            .focused(false)
            .shadow(false)
            .visible(false)
            .initialization_script(init)
            .build()
            .map_err(|e| e.to_string())?;
        window.set_position(PhysicalPosition::new(want.frame.x, want.frame.y)).map_err(|e| e.to_string())?;
        window.set_size(PhysicalSize::new(want.frame.w, want.frame.h)).map_err(|e| e.to_string())?;

        // Native window calls belong on the main thread; commands and the monitor run elsewhere.
        let (w, frame) = (window.clone(), want.frame);
        let attached = on_main(&window, move || os::attach(&w, frame, desktop)).and_then(|r| r);
        if let Err(e) = attached {
            let _ = window.destroy();
            return Err(e);
        }
        inner.windows.push(Placed { label, want });
    }
    Ok(())
}

fn close_all<R: Runtime>(app: &AppHandle<R>, inner: &mut Inner) {
    inner.windows.clear();
    // By prefix rather than by `inner.windows`, so a window left over from a failed apply goes too.
    for (label, window) in app.webview_windows() {
        if label.starts_with(LABEL_PREFIX) {
            let _ = window.destroy();
        }
    }
}

pub fn apply<R: Runtime>(app: &AppHandle<R>, state: &EngineState, req: ApplyRequest) -> Result<ApplyOutcome, String> {
    if let Err(note) = os::support() {
        return Ok(ApplyOutcome { live: false, note: Some(note) });
    }

    let mut inner = lock(&state.work);
    let displays = list_displays(app)?;
    let started_at_ms = now_ms();

    let mut assignments = Vec::new();
    if req.displays == "Per display" {
        if let Some(prev) = inner.running.as_ref().filter(|r| r.request.displays == "Per display") {
            assignments = prev.assignments.clone();
        }
        match &req.display {
            Some(id) => {
                if !displays.iter().any(|d| &d.id == id) {
                    return Err("That display is no longer connected".into());
                }
                assignments.retain(|a| &a.display != id);
                assignments.push(Assignment { display: id.clone(), wallpaper_id: req.wallpaper_id.clone(), media: req.media.clone(), started_at_ms });
            }
            None => {
                assignments = displays
                    .iter()
                    .map(|d| Assignment { display: d.id.clone(), wallpaper_id: req.wallpaper_id.clone(), media: req.media.clone(), started_at_ms })
                    .collect();
            }
        }
    }

    let note = (req.displays == "Span" && !os::span_supported() && displays.len() > 1)
        .then(|| "This desktop can't span one window across displays, so each display shows the whole loop".to_string());
    let paused = inner.running.as_ref().and_then(|r| r.paused.clone());
    inner.running = Some(Running { request: req, started_at_ms, assignments, paused });

    let result = layout(app, state, &mut inner, displays);
    if let Err(e) = result {
        // Don't claim a wallpaper the desktop isn't showing.
        close_all(app, &mut inner);
        inner.running = None;
        state.publish(app, None);
        return Err(e);
    }
    let running = inner.running.clone();
    drop(inner);
    state.publish(app, running);
    // Start the new windows in the right paused state straight away rather than at the next tick.
    refresh(app, state, None);
    Ok(ApplyOutcome { live: true, note })
}

pub fn stop<R: Runtime>(app: &AppHandle<R>, state: &EngineState) {
    let mut inner = lock(&state.work);
    close_all(app, &mut inner);
    inner.running = None;
    inner.displays.clear();
    drop(inner);
    os::after_stop();
    state.publish(app, None);
}

/// New playback settings from the app. Takes effect on running wallpapers immediately.
pub fn set_playback<R: Runtime>(app: &AppHandle<R>, state: &EngineState, playback: Playback) {
    *lock(&state.playback) = playback;
    refresh(app, state, None);
}

/// Re-lay the windows if the displays changed, then tell every page whether to play, at what
/// frame rate and quality. `displays` is passed by the monitor, which has just read them.
fn refresh<R: Runtime>(app: &AppHandle<R>, state: &EngineState, displays: Option<Vec<Display>>) {
    let mut inner = lock(&state.work);
    if inner.running.is_none() {
        return;
    }

    if let Some(displays) = displays.filter(|d| *d != inner.displays) {
        if let Err(e) = layout(app, state, &mut inner, displays) {
            eprintln!("[engine] could not follow the display change: {e}");
        }
    }

    let playback = state.playback();
    let conditions = lock(&state.conditions).clone();
    let mut paused_overall: Option<String> = None;
    let mut all_paused = !inner.windows.is_empty();
    for placed in &inner.windows {
        let page = PagePlayback { paused: pause_reason(&playback, &conditions, &placed.want.displays), fps: playback.fps.clone(), quality: playback.quality.clone() };
        match &page.paused {
            Some(reason) => paused_overall = paused_overall.or(Some(reason.clone())),
            None => all_paused = false,
        }
        // Sent every time rather than on change: a message that lands while the page is still
        // loading is lost, and the next tick puts it right.
        if let (Some(window), Ok(json)) = (app.get_webview_window(&placed.label), serde_json::to_string(&page)) {
            let _ = window.eval(format!("window.__DRIFT_PLAYBACK__ = {json}; window.dispatchEvent(new Event('drift-playback'));"));
        }
    }
    let paused = match paused_overall {
        Some(reason) if !all_paused => Some(format!("{reason} · some displays")),
        other => other,
    };
    if let Some(running) = inner.running.as_mut() {
        running.paused = paused;
    }
    let running = inner.running.clone();
    drop(inner);
    state.publish(app, running);
}

/// Watch power, fullscreen apps, CPU load and the display layout while a wallpaper runs.
pub fn start_monitor<R: Runtime>(app: AppHandle<R>) {
    let spawned = std::thread::Builder::new().name("drift-engine".into()).spawn(move || {
        let mut sampler = conditions::Sampler::new();
        loop {
            std::thread::sleep(TICK);
            let state = app.state::<EngineState>();
            if !state.is_running() {
                sampler.reset();
                continue;
            }
            let Ok(displays) = list_displays(&app) else { continue };
            let sampled = sampler.sample(&state.playback(), &displays);
            *lock(&state.conditions) = sampled;
            refresh(&app, &state, Some(displays));
        }
    });
    if let Err(e) = spawned {
        eprintln!("[engine] could not start the monitor: {e}");
    }
}

/// Where the lock-screen image is written. Two names, alternated: Windows caches the image by path.
fn lock_screen_path<R: Runtime>(app: &AppHandle<R>, ext: &str) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("lock-screen-{}.{ext}", if now_ms() % 2 == 0 { "a" } else { "b" })))
}

/// Set the lock screen to `png` (a still frame the app painted, for generated art). Windows
/// only; macOS and Linux say why they can't.
pub fn set_lock_screen<R: Runtime>(app: &AppHandle<R>, png: Vec<u8>) -> Result<(), String> {
    // The file is written only where the OS can use it.
    os::set_lock_screen(|| {
        let path = lock_screen_path(app, "png")?;
        std::fs::write(&path, png).map_err(|e| e.to_string())?;
        Ok(path)
    })
}

/// Set the lock screen to a provider's poster image (a JPEG), fetched natively.
pub fn set_lock_screen_url<R: Runtime>(app: &AppHandle<R>, url: &str) -> Result<(), String> {
    crate::media::allowed(url)?;
    os::set_lock_screen(|| {
        let path = lock_screen_path(app, "jpg")?;
        crate::media::fetch_to(url, &path)?;
        Ok(path)
    })
}

/// Whether this build can show a live wallpaper here at all (checked at run time on Linux).
pub fn supported() -> bool {
    os::support().is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(id: &str, displays: &str) -> ApplyRequest {
        ApplyRequest {
            wallpaper_id: id.into(),
            media: serde_json::json!({ "kind": "video", "url": format!("https://example.test/{id}.mp4") }),
            target: "Desktop".into(),
            displays: displays.into(),
            fps: "60".into(),
            muted: true,
            display: None,
        }
    }

    fn assign(display: &str, id: &str, started_at_ms: u64) -> Assignment {
        Assignment { display: display.into(), wallpaper_id: id.into(), media: serde_json::Value::Null, started_at_ms }
    }

    fn running(id: &str, displays: &str, assignments: Vec<Assignment>) -> Running {
        Running { request: req(id, displays), started_at_ms: 100, assignments, paused: None }
    }

    fn two_displays() -> Vec<Display> {
        name_displays(vec![
            ("Monitor #2".into(), false, Frame { x: 2560, y: 0, w: 1920, h: 1080 }, 1.0),
            ("Monitor #1".into(), true, Frame { x: 0, y: 0, w: 2560, h: 1600 }, 2.0),
        ])
    }

    #[test]
    fn displays_list_main_first_and_get_unique_ids() {
        let d = two_displays();
        assert_eq!(d[0].id, "Monitor #1");
        assert!(d[0].primary);
        let twins = name_displays(vec![
            ("LG".into(), true, Frame { x: 0, y: 0, w: 10, h: 10 }, 1.0),
            ("LG".into(), false, Frame { x: 10, y: 0, w: 10, h: 10 }, 1.0),
        ]);
        assert_eq!(twins.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(), ["LG", "LG (2)"]);
    }

    #[test]
    fn same_puts_one_window_on_every_display() {
        let d = two_displays();
        let mut r = running("coverr:7", "Same", vec![]);
        r.assignments = assignments_for(&r, &d);
        let w = desired(&r, &d, true);
        assert_eq!(w.len(), 2);
        assert!(w.iter().all(|w| w.wallpaper_id == "coverr:7" && w.started_at_ms == 100));
        // Each window is told what to play.
        assert!(w.iter().all(|w| w.media["url"] == "https://example.test/coverr:7.mp4"));
        assert_eq!(w[1].frame, Frame { x: 2560, y: 0, w: 1920, h: 1080 });
    }

    #[test]
    fn span_is_one_window_over_the_bounding_box() {
        let d = two_displays();
        let mut r = running("coverr:7", "Span", vec![]);
        r.assignments = assignments_for(&r, &d);
        let w = desired(&r, &d, true);
        assert_eq!(w.len(), 1);
        assert_eq!(w[0].frame, Frame { x: 0, y: 0, w: 4480, h: 1600 });
        assert_eq!(w[0].displays.len(), 2);
        // Where one window can't cover every output (Wayland), each display gets its own.
        assert_eq!(desired(&r, &d, false).len(), 2);
    }

    #[test]
    fn per_display_shows_each_displays_own_wallpaper_and_keeps_absent_ones() {
        let d = two_displays();
        let a = vec![
            assign("Monitor #1", "drift:3", 10),
            assign("Monitor #2", "nasa:9", 20),
            assign("Unplugged", "drift:5", 30),
        ];
        let r = running("nasa:9", "Per display", a.clone());
        assert_eq!(assignments_for(&r, &d), a, "an unplugged display keeps its wallpaper for when it returns");
        let w = desired(&r, &d, true);
        assert_eq!(w.iter().map(|w| (w.wallpaper_id.as_str(), w.started_at_ms)).collect::<Vec<_>>(), [("drift:3", 10), ("nasa:9", 20)]);
    }

    #[test]
    fn per_display_leaves_unassigned_displays_alone() {
        let d = two_displays();
        let r = running("nasa:9", "Per display", vec![assign("Monitor #2", "nasa:9", 1)]);
        let w = desired(&r, &d, true);
        assert_eq!(w.len(), 1);
        assert_eq!(w[0].displays, ["Monitor #2"]);
    }

    #[test]
    fn pauses_only_for_the_conditions_that_are_switched_on() {
        let on = Playback { pause_on_battery: true, pause_fullscreen: true, pause_high_cpu: true, ..Playback::default() };
        let off = Playback { pause_on_battery: false, pause_fullscreen: false, pause_high_cpu: false, ..Playback::default() };
        let main = vec!["Monitor #1".to_string()];

        let battery = Conditions { on_battery: true, ..Conditions::default() };
        assert_eq!(pause_reason(&on, &battery, &main).as_deref(), Some("On battery power"));
        assert_eq!(pause_reason(&off, &battery, &main), None);

        let cpu = Conditions { cpu_busy: true, ..Conditions::default() };
        assert_eq!(pause_reason(&on, &cpu, &main).as_deref(), Some("CPU above 80%"));
        assert_eq!(pause_reason(&off, &cpu, &main), None);

        assert_eq!(pause_reason(&on, &Conditions::default(), &main), None);
    }

    #[test]
    fn a_fullscreen_app_pauses_only_the_display_it_covers() {
        let on = Playback::default();
        let c = Conditions { fullscreen: vec!["Monitor #1".into()], ..Conditions::default() };
        assert_eq!(pause_reason(&on, &c, &["Monitor #1".into()]).as_deref(), Some("An app is fullscreen"));
        assert_eq!(pause_reason(&on, &c, &["Monitor #2".into()]), None);
        // A spanning window keeps playing while part of it is still visible.
        assert_eq!(pause_reason(&on, &c, &["Monitor #1".into(), "Monitor #2".into()]), None);
    }
}
