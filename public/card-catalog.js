export function normalizeText(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US');
}

// Exact card names always win over face aliases, regardless of bulk-file order.
// Art-series faces often reuse real names (e.g. Sol Ring) but are not game cards.
export function createCardNameIndex(cards) {
  const index = new Map();
  for (const card of cards) if (card.name) index.set(normalizeText(card.name), card);
  for (const card of cards) {
    if (card.layout === 'art_series') continue;
    for (const face of card.card_faces || []) {
      if (!face.name) continue;
      const name = normalizeText(face.name);
      if (!index.has(name)) index.set(name, card);
    }
  }
  return index;
}
