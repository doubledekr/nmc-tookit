# NMC Toolkit — desktop app (Windows and Mac)

A native app that wraps the banker toolkit. Same file, same features, but:

- **Self-contained data.** Each banker's pipeline lives in one file in the app's
  own data folder, saved automatically, with an atomic write and a rolling
  `.bak` copy so a crash can never corrupt it. No browser, no browser storage.
- **Brings the browser version's data in.** On first launch the app looks in
  Downloads, Desktop, and Documents (including OneDrive) for
  `nmc-toolkit-*.json` exports and offers to import the newest one right on
  the welcome card; Settings also has *Import a previous toolkit file*.
- **Native dialogs** for Save As, folder picking, and file import.
- **Auto-update** from the hub (optional): bankers get new versions without
  anyone emailing files.
- Links like the Pennymac estimator open in the system browser.

## Building (one time, on any machine with Node 18+)

```
cd nmc-toolkit-desktop
npm install
npm run build:win        # → dist/NMC-Toolkit-Setup-1.0.0.exe   (run on Windows or Linux)
npm run build:mac        # → dist/NMC-Toolkit-1.0.0.dmg        (must run on a Mac)
npm run build:portable   # → dist/NMC-Toolkit-Portable-1.0.0.exe (no install; see below)
npm start                # run it locally to try it
```

`npm run sync` copies the current `neighborhood-toolkit.html` from the pack's
`banker-toolkit/` folder into `app/` — every build ships the latest toolkit,
so updating the app is: edit the HTML, bump `version` in package.json, build.

## Where the data lives

| Mode | Location | When |
|---|---|---|
| Installed (default) | Windows `%APPDATA%\NMC Toolkit\nmc-toolkit-data.json` · macOS `~/Library/Application Support/NMC Toolkit/nmc-toolkit-data.json` | The only place Windows and macOS let an installed app write without admin rights; survives reinstalls and updates. |
| Portable | a `data\` folder next to `NMC Toolkit.exe` | Create the folder and the app uses it — everything travels with the app (USB stick, a folder the banker controls). Use the portable build for this. |

Settings → *Open data folder* opens it. The app's data file is the same format
as the browser version's export, so *Export* / *Import* still work for backups
and moving between machines, and the hub save mirror works exactly as before.

## Code signing (do this before rolling out)

Unsigned apps trigger Windows SmartScreen ("unrecognized app") and macOS
Gatekeeper ("can't be opened") warnings. To avoid them:

- **Windows:** a code-signing certificate (an EV cert avoids the SmartScreen
  reputation delay). Set `CSC_LINK` / `CSC_KEY_PASSWORD` env vars when
  building; electron-builder signs automatically.
- **macOS:** an Apple Developer account ($99/yr). Build on a Mac with the
  Developer ID certificate installed and `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
  `APPLE_TEAM_ID` set; electron-builder signs **and notarizes**. Without this,
  bankers must right-click → Open the first time, and IT will hear about it.

## Updates: straight from GitHub Releases (no server needed)

Every push to `main` builds the installers and publishes a release tagged `v<version>`.
Installed copies check that page on launch and every 30 minutes:

- **Windows:** the update downloads in the background; the toolkit shows an
  "Update available" bar with an **Update now** button. Nothing restarts until the
  banker clicks it (or quits — a downloaded update installs on quit). Data is untouched.
- **Mac:** unsigned apps can't replace themselves, so the bar offers **Download update**,
  which opens the release page; the banker drags the new app over the old one. Once the
  app is signed with an Apple Developer ID this becomes one-click like Windows.

Requirements: the repository must be **public** (bankers' machines download the
installers anonymously), and each release must carry `latest.yml` / `latest-mac.yml`
next to the installers — the workflow does this. If a hub address is set in the
toolkit, `<hub>/updates/` is used instead of GitHub (for offices that mirror releases).
Set `NMC_NO_UPDATES=1` to disable the check (dev).

## Layout

```
main.js          desktop shell: data file, backups, old-export discovery, dialogs, updates
preload.js       the window.nmcDesktop bridge the toolkit talks to
app/             the toolkit HTML (filled by npm run sync)
build/           icon.png (512×512, converted to .ico/.icns automatically), mac entitlements
scripts/         sync-html.js
```

The toolkit HTML has no Electron code in it. It checks `window.nmcDesktop` at
startup: present → data goes through the bridge; absent → browser storage as
before. The same file serves the browser, the intranet, and the app.
