/* NMC Toolkit — BONZO LAB desktop shell.
   A stripped copy of nmc-toolkit-desktop/main.js for testing the Send to Bonzo button:
   - its own app name → its own data folder ("NMC Toolkit Bonzo Lab"), so it never reads or writes
     a banker's real toolkit data
   - no auto-updater, so it can never pull or push releases of the real app
   - loads the toolkit HTML with the Bonzo module injected (npm run sync) */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const fs = require("fs"), path = require("path");

app.setName("NMC Toolkit Bonzo Lab");
function dataDir() { const d = app.getPath("userData"); fs.mkdirSync(d, { recursive: true }); return d; }
const DATA_FILE = () => path.join(dataDir(), "nmc-toolkit-data.json");

let pendingWrite = null, lastJson = null;
function flushWrites() { if (lastJson == null) return; const f = DATA_FILE();
  try { fs.writeFileSync(f + ".tmp", lastJson); if (fs.existsSync(f)) fs.copyFileSync(f, f + ".bak"); fs.renameSync(f + ".tmp", f); } catch (e) { console.error("save failed", e); } }
function writeData(json) { lastJson = json; if (pendingWrite) return; pendingWrite = setTimeout(() => { pendingWrite = null; flushWrites(); }, 400); }

ipcMain.on("data:read", e => { try { e.returnValue = fs.existsSync(DATA_FILE()) ? fs.readFileSync(DATA_FILE(), "utf8") : null; } catch (err) { e.returnValue = null; } });
ipcMain.on("data:write", (e, json) => writeData(json));
ipcMain.handle("data:wipe", () => { try { fs.unlinkSync(DATA_FILE()); } catch (e) {} return true; });
ipcMain.on("data:pathSync", e => { e.returnValue = dataDir(); });
ipcMain.on("app:versionSync", e => { e.returnValue = app.getVersion() + "-bonzo-lab"; });
ipcMain.handle("data:openFolder", () => shell.openPath(dataDir()));
ipcMain.handle("data:findOld", () => []);                       /* lab never goes looking for real exports */
ipcMain.handle("data:readFile", (e, p) => { try { return fs.readFileSync(p, "utf8"); } catch (err) { return null; } });
ipcMain.handle("data:pickAndRead", async () => {
  const r = await dialog.showOpenDialog({ title: "Import a toolkit file (test data)", filters: [{ name: "Toolkit export", extensions: ["json"] }], properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return null; try { return fs.readFileSync(r.filePaths[0], "utf8"); } catch (e) { return null; } });

require("./bonzo-main")(dataDir);

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Bonzo Lab", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { label: "Open data folder", click: () => shell.openPath(dataDir()) }, { type: "separator" }, { role: "quit" }] },
    { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }]));
  const win = new BrowserWindow({ width: 1360, height: 900, title: "NMC Toolkit — BONZO LAB (test build)", backgroundColor: "#FBF8F2",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  win.loadFile(path.join(__dirname, "app", "neighborhood-toolkit.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.on("close", flushWrites);
});
app.on("before-quit", flushWrites);
app.on("window-all-closed", () => { flushWrites(); app.quit(); });
