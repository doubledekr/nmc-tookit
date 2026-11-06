// Inlines theme/nmc-theme.css and theme/nmc-motion.js into the single-file toolkit
// between the <style id="nmcTheme"> and <script id="nmcMotion"> markers. Run after editing either file.
//
// The inlined blocks are GENERATED, and each is stamped with a fingerprint of what was written. If a block no longer matches its
// fingerprint, someone edited the page directly (that's how the VA recoupment styles were lost in 1.20.1), so this refuses to
// overwrite it and lists the lines to move into the theme file first. --force overwrites anyway.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const dir = path.join(__dirname, ".."); const html = path.join(dir, "neighborhood-toolkit.html");
let s = fs.readFileSync(html, "utf8");
const css = fs.readFileSync(path.join(__dirname, "nmc-theme.css"), "utf8").trim();
const js = fs.readFileSync(path.join(__dirname, "nmc-motion.js"), "utf8").trim();
const force = process.argv.includes("--force");
const sha = t => crypto.createHash("sha256").update(t).digest("hex").slice(0, 16);
const STAMP = /^\/\* generated from theme\/[\w.-]+ — edit that file, not this block · ([0-9a-f]{16}) \*\/$/;
const problems = [];
const put = (open, close, body, src) => { const a = s.indexOf(open); if (a < 0) throw new Error("marker missing: " + open); const b = s.indexOf(close, a);
  const cur = s.slice(a + open.length, b).replace(/^\n/, "").replace(/\n$/, ""); const lines = cur.split("\n"); const m = STAMP.exec(lines[0] || "");
  if (m) { const rest = lines.slice(1).join("\n"); if (sha(rest) !== m[1]) {
      const have = new Set(body.split("\n").map(l => l.trim()));
      const hand = rest.split("\n").map(l => l.trim()).filter(l => l && !have.has(l));
      problems.push(src + " block was edited in the page" + (hand.length ? ":\n    " + hand.map(l => l.slice(0, 110)).join("\n    ") : " (lines removed or reordered)")); } }
  s = s.slice(0, a + open.length) + "\n/* generated from theme/" + src + " — edit that file, not this block · " + sha(body) + " */\n" + body + "\n" + s.slice(b); };
put('<style id="nmcTheme">', "</style>", css, "nmc-theme.css");
put('<script id="nmcMotion">', "</script>", js, "nmc-motion.js");
if (problems.length && !force) {
  console.error("Not inlining — the generated theme blocks were changed directly in the page, and inlining would erase that work.\n" +
    "Move these into the theme file named, then run again (or pass --force to drop them):\n  " + problems.join("\n  "));
  process.exit(1); }
fs.writeFileSync(html, s); console.log("theme inlined:", css.length, "css,", js.length, "js");
