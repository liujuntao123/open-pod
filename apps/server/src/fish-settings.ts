/** @file Fish helpers — re-export from dual-provider settings. */
export {
  BUILTIN_FISH_NAME,
  ensureBuiltinFishConnection,
  getFishApiKey,
  setFishApiKey,
  type ProviderConn as FishConn,
} from "./provider-settings.js";
