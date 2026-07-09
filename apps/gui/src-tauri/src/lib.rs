use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

struct RunState {
  child: Mutex<Option<Child>>,
  project_dir: Mutex<Option<PathBuf>>,
}

#[derive(Clone, Serialize)]
struct LogPayload {
  line: String,
}

fn plugdev_bin() -> String {
  if cfg!(windows) {
    "plugdev.cmd".into()
  } else {
    "plugdev".into()
  }
}

#[tauri::command]
fn start_run(app: AppHandle, state: State<'_, RunState>, project_dir: String) -> Result<(), String> {
  let mut guard = state.child.lock().map_err(|e| e.to_string())?;
  if guard.is_some() {
    return Err("Already running".into());
  }

  let dir = PathBuf::from(&project_dir);
  if !dir.is_dir() {
    return Err(format!("Not a directory: {project_dir}"));
  }

  let mut child = Command::new(plugdev_bin())
    .arg("run")
    .current_dir(&dir)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .stdin(Stdio::null())
    .spawn()
    .map_err(|e| {
      format!(
        "Failed to spawn plugdev run: {e}. Is @plugdev/cli installed globally?"
      )
    })?;

  if let Some(stdout) = child.stdout.take() {
    let app_out = app.clone();
    std::thread::spawn(move || {
      let reader = BufReader::new(stdout);
      for line in reader.lines().flatten() {
        let _ = app_out.emit("plugdev-log", LogPayload { line });
      }
    });
  }
  if let Some(stderr) = child.stderr.take() {
    let app_err = app.clone();
    std::thread::spawn(move || {
      let reader = BufReader::new(stderr);
      for line in reader.lines().flatten() {
        let _ = app_err.emit("plugdev-log", LogPayload { line });
      }
    });
  }

  *state.project_dir.lock().map_err(|e| e.to_string())? = Some(dir);
  *guard = Some(child);
  let _ = app.emit(
    "plugdev-log",
    LogPayload {
      line: format!("Started plugdev run in {project_dir}"),
    },
  );
  Ok(())
}

#[tauri::command]
fn stop_run(app: AppHandle, state: State<'_, RunState>) -> Result<(), String> {
  let mut guard = state.child.lock().map_err(|e| e.to_string())?;
  if let Some(mut child) = guard.take() {
    let _ = child.kill();
    let _ = child.wait();
    let _ = app.emit(
      "plugdev-log",
      LogPayload {
        line: "Stopped.".into(),
      },
    );
  }
  *state.project_dir.lock().map_err(|e| e.to_string())? = None;
  Ok(())
}

#[tauri::command]
fn send_console_command(state: State<'_, RunState>, command: String) -> Result<String, String> {
  let dir = state
    .project_dir
    .lock()
    .map_err(|e| e.to_string())?
    .clone()
    .ok_or_else(|| "No project running".to_string())?;

  let output = Command::new(plugdev_bin())
    .arg("server")
    .arg("command")
    .arg(&command)
    .current_dir(dir)
    .output()
    .map_err(|e| format!("Failed to run plugdev server command: {e}"))?;

  let stdout = String::from_utf8_lossy(&output.stdout).to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).to_string();
  if !output.status.success() {
    return Err(if stderr.is_empty() { stdout } else { stderr });
  }
  Ok(if stdout.is_empty() { "(ok)".into() } else { stdout })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .manage(RunState {
      child: Mutex::new(None),
      project_dir: Mutex::new(None),
    })
    .invoke_handler(tauri::generate_handler![
      start_run,
      stop_run,
      send_console_command
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
