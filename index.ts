import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { qqPlugin } from "./src/channel.js";
import { setQqRuntime } from "./src/runtime.js";

const plugin = {
  id: "qq",
  name: "QQ",
  description: "QQ channel plugin via OneBot 11",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    console.error(`[DEBUG] register: api.runtime type=${typeof api.runtime}`);
    console.error(`[DEBUG] register: api.runtime=${api.runtime ? JSON.stringify(Object.keys(api.runtime)) : 'null'}`);
    setQqRuntime(api.runtime);
    api.registerChannel({ plugin: qqPlugin });
  },
};

export default plugin;
