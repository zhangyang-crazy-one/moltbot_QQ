# moltbot_qq

QQ channel plugin for OpenClaw via OneBot 11.

## Installation

### Prerequisites

- OneBot 11 backend running (e.g., LLOneBot/napcat/go-cqhttp)
- OpenClaw installed and configured

### Quick Start

```bash
# Clone and install dependencies
cd moltbot_qq
pnpm install

# Link to OpenClaw (run from OpenClaw root directory)
cd /path/to/openclaw
pnpm install --filter ./extensions/qq

# Restart Gateway
openclaw gateway restart
```

## OpenClaw Configuration

Default config file: `~/.openclaw/openclaw.json`

### Minimal Config (Single Account)

```json
{
  "channels": {
    "qq": {
      "enabled": true,
      "connection": {
        "type": "ws",
        "host": "127.0.0.1",
        "port": 3001
      },
      "dmPolicy": "pairing",
      "allowFrom": ["*"]
    }
  }
}
```

### Multi-Account Config

```json
{
  "channels": {
    "qq": {
      "enabled": true,
      "defaultAccount": "default",
      "accounts": {
        "default": {
          "name": "QQBot",
          "connection": {
            "type": "ws",
            "host": "127.0.0.1",
            "port": 3001,
            "token": "optional-token"
          }
        }
      }
    }
  }
}
```

### Connection Options

| Option | Description | Default |
|--------|-------------|---------|
| `connection.type` | `ws` or `http` | `ws` |
| `connection.host` | OneBot 11 backend host | - |
| `connection.port` | OneBot 11 backend port | - |
| `connection.token` | Authentication token (optional) | - |
| `connection.messageFormat` | `array` or `string` | `array` |
| `connection.reportSelfMessage` | Handle `message_sent` events | `false` |

### Security Policies

| Option | Description | Default |
|--------|-------------|---------|
| `dmPolicy` | `pairing`, `allowlist`, `open`, `disabled` | `pairing` |
| `allowFrom` | DM allowlist (user IDs) | - |
| `groupPolicy` | `allowlist`, `open`, `disabled` | `allowlist` |
| `groupAllowFrom` | Group allowlist (`group:<id>`) | - |
| `requireMention` | Require @mention in groups | `true` |

## Supported Features

- ✅ Private messages
- ✅ Group messages
- ✅ CQ code parsing
- ✅ Message segments
- ✅ Pairing mode
- ✅ Allowlist filtering

## Architecture

```
.
├── index.ts              # Plugin entry point
├── package.json          # Package metadata
├── README.md             # This file
└── src/
    ├── channel.ts        # ChannelPlugin definition
    ├── runtime.ts         # Runtime initialization
    ├── types.ts          # Type definitions
    ├── config.ts         # Configuration parsing
    ├── config-schema.ts  # Zod schema
    ├── adapter.ts        # OneBot 11 client (ws/http)
    ├── inbound.ts        # Inbound message handling
    ├── outbound.ts       # Outbound message handling
    ├── send.ts           # OB11 send helpers
    ├── cqcode.ts         # CQ code encoding/decoding
    ├── message-utils.ts  # OB11 message utilities
    ├── targets.ts        # Target parsing
    └── self-sent.ts      # Self-sent message detection
```

## References

- OneBot 11 Spec: https://github.com/botuniverse/onebot-11
- LLOneBot: https://github.com/LLOneBot/LLOneBot
- napcat: https://github.com/Mrs4s/napcat
- OpenClaw Docs: https://docs.openclaw.ai/channels/qq

## License

MIT
