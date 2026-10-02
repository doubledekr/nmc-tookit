/* Turns this checkout into the "NMC Toolkit Beta" build: separate app name, app id, install folder and data
   folder, so it sits next to the live app without touching it. Run by the beta workflow before electron-builder.
   Usage: node scripts/beta.js <betaNumber>   → version becomes <version>-beta.<betaNumber> */
const fs = require("fs"), path = require("path");
const pj = path.join(__dirname, "..", "package.json"); const pkg = JSON.parse(fs.readFileSync(pj, "utf8"));
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
fs.writeFileSync(pj, JSON.stringify(pkg, null, 2) + "\n");
console.log("beta build:", pkg.productName, pkg.version);
