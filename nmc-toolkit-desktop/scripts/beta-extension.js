/* Turns a copy of chrome-extension/ into the "NMC Beta" extension. Beta builds only — run by scripts/beta.js in CI, where the
   checkout is thrown away afterwards. The live extension in the repo is never edited by hand for the beta.
   What changes:
     · manifest name/title → "NMC Beta — Salesforce, lender autofill & Five9 (test)"
     · talks to the beta app on 127.0.0.1:47832 (the live pair stays on 47831)
     · its on-page buttons sit bottom-LEFT, purple, labelled "BETA", and the toolbar icon carries a BETA badge,
       so the live and beta buttons never overlap or get mixed up when both extensions are on
     · adds five9-watch.js (listen-only Five9 watcher, top frame of *.lightning.force.com) and the /five9 relay in background.js
   Usage: node scripts/beta-extension.js [extensionDir]   (default ../chrome-extension). Fails loudly if a pattern isn't found,
   so a change to the live extension can't silently produce a beta that still looks/acts like the live one. */
const fs = require("fs"), path = require("path");
const dir = path.resolve((require.main === module && process.argv[2]) || path.join(__dirname, "..", "..", "chrome-extension"));   /* required from beta.js: argv[2] is the beta number, not a folder */
const src = path.join(__dirname, "..", "beta", "extension");
const BETA_PORT = 47832, PURPLE = "#5B3FA8";
const NAME = "NMC Beta — Salesforce, lender autofill & Five9 (test)";
function edit(file, fn){ const p = path.join(dir, file); const before = fs.readFileSync(p, "utf8"); const after = fn(before); fs.writeFileSync(p, after); }
function must(s, re, to, what){ if (!re.test(s)) throw new Error("beta-extension: couldn't find " + what); re.lastIndex = 0; return s.replace(re, to); }

const mf = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
if (/^NMC Beta/.test(mf.name)) { console.log("beta-extension: already applied in", dir); process.exit(0); }
mf.name = NAME;
mf.description = "BETA test build — pairs with NMC Toolkit Beta only (port " + BETA_PORT + "). Sends Salesforce leads, fills lender pricing pages, and records Five9 call events (listen-only).";
mf.action = Object.assign({}, mf.action, { default_title: "NMC BETA — send this lead to NMC Toolkit Beta" });
mf.content_scripts = (mf.content_scripts || []).concat([{ matches: ["https://*.lightning.force.com/*"], js: ["five9-watch.js"], run_at: "document_start", all_frames: false }]);
fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(mf, null, 2) + "\n");

edit("background.js", s => must(s, /const DEFAULT_PORT = 47831;/, "const DEFAULT_PORT = " + BETA_PORT + ";   /* NMC Beta: the beta app's port */", "DEFAULT_PORT")
  + fs.readFileSync(path.join(src, "background-five9.js"), "utf8"));
edit("popup.js", s => must(s, /\|\|47831/g, "||" + BETA_PORT, "popup port fallback"));
edit("popup.html", s => s.replace(/47831/g, String(BETA_PORT)).replace(/<title>NMC Toolkit<\/title>/, "<title>NMC Beta</title>").replace(/<h1>NMC Toolkit<\/h1>/, "<h1>NMC Beta</h1>").replace(/<body([^>]*)>/i, `<body$1><div style="background:${PURPLE};color:#fff;font:700 11px system-ui,sans-serif;letter-spacing:.08em;padding:4px 10px;margin:-2px 0 8px;border-radius:6px;text-align:center">BETA — pairs with NMC Toolkit Beta</div>`));
edit("content.js", s => {
  /* own class names: both extensions share the page's DOM, and the live one finds its button by class — with the same class the
     beta would adopt the live button instead of drawing its own */
  s = must(s, /\.nmc-ext-btn, \.nmc-ext-toast'/, ".nmc-ext-btn, .nmc-ext-toast, .nmc-beta-btn, .nmc-beta-toast'", "harvest skip list");
  s = s.replace(/'\.nmc-ext-btn'/g, "'.nmc-beta-btn'").replace(/className='nmc-ext-btn'/g, "className='nmc-beta-btn'")
       .replace(/'\.nmc-ext-toast'/g, "'.nmc-beta-toast'").replace(/className='nmc-ext-toast'/g, "className='nmc-beta-toast'");
  if (/'\.?nmc-ext-(btn|toast)'/.test(s)) throw new Error("beta-extension: a live class name is left in content.js");
  s = must(s, /b\.textContent='Send to NMC toolkit';/, "b.textContent='BETA \\u00b7 Send to NMC Beta';", "send button label");
  s = must(s, /(b\.style\.cssText='position:fixed;)right:18px;(bottom:18px;z-index:2147483646;)background:#A53222;/, `$1left:18px;$2background:${PURPLE};`, "send button position");
  s = must(s, /t\.textContent=msg; t\.style\.cssText='position:fixed;left:50%;bottom:72px;transform:translateX\(-50%\);background:'\+\(ok\?'#23242B'/,
    `t.textContent='BETA \\u00b7 '+msg; t.style.cssText='position:fixed;left:18px;bottom:72px;background:'+(ok?'${PURPLE}'`, "toast");
  return s; });
edit("lender-fill.js", s => {
  s = must(s, /const CSS = "position:fixed;right:18px;/, 'const CSS = "position:fixed;left:18px;', "fill button position");
  s = must(s, /btn\.textContent = "Fill from NMC Toolkit";/, 'btn.textContent = "BETA \\u00b7 Fill from NMC Beta";', "fill button label");
  s = must(s, /btn\.style\.cssText = CSS \+ ";background:#A53222;/, `btn.style.cssText = CSS + ";background:${PURPLE};`, "fill button color");
  s = must(s, /className = "nmc-lf-panel"/, 'className = "nmc-beta-lf-panel"', "panel class");
  s = must(s, /className = "nmc-lf-btn"/, 'className = "nmc-beta-lf-btn"', "fill button class");
  return s; });
fs.copyFileSync(path.join(src, "five9-watch.js"), path.join(dir, "five9-watch.js"));
const left = ["background.js", "popup.js", "content.js", "lender-fill.js"].filter(f => /\b47831\b/.test(fs.readFileSync(path.join(dir, f), "utf8")));
if (left.length) throw new Error("beta-extension: live port 47831 still in " + left.join(", "));
console.log("beta-extension:", mf.name, "→ port", BETA_PORT, "in", dir);
