# NMC theme

The shared look for Neighborhood Mortgage tools — the Toolkit and the Rate Desk.

- `nmc-theme.css` — red + glass styling, drawn-icon sizing, pipeline cues, entrance/snap/unfold animations. Layered on top of each app's own CSS.
- `nmc-motion.js` — `window.NMC`: emoji→icon swap, number ticks (`data-tick`), entrance window (`NMC.enter()`), chart draw, copy morph, drawer snap, exit animations. Respects reduced-motion; pauses when the window is hidden.
- `inline.js` — writes both files into `neighborhood-toolkit.html` between the `<style id="nmcTheme">` / `<script id="nmcMotion">` markers. **Run `node banker-toolkit/theme/inline.js` after editing either file**, before building.

The Rate Desk repo keeps copies in `app/theme/`; change these first, then copy them over.

Design method: the "unslop" passes (spacing → color → icons → copy → type → layout → details → visuals → motion), CC BY 4.0, Damir Sokolovsky — https://github.com/heydamir/unslop
