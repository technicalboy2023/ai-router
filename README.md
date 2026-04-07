<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6366f1,100:8b5cf6&height=200&section=header&text=Universal%20AI%20Router&fontSize=52&fontColor=ffffff&fontAlignY=38&desc=One%20Endpoint.%20Every%20AI%20Model.%20Zero%20Vendor%20Lock-in.&descAlignY=60&descColor=c4b5fd" width="100%" />

<br/>

[![Version](https://img.shields.io/badge/version-1.0.0-6366f1?style=for-the-badge)](https://github.com/technicalboy2023/ai-router)
[![Node.js](https://img.shields.io/badge/Node.js-LTS%20%28v20%2B%29-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-a855f7?style=for-the-badge)](LICENSE)
[![OpenAI Compatible](https://img.shields.io/badge/OpenAI-Compatible-412991?style=for-the-badge&logo=openai&logoColor=white)](https://platform.openai.com/docs/api-reference)
[![Anthropic Compatible](https://img.shields.io/badge/Anthropic-Compatible-d97706?style=for-the-badge&logo=anthropic&logoColor=white)](https://docs.anthropic.com/en/api/messages)
[![ESM](https://img.shields.io/badge/ESM-Native%20Modules-f59e0b?style=for-the-badge&logo=javascript&logoColor=white)](https://nodejs.org/api/esm.html)
[![GitHub Stars](https://img.shields.io/github/stars/technicalboy2023/ai-router?style=for-the-badge&color=f59e0b&logo=github)](https://github.com/technicalboy2023/ai-router/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/technicalboy2023/ai-router?style=for-the-badge&color=6366f1&logo=github)](https://github.com/technicalboy2023/ai-router/network/members)

<br/>

> **Production-grade, open-source AI gateway — unifying Groq, Gemini, OpenRouter, and Ollama behind a single OpenAI-compatible + Anthropic-compatible endpoint. Smart failover, multi-key rotation, response caching, 4 routing strategies, and a powerful CLI — all in one.**

<br/>

[🚀 Quick Start](#-installation) · [⚙️ Configuration](#-configuration) · [🌐 API Reference](#-api-endpoints) · [💻 Usage](#-usage-examples) · [🖥️ CLI](#️-cli-reference) · [🤝 Contributing](#-contributing)

</div>

---

## 🤔 The Problem It Solves

Building production AI apps is painful:

- 💸 **Rate limits** kill your app at peak traffic
- 🔑 **One API key** = single point of failure
- 🔀 **Different SDKs** per provider = messy codebase
- 💀 **No fallback** when Groq or Gemini goes down
- 💰 **Redundant API costs** for repeated prompts

**Universal AI Router eliminates all of this.** It's a self-hosted AI gateway that sits between your app and every major LLM provider. One endpoint, one format, infinite resilience — built for developers who run real workloads.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔁 **OpenAI-Compatible API** | Drop-in replacement at `/v1/chat/completions` — zero SDK changes |
| 🤖 **Anthropic-Compatible API** | Full `/v1/messages` endpoint — works with Claude Code, Anthropic SDKs |
| ⚡ **Smart Failover** | Automatic provider switching on failure with exponential backoff |
| 🔑 **Multi-Key Rotation** | Add unlimited keys per provider — health-scored rotation bypasses rate limits |
| 🧠 **Response Caching** | In-memory TTL cache — same prompt costs zero tokens the second time |
| 🎯 **4 Routing Strategies** | `model-based`, `priority`, `latency-aware`, `round-robin` — pick your strategy |
| 🌙 **Background Daemon** | Runs as a persistent background process — close terminal, router stays alive |
| 🔀 **4 Provider Support** | Groq · Gemini · OpenRouter · Ollama — all unified |
| 📊 **Live Metrics & Usage** | `/metrics`, `/usage`, `/health` endpoints with per-key telemetry |
| 🛡️ **Auth & Rate Limiting** | Token-based auth + sliding-window IP rate limiter built-in |
| 🔧 **Admin API** | Reset cooldowns & clear cache via authenticated admin endpoints |
| 🌊 **Streaming SSE** | Full streaming support — responses pipe directly to your client |
| 🛠️ **Tool Call Support** | OpenAI function calling / tool use — handled natively |
| 🖥️ **Powerful Global CLI** | `init`, `start`, `stop`, `restart`, `status`, `remove` — full lifecycle management |
| ⚙️ **Multi-Router Support** | Run multiple named routers on different ports simultaneously |
| 🔌 **n8n / Make / Zapier Ready** | Works with any OpenAI-compatible no-code platform |

---

## 🛠 Tech Stack

![Node.js](https://img.shields.io/badge/Node.js-LTS-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-4.x-000000?style=flat-square&logo=express&logoColor=white)
![ESM](https://img.shields.io/badge/ES%20Modules-Native-f59e0b?style=flat-square&logo=javascript&logoColor=white)
![Pino](https://img.shields.io/badge/Pino-Fast%20Logger-green?style=flat-square)
![Undici](https://img.shields.io/badge/Undici-HTTP%20Client-6366f1?style=flat-square)
![Zod](https://img.shields.io/badge/Zod-Schema%20Validation-3068b7?style=flat-square)
![Commander](https://img.shields.io/badge/Commander.js-CLI-red?style=flat-square)
![Vitest](https://img.shields.io/badge/Vitest-Testing-729b1a?style=flat-square)
![Groq](https://img.shields.io/badge/Groq-API-F55036?style=flat-square)
![Google Gemini](https://img.shields.io/badge/Google-Gemini-4285F4?style=flat-square&logo=google&logoColor=white)
![OpenRouter](https://img.shields.io/badge/OpenRouter-API-6366f1?style=flat-square)
![Ollama](https://img.shields.io/badge/Ollama-Local%20LLMs-black?style=flat-square)

---

## 📦 Installation

---

### 🖥️ Option A — Local Machine (Windows / macOS)

> **Requirement:** Node.js LTS (v20+) — [Download here](https://nodejs.org)

```bash
# 1. Clone the repository
git clone https://github.com/technicalboy2023/ai-router.git
cd ai-router

# 2. Install dependencies
npm install

# 3. Register the global CLI command
npm link
```

> ✅ `ai-router` command is now available globally in your terminal.

---

### 🐧 Option B — Linux VPS (Ubuntu 22.04) — Recommended for Production

> Perfect for 24/7 hosting on Linode, DigitalOcean, Vultr, Hetzner, Contabo, etc.

#### Step 1 — System Update & Dependencies

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl
```

#### Step 2 — Install Node.js LTS (via NodeSource)

```bash
# Add NodeSource LTS repo
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify
node -v    # v22.x.x or latest LTS
npm -v
```

#### Step 3 — Clone & Install

```bash
git clone https://github.com/technicalboy2023/ai-router.git
cd ai-router
npm install
sudo npm link
```

#### Step 4 — Open Firewall Port

```bash
sudo ufw allow 8000/tcp
sudo ufw reload
sudo ufw status
```

#### Step 5 — Run as Background Daemon (PM2)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the router
pm2 start npm --name "ai-router" -- run dev

# Save process list
pm2 save

# Enable auto-start on reboot (run the command PM2 outputs!)
pm2 startup systemd

# Verify
pm2 status
pm2 logs ai-router
```

> ✅ Router running at `http://YOUR_VPS_IP:8000` — **survives reboots automatically!**

#### Useful PM2 Commands

```bash
pm2 status                  # Check all running processes
pm2 logs ai-router          # Stream live logs
pm2 restart ai-router       # Restart after config changes
pm2 stop ai-router          # Stop the router
pm2 delete ai-router        # Remove from PM2
```

---

## ⚙️ Configuration

### Step 1 — Create `.env` File

```env
# ── Groq (add multiple keys for rotation) ─────────────────
GROQ_KEY_1=gsk_your_first_groq_key
GROQ_KEY_2=gsk_your_second_groq_key

# ── Google Gemini ──────────────────────────────────────────
GEMINI_KEY_1=AIzaSy_your_gemini_key

# ── OpenRouter ────────────────────────────────────────────
OPENROUTER_KEY_1=sk-or-v1-your_key
OPENROUTER_KEY_2=sk-or-v1-your_second_key

# ── Security ──────────────────────────────────────────────
AUTH_TOKEN=my_super_secret_token
ADMIN_TOKEN=my_admin_secret_token
```

> ⚠️ **Never commit `.env` to Git.** Add it to `.gitignore`.

---

### Step 2 — Tune `config/default.json`

```json
{
  "name": "default",
  "port": 8000,
  "host": "0.0.0.0",

  "routing": {
    "strategy": "model-based",
    "providerOrder": ["groq", "openrouter", "gemini", "ollama"],
    "modelMapping": {
      "llama*":   "groq",
      "mixtral*": "groq",
      "gemma*":   "groq",
      "gemini*":  "gemini",
      "gpt*":     "openrouter"
    }
  },

  "fallback": {
    "providers": ["groq", "openrouter", "gemini", "ollama"],
    "maxRetries": 4,
    "backoff": { "initial": 500, "factor": 2, "max": 16000 }
  },

  "cache":     { "enabled": true, "ttl": 30, "maxSize": 512 },
  "auth":      { "enabled": true, "tokens": ["my_super_secret_token"], "adminTokens": ["my_admin_secret_token"] },
  "rateLimit": { "enabled": true, "windowMs": 60000, "maxRequests": 100 },
  "logging":   { "level": "info", "file": "logs/gateway.log", "console": true }
}
```

| Key | Description |
|---|---|
| `routing.strategy` | `model-based` · `priority` · `latency-aware` · `round-robin` |
| `routing.modelMapping` | Glob patterns → provider (`"llama*": "groq"`) |
| `fallback.maxRetries` | Provider switches before giving up (default: 4) |
| `fallback.backoff` | Exponential backoff in ms (initial → max) |
| `cache.ttl` | Cache TTL in minutes |
| `auth.enabled` | Toggle Bearer token authentication |
| `rateLimit.windowMs` | Sliding window duration in ms |

---

## 🚀 Start the Router

```bash
# Development — foreground with live logs
npm run dev

# ✅ Router live at → http://localhost:8000
```

```bash
# Production — named instance in background
ai-router start myRouter -c config/default.json
```

---

## ➕ Adding a New Router

You can run **multiple routers simultaneously** on the same server — each on a different port, with its own config, auth token, and provider priority.

### Step 1 — Create a new config file

Copy `config/default.json` and give it a new name:

```bash
cp config/default.json config/myrouter.json
```

### Step 2 — Edit the new config file

Open `config/myrouter.json` and change the following values:

#### 🔴 Mandatory Changes (Must Edit — or router will crash / conflict)

| Field | Where | What to Change |
|---|---|---|
| `"name"` | Top level | Change to a unique name e.g. `"myrouter"` |
| `"port"` | Top level | Change to a **different port** e.g. `8001`, `8080` |
| `"logging.file"` | `logging` block | Change to a new log file e.g. `"logs/myrouter.log"` |

> ⚠️ **Two routers cannot share the same port.** If they do, the second one will crash with "Port already in use".

#### 🟢 Optional Changes (Only if you want different behavior)

| Field | Where | Why You'd Change It |
|---|---|---|
| `"auth.tokens"` | `auth` block | Give this router a separate API password |
| `"routing.providerOrder"` | `routing` block | Prioritise a different provider first (e.g. `["gemini", "openrouter", "groq", "ollama"]`) |
| `"fallback.providers"` | `fallback` block | Control which providers act as fallbacks |
| `"rateLimit.maxRequests"` | `rateLimit` block | Set a higher/lower request cap for this router |

#### Example: Minimal new router config

```json
{
  "name": "myrouter",
  "port": 8001,
  "host": "0.0.0.0",

  "routing": {
    "strategy": "model-based",
    "providerOrder": ["openrouter", "gemini", "groq", "ollama"]
  },

  "fallback": {
    "providers": ["openrouter", "gemini", "groq", "ollama"],
    "maxRetries": 4,
    "backoff": { "initial": 500, "factor": 2, "max": 16000 }
  },

  "cache":     { "enabled": true, "ttl": 30, "maxSize": 512 },
  "auth":      { "enabled": true, "tokens": ["my_router2_token"], "adminTokens": ["my_router2_admin"] },
  "rateLimit": { "enabled": true, "windowMs": 60000, "maxRequests": 100 },
  "logging":   { "level": "info", "file": "logs/myrouter.log", "console": true }
}
```

### Step 3 — Start the new router

```bash
# Open firewall for the new port first (Linux VPS only)
sudo ufw allow 8001/tcp

# Start the new router
ai-router start myrouter -c config/myrouter.json
```

> ✅ Now both routers are running: **`:8000`** (default) and **`:8001`** (myrouter) — completely independent.

---

## 🌐 API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/chat/completions` | User | Main LLM endpoint — OpenAI-compatible |
| `POST` | `/v1/messages` | User | Anthropic Messages API — Claude Code compatible |
| `POST` | `/v1/messages/count_tokens` | User | Token estimation — Claude Code compatible |
| `POST` | `/v1/embeddings` | User | OpenAI-compatible text embeddings endpoint |
| `GET` | `/v1/models` | User | List all models across all providers |
| `GET` | `/health` | None | Liveness probe — provider & key summary |
| `GET` | `/metrics` | None | Per-key telemetry — requests, errors, tokens, latency |
| `GET` | `/usage` | None | Anonymized per-key usage counters |
| `GET` | `/router/status` | None | Routing engine status |
| `POST` | `/admin/reset-cooldowns` | Admin | Reset all rate-limited/cooled-down keys |
| `POST` | `/admin/cache/clear` | Admin | Flush the response cache |

---

## 💻 Usage Examples

### 🐍 Python (openai library)

```python
import openai

client = openai.OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="my_super_secret_token"
)

response = client.chat.completions.create(
    model="llama3-8b-8192",
    messages=[{"role": "user", "content": "Explain neural networks simply."}]
)
print(response.choices[0].message.content)
```

### 🌊 Streaming (Python)

```python
stream = client.chat.completions.create(
    model="gemini-1.5-flash",
    messages=[{"role": "user", "content": "Write a poem about space."}],
    stream=True
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

### 🖥️ cURL

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my_super_secret_token" \
  -d '{"model": "openrouter/auto", "messages": [{"role": "user", "content": "Hello!"}]}'
```

### 📊 Health Check

```bash
curl http://localhost:8000/health
```

### 🤖 Claude Code Setup

The router fully supports Claude Code via the `/v1/messages` endpoint. Configure it:

```bash
# Set your router as the Anthropic API base URL
export ANTHROPIC_BASE_URL="http://YOUR_VPS_IP:8000"
export ANTHROPIC_API_KEY="your-router-auth-token"
```

Or add to your shell config (`~/.bashrc`, `~/.zshrc`) for persistence:

```bash
echo 'export ANTHROPIC_BASE_URL="http://YOUR_VPS_IP:8000"' >> ~/.bashrc
echo 'export ANTHROPIC_API_KEY="your-router-auth-token"' >> ~/.bashrc
source ~/.bashrc
```

Now launch Claude Code normally — it will route through your AI Router with full fallback support.

### 🤖 Anthropic SDK (Python)

```python
import anthropic

client = anthropic.Anthropic(
    base_url="http://localhost:8000",
    api_key="my_super_secret_token"
)

message = client.messages.create(
    model="openrouter/auto",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Explain quantum computing simply."}]
)
print(message.content[0].text)
```

### 🤖 Anthropic cURL (/v1/messages)

```bash
curl -X POST http://localhost:8000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: my_super_secret_token" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "openrouter/auto",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### 🔗 n8n / Make / Zapier

- **URL:** `http://YOUR_VPS_IP:8000/v1/chat/completions`
- **Method:** `POST`
- **Header:** `Authorization: Bearer my_super_secret_token`
- **Body:** Standard OpenAI JSON payload

> Works natively with n8n's **OpenAI node** — just change the base URL.

---

## 🖥️ CLI Reference

```bash
# Initialize a new named router config
ai-router init myRouter --port 8000

# Start a named router (background)
ai-router start myRouter -c config/myRouter.json

# Start ALL routers defined in config/
ai-router start-all

# Check status of all running routers
ai-router status

# Stream live logs
ai-router logs myRouter

# Restart a router (pick up config changes)
ai-router restart myRouter

# Stop a specific router
ai-router stop myRouter

# Stop ALL running routers
ai-router stop-all

# Remove a router config
ai-router remove myRouter
```

---

## 🎯 Routing Strategies

| Strategy | How It Works | Best For |
|---|---|---|
| `model-based` | Routes by model name glob patterns | Predictable provider assignment |
| `priority` | Tries providers in `providerOrder` sequence | Simple primary + fallback setup |
| `latency-aware` | Prefers provider with lowest avg response time | Latency-sensitive apps |
| `round-robin` | Distributes evenly across all providers | Load balancing |

---

## 📁 Project Structure

```
ai-router/
│
├── bin/
│   └── ai-router.js              # Global CLI entrypoint
│
├── config/
│   └── default.json              # Full router configuration
│
├── src/
│   ├── index.js                  # Main export
│   ├── worker.js                 # Dev server entry (npm run dev)
│   │
│   ├── cli/
│   │   ├── orchestrator.js       # PM2 process manager wrapper
│   │   └── commands/             # init, start, startAll, stop, stopAll,
│   │                             # restart, status, logs, remove
│   ├── config/
│   │   ├── loader.js             # Config parser & merger
│   │   └── schema.js             # Zod validation schema
│   │
│   ├── providers/
│   │   ├── BaseProvider.js       # Abstract provider class
│   │   ├── ProviderRegistry.js   # Provider registry & lookup
│   │   ├── GroqProvider.js       # Groq
│   │   ├── GeminiProvider.js     # Google Gemini
│   │   ├── OpenRouterProvider.js # OpenRouter
│   │   └── OllamaProvider.js     # Ollama (local)
│   │
│   ├── router_core/
│   │   ├── KeyRegistry.js        # Per-provider key pool
│   │   ├── KeyHealth.js          # Health scoring per key
│   │   ├── ResponseCache.js      # In-memory TTL cache
│   │   └── UsageStore.js         # Usage counter persistence
│   │
│   ├── server/
│   │   ├── app.js                # Express app bootstrap
│   │   ├── middleware/           # auth, cors, rateLimiter,
│   │   │                         # errorHandler, requestId
│   │   └── routes/               # chatCompletions, messages, models,
│   │                             # health, metrics, usage, routerStatus, admin
│   └── services/
│       ├── RoutingEngine.js      # 4-strategy routing logic
│       ├── FallbackEngine.js     # Retry + failover
│       ├── KeyManager.js         # Key selection & rotation
│       ├── ToolCallHandler.js    # OpenAI tool/function calls
│       ├── AnthropicTranslator.js # Anthropic ↔ OpenAI format conversion
│       ├── ResponseNormalizer.js # Unified response format
│       └── ErrorNormalizer.js    # Unified error format
│
├── .env                          # ⚠️ Your keys (never commit!)
├── .env.example                  # Template for .env
├── package.json
└── README.md
```

---

## 🔄 Updating the Router

After making changes locally (or when a new version is available on GitHub), follow these steps to update the router on your VPS or cloud platform.

### Option A — VPS (PM2 + Git)

```bash
# 1. SSH into your VPS
ssh user@YOUR_VPS_IP

# 2. Navigate to the project directory
cd ~/ai-router

# 3. Pull the latest changes from GitHub
git pull origin main

# 4. Install any new/updated dependencies
npm install

# 5. Restart all running routers to pick up changes
pm2 restart all

# 6. Verify everything is running
pm2 status
pm2 logs ai-router --lines 20
```

> 💡 **Tip:** Your `.env` and `config/*.json` files won't be overwritten by `git pull` — they're either gitignored or only yours.

### Option B — Render / Railway / Cloud Platforms

If your router is deployed on **Render**, **Railway**, or similar:

1. **Push your changes** to GitHub:
   ```bash
   git add .
   git commit -m "fix: update router logic"
   git push origin main
   ```
2. **Auto-deploy:** Most cloud platforms auto-detect the push and redeploy automatically.
3. **Manual deploy:** If auto-deploy is off, go to your platform dashboard → click **"Manual Deploy"** → select the latest commit.

> ✅ No SSH needed — cloud platforms handle the restart for you.

### Option C — Quick Config-Only Update (No Code Changes)

If you just edited `config/default.json` or `.env` on the VPS directly:

```bash
# Just restart — no git pull needed
pm2 restart ai-router

# Or restart a specific named router
pm2 restart myrouter
```

---

## 🗑️ Complete Uninstall & Cleanup

To fully remove the AI Router from your system — **including all processes, configs, logs, and the CLI command.**

### Step 1 — Stop & Remove All Router Processes

```bash
# Stop all running routers
pm2 stop all

# Delete all router processes from PM2
pm2 delete all

# Remove PM2 startup script (optional — if you don't use PM2 for anything else)
pm2 unstartup systemd
pm2 save --force
```

### Step 2 — Unlink the Global CLI Command

```bash
# Navigate to the project directory
cd ~/ai-router

# Remove the global 'ai-router' command
sudo npm unlink
```

### Step 3 — Delete the Project Files

```bash
# Go back to home directory
cd ~

# Delete the entire project folder
rm -rf ai-router
```

### Step 4 — Clean Up Remaining Data (Optional)

```bash
# Remove PM2 logs related to ai-router
pm2 flush

# Close the firewall port (if you opened one)
sudo ufw delete allow 8000/tcp
sudo ufw delete allow 8001/tcp   # if you had a second router
sudo ufw reload
```

### Step 5 — Verify Everything Is Gone

```bash
# Should return "command not found"
ai-router status

# Should show no processes
pm2 status

# Should show the folder no longer exists
ls ~/ai-router
```

> ✅ **That's it — your system is 100% clean.** No leftover configs, daemons, or orphan processes.

---

## 🤝 Contributing

All contributions welcome!

```bash
# Fork + clone
git clone https://github.com/technicalboy2023/ai-router.git
cd ai-router

# Create feature branch
git checkout -b feature/add-mistral-provider

# Run tests
npm test

# Commit + push + open PR
git commit -m "feat: add Mistral AI provider"
git push origin feature/add-mistral-provider
```

**Good first contributions:**
- 🔌 New provider adapter (Mistral, Cohere, Together AI, Anthropic)
- 📊 Web dashboard UI for metrics
- 🐳 Docker / docker-compose setup
- 🧪 Test coverage improvements
- 📝 Docs & usage examples

---

## 🛡 License

MIT License — free for personal and commercial use. See [`LICENSE`](LICENSE) for full details.

---

## 👨‍💻 Author

<div align="center">

**Built with ❤️ by [AMAN](https://github.com/technicalboy2023)**

[![GitHub](https://img.shields.io/badge/GitHub-@technicalboy2023-181717?style=for-the-badge&logo=github)](https://github.com/technicalboy2023)

*Self-hosted infrastructure enthusiast. Building open-source tools for AI developers who refuse vendor lock-in.*

</div>

---

## ⭐ Support the Project

If this saved you time, money, or debugging pain — a star means everything.

<div align="center">

[![Star on GitHub](https://img.shields.io/github/stars/technicalboy2023/ai-router?style=social)](https://github.com/technicalboy2023/ai-router)

**⭐ Star · 🍴 Fork · 📢 Share**

*Every star helps more developers discover this project. Thank you!*

</div>

---

## 🔍 Keywords

`ai gateway` · `openai proxy` · `llm router` · `groq api` · `google gemini` · `openrouter` · `ollama` · `ai failover` · `api key rotation` · `self-hosted ai` · `open source llm` · `n8n ai` · `ai rate limit bypass` · `openai compatible` · `local ai server` · `llm proxy` · `multi-provider ai` · `ai load balancer`

---

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:8b5cf6,100:6366f1&height=100&section=footer" width="100%" />
</div>