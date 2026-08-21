# Line audio and chapter export use WAV in v1

v1 normalizes synthesis output and chapter assembly to WAV. Provider adapters request WAV when the engine supports it (Fish: `format=wav`) and convert/normalize to WAV if needed so the line-audio slot and export pipeline share one container format.

MP3/Opus as primary store or export is deferred. Following the provider’s native format without normalization is rejected because chapter assembly and line-gap insertion need a stable decoded path.
