# Personal site

One hand-written HTML page plus a few assets. No build step.

## Run locally
Open `index.html` in a browser, or run `python3 -m http.server` in this folder.

## Deploy to GitHub Pages
1. Create a repo named `<your-username>.github.io` (or any repo).
2. Push these files to the `main` branch.
3. Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
4. The site appears at `https://<your-username>.github.io/` within a minute or two.

## What's in here
- `index.html` — the whole page: layout, styles, and the three interactive demos (ToneViz port, Survey Makeover quiz, Tab Harbor runner).
- `assets/tabharbor-core.js` — the Tab Harbor extension's own core.js, unmodified.
- `assets/survey-data.js` — the real Survey Makeover output for the restaurant survey, translated to English.
- `assets/*.png|jpg` — screenshots, the ToneViz figure, and the portrait.
