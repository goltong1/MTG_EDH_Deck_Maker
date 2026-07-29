import assert from 'node:assert/strict';
import {
  FORMAT_DEFS, cardCopyLimit, isFormatPlayableStatus, specialCopyLimit,
  groupedNameCounts, countEntries
} from '../public/deck-rules.js';

const basic = { name: 'Island', type_line: 'Basic Land — Island', legalities: { modern: 'legal' } };
const bolt = { name: 'Lightning Bolt', type_line: 'Instant', oracle_text: 'Lightning Bolt deals 3 damage to any target.', legalities: { modern: 'legal', commander: 'legal', vintage: 'legal' } };
const lotus = { name: 'Black Lotus', type_line: 'Artifact', legalities: { vintage: 'restricted', commander: 'banned' } };
const dwarves = { name: 'Seven Dwarves', type_line: 'Creature — Dwarf', oracle_text: 'A deck can have up to seven cards named Seven Dwarves.', legalities: { modern: 'legal' } };
const rats = { name: 'Relentless Rats', type_line: 'Creature — Rat', oracle_text: 'A deck can have any number of cards named Relentless Rats.', legalities: { commander: 'legal', modern: 'legal' } };

assert.equal(FORMAT_DEFS.standard.mainMin, 60);
assert.equal(FORMAT_DEFS.standard.sideboardMax, 15);
assert.equal(cardCopyLimit(bolt, 'modern'), 4);
assert.equal(cardCopyLimit(bolt, 'commander'), 1);
assert.equal(cardCopyLimit(lotus, 'vintage'), 1);
assert.equal(cardCopyLimit(dwarves, 'modern'), 7);
assert.equal(specialCopyLimit(rats), Infinity);
assert.equal(cardCopyLimit(basic, 'modern'), Infinity);
assert.equal(isFormatPlayableStatus('restricted'), true);
assert.equal(isFormatPlayableStatus('banned'), false);
assert.equal(countEntries([{ qty: 4 }, { qty: 2 }]), 6);
assert.equal(groupedNameCounts([[{ card: bolt, qty: 3 }], [{ card: bolt, qty: 1 }]]).get('Lightning Bolt').qty, 4);

console.log('deck-rules tests passed');
