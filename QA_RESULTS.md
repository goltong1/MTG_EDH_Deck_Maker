# v4.3 verification

- Node.js 22.23.4: `npm run check` passed. Deck-rule assertions and 28 regression tests passed, including modern/legacy Scryfall bulk formats, retry/error handling, card grouping, filters, bilingual strings, OCR name normalization, short translated names, face-alias ordering and crop bounds.
- Browser UI: black theme, Korean/English labels, card/text deck views, automatic type grouping, and sideboard directly below the main deck verified. A 60-card Modern test list with 15-card sideboard passed the app's basic deck check.
- Image upload: public Scryfall images for Sol Ring and Lightning Bolt produced selectable candidates and were added to the main deck/sideboard. The Korean printed Murder image was recognized after improving title-line segmentation and removing OCR mana-symbol noise. Its English card identity was added to the deck.
- Quantity and export: Commander duplicate prevention verified. Scanned Murder and sideboard Lightning Bolt quantities appeared correctly in the copied full deck list.
- Camera: no physical camera is available in the test environment. The unavailable-camera message was verified. A temporary canvas-backed MediaStream tested preview → capture → OCR (Cultivate), recognition cancellation, and track termination after capture and after closing the dialog. Temporary fixtures are excluded from this package. Physical phone camera quality, autofocus, permission prompts and device-specific orientation still need device testing.
- Mobile: 360 px iframe viewport checked, with no horizontal page or scanner-dialog overflow; the header fits one action row. Deck/text and scanner controls remain reachable.
- Japanese: model loading and the no-match/manual-correction path were exercised. A furigana-bearing Lightning Bolt printing was not recognized reliably; the option is marked β. No broad multilingual or real-world accuracy benchmark is claimed.

These are functional smoke tests, not a measured recognition-accuracy claim. OCR quality depends on the photograph and typography; candidate confirmation remains mandatory.
