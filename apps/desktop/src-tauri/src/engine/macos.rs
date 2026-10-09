//! macOS: a desktop-level window per display, plus the power, CPU and fullscreen reads.

use super::conditions::{displays_covered, Rect};
use super::{Display, Frame};
use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
use std::ffi::{c_char, c_void, CStr};
use tauri::{Runtime, WebviewWindow};

type CFTypeRef = *const c_void;

#[repr(C)]
#[derive(Default)]
struct CGRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

/// `kCGDesktopWindowLevelKey` from CGWindowLevel.h.
const DESKTOP_WINDOW_LEVEL_KEY: i32 = 2;
const WINDOW_LIST_ON_SCREEN_ONLY: u32 = 1 << 0;
const WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS: u32 = 1 << 4;
const CF_NUMBER_SINT64: isize = 4;
const CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;
const HOST_CPU_LOAD_INFO: i32 = 3;
/// user, system, idle, nice
const CPU_STATE_MAX: usize = 4;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGWindowLevelForKey(key: i32) -> i32;
    fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> CFTypeRef;
    fn CGRectMakeWithDictionaryRepresentation(dict: CFTypeRef, rect: *mut CGRect) -> bool;
    static kCGWindowLayer: CFTypeRef;
    static kCGWindowBounds: CFTypeRef;
    static kCGWindowOwnerPID: CFTypeRef;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(cf: CFTypeRef);
    fn CFArrayGetCount(array: CFTypeRef) -> isize;
    fn CFArrayGetValueAtIndex(array: CFTypeRef, index: isize) -> CFTypeRef;
    fn CFDictionaryGetValue(dict: CFTypeRef, key: CFTypeRef) -> CFTypeRef;
    fn CFNumberGetValue(number: CFTypeRef, kind: isize, out: *mut c_void) -> bool;
    fn CFStringGetCString(string: CFTypeRef, buffer: *mut c_char, size: isize, encoding: u32) -> bool;
}

#[link(name = "IOKit", kind = "framework")]
extern "C" {
    fn IOPSCopyPowerSourcesInfo() -> CFTypeRef;
    fn IOPSGetProvidingPowerSourceType(snapshot: CFTypeRef) -> CFTypeRef;
}

extern "C" {
    fn mach_host_self() -> u32;
    fn host_statistics(host: u32, flavor: i32, info: *mut i32, count: *mut u32) -> i32;
}

pub fn support() -> Result<(), String> {
    Ok(())
}

pub fn span_supported() -> bool {
    true
}

/// Put the window behind the desktop icons, on every Space, out of the way of the mouse and
/// of Cmd-Tab / Mission Control, then show it. Main thread only.
pub fn attach<R: Runtime>(window: &WebviewWindow<R>, _frame: Frame, _desktop: Frame) -> Result<(), String> {
    let ptr = window.ns_window().map_err(|e| e.to_string())? as *mut NSWindow;
    // SAFETY: Tauri hands back the live NSWindow for this webview window; we are on the main
    // thread (the engine runs this through `on_main`) and only send it messages.
    let ns_window = unsafe { ptr.as_ref() }.ok_or("window has no NSWindow")?;
    unsafe {
        ns_window.setLevel(CGWindowLevelForKey(DESKTOP_WINDOW_LEVEL_KEY) as isize);
    }
    ns_window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces | NSWindowCollectionBehavior::Stationary | NSWindowCollectionBehavior::IgnoresCycle,
    );
    ns_window.setIgnoresMouseEvents(true);
    ns_window.setHasShadow(false);
    window.show().map_err(|e| e.to_string())
}

pub fn after_stop() {}

pub fn set_lock_screen(_: impl FnOnce() -> Result<std::path::PathBuf, String>) -> Result<(), String> {
    Err("macOS does not allow apps to change the lock screen".into())
}

/// Running on battery: the providing power source is "Battery Power" (not "AC Power" or
/// "UPS Power").
pub fn on_battery() -> bool {
    // SAFETY: IOKit's documented calls. The snapshot is ours to release (Copy rule); the type
    // string belongs to the snapshot (Get rule) and is read before the release.
    unsafe {
        let snapshot = IOPSCopyPowerSourcesInfo();
        if snapshot.is_null() {
            return false;
        }
        let kind = IOPSGetProvidingPowerSourceType(snapshot);
        let mut buf = [0 as c_char; 64];
        let battery = !kind.is_null()
            && CFStringGetCString(kind, buf.as_mut_ptr(), buf.len() as isize, CF_STRING_ENCODING_UTF8)
            && CStr::from_ptr(buf.as_ptr()).to_bytes() == b"Battery Power";
        CFRelease(snapshot);
        battery
    }
}

/// (idle, total) CPU ticks across all cores since boot.
pub fn cpu_ticks() -> Option<(u64, u64)> {
    let mut info = [0i32; CPU_STATE_MAX];
    let mut count = CPU_STATE_MAX as u32;
    // SAFETY: `info` is the `host_cpu_load_info` layout (four natural_t counters) and `count`
    // says so.
    let ok = unsafe { host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, info.as_mut_ptr(), &mut count) } == 0;
    if !ok {
        return None;
    }
    let ticks = info.map(|t| t as u32 as u64);
    Some((ticks[2], ticks.iter().sum()))
}

/// Finds displays covered by another app's fullscreen window.
pub struct FullscreenProbe;

impl FullscreenProbe {
    pub fn new() -> Self {
        Self
    }

    pub fn covered(&mut self, displays: &[Display]) -> Vec<String> {
        // Window bounds are in points with the origin at the main display's top-left; Tauri's
        // display positions are those points times the display's scale.
        let screens: Vec<(String, Rect)> = displays
            .iter()
            .map(|d| (d.id.clone(), Rect { x: d.x as f64 / d.scale, y: d.y as f64 / d.scale, w: d.width as f64 / d.scale, h: d.height as f64 / d.scale }))
            .collect();
        displays_covered(&other_apps_windows(), &screens)
    }
}

/// Bounds of other apps' ordinary (layer 0) windows on screen right now.
fn other_apps_windows() -> Vec<Rect> {
    let me = std::process::id() as i64;
    let mut out = Vec::new();
    // SAFETY: CoreGraphics returns a CFArray of CFDictionaries we own (Copy rule) and release at
    // the end; values read from the dictionaries are borrowed (Get rule) and copied out first.
    unsafe {
        let list = CGWindowListCopyWindowInfo(WINDOW_LIST_ON_SCREEN_ONLY | WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS, 0);
        if list.is_null() {
            return out;
        }
        for i in 0..CFArrayGetCount(list) {
            let window = CFArrayGetValueAtIndex(list, i);
            let number = |key: CFTypeRef| {
                let value = CFDictionaryGetValue(window, key);
                let mut n: i64 = 0;
                (!value.is_null() && CFNumberGetValue(value, CF_NUMBER_SINT64, &mut n as *mut i64 as *mut c_void)).then_some(n)
            };
            if number(kCGWindowLayer) != Some(0) || number(kCGWindowOwnerPID) == Some(me) {
                continue;
            }
            let bounds = CFDictionaryGetValue(window, kCGWindowBounds);
            let mut r = CGRect::default();
            if !bounds.is_null() && CGRectMakeWithDictionaryRepresentation(bounds, &mut r) {
                out.push(Rect { x: r.x, y: r.y, w: r.w, h: r.h });
            }
        }
        CFRelease(list);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_machine_without_crashing() {
        let (idle, total) = cpu_ticks().expect("host_statistics works on macOS");
        assert!(total >= idle);
        let _ = on_battery();
        let _ = other_apps_windows();
    }
}
