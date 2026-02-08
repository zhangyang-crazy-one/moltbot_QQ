import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setQqRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getQqRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("QQ runtime not initialized");
  }
  return runtime;
}
