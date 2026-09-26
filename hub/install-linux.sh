#!/usr/bin/env bash
# Installs the NMC Hub as a systemd service. Run with sudo from this folder.
set -e; HERE="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null || { echo "Install Node.js 18+ first (e.g. apt install nodejs)"; exit 1; }
[ -f "$HERE/.env" ] || { cp "$HERE/.env.example" "$HERE/.env"; echo "Created .env — EDIT IT (admin token, GitHub token) then re-run."; exit 1; }
cat > /etc/systemd/system/nmc-hub.service <<UNIT
[Unit]
Description=NMC Toolkit Hub
After=network.target
[Service]
WorkingDirectory=$HERE
ExecStart=$(command -v node) $HERE/start.js
Restart=always
RestartSec=5
User=$(logname 2>/dev/null || echo root)
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable --now nmc-hub && echo "NMC Hub running. Dashboard: http://localhost:8787   Logs: journalctl -u nmc-hub -f"
