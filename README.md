<p align="center">
  <img src="assets/mark.svg" alt="আমার ৬৪ — an open khata with a red kantha running stitch and a wax seal" width="128">
</p>

<h1 align="center">আমার ৬৪ · Amar 64</h1>

<p align="center"><em>৬৪ জেলার ভ্রমণ খাতা — যেখানে গেছেন, সেখানে দাগ।</em></p>

**আমার ৬৪** ("my 64") is a single-page, buildless web app that turns Bangladesh's 64
districts into a personal travel ledger. You mark the districts you have been to — and the
ones you still want to visit — on a real outline map, and the page keeps a running tally: how
many jela, what share of the country's area, which of the eight divisions are finished. When
you are done you put your name on it and take it away as an image, a poster, a story card, or
plain data. It is a khata (ledger) page: ruled paper, hairline rules, and one red kantha thread
stitched across the districts you have visited.

**Live:** https://fevnem.github.io/amar-64/

## Screenshots

| Day (khata paper) | Night (desk lamp) |
| --- | --- |
| ![The map in day mode, with districts stitched in red](docs/screenshot-day.jpg) | ![The map in night mode](docs/screenshot-night.jpg) |

Two examples, both produced by the app itself: the 1200×630
[share card](assets/og.png) and an [A4 poster](docs/sample-poster-a4.pdf).

## What you can do

- **Mark districts.** Tap a district to mark it **গেছি** (visited); switch the chip to
  **যেতে চাই** and tap for the wishlist. The keyboard works too — arrow keys move between
  districts, Enter marks them — and the search box finds any of the 64 by Bengali or English
  name, dimming everything else.
- **Division rows.** Each of the eight divisions (বিভাগ) has a row with a completion bar;
  tapping the row marks or clears that whole division at once, and **ফিরিয়ে নিন** undoes it.
- **The tally.** One progress ring (districts stitched), the share of the country's area, the
  divisions completed, and the wishlist count — the same numbers the exports carry.
- **Your name, and your face.** Type a name and pick a photo; the photo is cropped to a
  square 256×256 JPEG **in the browser** and stored on your device. Both then appear on the
  masthead and on every export.
- **A share flow built for a feed.** One **শেয়ার করুন** button opens a live 1200×630 card
  preview, drawn from your current marks, with **কার্ড নামান**, **স্টোরি কার্ড**,
  **লিংক কপি** and a native **শেয়ার করুন** (where the browser supports sharing a file, this
  hands the actual image to Instagram / Facebook / WhatsApp).
- **A share link that carries the marks.** Your visited and wishlist marks pack into a short
  URL code (`#d=…`); open that link anywhere and the same marks come back.
- **Exports.** PNG at **1× / 2× / 3×**, on a **paper**, **night** or **transparent** background,
  with optional district names and a stats strip; a vector **SVG** with the fonts embedded; an
  **A4 / A3 PDF poster** (portrait or landscape) with a real poster layout; a 9:16 **story
  card**; a 1200×630 **share card**; and **JSON** export/import of your marks.
- **Day and night.** The whole page has a night palette (a desk lamp over the khata),
  remembered between visits.

## How it works

- **Buildless.** Plain HTML, CSS and classic scripts. No bundler, no `package.json`, no
  dependencies, no build step — open the folder with any static server and it runs.
- **A frozen design system, not a pile of rules.** `css/tokens.css` holds the only colours,
  the only type scale and the only spacing steps; every other stylesheet consumes them. Red
  means exactly one thing — *I have been here* — and never a button, never a destructive
  action. District names are sized from the map's **real render scale**, so a label is ~12px
  on a desktop map and ~14px on a phone map instead of shrinking with the viewBox.
- **The map is one inline SVG.** The 64 real district outlines are pre-projected into SVG path
  strings inside `data/districts.json` (viewBox `0 0 1000 1381`); `js/map.js` fetches that file
  once, builds every district as a `<path>`, and owns the label policy (only names that fit
  their own district, no two ever touching, the rest on hover).
- **State lives in the browser.** Marks are kept in `localStorage` (`amar64.state.v1`) and can
  be encoded as a URL share code — two 64-bit bitmaps rendered to base64url in the `#d=`
  fragment.
- **Every export is generated in the browser.** PNG, story and share cards are drawn to a
  canvas and saved with a `Blob` and a temporary download link; the SVG is written out as
  vector; the PDF poster is a hand-written PDF 1.4 file (a DCTDecode image XObject and a real
  xref table); JSON is a plain serialisation of the current marks. Nothing is rendered or
  stored on a server.

## File map

| Path | What it is |
| --- | --- |
| `index.html` | The page: masthead, one-line hero, the map card beside the summary, the "খাতার সব কাজ" sheet, the phone action bar, the colophon. |
| `css/tokens.css` | The design system: colour (with the semantic red=visited rule), the type scale, spacing, radii, elevation, and the night palette. |
| `css/base.css` | Reset, element defaults and the accessibility primitives. |
| `css/layout.css` | The desktop shell: masthead, hero, the two-column grid, the breakpoint that collapses it. |
| `css/components.css` | Buttons, chips, cards, the legend, the division grid, the sheet, the share row, and the map's paint rules. |
| `css/mobile.css` | The compact phone theme: single column, the map at 52vh, the fixed action bar, 44px targets. |
| `css/fonts.css` | `@font-face` rules for the self-hosted, subset Bengali fonts. |
| `js/bn.js` | Bengali numerals, dates and small formatting helpers (`window.BN`). |
| `js/content.js` | The Bengali copy as data — divisions, division notes, tips, story copy (`window.A64C`). |
| `js/map.js` | The SVG map: districts, the red stitch, labels and their declutter policy (`window.A64M`). |
| `js/profile.js` | The traveller's name and photo, cropped and stored on the device (`window.A64P`). |
| `js/app.js` | The integration layer: state, the share code, the summary, the sheet, search, undo, the export wiring (`window.A64`). |
| `js/export-posters.js` | The PNG, SVG, story-card and share-card exports (`window.A64X`). |
| `js/pdf.js` | The hand-written A4/A3 PDF poster (`window.A64PDF`). |
| `js/share.js` | The share row and the native share sheet (`window.A64S`). |
| `data/districts.json` | The 64 district outlines as SVG path strings, plus names, divisions, centroids, areas and label sizes. |
| `assets/favicon.svg` · `assets/mark.svg` | The 48×48 favicon and the larger ledger mark used above. |
| `assets/og.png` | The 1200×630 social card, rendered by the app's own share-card export. |
| `docs/screenshot-day.jpg` · `docs/screenshot-night.jpg` | The page as it really looks, both themes. |
| `docs/sample-poster-a4.pdf` | An example A4 poster, straight out of the PDF export. |
| `fonts/` | Noto Sans Bengali and Noto Serif Bengali (OFL), self-hosted and subset — 8 `.woff2` files (Bengali and Latin subsets). |
| `.gitignore` · `LICENSE` | Housekeeping; MIT. |

## Data and credits

- **Geometry** (the 64 district outlines) comes from **geoBoundaries**, dataset
  `gbOpen`, level **BGD ADM2**, licensed **CC BY 3.0 IGO**. Attribution is required, and is
  shown in the page colophon and on every export.
- **District names, divisions and centroids** come from **ifahimreza/bangladesh-geojson**,
  under the **MIT** license.
- **Fonts** are **Noto Sans Bengali** and **Noto Serif Bengali**, self-hosted and subset
  (Bengali + Latin, `.woff2`), under the **SIL Open Font License (OFL)**, so the page makes no
  third-party font requests at runtime.
- **Areas are approximate.** Per-district areas are computed from the map geometry and
  calibrated so that all 64 districts sum to the official national total of **147,570 km²**.
  Treat the area percentage as an estimate derived from the drawing, not a survey figure.

## Local preview

The page fetches `data/districts.json`, so serve it over HTTP rather than opening the file
directly:

```sh
python3 -m http.server 8160
# then open http://127.0.0.1:8160/
```

Open the folder with any static server — there is nothing to install or build.

## Privacy

Nothing leaves the browser. There is no analytics, no cookies and no third-party requests:
fonts, data and code are all served from this origin. Your marks stay in `localStorage`, and
your name and photo stay on your device too — the photo is cropped locally and is never
uploaded anywhere. Nothing is sent until you choose to copy a share link, share a card, or
export a file.

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 tri.
