# moltbot_qq

基于 OneBot 11 的 QQ 频道插件，适用于 OpenClaw。

## 安装

### 前置条件

- 已启动 OneBot 11 后端（如 LLOneBot / napcat / go-cqhttp）
- 已安装并配置 OpenClaw

### 快速开始

```bash
# 克隆并安装依赖
cd moltbot_qq
pnpm install

# 链接到 OpenClaw（在 OpenClaw 根目录运行）
cd /path/to/openclaw
pnpm install --filter ./extensions/qq

# 重启 Gateway
openclaw gateway restart
```

## OpenClaw 配置

默认配置文件：`~/.openclaw/openclaw.json`

### 最小配置（单账号）

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

### 多账号配置

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
            "token": "可选的token"
          }
        }
      }
    }
  }
}
```

### 连接选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `connection.type` | `ws` 或 `http` | `ws` |
| `connection.host` | OneBot 11 后端地址 | - |
| `connection.port` | OneBot 11 后端端口 | - |
| `connection.token` | 认证 token（可选） | - |
| `connection.messageFormat` | `array` 或 `string` | `array` |
| `connection.reportSelfMessage` | 是否处理 `message_sent` 事件 | `false` |

### 安全策略

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `dmPolicy` | `pairing`、`allowlist`、`open`、`disabled` | `pairing` |
| `allowFrom` | 私聊白名单（用户 ID） | - |
| `groupPolicy` | `allowlist`、`open`、`disabled` | `allowlist` |
| `groupAllowFrom` | 群聊白名单（`group:<id>`） | - |
| `requireMention` | 群聊是否需要 @ 机器人 | `true` |

## 支持的功能

### 消息类型
- ✅ 私聊消息
- ✅ 群聊消息
- ✅ 图片/语音/视频附件
- ✅ 文件附件 (PDF, DOC, ZIP 等)
- ✅ 合并转发消息
- ✅ 表情 (face)
- ✅ 戳一戳 (poke)
- ✅ JSON/XML 卡片消息

### 消息操作
- ✅ 发送消息
- ✅ 回复消息
- ✅ 撤回消息 (delete_msg)
- ✅ @提及检测
- ✅ @全体成员检测

### 安全与配置
- ✅ 配对模式 (pairing)
- ✅ 白名单过滤
- ✅ 群聊 @提及要求
- ✅ 多账号支持

## 目录结构

```
.
├── index.ts              # 插件入口
├── package.json          # 包元数据
├── README.md             # 本文档
└── src/
    ├── channel.ts        # ChannelPlugin 定义
    ├── runtime.ts        # 运行时初始化
    ├── types.ts          # 类型定义
    ├── config.ts         # 配置解析
    ├── config-schema.ts  # Zod schema
    ├── adapter.ts        # OneBot 11 客户端 (ws/http)
    ├── inbound.ts        # 入站消息处理
    ├── outbound.ts       # 出站消息处理
    ├── send.ts           # OB11 发送助手
    ├── cqcode.ts         # CQ 码编解码
    ├── message-utils.ts  # OB11 消息工具
    ├── targets.ts        # 目标解析
    └── self-sent.ts      # 自发消息检测
```

## 相关链接

- OneBot 11 规范：https://github.com/botuniverse/onebot-11
- LLOneBot：https://github.com/LLOneBot/LLOneBot
- napcat：https://github.com/Mrs4s/napcat
- OpenClaw 文档：https://docs.openclaw.ai/channels/qq

## 开源协议

MIT
