# OpenClaw on Cloudflare Workers

Run [OpenClaw](https://github.com/openclaw/openclaw) (formerly Moltbot, formerly Clawdbot) personal AI assistant in a [Cloudflare Sandbox](https://developers.cloudflare.com/sandbox/).

![moltworker architecture](./assets/logo.png)

> **Experimental:** This is a proof of concept demonstrating that OpenClaw can run in Cloudflare Sandbox. It is not officially supported and may break without notice. Use at your own risk.

## Requirements

- [Workers Paid plan](https://www.cloudflare.com/plans/developer-platform/) ($5 USD/month) — required for Cloudflare Sandbox containers
- [Kimi API key](https://platform.moonshot.cn/) — this fork uses Kimi (Moonshot AI) as the default AI provider

The following Cloudflare features used by this project have free tiers:
- Cloudflare Access (authentication)
- Browser Rendering (for browser navigation)
- R2 Storage (optional, for persistence)

## Container Cost Estimate

This project uses a `standard-1` Cloudflare Container instance (1/2 vCPU, 4 GiB memory, 8 GB disk). Below are approximate monthly costs assuming the container runs 24/7, based on [Cloudflare Containers pricing](https://developers.cloudflare.com/containers/pricing/):

| Resource | Provisioned | Monthly Usage | Included Free | Overage | Approx. Cost |
|----------|-------------|---------------|---------------|---------|--------------|
| Memory | 4 GiB | 2,920 GiB-hrs | 25 GiB-hrs | 2,895 GiB-hrs | ~$26/mo |
| CPU (at ~10% utilization) | 1/2 vCPU | ~2,190 vCPU-min | 375 vCPU-min | ~1,815 vCPU-min | ~$2/mo |
| Disk | 8 GB | 5,840 GB-hrs | 200 GB-hrs | 5,640 GB-hrs | ~$1.50/mo |
| Workers Paid plan | | | | | $5/mo |
| **Total** | | | | | **~$34.50/mo** |

Notes:
- CPU is billed on **active usage only**, not provisioned capacity. The 10% utilization estimate is a rough baseline for a lightly-used personal assistant; your actual cost will vary with usage.
- Memory and disk are billed on **provisioned capacity** for the full time the container is running.
- To reduce costs, configure `SANDBOX_SLEEP_AFTER` (e.g., `10m`) so the container sleeps when idle. A container that only runs 4 hours/day would cost roughly ~$5-6/mo in compute on top of the $5 plan fee.
- Network egress, Workers/Durable Objects requests, and logs are additional but typically minimal for personal use.
- See the [instance types table](https://developers.cloudflare.com/containers/pricing/) for other options (e.g., `lite` at 256 MiB/$0.50/mo memory or `standard-4` at 12 GiB for heavier workloads).

## What is OpenClaw?

[OpenClaw](https://github.com/openclaw/openclaw) (formerly Moltbot, formerly Clawdbot) is a personal AI assistant with a gateway architecture that connects to multiple chat platforms. Key features:

- **Control UI** - Web-based chat interface at the gateway
- **Multi-channel support** - Telegram, Discord, Slack
- **Device pairing** - Secure DM authentication requiring explicit approval
- **Persistent conversations** - Chat history and context across sessions
- **Agent runtime** - Extensible AI capabilities with workspace and skills

This project packages OpenClaw to run in a [Cloudflare Sandbox](https://developers.cloudflare.com/sandbox/) container, providing a fully managed, always-on deployment without needing to self-host. Optional R2 storage enables persistence across container restarts.

## Architecture

![moltworker architecture](./assets/architecture.png)

## Quick Start (CLI Deploy)

> **Note:** This project uses Containers, Durable Objects, R2 and Browser Rendering bindings. The "Deploy to Cloudflare" one-click button may fail with these complex bindings. **Please use the CLI steps below instead.**

### Prerequisites

1. Install [Node.js](https://nodejs.org/) (>= 18)
2. Install [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/): `npm install -g wrangler`
3. Log in to Cloudflare: `wrangler login`
4. Enable Cloudflare Containers in the [Containers dashboard](https://dash.cloudflare.com/?to=/:account/workers/containers)
5. Ensure you are on the [Workers Paid plan](https://dash.cloudflare.com/?to=/:account/workers/plans) ($5/month)

### Step 1: Clone and Install

```bash
git clone https://github.com/Digidai/openclaw.git
cd openclaw
npm install
```

### Step 2: Set Required Secrets

```bash
# Set your Kimi API key (required)
# Get your key at https://platform.moonshot.cn/
npx wrangler secret put ANTHROPIC_API_KEY
# Paste your Kimi API key when prompted

# Generate and set a gateway token (required for remote access)
# Save this token — you'll need it to access the Control UI
export MOLTBOT_GATEWAY_TOKEN=$(openssl rand -hex 32)
echo "Your gateway token: $MOLTBOT_GATEWAY_TOKEN"
echo "$MOLTBOT_GATEWAY_TOKEN" | npx wrangler secret put MOLTBOT_GATEWAY_TOKEN
```

### Step 3: Deploy

```bash
npm run deploy
```

Deployment takes a few minutes as Cloudflare builds the Docker container image.

### Step 4: Access the Control UI

After deploying, open the Control UI in your browser:

```
https://your-worker.workers.dev/?token=YOUR_GATEWAY_TOKEN
```

Replace `your-worker` with your actual worker subdomain (shown in the deploy output) and `YOUR_GATEWAY_TOKEN` with the token you generated above.

**Note:** The first request may take 1-2 minutes while the container cold-starts.

### Step 5: Set Up Admin UI and Device Pairing

> **Important:** You will not be able to use the Control UI until you complete the following steps. You MUST:
> 1. [Set up Cloudflare Access](#setting-up-the-admin-ui) to protect the admin UI
> 2. [Pair your device](#device-pairing) via the admin UI at `/_admin/`

You'll also likely want to [enable R2 storage](#persistent-storage-r2) so your paired devices and conversation history persist across container restarts (optional but recommended).

## Setting Up the Admin UI

To use the admin UI at `/_admin/` for device management, you need to:
1. Enable Cloudflare Access on your worker
2. Set the Access secrets so the worker can validate JWTs

### 1. Enable Cloudflare Access on workers.dev

The easiest way to protect your worker is using the built-in Cloudflare Access integration for workers.dev:

1. Go to the [Workers & Pages dashboard](https://dash.cloudflare.com/?to=/:account/workers-and-pages)
2. Select your Worker (e.g., `moltbot-sandbox`)
3. In **Settings**, under **Domains & Routes**, in the `workers.dev` row, click the meatballs menu (`...`)
4. Click **Enable Cloudflare Access**
5. Copy the values shown in the dialog (you'll need the AUD tag later). **Note:** The "Manage Cloudflare Access" link in the dialog may 404 — ignore it.
6. To configure who can access, go to **Zero Trust** in the Cloudflare dashboard sidebar → **Access** → **Applications**, and find your worker's application:
   - Add your email address to the allow list
   - Or configure other identity providers (Google, GitHub, etc.)
7. Copy the **Application Audience (AUD)** tag from the Access application settings. This will be your `CF_ACCESS_AUD` in Step 2 below

### 2. Set Access Secrets

After enabling Cloudflare Access, set the secrets so the worker can validate JWTs:

```bash
# Your Cloudflare Access team domain (e.g., "myteam.cloudflareaccess.com")
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN

# The Application Audience (AUD) tag from your Access application that you copied in the step above
npx wrangler secret put CF_ACCESS_AUD
```

You can find your team domain in the [Zero Trust Dashboard](https://one.dash.cloudflare.com/) under **Settings** > **Custom Pages** (it's the subdomain before `.cloudflareaccess.com`).

### 3. Redeploy

```bash
npm run deploy
```

Now visit `/_admin/` and you'll be prompted to authenticate via Cloudflare Access before accessing the admin UI.

### Alternative: Manual Access Application

If you prefer more control, you can manually create an Access application:

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Access** > **Applications**
3. Create a new **Self-hosted** application
4. Set the application domain to your Worker URL (e.g., `moltbot-sandbox.your-subdomain.workers.dev`)
5. Add paths to protect: `/_admin/*`, `/api/*`, `/debug/*`
6. Configure your desired identity providers (e.g., email OTP, Google, GitHub)
7. Copy the **Application Audience (AUD)** tag and set the secrets as shown above

### Local Development

For local development, create a `.dev.vars` file with:

```bash
DEV_MODE=true               # Skip Cloudflare Access auth + bypass device pairing
DEBUG_ROUTES=true           # Enable /debug/* routes (optional)
```

## Authentication

By default, moltbot uses **device pairing** for authentication. When a new device (browser, CLI, etc.) connects, it must be approved via the admin UI at `/_admin/`.

### Device Pairing

1. A device connects to the gateway
2. The connection is held pending until approved
3. An admin approves the device via `/_admin/`
4. The device is now paired and can connect freely

This is the most secure option as it requires explicit approval for each device.

### Gateway Token (Required)

A gateway token is required to access the Control UI when hosted remotely. Pass it as a query parameter:

```
https://your-worker.workers.dev/?token=YOUR_TOKEN
wss://your-worker.workers.dev/ws?token=YOUR_TOKEN
```

**Note:** Even with a valid token, new devices still require approval via the admin UI at `/_admin/` (see Device Pairing above).

For local development only, set `DEV_MODE=true` in `.dev.vars` to skip Cloudflare Access authentication and enable `allowInsecureAuth` (bypasses device pairing entirely).

## Persistent Storage (R2)

By default, moltbot data (configs, paired devices, conversation history) is lost when the container restarts. To enable persistent storage across sessions, configure R2:

### 1. Create R2 API Token

1. Go to **R2** > **Overview** in the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click **Manage R2 API Tokens**
3. Create a new token with **Object Read & Write** permissions
4. Select the `moltbot-data` bucket (created automatically on first deploy)
5. Copy the **Access Key ID** and **Secret Access Key**

### 2. Set Secrets

```bash
# R2 Access Key ID
npx wrangler secret put R2_ACCESS_KEY_ID

# R2 Secret Access Key
npx wrangler secret put R2_SECRET_ACCESS_KEY

# Your Cloudflare Account ID
npx wrangler secret put CF_ACCOUNT_ID
```

To find your Account ID: Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/), click the three dots menu next to your account name, and select "Copy Account ID".

### How It Works

R2 storage uses a backup/restore approach for simplicity:

**On container startup:**
- If R2 is mounted and contains backup data, it's restored to the moltbot config directory
- OpenClaw uses its default paths (no special configuration needed)

**During operation:**
- A cron job runs every 5 minutes to sync the moltbot config to R2
- You can also trigger a manual backup from the admin UI at `/_admin/`

**In the admin UI:**
- When R2 is configured, you'll see "Last backup: [timestamp]"
- Click "Backup Now" to trigger an immediate sync

Without R2 credentials, moltbot still works but uses ephemeral storage (data lost on container restart).

## Container Lifecycle

By default, the sandbox container stays alive indefinitely (`SANDBOX_SLEEP_AFTER=never`). This is recommended because cold starts take 1-2 minutes.

To reduce costs for infrequently used deployments, you can configure the container to sleep after a period of inactivity:

```bash
npx wrangler secret put SANDBOX_SLEEP_AFTER
# Enter: 10m (or 1h, 30m, etc.)
```

When the container sleeps, the next request will trigger a cold start. If you have R2 storage configured, your paired devices and data will persist across restarts.

## Admin UI

![admin ui](./assets/adminui.png)

Access the admin UI at `/_admin/` to:
- **R2 Storage Status** - Shows if R2 is configured, last backup time, and a "Backup Now" button
- **Restart Gateway** - Kill and restart the moltbot gateway process
- **Device Pairing** - View pending requests, approve devices individually or all at once, view paired devices

The admin UI requires Cloudflare Access authentication (or `DEV_MODE=true` for local development).

## Debug Endpoints

Debug endpoints are available at `/debug/*` when enabled (requires `DEBUG_ROUTES=true` and Cloudflare Access):

- `GET /debug/processes` - List all container processes
- `GET /debug/logs?id=<process_id>` - Get logs for a specific process
- `GET /debug/version` - Get container and moltbot version info

## Optional: Chat Channels

### Telegram

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npm run deploy
```

### Discord

```bash
npx wrangler secret put DISCORD_BOT_TOKEN
npm run deploy
```

### Slack

```bash
npx wrangler secret put SLACK_BOT_TOKEN
npx wrangler secret put SLACK_APP_TOKEN
npm run deploy
```

## Optional: Browser Automation (CDP)

This worker includes a Chrome DevTools Protocol (CDP) shim that enables browser automation capabilities. This allows OpenClaw to control a headless browser for tasks like web scraping, screenshots, and automated testing.

### Setup

1. Set a shared secret for authentication:

```bash
npx wrangler secret put CDP_SECRET
# Enter a secure random string
```

2. Set your worker's public URL:

```bash
npx wrangler secret put WORKER_URL
# Enter: https://your-worker.workers.dev
```

3. Redeploy:

```bash
npm run deploy
```

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /cdp/json/version` | Browser version information |
| `GET /cdp/json/list` | List available browser targets |
| `GET /cdp/json/new` | Create a new browser target |
| `WS /cdp/devtools/browser/{id}` | WebSocket connection for CDP commands |

All endpoints require authentication via the `?secret=<CDP_SECRET>` query parameter.

## Built-in Skills

The container includes pre-installed skills in `/root/clawd/skills/`:

### cloudflare-browser

Browser automation via the CDP shim. Requires `CDP_SECRET` and `WORKER_URL` to be set (see [Browser Automation](#optional-browser-automation-cdp) above).

**Scripts:**
- `screenshot.js` - Capture a screenshot of a URL
- `video.js` - Create a video from multiple URLs
- `cdp-client.js` - Reusable CDP client library

**Usage:**
```bash
# Screenshot
node /root/clawd/skills/cloudflare-browser/scripts/screenshot.js https://example.com output.png

# Video from multiple URLs
node /root/clawd/skills/cloudflare-browser/scripts/video.js "https://site1.com,https://site2.com" output.mp4 --scroll
```

See `skills/cloudflare-browser/SKILL.md` for full documentation.

## Optional: Cloudflare AI Gateway

You can route API requests through [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/) for caching, rate limiting, analytics, and cost tracking. OpenClaw has native support for Cloudflare AI Gateway as a first-class provider.

AI Gateway acts as a proxy between OpenClaw and your AI provider (e.g., Anthropic). Requests are sent to `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/anthropic` instead of directly to `api.anthropic.com`, giving you Cloudflare's analytics, caching, and rate limiting. You still need a provider API key (e.g., your Anthropic API key) — the gateway forwards it to the upstream provider.

### Setup

1. Create an AI Gateway in the [AI Gateway section](https://dash.cloudflare.com/?to=/:account/ai/ai-gateway/create-gateway) of the Cloudflare Dashboard.
2. Set the three required secrets:

```bash
# Your AI provider's API key (e.g., your Anthropic API key).
# This is passed through the gateway to the upstream provider.
npx wrangler secret put CLOUDFLARE_AI_GATEWAY_API_KEY

# Your Cloudflare account ID
npx wrangler secret put CF_AI_GATEWAY_ACCOUNT_ID

# Your AI Gateway ID (from the gateway overview page)
npx wrangler secret put CF_AI_GATEWAY_GATEWAY_ID
```

All three are required. OpenClaw constructs the gateway URL from the account ID and gateway ID, and passes the API key to the upstream provider through the gateway.

3. Redeploy:

```bash
npm run deploy
```

When Cloudflare AI Gateway is configured, it takes precedence over direct `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.

### Choosing a Model

By default, AI Gateway uses Anthropic's Claude Sonnet 4.5. To use a different model or provider, set `CF_AI_GATEWAY_MODEL` with the format `provider/model-id`:

```bash
npx wrangler secret put CF_AI_GATEWAY_MODEL
# Enter: workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast
```

This works with any [AI Gateway provider](https://developers.cloudflare.com/ai-gateway/usage/providers/):

| Provider | Example `CF_AI_GATEWAY_MODEL` value | API key is... |
|----------|-------------------------------------|---------------|
| Workers AI | `workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Cloudflare API token |
| OpenAI | `openai/gpt-4o` | OpenAI API key |
| Anthropic | `anthropic/claude-sonnet-4-5` | Anthropic API key |
| Groq | `groq/llama-3.3-70b` | Groq API key |

**Note:** `CLOUDFLARE_AI_GATEWAY_API_KEY` must match the provider you're using — it's your provider's API key, forwarded through the gateway. You can only use one provider at a time through the gateway. For multiple providers, use direct keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) alongside the gateway config.

#### Workers AI with Unified Billing

With [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/), you can use Workers AI models without a separate provider API key — Cloudflare bills you directly. Set `CLOUDFLARE_AI_GATEWAY_API_KEY` to your [AI Gateway authentication token](https://developers.cloudflare.com/ai-gateway/configuration/authentication/) (the `cf-aig-authorization` token).

### Legacy AI Gateway Configuration

The previous `AI_GATEWAY_API_KEY` + `AI_GATEWAY_BASE_URL` approach is still supported for backward compatibility but is deprecated in favor of the native configuration above.

## All Secrets Reference

| Secret | Required | Description |
|--------|----------|-------------|
| `CLOUDFLARE_AI_GATEWAY_API_KEY` | Yes* | Your AI provider's API key, passed through the gateway (e.g., your Anthropic API key). Requires `CF_AI_GATEWAY_ACCOUNT_ID` and `CF_AI_GATEWAY_GATEWAY_ID` |
| `CF_AI_GATEWAY_ACCOUNT_ID` | Yes* | Your Cloudflare account ID (used to construct the gateway URL) |
| `CF_AI_GATEWAY_GATEWAY_ID` | Yes* | Your AI Gateway ID (used to construct the gateway URL) |
| `CF_AI_GATEWAY_MODEL` | No | Override default model: `provider/model-id` (e.g. `workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast`). See [Choosing a Model](#choosing-a-model) |
| `ANTHROPIC_API_KEY` | Yes* | Direct Anthropic API key (alternative to AI Gateway) |
| `ANTHROPIC_BASE_URL` | No | Direct Anthropic API base URL |
| `OPENAI_API_KEY` | No | OpenAI API key (alternative provider) |
| `AI_GATEWAY_API_KEY` | No | Legacy AI Gateway API key (deprecated, use `CLOUDFLARE_AI_GATEWAY_API_KEY` instead) |
| `AI_GATEWAY_BASE_URL` | No | Legacy AI Gateway endpoint URL (deprecated) |
| `CF_ACCESS_TEAM_DOMAIN` | Yes* | Cloudflare Access team domain (required for admin UI) |
| `CF_ACCESS_AUD` | Yes* | Cloudflare Access application audience (required for admin UI) |
| `MOLTBOT_GATEWAY_TOKEN` | Yes | Gateway token for authentication (pass via `?token=` query param) |
| `DEV_MODE` | No | Set to `true` to skip CF Access auth + device pairing (local dev only) |
| `DEBUG_ROUTES` | No | Set to `true` to enable `/debug/*` routes |
| `SANDBOX_SLEEP_AFTER` | No | Container sleep timeout: `never` (default) or duration like `10m`, `1h` |
| `R2_ACCESS_KEY_ID` | No | R2 access key for persistent storage |
| `R2_SECRET_ACCESS_KEY` | No | R2 secret key for persistent storage |
| `CF_ACCOUNT_ID` | No | Cloudflare account ID (required for R2 storage) |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token |
| `TELEGRAM_DM_POLICY` | No | Telegram DM policy: `pairing` (default) or `open` |
| `DISCORD_BOT_TOKEN` | No | Discord bot token |
| `DISCORD_DM_POLICY` | No | Discord DM policy: `pairing` (default) or `open` |
| `SLACK_BOT_TOKEN` | No | Slack bot token |
| `SLACK_APP_TOKEN` | No | Slack app token |
| `CDP_SECRET` | No | Shared secret for CDP endpoint authentication (see [Browser Automation](#optional-browser-automation-cdp)) |
| `WORKER_URL` | No | Public URL of the worker (required for CDP) |

## Security Considerations

### Authentication Layers

OpenClaw in Cloudflare Sandbox uses multiple authentication layers:

1. **Cloudflare Access** - Protects admin routes (`/_admin/`, `/api/*`, `/debug/*`). Only authenticated users can manage devices.

2. **Gateway Token** - Required to access the Control UI. Pass via `?token=` query parameter. Keep this secret.

3. **Device Pairing** - Each device (browser, CLI, chat platform DM) must be explicitly approved via the admin UI before it can interact with the assistant. This is the default "pairing" DM policy.

## Troubleshooting

**`npm run dev` fails with an `Unauthorized` error:** You need to enable Cloudflare Containers in the [Containers dashboard](https://dash.cloudflare.com/?to=/:account/workers/containers)

**Gateway fails to start:** Check `npx wrangler secret list` and `npx wrangler tail`

**Config changes not working:** Edit the `# Build cache bust:` comment in `Dockerfile` and redeploy

**Slow first request:** Cold starts take 1-2 minutes. Subsequent requests are faster.

**R2 not mounting:** Check that all three R2 secrets are set (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CF_ACCOUNT_ID`). Note: R2 mounting only works in production, not with `wrangler dev`.

**Access denied on admin routes:** Ensure `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are set, and that your Cloudflare Access application is configured correctly.

**Devices not appearing in admin UI:** Device list commands take 10-15 seconds due to WebSocket connection overhead. Wait and refresh.

**WebSocket issues in local development:** `wrangler dev` has known limitations with WebSocket proxying through the sandbox. HTTP requests work but WebSocket connections may fail. Deploy to Cloudflare for full functionality.

## Known Issues

### Windows: Gateway fails to start with exit code 126 (permission denied)

On Windows, Git may check out shell scripts with CRLF line endings instead of LF. This causes `start-openclaw.sh` to fail with exit code 126 inside the Linux container. Ensure your repository uses LF line endings — configure Git with `git config --global core.autocrlf input` or add a `.gitattributes` file with `* text=auto eol=lf`. See [#64](https://github.com/cloudflare/moltworker/issues/64) for details.

## Links

- [OpenClaw](https://github.com/openclaw/openclaw)
- [OpenClaw Docs](https://docs.openclaw.ai/)
- [Cloudflare Sandbox Docs](https://developers.cloudflare.com/sandbox/)
- [Cloudflare Access Docs](https://developers.cloudflare.com/cloudflare-one/policies/access/)

---

# 中文部署指南

本项目是 [OpenClaw](https://github.com/openclaw/openclaw) 个人 AI 助手的 Cloudflare 部署方案。此 fork 默认使用 [Kimi (Moonshot AI)](https://platform.moonshot.cn/) 作为 AI 提供商。

## 项目简介

OpenClaw 是一个带网关架构的个人 AI 助手，支持多平台接入。本项目将其打包运行在 [Cloudflare Sandbox](https://developers.cloudflare.com/sandbox/) 容器中，无需自建服务器，由 Cloudflare 全托管。

**核心功能：**
- Web 控制台 (Control UI) 直接对话
- 多平台支持 (Telegram / Discord / Slack)
- 设备配对认证，安全可控
- 对话历史持久化 (通过 R2 存储)
- 浏览器自动化 (截图、录屏)

**架构流程：**

```
用户请求 → Cloudflare Worker → Sandbox 容器 → OpenClaw Gateway (端口 18789) → Kimi API
```

## 前置条件

| 条件 | 说明 |
|------|------|
| Node.js >= 18 | [下载地址](https://nodejs.org/) |
| Cloudflare 账号 | [注册地址](https://dash.cloudflare.com/sign-up) |
| Workers Paid 计划 | $5/月，[升级地址](https://dash.cloudflare.com/?to=/:account/workers/plans) |
| 开启 Containers 功能 | [Containers 控制台](https://dash.cloudflare.com/?to=/:account/workers/containers) |
| Kimi API Key | [Moonshot 开放平台](https://platform.moonshot.cn/) 获取 |

## 费用估算

| 资源 | 月费用（24/7 运行） |
|------|---------------------|
| Workers Paid 计划 | $5 |
| 内存 (4 GiB) | ~$26 |
| CPU (~10% 利用率) | ~$2 |
| 磁盘 (8 GB) | ~$1.50 |
| **合计** | **~$34.50/月** |

> 通过配置 `SANDBOX_SLEEP_AFTER=10m` 让容器空闲时休眠可以大幅降低成本。以每天运行 4 小时（约 122 小时/月）为例：
>
> | 资源 | 用量 | 免费额度 | 超量 | 费用 |
> |------|------|---------|------|------|
> | 内存 (4 GiB) | 488 GiB-hrs | 25 GiB-hrs | 463 GiB-hrs | ~$4.16 |
> | CPU (10% 利用率) | 366 vCPU-min | 375 vCPU-min | 0 | $0 |
> | 磁盘 (8 GB) | 976 GB-hrs | 200 GB-hrs | 776 GB-hrs | ~$0.21 |
> | Workers Paid 计划 | - | - | - | $5 |
> | **合计** | | | | **~$9.4/月** |

## 第一步：安装

```bash
# 克隆仓库
git clone https://github.com/Digidai/openclaw.git
cd openclaw

# 安装依赖
npm install

# 安装 Wrangler CLI（如果尚未安装）
npm install -g wrangler

# 登录 Cloudflare
wrangler login
# 浏览器会弹出授权页面，点击允许即可
```

## 第二步：设置必需的 Secrets

Secrets 是通过 Wrangler CLI 安全存储在 Cloudflare 上的环境变量，不会出现在代码中。

### 2.1 设置 Kimi API Key

```bash
npx wrangler secret put ANTHROPIC_API_KEY
# 提示输入时，粘贴你的 Kimi API Key
```

> API Key 获取方式：登录 [Moonshot 开放平台](https://platform.moonshot.cn/) → API Key 管理 → 创建新的 API Key

### 2.2 生成并设置 Gateway Token

Gateway Token 用于保护你的控制台访问，类似于访问密码。

```bash
# 生成一个随机 token
export MOLTBOT_GATEWAY_TOKEN=$(openssl rand -hex 32)

# 显示 token（务必保存好，后续访问控制台需要用到）
echo "你的 Gateway Token: $MOLTBOT_GATEWAY_TOKEN"

# 将 token 存储到 Cloudflare
echo "$MOLTBOT_GATEWAY_TOKEN" | npx wrangler secret put MOLTBOT_GATEWAY_TOKEN
```

## 第三步：部署

```bash
npm run deploy
```

部署过程需要几分钟，Cloudflare 会构建 Docker 镜像并启动容器。

部署成功后会显示你的 Worker URL，类似：

```
https://moltbot-sandbox.your-subdomain.workers.dev
```

## 第四步：访问控制台

在浏览器中打开：

```
https://moltbot-sandbox.your-subdomain.workers.dev/?token=你的GATEWAY_TOKEN
```

> 首次访问需要等待 1-2 分钟，这是容器冷启动的时间。后续访问会快很多。

## 第五步：配置 Admin UI (管理后台)

Admin UI 位于 `/_admin/`，用于设备管理、数据备份等。你**必须**配置 Cloudflare Access 才能使用。

### 5.1 开启 Cloudflare Access

1. 打开 [Workers & Pages 控制台](https://dash.cloudflare.com/?to=/:account/workers-and-pages)
2. 点击你的 Worker（例如 `moltbot-sandbox`）
3. 进入 **Settings** → **Domains & Routes**
4. 在 `workers.dev` 行，点击右侧的 `...` 菜单
5. 点击 **Enable Cloudflare Access**
6. 记下弹出对话框中的 AUD 值

### 5.2 配置访问策略

1. 进入 Cloudflare 左侧菜单 **Zero Trust** → **Access** → **Applications**
2. 找到你的 Worker 应用
3. 添加允许访问的邮箱地址（或配置 Google / GitHub 等身份验证）

### 5.3 设置 Access Secrets

```bash
# 设置 Team Domain（需要填写完整域名，例如: myteam.cloudflareaccess.com）
# 在 Zero Trust 控制台 → Settings → Custom Pages 中可以找到
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN

# 设置 AUD（步骤 5.1 中记下的值）
npx wrangler secret put CF_ACCESS_AUD
```

### 5.4 重新部署

```bash
npm run deploy
```

现在访问 `/_admin/` 会要求你通过 Cloudflare Access 认证。

## 第六步：设备配对

这是最后一步。控制台 UI 需要设备配对后才能正常使用。

1. 访问 `https://your-worker.workers.dev/_admin/`（需要 Cloudflare Access 认证）
2. 在 Admin UI 中查看 **Pending Requests**（待配对请求）
3. 在另一个浏览器标签中打开控制台 `/?token=YOUR_TOKEN`
4. 回到 Admin UI，点击 **Approve** 批准该设备
5. 设备配对成功，现在可以正常对话了

## 可选配置

### 持久化存储 (R2)

默认情况下，容器重启后所有数据（配对设备、对话历史等）会丢失。配置 R2 可以实现数据持久化。

```bash
# 1. 在 Cloudflare Dashboard → R2 → 管理 API Token 中创建 token
#    权限选择 Object Read & Write，选择 moltbot-data 桶

# 2. 设置 Secrets
npx wrangler secret put R2_ACCESS_KEY_ID       # 粘贴 Access Key ID
npx wrangler secret put R2_SECRET_ACCESS_KEY   # 粘贴 Secret Access Key
npx wrangler secret put CF_ACCOUNT_ID          # 粘贴 Cloudflare Account ID

# 3. 重新部署
npm run deploy
```

> Account ID 获取方式：在 [Cloudflare Dashboard](https://dash.cloudflare.com/) 首页，点击账号名旁边的 `...` 菜单 → Copy Account ID

配置后，数据每 5 分钟自动同步到 R2，也可在 Admin UI 中点击 "Backup Now" 手动备份。

### 容器休眠（降低成本）

```bash
npx wrangler secret put SANDBOX_SLEEP_AFTER
# 输入: 10m（10 分钟无活动后休眠）
```

休眠后的下次请求会触发冷启动（1-2 分钟）。配合 R2 使用，数据不会丢失。

### 聊天平台接入

**Telegram：**
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN    # BotFather 创建的 token
npm run deploy
```

**Discord：**
```bash
npx wrangler secret put DISCORD_BOT_TOKEN     # Discord 开发者后台的 token
npm run deploy
```

**Slack：**
```bash
npx wrangler secret put SLACK_BOT_TOKEN       # Slack App 的 Bot Token
npx wrangler secret put SLACK_APP_TOKEN       # Slack App 的 App Token
npm run deploy
```

### 浏览器自动化 (CDP)

启用后 OpenClaw 可以控制 headless 浏览器进行截图、录屏等操作。

```bash
npx wrangler secret put CDP_SECRET            # 输入一个随机字符串
npx wrangler secret put WORKER_URL            # 输入 https://your-worker.workers.dev
npm run deploy
```

## 本地开发

```bash
# 创建本地环境变量文件
cat > .dev.vars << 'EOF'
DEV_MODE=true
DEBUG_ROUTES=true
ANTHROPIC_API_KEY=你的Kimi_API_Key
MOLTBOT_GATEWAY_TOKEN=任意字符串
EOF

# 启动开发服务器
npm run dev
```

> `DEV_MODE=true` 会跳过 Cloudflare Access 认证和设备配对，仅用于本地开发。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动本地开发服务器 (Vite) |
| `npm run start` | 启动本地 Wrangler Dev |
| `npm run deploy` | 构建并部署到 Cloudflare |
| `npm run build` | 仅构建，不部署 |
| `npm run test` | 运行测试 |
| `npm run lint` | 代码检查 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npx wrangler secret list` | 查看已设置的 Secrets |
| `npx wrangler secret put <NAME>` | 设置一个 Secret |
| `npx wrangler tail` | 实时查看线上日志 |

## 故障排查

| 问题 | 解决方案 |
|------|----------|
| `npm run dev` 报 `Unauthorized` | 需要在 [Containers 控制台](https://dash.cloudflare.com/?to=/:account/workers/containers) 开启 Containers 功能 |
| Gateway 启动失败 | 运行 `npx wrangler secret list` 检查 Secrets，运行 `npx wrangler tail` 查看日志 |
| 首次请求很慢 | 正常现象，容器冷启动需要 1-2 分钟 |
| R2 不工作 | 确认三个 Secret 都已设置：`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`CF_ACCOUNT_ID` |
| Admin UI 报 Access Denied | 确认 `CF_ACCESS_TEAM_DOMAIN` 和 `CF_ACCESS_AUD` 已正确设置 |
| 设备列表加载慢 | WebSocket 连接需要 10-15 秒，等待后刷新 |
| 配置修改不生效 | 修改 `Dockerfile` 中的 `# Build cache bust:` 注释，然后重新部署 |
| Windows 下 Gateway 报 exit code 126 | Git 行尾符问题，运行 `git config --global core.autocrlf input`，重新克隆仓库 |

## 全部 Secrets 参考

| Secret | 必需 | 说明 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | 是 | Kimi API Key |
| `MOLTBOT_GATEWAY_TOKEN` | 是 | 控制台访问 Token |
| `CF_ACCESS_TEAM_DOMAIN` | 是* | Cloudflare Access Team Domain（Admin UI 需要） |
| `CF_ACCESS_AUD` | 是* | Cloudflare Access AUD（Admin UI 需要） |
| `R2_ACCESS_KEY_ID` | 否 | R2 存储 Access Key |
| `R2_SECRET_ACCESS_KEY` | 否 | R2 存储 Secret Key |
| `CF_ACCOUNT_ID` | 否 | Cloudflare Account ID（R2 需要） |
| `SANDBOX_SLEEP_AFTER` | 否 | 容器休眠时间，默认 `never`，可设为 `10m`、`1h` 等 |
| `TELEGRAM_BOT_TOKEN` | 否 | Telegram Bot Token |
| `TELEGRAM_DM_POLICY` | 否 | Telegram 私信策略：`pairing`（默认，需配对）或 `open`（开放） |
| `DISCORD_BOT_TOKEN` | 否 | Discord Bot Token |
| `DISCORD_DM_POLICY` | 否 | Discord 私信策略：`pairing`（默认，需配对）或 `open`（开放） |
| `SLACK_BOT_TOKEN` | 否 | Slack Bot Token |
| `SLACK_APP_TOKEN` | 否 | Slack App Token |
| `CDP_SECRET` | 否 | 浏览器自动化认证密钥 |
| `WORKER_URL` | 否 | Worker 公网 URL（浏览器自动化需要） |
| `DEV_MODE` | 否 | 设为 `true` 跳过认证（仅本地开发） |
| `DEBUG_ROUTES` | 否 | 设为 `true` 启用调试路由 |
