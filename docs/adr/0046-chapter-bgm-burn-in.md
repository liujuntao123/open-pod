# Chapter composition can burn in studio-preset BGM

Chapter audio remains a single WAV. Optional background music is chosen per chapter from a read-only studio preset catalog, looped to voice length, gain-scaled by a chapter volume (0–100), and mixed into the chapter export job. Users do not upload or manage BGM files. Composition snapshots freeze the BGM setting so UI can mark stale chapter audio when the setting changes; missing presets fail closed at enqueue and in the worker.
