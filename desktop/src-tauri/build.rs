fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_show",
            "desktop_import",
            "desktop_drag",
            "desktop_nudge",
            "desktop_hide",
            "desktop_layout",
            "desktop_open_workspace",
            "desktop_preferences",
            "desktop_toggle_top",
        ]),
    ))
    .expect("Não foi possível preparar o aplicativo");
}
