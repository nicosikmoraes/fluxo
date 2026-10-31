use crate::backend::Backend;
use serde::{Deserialize, Serialize};
use std::{fs, sync::Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::NewWindowResponse,
    AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Preferences {
    pub always_on_top: bool,
    pub expanded: bool,
    pub x: Option<i32>,
    pub y: Option<i32>,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            always_on_top: true,
            expanded: true,
            x: None,
            y: None,
        }
    }
}

pub struct DesktopState {
    pub backend: Backend,
    pub preferences: Mutex<Preferences>,
    pub mode: Mutex<String>,
}
impl DesktopState {
    fn save(&self, preferences: &Preferences) {
        if let Ok(bytes) = serde_json::to_vec(preferences) {
            let temporary = self.backend.data.join("window.json.new");
            if fs::write(&temporary, bytes).is_ok() {
                let _ = fs::rename(temporary, self.backend.data.join("window.json"));
            }
        }
    }
}

fn window_url(app: &AppHandle, query: &str) -> Result<tauri::Url, String> {
    let state = app.state::<DesktopState>();
    format!("{}/?{query}", state.backend.url)
        .parse::<tauri::Url>()
        .map_err(|e| e.to_string())
}

fn position_widget(window: &WebviewWindow, preferences: &Preferences) -> Result<(), String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let monitor = monitors
        .iter()
        .find(|monitor| {
            let position = monitor.position();
            let size = monitor.size();
            preferences
                .x
                .is_some_and(|x| x >= position.x && x < position.x + size.width as i32)
                && preferences
                    .y
                    .is_some_and(|y| y >= position.y && y < position.y + size.height as i32)
        })
        .or_else(|| monitors.first());
    if let Some(monitor) = monitor {
        let start = monitor.position();
        let monitor_size = monitor.size();
        let size = window.outer_size().map_err(|e| e.to_string())?;
        let max_x = (start.x + monitor_size.width as i32 - size.width as i32 - 16).max(start.x);
        let max_y = (start.y + monitor_size.height as i32 - size.height as i32 - 64).max(start.y);
        let x = preferences.x.unwrap_or(max_x).clamp(start.x, max_x);
        let y = preferences.y.unwrap_or(max_y).clamp(start.y, max_y);
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn show_widget(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("widget") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn create_widget(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let url = window_url(app, "desktop=widget").map_err(std::io::Error::other)?;
    let port = url.port();
    let window = WebviewWindowBuilder::new(app, "widget", WebviewUrl::External(url))
        .title("Tempozi Jornada")
        .inner_size(348.0, 210.0)
        .decorations(false)
        .transparent(true)
        .background_color(tauri::utils::config::Color(0, 0, 0, 0))
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .data_directory(app.path().app_local_data_dir()?.join("webview"))
        .on_navigation(move |url| {
            url.scheme() == "http" && url.host_str() == Some("127.0.0.1") && url.port() == port
        })
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .build()?;
    let handle = app.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            if let Some(window) = handle.get_webview_window("widget") {
                let _ = window.hide();
            }
        }
        WindowEvent::Moved(position) => {
            let state = handle.state::<DesktopState>();
            if state
                .mode
                .lock()
                .is_ok_and(|mode| mode.as_str() != "account" && mode.as_str() != "loading")
            {
                if let Ok(mut preferences) = state.preferences.lock() {
                    preferences.x = Some(position.x);
                    preferences.y = Some(position.y);
                    state.save(&preferences);
                }
            }
        }
        _ => {}
    });
    Ok(())
}

fn open_workspace(app: &AppHandle, view: &str) -> Result<(), String> {
    if !["profile", "work-history"].contains(&view) {
        return Err("Tela inválida.".into());
    }
    let url = window_url(app, &format!("desktop=workspace&view={view}"))?;
    if let Some(window) = app.get_webview_window("workspace") {
        window.navigate(url).map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    let port = url.port();
    let window = WebviewWindowBuilder::new(app, "workspace", WebviewUrl::External(url))
        .title("Tempozi Jornada — seu espaço")
        .inner_size(1120.0, 780.0)
        .min_inner_size(650.0, 500.0)
        .center()
        .data_directory(
            app.path()
                .app_local_data_dir()
                .map_err(|e| e.to_string())?
                .join("webview"),
        )
        .on_navigation(move |url| {
            url.scheme() == "http" && url.host_str() == Some("127.0.0.1") && url.port() == port
        })
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .build()
        .map_err(|e| e.to_string())?;
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            show_widget(&handle);
        }
    });
    Ok(())
}

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Abrir widget", true, None::<&str>)?;
    let settings = MenuItem::with_id(
        app,
        "settings",
        "Configurações da jornada",
        true,
        None::<&str>,
    )?;
    let history = MenuItem::with_id(app, "history", "Histórico de horas", true, None::<&str>)?;
    let pin = MenuItem::with_id(app, "pin", "Alternar sempre no topo", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair do Tempozi Jornada", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &settings, &history, &pin, &quit])?;
    TrayIconBuilder::with_id("jornada")
        .icon(
            app.default_window_icon()
                .cloned()
                .expect("Ícone do aplicativo ausente"),
        )
        .tooltip("Tempozi Jornada — seus horários neste computador")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_widget(app),
            "settings" | "history" => {
                let handle = app.clone();
                let view = if event.id.as_ref() == "settings" {
                    "profile"
                } else {
                    "work-history"
                };
                tauri::async_runtime::spawn(async move {
                    let _ = open_workspace(&handle, view);
                });
            }
            "pin" => {
                let _ = toggle_top(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_widget(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[tauri::command]
pub fn desktop_preferences(app: AppHandle) -> Result<Preferences, String> {
    app.state::<DesktopState>()
        .preferences
        .lock()
        .map(|preferences| preferences.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn desktop_drag(window: WebviewWindow) -> Result<(), String> {
    if window.label() != "widget" {
        return Err("Janela inválida.".into());
    }
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn desktop_hide(window: WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn desktop_open_workspace(app: AppHandle, view: String) -> Result<(), String> {
    open_workspace(&app, &view)
}

fn toggle_top(app: &AppHandle) -> Result<Preferences, String> {
    let state = app.state::<DesktopState>();
    let preferences = {
        let mut preferences = state.preferences.lock().map_err(|e| e.to_string())?;
        preferences.always_on_top = !preferences.always_on_top;
        state.save(&preferences);
        preferences.clone()
    };
    if let Some(window) = app.get_webview_window("widget") {
        window
            .set_always_on_top(preferences.always_on_top)
            .map_err(|e| e.to_string())?;
    }
    Ok(preferences)
}

#[tauri::command]
pub fn desktop_toggle_top(app: AppHandle) -> Result<Preferences, String> {
    toggle_top(&app)
}

#[tauri::command]
pub fn desktop_layout(
    app: AppHandle,
    window: WebviewWindow,
    mode: String,
    height: f64,
) -> Result<(), String> {
    if window.label() != "widget"
        || !["account", "widget", "compact"].contains(&mode.as_str())
        || !height.is_finite()
    {
        return Err("Layout inválido.".into());
    }
    let state = app.state::<DesktopState>();
    let previous = {
        let mut current = state.mode.lock().map_err(|e| e.to_string())?;
        let previous = current.clone();
        *current = mode.clone();
        previous
    };
    let account = mode == "account";
    let preferences = {
        let mut preferences = state.preferences.lock().map_err(|e| e.to_string())?;
        if !account {
            preferences.expanded = mode == "widget";
            state.save(&preferences);
        }
        preferences.clone()
    };
    window.set_decorations(account).map_err(|e| e.to_string())?;
    window.set_resizable(account).map_err(|e| e.to_string())?;
    window
        .set_skip_taskbar(!account)
        .map_err(|e| e.to_string())?;
    window
        .set_always_on_top(!account && preferences.always_on_top)
        .map_err(|e| e.to_string())?;
    let maximum_height = window
        .current_monitor()
        .ok()
        .flatten()
        .map(|monitor| monitor.size().height as f64 / monitor.scale_factor() - 80.0)
        .unwrap_or(900.0)
        .max(420.0);
    let (width, height) = if account {
        (980.0, 760.0_f64.min(maximum_height))
    } else {
        (
            if mode == "compact" { 272.0 } else { 348.0 },
            height.clamp(80.0, maximum_height),
        )
    };
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    if account {
        if previous != mode {
            window.center().map_err(|e| e.to_string())?;
        }
    } else {
        position_widget(&window, &preferences)?;
    }
    Ok(())
}

#[tauri::command]
pub fn desktop_nudge(window: WebviewWindow, direction: String) -> Result<(), String> {
    if window.label() != "widget" {
        return Err("Janela inválida.".into());
    }
    let (x, y) = match direction.as_str() {
        "ArrowUp" => (0, -12),
        "ArrowDown" => (0, 12),
        "ArrowLeft" => (-12, 0),
        "ArrowRight" => (12, 0),
        _ => return Err("Direção inválida.".into()),
    };
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let preferences = Preferences {
        x: Some(position.x + x),
        y: Some(position.y + y),
        ..Preferences::default()
    };
    position_widget(&window, &preferences)
}

#[tauri::command]
pub async fn desktop_import(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app
        .dialog()
        .file()
        .set_title("Selecione a pasta app da instalação atual do Tempozi")
        .blocking_pick_folder();
    let Some(folder) = folder else {
        return Ok(false);
    };
    let path = folder.into_path().map_err(|e| e.to_string())?;
    app.state::<DesktopState>().backend.import_existing(&path)?;
    Ok(true)
}

#[tauri::command]
pub fn desktop_show(app: AppHandle) {
    show_widget(&app);
}
