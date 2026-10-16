# Browser PDF dependencies

- pdf-lib 1.17.1, MIT (pdf-lib.min.js)
- @pdf-lib/fontkit 1.1.1, MIT (fontkit.min.js)
- Patrick Hand and Caveat fonts: `../assets/fonts/`, SIL Open Font License 1.1 notices alongside fonts.
- DejaVu Sans fonts: `../assets/fonts/`, license alongside fonts.

JavaScript bundles were extracted from the pinned official npm packages using npm pack, which verifies registry package integrity. No credential or notebook data is contained here. They load locally from the app's own origin only when PDF export is requested; no external PDF service receives the Sheet contents.
