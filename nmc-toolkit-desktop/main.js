/* NMC Toolkit — desktop shell. Zero-dependency beyond Electron itself.
   Data lives in a single JSON file in the app's data folder (see dataDir()),
   so a banker's pipeline is self-contained with the app and survives updates. */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const fs = require("fs"), path = require("path"), os = require("os");

/* ---- where data lives ----
   Portable mode: a folder named "data" next to the executable (create it to turn this on) —
   everything stays with the app, e.g. on a USB stick or in a folder the banker controls.
   Otherwise: the per-user app-data folder, which is the only place Windows and macOS let an
   installed app write without admin rights and which survives reinstalls and updates:
     Windows  %APPDATA%\NMC Toolkit\           macOS  ~/Library/Application Support/NMC Toolkit/ */
function dataDir(){
  try { const portable = path.join(path.dirname(process.execPath), "data");
    if (fs.existsSync(portable)) { fs.accessSync(portable, fs.constants.W_OK); return portable; } } catch (e) {}
  const d = app.getPath("userData"); fs.mkdirSync(d, { recursive: true }); return d;
}
const DATA_FILE = () => path.join(dataDir(), "nmc-toolkit-data.json");

/* atomic write with a rolling backup, so a crash mid-save can never corrupt the pipeline */
let pendingWrite = null, lastJson = null;
function writeData(json){
  lastJson = json; if (pendingWrite) return; 
  pendingWrite = setTimeout(() => { pendingWrite = null; const f = DATA_FILE(), tmp = f + ".tmp";
    try { fs.writeFileSync(tmp, lastJson); if (fs.existsSync(f)) fs.copyFileSync(f, f + ".bak"); fs.renameSync(tmp, f); } catch (e) { console.error("save failed", e); }
  }, 400);
}
function flushWrites(){ if (pendingWrite) { clearTimeout(pendingWrite); pendingWrite = null; const f = DATA_FILE();
  try { fs.writeFileSync(f + ".tmp", lastJson); if (fs.existsSync(f)) fs.copyFileSync(f, f + ".bak"); fs.renameSync(f + ".tmp", f); } catch (e) {} } }

/* ---- find old browser-version exports (nmc-toolkit-*.json) on first run ---- */
function findOldExports(){
  const home = os.homedir(); const spots = ["Downloads", "Desktop", "Documents", "OneDrive/Desktop", "OneDrive/Documents"];
  const out = [];
  /* the live app's own data file (beta builds keep a separate folder, so this is how clients come across) */
  try { const live = path.join(path.dirname(app.getPath("userData")), "NMC Toolkit", "nmc-toolkit-data.json");
    if (live !== DATA_FILE() && fs.existsSync(live)) { const st = fs.statSync(live); out.push({ name: "Live NMC Toolkit data (nmc-toolkit-data.json)", path: live, where: "NMC Toolkit app", when: st.mtime.toISOString().slice(0, 10), mtime: st.mtimeMs + 1e12 }); } } catch (e) {}
  for (const s of spots){ const dir = path.join(home, s); let names = []; try { names = fs.readdirSync(dir); } catch (e) { continue; }
    for (const n of names){ if (!/nmc-toolkit-.*\.json$/i.test(n)) continue;
      try { const st = fs.statSync(path.join(dir, n)); out.push({ name: n, path: path.join(dir, n), where: s, when: st.mtime.toISOString().slice(0, 10), mtime: st.mtimeMs }); } catch (e) {} } }
  return out.sort((a, b) => b.mtime - a.mtime);
}

ipcMain.on("data:read", e => { try { e.returnValue = fs.existsSync(DATA_FILE()) ? fs.readFileSync(DATA_FILE(), "utf8") : null; } catch (err) { e.returnValue = null; } });
ipcMain.on("data:write", (e, json) => { writeData(json); });
ipcMain.handle("data:wipe", () => { try { fs.unlinkSync(DATA_FILE()); } catch (e) {} return true; });
ipcMain.handle("data:path", () => dataDir());
ipcMain.on("data:pathSync", e => { e.returnValue = dataDir(); });
ipcMain.on("app:versionSync", e => { e.returnValue = app.getVersion(); });
ipcMain.handle("data:openFolder", () => shell.openPath(dataDir()));
ipcMain.on("win:toggleMax", e => { const w = BrowserWindow.fromWebContents(e.sender); if (!w) return; if (process.platform === "darwin") { w.isFullScreen() ? w.setFullScreen(false) : (w.isMaximized() ? w.unmaximize() : w.maximize()); } else { w.isMaximized() ? w.unmaximize() : w.maximize(); } });
/* drag a rendered image (the loan-officer card) out of the app as a real file, so it drops into texting apps and email as an attachment */
ipcMain.on("drag:file", (e, name, dataUrl, iconUrl) => { try { const { nativeImage } = require("electron"); const dir = path.join(app.getPath("temp"), "nmc-toolkit-drag"); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, String(name || "image.png").replace(/[^a-z0-9._-]+/gi, "-")); const m = /^data:([^;]+);base64,(.*)$/s.exec(String(dataUrl || "")); if (!m) return;
  fs.writeFileSync(file, Buffer.from(m[2], "base64"));                                           /* raw bytes: a GIF stays animated */
  const icon = nativeImage.createFromDataURL(String(iconUrl || dataUrl)); e.sender.startDrag({ file, icon: icon.isEmpty() ? icon : icon.resize({ width: 160 }) }); } catch (err) {} });
/* proposal email as an .eml draft: written to temp, opened with the default mail app (Outlook shows X-Unsent files as drafts) */
ipcMain.handle("mail:openDraft", async (e, name, eml) => { try { const dir = path.join(app.getPath("temp"), "nmc-toolkit-drafts"); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, String(name || "proposal.eml").replace(/[^a-z0-9._-]+/gi, "-")); fs.writeFileSync(file, eml, "utf8"); if (process.env.NMC_TEST_NO_OPEN) return true; const err = await shell.openPath(file); return !err; } catch (err) { return false; } });
ipcMain.handle("data:findOld", () => findOldExports());
ipcMain.handle("data:readFile", (e, p) => { try { return fs.readFileSync(p, "utf8"); } catch (err) { return null; } });
ipcMain.handle("data:pickAndRead", async () => {
  const r = await dialog.showOpenDialog({ title: "Import a previous toolkit file", filters: [{ name: "Toolkit export", extensions: ["json"] }], properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return null; try { return fs.readFileSync(r.filePaths[0], "utf8"); } catch (e) { return null; } });
ipcMain.handle("app:version", () => app.getVersion());

/* ---- updates straight from GitHub Releases (no server needed) ----
   electron-builder writes the GitHub feed (package.json → build.publish) into the app. On launch and every
   30 minutes we ask GitHub for the newest release, download it in the background, and the toolkit shows an
   "update available" bar with an Update button; nothing restarts until the banker clicks it (or closes the
   app — a downloaded update also installs on quit). If the toolkit has a hub address, <hub>/updates/ is used
   instead (for offices that mirror releases). Unsigned Mac builds can't self-install, so on a Mac the bar
   offers the download page instead. Set NMC_NO_UPDATES=1 to disable (dev). */
const RELEASES_URL = "https://github.com/doubledekr/nmc-tookit/releases/latest";
let updater = null, updateFeed = null, mainWin = null, pendingVersion = null;
const IS_BETA = /-beta\./.test(app.getVersion());   /* beta builds never auto-update; newer betas are downloaded by hand from the releases page */
function setupUpdates(){ if (process.env.NMC_NO_UPDATES || IS_BETA) return;
  try { updater = require("electron-updater").autoUpdater; } catch (e) { return; }
  updater.autoDownload = process.platform !== "darwin";   /* Mac: unsigned → can't self-install; just announce */
  updater.autoInstallOnAppQuit = true; updater.allowDowngrade = false; updater.allowPrerelease = false;
  updater.on("error", () => { if (pendingVersion && mainWin) mainWin.webContents.send("update:status", { state: "manual", version: pendingVersion, url: RELEASES_URL }); });
  updater.on("update-available", info => { pendingVersion = info.version; if (!mainWin) return;
    mainWin.webContents.send("update:status", process.platform === "darwin" ? { state: "manual", version: info.version, url: RELEASES_URL } : { state: "downloading", version: info.version }); });
  updater.on("update-downloaded", info => {   /* no dialog, no countdown: the toolkit shows a bar with an Update button */
    if (mainWin) mainWin.webContents.send("update:status", { state: "ready", version: info.version }); });
  setTimeout(checkUpdates, 8000);
  setInterval(checkUpdates, 5 * 60 * 1000);   /* a release reaches every running app within five minutes */
}
function checkUpdates(){ if (!updater) return Promise.resolve({ state: "off" });
  try { if (updateFeed) updater.setFeedURL({ provider: "generic", url: updateFeed });
    return updater.checkForUpdates().then(r => ({ state: r && r.updateInfo && r.updateInfo.version !== app.getVersion() ? "available" : "current", version: r && r.updateInfo ? r.updateInfo.version : app.getVersion() })).catch(e => ({ state: "error", error: String(e && e.message || e) })); }
  catch (e) { return Promise.resolve({ state: "error", error: String(e && e.message || e) }); } }
ipcMain.on("update:setHub", (e, hub) => { hub = String(hub || "").replace(/\/+$/, ""); const feed = hub ? hub + "/updates/" : null;
  if (feed !== updateFeed) { updateFeed = feed; checkUpdates(); } });
ipcMain.handle("update:check", () => checkUpdates());
/* ---- local listener for the Chrome extension: http://127.0.0.1:<port>/sf (POST a harvested lead) and /ping ----
   Bound to loopback only, so nothing outside this computer can reach it. */
const http = require("http");
const SF_PORT = +(process.env.NMC_SF_PORT || (IS_BETA ? 47832 : 47831));   /* beta app + beta extension pair on 47832, so both pairs run side by side */
const five9 = IS_BETA ? require("./beta/five9-main.js")(app, () => mainWin) : null;   /* beta only: Five9 record-only mode */
if (five9) app.on("before-quit", () => five9.flush());
let sfServer = null, sfLastAt = 0, sfExtSeen = "";
function shippedExtVersion(){ try { const p = path.join(process.resourcesPath || __dirname, "chrome-extension", "manifest.json"); const alt = path.join(__dirname, "..", "chrome-extension", "manifest.json"); return JSON.parse(fs.readFileSync(fs.existsSync(p) ? p : alt, "utf8")).version || ""; } catch (e) { return ""; } }
function startSfListener(){
  if (sfServer) return;
  sfServer = http.createServer((req, res) => {
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
    if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
    if (req.method === "GET" && req.url.startsWith("/ping")) { res.writeHead(200, Object.assign({ "Content-Type": "application/json" }, cors)); res.end(JSON.stringify({ ok: true, app: "nmc-toolkit", version: app.getVersion(), lastAt: sfLastAt })); return; }
    if (req.method === "POST" && req.url.startsWith("/sf")) {
      let body = ""; req.on("data", c => { body += c; if (body.length > 2e6) req.destroy(); });
      req.on("end", () => { let j = null; try { j = JSON.parse(body); } catch (e) {}
        if (!j || typeof j.text !== "string") { res.writeHead(400, cors); res.end("bad payload"); return; }
        sfLastAt = Date.now(); if (typeof j.extVersion === "string") sfExtSeen = j.extVersion.slice(0, 20);
        if (mainWin && !mainWin.isDestroyed()) { mainWin.webContents.send("sf:incoming", { text: j.text, url: j.url || "", title: j.title || "", when: j.when || new Date().toISOString(), source: j.source || "chrome-extension", pairs: +j.pairs || 0, via: j.via || "", apiPairs: +j.apiPairs || 0, obj: typeof j.obj === "string" ? j.obj.slice(0, 20) : "", extVersion: sfExtSeen }); if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
        res.writeHead(200, Object.assign({ "Content-Type": "application/json" }, cors)); res.end(JSON.stringify({ ok: true, version: app.getVersion() })); });
      return; }
    /* Lender autofill: the extension asks for the client selected in the toolkit. This hands OUT client data, so unlike /sf it only
       answers a Chrome extension (websites can't fake the Origin header) on a loopback Host (blocks DNS-rebinding tricks), and only over POST
       (Chrome always sends Origin on POST). No wildcard CORS here. */
    if (five9 && req.url.startsWith("/five9")) { five9.handle(req, res); return; }
    if (req.url.startsWith("/client")) {
      const origin = String(req.headers.origin || ""), host = String(req.headers.host || "");
      const extOk = /^chrome-extension:\/\/[a-p]{32}$/.test(origin), hostOk = /^(127\.0\.0\.1|localhost):\d+$/.test(host);
      if (req.method !== "POST" || !extOk || !hostOk) { res.writeHead(403); res.end("forbidden"); return; }
      const hdr = { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Cache-Control": "no-store" };
      if (!mainWin || mainWin.isDestroyed()) { res.writeHead(200, hdr); res.end(JSON.stringify({ ok: false, error: "toolkit window is closed" })); return; }
      mainWin.webContents.executeJavaScript("JSON.stringify(typeof window.nmcLenderPacket==='function' ? {ok:true, client:window.nmcLenderPacket()} : {ok:false, error:'update the toolkit'})", true)
        .then(t => { let j = null; try { j = JSON.parse(t); } catch (e) {}
          if (j && j.ok && !j.client) j = { ok: false, error: "no client selected in the toolkit" };
          res.writeHead(200, hdr); res.end(JSON.stringify(Object.assign({ version: app.getVersion() }, j || { ok: false, error: "toolkit didn't answer" }))); })
        .catch(e => { res.writeHead(200, hdr); res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) })); });
      return; }
    res.writeHead(404, cors); res.end();
  });
  /* The port can be busy for a moment after an update restarts the app (the old instance is still letting go). Before, one failed bind
     left the listener dead for the whole session and every send from the extension fell back to the clipboard. Now it keeps trying:
     every 2s for the first minute, then every 15s. */
  sfServer.on("error", e => { console.error("SF listener failed on port " + SF_PORT + ": " + e.message); try { sfServer.close(); } catch (err) {} sfServer = null;
    sfRetries++; setTimeout(startSfListener, sfRetries < 30 ? 2000 : 15000); });
  sfServer.on("listening", () => { sfRetries = 0; });
  sfServer.listen(SF_PORT, "127.0.0.1");
}
let sfRetries = 0;
ipcMain.on("sf:statusSync", e => { e.returnValue = { listening: !!sfServer && sfServer.listening, port: SF_PORT, lastAt: sfLastAt, extSeen: sfExtSeen, extShipped: shippedExtVersion() }; });
ipcMain.handle("sf:openExtensionFolder", () => { const p = path.join(process.resourcesPath || __dirname, "chrome-extension"); const alt = path.join(__dirname, "..", "chrome-extension"); return shell.openPath(fs.existsSync(p) ? p : alt); });
ipcMain.on("sf:extensionPathSync", e => { const p = path.join(process.resourcesPath || __dirname, "chrome-extension"); const alt = path.join(__dirname, "..", "chrome-extension"); e.returnValue = fs.existsSync(p) ? p : alt; });
/* brand images for proposals: download in the main process (no CORS), hand back data URLs; only neighborhoodmc.com */
ipcMain.handle("brand:fetch", async (e, urls) => {
  const https = require("https"); const out = {};
  const get = u => new Promise(res => { if (!/^https:\/\/(www\.)?neighborhoodmc\.com\//.test(u)) return res(null);
    const req = https.get(u, { timeout: 15000, headers: { "User-Agent": "NMC-Toolkit/" + app.getVersion() } }, r => {
      if (r.statusCode !== 200) { r.resume(); return res(null); } const chunks = []; r.on("data", c => chunks.push(c));
      r.on("end", () => { const buf = Buffer.concat(chunks); const mime = (r.headers["content-type"] || "image/png").split(";")[0]; res(buf.length < 4e6 ? "data:" + mime + ";base64," + buf.toString("base64") : null); }); });
    req.on("error", () => res(null)); req.on("timeout", () => { req.destroy(); res(null); }); });
  for (const u of (urls || []).slice(0, 12)) out[u] = await get(u);
  return out;
});
ipcMain.handle("update:openReleases", () => { shell.openExternal(IS_BETA ? "https://github.com/doubledekr/nmc-tookit/releases" : RELEASES_URL); return true; });
ipcMain.handle("update:install", () => { if (!updater) return false; flushWrites(); setTimeout(() => updater.quitAndInstall(false, true), 300); return true; });

function createWindow(){
  /* Our own title band instead of the stock one: the page draws a 38px strip (red over the sidebar, paper over the content) and the OS
     keeps only its window buttons — Windows draws them top-right (title-bar overlay), macOS keeps its traffic lights top-left.
     Snap layouts, the system shadow and Windows 11's rounded corners all still apply because this is still a normal window. */
  const mac = process.platform === "darwin";
  const win = mainWin = new BrowserWindow({ width: 1500, height: 900, minWidth: 1500, minHeight: 840, title: "NMC Toolkit " + app.getVersion(),
    backgroundColor: "#FBF8F2", icon: path.join(__dirname, "build", "icon.png"), show: false,
    titleBarStyle: mac ? "hiddenInset" : "hidden",
    ...(mac ? { trafficLightPosition: { x: 14, y: 12 } } : { titleBarOverlay: { color: "#FBF8F2", symbolColor: "#2B2622", height: 38 } }),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  win.once("ready-to-show", () => win.show());                                     /* appears painted, never a white flash */
  if (five9) five9.attach(win);
  win.loadFile(path.join(__dirname, "app", "neighborhood-toolkit.html"));
  /* right-click menu: cut / copy / paste / select all in any field, copy on any selected text */
  win.webContents.on("context-menu", (e, p) => {
    const items = [];
    if (p.isEditable) {
      items.push({ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut", enabled: p.editFlags.canCut }, { role: "copy", enabled: p.editFlags.canCopy }, { role: "paste", enabled: p.editFlags.canPaste }, { type: "separator" }, { role: "selectAll" });
    } else if (p.selectionText && p.selectionText.trim()) {
      items.push({ role: "copy" });
    } else if (p.linkURL) {
      items.push({ label: "Copy link", click: () => require("electron").clipboard.writeText(p.linkURL) });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });   /* Pennymac link etc. open in the system browser */
  win.on("close", flushWrites);
  return win;
}
app.setAppUserModelId(IS_BETA ? "com.neighborhoodmc.toolkit.beta" : "com.neighborhoodmc.toolkit");   /* beta: its own taskbar group, so the two apps never stack */   /* Windows: lets desktop notifications show the app name */
/* one running copy at a time — a second launch (double-clicked shortcut, update restart overlap) just focuses the first,
   so two instances never fight over the data file or the extension's port */
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "NMC Toolkit", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "quit" }] },
    { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" } ]));
  createWindow(); setupUpdates(); startSfListener();
  app.on("second-instance", () => { if (mainWin && !mainWin.isDestroyed()) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); } });
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("before-quit", flushWrites);
app.on("window-all-closed", () => { flushWrites(); if (process.platform !== "darwin") app.quit(); });
