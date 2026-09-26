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
ipcMain.handle("data:findOld", () => findOldExports());
ipcMain.handle("data:readFile", (e, p) => { try { return fs.readFileSync(p, "utf8"); } catch (err) { return null; } });
ipcMain.handle("data:pickAndRead", async () => {
  const r = await dialog.showOpenDialog({ title: "Import a previous toolkit file", filters: [{ name: "Toolkit export", extensions: ["json"] }], properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return null; try { return fs.readFileSync(r.filePaths[0], "utf8"); } catch (e) { return null; } });
ipcMain.handle("app:version", () => app.getVersion());

/* ---- updates, fed by the hub, installed when the banker is ready ----
   The toolkit tells us the hub address (Settings → hub). We check <hub>/updates/ on launch and every 30
   minutes and download new versions in the background. The toolkit then shows an "update available" bar
   with an Update button; nothing restarts until the banker clicks it (or closes the app — an update that
   has downloaded also installs on quit). Set NMC_NO_UPDATES=1 to disable (dev). */
let updater = null, updateFeed = null, mainWin = null;
function setupUpdates(){ if (process.env.NMC_NO_UPDATES) return;
  try { updater = require("electron-updater").autoUpdater; } catch (e) { return; }
  updater.autoDownload = true; updater.autoInstallOnAppQuit = true; updater.allowDowngrade = false;
  updater.on("error", () => {});
  updater.on("update-available", info => { if (mainWin) mainWin.webContents.send("update:status", { state: "downloading", version: info.version }); });
  updater.on("update-downloaded", info => {   /* no dialog, no countdown: the toolkit shows a bar with an Update button */
    if (mainWin) mainWin.webContents.send("update:status", { state: "ready", version: info.version }); });
  setInterval(checkUpdates, 30 * 60 * 1000);
}
function checkUpdates(){ if (!updater || !updateFeed) return; try { updater.setFeedURL({ provider: "generic", url: updateFeed }); updater.checkForUpdates().catch(() => {}); } catch (e) {} }
ipcMain.on("update:setHub", (e, hub) => { hub = String(hub || "").replace(/\/+$/, ""); const feed = hub ? hub + "/updates/" : null;
  if (feed && feed !== updateFeed) { updateFeed = feed; checkUpdates(); } });
ipcMain.handle("update:check", () => { checkUpdates(); return !!updateFeed; });
ipcMain.handle("update:install", () => { if (!updater) return false; flushWrites(); setTimeout(() => updater.quitAndInstall(false, true), 300); return true; });

function createWindow(){
  const win = mainWin = new BrowserWindow({ width: 1360, height: 900, minWidth: 900, minHeight: 600, title: "NMC Toolkit " + app.getVersion(),
    backgroundColor: "#FBF8F2", icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  win.loadFile(path.join(__dirname, "app", "neighborhood-toolkit.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });   /* Pennymac link etc. open in the system browser */
  win.on("close", flushWrites);
  return win;
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "NMC Toolkit", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "quit" }] },
    { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" } ]));
  createWindow(); setupUpdates();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("before-quit", flushWrites);
app.on("window-all-closed", () => { flushWrites(); if (process.platform !== "darwin") app.quit(); });
