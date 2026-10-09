//! Windows: the window becomes a child of the desktop's `WorkerW`, behind the icons, plus the
//! power, CPU and fullscreen reads and the lock-screen image.
//!
//! Explorer's desktop is `Progman` holding `SHELLDLL_DefView` (the icons). Sending `Progman`
//! the undocumented `0x052C` makes it split off a `WorkerW` that paints the wallpaper behind
//! the icons; a child of that window shows above the wallpaper and below the icons. Before
//! Windows 11 24H2 that `WorkerW` is a top-level window after the one holding the icons; from
//! 24H2 it is a child of `Progman`, and our window goes into `Progman` just below the icons.

use super::conditions::{displays_covered, Rect};
use super::{Display, Frame};
use tauri::{Runtime, WebviewWindow};
use windows::core::{w, BOOL, HSTRING, PCWSTR};
use windows::Storage::StorageFile;
use windows::System::UserProfile::{LockScreen, UserProfilePersonalizationSettings};
use windows::Win32::Foundation::{FILETIME, HWND, LPARAM, RECT, WPARAM};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::System::Threading::GetSystemTimes;
use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowExW, FindWindowW, GetClassNameW, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId,
    SendMessageTimeoutW, SetParent, SetWindowLongPtrW, SetWindowPos, SystemParametersInfoW, GWL_STYLE, SMTO_NORMAL, SPIF_SENDCHANGE,
    SPI_GETDESKWALLPAPER, SPI_SETDESKWALLPAPER, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOZORDER, SWP_SHOWWINDOW,
    SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS, WS_CAPTION, WS_CHILD, WS_POPUP, WS_THICKFRAME,
};

/// Asks `Progman` to create the `WorkerW` behind the icons.
const SPAWN_WORKERW: u32 = 0x052C;

pub fn support() -> Result<(), String> {
    Ok(())
}

pub fn span_supported() -> bool {
    true
}

/// Where wallpaper windows go: their parent, and the sibling to sit just below (24H2+).
struct Host {
    parent: HWND,
    below: Option<HWND>,
}

fn desktop_host() -> Result<Host, String> {
    // SAFETY: plain Win32 window lookups and a message with a timeout; the out-pointer handed to
    // EnumWindows lives on this stack frame for the whole call.
    unsafe {
        let progman = FindWindowW(w!("Progman"), PCWSTR::null()).map_err(|_| "Explorer's desktop window was not found".to_string())?;
        let mut result = 0usize;
        SendMessageTimeoutW(progman, SPAWN_WORKERW, WPARAM(0xD), LPARAM(1), SMTO_NORMAL, 1000, Some(&mut result));

        // Windows 11 24H2 and later.
        if let Ok(icons) = FindWindowExW(Some(progman), None, w!("SHELLDLL_DefView"), PCWSTR::null()) {
            if FindWindowExW(Some(progman), None, w!("WorkerW"), PCWSTR::null()).is_ok() {
                return Ok(Host { parent: progman, below: Some(icons) });
            }
        }

        let mut worker = HWND::default();
        let _ = EnumWindows(Some(find_worker), LPARAM(&mut worker as *mut HWND as isize));
        if worker.is_invalid() {
            return Err("Windows did not create the layer behind the desktop icons".into());
        }
        Ok(Host { parent: worker, below: None })
    }
}

/// The top-level window holding the icons is followed by the `WorkerW` we want.
unsafe extern "system" fn find_worker(top: HWND, out: LPARAM) -> BOOL {
    if FindWindowExW(Some(top), None, w!("SHELLDLL_DefView"), PCWSTR::null()).is_ok() {
        if let Ok(worker) = FindWindowExW(None, Some(top), w!("WorkerW"), PCWSTR::null()) {
            *(out.0 as *mut HWND) = worker;
            return false.into();
        }
    }
    true.into()
}

/// Reparent the window behind the icons and place it over `frame`. Main thread only.
pub fn attach<R: Runtime>(window: &WebviewWindow<R>, frame: Frame, _desktop: Frame) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    let host = desktop_host()?;
    // SAFETY: `hwnd` is this webview's live top-level window and `host.parent` a live Explorer
    // window; these are the documented calls for turning a popup into a child and placing it.
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
        let style = (style & !(WS_POPUP.0 | WS_CAPTION.0 | WS_THICKFRAME.0)) | WS_CHILD.0;
        SetWindowLongPtrW(hwnd, GWL_STYLE, style as isize);
        SetParent(hwnd, Some(host.parent)).map_err(|e| e.message())?;

        // A child is placed in its parent's client space, which starts at the parent's corner
        // (the top-left of the whole virtual desktop).
        let mut origin = RECT::default();
        GetWindowRect(host.parent, &mut origin).map_err(|e| e.message())?;
        let mut flags = SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED;
        if host.below.is_none() {
            flags |= SWP_NOZORDER;
        }
        SetWindowPos(hwnd, host.below, frame.x - origin.left, frame.y - origin.top, frame.w as i32, frame.h as i32, flags).map_err(|e| e.message())?;
    }
    Ok(())
}

/// The `WorkerW` keeps the last frame painted until something repaints it: setting the current
/// wallpaper again does.
pub fn after_stop() {
    let mut path = [0u16; 1024];
    // SAFETY: the buffer outlives both calls and its length is passed with it.
    unsafe {
        if SystemParametersInfoW(SPI_GETDESKWALLPAPER, path.len() as u32, Some(path.as_mut_ptr().cast()), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0)).is_ok() {
            let _ = SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, Some(path.as_mut_ptr().cast()), SPIF_SENDCHANGE);
        }
    }
}

/// Windows has no live lock screen; this sets a still image, written by `write`.
pub fn set_lock_screen(write: impl FnOnce() -> Result<std::path::PathBuf, String>) -> Result<(), String> {
    let path = write()?;
    let err = |e: windows::core::Error| e.message();
    let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(path.as_path())).map_err(err)?.join().map_err(err)?;
    if UserProfilePersonalizationSettings::IsSupported().unwrap_or(false) {
        let set = UserProfilePersonalizationSettings::Current().map_err(err)?.TrySetLockScreenImageAsync(&file).map_err(err)?.join().map_err(err)?;
        if set {
            return Ok(());
        }
    }
    LockScreen::SetImageFileAsync(&file)
        .and_then(|op| op.join())
        .map_err(|e| format!("Windows would not set the lock screen ({})", e.message()))
}

pub fn on_battery() -> bool {
    let mut status = SYSTEM_POWER_STATUS::default();
    // SAFETY: `status` is a valid out-pointer for the call.
    unsafe { GetSystemPowerStatus(&mut status) }.is_ok() && status.ACLineStatus == 0
}

/// (idle, total) CPU time across all cores. Kernel time already includes idle time.
pub fn cpu_ticks() -> Option<(u64, u64)> {
    let (mut idle, mut kernel, mut user) = (FILETIME::default(), FILETIME::default(), FILETIME::default());
    // SAFETY: three valid out-pointers.
    unsafe { GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user)) }.ok()?;
    let t = |f: FILETIME| ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64;
    Some((t(idle), t(kernel) + t(user)))
}

/// Finds displays covered by the foreground app's window.
pub struct FullscreenProbe;

impl FullscreenProbe {
    pub fn new() -> Self {
        Self
    }

    pub fn covered(&mut self, displays: &[Display]) -> Vec<String> {
        let screens: Vec<(String, Rect)> =
            displays.iter().map(|d| (d.id.clone(), Rect { x: d.x as f64, y: d.y as f64, w: d.width as f64, h: d.height as f64 })).collect();
        let mut covered = foreground_rect().map(|r| displays_covered(&[r], &screens)).unwrap_or_default();
        // An exclusive-mode game may not report a window rect worth trusting; it runs on the
        // main display.
        if covered.is_empty() {
            // SAFETY: no arguments; returns a state value.
            let state = unsafe { SHQueryUserNotificationState() };
            if matches!(state, Ok(s) if s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE) {
                covered.extend(displays.iter().filter(|d| d.primary).map(|d| d.id.clone()));
            }
        }
        covered
    }
}

/// The foreground window's rect, unless it is the desktop, the taskbar, or Drift itself.
fn foreground_rect() -> Option<Rect> {
    // SAFETY: read-only queries about the foreground window, with valid out-pointers.
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == std::process::id() {
            return None;
        }
        let mut class = [0u16; 64];
        let len = GetClassNameW(hwnd, &mut class) as usize;
        let class = String::from_utf16_lossy(&class[..len]);
        if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
            return None;
        }
        let mut r = RECT::default();
        GetWindowRect(hwnd, &mut r).ok()?;
        Some(Rect { x: r.left as f64, y: r.top as f64, w: (r.right - r.left) as f64, h: (r.bottom - r.top) as f64 })
    }
}
