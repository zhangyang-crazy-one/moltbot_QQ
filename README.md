# @moltbot/qq

QQ channel plugin for Clawdbot (OneBot 11 client).

## 安装（本地仓库，pnpm，推荐）

前置条件：
- 已在仓库根目录执行 `pnpm install`
- OneBot 11 后端已启动（示例：LuckyLilliaBot HTTP 3000 / WS 3001）

步骤：

```bash
# 1) 注册插件（link 模式，不复制文件，适合开发）
pnpm clawdbot plugins install --link .

# 2) 确认插件启用（可选）
pnpm clawdbot plugins list

# 3) 重启 gateway 让配置生效
pnpm clawdbot gateway
```

> 若你是全局安装的 CLI，可把 `pnpm clawdbot` 替换为 `clawdbot`。

## 概述

此插件在 Clawdbot 内实现 OneBot 11 **客户端**，用于连接已经运行的 QQ 后端服务。
QQ 协议与登录由外部 OneBot 11 后端负责，Clawdbot 只负责消息收发与安全策略控制。

功能状态：

- 私聊 / 群聊 ✅
- CQ 码 string 与 segment array ✅
- 群聊默认 requireMention=true ✅
- DM 配对/allowlist ✅
- 目录查询（好友/群列表）✅

## 连接方式（当前支持）

| 方式 | 说明 | 端口示例 |
|------|------|----------|
| `ws` | 正向 WebSocket（/api + /event） | 127.0.0.1:3001 |
| `http` | HTTP actions + SSE 事件（/_events） | 127.0.0.1:3000 |

> `ws-reverse` 与 `http-post` 暂未支持。

## Clawdbot 配置

默认配置文件：`~/.clawdbot/clawdbot.json`（支持 JSON5，但下方示例均为严格 JSON）。

### 插件启用（未使用 CLI 安装时才需要）

```json
{
  "plugins": {
    "entries": {
      "qq": {
        "enabled": true
      }
    }
  }
}
```

Clawdbot 配置中使用 `channels.qq`。你可以放在顶层（单账号），也可以使用
`channels.qq.accounts.<id>` 做多账号。

### 最小配置（单账号）

本地 LuckyLilliaBot 默认端口（HTTP 3000 / WS 3001）：

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
      "dmPolicy": "pairing",
      "allowFrom": ["*"]
    }
  }
}
```

WebSocket 连接示例：

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
      "groupPolicy": "allowlist",
      "groupAllowFrom": ["group:123456789"],
      "requireMention": true
    }
  }
}
```

### 多账号配置（advanced）

```json
{
  "channels": {
    "qq": {
      "enabled": true,
      "defaultAccount": "default",
      "accounts": {
        "default": {
          "name": "LLBot-HTTP",
          "connection": {
            "type": "http",
            "host": "127.0.0.1",
            "port": 3000,
            "token": "optional-token"
          }
        },
        "wsBot": {
          "name": "LLBot-WS",
          "connection": {
            "type": "ws",
            "host": "127.0.0.1",
            "port": 3001
          }
        }
      }
    }
  }
}
```

### 连接字段说明

- `connection.type`: `http` 或 `ws`
- `connection.host` / `connection.port`: OneBot 11 服务地址
- `connection.token`：如果后端配置了 token，填在这里（会通过 header + query 发送）
- `connection.messageFormat`: `array` 或 `string`（默认 `array`）
- `connection.reportSelfMessage`: 是否处理 `message_sent` 事件
- `connection.reportOfflineMessage`: 是否接收离线消息事件

### 安全策略

- `dmPolicy`: `pairing`（默认）、`allowlist`、`open`、`disabled`
- `allowFrom`: DM allowlist（`"*"` 表示全部允许）
- `groupPolicy`: `allowlist`（默认）、`open`、`disabled`
- `groupAllowFrom`: 群 allowlist，格式为 `group:<id>`
- `requireMention`: 群聊是否必须 @ 机器人（默认 `true`）

> 配置变更后请重启 gateway。

### 配对模式（pairing）

当 `dmPolicy: "pairing"` 时，首次私聊会收到验证码，需手动放行：

```bash
pnpm clawdbot pairing list qq
pnpm clawdbot pairing approve qq <code>
```

## 目录结构

```
.
├── index.ts                  # 插件入口
├── package.json              # 插件元数据
├── README.md                 # 本文档
└── src/
    ├── channel.ts            # ChannelPlugin 定义
    ├── runtime.ts            # 运行时初始化
    ├── types.ts              # 类型定义
    ├── config.ts             # 配置解析
    ├── config-schema.ts      # Zod schema
    ├── adapter.ts            # OneBot 11 client (ws/http)
    ├── inbound.ts            # 入站处理
    ├── outbound.ts           # 出站处理
    ├── send.ts               # OB11 send helpers
    ├── cqcode.ts             # CQ 码编解码
    └── message-utils.ts      # OB11 message 解析
```

## 参考资料

- LuckyLilliaBot: <https://github.com/LLOneBot/LuckyLilliaBot>
- OneBot 11 规范: <https://github.com/botuniverse/onebot-11>

## 文档

完整说明见：https://docs.clawd.bot/channels/qq
