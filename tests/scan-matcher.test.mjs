import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createScanIndex, matchScanNames, normalizeScanName, scanNameQueries, clampCrop } from '../public/scan-matcher.js';
import { EN } from '../public/i18n.js';

const cards = [
  { id: 'ring', name: 'Sol Ring', type_line: 'Artifact' },
  { id: 'bolt', name: 'Lightning Bolt' },
  { id: 'tower', name: 'Command Tower' },
  { id: 'cultivate', name: 'Cultivate' },
  { id: 'forest', name: 'Forest' },
  { id: 'murder', name: 'Murder', printed_name: '살인' },
  { id: 'bolt-jp', oracle_id: 'bolt', name: 'Lightning Bolt', printed_name: '稲妻' },
  { id: 'emeritus', name: 'Emeritus of Conflict // Lightning Bolt', card_faces: [{ name:'Emeritus of Conflict' }, { name:'Lightning Bolt' }] },
  { id: 'art', name: 'Sol Ring // Sol Ring', layout: 'art_series', card_faces: [{ name: 'Sol Ring' }] },
  { id: 'dfc', name: 'Delver of Secrets // Insectile Aberration', card_faces: [{ name: 'Delver of Secrets' }, { name: 'Insectile Aberration' }] }
];
const index = createScanIndex(cards);
test('recognizes card title with trailing mana symbols and normalizes OCR punctuation', () => {
  assert.equal(matchScanNames('Sol Ring (1)\nArtifact', index)[0].card.id, 'ring');
  assert.equal(normalizeScanName('Éowyn, Shieldmaiden'), 'eowynshieldmaiden');
  assert.equal(matchScanNames('Lightning BoIt', index)[0].card.id, 'bolt');
});
test('does not invent a match for rules text, noise, or a vaguely similar short word', () => {
  for (const input of ['Artifact\nAdd two mana of any color.', 'xx #@ 79128', 'Forces', '', 'A photograph of a table']) assert.equal(matchScanNames(input, index).length, 0);
});
test('deduplicates printings by oracle identity and excludes art-series cards', () => {
  assert.equal(matchScanNames('Sol Ring', index).length, 1);
  const boltHits = matchScanNames('Lightning Bolt', index);
  assert.equal(boltHits.length, 2);
  assert.equal(boltHits[0].card.id, 'bolt');
  assert.equal(matchScanNames('Insectile Aberration', index)[0].card.id, 'dfc');
});
test('Unicode normalization retains Korean and Japanese names', () => {
  assert.equal(normalizeScanName('살인'), '살인');
  assert.equal(normalizeScanName('稲妻'), '稲妻');
  assert.equal(matchScanNames('살인', index)[0].card.id, 'murder');
  assert.equal(matchScanNames('살인 1 @', index)[0].card.id, 'murder');
  assert.equal(matchScanNames('稲妻', index)[0].card.id, 'bolt-jp');
  assert.equal(matchScanNames('稲 妻', index)[0].card.id, 'bolt-jp');
  assert.deepEqual(scanNameQueries('살인의 군주, 바알'), ['살인의 군주, 바알']);
  const translated = [{ id:'bhaal', name:'Bhaal, Lord of Murder', printed_name:'살인의 군주, 바알' }];
  assert.equal(matchScanNames('살인의 군주 바알', createScanIndex(translated))[0].card.id, 'bhaal');
});
test('crop stays within image bounds, including pointer selection at the edges', () => {
  assert.deepEqual(clampCrop({x:-8,y:-3,width:900,height:900},600,840), {x:0,y:0,width:600,height:840});
  assert.deepEqual(clampCrop({x:595,y:835,width:50,height:50},600,840), {x:595,y:835,width:5,height:5});
});
test('all scanner Korean strings have English translations, including progress and error states', async () => {
  const source = await readFile(new URL('../public/card-scanner.js', import.meta.url), 'utf8');
  const strings = [...source.matchAll(/(['"])([^'"\n]*[가-힣][^'"\n]*)\1/g)].map(m => m[2]);
  for (const key of strings) assert.ok(EN[key], `Missing scanner translation: ${key}`);
});
