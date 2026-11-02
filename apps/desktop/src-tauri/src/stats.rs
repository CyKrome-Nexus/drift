//! What the tray's stats lines show: Drift's CPU and memory, and how much its webviews cache.
//!
//! Drift is more than its own process. Every webview — the app and each wallpaper window — runs
//! in helper processes, and the wallpapers are where the work happens. On Windows
//! (`msedgewebview2`) and Linux (`WebKitWebProcess`) those are our descendants. On macOS they are
//! WebKit XPC services whose parent is launchd, so they are claimed the way Activity Monitor
//! does it, by "responsible process".
//!
//! The cache is the webviews' network cache, where streamed wallpaper videos pile up. It sits
//! next to Drift's saved library and settings, so only the cache folders themselves are measured
//! and emptied, never the folder above them.

use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::{AppHandle, Manager, Runtime};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    /// Percent of one core, as Activity Monitor and Task Manager's details count it (can pass 100).
    pub cpu: f32,
    /// Resident memory, in bytes.
    pub memory: u64,
    /// Bytes in the webviews' caches.
    pub cache: u64,
}

/// CPU use is the difference between two readings, so the sampler is kept between calls; the
/// first reading after launch is 0.
#[derive(Default)]
pub struct StatsState(Mutex<Option<System>>);

pub fn usage<R: Runtime>(app: &AppHandle<R>, state: &StatsState) -> Usage {
    let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let sys = guard.get_or_insert_with(System::new);
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_cpu().with_memory());

    let me = Pid::from_u32(std::process::id());
    let ours = family(sys, me);
    let (cpu, memory) = sys
        .processes()
        .iter()
        .filter(|(pid, _)| ours.contains(pid))
        .fold((0.0, 0), |(c, m), (_, p)| (c + p.cpu_usage(), m + p.memory()));
    drop(guard);

    let cache = cache_dirs(app).iter().map(|d| size_of(d)).sum();
    Usage { cpu, memory, cache }
}

/// `me`, everything it started, and (on macOS) the WebKit services working for it.
fn family(sys: &System, me: Pid) -> HashSet<Pid> {
    let mut ours = HashSet::from([me]);
    #[cfg(target_os = "macos")]
    {
        let owner = responsible_for(me);
        for (pid, p) in sys.processes() {
            if p.name().to_string_lossy().starts_with("com.apple.WebKit") && responsible_for(*pid) == owner {
                ours.insert(*pid);
            }
        }
    }
    // Children of children: repeat until nothing new joins.
    loop {
        let before = ours.len();
        for (pid, p) in sys.processes() {
            if p.parent().is_some_and(|parent| ours.contains(&parent)) {
                ours.insert(*pid);
            }
        }
        if ours.len() == before {
            return ours;
        }
    }
}

#[cfg(target_os = "macos")]
fn responsible_for(pid: Pid) -> i32 {
    // libquarantine, re-exported by libSystem. For a bundled app this is the app itself; under
    // `tauri dev` it is the terminal that started it, which is also what our WebKit services
    // report, so comparing the two works either way.
    extern "C" {
        fn responsibility_get_pid_responsible_for_pid(pid: i32) -> i32;
    }
    unsafe { responsibility_get_pid_responsible_for_pid(pid.as_u32() as i32) }
}

/// The folders that hold only cached web content, for whichever of them exist.
pub fn cache_dirs<R: Runtime>(app: &AppHandle<R>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    // WebKit keeps its caches in ~/Library/Caches/<bundle id>/WebKit; an unbundled dev build
    // goes by its executable's name instead.
    #[cfg(target_os = "macos")]
    if let (Ok(caches), Ok(exe)) = (app.path().cache_dir(), std::env::current_exe()) {
        let bundled = exe.to_string_lossy().contains(".app/Contents/MacOS/");
        let owner = match exe.file_name() {
            Some(name) if !bundled => name.to_string_lossy().into_owned(),
            _ => app.config().identifier.clone(),
        };
        let webkit = caches.join(owner).join("WebKit");
        dirs.extend(["NetworkCache", "CacheStorage"].map(|d| webkit.join(d)));
    }

    // WebView2's user data folder is the app's local data folder; the profile caches are in it.
    #[cfg(target_os = "windows")]
    if let Ok(data) = app.path().app_local_data_dir() {
        let profile = data.join("EBWebView").join("Default");
        dirs.extend(["Cache", "Code Cache", "GPUCache"].map(|d| profile.join(d)));
    }

    // WebKitGTK shares one folder for data and cache (wry sets both to the local data folder).
    #[cfg(target_os = "linux")]
    if let Ok(data) = app.path().app_local_data_dir() {
        dirs.extend(["WebKitCache", "CacheStorage"].map(|d| data.join(d)));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    let _ = app;

    dirs.retain(|d| d.is_dir());
    dirs
}

fn size_of(path: &Path) -> u64 {
    let Ok(meta) = std::fs::symlink_metadata(path) else { return 0 };
    if !meta.is_dir() {
        return meta.len();
    }
    std::fs::read_dir(path).map(|entries| entries.flatten().map(|e| size_of(&e.path())).sum()).unwrap_or(0)
}

/// Empty the cache folders (keeping the folders). Files the webview has open are skipped — on
/// Windows they are locked — and go at the next clear. Returns the bytes freed.
pub fn clear_cache<R: Runtime>(app: &AppHandle<R>) -> u64 {
    let mut freed = 0;
    for dir in cache_dirs(app) {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            freed += remove(&entry.path());
        }
    }
    freed
}

fn remove(path: &Path) -> u64 {
    let Ok(meta) = std::fs::symlink_metadata(path) else { return 0 };
    if !meta.is_dir() {
        return if std::fs::remove_file(path).is_ok() { meta.len() } else { 0 };
    }
    let freed = std::fs::read_dir(path).map(|entries| entries.flatten().map(|e| remove(&e.path())).sum()).unwrap_or(0);
    // Fails while something in it was skipped; that is fine.
    let _ = std::fs::remove_dir(path);
    freed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clearing_empties_a_folder_but_keeps_it() {
        let root = std::env::temp_dir().join(format!("drift-cache-test-{}", std::process::id()));
        let nested = root.join("Version 17").join("Records");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(root.join("salt"), [0u8; 8]).unwrap();
        std::fs::write(nested.join("a"), [0u8; 100]).unwrap();
        assert_eq!(size_of(&root), 108);

        let freed: u64 = std::fs::read_dir(&root).unwrap().flatten().map(|e| remove(&e.path())).sum();
        assert_eq!(freed, 108);
        assert!(root.is_dir());
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 0);
        std::fs::remove_dir(&root).unwrap();
    }

    #[test]
    fn our_family_includes_children_of_children() {
        let mut sys = System::new();
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
        let me = Pid::from_u32(std::process::id());
        assert!(family(&sys, me).contains(&me));
    }
}
