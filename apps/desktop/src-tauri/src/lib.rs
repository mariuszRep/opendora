use std::{path::PathBuf, sync::Mutex};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

pub struct ServerProcess(pub Mutex<Option<CommandChild>>);

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            if let Err(e) = setup_first_run(app.handle()) {
                eprintln!("[desktop] first-run setup failed: {e}");
            }

            match start_server(app.handle()) {
                Ok(child) => *app.state::<ServerProcess>().0.lock().unwrap() = Some(child),
                Err(e) => eprintln!("[desktop] failed to start server: {e}"),
            }

            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![navigate_to_app, show_window])
        .on_window_event(|window, event| {
            // Keep running in tray when the user clicks the close button
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().ok();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error running Projectflows desktop");
}

/// First-launch: extract bundled tarballs into their destinations.
fn setup_first_run(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let home = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".projectflows");
    let sentinel = home.join(".desktop-setup-done");

    if sentinel.exists() {
        return Ok(());
    }

    let resources = app.path().resource_dir()?;

    // core.tar.gz → ~/.projectflows/
    let core_tar = resources.join("core.tar.gz");
    if core_tar.exists() {
        std::fs::create_dir_all(&home)?;
        extract_tar_gz(&core_tar, &home)?;
    }

    // web.tar.gz → <app_data>/web/
    // The archive itself contains a top-level "web/" entry (built via `tar -C dist web`
    // in build-binary.ts, same as install.sh, which strips it with --strip-components=1) —
    // extract into the parent app-data dir, not web_dir itself, or the result double-nests
    // into <app_data>/web/web/.
    let app_data_dir = app.path().app_data_dir()?;
    let web_tar = resources.join("web.tar.gz");
    if web_tar.exists() {
        std::fs::create_dir_all(&app_data_dir)?;
        extract_tar_gz(&web_tar, &app_data_dir)?;
    }

    std::fs::create_dir_all(&home)?;
    std::fs::write(sentinel, b"")?;
    Ok(())
}

/// Spawn `projectflows serve` as a Tauri sidecar.
fn start_server(app: &AppHandle) -> Result<CommandChild, Box<dyn std::error::Error>> {
    let web_dir = app.path().app_data_dir()?.join("web");
    let (mut rx, child) = app
        .shell()
        .sidecar("projectflows")?
        .args([
            "serve",
            "--port",
            "4097",
            "--web-dir",
            &web_dir.to_string_lossy(),
        ])
        .spawn()?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    eprintln!("[server stdout] {}", String::from_utf8_lossy(&bytes));
                }
                CommandEvent::Stderr(bytes) => {
                    eprintln!("[server stderr] {}", String::from_utf8_lossy(&bytes));
                }
                CommandEvent::Error(err) => {
                    eprintln!("[server error] {err}");
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!(
                        "[server terminated] code={:?} signal={:?}",
                        payload.code, payload.signal
                    );
                }
                _ => {}
            }
        }
    });

    Ok(child)
}

/// System tray with "Open Projectflows" and "Quit" entries.
fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItemBuilder::with_id("open", "Open Projectflows").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&open, &quit]).build()?;

    let handle_click = app.handle().clone();
    let handle_menu = app.handle().clone();

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_tray_icon_event(move |_tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(win) = handle_click.get_webview_window("main") {
                    win.show().ok();
                    win.set_focus().ok();
                }
            }
        })
        .on_menu_event(move |_app, event| match event.id().as_ref() {
            "open" => {
                if let Some(win) = handle_menu.get_webview_window("main") {
                    win.show().ok();
                    win.set_focus().ok();
                }
            }
            "quit" => {
                if let Some(state) = handle_menu.try_state::<ServerProcess>() {
                    if let Ok(mut lock) = state.0.lock() {
                        if let Some(child) = lock.take() {
                            child.kill().ok();
                        }
                    }
                }
                handle_menu.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

/// Called from the loading-screen JS if the server never responds in time, so the
/// timeout/error message (otherwise unreachable, since the window starts hidden) is visible.
#[tauri::command]
fn show_window(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

/// Called from the loading-screen JS once `http://localhost:4097` responds.
/// Navigates the webview to the local server and brings the window to focus.
#[tauri::command]
fn navigate_to_app(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;

    let url = "http://localhost:4097"
        .parse::<tauri::Url>()
        .map_err(|e| e.to_string())?;
    win.navigate(url).map_err(|e| e.to_string())?;

    Ok(())
}

/// Extract a `.tar.gz` archive into `dest`.
fn extract_tar_gz(
    src: &PathBuf,
    dest: &PathBuf,
) -> Result<(), Box<dyn std::error::Error>> {
    use flate2::read::GzDecoder;
    use tar::Archive;

    let file = std::fs::File::open(src)?;
    let gz = GzDecoder::new(file);
    let mut archive = Archive::new(gz);
    archive.unpack(dest)?;
    Ok(())
}
