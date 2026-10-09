//! Linux: a desktop-type window on X11, a background layer-shell surface on Wayland, plus the
//! power, CPU and fullscreen reads.
//!
//! - X11: `_NET_WM_WINDOW_TYPE_DESKTOP`, kept below, on every workspace, with an empty input
//!   shape so clicks reach the desktop.
//! - Wayland: only compositors with the layer-shell protocol (KDE, Sway, Hyprland, …) let an
//!   app draw behind the desktop. `libgtk-layer-shell.so.0` is loaded at run time, so it is not
//!   a build dependency and its absence is a message, not a crash. GNOME has no layer-shell.

use super::conditions::{displays_covered, Rect};
use super::{Display, Frame};
use gtk::glib::translate::ToGlibPtr;
use gtk::prelude::*;
use std::ffi::{c_int, c_uchar, c_ulong, c_void, CString};
use std::sync::OnceLock;
use tauri::{Runtime, WebviewWindow};
use x11_dl::xlib;

fn is_wayland() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some_and(|v| !v.is_empty()) && std::env::var("GDK_BACKEND").map_or(true, |b| !b.starts_with("x11"))
}

fn is_gnome() -> bool {
    std::env::var("XDG_CURRENT_DESKTOP").is_ok_and(|d| d.to_ascii_uppercase().contains("GNOME"))
}

pub fn support() -> Result<(), String> {
    if !is_wayland() {
        return Ok(());
    }
    if is_gnome() {
        return Err("GNOME on Wayland doesn't let apps draw behind the desktop. Log in with “GNOME on Xorg” to use live wallpapers".into());
    }
    if layer_shell().is_none() {
        return Err("Live wallpapers on Wayland need gtk-layer-shell (install the gtk-layer-shell package)".into());
    }
    Ok(())
}

/// A layer surface belongs to one output, so on Wayland each display gets its own window.
pub fn span_supported() -> bool {
    !is_wayland()
}

/// The few gtk-layer-shell calls the engine needs, looked up at run time.
struct LayerShell {
    _lib: libloading::Library,
    is_supported: Option<unsafe extern "C" fn() -> c_int>,
    init_for_window: unsafe extern "C" fn(*mut c_void),
    set_layer: unsafe extern "C" fn(*mut c_void, c_int),
    set_anchor: unsafe extern "C" fn(*mut c_void, c_int, c_int),
    set_exclusive_zone: unsafe extern "C" fn(*mut c_void, c_int),
    set_monitor: unsafe extern "C" fn(*mut c_void, *mut c_void),
    set_namespace: unsafe extern "C" fn(*mut c_void, *const std::ffi::c_char),
    set_keyboard_mode: Option<unsafe extern "C" fn(*mut c_void, c_int)>,
}

const LAYER_BACKGROUND: c_int = 0;
const KEYBOARD_MODE_NONE: c_int = 0;
/// GTK_LAYER_SHELL_EDGE_LEFT, RIGHT, TOP, BOTTOM.
const EDGES: [c_int; 4] = [0, 1, 2, 3];

fn layer_shell() -> Option<&'static LayerShell> {
    static SHELL: OnceLock<Option<LayerShell>> = OnceLock::new();
    SHELL
        .get_or_init(|| {
            // SAFETY: loading a well-known system library and looking up symbols with the
            // signatures from gtk-layer-shell.h. The library is kept alive with the pointers.
            unsafe {
                let lib = libloading::Library::new("libgtk-layer-shell.so.0").ok()?;
                macro_rules! sym {
                    ($name:literal) => {
                        *lib.get($name).ok()?
                    };
                }
                macro_rules! opt {
                    ($name:literal) => {
                        lib.get($name).ok().map(|s| *s)
                    };
                }
                Some(LayerShell {
                    is_supported: opt!(b"gtk_layer_is_supported\0"),
                    init_for_window: sym!(b"gtk_layer_init_for_window\0"),
                    set_layer: sym!(b"gtk_layer_set_layer\0"),
                    set_anchor: sym!(b"gtk_layer_set_anchor\0"),
                    set_exclusive_zone: sym!(b"gtk_layer_set_exclusive_zone\0"),
                    set_monitor: sym!(b"gtk_layer_set_monitor\0"),
                    set_namespace: sym!(b"gtk_layer_set_namespace\0"),
                    set_keyboard_mode: opt!(b"gtk_layer_set_keyboard_mode\0"),
                    _lib: lib,
                })
            }
        })
        .as_ref()
}

/// The GDK monitor showing `frame` (physical pixels; GDK works in scaled ones).
fn monitor_for(window: &gtk::ApplicationWindow, frame: Frame) -> Option<gtk::gdk::Monitor> {
    let display = WidgetExt::display(window);
    (0..display.n_monitors()).filter_map(|i| display.monitor(i)).find(|m| {
        let g = m.geometry();
        let s = m.scale_factor();
        g.x() * s == frame.x && g.y() * s == frame.y
    })
}

/// Make the window a wallpaper over `frame` and show it. Main thread only.
pub fn attach<R: Runtime>(window: &WebviewWindow<R>, frame: Frame, _desktop: Frame) -> Result<(), String> {
    let gtk_window = window.gtk_window().map_err(|e| e.to_string())?;
    let raw: *mut gtk::ffi::GtkWindow = gtk_window.upcast_ref::<gtk::Window>().to_glib_none().0;
    let raw = raw as *mut c_void;

    if is_wayland() {
        let shell = layer_shell().ok_or("gtk-layer-shell is not installed")?;
        // SAFETY: gtk-layer-shell calls on a live GtkWindow, on the main thread. A layer surface
        // must be set up before the window is realized, so a realized one is unrealized first.
        unsafe {
            if shell.is_supported.is_some_and(|f| f() == 0) {
                return Err("This Wayland desktop doesn't offer layer-shell, so apps can't draw behind it".into());
            }
            if gtk_window.is_realized() {
                gtk_window.unrealize();
            }
            (shell.init_for_window)(raw);
            (shell.set_layer)(raw, LAYER_BACKGROUND);
            for edge in EDGES {
                (shell.set_anchor)(raw, edge, 1);
            }
            // -1: don't move other surfaces out of the way, and ignore theirs (panels).
            (shell.set_exclusive_zone)(raw, -1);
            if let Some(set_mode) = shell.set_keyboard_mode {
                set_mode(raw, KEYBOARD_MODE_NONE);
            }
            let namespace = CString::new("drift-wallpaper").expect("no NUL");
            (shell.set_namespace)(raw, namespace.as_ptr());
            if let Some(monitor) = monitor_for(&gtk_window, frame) {
                let m: *mut gtk::gdk::ffi::GdkMonitor = monitor.to_glib_none().0;
                (shell.set_monitor)(raw, m as *mut c_void);
            }
        }
    } else {
        // Read by the window manager when the window maps, which hasn't happened yet.
        gtk_window.set_type_hint(gtk::gdk::WindowTypeHint::Desktop);
        gtk_window.set_keep_below(true);
        gtk_window.stick();
        gtk_window.set_skip_taskbar_hint(true);
        gtk_window.set_skip_pager_hint(true);
        gtk_window.set_accept_focus(false);
        gtk_window.set_focus_on_map(false);
    }

    gtk_window.show_all();
    // Clicks go through to whatever is under the wallpaper (the desktop and its icons).
    if let Some(gdk_window) = gtk_window.window() {
        gdk_window.input_shape_combine_region(&gtk::cairo::Region::create(), 0, 0);
    }
    Ok(())
}

pub fn after_stop() {}

pub fn set_lock_screen(_: impl FnOnce() -> Result<std::path::PathBuf, String>) -> Result<(), String> {
    Err("Linux desktops don't let apps change the lock screen".into())
}

/// On battery when there is a battery and no mains supply online (or, with no mains entry at
/// all, when the battery says it is discharging). Desktops without a battery never are.
pub fn on_battery() -> bool {
    let Ok(entries) = std::fs::read_dir("/sys/class/power_supply") else { return false };
    let read = |p: std::path::PathBuf| std::fs::read_to_string(p).map(|s| s.trim().to_string()).unwrap_or_default();
    let (mut mains, mut mains_online, mut battery, mut discharging) = (false, false, false, false);
    for entry in entries.flatten() {
        let dir = entry.path();
        match read(dir.join("type")).as_str() {
            "Mains" => {
                mains = true;
                mains_online |= read(dir.join("online")) == "1";
            }
            "Battery" => {
                battery = true;
                discharging |= read(dir.join("status")) == "Discharging";
            }
            _ => {}
        }
    }
    battery && if mains { !mains_online } else { discharging }
}

/// (idle, total) jiffies from the first line of /proc/stat. Idle counts I/O wait.
pub fn cpu_ticks() -> Option<(u64, u64)> {
    let stat = std::fs::read_to_string("/proc/stat").ok()?;
    parse_proc_stat(&stat)
}

fn parse_proc_stat(stat: &str) -> Option<(u64, u64)> {
    let line = stat.lines().next()?.strip_prefix("cpu ")?;
    let n: Vec<u64> = line.split_whitespace().take(8).filter_map(|v| v.parse().ok()).collect();
    if n.len() < 5 {
        return None;
    }
    Some((n[3] + n[4], n.iter().sum()))
}

/// Finds displays covered by the active window when it is fullscreen. X11 only: Wayland
/// doesn't tell apps about other apps' windows.
pub struct FullscreenProbe {
    x: Option<X>,
}

struct X {
    xlib: xlib::Xlib,
    display: *mut xlib::Display,
    active: xlib::Atom,
    state: xlib::Atom,
    fullscreen: xlib::Atom,
}

impl Drop for X {
    fn drop(&mut self) {
        // SAFETY: the display was opened by `FullscreenProbe::new` and is closed once.
        unsafe { (self.xlib.XCloseDisplay)(self.display) };
    }
}

impl FullscreenProbe {
    pub fn new() -> Self {
        Self { x: if is_wayland() { None } else { Self::connect() } }
    }

    fn connect() -> Option<X> {
        let xlib = xlib::Xlib::open().ok()?;
        // SAFETY: Xlib calls on a connection this probe owns; atom names are NUL-terminated.
        unsafe {
            let display = (xlib.XOpenDisplay)(std::ptr::null());
            if display.is_null() {
                return None;
            }
            let atom = |name: &[u8]| (xlib.XInternAtom)(display, name.as_ptr().cast(), xlib::False);
            let (active, state, fullscreen) = (atom(b"_NET_ACTIVE_WINDOW\0"), atom(b"_NET_WM_STATE\0"), atom(b"_NET_WM_STATE_FULLSCREEN\0"));
            Some(X { xlib, display, active, state, fullscreen })
        }
    }

    pub fn covered(&mut self, displays: &[Display]) -> Vec<String> {
        let Some(x) = &self.x else { return vec![] };
        let Some(rect) = x.fullscreen_active_window() else { return vec![] };
        let screens: Vec<(String, Rect)> =
            displays.iter().map(|d| (d.id.clone(), Rect { x: d.x as f64, y: d.y as f64, w: d.width as f64, h: d.height as f64 })).collect();
        displays_covered(&[rect], &screens)
    }
}

impl X {
    /// A window property as a list of 32-bit items (which Xlib hands back as `c_ulong`s).
    unsafe fn property(&self, window: xlib::Window, property: xlib::Atom, kind: xlib::Atom) -> Vec<c_ulong> {
        let (mut actual_type, mut format, mut count, mut after) = (0, 0, 0, 0);
        let mut data: *mut c_uchar = std::ptr::null_mut();
        let status = (self.xlib.XGetWindowProperty)(
            self.display, window, property, 0, 64, xlib::False, kind, &mut actual_type, &mut format, &mut count, &mut after, &mut data,
        );
        let mut out = Vec::new();
        if status == xlib::Success as c_int && !data.is_null() && format == 32 {
            out.extend_from_slice(std::slice::from_raw_parts(data as *const c_ulong, count as usize));
        }
        if !data.is_null() {
            (self.xlib.XFree)(data.cast());
        }
        out
    }

    fn fullscreen_active_window(&self) -> Option<Rect> {
        // SAFETY: read-only Xlib queries on our own connection, with valid out-pointers.
        unsafe {
            let root = (self.xlib.XDefaultRootWindow)(self.display);
            let window = *self.property(root, self.active, xlib::XA_WINDOW).first()?;
            if window == 0 || !self.property(window, self.state, xlib::XA_ATOM).contains(&self.fullscreen) {
                return None;
            }
            let mut attrs: xlib::XWindowAttributes = std::mem::zeroed();
            if (self.xlib.XGetWindowAttributes)(self.display, window, &mut attrs) == 0 {
                return None;
            }
            let (mut x, mut y, mut child) = (0, 0, 0);
            (self.xlib.XTranslateCoordinates)(self.display, window, root, 0, 0, &mut x, &mut y, &mut child);
            Some(Rect { x: x as f64, y: y as f64, w: attrs.width as f64, h: attrs.height as f64 })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_proc_stat() {
        let stat = "cpu  100 5 50 800 20 3 2 0 0 0\ncpu0 1 2 3 4 5 6 7 8\n";
        assert_eq!(parse_proc_stat(stat), Some((820, 980)));
        assert_eq!(parse_proc_stat("intr 1 2 3"), None);
    }
}
