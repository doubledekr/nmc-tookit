/* Bridge between the toolkit page and the desktop shell. The toolkit checks for window.nmcDesktop
   and, when present, stores its data through these calls instead of browser storage. */
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("nmcDesktop", {
  platform: process.platform,                                   /* "win32" | "darwin" — the page lays out the title band for each */
  titleBand: 38,                                                /* px the page reserves at the top for the window buttons */
  toggleMaximize: () => ipcRenderer.send("win:toggleMax"),       /* double-click on the band, like a title bar */
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
  onUpdateStatus: (fn) => ipcRenderer.on("update:status", (e, s) => fn(s)),
  fetchImages: (urls) => ipcRenderer.invoke("brand:fetch", urls),     /* brand images for proposals */
  onSfIncoming: (fn) => ipcRenderer.on("sf:incoming", (e, p) => fn(p)),         /* Chrome extension → local listener → toolkit */
  sfStatus: () => ipcRenderer.sendSync("sf:statusSync"),
  extensionPath: () => ipcRenderer.sendSync("sf:extensionPathSync"),
  openExtensionFolder: () => ipcRenderer.invoke("sf:openExtensionFolder"),
  openDraft: (name, eml) => ipcRenderer.invoke("mail:openDraft", name, eml),   /* .eml draft → default mail app */
  dragFile: (name, dataUrl, iconUrl) => ipcRenderer.send("drag:file", name, dataUrl, iconUrl),   /* native drag of a rendered image out of the app (sync: must happen inside dragstart) */
});
