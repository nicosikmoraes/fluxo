#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

pub struct Backend {
    pub url: String,
    pub data: PathBuf,
    resources: PathBuf,
    port: u16,
    instance: String,
    child: Mutex<Child>,
}

fn free_port() -> Result<u16, String> {
    for port in 18788..18808 {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) {
            return Ok(listener.local_addr().map_err(|e| e.to_string())?.port());
        }
    }
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    Ok(listener.local_addr().map_err(|e| e.to_string())?.port())
}

fn command(resources: &Path, data: &Path, url: &str) -> Command {
    let mut command = Command::new(resources.join("php/php.exe"));
    command
        .args(["-d", "opcache.enable=0", "-d", "opcache.enable_cli=0", "-c"])
        .arg(resources.join("php/php.ini"))
        .arg("-d")
        .arg(format!(
            "extension_dir={}",
            resources.join("php/ext").display()
        ))
        .current_dir(resources.join("php"))
        .env("FLUXO_BACKEND_DIR", resources.join("backend"))
        .env("FLUXO_DATA_DIR", data)
        .env("APP_ENV", "desktop")
        .env("APP_DEBUG", "false")
        .env("APP_URL", url)
        .env("DB_CONNECTION", "sqlite")
        .env("DB_DATABASE", data.join("database.sqlite"))
        .env("SESSION_COOKIE", "fluxo_desktop_session")
        .env_remove("APP_KEY")
        .stdin(Stdio::null());
    for (key, file) in [
        ("APP_CONFIG_CACHE", "config.php"),
        ("APP_SERVICES_CACHE", "services.php"),
        ("APP_PACKAGES_CACHE", "packages.php"),
        ("APP_ROUTES_CACHE", "routes.php"),
        ("APP_EVENTS_CACHE", "events.php"),
    ] {
        command.env(key, data.join("cache").join(file));
    }
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    command
}

fn healthy(port: u16, instance: &str) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(200)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(300)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(300)));
    if stream
        .write_all(
            b"GET /__fluxo_desktop_health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        )
        .is_err()
    {
        return false;
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok()
        && response.contains(instance)
        && response.starts_with("HTTP/1.1 200")
}

impl Backend {
    pub fn start(resources: &Path, data: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&data).map_err(|e| e.to_string())?;
        let log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(data.join("desktop.log"))
            .map_err(|e| e.to_string())?;
        let port = free_port()?;
        let url = format!("http://127.0.0.1:{port}");
        let mut prepare = command(resources, &data, &url)
            .arg(resources.join("runtime/prepare.php"))
            .stdout(Stdio::from(log.try_clone().map_err(|e| e.to_string())?))
            .stderr(Stdio::from(log.try_clone().map_err(|e| e.to_string())?))
            .spawn()
            .map_err(|e| format!("Não foi possível iniciar os dados locais: {e}"))?;
        let started = Instant::now();
        loop {
            if let Some(status) = prepare.try_wait().map_err(|e| e.to_string())? {
                if !status.success() {
                    return Err("Não foi possível preparar os dados locais. Veja desktop.log na pasta de dados.".into());
                }
                break;
            }
            if started.elapsed() > Duration::from_secs(90) {
                let _ = prepare.kill();
                let _ = prepare.wait();
                return Err("A preparação dos dados locais demorou mais que o esperado.".into());
            }
            thread::sleep(Duration::from_millis(100));
        }
        let mut bytes = [0u8; 32];
        getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
        let instance: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
        let child = command(resources, &data, &url)
            .env("FLUXO_INSTANCE", &instance)
            .arg("-S")
            .arg(format!("127.0.0.1:{port}"))
            .arg("-t")
            .arg(resources.join("backend/public"))
            .arg(resources.join("runtime/router.php"))
            .stdout(Stdio::from(log.try_clone().map_err(|e| e.to_string())?))
            .stderr(Stdio::from(log))
            .spawn()
            .map_err(|e| e.to_string())?;
        let backend = Self {
            url,
            data,
            resources: resources.to_path_buf(),
            port,
            instance: instance.clone(),
            child: Mutex::new(child),
        };
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(20) {
            if healthy(port, &instance) {
                return Ok(backend);
            }
            if backend
                .child
                .lock()
                .map_err(|e| e.to_string())?
                .try_wait()
                .map_err(|e| e.to_string())?
                .is_some()
            {
                break;
            }
            thread::sleep(Duration::from_millis(150));
        }
        Err("O serviço local não iniciou. Veja desktop.log na pasta de dados.".into())
    }

    pub fn import_existing(&self, source: &Path) -> Result<(), String> {
        self.stop();
        let output = command(&self.resources, &self.data, &self.url)
            .arg(self.resources.join("runtime/import.php"))
            .arg(source)
            .output();
        let log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.data.join("desktop.log"))
            .map_err(|e| e.to_string())?;
        let child = command(&self.resources, &self.data, &self.url)
            .env("FLUXO_INSTANCE", &self.instance)
            .arg("-S")
            .arg(format!("127.0.0.1:{}", self.port))
            .arg("-t")
            .arg(self.resources.join("backend/public"))
            .arg(self.resources.join("runtime/router.php"))
            .stdout(Stdio::from(log.try_clone().map_err(|e| e.to_string())?))
            .stderr(Stdio::from(log))
            .spawn()
            .map_err(|e| e.to_string())?;
        *self.child.lock().map_err(|e| e.to_string())? = child;
        let started = Instant::now();
        while !healthy(self.port, &self.instance) {
            if started.elapsed() > Duration::from_secs(20) {
                return Err("Reabra o aplicativo para acessar os dados locais.".into());
            }
            thread::sleep(Duration::from_millis(100));
        }
        match output {
            Ok(output) if output.status.success() => Ok(()),
            Ok(output) => {
                let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
                Err(if message.is_empty() {
                    "Não foi possível concluir a importação. Confira desktop.log na pasta de dados."
                        .into()
                } else {
                    message
                })
            }
            Err(error) => Err(error.to_string()),
        }
    }

    pub fn stop(&self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for Backend {
    fn drop(&mut self) {
        self.stop();
    }
}
