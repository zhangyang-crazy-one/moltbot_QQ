import type { ClawdbotPluginApi } from "clawdbot/plugin-sdk";
import { emptyPluginConfigSchema } from "clawdbot/plugin-sdk";

import { qqPlugin } from "./src/channel.js";
import { setQqRuntime } from "./src/runtime.js";

const plugin = {
  id: "qq",
  name: "QQ",
  description: "QQ channel plugin (OneBot 11)",
  configSchema: emptyPluginConfigSchema(),
  register(api: ClawdbotPluginApi) {
    setQqRuntime(api.runtime);
    api.registerChannel(qqPlugin);
  },
};

export default plugin;
