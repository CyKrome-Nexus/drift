//! The CyKrome session token, kept in the OS credential store: the Keychain on macOS, Credential
//! Manager on Windows, the Secret Service (GNOME Keyring, KWallet) on Linux. Other apps and
//! other users cannot read it there, unlike the webview's storage on disk.
//!
//! Exposed to the frontend as three commands; it never leaves the store except to the app.

use keyring::{Entry, Error};

const SERVICE: &str = "com.cykrome.drift";
const ACCOUNT: &str = "cykrome-session";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn session_token_get() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn session_token_set(token: String) -> Result<(), String> {
    entry()?.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn session_token_clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
