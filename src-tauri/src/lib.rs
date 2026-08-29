use tauri::command;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{State, Manager};
use std::io::Write;

struct EngineState {
    // We can hold the stdin handle to write JSON RPC commands
    stdin: Mutex<Option<std::process::ChildStdin>>,
}

#[command]
fn start_audio(state: State<'_, EngineState>) -> Result<String, String> {
    println!("Tauri: start_audio called");
    if let Some(stdin) = state.stdin.lock().unwrap().as_mut() {
        let payload = r#"{"id":1, "method":"audio.start"}"#;
        let _ = writeln!(stdin, "{}", payload);
    }
    Ok("Audio Started".into())
}

#[command]
fn stop_audio(state: State<'_, EngineState>) -> Result<String, String> {
    println!("Tauri: stop_audio called");
    if let Some(stdin) = state.stdin.lock().unwrap().as_mut() {
        let payload = r#"{"id":2, "method":"audio.stop"}"#;
        let _ = writeln!(stdin, "{}", payload);
    }
    Ok("Audio Stopped".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(EngineState { stdin: Mutex::new(None) })
    .invoke_handler(tauri::generate_handler![start_audio, stop_audio])
    .setup(|app| {
      // Spawn the C++ JUCE Native Audio Core
      let juce_path = std::env::current_dir()
          .unwrap()
          .join("..")
          .join("juce-backend")
          .join("build")
          .join("Release")
          .join("LyricistEngine.exe");
          
      println!("Attempting to spawn JUCE engine at: {:?}", juce_path);
      
      if juce_path.exists() {
          match Command::new(juce_path)
              .stdin(Stdio::piped())
              .stdout(Stdio::piped())
              .spawn() 
          {
              Ok(mut child) => {
                  println!("Successfully launched C++ JUCE Native Engine!");
                  let stdin = child.stdin.take();
                  let state: State<EngineState> = app.try_state().unwrap();
                  *state.stdin.lock().unwrap() = stdin;
                  
                  // In a production setup, we would read child.stdout in a thread here
              }
              Err(e) => println!("Failed to spawn JUCE engine: {}", e),
          }
      } else {
          println!("JUCE engine not found. Ensure CMake has built LyricistEngine.exe");
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
