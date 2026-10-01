/* Lab bridge: the same window.nmcDesktop the real app exposes (updates are no-ops here),
   plus window.nmcBonzo for the Send to Bonzo module. */
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("nmcDesktop", {
  readData: () => ipcRenderer.sendSync("data:read"),
  writeData: (json) => ipcRenderer.send("data:write", json),
  wipeData: () => ipcRenderer.invoke("data:wipe"),
  dataPath: () => ipcRenderer.sendSync("data:pathSync"),
  version: () => ipcRenderer.sendSync("app:versionSync"),
  openDataFolder: () => ipcRenderer.invoke("data:openFolder"),
  findOldExports: () => ipcRenderer.invoke("data:findOld"),
  readFile: (p) => ipcRenderer.invoke("data:readFile", p),
  pickAndRead: () => ipcRenderer.invoke("data:pickAndRead"),
  setHub: () => {}, checkUpdates: async () => false, installUpdate: async () => false, openReleases: async () => false, onUpdateStatus: () => {}
});
contextBridge.exposeInMainWorld("nmcBonzo", {
  getConfig: () => ipcRenderer.sendSync("bonzo:getConfig"),
  setConfig: (cfg) => ipcRenderer.send("bonzo:setConfig", cfg),
  hasToken: () => ipcRenderer.sendSync("bonzo:hasToken"),
  setToken: (t) => ipcRenderer.invoke("bonzo:setToken", t),
  clearToken: () => ipcRenderer.invoke("bonzo:clearToken"),
  request: (req) => ipcRenderer.invoke("bonzo:request", req)
});
