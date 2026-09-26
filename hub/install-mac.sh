#!/usr/bin/env bash
# Installs the NMC Hub as a launchd daemon on a Mac (starts at boot). Run with sudo from this folder.
set -e; HERE="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null || { echo "Install Node.js 18+ first (brew install node)"; exit 1; }
[ -f "$HERE/.env" ] || { cp "$HERE/.env.example" "$HERE/.env"; echo "Created .env — EDIT IT (admin token, GitHub token) then re-run."; exit 1; }
cat > /Library/LaunchDaemons/com.neighborhoodmc.hub.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.neighborhoodmc.hub</string>
<key>ProgramArguments</key><array><string>$(command -v node)</string><string>$HERE/start.js</string></array>
<key>WorkingDirectory</key><string>$HERE</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$HERE/hub.log</string><key>StandardErrorPath</key><string>$HERE/hub.log</string>
</dict></plist>
PLIST
launchctl unload /Library/LaunchDaemons/com.neighborhoodmc.hub.plist 2>/dev/null || true
launchctl load -w /Library/LaunchDaemons/com.neighborhoodmc.hub.plist && echo "NMC Hub running. Dashboard: http://localhost:8787   Logs: $HERE/hub.log"
