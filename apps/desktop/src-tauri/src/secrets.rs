//! Secrets kept in the OS credential store: the Keychain on macOS, Credential Manager on Windows,
//! the Secret Service (GNOME Keyring, KWallet) on Linux. Other apps and other users cannot read
//! them there, unlike the webview's storage on disk.
//!
//! - The CyKrome session token.
//! - The user's own wallpaper-provider API keys, one per connection (`pexels-…`, `pixabay-…`,
//!   `coverr-…`), which Drift never ships with.
//!
//! Exposed to the frontend as commands; nothing leaves the store except to the app.

use keyring::{Entry, Error};

const SERVICE: &str = "com.cykrome.drift";
const ACCOUNT: &str = "cykrome-session";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

/// The providers a connection can be for.
const KEY_PROVIDERS: &[&str] = &["pexels", "pixabay", "coverr"];

/// A connection id (`pexels-x7k2m9q4a1`), or a bare provider name: where the first build kept its
/// one key per provider, read once to carry it over. Anything else is refused rather than stored.
fn valid_connection(id: &str) -> bool {
    if KEY_PROVIDERS.contains(&id) {
        return true;
    }
    let Some((kind, tail)) = id.split_once('-') else { return false };
    KEY_PROVIDERS.contains(&kind) && (4..=32).contains(&tail.len()) && tail.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
}

fn provider_entry(connection: &str) -> Result<Entry, String> {
    if !valid_connection(connection) {
        return Err(format!("{connection} is not a wallpaper source Drift keeps keys for"));
    }
    Entry::new(SERVICE, &format!("provider-{connection}")).map_err(|e| e.to_string())
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

/// The key saved for `connection`, if there is one.
#[tauri::command]
pub fn provider_key_get(connection: String) -> Result<Option<String>, String> {
    read(provider_entry(&connection)?)
}

#[tauri::command]
pub fn provider_key_set(connection: String, key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() || key.len() > 256 {
        return Err("That doesn't look like an API key".into());
    }
    provider_entry(&connection)?.set_password(key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn provider_key_clear(connection: String) -> Result<(), String> {
    clear(provider_entry(&connection)?)
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
    fn keeps_keys_only_for_connections_to_known_providers() {
        assert!(valid_connection("pexels-x7k2m9q4a1"));
        assert!(valid_connection("coverr-abcd"));
        // The first build's one-per-provider entries, read to carry them over.
        assert!(valid_connection("pixabay"));
        assert!(!valid_connection("nasa-abcd1234"));
        assert!(!valid_connection("cykrome-session"));
        assert!(!valid_connection("pexels-ABC12345"));
        assert!(!valid_connection("pexels-../x"));
        assert!(!valid_connection("pexels-abc"));
        assert!(provider_key_set("pexels-abcd1234".into(), "   ".into()).is_err());
    }
}
