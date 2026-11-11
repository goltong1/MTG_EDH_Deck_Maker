import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { FILTER_OPTIONS, emptyFilters, sectionForCard, mainDropTarget, matchesVisualFilters, visualFilterQuery } from '../public/card-filters.js';
import { EN, t, setLanguage, getLanguage } from '../public/i18n.js';
import { FORMAT_DEFS } from '../public/deck-rules.js';
import { createCardNameIndex } from '../public/card-catalog.js';

const makeCard = (type_line, extra = {}) => ({ type_line, colors: [], cmc: 0, keywords: [], rarity: 'common', ...extra });

test('exact names survive art-series aliases in either bulk order; real double-face aliases still work', () => {
  const ring = makeCard('Artifact', { name: 'Sol Ring' });
  const art = makeCard('Card // Card', { name: 'Sol Ring // Sol Ring', layout: 'art_series', card_faces: [{ name: 'Sol Ring' }, { name: 'Sol Ring' }] });
  const mdfc = makeCard('Creature // Land', { name: 'Tangletrove Kelp // Tangletrove Bridge', card_faces: [{ name: 'Tangletrove Kelp' }, { name: 'Tangletrove Bridge' }] });
  for (const cards of [[ring, art, mdfc], [art, mdfc, ring]]) {
    const index = createCardNameIndex(cards);
    assert.equal(index.get('sol ring'), ring);
    assert.equal(index.get('tangletrove kelp'), mdfc);
    assert.equal(index.get('tangletrove bridge'), mdfc);
  }
  assert.equal(createCardNameIndex([art]).has('sol ring'), false);
});

test('main-deck drops classify by type even when dropped onto another type', () => {
  for (const [type, expected] of [
    ['Artifact', 'artifact'], ['Artifact Creature — Golem', 'creature'],
    ['Enchantment Creature — God', 'creature'], ['Artifact Land', 'land'],
    ['Legendary Planeswalker — Jace', 'planeswalker'], ['Battle — Siege', 'battle'],
    ['Instant', 'instant'], ['Sorcery', 'sorcery'], ['Enchantment — Aura', 'enchantment']
  ]) {
    const card = makeCard(type);
    assert.equal(sectionForCard(card), expected);
    assert.equal(mainDropTarget(card, 'main'), expected);
    assert.equal(mainDropTarget(card, 'land'), expected);
    assert.equal(mainDropTarget(card, 'creature'), expected);
  }
});

test('front faces determine MDFC and adventure grouping', () => {
  assert.equal(sectionForCard(makeCard('Creature — Human // Land', {
    card_faces: [{ type_line: 'Creature — Human' }, { type_line: 'Land' }]
  })), 'creature');
  assert.equal(sectionForCard(makeCard('Battle — Siege // Legendary Creature — Dinosaur')), 'battle');
  assert.equal(sectionForCard(makeCard('Creature — Giant // Instant — Adventure')), 'creature');
});

test('explicit commander, sideboard and trash targets remain separate', () => {
  for (const target of ['commander', 'sideboard', 'trash']) assert.equal(mainDropTarget(makeCard('Creature'), target), target);
});

test('filter selections OR within groups and AND across groups', () => {
  const f = { ...emptyFilters(), colors: ['W', 'U'], types: ['creature', 'instant'], mana: ['2', '3'], rarities: ['rare', 'mythic'] };
  assert.equal(matchesVisualFilters(makeCard('Creature', { colors: ['U'], cmc: 2, rarity: 'rare' }), f), true);
  assert.equal(matchesVisualFilters(makeCard('Instant', { colors: ['W', 'R'], cmc: 3, rarity: 'mythic' }), f), true);
  assert.equal(matchesVisualFilters(makeCard('Creature', { colors: ['B'], cmc: 2, rarity: 'rare' }), f), false);
  assert.equal(matchesVisualFilters(makeCard('Sorcery', { colors: ['U'], cmc: 2, rarity: 'rare' }), f), false);
  assert.equal(matchesVisualFilters(makeCard('Creature', { colors: ['U'], cmc: 4, rarity: 'rare' }), f), false);
  assert.equal(visualFilterQuery(f), '(c:w or c:u) (t:creature or t:instant) (mv=2 or mv=3) (r:rare or r:mythic)');
});

test('colorless, zero mana, 7+, keyword and reset filters are distinct', () => {
  assert.equal(matchesVisualFilters(makeCard('Artifact'), { ...emptyFilters(), colors: ['C'], mana: ['0'] }), true);
  assert.equal(matchesVisualFilters(makeCard('Artifact', { colors: ['U'] }), { ...emptyFilters(), colors: ['C'] }), false);
  assert.equal(matchesVisualFilters(makeCard('Creature', { cmc: 8, keywords: ['Flying'] }), { ...emptyFilters(), mana: ['7+'], keywords: ['flying', 'haste'] }), true);
  assert.equal(matchesVisualFilters(makeCard('Creature', { cmc: 8, oracle_text: 'Creatures with flying get +1/+1.' }), { ...emptyFilters(), keywords: ['flying'] }), false);
  assert.equal(matchesVisualFilters(makeCard('Land'), emptyFilters()), true);
  assert.equal(visualFilterQuery(emptyFilters()), '');
});

test('type search can match either face without changing front-face grouping', () => {
  const card = makeCard('Creature — Human // Land', { card_faces: [{ type_line: 'Creature — Human' }, { type_line: 'Land' }] });
  assert.equal(matchesVisualFilters(card, { ...emptyFilters(), types: ['land'] }), true);
  assert.equal(sectionForCard(card), 'creature');
});

test('language switching keeps placeholders and supports every button and format hint', () => {
  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(t('새 {format} 덱', { format: 'Modern' }), 'New Modern deck');
  assert.equal(t('{count}장', { count: 1 }), '1 card');
  for (const options of Object.values(FILTER_OPTIONS)) {
    for (const [, label] of options) assert.doesNotMatch(t(label), /[가-힣]/);
  }
  for (const config of Object.values(FORMAT_DEFS)) assert.doesNotMatch(t(config.hint), /[가-힣]/);
  setLanguage('ko');
  assert.equal(t('새 {format} 덱', { format: 'Modern' }), '새 Modern 덱');
});

test('all static UI keys and literal app messages have English translations', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const keys = [
    ...[...html.matchAll(/data-i18n(?:-(?:title|placeholder|aria-label))?="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")),
    ...[...app.matchAll(/\bt\(\s*(['"])(.*?)\1/g)].map(m => m[2])
  ];
  for (const key of keys.filter(key => /[가-힣]/.test(key))) assert.ok(EN[key], `Missing English translation: ${key}`);
  for (const [key, translated] of Object.entries(EN)) {
    assert.deepEqual([...key.matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), [...translated.matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), `Placeholder mismatch: ${key}`);
  }
});
