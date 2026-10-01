/* Bridge between the toolkit page and the desktop shell. The toolkit checks for window.nmcDesktop
   and, when present, stores its data through these calls instead of browser storage. */
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("nmcDesktop", {
  readData: () => ipcRenderer.sendSync("data:read"),          /* sync: the toolkit loads state at startup */
  writeData: (json) => ipcRenderer.send("data:write", json),
  wipeData: () => ipcRenderer.invoke("data:wipe"),
  dataPath: () => ipcRenderer.sendSync("data:pathSync"),
  version: () => ipcRenderer.sendSync("app:versionSync"),
  openDataFolder: () => ipcRenderer.invoke("data:openFolder"),
  findOldExports: () => ipcRenderer.invoke("data:findOld"),
  readFile: (p) => ipcRenderer.invoke("data:readFile", p),
  pickAndRead: () => ipcRenderer.invoke("data:pickAndRead"),
  setHub: (hub) => ipcRenderer.send("update:setHub", hub),          /* the toolkit passes its hub address → update feed */
  checkUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  openReleases: () => ipcRenderer.invoke("update:openReleases"),
  rocketProFill: (payload) => ipcRenderer.invoke("rocketpro:fill", payload),   /* opens Rocket Pro and fills a new pricing scenario */
  onUpdateStatus: (fn) => ipcRenderer.on("update:status", (e, s) => fn(s)),
});
