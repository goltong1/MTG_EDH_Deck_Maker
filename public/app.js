import { FORMAT_DEFS, formatConfig, cardCopyLimit, isFormatPlayableStatus, legalityStatus, groupedNameCounts } from './deck-rules.js';

const SECTION_DEFS = [
  ['creature', '생물', '♞'],
  ['instant', '순간마법', 'ϟ'],
  ['sorcery', '집중마법', '✦'],
  ['artifact', '마법물체', '⬡'],
  ['enchantment', '부여마법', '◈'],
  ['planeswalker', '플레인즈워커', '✧'],
  ['battle', '전투', '⚑'],
  ['land', '대지', '⌂'],
  ['other', '기타', '◇']
];

const COLOR_NAMES = { W: '백', U: '청', B: '흑', R: '적', G: '녹' };
const STORAGE_KEY = 'commander-canvas.deck.v1';
const SEARCH_SOURCE_KEY = 'commander-canvas.search-source.v1';
const LOCAL_DB_CONFIG_KEY = 'commander-canvas.local-db-config.v2';
const LOCAL_DB_NAME = 'commander-canvas-card-db';
const LOCAL_DB_STORE = 'data';
const LOCAL_DB_VERSION = 1;
const SCRYFALL_API = 'https://api.scryfall.com';
let localCards = [];
let localByName = new Map();
let localById = new Map();
let scryfallRequestChain = Promise.resolve();
let nextScryfallRequestAt = 0;
const state = {
  deckName: '새 커맨더 덱',
  format: 'commander',
  commanders: [],
  sideboard: [],
  sections: Object.fromEntries(SECTION_DEFS.map(([id]) => [id, []])),
  searchResults: [],
  searchMap: new Map(),
  symbolMap: new Map(),
  query: '',
  page: 1,
  totalCards: 0,
  hasMore: false,
  view: 'grid',
  dirty: false,
  importMode: false,
  exportFormat: 'arena',
  searchSource: localStorage.getItem(SEARCH_SOURCE_KEY) || 'auto',
  lastSearchSource: 'online',
  localDb: { ready: false, updating: false, cardCount: 0, autoUpdate: false, autoUpdateDays: 1 }
};

const el = id => document.getElementById(id);
const elements = {
  searchForm: el('searchForm'), searchInput: el('searchInput'), searchResults: el('searchResults'),
  searchEmpty: el('searchEmpty'), resultCount: el('resultCount'), pagination: el('pagination'),
  prevPageBtn: el('prevPageBtn'), nextPageBtn: el('nextPageBtn'), pageLabel: el('pageLabel'),
  legalOnly: el('legalOnly'), languageFilter: el('languageFilter'), searchSource: el('searchSource'), suggestions: el('suggestions'),
  deckSections: el('deckSections'), commanderZone: el('commanderZone'), commanderCards: el('commanderCards'), commanderPlaceholder: el('commanderPlaceholder'),
  sideboardZone: el('sideboardZone'), sideboardCards: el('sideboardCards'), sideboardPlaceholder: el('sideboardPlaceholder'),
  deckName: el('deckName'), totalCount: el('totalCount'), avgMana: el('avgMana'), landCount: el('landCount'),
  commanderCount: el('commanderCount'), sideboardCount: el('sideboardCount'), deckIdentity: el('deckIdentity'), autosaveStatus: el('autosaveStatus'),
  deckFormat: el('deckFormat'), formatRuleHint: el('formatRuleHint'), totalTargetLabel: el('totalTargetLabel'), legalOnlyLabel: el('legalOnlyLabel'),
  commanderQuickFilter: el('commanderQuickFilter'), popularQuickFilter: el('popularQuickFilter'), mainDeckHeading: el('mainDeckHeading'),
  validationSummary: el('validationSummary'), validationIssues: el('validationIssues'), validityBadge: el('validityBadge'),
  manaCurve: el('manaCurve'), typeBreakdown: el('typeBreakdown'), toastStack: el('toastStack'),
  cardDialog: el('cardDialog'), cardDialogContent: el('cardDialogContent'), textDialog: el('textDialog'),
  textDialogTitle: el('textDialogTitle'), textDialogEyebrow: el('textDialogEyebrow'), textDialogHelp: el('textDialogHelp'),
  deckTextArea: el('deckTextArea'), textDialogConfirm: el('textDialogConfirm'), trashZone: el('trashZone'),
  exportFormatRow: el('exportFormatRow'), exportFormat: el('exportFormat'), downloadDeckTextBtn: el('downloadDeckTextBtn'),
  localDbDialog: el('localDbDialog'), localDbStrip: el('localDbStrip'), localDbDot: el('localDbDot'),
  localDbMiniStatus: el('localDbMiniStatus'), localDbStatusText: el('localDbStatusText'), localDbCardCount: el('localDbCardCount'),
  localDbBuiltAt: el('localDbBuiltAt'), localDbSourceAt: el('localDbSourceAt'), localDbAutoUpdate: el('localDbAutoUpdate'),
  localDbAutoDays: el('localDbAutoDays'), updateLocalDbBtn: el('updateLocalDbBtn'), saveLocalDbConfigBtn: el('saveLocalDbConfigBtn')
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch]);
}

function cardOracle(card) {
  return card.oracle_text || card.card_faces?.map(face => face.oracle_text).filter(Boolean).join('\n//\n') || '';
}
function cardMana(card) {
  return card.mana_cost || card.card_faces?.map(face => face.mana_cost).filter(Boolean).join(' // ') || '';
}
function cardImage(card, size = 'normal') {
  return card.image_uris?.[size] || card.card_faces?.find(face => face.image_uris)?.image_uris?.[size] || '';
}
function cardName(card) { return card.name || card.card_faces?.map(face => face.name).join(' // ') || '이름 없음'; }
function entryKey(card) { return card.oracle_id || card.id || cardName(card).toLowerCase(); }
function isBasicLand(card) { return /Basic Land/i.test(card.type_line || ''); }
function currentFormat() { return formatConfig(state.format); }
function isCommanderMode() { return currentFormat().mode === 'commander'; }
function allowsMultiple(card) { return cardCopyLimit(card, state.format) > 1; }
function totalEntryQty(entries) { return entries.reduce((sum, entry) => sum + entry.qty, 0); }
function allMainEntries() { return Object.values(state.sections).flat(); }
function allEntries() { return isCommanderMode() ? [...state.commanders, ...allMainEntries()] : [...allMainEntries(), ...state.sideboard]; }
function allCardsExpanded() { return allEntries().flatMap(entry => Array.from({ length: entry.qty }, () => entry.card)); }
function sideboardCardsExpanded() { return state.sideboard.flatMap(entry => Array.from({ length: entry.qty }, () => entry.card)); }

function sectionForCard(card) {
  const type = card.type_line || '';
  if (/Land/i.test(type)) return 'land';
  if (/Creature/i.test(type)) return 'creature';
  if (/Instant/i.test(type)) return 'instant';
  if (/Sorcery/i.test(type)) return 'sorcery';
  if (/Artifact/i.test(type)) return 'artifact';
  if (/Enchantment/i.test(type)) return 'enchantment';
  if (/Planeswalker/i.test(type)) return 'planeswalker';
  if (/Battle/i.test(type)) return 'battle';
  return 'other';
}

function renderMana(text = '') {
  let html = escapeHtml(text).replace(/\n/g, '<br>');
  return html.replace(/\{[^}]+\}/g, symbol => {
    const uri = state.symbolMap.get(symbol);
    return uri ? `<img class="mana-symbol" src="${escapeHtml(uri)}" alt="${escapeHtml(symbol)}" title="${escapeHtml(symbol)}">` : escapeHtml(symbol);
  });
}

function toast(message, type = '') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  elements.toastStack.append(node);
  setTimeout(() => node.remove(), 3200);
}

function markDirty() {
  state.dirty = true;
  elements.autosaveStatus.textContent = '저장되지 않은 변경사항';
}

function persistDeck(showToast = false) {
  const payload = {
    version: 2,
    deckName: state.deckName,
    format: state.format,
    commanders: state.commanders,
    sideboard: state.sideboard,
    sections: state.sections,
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  state.dirty = false;
  elements.autosaveStatus.textContent = `브라우저에 저장됨 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
  if (showToast) toast('덱을 브라우저에 저장했습니다.', 'success');
}

function loadSavedDeck() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    state.deckName = saved.deckName || state.deckName;
    state.format = FORMAT_DEFS[saved.format] ? saved.format : 'commander';
    state.commanders = Array.isArray(saved.commanders) ? saved.commanders : [];
    state.sideboard = Array.isArray(saved.sideboard) ? saved.sideboard : [];
    for (const [id] of SECTION_DEFS) state.sections[id] = Array.isArray(saved.sections?.[id]) ? saved.sections[id] : [];
    elements.deckName.value = state.deckName;
    elements.autosaveStatus.textContent = '저장된 덱을 불러옴';
  } catch {
    toast('저장된 덱을 읽지 못했습니다.', 'error');
  }
}

function createSections() {
  const template = el('sectionTemplate');
  for (const [id, name, icon] of SECTION_DEFS) {
    const section = template.content.firstElementChild.cloneNode(true);
    section.dataset.section = id;
    section.querySelector('.section-icon').textContent = icon;
    section.querySelector('.section-name').textContent = name;
    section.querySelector('.section-header').addEventListener('click', () => section.classList.toggle('collapsed'));
    setupDropZone(section, id);
    elements.deckSections.append(section);
  }
}

function setDragData(event, payload) {
  event.dataTransfer.effectAllowed = 'copyMove';
  event.dataTransfer.setData('application/x-commander-card', JSON.stringify(payload));
  event.dataTransfer.setData('text/plain', payload.cardId || 'card');
}
function getDragData(event) {
  try { return JSON.parse(event.dataTransfer.getData('application/x-commander-card')); }
  catch { return null; }
}

function setupDropZone(node, targetSection) {
  node.addEventListener('dragover', event => {
    event.preventDefault();
    event.dataTransfer.dropEffect = targetSection === 'trash' ? 'move' : 'copy';
    node.classList.add('drag-over');
  });
  node.addEventListener('dragleave', event => {
    if (!node.contains(event.relatedTarget)) node.classList.remove('drag-over');
  });
  node.addEventListener('drop', event => {
    event.preventDefault();
    node.classList.remove('drag-over');
    const payload = getDragData(event);
    if (!payload) return;
    if (targetSection === 'trash') {
      if (payload.source === 'deck') removeDeckEntry(payload.fromSection, payload.entryKey);
      return;
    }
    handleDrop(payload, targetSection);
  });
}

function findSearchCard(cardId) { return state.searchMap.get(cardId); }
function listForSection(section) {
  if (section === 'commander') return state.commanders;
  if (section === 'sideboard') return state.sideboard;
  return state.sections[section];
}

function findDeckEntry(section, key) {
  return listForSection(section)?.find(entry => entryKey(entry.card) === key);
}

function removeDeckEntry(section, key, all = true) {
  const list = listForSection(section);
  if (!list) return;
  const idx = list.findIndex(entry => entryKey(entry.card) === key);
  if (idx < 0) return;
  if (!all && list[idx].qty > 1) list[idx].qty -= 1;
  else list.splice(idx, 1);
  markDirty(); renderDeck();
}

function isCommanderCandidate(card) {
  const type = card.type_line || '';
  const text = cardOracle(card);
  return /Legendary Creature/i.test(type) || /can be your commander/i.test(text) || /Legendary Enchantment.*Background/i.test(type);
}

function copiesAcrossDeck(card) {
  const name = cardName(card);
  return allEntries().filter(entry => cardName(entry.card) === name).reduce((sum, entry) => sum + entry.qty, 0);
}

function canIncreaseCard(card, amount = 1) {
  const limit = cardCopyLimit(card, state.format);
  return !Number.isFinite(limit) || copiesAcrossDeck(card) + amount <= limit;
}

function copyLimitMessage(card) {
  const limit = cardCopyLimit(card, state.format);
  const format = currentFormat();
  if (!Number.isFinite(limit)) return '';
  if (limit === 1 && legalityStatus(card, state.format) === 'restricted') return `${format.label} 제한 카드는 메인 덱과 사이드보드를 합쳐 1장만 사용할 수 있습니다.`;
  return isCommanderMode()
    ? `${format.label}에서는 ${cardName(card)}을(를) 덱 전체에 ${limit}장까지 사용할 수 있습니다.`
    : `${format.label}에서는 ${cardName(card)}을(를) 메인 덱과 사이드보드 합계 ${limit}장까지 사용할 수 있습니다.`;
}

function addCard(card, section = sectionForCard(card), quantity = 1, quiet = false) {
  if (!card) return;
  const qty = Math.max(1, Number(quantity || 1));

  if (section === 'commander') {
    if (!isCommanderMode()) {
      if (!quiet) toast('현재 포맷에는 커맨드 존이 없습니다.', 'error');
      return;
    }
    if (!isCommanderCandidate(card)) {
      if (!quiet) toast('이 카드는 기본적으로 커맨더로 지정할 수 없습니다.', 'error');
      return;
    }
    if (state.commanders.some(entry => cardName(entry.card) === cardName(card))) return;
    if (state.commanders.length >= 2) {
      if (!quiet) toast('커맨더 영역에는 최대 2장까지만 놓을 수 있습니다.', 'error');
      return;
    }
    state.commanders.push({ card, qty: 1 });
  } else {
    if (section === 'sideboard' && isCommanderMode()) section = sectionForCard(card);
    const list = listForSection(section) || state.sections.other;
    const key = entryKey(card);
    const existing = list.find(entry => entryKey(entry.card) === key);

    if (!quiet && !canIncreaseCard(card, qty)) {
      toast(copyLimitMessage(card), 'error');
      return;
    }

    if (existing) existing.qty += qty;
    else list.push({ card, qty });
  }
  markDirty(); renderDeck();
  if (!quiet) toast(`${cardName(card)} 추가`, 'success');
}

function handleDrop(payload, targetSection) {
  if (payload.source === 'search') {
    addCard(findSearchCard(payload.cardId), targetSection);
    return;
  }
  if (payload.source !== 'deck' || payload.fromSection === targetSection) return;

  const sourceList = listForSection(payload.fromSection);
  const sourceIndex = sourceList?.findIndex(entry => entryKey(entry.card) === payload.entryKey) ?? -1;
  if (sourceIndex < 0) return;
  const entry = sourceList[sourceIndex];
  const card = entry.card;

  if (targetSection === 'commander') {
    if (!isCommanderMode()) return toast('현재 포맷에는 커맨드 존이 없습니다.', 'error');
    if (!isCommanderCandidate(card)) return toast('이 카드는 기본적으로 커맨더로 지정할 수 없습니다.', 'error');
    if (entry.qty !== 1) return toast('커맨더로 옮기려면 카드 수량을 1장으로 맞춰주세요.', 'error');
    if (state.commanders.length >= 2) return toast('커맨더 영역에는 최대 2장까지만 놓을 수 있습니다.', 'error');
    if (state.commanders.some(item => cardName(item.card) === cardName(card))) return;
  }

  if (targetSection === 'sideboard' && isCommanderMode()) return toast('Commander 포맷에는 사이드보드 영역을 사용하지 않습니다.', 'error');
  const destination = targetSection === 'commander' ? state.commanders : (listForSection(targetSection) || state.sections.other);
  const existing = targetSection === 'commander' ? null : destination.find(item => entryKey(item.card) === entryKey(card));

  if (isCommanderMode() && targetSection !== 'commander' && existing && !allowsMultiple(card)) {
    return toast('Commander 덱의 같은 이름 카드는 기본적으로 1장만 사용할 수 있습니다.', 'error');
  }

  sourceList.splice(sourceIndex, 1);
  if (targetSection === 'commander') destination.push({ card, qty: 1 });
  else if (existing) existing.qty += entry.qty;
  else destination.push(entry);
  markDirty();
  renderDeck();
}

function moveEntriesToMain(entries) {
  for (const entry of entries) {
    const section = sectionForCard(entry.card);
    const list = state.sections[section] || state.sections.other;
    const existing = list.find(item => entryKey(item.card) === entryKey(entry.card));
    if (existing) existing.qty += entry.qty;
    else list.push(entry);
  }
}

function changeFormat(nextFormat) {
  if (!FORMAT_DEFS[nextFormat] || nextFormat === state.format) return;
  const wasCommander = isCommanderMode();
  const willCommander = formatConfig(nextFormat).mode === 'commander';
  if (wasCommander && !willCommander && state.commanders.length) {
    moveEntriesToMain(state.commanders);
    state.commanders = [];
  }
  if (!wasCommander && willCommander && state.sideboard.length) {
    moveEntriesToMain(state.sideboard);
    state.sideboard = [];
  }
  state.format = nextFormat;
  markDirty();
  renderDeck();
  searchCards(state.query, 1);
  toast(`${currentFormat().label} 포맷으로 변경했습니다. 기존 카드는 삭제하지 않고 새 규칙으로 검사합니다.`, 'success');
}

function renderFormatUi() {
  const format = currentFormat();
  elements.deckFormat.value = state.format;
  elements.formatRuleHint.textContent = format.hint;
  elements.commanderZone.classList.toggle('hidden', format.mode !== 'commander');
  elements.sideboardZone.classList.toggle('hidden', format.mode === 'commander');
  elements.commanderQuickFilter.classList.toggle('hidden', format.mode !== 'commander');
  elements.popularQuickFilter.textContent = format.mode === 'commander' ? 'EDH 인기' : '포맷 전체';
  elements.legalOnlyLabel.textContent = `${format.label} 사용 가능`;
  elements.mainDeckHeading.textContent = format.mode === 'commander' ? '메인 덱 구성' : `${format.label} 메인 덱`;
  elements.totalTargetLabel.textContent = format.mode === 'commander' ? '/ 100장' : `/ ${format.mainMin}+장`;
}

function renderDeck() {
  renderFormatUi();
  elements.deckName.value = state.deckName;
  elements.commanderCards.innerHTML = '';
  for (const entry of state.commanders) elements.commanderCards.append(createDeckCard(entry, 'commander', 'commander'));
  elements.commanderPlaceholder.style.display = state.commanders.length >= 2 ? 'none' : '';
  elements.commanderCount.textContent = `${state.commanders.length} / 1–2`;

  elements.sideboardCards.innerHTML = '';
  for (const entry of state.sideboard) elements.sideboardCards.append(createDeckCard(entry, 'sideboard', 'sideboard'));
  elements.sideboardPlaceholder.style.display = state.sideboard.length ? 'none' : '';
  elements.sideboardCount.textContent = `${totalEntryQty(state.sideboard)} / ${currentFormat().sideboardMax || 0}`;

  for (const [id] of SECTION_DEFS) {
    const sectionNode = elements.deckSections.querySelector(`[data-section="${id}"]`);
    const body = sectionNode.querySelector('.section-body');
    body.innerHTML = '';
    for (const entry of state.sections[id]) body.append(createDeckCard(entry, id, 'main'));
    sectionNode.querySelector('.section-count').textContent = `${totalEntryQty(state.sections[id])}장`;
  }
  updateAnalyticsAndValidation();
}

function createDeckCard(entry, section, variant = 'main') {
  const card = entry.card;
  const commander = variant === 'commander';
  const sideboard = variant === 'sideboard';
  const node = document.createElement('article');
  node.className = commander ? 'commander-card' : sideboard ? 'sideboard-card' : 'deck-card';
  node.draggable = true;
  node.title = `${cardName(card)}\n${card.type_line || ''}`;
  const showQtyControls = !commander && (isCommanderMode() ? allowsMultiple(card) : true);
  node.innerHTML = `
    <img src="${escapeHtml(cardImage(card, commander ? 'normal' : 'small'))}" alt="${escapeHtml(cardName(card))}" loading="lazy">
    <button class="remove-card" title="제거" aria-label="제거">×</button>
    ${!commander && entry.qty > 1 ? `<span class="qty-pill">×${entry.qty}</span>` : ''}
    ${showQtyControls ? `<span class="qty-controls"><button data-qty="minus">−</button><button data-qty="plus">+</button></span>` : ''}
  `;
  node.addEventListener('dragstart', event => setDragData(event, { source: 'deck', cardId: card.id, fromSection: section, entryKey: entryKey(card) }));
  node.addEventListener('dblclick', () => showCardDialog(card));
  node.querySelector('.remove-card').addEventListener('click', event => { event.stopPropagation(); removeDeckEntry(section, entryKey(card)); });
  node.querySelectorAll('[data-qty]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    if (button.dataset.qty === 'plus') {
      if (!canIncreaseCard(card, 1)) return toast(copyLimitMessage(card), 'error');
      entry.qty += 1;
    } else if (entry.qty > 1) entry.qty -= 1;
    else return removeDeckEntry(section, entryKey(card));
    markDirty(); renderDeck();
  }));
  return node;
}

function commanderIdentity() {
  return new Set(state.commanders.flatMap(entry => entry.card.color_identity || []));
}
function subsetOf(values, allowed) { return (values || []).every(value => allowed.has(value)); }

function partnerText(card) { return `${cardOracle(card)} ${(card.keywords || []).join(' ')}`; }
function commanderPairCompatible(a, b) {
  const ta = partnerText(a), tb = partnerText(b);
  if (/Choose a Background/i.test(ta) && /Background/i.test(b.type_line || '')) return true;
  if (/Choose a Background/i.test(tb) && /Background/i.test(a.type_line || '')) return true;
  if (/Doctor's companion/i.test(ta) && /Time Lord Doctor/i.test(b.type_line || '')) return true;
  if (/Doctor's companion/i.test(tb) && /Time Lord Doctor/i.test(a.type_line || '')) return true;
  if (/Friends forever/i.test(ta) && /Friends forever/i.test(tb)) return true;
  if (/Partner/i.test(ta) && /Partner/i.test(tb)) return true;
  const aPartnerWith = ta.match(/Partner with ([^\n.(]+)/i)?.[1]?.trim();
  const bPartnerWith = tb.match(/Partner with ([^\n.(]+)/i)?.[1]?.trim();
  return aPartnerWith === cardName(b) || bPartnerWith === cardName(a);
}

function validateDeck() {
  const errors = [], warnings = [];
  const format = currentFormat();
  const mainCount = totalEntryQty(allMainEntries());
  const sideboardCount = totalEntryQty(state.sideboard);
  const total = isCommanderMode() ? mainCount + state.commanders.length : mainCount + sideboardCount;

  if (isCommanderMode()) {
    const identity = commanderIdentity();
    if (state.commanders.length === 0) errors.push('커맨더를 1장 이상 지정하세요.');
    if (state.commanders.length > 2) errors.push('커맨더는 최대 2장입니다.');
    if (state.commanders.length === 2 && !commanderPairCompatible(state.commanders[0].card, state.commanders[1].card)) {
      warnings.push('두 커맨더의 Partner·Background 등 동시 사용 조건을 직접 확인하세요.');
    }
    if (total !== format.exactTotal) errors.push(`현재 ${total}장입니다. 커맨더를 포함해 정확히 ${format.exactTotal}장이 필요합니다.`);

    const byName = groupedNameCounts([state.commanders, allMainEntries()]);
    for (const [name, item] of byName) {
      const limit = cardCopyLimit(item.card, state.format);
      if (Number.isFinite(limit) && item.qty > limit) errors.push(`중복 카드: ${name} ×${item.qty} · 허용 ${limit}장`);
    }

    for (const entry of allEntries()) {
      const card = entry.card;
      const legality = legalityStatus(card, state.format);
      if (!isFormatPlayableStatus(legality)) errors.push(`${cardName(card)}: Commander에서 ${legality}`);
      if (state.commanders.length && !subsetOf(card.color_identity, identity)) errors.push(`${cardName(card)}의 색 정체성이 커맨더 범위를 벗어납니다.`);
    }
    if (state.commanders.length && identity.size === 0) warnings.push('무색 커맨더 덱으로 검사 중입니다.');
  } else {
    if (mainCount < format.mainMin) errors.push(`메인 덱이 ${mainCount}장입니다. ${format.label}는 최소 ${format.mainMin}장이 필요합니다.`);
    if (sideboardCount > format.sideboardMax) errors.push(`사이드보드가 ${sideboardCount}장입니다. 최대 ${format.sideboardMax}장까지 사용할 수 있습니다.`);

    const byName = groupedNameCounts([allMainEntries(), state.sideboard]);
    for (const [name, item] of byName) {
      const limit = cardCopyLimit(item.card, state.format);
      if (Number.isFinite(limit) && item.qty > limit) {
        const restricted = legalityStatus(item.card, state.format) === 'restricted';
        errors.push(`${name} ×${item.qty}: ${restricted ? '제한 카드라 합계 1장만' : `메인 덱과 사이드보드 합계 ${limit}장까지`} 사용할 수 있습니다.`);
      }
    }

    for (const entry of allEntries()) {
      const card = entry.card;
      const legality = legalityStatus(card, state.format);
      if (!isFormatPlayableStatus(legality)) errors.push(`${cardName(card)}: ${format.label}에서 ${legality}`);
      else if (legality === 'restricted') warnings.push(`${cardName(card)}은(는) ${format.label} 제한 카드이며 합계 1장만 허용됩니다.`);
    }
    if (['historic', 'timeless', 'alchemy'].includes(state.format)) warnings.push('Arena 디지털 포맷은 BO3 사이드보드 최대 15장 기준으로 검사합니다. BO1 이벤트는 더 작은 제한이 적용될 수 있습니다.');
  }

  return {
    errors: [...new Set(errors)], warnings: [...new Set(warnings)],
    mainCount, sideboardCount, total
  };
}

function updateAnalyticsAndValidation() {
  const mainCards = allMainEntries().flatMap(entry => Array.from({ length: entry.qty }, () => entry.card));
  const format = currentFormat();
  const mainCount = mainCards.length;
  const sideboardCount = sideboardCardsExpanded().length;
  const commanderTotal = mainCount + state.commanders.length;
  const displayTotal = isCommanderMode() ? commanderTotal : mainCount;
  const nonlands = mainCards.filter(card => !/Land/i.test(card.type_line || ''));
  const avg = nonlands.length ? nonlands.reduce((sum, card) => sum + Number(card.cmc || 0), 0) / nonlands.length : 0;
  const lands = mainCards.filter(card => /Land/i.test(card.type_line || '')).length;
  const identity = [...commanderIdentity()];

  elements.totalCount.textContent = displayTotal;
  elements.avgMana.textContent = avg.toFixed(2);
  elements.landCount.textContent = lands;
  elements.deckIdentity.textContent = isCommanderMode()
    ? `색 정체성: ${identity.length ? identity.map(c => COLOR_NAMES[c]).join('·') : (state.commanders.length ? '무색' : '미지정')}`
    : `${format.label} · 사이드보드 ${sideboardCount}/${format.sideboardMax}`;

  const validation = validateDeck();
  const isValid = validation.errors.length === 0;
  elements.validityBadge.className = `status-badge ${isValid ? 'good' : (validation.errors.length ? 'bad' : 'neutral')}`;
  elements.validityBadge.textContent = isValid ? '규칙 통과' : validation.errors.length ? '수정 필요' : '작성 중';

  if (isCommanderMode()) {
    elements.validationSummary.innerHTML = `
      <div><strong>${commanderTotal}</strong><span>전체 카드</span></div>
      <div><strong>${state.commanders.length}</strong><span>커맨더</span></div>
      <div><strong>${format.exactTotal - commanderTotal}</strong><span>남은 장수</span></div>`;
  } else {
    elements.validationSummary.innerHTML = `
      <div><strong>${mainCount}</strong><span>메인 덱</span></div>
      <div><strong>${sideboardCount}</strong><span>사이드보드</span></div>
      <div><strong>${Math.max(0, format.mainMin - mainCount)}</strong><span>메인 부족</span></div>`;
  }

  const issues = [
    ...(isValid ? [{ type: 'ok', text: `${format.label} 기본 덱 구성 검사를 통과했습니다.` }] : []),
    ...validation.errors.map(text => ({ type: 'error', text })),
    ...validation.warnings.map(text => ({ type: 'warning', text }))
  ];
  if (!issues.length) issues.push({ type: 'warning', text: '카드를 추가하면 장수·복사 제한·포맷 합법성을 검사합니다.' });
  elements.validationIssues.innerHTML = issues.slice(0, 16).map(issue => `<li class="${issue.type}">${escapeHtml(issue.text)}</li>`).join('');

  renderManaCurve(mainCards);
  renderTypeBreakdown();
}

function renderManaCurve(cards) {
  const counts = Array(8).fill(0);
  cards.filter(card => !/Land/i.test(card.type_line || '')).forEach(card => {
    const cmc = Math.max(0, Math.floor(Number(card.cmc || 0)));
    counts[Math.min(7, cmc)] += 1;
  });
  const max = Math.max(1, ...counts);
  elements.manaCurve.innerHTML = counts.map((count, i) => `
    <div class="curve-column"><strong>${count}</strong><div class="curve-bar" style="height:${Math.max(2, count / max * 88)}%"></div><span>${i === 7 ? '7+' : i}</span></div>
  `).join('');
}
function renderTypeBreakdown() {
  const values = SECTION_DEFS.map(([id, name]) => ({ name, count: totalEntryQty(state.sections[id]) })).filter(item => item.count > 0);
  const max = Math.max(1, ...values.map(item => item.count));
  elements.typeBreakdown.innerHTML = values.map(item => `
    <div class="type-row"><span>${item.name}</span><div class="type-track"><div class="type-fill" style="width:${item.count / max * 100}%"></div></div><strong>${item.count}</strong></div>
  `).join('') || '<div class="type-row"><span>카드 없음</span><div class="type-track"></div><strong>0</strong></div>';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      cache: options.cache || 'no-store',
      signal: options.signal || controller.signal,
      headers: { 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({ details: '응답을 읽지 못했습니다.' }));
    if (!response.ok) throw new Error(payload.details || `HTTP ${response.status}`);
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('요청 시간이 초과되었습니다.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function queuedScryfallJson(path, options = {}, timeoutMs = 30_000) {
  const run = async () => {
    const delay = Math.max(0, nextScryfallRequestAt - Date.now());
    if (delay) await sleep(delay);
    nextScryfallRequestAt = Date.now() + 150;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(`${SCRYFALL_API}${path}`, {
          ...options,
          signal: controller.signal,
          headers: { 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(options.headers || {}) }
        });
        clearTimeout(timer);
        const payload = await response.json().catch(() => ({ details: 'Scryfall 응답을 읽지 못했습니다.' }));
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          const retryAfter = Number(response.headers.get('retry-after'));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 600 * (2 ** attempt));
          continue;
        }
        if (!response.ok) throw new Error(payload.details || `Scryfall HTTP ${response.status}`);
        return payload;
      } catch (error) {
        lastError = error;
        if (attempt >= 2) throw error.name === 'AbortError' ? new Error('Scryfall 요청 시간이 초과되었습니다.') : error;
        await sleep(600 * (2 ** attempt));
      }
    }
    throw lastError;
  };
  const result = scryfallRequestChain.then(run, run);
  scryfallRequestChain = result.then(() => undefined, () => undefined);
  return result;
}

function openLocalDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_DB_STORE)) db.createObjectStore(LOCAL_DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key) {
  const db = await openLocalDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(LOCAL_DB_STORE, 'readonly').objectStore(LOCAL_DB_STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

async function idbPut(key, value) {
  const db = await openLocalDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(LOCAL_DB_STORE, 'readwrite');
      transaction.objectStore(LOCAL_DB_STORE).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('브라우저 DB 저장이 중단되었습니다.'));
    });
  } finally { db.close(); }
}

function normalizeText(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US');
}

function indexLocalCards(cards) {
  localCards = Array.isArray(cards) ? cards : [];
  localByName = new Map();
  localById = new Map();
  for (const card of localCards) {
    const facesText = (card.card_faces || []).map(face => `${face.name || ''} ${face.type_line || ''} ${face.oracle_text || ''}`).join(' ');
    card._name = normalizeText(card.name);
    card._type = normalizeText(card.type_line);
    card._oracle = normalizeText(`${card.oracle_text || ''} ${facesText}`);
    card._set = normalizeText(`${card.set || ''} ${card.set_name || ''}`);
    localById.set(card.id, card);
    localByName.set(card._name, card);
    for (const face of card.card_faces || []) if (face.name) localByName.set(normalizeText(face.name), card);
  }
}

function publicCard(card) {
  if (!card) return card;
  const { _name, _type, _oracle, _set, ...rest } = card;
  return rest;
}

function localConfig() {
  try { return { autoUpdate: false, autoUpdateDays: 1, ...JSON.parse(localStorage.getItem(LOCAL_DB_CONFIG_KEY) || '{}') }; }
  catch { return { autoUpdate: false, autoUpdateDays: 1 }; }
}

function formatDbDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

function renderLocalDbStatus() {
  const db = state.localDb;
  elements.localDbStrip.classList.toggle('ready', db.ready);
  elements.localDbStrip.classList.toggle('updating', db.updating);
  elements.localDbDot.className = `status-dot ${db.updating ? 'updating' : db.ready ? 'ready' : 'missing'}`;
  elements.localDbMiniStatus.textContent = db.updating
    ? '브라우저 카드 DB 업데이트 중'
    : db.ready
      ? `브라우저 DB ${Number(db.cardCount || 0).toLocaleString('ko-KR')}장`
      : '브라우저 카드 DB 미설치';
  elements.localDbStatusText.textContent = db.updating ? '업데이트 중' : db.ready ? '사용 가능' : '설치 필요';
  elements.localDbCardCount.textContent = db.ready ? `${Number(db.cardCount || 0).toLocaleString('ko-KR')}장` : '-';
  elements.localDbBuiltAt.textContent = formatDbDate(db.builtAt);
  elements.localDbSourceAt.textContent = formatDbDate(db.sourceUpdatedAt);
  elements.localDbAutoUpdate.checked = Boolean(db.autoUpdate);
  elements.localDbAutoDays.value = String(db.autoUpdateDays || 1);
  elements.updateLocalDbBtn.disabled = Boolean(db.updating);
  elements.updateLocalDbBtn.textContent = db.updating ? '업데이트 중…' : db.ready ? '지금 업데이트' : '브라우저 DB 설치';
}

async function readPublishedDbMeta() {
  const url = new URL('./data/meta.json', document.baseURI);
  url.searchParams.set('t', String(Date.now()));
  return fetchJson(url.href, { cache: 'no-store' }, 20_000);
}

async function refreshLocalDbStatus() {
  const config = localConfig();
  try {
    const [meta, cards] = await Promise.all([idbGet('meta'), localCards.length ? Promise.resolve(null) : idbGet('cards')]);
    if (cards) indexLocalCards(cards);
    state.localDb = {
      ready: localCards.length > 0,
      updating: false,
      cardCount: localCards.length || Number(meta?.cardCount || 0),
      builtAt: meta?.installedAt || meta?.builtAt || null,
      sourceUpdatedAt: meta?.sourceUpdatedAt || null,
      version: meta?.version || null,
      checkedAt: meta?.checkedAt || null,
      ...config
    };
  } catch {
    state.localDb = { ready: false, updating: false, cardCount: 0, ...config };
  }
  renderLocalDbStatus();
  return state.localDb;
}

async function decodeCompressedCards(response) {
  if (!response.ok) throw new Error(`카드 DB 다운로드 HTTP ${response.status}`);
  if (!('DecompressionStream' in window)) {
    throw new Error('이 브라우저는 압축 DB 해제를 지원하지 않습니다. 최신 Chrome, Edge, Firefox 또는 Safari를 사용해주세요.');
  }
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).json();
}

async function installLocalDatabase(force = false) {
  state.localDb.updating = true;
  renderLocalDbStatus();
  try {
    const published = await readPublishedDbMeta();
    if (!published.ready || !published.version) throw new Error('배포된 카드 DB가 아직 생성되지 않았습니다. GitHub Actions 배포 완료 후 다시 시도해주세요.');
    if (!force && state.localDb.ready && state.localDb.version === published.version) {
      const meta = { ...(await idbGet('meta')), checkedAt: new Date().toISOString() };
      await idbPut('meta', meta);
      state.localDb = { ...state.localDb, updating: false, checkedAt: meta.checkedAt, unchanged: true };
      renderLocalDbStatus();
      return state.localDb;
    }
    const dbUrl = new URL(published.downloadPath || './data/cards.json.gz', document.baseURI);
    dbUrl.searchParams.set('v', published.version);
    const response = await fetch(dbUrl.href, { cache: 'no-store' });
    const cards = await decodeCompressedCards(response);
    if (!Array.isArray(cards) || cards.length < 1) throw new Error('다운로드한 카드 DB가 비어 있습니다.');
    const installedMeta = { ...published, installedAt: new Date().toISOString(), checkedAt: new Date().toISOString() };
    await idbPut('cards', cards);
    await idbPut('meta', installedMeta);
    indexLocalCards(cards);
    const config = localConfig();
    state.localDb = { ...installedMeta, ...config, ready: true, updating: false, unchanged: false, cardCount: cards.length };
    renderLocalDbStatus();
    return state.localDb;
  } catch (error) {
    state.localDb.updating = false;
    renderLocalDbStatus();
    throw error;
  }
}

async function maybeAutoUpdateLocalDb() {
  const config = localConfig();
  if (!config.autoUpdate) return;
  const last = state.localDb.checkedAt || state.localDb.builtAt;
  const due = !last || Date.now() - new Date(last).getTime() >= Math.max(1, Number(config.autoUpdateDays || 1)) * 86_400_000;
  if (!due) return;
  try {
    const published = await readPublishedDbMeta();
    if (!state.localDb.ready || published.version !== state.localDb.version) await installLocalDatabase(false);
    else {
      const meta = { ...(await idbGet('meta')), checkedAt: new Date().toISOString() };
      await idbPut('meta', meta);
      state.localDb.checkedAt = meta.checkedAt;
    }
  } catch { /* keep current offline DB */ }
}

function stripOuterParens(token) { return token.replace(/^\(+/, '').replace(/\)+$/, ''); }
function tokenizeQuery(query) {
  return (String(query).match(/(?:[^\s"]+|"[^"]*")+/g) || []).map(token => stripOuterParens(token.trim())).filter(Boolean);
}
function compareNumber(actual, expression) {
  const match = String(expression).match(/^(<=|>=|=|<|>)?\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return true;
  const operator = match[1] || '=';
  const target = Number(match[2]);
  return operator === '<' ? actual < target : operator === '>' ? actual > target : operator === '<=' ? actual <= target : operator === '>=' ? actual >= target : actual === target;
}
function colorMatches(card, value, identity = false) {
  const desired = new Set(String(value).toUpperCase().replace(/[^WUBRGC]/g, '').split('').filter(Boolean));
  const actual = new Set(identity ? (card.color_identity || []) : (card.colors || []));
  if (desired.has('C')) return actual.size === 0;
  return [...desired].every(color => actual.has(color));
}
function tokenPredicate(rawToken) {
  let token = rawToken;
  let negated = false;
  if (token.startsWith('-')) { negated = true; token = token.slice(1); }
  const colon = token.indexOf(':');
  const key = colon >= 0 ? normalizeText(token.slice(0, colon)) : '';
  const rawValue = colon >= 0 ? token.slice(colon + 1) : token;
  const value = normalizeText(rawValue.replace(/^"|"$/g, ''));
  let predicate;
  if (!key || key === 'game') predicate = card => card._name.includes(value) || card._type.includes(value) || card._oracle.includes(value);
  else if (['t', 'type'].includes(key)) predicate = card => card._type.includes(value);
  else if (['o', 'oracle'].includes(key)) predicate = card => card._oracle.includes(value);
  else if (['n', 'name'].includes(key)) predicate = card => card._name.includes(value);
  else if (['set', 's'].includes(key)) predicate = card => card._set.includes(value);
  else if (['r', 'rarity'].includes(key)) predicate = card => normalizeText(card.rarity) === value;
  else if (['lang', 'language'].includes(key)) predicate = card => normalizeText(card.lang) === value;
  else if (['legal', 'f'].includes(key)) predicate = card => ['legal', 'restricted'].includes(normalizeText(card.legalities?.[value]));
  else if (['c', 'color'].includes(key)) predicate = card => colorMatches(card, rawValue, false);
  else if (['id', 'identity'].includes(key)) predicate = card => colorMatches(card, rawValue, true);
  else if (['mv', 'cmc'].includes(key)) predicate = card => compareNumber(Number(card.cmc || 0), rawValue);
  else if (key === 'is' && value === 'commander') predicate = card => /legendary creature/i.test(card.type_line || '') || /can be your commander/i.test(card.oracle_text || '');
  else if (key === 'is' && value === 'land') predicate = card => /land/i.test(card.type_line || '');
  else if (key === 'is' && value === 'basic') predicate = card => /basic land/i.test(card.type_line || '');
  else if (['order', 'dir', 'unique', 'include'].includes(key)) predicate = () => true;
  else predicate = card => card._name.includes(value) || card._type.includes(value) || card._oracle.includes(value);
  return card => negated ? !predicate(card) : predicate(card);
}
function searchLocalCards(query, page = 1, pageSize = 60) {
  if (!localCards.length) throw new Error('브라우저 카드 DB가 설치되지 않았습니다.');
  const tokens = tokenizeQuery(query).filter(token => !/^\b(and|or)\b$/i.test(token));
  const predicates = tokens.map(tokenPredicate);
  let results = localCards.filter(card => predicates.every(predicate => predicate(card)));
  const orderToken = tokens.find(token => /^order:/i.test(token));
  const order = normalizeText(orderToken?.split(':').slice(1).join(':') || 'name');
  if (order === 'edhrec') results.sort((a, b) => (a.edhrec_rank ?? Number.MAX_SAFE_INTEGER) - (b.edhrec_rank ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name));
  else if (order === 'cmc' || order === 'mv') results.sort((a, b) => Number(a.cmc || 0) - Number(b.cmc || 0) || a.name.localeCompare(b.name));
  else if (order === 'released') results.sort((a, b) => String(b.released_at || '').localeCompare(String(a.released_at || '')));
  else results.sort((a, b) => a.name.localeCompare(b.name));
  const safePage = Math.max(1, Number(page || 1));
  const start = (safePage - 1) * pageSize;
  return { object: 'list', total_cards: results.length, has_more: start + pageSize < results.length, data: results.slice(start, start + pageSize).map(publicCard) };
}
function autocompleteLocal(query, limit = 20) {
  const needle = normalizeText(query);
  if (!needle) return [];
  return localCards.filter(card => card._name.includes(needle))
    .sort((a, b) => Number(a._name.startsWith(needle) ? 0 : 1) - Number(b._name.startsWith(needle) ? 0 : 1) || (a.edhrec_rank ?? 1e9) - (b.edhrec_rank ?? 1e9) || a.name.localeCompare(b.name))
    .slice(0, limit).map(card => card.name);
}
function localCollection(identifiers = []) {
  const data = [];
  const not_found = [];
  for (const identifier of identifiers) {
    const card = identifier.id ? localById.get(identifier.id) : localByName.get(normalizeText(identifier.name || ''));
    if (card) data.push(publicCard(card)); else not_found.push(identifier);
  }
  return { object: 'list', data, not_found };
}

function localSearchSupported(raw) {
  const lang = elements.languageFilter.value;
  if (lang && lang !== 'en') return false;
  return !/(?:^|\s)(?:or|not)(?:\s|$)/i.test(raw) && !/[{}]/.test(raw);
}
function shouldUseLocal(raw = '') {
  if (state.searchSource === 'online') return false;
  if (state.searchSource === 'local') return true;
  return state.localDb.ready && localSearchSupported(raw);
}
async function fetchSearchData(q, page, raw) {
  if (shouldUseLocal(raw)) {
    try {
      const data = searchLocalCards(q, page);
      state.lastSearchSource = 'local';
      return data;
    } catch (error) { if (state.searchSource === 'local') throw error; }
  }
  try {
    const params = new URLSearchParams({ q, page: String(page), unique: 'cards', order: isCommanderMode() ? 'edhrec' : 'name' });
    const data = await queuedScryfallJson(`/cards/search?${params}`);
    state.lastSearchSource = 'online';
    return data;
  } catch (error) {
    if (state.searchSource !== 'auto' || !state.localDb.ready) throw error;
    const fallbackQuery = q.replace(/\s*lang:[^\s)]+/gi, '');
    const data = searchLocalCards(fallbackQuery, page);
    state.lastSearchSource = 'local-fallback';
    return data;
  }
}

function buildSearchQuery(raw) {
  const parts = [];
  if (raw.trim()) parts.push(`(${raw.trim()})`);
  if (elements.legalOnly.checked && !/legal:/i.test(raw)) parts.push(`legal:${currentFormat().legality}`);
  const lang = elements.languageFilter.value;
  if (lang && !/lang:/i.test(raw)) parts.push(`lang:${lang}`);
  if (parts.length) return parts.join(' ');
  return isCommanderMode() ? 't:legendary t:creature legal:commander' : `legal:${currentFormat().legality}`;
}

async function searchCards(raw = state.query, page = 1) {
  state.query = raw;
  state.page = page;
  elements.searchEmpty.classList.add('hidden');
  elements.searchResults.innerHTML = '<div class="loading-grid">' + '<div class="skeleton"></div>'.repeat(6) + '</div>';
  elements.pagination.classList.add('hidden');
  try {
    const q = buildSearchQuery(raw);
    const data = await fetchSearchData(q, page, raw);
    state.searchResults = data.data || [];
    state.searchMap = new Map(state.searchResults.map(card => [card.id, card]));
    state.totalCards = data.total_cards || state.searchResults.length;
    state.hasMore = Boolean(data.has_more);
    renderSearchResults();
    elements.resultCount.textContent = `${state.totalCards.toLocaleString('ko-KR')}장 · ${state.lastSearchSource === 'online' ? 'Scryfall 온라인' : state.lastSearchSource === 'local-fallback' ? '브라우저 DB 폴백' : '브라우저 DB'}`;
    elements.pageLabel.textContent = `${page}페이지`;
    elements.prevPageBtn.disabled = page <= 1;
    elements.nextPageBtn.disabled = !state.hasMore;
    elements.pagination.classList.toggle('hidden', !state.searchResults.length);
  } catch (error) {
    state.searchResults = [];
    elements.searchResults.innerHTML = '';
    elements.searchEmpty.classList.remove('hidden');
    elements.searchEmpty.querySelector('h3').textContent = '검색 결과가 없습니다';
    elements.searchEmpty.querySelector('p').textContent = error.message;
    elements.resultCount.textContent = '0장 검색됨';
  }
}

function renderSearchResults() {
  elements.searchResults.className = `card-results ${state.view}-view`;
  elements.searchResults.innerHTML = '';
  if (!state.searchResults.length) return elements.searchEmpty.classList.remove('hidden');
  elements.searchEmpty.classList.add('hidden');
  for (const card of state.searchResults) {
    const node = document.createElement('article');
    node.className = 'result-card';
    node.draggable = true;
    node.innerHTML = `
      <img src="${escapeHtml(cardImage(card, state.view === 'grid' ? 'normal' : 'small'))}" alt="${escapeHtml(cardName(card))}" loading="lazy">
      <div class="result-info"><strong>${escapeHtml(cardName(card))}</strong><span>${escapeHtml(card.type_line || '')}</span></div>
      <button class="result-add" title="덱에 추가">+</button>
      ${isCommanderCandidate(card) ? '<span class="result-badge">CMD</span>' : ''}
    `;
    node.addEventListener('dragstart', event => setDragData(event, { source: 'search', cardId: card.id }));
    node.addEventListener('dblclick', () => addCard(card));
    node.addEventListener('click', event => { if (!event.target.closest('button')) showCardDialog(card); });
    node.querySelector('.result-add').addEventListener('click', event => { event.stopPropagation(); addCard(card); });
    elements.searchResults.append(node);
  }
}

function showCardDialog(card) {
  const price = card.prices?.usd ? `$${card.prices.usd}` : card.prices?.eur ? `€${card.prices.eur}` : '정보 없음';
  elements.cardDialogContent.innerHTML = `
    <div class="card-detail">
      <div class="card-detail-image"><img src="${escapeHtml(cardImage(card, 'large') || cardImage(card))}" alt="${escapeHtml(cardName(card))}"></div>
      <div class="card-detail-copy">
        <div class="eyebrow">${escapeHtml((card.set_name || '').toUpperCase())}</div>
        <h2>${escapeHtml(cardName(card))}</h2>
        <div>${renderMana(cardMana(card))}</div>
        <p class="card-type">${escapeHtml(card.type_line || '')}</p>
        <div class="card-oracle">${renderMana(cardOracle(card))}</div>
        <div class="card-meta-grid">
          <div><span>세트 / 번호</span><strong>${escapeHtml((card.set || '').toUpperCase())} #${escapeHtml(card.collector_number || '-')}</strong></div>
          <div><span>희귀도</span><strong>${escapeHtml(card.rarity || '-')}</strong></div>
          <div><span>아티스트</span><strong>${escapeHtml(card.artist || '-')}</strong></div>
          <div><span>시장가 참고</span><strong>${escapeHtml(price)}</strong></div>
          <div><span>EDHREC 순위</span><strong>${card.edhrec_rank ? card.edhrec_rank.toLocaleString('ko-KR') : '-'}</strong></div>
          <div><span>${escapeHtml(currentFormat().label)} 합법성</span><strong>${escapeHtml(legalityStatus(card, state.format))}</strong></div>
        </div>
        <div class="detail-actions">
          <button class="btn primary" id="detailAddBtn">메인 덱에 추가</button>
          ${!isCommanderMode() ? '<button class="btn ghost" id="detailSideboardBtn">사이드보드에 추가</button>' : ''}
          ${isCommanderMode() && isCommanderCandidate(card) ? '<button class="btn ghost" id="detailCommanderBtn">커맨더로 지정</button>' : ''}
          <a class="btn ghost" href="${escapeHtml(card.scryfall_uri || '#')}" target="_blank" rel="noreferrer">Scryfall에서 보기</a>
        </div>
      </div>
    </div>`;
  el('detailAddBtn').addEventListener('click', () => { addCard(card); elements.cardDialog.close(); });
  el('detailSideboardBtn')?.addEventListener('click', () => { addCard(card, 'sideboard'); elements.cardDialog.close(); });
  el('detailCommanderBtn')?.addEventListener('click', () => { addCard(card, 'commander'); elements.cardDialog.close(); });
  elements.cardDialog.showModal();
}

async function loadSymbols() {
  try {
    const data = await queuedScryfallJson('/symbology');
    state.symbolMap = new Map((data.data || []).map(item => [item.symbol, item.svg_uri]));
  } catch { /* text fallback */ }
}

let suggestTimer;
async function updateSuggestions() {
  clearTimeout(suggestTimer);
  const q = elements.searchInput.value.trim();
  if (q.length < 2 || /[:=<>]/.test(q)) return elements.suggestions.classList.add('hidden');
  suggestTimer = setTimeout(async () => {
    try {
      let data;
      if (shouldUseLocal(q)) {
        try { data = { object: 'catalog', data: autocompleteLocal(q) }; }
        catch (error) { if (state.searchSource === 'local') throw error; }
      }
      if (!data) data = await queuedScryfallJson(`/cards/autocomplete?q=${encodeURIComponent(q)}`);
      const names = (data.data || []).slice(0, 7);
      elements.suggestions.innerHTML = names.map(name => `<button type="button">${escapeHtml(name)}</button>`).join('');
      elements.suggestions.classList.toggle('hidden', !names.length);
      elements.suggestions.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
        elements.searchInput.value = button.textContent;
        elements.suggestions.classList.add('hidden');
        searchCards(button.textContent, 1);
      }));
    } catch { elements.suggestions.classList.add('hidden'); }
  }, 230);
}

function printingSuffix(card) {
  const setCode = String(card.set || '').trim().toUpperCase();
  const collectorNumber = String(card.collector_number || '').trim();
  return setCode && collectorNumber ? ` (${setCode}) ${collectorNumber}` : '';
}

function exportLine(entry, { printing = false, commanderTag = false } = {}) {
  const suffix = printing ? printingSuffix(entry.card) : '';
  const tag = commanderTag ? ' *CMDR*' : '';
  return `${entry.qty} ${cardName(entry.card)}${suffix}${tag}`;
}

function exportDeckText(format = state.exportFormat) {
  const mainEntries = SECTION_DEFS.flatMap(([id]) => state.sections[id]);
  const sideboardEntries = state.sideboard;

  if (format === 'arena') {
    const lines = [];
    if (isCommanderMode() && state.commanders.length) {
      lines.push('Commander');
      state.commanders.forEach(entry => lines.push(exportLine(entry, { printing: true })));
      lines.push('');
    }
    lines.push('Deck');
    mainEntries.forEach(entry => lines.push(exportLine(entry, { printing: true })));
    if (!isCommanderMode() && sideboardEntries.length) {
      lines.push('', 'Sideboard');
      sideboardEntries.forEach(entry => lines.push(exportLine(entry, { printing: true })));
    }
    return lines.join('\n').trim();
  }

  if (format === 'moxfield') {
    const lines = [
      ...state.commanders.map(entry => exportLine(entry, { printing: true, commanderTag: true })),
      ...mainEntries.map(entry => exportLine(entry, { printing: true }))
    ];
    if (!isCommanderMode() && sideboardEntries.length) {
      lines.push('', 'SIDEBOARD:');
      sideboardEntries.forEach(entry => lines.push(exportLine(entry, { printing: true })));
    }
    return lines.join('\n').trim();
  }

  const lines = [`// ${state.deckName}`, `// Format: ${currentFormat().label}`, ''];
  if (isCommanderMode() && state.commanders.length) {
    lines.push('Commander');
    state.commanders.forEach(entry => lines.push(exportLine(entry)));
    lines.push('');
  }
  lines.push('Main Deck');
  for (const [id, name] of SECTION_DEFS) {
    if (!state.sections[id].length) continue;
    lines.push(name);
    state.sections[id].forEach(entry => lines.push(exportLine(entry)));
    lines.push('');
  }
  if (!isCommanderMode() && sideboardEntries.length) {
    lines.push('Sideboard');
    sideboardEntries.forEach(entry => lines.push(exportLine(entry)));
  }
  return lines.join('\n').trim();
}

function exportFormatHelp(format) {
  const zones = isCommanderMode() ? 'Commander/Deck' : 'Deck/Sideboard';
  if (format === 'arena') return `MTG Arena의 ${zones} 구역 형식입니다. Arena에 없는 카드나 세트는 가져오지 못할 수 있습니다.`;
  if (format === 'moxfield') return `Moxfield용 인쇄본 형식입니다. ${isCommanderMode() ? '커맨더에는 *CMDR* 표식을 붙입니다.' : '사이드보드는 SIDEBOARD 구역으로 분리합니다.'}`;
  return '포맷, 메인 덱, 커맨더 또는 사이드보드 구역을 포함한 읽기 쉬운 일반 텍스트 형식입니다.';
}

function refreshExportText() {
  state.exportFormat = elements.exportFormat.value;
  elements.textDialogHelp.textContent = exportFormatHelp(state.exportFormat);
  elements.deckTextArea.value = exportDeckText(state.exportFormat);
}

function safeDeckFilename() {
  const base = (state.deckName || `${currentFormat().label}-deck`)
    .replace(/[\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'mtg-deck';
  return `${base}-${state.exportFormat}.txt`;
}

function downloadDeckText() {
  const blob = new Blob([elements.deckTextArea.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeDeckFilename();
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  toast('덱 목록 TXT 파일을 저장했습니다.', 'success');
}

function openTextDialog(mode) {
  state.importMode = mode === 'import';
  elements.textDialogEyebrow.textContent = mode === 'import' ? 'IMPORT DECK' : 'EXPORT DECK';
  elements.textDialogTitle.textContent = mode === 'import' ? '덱 목록 가져오기' : '덱 목록 내보내기';
  elements.exportFormatRow.classList.toggle('hidden', state.importMode);
  elements.downloadDeckTextBtn.classList.toggle('hidden', state.importMode);
  elements.deckTextArea.readOnly = !state.importMode;
  elements.textDialogConfirm.textContent = state.importMode ? '가져오기' : '클립보드에 복사';

  if (state.importMode) {
    elements.textDialogHelp.textContent = 'Arena/Moxfield의 Commander, Deck, Sideboard 헤더와 *CMDR* 표식을 인식합니다. 커맨더 표식이 없고 현재 포맷이 Commander라면 Standard로 전환하므로, 가져온 뒤 원하는 포맷을 선택하세요.';
    elements.deckTextArea.value = '';
  } else {
    elements.exportFormat.value = state.exportFormat;
    refreshExportText();
  }
  elements.textDialog.showModal();
}

function parseDeckList(text) {
  const items = [];
  let section = 'main';
  let hasCommander = false;
  let hasSideboard = false;
  let formatHint = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const formatComment = line.match(/^\/\/\s*Format:\s*(.+)$/i);
    if (formatComment) {
      const wanted = formatComment[1].trim().toLowerCase();
      formatHint = Object.keys(FORMAT_DEFS).find(key => key === wanted || FORMAT_DEFS[key].label.toLowerCase() === wanted || FORMAT_DEFS[key].labelKo === formatComment[1].trim()) || null;
      continue;
    }
    if (line.startsWith('//') || line.startsWith('#')) continue;
    if (/^\[?commanders?\]?:?$/i.test(line)) { section = 'commander'; hasCommander = true; continue; }
    if (/^\[?(sideboard|side board|maybeboard)\]?:?$/i.test(line)) { section = 'sideboard'; hasSideboard = true; continue; }
    if (/^\[?(deck|mainboard|main deck|creatures?|instants?|sorceries?|artifacts?|enchantments?|planeswalkers?|battles?|lands?|other|생물|순간마법|집중마법|마법물체|부여마법|플레인즈워커|전투|대지|기타)\]?:?$/i.test(line)) { section = 'main'; continue; }
    if (/^companion:?$/i.test(line)) { section = 'sideboard'; hasSideboard = true; continue; }
    const commanderTagged = /\s+\*CMDR\*\s*$/i.test(line);
    const sideboardTagged = /\s+\*(?:CMPN|SB)\*\s*$/i.test(line);
    const cleanLine = line.replace(/\s+\*(?:CMDR|F|CMPN|SB)\*\s*$/gi, '').trim();
    const match = cleanLine.match(/^(\d+)\s*[xX]?\s+(.+?)(?:\s+\([A-Z0-9]+\)\s+[A-Z0-9★-]+)?$/i);
    const qty = match ? Number(match[1]) : 1;
    const name = (match ? match[2] : cleanLine).trim();
    const target = commanderTagged ? 'commander' : sideboardTagged ? 'sideboard' : section;
    if (target === 'commander') hasCommander = true;
    if (target === 'sideboard') hasSideboard = true;
    if (name) items.push({ qty, name, section: target });
  }
  return { items, hasCommander, hasSideboard, formatHint };
}

async function fetchCollectionBatches(identifiers) {
  const collected = [];
  const notFound = [];
  for (let index = 0; index < identifiers.length; index += 75) {
    const batch = identifiers.slice(index, index + 75);
    const result = await queuedScryfallJson('/cards/collection', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiers: batch })
    });
    collected.push(...(result.data || []));
    notFound.push(...(result.not_found || []));
  }
  return { object: 'list', data: collected, not_found: notFound };
}

async function importDeck(text) {
  const parsed = parseDeckList(text);
  if (!parsed.items.length) throw new Error('가져올 카드 목록이 없습니다.');
  const unique = [...new Map(parsed.items.map(item => [item.name.toLowerCase(), item])).values()];
  if (unique.length > 250) throw new Error('한 번에 가져올 수 있는 서로 다른 카드 이름은 250개까지입니다.');
  const identifiers = unique.map(item => ({ name: item.name }));
  let data;
  if (state.localDb.ready && state.searchSource !== 'online') {
    data = localCollection(identifiers);
    if (state.searchSource === 'auto' && data.not_found.length) {
      try {
        const online = await fetchCollectionBatches(data.not_found);
        data = { object: 'list', data: [...data.data, ...(online.data || [])], not_found: online.not_found || [] };
      } catch { /* keep local results */ }
    }
  }
  if (!data) data = await fetchCollectionBatches(identifiers);

  const cardsByName = new Map((data.data || []).map(card => [cardName(card).toLowerCase(), card]));
  const notFound = data.not_found || [];
  const old = { format: state.format, commanders: state.commanders, sideboard: state.sideboard, sections: state.sections };
  state.format = parsed.hasCommander ? 'commander' : (parsed.formatHint && FORMAT_DEFS[parsed.formatHint] ? parsed.formatHint : (isCommanderMode() ? 'standard' : state.format));
  state.commanders = [];
  state.sideboard = [];
  state.sections = Object.fromEntries(SECTION_DEFS.map(([id]) => [id, []]));
  try {
    for (const item of parsed.items) {
      const card = cardsByName.get(item.name.toLowerCase()) || [...cardsByName.values()].find(candidate => cardName(candidate).toLowerCase().startsWith(item.name.toLowerCase()));
      if (!card) continue;
      const target = item.section === 'commander' ? 'commander' : item.section === 'sideboard' ? 'sideboard' : sectionForCard(card);
      addCard(card, target, item.qty, true);
    }
  } catch (error) {
    state.format = old.format;
    state.commanders = old.commanders;
    state.sideboard = old.sideboard;
    state.sections = old.sections;
    throw error;
  }
  renderDeck();
  toast(`덱을 가져왔습니다${notFound.length ? ` · ${notFound.length}개 이름 미확인` : ''}.`, notFound.length ? '' : 'success');
}

function resetDeck() {
  const format = currentFormat();
  state.deckName = `새 ${format.labelKo || format.label} 덱`;
  state.commanders = [];
  state.sideboard = [];
  state.sections = Object.fromEntries(SECTION_DEFS.map(([id]) => [id, []]));
  markDirty(); renderDeck();
}

function autoSortDeck() {
  for (const [id] of SECTION_DEFS) {
    state.sections[id].sort((a, b) => Number(a.card.cmc || 0) - Number(b.card.cmc || 0) || cardName(a.card).localeCompare(cardName(b.card)));
  }
  state.sideboard.sort((a, b) => cardName(a.card).localeCompare(cardName(b.card)));
  markDirty(); renderDeck(); toast('메인 덱은 마나 값·이름, 사이드보드는 이름 순으로 정렬했습니다.', 'success');
}

function bindEvents() {
  elements.searchForm.addEventListener('submit', event => { event.preventDefault(); elements.suggestions.classList.add('hidden'); searchCards(elements.searchInput.value, 1); });
  elements.searchInput.addEventListener('input', updateSuggestions);
  elements.legalOnly.addEventListener('change', () => searchCards(state.query, 1));
  elements.languageFilter.addEventListener('change', () => searchCards(state.query, 1));
  elements.searchSource.value = state.searchSource;
  elements.searchSource.addEventListener('change', () => {
    state.searchSource = elements.searchSource.value;
    localStorage.setItem(SEARCH_SOURCE_KEY, state.searchSource);
    searchCards(state.query, 1);
  });
  el('quickFilters').addEventListener('click', event => {
    const button = event.target.closest('[data-query]'); if (!button) return;
    const query = button.dataset.query;
    if (query === 'order:edhrec') { elements.searchInput.value = ''; searchCards('', 1); }
    else { elements.searchInput.value = query; searchCards(query, 1); }
  });
  elements.prevPageBtn.addEventListener('click', () => searchCards(state.query, Math.max(1, state.page - 1)));
  elements.nextPageBtn.addEventListener('click', () => searchCards(state.query, state.page + 1));
  document.querySelectorAll('.view-switch button').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.view;
    document.querySelectorAll('.view-switch button').forEach(b => b.classList.toggle('active', b === button));
    renderSearchResults();
  }));

  elements.deckName.addEventListener('input', () => { state.deckName = elements.deckName.value; markDirty(); });
  elements.deckFormat.addEventListener('change', () => changeFormat(elements.deckFormat.value));
  el('saveBtn').addEventListener('click', () => persistDeck(true));
  el('newDeckBtn').addEventListener('click', () => { if (confirm('현재 덱을 비우고 새 덱을 만들까요?')) resetDeck(); });
  el('clearDeckBtn').addEventListener('click', () => { if (confirm('메인 덱, 커맨더 또는 사이드보드의 모든 카드를 제거할까요?')) resetDeck(); });
  el('sortDeckBtn').addEventListener('click', autoSortDeck);
  el('importBtn').addEventListener('click', () => openTextDialog('import'));
  el('exportBtn').addEventListener('click', () => openTextDialog('export'));
  const openLocalDbDialog = async () => { await refreshLocalDbStatus(); elements.localDbDialog.showModal(); };
  el('localDbBtn').addEventListener('click', openLocalDbDialog);
  el('localDbMiniBtn').addEventListener('click', openLocalDbDialog);
  elements.saveLocalDbConfigBtn.addEventListener('click', () => {
    const config = { autoUpdate: elements.localDbAutoUpdate.checked, autoUpdateDays: Number(elements.localDbAutoDays.value) };
    localStorage.setItem(LOCAL_DB_CONFIG_KEY, JSON.stringify(config));
    state.localDb = { ...state.localDb, ...config };
    renderLocalDbStatus();
    toast('브라우저 DB 업데이트 설정을 저장했습니다.', 'success');
  });
  elements.updateLocalDbBtn.addEventListener('click', async () => {
    elements.updateLocalDbBtn.disabled = true;
    try {
      state.localDb = await installLocalDatabase(false);
      toast(state.localDb.unchanged ? '이미 최신 브라우저 카드 DB를 사용 중입니다.' : `브라우저 카드 DB ${Number(state.localDb.cardCount || 0).toLocaleString('ko-KR')}장을 업데이트했습니다.`, 'success');
      if (state.searchSource !== 'online') searchCards(state.query, 1);
    } catch (error) {
      await refreshLocalDbStatus();
      toast(error.message, 'error');
    }
  });
  elements.exportFormat.addEventListener('change', refreshExportText);
  elements.downloadDeckTextBtn.addEventListener('click', downloadDeckText);
  elements.textDialogConfirm.addEventListener('click', async event => {
    event.preventDefault();
    try {
      if (state.importMode) await importDeck(elements.deckTextArea.value);
      else { await navigator.clipboard.writeText(elements.deckTextArea.value); toast('덱 목록을 복사했습니다.', 'success'); }
      elements.textDialog.close();
    } catch (error) { toast(error.message, 'error'); }
  });
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => elements.cardDialog.close()));
  elements.cardDialog.addEventListener('click', event => { if (event.target === elements.cardDialog) elements.cardDialog.close(); });
  setupDropZone(elements.commanderZone, 'commander');
  setupDropZone(elements.sideboardZone, 'sideboard');
  setupDropZone(elements.trashZone, 'trash');
  el('collapseSearchBtn').addEventListener('click', () => {
    document.querySelector('.search-panel').classList.toggle('collapsed');
    document.body.classList.toggle('search-collapsed');
  });
  document.addEventListener('click', event => { if (!event.target.closest('.search-form')) elements.suggestions.classList.add('hidden'); });
  window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
  setInterval(() => { if (state.dirty) persistDeck(false); }, 30_000);
}

async function init() {
  createSections();
  loadSavedDeck();
  bindEvents();
  renderDeck();
  await refreshLocalDbStatus();
  maybeAutoUpdateLocalDb();
  const initialQuery = isCommanderMode() ? 't:legendary t:creature' : '';
  await Promise.all([loadSymbols(), searchCards(initialQuery, 1)]);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

init();
