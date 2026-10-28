//! The app menu. Standard macOS items (About, Hide, Quit, the Edit menu that makes
//! copy and paste work in the web view, Window) plus the app's own commands, which
//! are forwarded to the interface as a "menu" event (frontend/src/platform/shortcuts.ts).

use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

/// Menu item ids the interface understands.
const COMMANDS: [&str; 3] = ["new", "search", "settings"];

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let sep = || PredefinedMenuItem::separator(app);
    let app_menu = Submenu::with_items(app, "Personal OS", true, &[
        &PredefinedMenuItem::about(app, None, None)?,
        &sep()?,
        &MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?,
        &sep()?,
        &PredefinedMenuItem::hide(app, None)?,
        &PredefinedMenuItem::hide_others(app, None)?,
        &PredefinedMenuItem::show_all(app, None)?,
        &sep()?,
        &PredefinedMenuItem::quit(app, None)?,
    ])?;
    let file = Submenu::with_items(app, "File", true, &[
        &MenuItem::with_id(app, "new", "New Transaction", true, Some("CmdOrCtrl+N"))?,
        &MenuItem::with_id(app, "search", "Search…", true, Some("CmdOrCtrl+F"))?,
        &sep()?,
        &PredefinedMenuItem::close_window(app, None)?,
    ])?;
    let edit = Submenu::with_items(app, "Edit", true, &[
        &PredefinedMenuItem::undo(app, None)?,
        &PredefinedMenuItem::redo(app, None)?,
        &sep()?,
        &PredefinedMenuItem::cut(app, None)?,
        &PredefinedMenuItem::copy(app, None)?,
        &PredefinedMenuItem::paste(app, None)?,
        &PredefinedMenuItem::select_all(app, None)?,
    ])?;
    let view = Submenu::with_items(app, "View", true, &[&PredefinedMenuItem::fullscreen(app, None)?])?;
    let window = Submenu::with_items(app, "Window", true, &[
        &PredefinedMenuItem::minimize(app, None)?,
        &PredefinedMenuItem::maximize(app, None)?,
    ])?;
    Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window])
}

pub fn forward<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    if COMMANDS.contains(&id) {
        let _ = app.emit("menu", id);
    }
}
