<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6366f1,100:8b5cf6&height=200&section=header&text=Universal%20AI%20Router&fontSize=52&fontColor=ffffff&fontAlignY=38&desc=One%20Endpoint.%20Every%20AI%20Model.%20Zero%20Vendor%20Lock-in.&descAlignY=60&descColor=c4b5fd" width="100%" />

<br/>

[![npm version](https://img.shields.io/npm/v/universal-ai-router?color=6366f1&label=npm&style=for-the-badge)](https://npmjs.com/package/universal-ai-router)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-a855f7?style=for-the-badge)](LICENSE)
[![OpenAI Compatible](https://img.shields.io/badge/OpenAI-Compatible-412991?style=for-the-badge&logo=openai&logoColor=white)](https://platform.openai.com/docs/api-reference)
[![GitHub Stars](https://img.shields.io/github/stars/technicalboy2023/ai-router?style=for-the-badge&color=f59e0b&logo=github)](https://github.com/technicalboy2023/ai-router/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/technicalboy2023/ai-router?style=for-the-badge&color=6366f1&logo=github)](https://github.com/technicalboy2023/ai-router/network/members)

<br/>

> **The open-source AI gateway that gives you smart failover, multi-key rotation, and response caching — across Groq, Gemini, Ollama & OpenRouter — through a single OpenAI-compatible endpoint.**

<br/>

[🚀 Get Started](#-installation) · [📖 Docs](#️-configuration) · [💡 Examples](#-usage-examples) · [🤝 Contributing](#-contributing)

</div>

---

## 🤔 The Problem It Solves

Building with multiple AI providers is painful. You deal with **rate limits**, **different SDKs**, **key rotation headaches**, and **zero fallback** when an API goes down.

**Universal AI Router fixes all of that in one shot.**

It sits between your app and every major AI provider — acting as a battle-tested, self-hosted AI gateway. One endpoint. One API format. Infinite resilience.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔁 **OpenAI-Compatible API** | Drop-in replacement. Use `/v1/chat/completions` — no SDK changes needed |
| ⚡ **Smart Failover** | Groq down? Gemini takes over. Automatically. Instantly. |
| 🔑 **Multi-Key Rotation** | Add 10 Groq keys, rotate them to bypass rate limits effortlessly |
| 🧠 **Response Caching** | Same prompt = zero API cost the second time. Saves money at scale |
| 🌙 **Background Daemon** | Close the terminal. The router stays alive using PM2 |
| 🔀 **Multi-Provider Support** | Groq · Gemini · Ollama · OpenRouter — all unified |
| 🛡️ **Auth Protection** | Lock your router with a secret token. No unauthorized access |
| ⚙️ **Fully Configurable** | Custom port, provider order, model mapping — all via JSON config |
| 🖥️ **Global CLI** | `ai-router start`, `stop`, `status`, `logs` — manage everything from terminal |
| 🔌 **n8n / Make / Zapier Ready** | Plug into any no-code tool that supports OpenAI-style requests |

---

## 🛠 Tech Stack

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-Backend-000000?style=flat-square&logo=express&logoColor=white)
![PM2](https://img.shields.io/badge/PM2-Process%20Manager-2B037A?style=flat-square&logo=pm2&logoColor=white)
![OpenAI SDK](https://img.shields.io/badge/OpenAI-Compatible-412991?style=flat-square&logo=openai&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-API-F55036?style=flat-square)
![Google Gemini](https://img.shields.io/badge/Google-Gemini-4285F4?style=flat-square&logo=google&logoColor=white)
![OpenRouter](https://img.shields.io/badge/OpenRouter-API-6366f1?style=flat-square)
![Ollama](https://img.shields.io/badge/Ollama-Local%20LLMs-black?style=flat-square)

---

## 📦 Installation

Choose your setup method below:

---

### 🖥️ Option A — Local Machine (Windows / macOS)

> **Requirement:** Node.js v20+ — [Download here](https://nodejs.org)

```bash
# 1. Clone the repository
git clone https://github.com/technicalboy2023/ai-router.git
cd universal-ai-router

# 2. Install dependencies
npm install

# 3. Register the global CLI command
npm link
```

> ✅ You now have access to the `ai-router` command globally in your terminal.

---

### 🐧 Option B — Linux VPS (Ubuntu 22.04) — Recommended for Production

This is the **recommended setup** if you want to run the router 24/7 on a VPS (Linode, DigitalOcean, Vultr, Hetzner, etc.)

#### Step 1 — System Update & Dependencies

```bash
# Update package list
sudo apt update && sudo apt upgrade -y

# Install Git and curl
sudo apt install -y git curl
```

#### Step 2 — Install Node.js v20 (via NodeSource)

```bash
# Add NodeSource repo for Node.js LTS (latest stable)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node -v    # should show v20.x.x
npm -v     # should show 10.x.x
```

#### Step 3 — Clone & Install the Router

```bash
# Clone the repo
git clone https://github.com/technicalboy2023/ai-router.git
cd universal-ai-router

# Install dependencies
npm install

# Register global CLI command
sudo npm link
```

#### Step 4 — Open Firewall Port

```bash
# Allow port 8000 through UFW firewall
sudo ufw allow 8000/tcp
sudo ufw reload

# Verify UFW status
sudo ufw status
```

#### Step 5 — Run as Background Daemon (PM2)

```bash
# Install PM2 globally (process manager — keeps router alive after reboot)
sudo npm install -g pm2

# Start the router with PM2
pm2 start npm --name "ai-router" -- run dev

# Save PM2 process list (auto-restart on reboot)
pm2 save

# Enable PM2 to start on system boot
pm2 startup systemd
# ⚠️ Copy-paste the command PM2 outputs and run it!

# Check router is running
pm2 status
pm2 logs ai-router
```

> ✅ Router is now running at `http://YOUR_VPS_IP:8000` — **survives reboots automatically!**

#### 🔍 Useful PM2 Commands

```bash
pm2 status                  # Check if router is alive
pm2 logs ai-router          # Live logs
pm2 restart ai-router       # Restart after config changes
pm2 stop ai-router          # Stop the router
pm2 delete ai-router        # Remove from PM2 completely
```

#### 🌐 Test from Outside the VPS

```bash
# Run this from your local machine (replace with your VPS IP)
curl -X POST http://YOUR_VPS_IP:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my_super_secret_token" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello!"}]}'
```

---

## 🔑 Configuration

### Step 1 — Create your `.env` file

In the project root, create a `.env` file and add your API keys:

```env
# ── Provider Keys ─────────────────────────────────────────
# Add multiple keys separated by commas to enable rotation
OPENROUTER_KEYS=sk-or-v1-key1,sk-or-v1-key2,sk-or-v1-key3
GEMINI_KEY_1=AIzaSy_your_gemini_key_here
GROQ_KEY_1=gsk_your_groq_key_here
GROQ_KEY_2=gsk_your_second_groq_key_here   # optional, for rotation

# ── Security ──────────────────────────────────────────────
# Set a password to protect your router from unauthorized use
AUTH_TOKEN=my_super_secret_token
```

### Step 2 — Tune `config/default.json` (Optional)

```json
{
  "port": 8000,
  "providerOrder": ["groq", "gemini", "openrouter"],
  "modelMap": {
    "llama*": "groq",
    "gemini*": "gemini",
    "gpt*": "openrouter"
  }
}
```

| Key | Description |
|---|---|
| `port` | Port the router listens on (default: `8000`) |
| `providerOrder` | Failover priority — first provider is primary |
| `modelMap` | Route specific model names to specific providers |

---

## 🚀 Start the Router

```bash
# Quick start (foreground, with live logs)
npm run dev

# ✅ Router live at → http://localhost:8000
```

```bash
# Production start (background daemon via PM2)
ai-router start myRouter -c config/default.json
```

---

## 💻 Usage Examples

Your router is now a **drop-in OpenAI replacement**. Point any OpenAI-compatible client at `http://localhost:8000`.

### 🐍 Python (openai library)

```python
import openai

client = openai.OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="my_super_secret_token"       # your AUTH_TOKEN
)

response = client.chat.completions.create(
    model="openrouter/auto",              # or "groq/llama3-70b-8192", "gemini-pro", etc.
    messages=[
        {"role": "user", "content": "Explain quantum computing in simple terms."}
    ]
)

print(response.choices[0].message.content)
```

### 🖥️ cURL (Quick Test)

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my_super_secret_token" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello from Universal AI Router!"}]
  }'
```

### 🔗 n8n / Make / Zapier

In your no-code tool's **HTTP Request node**, set:
- **URL:** `http://your-server-ip:8000/v1/chat/completions`
- **Method:** `POST`
- **Auth Header:** `Bearer my_super_secret_token`
- **Body:** Standard OpenAI JSON payload

> Works out of the box with n8n's **OpenAI node** — just change the base URL.

---

## 🖥️ CLI Reference

```bash
# Start a named router instance (runs in background)
ai-router start myRouter -c config/default.json

# View all running router instances
ai-router status

# Stream live logs for a router
ai-router logs myRouter

# Stop a running router
ai-router stop myRouter
```

> Run multiple routers on different ports for different projects — each fully isolated.

---

## 📁 Project Structure

```
universal-ai-router/
│
├── config/
│   └── default.json          # Provider order, port, model mapping
│
├── src/
│   ├── index.js              # Express server entry point
│   ├── router.js             # Core routing & failover logic
│   ├── cache.js              # Response caching engine
│   ├── keyRotator.js         # Multi-key round-robin rotation
│   └── providers/
│       ├── groq.js           # Groq API adapter
│       ├── gemini.js         # Google Gemini adapter
│       ├── openrouter.js     # OpenRouter adapter
│       └── ollama.js         # Ollama (local) adapter
│
├── cli/
│   └── ai-router.js          # Global CLI entrypoint
│
├── .env                      # Your API keys (never commit this!)
├── .env.example              # Template for .env setup
├── package.json
└── README.md
```

---

## 📸 Screenshots

> *Screenshots coming soon — contributions welcome!*

```
┌─────────────────────────────────────────────────┐
│  🌌 Universal AI Router — Running on :8000      │
│  ─────────────────────────────────────────────  │
│  ✅ Provider: Groq       [PRIMARY]              │
│  ✅ Provider: Gemini     [FAILOVER 1]           │
│  ✅ Provider: OpenRouter [FAILOVER 2]           │
│  🔑 Keys Loaded: 4 | Cache Hits: 12            │
│  📡 Requests Served: 847 | Errors: 0           │
└─────────────────────────────────────────────────┘
```

---

## 🌐 Live Demo

> 🚧 Self-hosted demo coming soon. [Star the repo](https://github.com/technicalboy2023/ai-router) to get notified!

---

## 🤝 Contributing

Contributions are what make open source thrive. All PRs are welcome!

```bash
# 1. Fork the repo and clone your fork
git clone https://github.com/technicalboy2023/ai-router.git

# 2. Create a feature branch
git checkout -b feature/my-awesome-feature

# 3. Make your changes, then commit
git commit -m "feat: add support for Mistral AI provider"

# 4. Push and open a Pull Request
git push origin feature/my-awesome-feature
```

**Ideas for contributions:**
- 🔌 New provider adapters (Mistral, Cohere, Claude, Together AI)
- 📊 Usage dashboard / web UI
- 🧪 Test coverage improvements
- 📝 Documentation & examples

---

## 🛡 License

This project is licensed under the **MIT License** — free for personal and commercial use.

See [`LICENSE`](LICENSE) for full details.

---

## 👨‍💻 Author

<div align="center">

**Built with ❤️ by [Your Name / Brand]**

[![GitHub](https://img.shields.io/badge/GitHub-@technicalboy2023-181717?style=for-the-badge&logo=github)](https://github.com/technicalboy2023)
[![Twitter](https://img.shields.io/badge/Twitter-@YOUR_HANDLE-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://twitter.com/YOUR_HANDLE)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/YOUR_PROFILE)

*Self-hosted AI infrastructure enthusiast. Building tools that make AI accessible, resilient, and free from vendor lock-in.*

</div>

---

## ⭐ Support the Project

If this project saved you time, money, or frustration — **give it a star!** It helps others discover it and motivates continued development.

<div align="center">

[![Star on GitHub](https://img.shields.io/github/stars/technicalboy2023/ai-router?style=social)](https://github.com/technicalboy2023/ai-router)

**⭐ Star · 🍴 Fork · 📢 Share**

*Every star makes this project more discoverable. Thank you!*

</div>

---

## 🔍 Keywords

`ai gateway` · `openai proxy` · `llm router` · `groq api` · `google gemini` · `openrouter` · `ollama` · `ai failover` · `api key rotation` · `self-hosted ai` · `open source llm` · `n8n ai` · `ai rate limit bypass` · `openai compatible` · `local ai server`

---

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:8b5cf6,100:6366f1&height=100&section=footer" width="100%" />
</div>
