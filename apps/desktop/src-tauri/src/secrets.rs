//! Secrets kept in the OS credential store: the Keychain on macOS, Credential Manager on Windows,
//! the Secret Service (GNOME Keyring, KWallet) on Linux. Other apps and other users cannot read
//! them there, unlike the webview's storage on disk.
//!
//! - The CyKrome session token.
//! - The user's own wallpaper-provider API keys (Pexels, Pixabay), which Drift never ships with.
//!
//! Exposed to the frontend as commands; nothing leaves the store except to the app.

use keyring::{Entry, Error};

const SERVICE: &str = "com.cykrome.drift";
const ACCOUNT: &str = "cykrome-session";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

/// The providers a key may be stored for; anything else is refused rather than stored.
const KEY_PROVIDERS: &[&str] = &["pexels", "pixabay"];

fn provider_entry(provider: &str) -> Result<Entry, String> {
    if !KEY_PROVIDERS.contains(&provider) {
        return Err(format!("{provider} is not a wallpaper provider Drift keeps keys for"));
    }
    Entry::new(SERVICE, &format!("provider-{provider}")).map_err(|e| e.to_string())
}

fn read(entry: Entry) -> Result<Option<String>, String> {
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn clear(entry: Entry) -> Result<(), String> {
    match entry.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// The user's key for `provider`, if they saved one.
#[tauri::command]
pub fn provider_key_get(provider: String) -> Result<Option<String>, String> {
    read(provider_entry(&provider)?)
}

#[tauri::command]
pub fn provider_key_set(provider: String, key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() || key.len() > 256 {
        return Err("That doesn't look like an API key".into());
    }
    provider_entry(&provider)?.set_password(key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn provider_key_clear(provider: String) -> Result<(), String> {
    clear(provider_entry(&provider)?)
}

#[tauri::command]
pub fn session_token_get() -> Result<Option<String>, String> {
    read(entry()?)
}

#[tauri::command]
pub fn session_token_set(token: String) -> Result<(), String> {
    entry()?.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn session_token_clear() -> Result<(), String> {
    clear(entry()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_keys_only_for_known_providers() {
        assert!(provider_entry("pexels").is_ok());
        assert!(provider_entry("pixabay").is_ok());
        assert!(provider_entry("cykrome-session").is_err());
        assert!(provider_entry("../x").is_err());
        assert!(provider_key_set("pexels".into(), "   ".into()).is_err());
    }
}
