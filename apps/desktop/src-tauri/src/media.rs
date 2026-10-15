//! Wallpaper files from providers, fetched natively.
//!
//! The webview can play a provider's video but cannot read its bytes: the providers' file hosts
//! send no CORS headers. Saving a download and handing Windows a lock-screen image both need
//! the bytes, so they are fetched here, streamed to disk rather than held in memory (an
//! original can run to gigabytes).
//!
//! Only HTTPS URLs on the providers' media hosts are fetched, the same hosts the page's CSP
//! allows (`tauri.conf.json`). A new provider adds its host in both places.

use std::io::Write;
use std::path::{Path, PathBuf};

/// Where provider media lives. Keep in step with `img-src` / `media-src` in tauri.conf.json.
pub const MEDIA_HOSTS: &[&str] = &["storage.coverr.co", "images-assets.nasa.gov"];

pub fn allowed(url: &str) -> Result<(), String> {
    let rest = url.strip_prefix("https://").ok_or("only https media can be fetched")?;
    let host = rest.split(['/', '?', '#']).next().unwrap_or("").split(':').next().unwrap_or("");
    if MEDIA_HOSTS.contains(&host) {
        Ok(())
    } else {
        Err(format!("{host} is not a wallpaper provider's media host"))
    }
}

/// A file name that is safe on every desktop OS, keeping the extension.
pub fn safe_name(name: &str, ext: &str) -> String {
    let stem: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.') { c } else { '-' })
        .collect::<String>()
        .trim_matches(|c: char| c == '.' || c == ' ' || c == '-')
        .chars()
        .take(120)
        .collect();
    let stem = if stem.is_empty() { "wallpaper".to_string() } else { stem };
    format!("{stem}.{ext}")
}

/// `~` and `~/…` to the home directory.
pub fn expand_home(dir: &str) -> Result<PathBuf, String> {
    let home = || std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from).ok_or("no home directory");
    Ok(match dir.strip_prefix('~') {
        Some(rest) => home()?.join(rest.trim_start_matches(['/', '\\'])),
        None => PathBuf::from(dir),
    })
}

/// `path` with ` (2)`, ` (3)`… before the extension until nothing is there.
fn unused(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("wallpaper").to_string();
    let ext = path.extension().and_then(|s| s.to_str()).map(|e| format!(".{e}")).unwrap_or_default();
    let dir = path.parent().map(Path::to_path_buf).unwrap_or_default();
    (2..).map(|n| dir.join(format!("{stem} ({n}){ext}"))).find(|p| !p.exists()).unwrap()
}

/// Stream `url` to `dest`, through a temporary file so a failed download leaves nothing behind.
pub fn fetch_to(url: &str, dest: &Path) -> Result<(), String> {
    allowed(url)?;
    let mut response = ureq::get(url).call().map_err(|e| format!("download failed: {e}"))?;
    let part = dest.with_extension("part");
    let result = (|| {
        let mut file = std::fs::File::create(&part).map_err(|e| e.to_string())?;
        let mut body = response.body_mut().with_config().limit(u64::MAX).reader();
        std::io::copy(&mut body, &mut file).map_err(|e| format!("download failed: {e}"))?;
        file.flush().map_err(|e| e.to_string())?;
        std::fs::rename(&part, dest).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&part);
    }
    result
}

/// Save a wallpaper's file into `dir` (Settings › Download location). Returns where it went.
pub fn download(url: &str, dir: &str, name: &str, ext: &str) -> Result<PathBuf, String> {
    let dir = expand_home(dir)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = unused(dir.join(safe_name(name, ext)));
    fetch_to(url, &dest)?;
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fetches_only_https_on_provider_hosts() {
        assert!(allowed("https://storage.coverr.co/videos/abc?token=t").is_ok());
        assert!(allowed("https://images-assets.nasa.gov/video/x/x~large.mp4").is_ok());
        assert!(allowed("http://images-assets.nasa.gov/video/x").is_err());
        assert!(allowed("https://evil.example/x.mp4").is_err());
        assert!(allowed("https://storage.coverr.co.evil.example/x").is_err());
        assert!(allowed("file:///etc/passwd").is_err());
    }

    #[test]
    fn names_files_safely() {
        assert_eq!(safe_name("Earth at Night", "mp4"), "Earth at Night.mp4");
        assert_eq!(safe_name("../../etc/passwd", "mp4"), "etc-passwd.mp4");
        assert_eq!(safe_name("a/b:c*?", "mp4"), "a-b-c.mp4");
        assert_eq!(safe_name("", "jpg"), "wallpaper.jpg");
    }

    #[test]
    fn expands_the_home_directory() {
        let home = expand_home("~").unwrap();
        assert_eq!(expand_home("~/Pictures/Drift").unwrap(), home.join("Pictures/Drift"));
        assert_eq!(expand_home("/tmp/x").unwrap(), PathBuf::from("/tmp/x"));
    }

    /// Hits NASA's servers: `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn downloads_a_real_file() {
        let dir = std::env::temp_dir().join(format!("drift-media-net-{}", std::process::id()));
        let url = "https://images-assets.nasa.gov/video/GSFC_20190513_m4714_Lee_Lincoln_Scarp_Moon_Flyover/GSFC_20190513_m4714_Lee_Lincoln_Scarp_Moon_Flyover~thumb.jpg";
        let path = download(url, dir.to_str().unwrap(), "Moon Flyover", "jpg").unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(&bytes[..3], &[0xFF, 0xD8, 0xFF], "a JPEG");
        assert!(!path.with_extension("part").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn never_overwrites_an_existing_download() {
        let dir = std::env::temp_dir().join(format!("drift-media-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = dir.join("Loop.mp4");
        std::fs::write(&first, b"x").unwrap();
        assert_eq!(unused(first.clone()), dir.join("Loop (2).mp4"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
