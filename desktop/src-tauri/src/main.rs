#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod backend;
mod windows;

use backend::Backend;
use std::{fs, io::Write, path::PathBuf, sync::Mutex};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use windows::{
    desktop_drag, desktop_hide, desktop_import, desktop_layout, desktop_nudge,
    desktop_open_workspace, desktop_preferences, desktop_show, desktop_toggle_top, DesktopState,
    Preferences,
};

fn main() {
    let arguments: Vec<String> = std::env::args().collect();
    if let Some(index) = arguments
        .iter()
        .position(|argument| argument == "--check-runtime")
    {
        let Some(directory) = arguments.get(index + 1) else {
            std::process::exit(2);
        };
        let data = PathBuf::from(directory);
        let resources = tauri::utils::platform::current_exe()
            .expect("Executável ausente")
            .parent()
            .expect("Pasta ausente")
            .to_path_buf();
        let result = Backend::start(&resources, data.clone());
        let (report, code) = match result {
            Ok(backend) => {
                let report = serde_json::json!({ "ready": true, "url": backend.url, "resources": resources });
                backend.stop();
                (report, 0)
            }
            Err(error) => (serde_json::json!({ "ready": false, "error": error }), 1),
        };
        let _ = fs::create_dir_all(&data);
        let _ = fs::write(
            data.join("runtime-check.json"),
            serde_json::to_vec(&report).unwrap(),
        );
        std::process::exit(code);
    }

    let application = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            windows::show_widget(app)
        }))
        .invoke_handler(tauri::generate_handler![
            desktop_import,
            desktop_show,
            desktop_drag,
            desktop_nudge,
            desktop_hide,
            desktop_layout,
            desktop_open_workspace,
            desktop_preferences,
            desktop_toggle_top
        ])
        .setup(|app| {
            let mut resources = app.path().resource_dir()?;
            if cfg!(debug_assertions) && !resources.join("php/php.exe").exists() {
                resources = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("../.build/resources")
                    .canonicalize()?;
            }
            let data = app.path().app_local_data_dir()?.join("data");
            match Backend::start(&resources, data.clone()) {
                Ok(backend) => {
                    let preferences = fs::read(data.join("window.json"))
                        .ok()
                        .and_then(|bytes| serde_json::from_slice::<Preferences>(&bytes).ok())
                        .unwrap_or_default();
                    app.manage(DesktopState {
                        backend,
                        preferences: Mutex::new(preferences),
                        mode: Mutex::new(String::from("loading")),
                    });
                    windows::create_widget(app.handle())?;
                    windows::create_tray(app.handle())?;
                }
                Err(message) => {
                    if let Ok(mut log) = fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(data.join("desktop.log"))
                    {
                        let _ = writeln!(log, "Falha na inicialização: {message}");
                    }
                    let text = serde_json::to_string(&message)?;
                    WebviewWindowBuilder::new(
                        app,
                        "startup-error",
                        WebviewUrl::App("index.html".into()),
                    )
                    .title("Tempozi Jornada")
                    .inner_size(530.0, 240.0)
                    .center()
                    .initialization_script(format!("window.__FLUXO_STARTUP_ERROR__={text};"))
                    .build()?;
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Não foi possível abrir o Tempozi Jornada");
    application.run(|app, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app.try_state::<DesktopState>() {
                state.backend.stop();
            }
        }
    });
}
