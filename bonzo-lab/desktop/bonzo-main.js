/* Bonzo bridge — main-process side. The API token and every network call live here, never in the page.
   - token: encrypted with the OS keychain (Electron safeStorage: Keychain on Mac, DPAPI on Windows)
   - config: plain JSON next to it (no secrets)
   - every request is appended to bonzo-log.jsonl with the token redacted, for debugging the pilot
   To merge into the real app: require this file from nmc-toolkit-desktop/main.js and add the
   nmcBonzo block from preload.js. */
const { ipcMain, safeStorage } = require("electron");
const fs = require("fs"), path = require("path");

module.exports = function registerBonzo(dataDir) {
  const TOKEN_FILE = () => path.join(dataDir(), "bonzo-token.bin");
  const CFG_FILE = () => path.join(dataDir(), "bonzo-config.json");
  const LOG_FILE = () => path.join(dataDir(), "bonzo-log.jsonl");

  function readToken() {
    try {
      const buf = fs.readFileSync(TOKEN_FILE());
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : null;
    } catch (e) { return null; }
  }
  function log(entry) { try { fs.appendFileSync(LOG_FILE(), JSON.stringify(Object.assign({ at: new Date().toISOString() }, entry)) + "\n"); } catch (e) {} }

  ipcMain.on("bonzo:getConfig", e => { try { e.returnValue = JSON.parse(fs.readFileSync(CFG_FILE(), "utf8")); } catch (err) { e.returnValue = null; } });
  ipcMain.on("bonzo:setConfig", (e, cfg) => { try { fs.writeFileSync(CFG_FILE(), JSON.stringify(cfg, null, 2)); } catch (err) {} });
  ipcMain.on("bonzo:hasToken", e => { e.returnValue = !!readToken(); });
  ipcMain.handle("bonzo:setToken", (e, token) => {
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: "This computer can't encrypt the token — ask IT" };
    fs.writeFileSync(TOKEN_FILE(), safeStorage.encryptString(String(token).trim())); return { ok: true };
  });
  ipcMain.handle("bonzo:clearToken", () => { try { fs.unlinkSync(TOKEN_FILE()); } catch (e) {} return true; });

  ipcMain.handle("bonzo:request", async (e, { baseUrl, method, path: p, body }) => {
    const url = String(baseUrl || "").replace(/\/+$/, "") + p;
    if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url))
      return { ok: false, status: 0, error: "Bonzo URL must be https (or the local mock)" };
    const token = readToken() || (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) ? "mock-token" : null);
    if (!token) return { ok: false, status: 0, error: "No Bonzo API token saved" };
    const started = Date.now();
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + token },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
      let json = null; const text = await res.text(); try { json = text ? JSON.parse(text) : null; } catch (err) { json = { raw: text.slice(0, 500) }; }
      log({ method, url, status: res.status, ms: Date.now() - started, keys: body ? Object.keys(body) : [], error: res.ok ? undefined : json });
      return { ok: res.ok, status: res.status, json };
    } catch (err) {
      log({ method, url, status: 0, error: String(err && err.message || err) });
      return { ok: false, status: 0, error: err && err.name === "TimeoutError" ? "Bonzo didn't answer in 20 seconds" : "Network error: " + (err && err.message) };
    }
  });
};
