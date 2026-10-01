# Toolkit guide on Teams / SharePoint

`docs/index.html` is the banker-facing guide (how to use the toolkit + how it calculates).
It is styled with the toolkit's brand tokens, so it matches neighborhoodmc.com and the app.

## Auto-updating via GitHub Pages
1. Repo Settings → Pages → Source: deploy from a branch → `main` / `/docs`.
2. The guide is served at `https://doubledekr.github.io/nmc-tookit/` and republishes on every push to `main`.
3. The header's version badge reads the latest GitHub release live.

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
When formulas in `computeAnalysis` / `amort` / Tools change, update the matching card in the
"How the math works" section and the worked example.
