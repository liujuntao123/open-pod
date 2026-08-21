# Pluggable TTS providers with per-provider parameter schemas

Users bring their own TTS models. Open Pod integrates engines through pluggable provider adapters rather than hard-coding one engine or treating a raw custom HTTP body as the only model.

Providers differ in request fields and response shapes. The domain keeps a uniform synthesis intent (text, resolved voice, effective params); each adapter maps that intent to engine-specific calls and normalizes outputs to studio audio artifacts. Voice config and the settings UI are driven by the provider’s parameter schema, not a single global speed/pitch field set assumed for every engine.

v1 ships the adapter interface plus at least one real provider; additional providers are additive.
