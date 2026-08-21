# Studio data lives in a local data directory managed by the backend

Works, scripts, voice library, provider connections, job state, and audio files are owned by the local backend under a configurable studio data directory. The browser is UI only—not the system of record.

API keys and similar secrets live in that directory but separated from exportable work content (dedicated secrets file/store, restricted permissions). Secrets never ship inside chapter audio exports or frontend build artifacts. v1 does not require OS keychain; environment-variable injection may exist as an override later without changing the domain model.
