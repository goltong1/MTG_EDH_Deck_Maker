# Bundled OCR components

Unmodified upstream distribution files are included to avoid a runtime dependency on a public script CDN.

- Tesseract.js 6.0.1 — https://github.com/naptha/tesseract.js — Apache-2.0; see LICENSE-tesseract.js.md and the distribution LICENSE.txt files.
- tesseract.js-core 6.1.2 — https://github.com/naptha/tesseract.js-core — Apache-2.0; see core/LICENSE. SIMD and non-SIMD builds are both included so the runtime can select a compatible core.
- English, Korean and Japanese `4.0.0_best_int` traineddata from @tesseract.js-data/eng, /kor and /jpn version 1.0.0 — https://github.com/naptha/tessdata — upstream traineddata repository uses Apache-2.0; see lang/LICENSE. The npm wrapper metadata lists MIT; only its traineddata assets, not wrapper code, are included.

Model files and core distributions are unmodified. ASSETS.json records their SHA-256 hashes. OCR data does not contain a gallery of Magic card images. Card data and reference artwork are provided by Scryfall; Magic: The Gathering and related artwork belong to their respective rights holders. This is an unofficial fan tool.
