// Inlines theme/nmc-theme.css and theme/nmc-motion.js into the single-file toolkit
// between the <style id="nmcTheme"> and <script id="nmcMotion"> markers. Run after editing either file.
//
// The inlined blocks are GENERATED: anything edited directly inside them is overwritten here. To stop that from silently
// deleting someone's work, this refuses to run when a block holds lines the source file doesn't — move them into
// theme/nmc-theme.css (or nmc-motion.js) first, or pass --force to overwrite anyway.
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, ".."); const html = path.join(dir, "neighborhood-toolkit.html");
let s = fs.readFileSync(html, "utf8");
const css = fs.readFileSync(path.join(__dirname, "nmc-theme.css"), "utf8").trim();
const js = fs.readFileSync(path.join(__dirname, "nmc-motion.js"), "utf8").trim();
const force = process.argv.includes("--force");
const strays = [];
const put = (open, close, body, src) => { const a = s.indexOf(open); if (a < 0) throw new Error("marker missing: " + open); const b = s.indexOf(close, a);
  const have = new Set(body.split("\n").map(l => l.trim()));
  s.slice(a + open.length, b).split("\n").map(l => l.trim()).filter(l => l && !have.has(l)).forEach(l => strays.push(src + ": " + l.slice(0, 110)));
  s = s.slice(0, a + open.length) + "\n" + body + "\n" + s.slice(b); };
put('<style id="nmcTheme">', "</style>", css, "nmc-theme.css");
put('<script id="nmcMotion">', "</script>", js, "nmc-motion.js");
if (strays.length && !force) {
  console.error("Not inlining: the page has " + strays.length + " line(s) inside the generated theme blocks that aren't in the theme files.\n" +
    "Someone edited the page directly. Move these into the theme file named, then run again (or --force to drop them):\n  " + strays.join("\n  "));
  process.exit(1); }
fs.writeFileSync(html, s); console.log("theme inlined:", css.length, "css,", js.length, "js");
