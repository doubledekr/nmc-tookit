/* Copies the current toolkit HTML into app/ so the build always ships the latest file.
   Looks in the pack layout first, then next to this project. */
const fs = require("fs"), path = require("path");
const here = path.join(__dirname, "..");
const candidates = [ path.join(here, "..", "banker-toolkit", "neighborhood-toolkit.html"), path.join(here, "..", "neighborhood-toolkit.html"), path.join(here, "neighborhood-toolkit.html") ];
const src = candidates.find(p => fs.existsSync(p));
if (!src) { console.error("neighborhood-toolkit.html not found next to this project — copy it into app/ by hand."); process.exit(fs.existsSync(path.join(here, "app", "neighborhood-toolkit.html")) ? 0 : 1); }
fs.mkdirSync(path.join(here, "app"), { recursive: true });
fs.copyFileSync(src, path.join(here, "app", "neighborhood-toolkit.html"));
console.log("synced", src);
