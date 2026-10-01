/* Builds the lab copy of the toolkit: copies the CURRENT banker-toolkit/neighborhood-toolkit.html
   (so the lab always tests against the latest main toolkit) into app/, then injects the two Bonzo
   module scripts just before </body>. The real toolkit file is never modified. */
const fs = require("fs"), path = require("path");
const lab = path.join(__dirname, "..", "..");                       /* bonzo-lab/ */
const src = path.join(lab, "..", "banker-toolkit", "neighborhood-toolkit.html");
const out = path.join(__dirname, "..", "app");
if (!fs.existsSync(src)) { console.error("Toolkit not found at", src); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
for (const f of ["bonzo-core.js", "bonzo.js"]) fs.copyFileSync(path.join(lab, "module", f), path.join(out, f));
let html = fs.readFileSync(src, "utf8");
const tag = `<!-- BONZO LAB -->\n<script src="bonzo-core.js"></script>\n<script src="bonzo.js"></script>\n`;
const i = html.lastIndexOf("</body>");
if (i < 0) { console.error("No </body> in toolkit HTML"); process.exit(1); }
html = html.slice(0, i) + tag + html.slice(i);
fs.writeFileSync(path.join(out, "neighborhood-toolkit.html"), html);
console.log("lab app built from", path.relative(process.cwd(), src), "→", path.relative(process.cwd(), out));
