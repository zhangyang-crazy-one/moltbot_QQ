# @moltbot/qq

QQ channel plugin for Moltbot (OneBot 11 client).

## Features

- ✅ **Private & Group Chat** - Full support for DM and group messaging
- ✅ **Image Support** - Images saved locally to avoid token limits, file paths passed to AI
- ✅ **CQ Code Support** - String and segment array formats
- ✅ **Multi-Account** - Support multiple QQ accounts
- ✅ **Security Policies** - Pairing, allowlist, and group controls
- ✅ **Directory Queries** - Friend and group list queries

## Image Handling

This plugin handles images efficiently to avoid AI token limits:

- **Local Storage**: Images are saved to `/tmp/qq-images/` (or custom path via `QQ_IMAGE_DIR` env)
- **Path References**: Only local file paths are sent to AI, not base64 data
- **Format**: Messages show `[IMAGE: /tmp/qq-images/qq_1234567890_abc123.jpg]`
- **Benefits**: 
  - No more "token limit exceeded" errors from large base64 payloads
  - Images can be read using the `image` tool with the file path
  - Efficient storage and reuse

## Installation

### Prerequisites

- OneBot 11 backend running (e.g., LLOneBot, NapCat, go-cqhttp)
- Moltbot gateway installed

### Install Plugin

```bash
# Install from npm (when published)
moltbot plugins install @moltbot/qq

# Or install from local source (development)
cd /path/to/moltbot/extensions/qq
moltbot plugins install --link .

# Restart gateway
moltbot gateway restart
```

## Configuration

Edit `~/.moltbot/moltbot.json`:

### Single Account (HTTP)

```json
{
  "channels": {
    "qq": {
      "enabled": true,
      "connection": {
        "type": "http",
        "host": "127.0.0.1",
        "port": 3000
      },
      "dmPolicy": "open",
      "allowFrom": ["user:YOUR_QQ_ID"]
    }
  }
}
```

### Single Account (WebSocket)

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
      "groupPolicy": "allowlist",
      "groupAllowFrom": ["group:GROUP_ID"],
      "requireMention": true
    }
  }
}
```

### Multi-Account

```json
{
  "channels": {
    "qq": {
      "enabled": true,
      "defaultAccount": "bot1",
      "accounts": {
        "bot1": {
          "name": "Main Bot",
          "connection": {
            "type": "http",
            "host": "127.0.0.1",
            "port": 3000
          }
        },
        "bot2": {
          "name": "Secondary Bot", 
          "connection": {
            "type": "ws",
            "host": "127.0.0.1",
            "port": 3002
          }
        }
      }
    }
  }
}
```

### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `connection.type` | `http` \| `ws` | Connection protocol |
| `connection.host` | string | OneBot server host |
| `connection.port` | number | OneBot server port |
| `connection.token` | string | Optional auth token |
| `dmPolicy` | `pairing` \| `allowlist` \| `open` \| `disabled` | DM handling mode |
| `allowFrom` | string[] | Allowed QQ IDs (use `"*"` for all) |
| `groupPolicy` | `allowlist` \| `open` \| `disabled` | Group handling mode |
| `groupAllowFrom` | string[] | Allowed groups (format: `group:ID`) |
| `requireMention` | boolean | Require @mention in groups |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `QQ_IMAGE_DIR` | `/tmp/qq-images` | Directory for saved images |

## Connection Types

| Type | Description | Port Example |
|------|-------------|--------------|
| `http` | HTTP API + SSE events | 127.0.0.1:3000 |
| `ws` | WebSocket (/api + /event) | 127.0.0.1:3001 |

## Security Policies

### DM Policy (`dmPolicy`)

- **`pairing`** (default): New users must be approved via pairing code
- **`allowlist`**: Only users in `allowFrom` can message
- **`open`**: Accept all DMs
- **`disabled`**: Reject all DMs

### Pairing Mode

When using `dmPolicy: "pairing"`, approve users:

```bash
moltbot pairing list qq
moltbot pairing approve qq <code>
```

## Project Structure

```
extensions/qq/
├── index.ts              # Plugin entry
├── package.json          # Plugin metadata
├── README.md             # This file
├── src/
│   ├── adapter.ts        # OneBot 11 client (ws/http)
│   ├── channel.ts        # ChannelPlugin implementation
│   ├── config.ts         # Config parsing
│   ├── cqcode.ts         # CQ code encode/decode
│   ├── inbound.ts        # Message receiving
│   ├── message-utils.ts  # Message parsing & image handling
│   ├── outbound.ts       # Message sending
│   ├── send.ts           # OneBot send helpers
│   └── types.ts          # TypeScript definitions
└── dist/                 # Compiled JavaScript
```

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode
npm run dev

# Link for local development
moltbot plugins install --link .
```

## OneBot 11 Backends

Compatible with any OneBot 11 implementation:

- [LLOneBot](https://github.com/LLOneBot/LLOneBot) - Recommended
- [NapCat](https://github.com/NapNeko/NapCatQQ)
- [go-cqhttp](https://github.com/Mrs4s/go-cqhttp)

## References

- OneBot 11 Specification: https://github.com/botuniverse/onebot-11
- Moltbot Documentation: https://docs.molt.bot/channels/qq

## License

MIT
