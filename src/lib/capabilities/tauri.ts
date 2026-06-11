/**
 * Tauri desktop implementation of the capability layer.
 *
 * Tauri 2.x delegates media permission to the OS via the webview's
 * getUserMedia, so we delegate microphone permission checks to the web
 * implementation rather than re-implementing the browser surface.
 */
import * as web from "./web";

export type PermissionState = "granted" | "denied" | "prompt";

export const checkMicrophonePermission = web.checkMicrophonePermission;
export const requestMicrophonePermission = web.requestMicrophonePermission;

export const isNativeApp = true;

export type TauriPlatform = "tauri-mac" | "tauri-win" | "tauri-linux";

/**
 * Reports the host OS by sniffing navigator.platform. Tauri does not yet
 * expose a stable JS-side platform identifier in v2.x, so this is the
 * best signal available before the M3.8 plugin integration lands.
 */
export function getPlatform(): TauriPlatform {
  if (typeof navigator === "undefined") return "tauri-linux";
  const ua = navigator.platform || "";
  if (ua.startsWith("Mac")) return "tauri-mac";
  if (ua.startsWith("Win")) return "tauri-win";
  return "tauri-linux";
}
