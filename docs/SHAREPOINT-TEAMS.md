# Toolkit guide on Teams / SharePoint

`docs/index.html` is the banker-facing guide (how to use the toolkit + how it calculates).
It is styled with the toolkit's brand tokens, so it matches neighborhoodmc.com and the app.

## This branch is the docs branch — never merge it into main
`main` is the live toolkit. The guide lives only on `docs/teams-guide`, and Pages serves it from here.

## Hosting via GitHub Pages
1. Repo Settings → Pages → Source: deploy from a branch → `docs/teams-guide` / `/docs`.
2. The guide is served at `https://doubledekr.github.io/nmc-tookit/`. Pushes to this branch republish it.

## How it stays current with toolkit releases (no Action needed)
GitHub only runs release- or schedule-triggered Actions from workflow files on `main`, so a workflow on
this branch could never fire on a new release. Instead the page updates itself in the viewer's browser:
- the header badge shows the newest version, and
- "What's new" lists the latest version commits on `main` (any first line shaped `v1.4.2: what changed`).

So the existing habit — commit to main with a `vX.Y.Z: ...` message — is all it takes. Results are cached
for 30 minutes per viewer to stay well under GitHub's anonymous API limit.

> Modern SharePoint does not render uploaded .html files and strips custom HTML from pages,
> so the guide is hosted on Pages and shown inside Teams/SharePoint.

## Showing it in Teams / SharePoint
- **Teams:** channel → **+** → **Website** tab → paste the Pages URL.
- **SharePoint page:** add an **Embed** web part with the Pages URL. If blocked, a site owner adds
  `doubledekr.github.io` under Site settings → HTML Field Security.

## Brand theme for the SharePoint site
`docs/sharepoint-theme.ps1` registers an exact-match "Neighborhood Mortgage" theme. A SharePoint admin
runs it once (replace `YOURTENANT`); site owners then pick it under Settings → Change the look → Theme.

Note: the repo is public, so the guide is publicly reachable (no client data — formulas and workflow only).

## Keeping it current
Version and "What's new" are automatic. Only the explanatory sections are hand-written: when formulas in `computeAnalysis` / `amort` / Tools change, update the matching card in the
"How the math works" section and the worked example.

## App look, installers, Salesforce bookmark, videos
- Styled on the toolkit's own frame and tokens; logos in `docs/assets/` (wordmark SVG from the toolkit, icon from the desktop build).
- **Download buttons** read `releases/latest` and link straight to the newest `.exe` / `.dmg`.
- **Salesforce bookmark** screen pulls the "Copy lead for NMC" bookmarklet live from `main`'s toolkit HTML
  (`assets/sf-bookmarklet.txt` is the fallback copy), so it always matches the current app.
- **Videos:** `VIDEO_FOLDER` and `VIDEOS` at the top of the script in `index.html`.
  `series:"client"` + `step` → embedded start-to-finish player on Working a client; everything else → Library.
  Paste each video's SharePoint embed code as `embed`. Viewers need their NMC Microsoft sign-in to play.
- Quick quote and call blocks are intentionally not covered (off in the app for now).
