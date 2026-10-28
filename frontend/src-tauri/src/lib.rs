//! macOS shell for Personal OS. The interface is the same React app as the web
//! (built with VITE_PLATFORM=macos, see frontend/src/platform); this crate adds
//! what a browser can't do:
//! - a proper Mac window (minimum size, size and position remembered, overlay title bar);
//! - the app menu, whose commands reach the app as "menu" events (src/menu.rs);
//! - the refresh token in the macOS Keychain (src/secure.rs);
//! - Touch ID for the optional app lock (src/biometric.rs).

mod biometric;
mod menu;
mod secure;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .menu(menu::build)
        .on_menu_event(menu::forward)
        .invoke_handler(tauri::generate_handler![
            secure::secure_get,
            secure::secure_set,
            secure::secure_remove,
            biometric::biometric_status,
            biometric::biometric_verify,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Personal OS");
}
