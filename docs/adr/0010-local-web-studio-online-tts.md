# Local web studio shell; TTS via online provider APIs

The studio runs as a local web app: a local backend owns works, jobs, and line-audio files; the browser is the UI. v1 is not a desktop shell (Tauri/Electron) and not a pure browser-only app.

TTS providers are online HTTP APIs the user configures, not locally deployed model weights or a mandatory on-device inference runtime. Pluggable adapters still normalize heterogeneous request/response shapes; “bring your own model” means bring your own remote endpoint/credentials/model id, not ship a local engine.
