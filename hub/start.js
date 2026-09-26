/* Loads .env (no dependency) then starts the hub. Use this as the service entry point. */
const fs = require("fs"), path = require("path");
try { for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]] && !line.trim().startsWith("#")) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch (e) {}
process.env.NMC_HUB_START = "1";
require("./server.js");
