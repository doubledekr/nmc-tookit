// Inlines theme/nmc-theme.css and theme/nmc-motion.js into the single-file toolkit
// between the <style id="nmcTheme"> and <script id="nmcMotion"> markers. Run after editing either file.
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, ".."); const html = path.join(dir, "neighborhood-toolkit.html");
let s = fs.readFileSync(html, "utf8");
const css = fs.readFileSync(path.join(__dirname, "nmc-theme.css"), "utf8").trim();
const js = fs.readFileSync(path.join(__dirname, "nmc-motion.js"), "utf8").trim();
const put = (open, close, body) => { const a = s.indexOf(open); if (a < 0) throw new Error("marker missing: " + open); const b = s.indexOf(close, a); s = s.slice(0, a + open.length) + "\n" + body + "\n" + s.slice(b); };
put('<style id="nmcTheme">', "</style>", css);
put('<script id="nmcMotion">', "</script>", js);
fs.writeFileSync(html, s); console.log("theme inlined:", css.length, "css,", js.length, "js");
