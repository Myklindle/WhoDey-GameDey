# WhoDey GameDey (Meta Ray-Ban Display web app)

Live Bengals score, down and distance, injury report with your own "in tent / out / back in" notes, latest plays, AFC North scores and standings, and a watch test for official streaming players. Data comes from ESPN's public JSON endpoints (unofficial, no key), polled every 20 seconds.

Live at https://myklindle.github.io/WhoDey-GameDey/

## Put it on the glasses
1. Meta AI app > Settings > App Info > tap the app version 5 times > Enable (developer mode).
2. App settings > App connections > Add a Web App, and enter `https://myklindle.github.io/WhoDey-GameDey/`.
   Or scan `add-to-glasses.png` with the phone camera.
3. On the glasses, open **WhoDey GameDey**. It shows as "unverified"; that is normal.

## Files
- `index.html`, `styles.css`, `app.js`: the app. `lib.js`: data parsing, tested with `npm test`.
- `.well-known/meta-wearables-manifest.json`, `icons/bengals.svg`: name and icon the glasses read.
- `.github/workflows/pages.yml`: deploys to GitHub Pages on every push to `main`.
