# NMC Toolkit

Banker toolkit, management console, and central hub for Neighborhood Mortgage Company.

| Folder | What | Who |
|---|---|---|
| `banker-toolkit/` | `neighborhood-toolkit.html` — the standalone banker app (starts empty) and a `-demo` copy with sample data | every banker |
| `management-console/` | `nmc-management.html` — leaders (rate desk, templates) + IT (presence, admin); `-demo` copy | leaders, IT |
| `central-server/` | `server.js` (the hub, Node 18+, no packages) and `merge-drive.js` (shared-folder bridge) | IT |
| `nmc-toolkit-desktop/` | Windows / Mac app wrapper (Electron) — see its `README-DESKTOP.md` | IT / dev |
| `docs/` | Setup guide, integration spec (Salesforce / Five9 / Dialpad / AVM), developer handoff, ideas backlog, the deep-dive briefing | everyone |

Start with **`docs/SETUP-GUIDE.md`**. All four HTML files are fully standalone — calculations, charts, parsers, and PDF/JPG export run inside the file with no server or internet. The hub and shared folder only add sharing.

## Quick start

```bash
# the hub
cd central-server && NMC_ADMIN_TOKEN="pick-something-strong" node server.js     # http://localhost:8787

# the desktop app
cd nmc-toolkit-desktop && npm install && npm run build:mac     # or build:win
```

## Rules of the road
- `central-server/data/` holds live client data (save mirrors) and is git-ignored. Never commit it.
- Demo HTML files are the real files with `DEMO = true`; edit the real file and regenerate (see `docs/DEV-HANDOFF.md`).
- Anything client-facing on the proposal must be a true benefit for that client's numbers.
- SSN, DOB, age, and marital status are never captured or transmitted anywhere.
