# YourLab — Linux Server Deployment Guide

Self-hosted on your own machine. No Render, no GitHub Pages, no cloud bills.
One server runs everything: the website, the API, and the AI models.

---

## Architecture Overview

```
Browser (yourlabpt.com)
        │
        ▼
Cloudflare Edge (DNS + HTTPS + DDoS protection)
        │
   [encrypted tunnel]
        │
        ▼
cloudflared daemon  ──────►  localhost:3000
  (on your Linux server)         │
                             Node.js server
                             (serves website + API)
                                  │
                             localhost:11434
                              Ollama daemon
                         (phi3:mini + llama3.1:8b)
```

Your domain stays on Cloudflare DNS. Instead of pointing records at GitHub Pages or Render, traffic flows through a **Cloudflare Tunnel** — an outbound-only encrypted connection from your machine to Cloudflare's edge. No open inbound ports needed.

---

## Prerequisites

- Linux server (Ubuntu 22.04 / 24.04 recommended — adapt commands for other distros)
- SSH access to the server
- Your domain (`yourlabpt.com`) already managed by Cloudflare — i.e. Cloudflare is your nameserver
  - If not, log in to cloudflare.com → Add site → follow the nameserver change instructions with your registrar
- A Cloudflare account (free plan is enough — tunnels are free)
- A GitHub account with the website repository

---

## Step 1 — System Packages

```bash
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git curl wget

# Verify
node -v   # should be v20.x
npm -v
git --version
```

---

## Step 2 — Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

This installs the `ollama` binary and registers a systemd service automatically.

**Enable it to start on boot:**
```bash
sudo systemctl enable ollama
sudo systemctl start ollama

# Verify it's running
sudo systemctl status ollama
```

**Pull the two models** (this downloads ~5 GB, will take a few minutes):
```bash
ollama pull phi3:mini
ollama pull llama3.1:8b
```

You can watch progress live. Once done, verify:
```bash
ollama list
# Should show:
# NAME              ID          SIZE    MODIFIED
# llama3.1:8b       ...         4.7 GB  ...
# phi3:mini         ...         2.2 GB  ...
```

> **Hardware note:** `llama3.1:8b` needs roughly 6–8 GB of RAM to run comfortably.
> If your server has less, change `OLLAMA_MODEL_BIG` to `llama3.2:3b` (3 GB) or `mistral:7b`.
> `phi3:mini` needs ~2 GB and is the fast small-turn model — keep it.

---

## Step 3 — Clone the Repository

```bash
# Choose where to keep the app — /opt is a good convention for server apps
sudo mkdir -p /opt/yourlab
sudo chown $USER:$USER /opt/yourlab

cd /opt/yourlab
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git website
cd website
```

> Replace `YOUR_USERNAME/YOUR_REPO_NAME` with the actual GitHub path.

---

## Step 4 — Configure the Server

```bash
cd /opt/yourlab/website/server

# Install Node.js dependencies
npm install --production

# Create the environment file
cp .env.example .env
nano .env
```

**Fill in `.env` like this** (nano: edit, then Ctrl+O to save, Ctrl+X to exit):

```env
PORT=3000
NODE_ENV=production
ALLOWED_ORIGIN=https://yourlabpt.com,https://www.yourlabpt.com
AGENT_CONNECTION_MODE=remote_pull

# Ollama — these defaults already match the installed setup
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL_BIG=llama3.1:8b
OLLAMA_MODEL_SMALL=phi3:mini
SMALL_MODEL_TURNS=4
CHAT_HISTORY_TURNS=4
MODEL_MAX_TOKENS=180
MODEL_NUM_CTX=3072
STICKY_JS_FALLBACK=true
MAX_AI_TURNS_WITHOUT_CONTACT=8
CHAT_SESSION_TTL_MS=2700000

# Email notifications for new leads (optional — leave blank to skip)
LEAD_NOTIFY_TO=yourlabpt@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourlabpt@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_FROM=YourLab <yourlabpt@gmail.com>
```

The hosted server must not set `AGENT_RUNTIME_URL` and must not attempt to
reach a developer laptop. Local Agent Runtimes pair in Projects settings and
claim approved work using outbound signed HTTPS. Their Platform origin is
`https://www.yourlabpt.com` without `/projects`.

The connector is provider-neutral. A different local agent platform can
implement the same versioned capability and dispatch contract described in
[`AGENT_CONNECTOR_PROTOCOL.md`](./AGENT_CONNECTOR_PROTOCOL.md).

> For Gmail, use an **App Password** (Google Account → Security → 2FA → App passwords), not your regular password.

**Test that the server starts:**
```bash
node server.js
# Should print:
# Company knowledge base loaded (XXXX chars)
# YourLab server running on port 3000
```

Press Ctrl+C to stop it — you'll run it as a service in Step 6.

---

## Step 5 — Install Cloudflare Tunnel (cloudflared)

```bash
# Download the latest cloudflared for Linux x86_64
wget -O cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
rm cloudflared.deb

# Verify
cloudflared --version
```

> For ARM servers (Raspberry Pi, some VPS): replace `amd64` with `arm64` in the URL.

---

## Step 6 — Authenticate cloudflared with Your Cloudflare Account

```bash
cloudflared tunnel login
```

This prints a URL. Open it in your browser, log in to Cloudflare, and select `yourlabpt.com`. It saves a certificate file at `~/.cloudflared/cert.pem`.

---

## Step 7 — Create the Tunnel

> **Important:** run this command **without `sudo`** so the credentials file is written to your home directory, not root's.

```bash
cloudflared tunnel create yourlabpt_website
```

This creates a persistent tunnel, prints a **Tunnel ID** (a UUID like `f05627e1-...`), and writes a credentials file:
```
Tunnel credentials written to /home/yourlab/.cloudflared/<TUNNEL_ID>.json
```

Verify the file and note your tunnel ID:
```bash
cloudflared tunnel list
cat ~/.cloudflared/<TUNNEL_ID>.json
# Should show: AccountTag, TunnelSecret, TunnelID — 3 fields, nothing garbled
```

---

## Step 8 — Configure the Tunnel

cloudflared's `service install` command (used in Step 10) reads config from `/etc/cloudflared/`, not your home directory. Set both up now:

```bash
# Create the system config dir
sudo mkdir -p /etc/cloudflared

# Copy the credentials file (replace the UUID with your actual tunnel ID)
sudo cp ~/.cloudflared/<TUNNEL_ID>.json /etc/cloudflared/
```

Create `/etc/cloudflared/config.yml`:

```bash
sudo nano /etc/cloudflared/config.yml
```

Paste this, replacing `<TUNNEL_ID>` with your actual UUID:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json
protocol: http2

ingress:
  - hostname: yourlabpt.com
    service: http://localhost:3000
  - hostname: www.yourlabpt.com
    service: http://localhost:3000
  # Catch-all required by cloudflared
  - service: http_status:404
```

> `protocol: http2` is required. Without it, cloudflared defaults to QUIC (UDP port 7844) which many VPS providers and firewalls block, causing instant connection failures.

Save and exit (Ctrl+O, Enter, Ctrl+X).

---

## Step 9 — Route DNS Through the Tunnel

This command creates the CNAME records in Cloudflare DNS automatically. Use the **tunnel name** you chose in Step 7 (not the UUID):

```bash
cloudflared tunnel route dns yourlabpt_website yourlabpt.com
cloudflared tunnel route dns yourlabpt_website www.yourlabpt.com
```

**Then in the Cloudflare Dashboard:**
1. Go to **yourlabpt.com → DNS → Records**
2. Delete any old records:
   - **A records** pointing to GitHub Pages IPs (`185.199.108.153`, `.109.`, `.110.`, `.111.153`)
   - **CNAME** for `api` or `www` pointing to `yourlab-api.onrender.com` or `cname.github.io`
3. The two new CNAME records (`yourlabpt.com → <id>.cfargotunnel.com` and `www → <id>.cfargotunnel.com`) should already be there from the command above — if not, add them manually copying the pattern
4. Make sure the **Proxy status** (orange cloud) is **ON** for both records — this enables Cloudflare's HTTPS and caching on top of the tunnel

---

## Step 10 — Run Everything as Systemd Services

You want both Ollama and the Node server to start automatically when the machine boots, and restart if they crash.

Ollama is already a systemd service (installed in Step 2). Now create one for the Node server:

```bash
sudo nano /etc/systemd/system/yourlab.service
```

Paste this — replace `YOUR_LINUX_USERNAME` with the output of `whoami` and adjust `WorkingDirectory` to where you cloned the repo:

```ini
[Unit]
Description=YourLab Website + API Server
After=network.target ollama.service
Requires=ollama.service

[Service]
Type=simple
User=YOUR_LINUX_USERNAME
WorkingDirectory=/home/YOUR_LINUX_USERNAME/yourlabpt_website/server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

> **WorkingDirectory** must point to the `server/` folder inside your repo. If you cloned to `/opt/yourlab/website`, use `/opt/yourlab/website/server`. If you cloned to `~/yourlabpt_website`, use `/home/YOUR_LINUX_USERNAME/yourlabpt_website/server`. A wrong path causes exit code `200/CHDIR` and the service immediately dies.

Now install the cloudflared service. It reads from `/etc/cloudflared/config.yml` (which you created in Step 8) — **do not pass a `--config` flag**, that flag does not exist:

```bash
sudo cloudflared service install
```

This generates `/etc/systemd/system/cloudflared.service` automatically.

Fix the systemd start timeout — cloudflared takes several seconds to establish the tunnel connection and systemd's default 30s window can be too short:

```bash
sudo nano /etc/systemd/system/cloudflared.service
```

Add `TimeoutStartSec=0` under `[Service]`:
```ini
[Service]
TimeoutStartSec=0
```

**Enable and start everything:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable yourlab
sudo systemctl start yourlab
sudo systemctl start cloudflared

# Check all three are running:
sudo systemctl status ollama
sudo systemctl status yourlab
sudo systemctl status cloudflared
```

All three should say `Active: active (running)`. For cloudflared, watch the live log to confirm it connects:

```bash
sudo journalctl -u cloudflared -f
# Look for: Connection registered connIndex=0
# If you see "Unauthorized: Invalid tunnel secret" — the credentials JSON was corrupted (see Troubleshooting)
```

---

## Step 11 — Verify End-to-End

```bash
# Test the Node server directly on the machine:
curl http://localhost:3000/api/chat \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"message":"Olá","language":"pt"}'

# Should return a JSON response with "reply" and "usingFallback":false (if Ollama is ready)
# or "usingFallback":true (if models are still loading — wait a minute and retry)
```

Then open `https://yourlabpt.com` in your browser. DNS propagation can take 1–5 minutes (Cloudflare is usually instant since it controls the zone).

---

## Step 12 — Keeping the Code Up To Date

When you push new changes to GitHub, deploy them on the server with:

```bash
cd /opt/yourlab/website
./scripts/deploy-pull.sh
```

This script **fetches and hard-resets** to `origin/master`, then restores versioned project data (`projects/data/store.json`, `projects/uploads/`, `generated_proposals/`) from the repository. Any edits made directly on the server to those files are overwritten — the git repository is the source of truth for requirements and project documents.

Manual alternative (same effect):

```bash
cd /opt/yourlab/website
git fetch origin master
git reset --hard origin/master
git checkout HEAD -- projects/data/store.json projects/uploads generated_proposals
cd server && npm install --production
sudo systemctl restart yourlab
```

Or create a deploy script at `/opt/yourlab/deploy.sh`:

```bash
#!/bin/bash
set -e
/opt/yourlab/website/scripts/deploy-pull.sh
echo "Deployed successfully."
```

```bash
chmod +x /opt/yourlab/deploy.sh
chmod +x /opt/yourlab/website/scripts/deploy-pull.sh
```

Then deployments are just: `/opt/yourlab/deploy.sh`

**Important:** Project data is committed in git. After working locally, commit and push `projects/data/store.json` (and any new uploads or generated proposals) before running `deploy-pull.sh` on the server. A plain `git pull` may fail or merge if the server modified `store.json` at runtime — use `deploy-pull.sh` instead.

**Site still shows the old UI (e.g. atas inside each delivery phase)?**

The new UI is in git on branch `master` (not `main`). On the server:

```bash
cd /opt/yourlab/website   # or ~/yourlabpt_website — use YOUR clone path
git remote -v
git branch
./scripts/deploy-pull.sh
curl -s http://127.0.0.1:3000/api/projects/version
# Should return {"gitSha":"<short-commit>","platform":"projects"}
```

If `gitSha` is old or `unknown`:

1. Confirm `WorkingDirectory` in `yourlab.service` points to **this** repo's `server/` folder (not a second clone elsewhere).
2. Confirm you fetched `origin/master` (deploy script uses `master`, not `main`).
3. Hard refresh the browser on `/projects` (Ctrl+Shift+R). Cloudflare may cache HTML — purge cache for `yourlabpt.com/projects*` in the Cloudflare dashboard if needed.
4. Check the live file on disk: `grep "label: 'Atas'" projects/public/delivery-os-ui.js` should return **nothing** (old UI had atas per phase).

```bash
sudo systemctl status yourlab
sudo journalctl -u yourlab -n 30
```

---

## Troubleshooting

**Check logs for any service:**
```bash
sudo journalctl -u yourlab -f        # Node server logs (live)
sudo journalctl -u ollama -f         # Ollama logs
sudo journalctl -u cloudflared -f    # Tunnel logs
```

**yourlab.service exits immediately (exit-code 200/CHDIR):**
- The `WorkingDirectory` in the service file is wrong. Check the actual path:
  ```bash
  ls ~/yourlabpt_website/server/server.js   # adjust as needed
  sudo nano /etc/systemd/system/yourlab.service
  # Fix WorkingDirectory to the correct server/ path
  sudo systemctl daemon-reload && sudo systemctl restart yourlab
  ```

**cloudflared: "Unauthorized: Invalid tunnel secret":**
- The credentials JSON was corrupted (e.g. accidentally edited with nano). Delete the broken tunnel and recreate:
  ```bash
  cloudflared tunnel delete <TUNNEL_ID>
  cloudflared tunnel create yourlabpt_website   # run WITHOUT sudo
  # Copy new .json to /etc/cloudflared/
  sudo cp ~/.cloudflared/<NEW_ID>.json /etc/cloudflared/
  # Update tunnel ID in /etc/cloudflared/config.yml
  sudo nano /etc/cloudflared/config.yml
  # Re-route DNS
  cloudflared tunnel route dns yourlabpt_website yourlabpt.com
  cloudflared tunnel route dns yourlabpt_website www.yourlabpt.com
  sudo systemctl restart cloudflared
  ```

**cloudflared: "failed to run the datagram handler" / instant retries:**
- QUIC (UDP) is blocked by your VPS or network. Ensure `protocol: http2` is set in `/etc/cloudflared/config.yml`.

**cloudflared service install: "Cannot determine default configuration path":**
- The service install command only looks in `/etc/cloudflared/`, not `~/.cloudflared/`. Copy your config there first:
  ```bash
  sudo mkdir -p /etc/cloudflared
  sudo cp ~/.cloudflared/config.yml /etc/cloudflared/config.yml
  sudo cp ~/.cloudflared/<TUNNEL_ID>.json /etc/cloudflared/
  # Then update credentials-file path in /etc/cloudflared/config.yml to /etc/cloudflared/<TUNNEL_ID>.json
  sudo cloudflared service install
  ```

**Ollama isn't responding:**
```bash
curl http://localhost:11434/api/tags   # Should list your pulled models
ollama list                            # Should show phi3:mini and llama3.1:8b
```

**Tunnel connected but site not loading:**
- Check `cloudflared tunnel info yourlabpt_website` — status should be `HEALTHY`
- Verify DNS records exist in Cloudflare dashboard with proxy ON

**`usingFallback: true` in chat responses:**
- Means the request did not complete on the selected model in time.
- The session is now "sticky fallback" (coherent offline flow for the rest of that chat), so users do not see style switching between AI and fallback.
- For low-resource machines, reduce load with:
  ```env
  OLLAMA_MODEL_BIG=llama3.2:3b
  OLLAMA_MODEL_SMALL=phi3:mini
  SMALL_MODEL_TURNS=6
  CHAT_HISTORY_TURNS=3
  MODEL_MAX_TOKENS=140
  MODEL_NUM_CTX=2048
  ```

**Out of memory when loading llama3.1:8b:**
```bash
# Check available RAM:
free -h
# If under 7 GB free, switch to a smaller model in /opt/yourlab/website/server/.env:
OLLAMA_MODEL_BIG=llama3.2:3b
# Then:
ollama pull llama3.2:3b
sudo systemctl restart yourlab
```

---

## Optional — Upgrade or Change Models Later

```bash
# Pull a new model:
ollama pull mistral:7b

# Set it as the big model:
nano /opt/yourlab/website/server/.env
# Change: OLLAMA_MODEL_BIG=mistral:7b
sudo systemctl restart yourlab

# Remove a model you no longer need:
ollama rm llama3.1:8b
```

---

## What to Delete / Disable After Migration

- **Render**: Log in to render.com → your service → Settings → Delete service
- **GitHub Pages** (if the repo had it enabled): Repository → Settings → Pages → Source → set to "None"
- `render.yaml` in the repo is now unused but harmless — you can delete it if you want a clean repo
