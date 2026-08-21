# Local server binds to localhost by default

Because provider API keys live in the studio data directory and the product is a single-user local studio, the HTTP server defaults to loopback only (e.g. 127.0.0.1). LAN/public bind is not a v1 goal; if added later it must be explicit opt-in with clear risk, not the default.
