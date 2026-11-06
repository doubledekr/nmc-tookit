/* Turns this checkout into the "NMC Toolkit Beta" build: separate app name, app id, install folder and data
   folder, so it sits next to the live app without touching it. Run by the beta workflow before electron-builder.
   Usage: node scripts/beta.js <betaNumber>   → version becomes <version>-beta.<betaNumber> */
const fs = require("fs"), path = require("path");
/* sync first: sync-html.js copies the page into app/ and resets "version" to the page's TOOLKIT_VERSION. It used to run inside
   "npm run build:*" AFTER this script, which wiped the -beta suffix — the installed "beta" then ran as the live app (port 47831,
   no beta mode). So: sync now, then stamp the beta version, then take sync out of the build scripts. */
require("./sync-html.js");
const pj = path.join(__dirname, "..", "package.json"); const pkg = JSON.parse(fs.readFileSync(pj, "utf8"));
for (const k of Object.keys(pkg.scripts || {})) if (/^build/.test(k)) pkg.scripts[k] = pkg.scripts[k].replace(/^npm run sync && /, "");
const n = process.argv[2] || process.env.BETA_N || "0";
if (!/-beta\./.test(pkg.version)) pkg.version = pkg.version + "-beta." + n;
pkg.productName = "NMC Toolkit Beta";
pkg.build.productName = "NMC Toolkit Beta";
pkg.build.appId = "com.neighborhoodmc.toolkit.beta";
pkg.build.win.artifactName = "NMC-Toolkit-Beta-Setup-${version}.${ext}";
pkg.build.nsis.shortcutName = "NMC Toolkit Beta";
pkg.build.mac.artifactName = "NMC-Toolkit-Beta-${version}.${ext}";
pkg.build.dmg.artifactName = "NMC-Toolkit-Beta-${version}.${ext}";
pkg.build.publish = { provider: "github", owner: "doubledekr", repo: "nmc-tookit", releaseType: "prerelease", channel: "beta" };
if (!pkg.build.files.includes("beta/**/*")) pkg.build.files.push("beta/**/*");   /* Five9 record-only mode (main.js loads it only in a beta) */
fs.writeFileSync(pj, JSON.stringify(pkg, null, 2) + "\n");
require("./beta-extension.js");   /* ships the "NMC Beta" extension: port 47832, BETA buttons bottom-left, Five9 watcher */
const check = JSON.parse(fs.readFileSync(pj, "utf8"));
if (!/-beta\.\d+$/.test(check.version) || Object.keys(check.scripts || {}).some(k => /^build/.test(k) && /npm run sync/.test(check.scripts[k]))) { console.error("beta.js: package.json isn't a beta build", check.version); process.exit(1); }
console.log("beta build:", pkg.productName, pkg.version);
