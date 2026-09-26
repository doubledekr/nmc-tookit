# NMC Hub — for IT

The hub is a small background service (Node.js, no packages to install) that every
banker's toolkit and the management console talk to. It holds the rate feed, team
stats, template library, presence, mirrored save files, the Salesforce import
inbox, the 10-yr Treasury, and the desktop-app update files.

## Install (pick one) — about 10 minutes

**Windows server or always-on PC** (Administrator PowerShell, from this folder):
```
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```
Installs Node if missing, creates `.env` for you to edit, and registers "NMC Hub"
as a task that starts at boot and restarts if it stops.

**Linux:** `sudo ./install-linux.sh` (systemd service `nmc-hub`).
**Mac:** `sudo ./install-mac.sh` (launchd daemon).
**Docker:** `cp .env.example .env`, edit it, `docker compose up -d`.

Each installer stops the first time to make you edit `.env`; run it again after.

## Configure `.env`
- `NMC_ADMIN_TOKEN` — **required**; change it. Share only with whoever runs the rate desk.
- `NMC_UPDATE_REPO` + `NMC_GITHUB_TOKEN` — lets the hub pull each desktop-app release from
  GitHub so bankers' apps update themselves. Fine-grained token, that repo only, Contents: Read.
- The rest are optional (see the file).

## Then
- Open `http://SERVER:8787` — the dashboard should load.
- Give bankers the address `http://SERVER:8787`; they paste it once in the toolkit's Settings.
- Open the management console (`management-console/nmc-management.html`) → Connection → same address + admin token.

## Remote bankers (working from home, no VPN) — expose the hub safely

If bankers work outside the office network, the hub needs a public HTTPS address so their
toolkits can reach it for rates, templates, Salesforce imports, and app updates. Three steps:

1. **Set `NMC_BANKER_KEY` in `.env`** (a long random string). Once set, every request to the
   hub must carry it — bankers paste it once into Settings next to the hub address, the
   console on its Connection screen. Without it, anyone who finds the address could post
   fake call stats or pull Salesforce inbox records. Only `/health`, the dashboard page, the
   admin page (which has its own token), and the installer files stay open.
2. **HTTPS**, one of:
   - **Caddy** (simplest with a public IP): install it, point a DNS name at the box
     (`hub.neighborhoodmc.com`), open ports 80/443, use the included `Caddyfile`, run
     `caddy run`. Certificates are automatic.
   - **Cloudflare Tunnel** (no open ports, works from behind the office firewall):
     `cloudflared tunnel create nmc-hub`, route the DNS name to it, run
     `cloudflared tunnel run --url http://localhost:8787 nmc-hub`. Add Cloudflare Access
     in front for an extra login if you want.
   - A cloud VM (any small Linux VM) running the hub + Caddy.
3. Give bankers **`https://hub.neighborhoodmc.com`** and the access key.

On a closed office LAN with everyone on VPN, you can leave `NMC_BANKER_KEY` blank and skip
HTTPS — but the moment the hub is reachable from the internet, both are required.

## Keep in mind
- `data/` holds everything, **including banker save mirrors (client data)**. Back it up nightly;
  restrict who can read the box; keep the hub on the LAN/VPN or behind HTTPS with auth.
- Updating the hub: replace `server.js`, restart the service. Data files are stable across versions.
- Air-gapped sites: see `merge-drive.js` in `docs/SETUP-GUIDE.md`.
- Every endpoint: `ENDPOINTS.md`.
