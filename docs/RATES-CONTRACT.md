# rates.json — the contract between the Rate Desk and the NMC Toolkit

The two apps release independently. This file is what keeps them compatible: the Rate Desk writes it, the
Toolkit reads it, and neither side changes it without following the rules at the bottom.

## Files

| Path | Written by | Read by |
| --- | --- | --- |
| `rates/rates.json` | Rate Desk, on every publish | Toolkit (poll every 2 min; instantly on a ping) |
| `rates/history.json` | Rate Desk, appended on every publish, trimmed to 90 days | Toolkit (My desk chart) |

## rates.json (format 2)

```json
{
  "format": 2,
  "version": "2026-11-03T20:55:26Z",
  "published": "2026-11-03T20:55:26Z",
  "by": "NMC Rate Desk",
  "note": "optional free text shown on the toolkit banner",
  "ping": { "server": "https://ntfy.sh", "topic": "nmc-rates-…" },
  "products": {
    "va_irrrl": {
      "label": "VA Streamline",
      "tiers": { "640+": 6.375, "620-639": 6.5, "580-619": 6.75, "<580": 7.0 }
    }
  }
}
```

- `format` — integer. The Toolkit knows format ≤ 2. A file with a higher number is left unread and the Toolkit tells the banker to update.
- `version` — changes on every publish; the Toolkit compares this string to decide "new rates arrived". Nothing else triggers a banner.
- `published` — ISO-8601 UTC. Used for timestamps and the "new this week" window.
- `ping` — where the Rate Desk posts a wake-up after each publish. The Toolkit subscribes to `server/topic/sse`. The ping carries no rates; the Toolkit always re-reads this file.
- `products.<key>.tiers` — rates in percent, number, by credit tier. Keys are exact strings. The Toolkit uses `va_irrrl` today; other product keys are ignored until it learns them.
- Credit tiers (format 2): `640+`, `620-639`, `580-619`, `<580`. A client's score maps to the first tier whose range contains it; a client with no score is tested against `620-639` (a toolkit setting).

Format 1 (retired) used seven tiers. Toolkits still read it by mapping `680+` → `640+` and `600-619` → `580-619`.

## history.json

A JSON array, newest first, each entry the same object as rates.json (without `ping`). Trimmed to 90 days.

## Rules for changing this

1. **Adding** a field, a product key or metadata: no format bump. Toolkits ignore what they don't know.
2. **Renaming or removing** a field, or changing tier names: bump `format`. Ship the Toolkit that reads the new format *first*, wait until bankers have updated (the Toolkit auto-updates within minutes), then ship the Rate Desk that writes it. The Toolkit must keep reading the previous format for at least one release.
3. Never change the meaning of an existing field without a bump.
4. A Rate Desk update that doesn't touch this file can ship any time; a Toolkit update that doesn't touch its reader can ship any time.

## How the toolkit reads the file (v1.10.5+)

- The format is decided by the `format` field only — never by which tier names are present.
- No `format` field = format 1: the seven old tier names, mapped onto the four (680+ → 640+, 620-639, 600-619 → 580-619, <580).
- `format: 2`: only `640+`, `620-639`, `580-619`, `<580` are read. The old names a format-2 publish also carries (for toolkits that haven't updated) are ignored.
- A format higher than the toolkit knows is left unread; the last good rates stay in place and Settings says to update.

## Market notes (toolkit v1.14.1+)

The toolkit also reads `rates/market.json` (market format 1) and `rates/market-history.json` from the same feed location,
exactly as described in the Rate Desk's CONTRACT.md:

- A new `id` shows a lighter banner under the rate banner (kind label, title, text, and the rate desk's quoted `comment` when present).
  It never changes rates, eligibility, the "now eligible" list or the rate banner.
- The ntfy ping body now says what changed: `{"kind":"market"}` re-reads market.json, `{"kind":"rates"}` re-reads rates.json,
  anything else re-reads both. Both files are also polled every 2 minutes.
- A 404 on either file means "no notes yet" and is silent. A `format` above 1 is left unread and the status line asks for an update.
- Unknown `kind`s show like any other note. `broadcast` is a message written by the rate desk.
- `rates.json` → `market.lean` shows as a small badge on the rate banner and on My desk (Improving / Worsening / Choppy / Steady,
  the `line` as a tooltip). Informational only; absent → nothing shown.
- My desk lists the last 30 days of notes from market-history.json (refreshed every 30 minutes).
- The default feed location is now `https://raw.githubusercontent.com/doubledekr/NMC-rate-desk/main/rates/` (the renamed repo; GitHub redirects the old name).
