/* Copies the current toolkit HTML into app/ so the build always ships the latest file.
   Looks in the pack layout first, then next to this project. */
const fs = require("fs"), path = require("path");
const here = path.join(__dirname, "..");
const candidates = [ path.join(here, "..", "banker-toolkit", "neighborhood-toolkit.html"), path.join(here, "..", "neighborhood-toolkit.html"), path.join(here, "neighborhood-toolkit.html") ];
const src = candidates.find(p => fs.existsSync(p));
if (!src) { console.error("neighborhood-toolkit.html not found next to this project — copy it into app/ by hand."); process.exit(fs.existsSync(path.join(here, "app", "neighborhood-toolkit.html")) ? 0 : 1); }
fs.mkdirSync(path.join(here, "app"), { recursive: true });
fs.copyFileSync(src, path.join(here, "app", "neighborhood-toolkit.html"));
/* keep the app version in step with the toolkit's own version constant */
const html = fs.readFileSync(src, "utf8"); const m = html.match(/const TOOLKIT_VERSION\s*=\s*"([^"]+)"/);
if (m) { const pj = path.join(here, "package.json"); const pkg = JSON.parse(fs.readFileSync(pj, "utf8"));
  if (pkg.version !== m[1]) { pkg.version = m[1]; fs.writeFileSync(pj, JSON.stringify(pkg, null, 2) + "\n"); console.log("version →", m[1]); } }
console.log("synced", src);
