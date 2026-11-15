/* Norge i dag. Läser dagens (krypterade) lista och visar den med sök, filter, karta, detaljvyer
   och egna markeringar. Allt du sparar, döljer eller antecknar ligger bara i den här enhetens webbläsare. */
'use strict';

// ---------- grund ----------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const store = {
  get(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privat läge: appen fungerar ändå */ } },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (n) => Number(n).toLocaleString('sv-SE').replace(/ /g, ' ');
const kr = (n) => (n ? `${nf(n)} kr` : 'Hyra saknas');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const PATHS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 13h18"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  map: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4z"/><path d="M9 4v14M15 6v14"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  out: '<path d="M14 5h5v5M19 5l-8 8"/><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  share: '<path d="M12 15V4M8 7.5 12 4l4 3.5"/><path d="M6 11v7.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V11"/>',
  car: '<path d="M4 16v-3.5l1.8-4.6A2 2 0 0 1 7.7 6.5h8.6a2 2 0 0 1 1.9 1.4L20 12.5V16"/><path d="M3 16h18v2.5H3z"/><circle cx="7.5" cy="14" r="1"/><circle cx="16.5" cy="14" r="1"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  eyeoff: '<path d="M4 4l16 16"/><path d="M9.5 5.3A9.6 9.6 0 0 1 12 5c5.5 0 9 7 9 7a15 15 0 0 1-2.8 3.6M6.2 7.2A15 15 0 0 0 3 12s3.500 7 9 7a9 9 0 0 0 3.300-.6"/><path d="M10 10a3 3 0 0 0 4 4"/>',
  pen: '<path d="M4 20l1-4.500L16.500 4l3.500 3.500L8.500 19 4 20z"/><path d="M14 6.500l3.500 3.500"/>',
  pin: '<path d="M12 21s-6.500-5.600-6.500-11a6.500 6.500 0 0 1 13 0c0 5.400-6.500 11-6.500 11z"/><circle cx="12" cy="10" r="2.300"/>',
  check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
  undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M4.5 11.5H14a5.5 5.5 0 0 1 0 11h-2" transform="translate(0 -3.5)"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.500-4.500L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.500 4.500L20 16"/><path d="M20 20v-4h-4"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ''}</svg>`;

// ---------- tillstånd ----------
let DATA = null;
let J = {}, H = {}, nearJob = {}, nearHome = {};
let newCut = null;
let limit = 24;
let dirty = false;        // något har sparats eller dolts sedan listan ritades
const scrollPos = {};     // var i varje flik man var senast
const tabLimit = {};
let mapNeedsFit = true;
let mapItems = [], mapVisible = [];
let moreObserver = null;
const sheets = []; // öppna ark, överst sist

const DEF = {
  tab: 'idag', saved: 'ansokningar',
  jobs: { q: '', area: 'alla', cats: [], onlyNew: false, housing: false, start: false, noLacks: false, english: false, hideApplied: true, min: 0, sort: 'match' },
  homes: { q: '', area: 'alla', seg: 'alla', onlyNew: false, view: false, moveIn: false, noShared: false, maxRent: 16000, sort: 'best' },
  map: { homes: true, jobs: true, top: true },
};
const saved = store.get('ui2', {});
const ui = { ...DEF, ...saved, jobs: { ...DEF.jobs, ...(saved.jobs || {}), q: '' }, homes: { ...DEF.homes, ...(saved.homes || {}), q: '' }, map: { ...DEF.map, ...(saved.map || {}) } };
ui.tab = 'idag';

// Markeringar: id -> { s: 'saved'|'hidden', st: ansökningsstatus, note, t }
const marks = (() => {
  const raw = store.get('marks', {});
  for (const [id, v] of Object.entries(raw)) if (typeof v === 'string') raw[id] = { s: v, t: Date.now() };
  return raw;
})();
const mk = (id) => marks[id] || {};
const isSaved = (id) => mk(id).s === 'saved';
const isHidden = (id) => mk(id).s === 'hidden';
function setMark(id, patch) {
  const next = { ...mk(id), ...patch, t: Date.now() };
  if (!next.s && !next.st && !next.note) delete marks[id]; else marks[id] = next;
  store.set('marks', marks);
  dirty = true;
}
const STATUS = { sokt: 'Sökt', intervju: 'Intervju', erbjudande: 'Erbjudande', avslag: 'Avslag' };

// ---------- hämta och dekryptera ----------
async function loadData() {
  const fromHash = location.hash.match(/k=([A-Za-z0-9_-]{20,})/);
  if (fromHash) store.set('key', fromHash[1]);
  const plain = await fetch('data.json', { cache: 'no-store' }).catch(() => null);
  if (plain && plain.ok) return plain.json();
  const res = await fetch('data.enc', { cache: 'no-store' });
  if (!res.ok) throw new Error('nodata');
  const key = store.get('key', null);
  if (!key) throw new Error('nokey');
  const buf = new Uint8Array(await res.arrayBuffer());
  let clear;
  try {
    const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, cryptoKey, buf.slice(12));
  } catch { throw new Error('badkey'); }
  const stream = new Blob([clear]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

function askForKey(wrong) {
  $('#top').innerHTML = '';
  $('#nav').innerHTML = '';
  $('#main').innerHTML = `<div class="keybox">
    <h2>${wrong ? 'Nyckeln stämmer inte' : 'Öppna med din länk'}</h2>
    <p class="muted" style="margin-top:6px">Listan är krypterad. Klistra in din personliga länk eller nyckel. Det behövs bara en gång per enhet.</p>
    <input id="key" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…#k=… eller bara nyckeln">
    <button class="btn primary block" data-act="key">Öppna</button></div>`;
}

// ---------- hjälpare ----------
const isNew = (x) => (newCut ? x.first_seen > newCut : x.first_seen >= DATA.latest_batch);
const areaName = (id) => (DATA.areas.find((a) => a.id === id) || {}).name || id;
const mapsUrl = (x) => `https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lon}`;
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const shortDate = (d) => d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });

function dueInfo(j) {
  const s = (j.due || '').trim();
  let d = null, m;
  if ((m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/))) d = new Date(+(m[3].length === 2 ? '20' + m[3] : m[3]), m[2] - 1, +m[1]);
  else if ((m = s.match(/(\d{4})-(\d{2})-(\d{2})/))) d = new Date(+m[1], m[2] - 1, +m[3]);
  if (!d || isNaN(d)) return { days: null, label: s ? `Frist: ${s}` : '', soon: false };
  const days = Math.round((d - today0()) / 864e5);
  const label = days < 0 ? 'Fristen har gått ut' : days === 0 ? 'Frist i dag' : days === 1 ? 'Frist i morgon' : days <= 14 ? `Frist om ${days} dagar` : `Frist ${shortDate(d)}`;
  return { days, label, soon: days >= 0 && days <= 7 };
}
function availInfo(h) {
  const m = (h.available || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return h.available ? `Ledig: ${h.available}` : '';
  const d = new Date(+m[1], m[2] - 1, +m[3]);
  return d <= today0() ? 'Ledig nu' : `Ledig ${shortDate(d)}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
}
const ring = (score, cls = '') => `<div class="ring s${score} ${cls}" aria-label="Betyg ${score} av 5">
  <svg viewBox="0 0 48 48"><circle class="t" cx="24" cy="24" r="20"/><circle class="v" cx="24" cy="24" r="20" stroke-dasharray="${(score / 5) * 125.7} 125.7"/></svg>${score}</div>`;
const hay = (...parts) => parts.join(' ').toLowerCase();

let toastTimer = null;
function toast(text, action, fn) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(text)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  el.hidden = false;
  if (action) $('button', el).onclick = () => { el.hidden = true; fn(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
}

// ---------- filter ----------
function jobList() {
  const f = ui.jobs, q = f.q.trim().toLowerCase();
  const out = DATA.jobs.filter((j) => !isHidden(j.id) &&
    (f.area === 'alla' || j.area === f.area) && (!f.cats.length || (j.cats || []).some((c) => f.cats.includes(c))) &&
    (!f.onlyNew || isNew(j)) && (!f.housing || j.housing === 'ja') && (!f.start || j.start_fits) &&
    (!f.noLacks || !(j.lacks || []).length) && (!f.english || j.english_ok === 'ja') && (!f.hideApplied || !mk(j.id).st) &&
    j.score >= f.min && (!q || hay(j.title, j.employer, j.kommune, j.reason).includes(q)));
  if (f.sort === 'new') out.sort((a, b) => (b.first_seen > a.first_seen ? 1 : b.first_seen < a.first_seen ? -1 : b.rank - a.rank));
  else if (f.sort === 'due') out.sort((a, b) => (dueInfo(a).days ?? 9999) - (dueInfo(b).days ?? 9999) || b.rank - a.rank);
  return out;
}
function homeList() {
  const f = ui.homes, q = f.q.trim().toLowerCase();
  const out = DATA.homes.filter((h) => !isHidden(h.id) &&
    (f.area === 'alla' || h.area === f.area) && (f.seg === 'alla' || (f.seg === 'big' ? h.big_house : h.house)) &&
    (!f.onlyNew || isNew(h)) && (!f.view || h.view) && (!f.moveIn || h.move_in_fits) && (!f.noShared || !h.shared) &&
    (!h.rent || h.rent <= f.maxRent) && (!q || hay(h.headline, h.title, h.address, h.place, h.kommune, h.text).includes(q)));
  if (f.sort === 'new') out.sort((a, b) => (b.first_seen > a.first_seen ? 1 : b.first_seen < a.first_seen ? -1 : b.rank - a.rank));
  else if (f.sort === 'cheap') out.sort((a, b) => (a.rent || 1e9) - (b.rent || 1e9));
  else if (f.sort === 'big') out.sort((a, b) => (b.size || 0) - (a.size || 0));
  return out;
}
const activeFilters = (kind) => {
  const f = ui[kind], d = DEF[kind];
  return Object.keys(d).filter((k) => !['q', 'sort', 'area', 'hideApplied'].includes(k) && JSON.stringify(f[k]) !== JSON.stringify(d[k])).length;
};

// ---------- kort ----------
function homeCard(h, mode = 'wide', i = 0) {
  const imgs = (h.images && h.images.length ? h.images : (h.cover ? [h.cover] : [])).slice(0, 6);
  const total = (h.images || []).length || imgs.length;
  const fallback = 'onerror="if(this.src!==this.dataset.full)this.src=this.dataset.full"';
  let media;
  if (!imgs.length) media = '<div class="noimg">Inga bilder i annonsen</div>';
  else if (mode === 'tile') media = `<img src="${esc((h.cover || imgs[0]).replace('/dynamic/960w/', '/dynamic/640w/'))}" data-full="${esc(imgs[0])}" loading="${i < 6 ? 'eager' : 'lazy'}" decoding="async" alt="" ${fallback}>`;
  else media = `<div class="gallery">${imgs.map((src, n) => `<img src="${esc(n === 0 && h.cover ? h.cover : src)}" data-full="${esc(src)}" loading="lazy" decoding="async" alt="" ${fallback}>`).join('')}</div>
    ${imgs.length > 1 ? `<div class="dots">${imgs.map((_, n) => `<i class="${n ? '' : 'on'}"></i>`).join('')}</div>` : ''}`;
  const near = (nearHome[h.id] || []).length;
  const avail = h.move_in_fits ? 'ledig jan/feb' : availInfo(h).toLowerCase();
  return `<article class="card" data-act="open" data-id="${esc(h.id)}" tabindex="0">
    <div class="media ${mode === 'tile' ? 'r' + (i % 4) : ''}">${media}
      <div class="badges">${isNew(h) ? '<span class="badge new">Ny</span>' : ''}${h.view ? '<span class="badge">Utsikt</span>' : ''}${h.big_house ? '<span class="badge">Stort hus</span>' : ''}</div>
      <button class="fab ${isSaved(h.id) ? 'on' : ''}" data-act="save" data-id="${esc(h.id)}" aria-label="${isSaved(h.id) ? 'Ta bort från sparat' : 'Spara'}">${icon('heart')}</button>
    </div>
    <div class="body">
      <h3 class="clamp1">${esc(h.place || h.kommune || areaName(h.area))}</h3>
      <p class="facts clamp1">${esc(h.headline || h.title)}</p>
      <p class="facts clamp1">${esc([h.type, h.size ? `${h.size} m²` : '', h.rooms ? `${h.rooms} rum` : ''].filter(Boolean).join(' · '))}</p>
      <p class="pricel"><b>${h.rent ? nf(h.rent) + ' kr' : 'Hyra saknas'}</b>${h.rent ? ' / mån' : ''}${avail && mode !== 'tile' ? ` · ${esc(avail)}` : ''}</p>
      ${mode !== 'tile' && near ? `<div class="tags"><span class="tag view">${near} jobb inom ${DATA.limits.drive} min</span>${h.move_in_fits ? '<span class="tag good">Passar din start</span>' : ''}</div>` : ''}
    </div></article>`;
}

function jobTags(j, full) {
  const due = dueInfo(j), st = mk(j.id).st;
  return [
    st ? `<span class="tag status">${STATUS[st]}</span>` : '',
    !st && (DATA.letters || {})[j.id] ? '<span class="tag view">Brev klart</span>' : '',
    isNew(j) ? '<span class="tag new">Ny</span>' : '',
    j.housing === 'ja' ? '<span class="tag good">Boende erbjuds</span>' : '',
    j.start_fits ? '<span class="tag good">Start passar</span>' : '',
    due.soon ? `<span class="tag warn">${esc(due.label)}</span>` : '',
    (j.lacks || []).length ? `<span class="tag warn">Krav du kanske saknar</span>` : '',
    full && j.english_ok === 'ja' ? '<span class="tag">Engelska räcker</span>' : '',
    ...(full ? (j.cats || []).map((c) => `<span class="tag">${esc(DATA.categories[c] || c)}</span>`) : []),
  ].join('');
}
// En liten kartbild över var jobbet ligger: gör jobblistan lättare att skumma.
function tileThumb(x, size = 60) {
  if (x.lat == null) return '';
  const z = 9, n = 2 ** z, bg = size * 2.6;
  const fx = ((x.lon + 180) / 360) * n, rad = (x.lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const pos = (f) => Math.round(Math.min(0, Math.max(size - bg, size / 2 - (f - Math.floor(f)) * bg)));
  return `style="background-image:url(https://tile.openstreetmap.org/${z}/${Math.floor(fx)}/${Math.floor(fy)}.png);background-size:${bg}px;background-position:${pos(fx)}px ${pos(fy)}px"`;
}
function jobCard(j) {
  return `<article class="card tint job" data-act="open" data-id="${esc(j.id)}" tabindex="0">
    <div class="jthumb" ${tileThumb(j)} role="img" aria-label="Betyg ${j.score} av 5, ${esc(j.kommune)}"><span class="sbadge s${j.score}">${j.score}</span></div>
    <div>
      <h3 class="clamp2">${esc(j.title)}</h3>
      <p class="facts clamp1">${esc(j.employer)} · ${esc(j.kommune)}</p>
      <p class="facts clamp1">${esc([j.extent, j.engagement, j.start ? `start ${j.start}` : ''].filter(Boolean).join(' · '))}</p>
      <div class="tags">${jobTags(j)}</div>
      ${j.scored_by === 'ai' && j.reason ? `<p class="reason clamp2">${esc(j.reason)}</p>` : ''}
    </div>
    <button class="save ${isSaved(j.id) ? 'on' : ''}" data-act="save" data-id="${esc(j.id)}" aria-label="Spara">${icon('heart')}</button>
  </article>`;
}
function pairCard(p) {
  const j = J[p.job], h = H[p.home];
  if (!j || !h) return '';
  return `<article class="card tint pair">
    <div class="mini" data-act="open" data-id="${esc(j.id)}">${ring(j.score)}<div><h3 class="clamp2">${esc(j.title)}</h3><p class="facts clamp1">${esc(j.employer)} · ${esc(j.kommune)}</p></div></div>
    <div class="link">${icon('car')}<span><b>${p.minutes} min</b> med bil${DATA.summary.estimated_drive ? ' (uppskattat)' : ''}${p.approx ? ' · ungefärlig plats' : ''}</span></div>
    <div class="mini home" data-act="open" data-id="${esc(h.id)}">${h.cover ? `<img src="${esc(h.cover)}" loading="lazy" alt="">` : '<div class="ph"></div>'}
      <div><h3 class="clamp1">${esc(h.place || h.kommune || '')}${h.view ? ' · utsikt' : ''}</h3><p class="facts clamp1">${esc(h.headline || h.title)}</p><p class="pricel"><b>${kr(h.rent)}</b>${h.rent ? ' / mån' : ''}</p></div></div>
  </article>`;
}

// ---------- topp och navigation ----------
function renderNav() {
  const newJobs = DATA.jobs.filter((j) => isNew(j) && !isHidden(j.id)).length;
  const tabs = [['idag', 'sun', 'Idag'], ['jobb', 'work', 'Jobb'], ['bostader', 'home', 'Bostäder'], ['karta', 'map', 'Karta'], ['sparat', 'heart', 'Sparat']];
  $('#nav').innerHTML = tabs.map(([id, ic, label]) => `<button data-act="tab" data-tab="${id}" class="${ui.tab === id ? 'on' : ''}" aria-current="${ui.tab === id ? 'page' : 'false'}">
    ${icon(ic)}${label}${id === 'jobb' && newJobs && newCut ? `<span class="nbadge">${newJobs > 99 ? '99+' : newJobs}</span>` : ''}</button>`).join('');
}
function areaChips(kind) {
  const f = ui[kind];
  return `<button class="chip ${f.area === 'alla' ? 'on' : ''}" data-act="area" data-kind="${kind}" data-area="alla">Alla</button>` +
    DATA.areas.map((a) => `<button class="chip ${f.area === a.id ? 'on' : ''}" data-act="area" data-kind="${kind}" data-area="${a.id}">${esc(a.name)}</button>`).join('');
}
function renderTop() {
  const top = $('#top');
  top.hidden = ui.tab === 'karta';
  const settingsBtn = `<button class="iconbtn" data-act="settings" aria-label="Inställningar">${icon('cog')}</button>`;
  if (ui.tab === 'idag' || ui.tab === 'sparat' || ui.tab === 'par') {
    top.innerHTML = `<div class="bar wrap">${ui.tab === 'par' ? `<button class="iconbtn" data-act="tab" data-tab="idag" aria-label="Tillbaka">${icon('back')}</button>` : ''}
      <div class="title">${ui.tab === 'idag' ? 'Norge i dag' : ui.tab === 'par' ? 'Jobb + bostad' : 'Sparat'}</div>${settingsBtn}</div>`;
    return;
  }
  const kind = ui.tab === 'jobb' ? 'jobs' : 'homes';
  const n = activeFilters(kind);
  const quick = kind === 'jobs'
    ? [['onlyNew', 'Nya'], ['housing', 'Boende erbjuds'], ['start', 'Start passar'], ['noLacks', 'Utan krav jag saknar']]
    : [['onlyNew', 'Nya'], ['view', 'Utsikt'], ['moveIn', 'Ledig jan/feb'], ['noShared', 'Ej delat boende']];
  top.innerHTML = `<div class="wrap">
    <div class="bar"><div class="title">${kind === 'jobs' ? 'Jobb' : 'Bostäder'}</div>${settingsBtn}</div>
    <div class="searchrow"><label class="search">${icon('search')}<input id="q" type="search" enterkeyhint="search" placeholder="${kind === 'jobs' ? 'Titel, arbetsgivare eller ort' : 'Ort, adress eller ord i annonsen'}" value="${esc(ui[kind].q)}"></label>
      <button class="iconbtn" data-act="filters" data-kind="${kind}" aria-label="Filter">${icon('filter')}${n ? `<span class="dot">${n}</span>` : ''}</button></div>
    <div class="chips">${areaChips(kind)}<span class="divider"></span>
      ${quick.map(([k, label]) => `<button class="chip ${ui[kind][k] ? 'on' : ''}" data-act="toggle" data-kind="${kind}" data-key="${k}">${label}</button>`).join('')}</div></div>`;
}

// ---------- vyer ----------
function viewToday() {
  const s = DATA.summary;
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'God natt' : hour < 10 ? 'God morgon' : hour < 18 ? 'Hej' : 'God kväll';
  const fresh = (x) => isNew(x) && !isHidden(x.id);
  const newJobs = DATA.jobs.filter(fresh), newHomes = DATA.homes.filter(fresh);
  const headline = newJobs.length || newHomes.length
    ? `${plural(newJobs.length, 'nytt jobb', 'nya jobb')} och ${plural(newHomes.length, 'ny bostad', 'nya bostäder')}`
    : 'Inget nytt sedan sist';
  const topJobs = (newJobs.length >= 3 ? newJobs : DATA.jobs.filter((j) => !isHidden(j.id) && !mk(j.id).st)).slice(0, 8);
  const homes = (newHomes.length >= 2 ? newHomes : DATA.homes.filter((h) => !isHidden(h.id))).slice(0, 8);
  const pairs = DATA.pairs.filter((p) => J[p.job] && H[p.home] && !isHidden(p.job) && !isHidden(p.home)).slice(0, 6);
  const soon = DATA.jobs.filter((j) => !isHidden(j.id) && !mk(j.id).st && dueInfo(j).soon && (isSaved(j.id) || j.score >= 4))
    .sort((a, b) => dueInfo(a).days - dueInfo(b).days).slice(0, 6);
  const updated = new Date(DATA.generated).toLocaleString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const section = (title, tab, body, cls = '') => body ? `<div class="sec"><h2>${title}</h2>${tab ? `<button data-act="tab" data-tab="${tab}">Visa alla</button>` : ''}</div><div class="rail ${cls}">${body}</div>` : '';
  const since = newCut ? `Nytt sedan du senast öppnade appen, ${shortDate(new Date(newCut))}.` : 'Nytt betyder här det som kom med i den senaste hämtningen.';
  return `<section class="hero">
      <div class="eyebrow">${esc(updated)}</div>
      <h1>${hello}. ${esc(headline)}.</h1>
      <p class="muted small">${since}</p></section>
    ${section(newHomes.length >= 2 ? 'Nya bostäder' : 'Bostäder för dig', 'bostader', homes.map((h) => homeCard(h, 'wide')).join(''))}
    ${section(newJobs.length >= 3 ? 'Nya jobb' : 'Jobb som passar dig', 'jobb', topJobs.map(jobCard).join(''), 'narrow')}
    ${section('Brev klara att skicka', '', DATA.jobs.filter((j) => (DATA.letters || {})[j.id] && !isHidden(j.id) && !mk(j.id).st).slice(0, 8).map(jobCard).join(''), 'narrow')}
    ${section('Jobb + bostad nära varandra', 'par', pairs.map(pairCard).join(''))}
    ${section('Frist snart', '', soon.map(jobCard).join(''), 'narrow')}
    <div class="sec"><h2>Läget just nu</h2></div>
    <div class="nums" style="margin:0 16px 14px">
      <button class="num" data-act="tab" data-tab="bostader"><b>${s.homes}</b><span>bostäder</span>${newHomes.length ? `<em>+${newHomes.length} nya</em>` : ''}</button>
      <button class="num" data-act="tab" data-tab="jobb"><b>${s.jobs}</b><span>jobb</span>${newJobs.length ? `<em>+${newJobs.length} nya</em>` : ''}</button>
      <button class="num" data-act="tab" data-tab="par"><b>${s.pairs}</b><span>jobb + bostad</span></button>
    </div>
    <div class="panel"><table>
      <tr><th>Område</th><th>Jobb</th><th>Bostäder</th><th>Par</th></tr>
      ${s.per_area.map((a) => `<tr><td>${esc(a.name)}</td><td>${a.jobs}${a.new_jobs ? ` <em>+${a.new_jobs}</em>` : ''}</td><td>${a.homes}${a.new_homes ? ` <em>+${a.new_homes}</em>` : ''}</td><td>${a.pairs}</td></tr>`).join('')}
    </table></div>`;
}

// Aktiva filter som inte syns bland snabbknapparna, som piller man kan ta bort ett i taget.
function filterPills(kind) {
  const f = ui[kind], out = [];
  const pill = (label, attrs) => out.push(`<button class="chip pill" ${attrs} aria-label="Ta bort filter: ${esc(label)}">${esc(label)} ${icon('x')}</button>`);
  if (f.q.trim()) pill(`"${f.q.trim()}"`, `data-act="clearq" data-kind="${kind}"`);
  if (kind === 'jobs') {
    f.cats.forEach((c) => pill(DATA.categories[c] || c, `data-act="cat" data-val="${c}"`));
    if (f.min) pill(`Betyg ${f.min}+`, 'data-act="set" data-kind="jobs" data-key="min" data-val="0"');
    if (f.english) pill('Engelska räcker', 'data-act="toggle" data-kind="jobs" data-key="english"');
    if (!f.hideApplied) pill('Visar även sökta', 'data-act="toggle" data-kind="jobs" data-key="hideApplied"');
  } else if (f.maxRent < DEF.homes.maxRent) pill(`Högst ${nf(f.maxRent)} kr`, `data-act="set" data-kind="homes" data-key="maxRent" data-val="${DEF.homes.maxRent}"`);
  if (out.length > 1) out.push(`<button class="chip pill clear" data-act="reset" data-kind="${kind}">Rensa alla</button>`);
  return out.length ? `<div class="chips pills">${out.join('')}</div>` : '';
}

function viewList(kind) {
  const items = kind === 'jobs' ? jobList() : homeList();
  const f = ui[kind];
  const sorts = kind === 'jobs' ? [['match', 'Bäst match'], ['new', 'Nyast'], ['due', 'Frist snart']] : [['best', 'Bäst för dig'], ['new', 'Nyast'], ['cheap', 'Lägst hyra'], ['big', 'Störst']];
  const noun = kind === 'jobs' ? 'jobb' : (items.length === 1 ? 'bostad' : 'bostäder');
  const seg = kind === 'homes' ? `<div class="seg" style="margin:0 16px 12px">${[['alla', 'Alla'], ['hus', 'Hus och hytter'], ['big', 'Stora hus']]
    .map(([v, l]) => `<button data-act="set" data-kind="homes" data-key="seg" data-val="${v}" class="${f.seg === v ? 'on' : ''}">${l}</button>`).join('')}</div>` : '';
  const cards = kind === 'jobs' ? `<div class="list">${items.slice(0, limit).map(jobCard).join('')}</div>`
    : `<div class="masonry">${items.slice(0, limit).map((h, i) => homeCard(h, 'tile', i)).join('')}</div>`;
  const empty = `<div class="empty">${icon('search')}<b>Inget matchar just nu</b>Prova att ta bort ett filter eller byta område.<br><br><button class="btn" data-act="reset" data-kind="${kind}">Rensa filter</button></div>`;
  return `${seg}<div class="count"><span class="muted small">${items.length} ${noun}${items.length > 1 ? ` · <button class="linkbtn" data-act="triage" data-kind="${kind}">Gå igenom en i taget</button>` : ''}</span>
      <select data-act="sort" data-kind="${kind}" aria-label="Sortering">${sorts.map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${filterPills(kind)}
    ${items.length ? `${cards}${items.length > limit ? '<div class="more" id="more"></div>' : ''}` : empty}`;
}

function viewPairs() {
  const items = DATA.pairs.filter((p) => J[p.job] && H[p.home] && !isHidden(p.job) && !isHidden(p.home));
  return `<p class="muted small" style="padding:6px 16px 12px">${items.length} kombinationer där ett bra jobb och en bostad ligger högst ${DATA.limits.drive} minuter från varandra med bil${DATA.summary.estimated_drive ? ' (uppskattad körtid)' : ''}.</p>
    <div class="list">${items.map(pairCard).join('') || '<div class="empty"><b>Inga kombinationer just nu</b></div>'}</div>`;
}

function viewSaved() {
  const all = [...DATA.jobs, ...DATA.homes];
  const applied = DATA.jobs.filter((j) => mk(j.id).st);
  const sj = DATA.jobs.filter((j) => isSaved(j.id) && !mk(j.id).st), sh = DATA.homes.filter((h) => isSaved(h.id));
  const gone = all.filter((x) => isHidden(x.id));
  const tabs = [['ansokningar', `Ansökningar ${applied.length || ''}`], ['jobb', `Jobb ${sj.length || ''}`], ['bostader', `Bostäder ${sh.length || ''}`], ['dolda', `Dolda ${gone.length || ''}`]];
  const tiles = (rows) => `<div class="masonry">${rows.map((h, i) => homeCard(h, 'tile', i)).join('')}</div>`;
  let body = '';
  const empty = (title, text) => `<div class="empty">${icon('heart')}<b>${title}</b>${text}</div>`;
  if (ui.saved === 'ansokningar') {
    body = applied.length ? Object.entries(STATUS).map(([k, label]) => {
      const rows = applied.filter((j) => mk(j.id).st === k);
      return rows.length ? `<div class="sec"><h2>${label} (${rows.length})</h2></div><div class="list">${rows.map(jobCard).join('')}</div>` : '';
    }).join('') : empty('Inga ansökningar än', 'Öppna ett jobb och markera det som sökt, så håller appen ordning på var du står.');
  } else if (ui.saved === 'jobb') body = sj.length ? `<div class="list">${sj.map(jobCard).join('')}</div>` : empty('Inga sparade jobb', 'Tryck på hjärtat på ett jobb för att spara det här.');
  else if (ui.saved === 'bostader') body = sh.length ? tiles(sh) : empty('Inga sparade bostäder', 'Tryck på hjärtat på en bostad för att spara den här.');
  else body = gone.length ? `<div class="list">${gone.filter((x) => x.id in J).map(jobCard).join('')}</div>${tiles(gone.filter((x) => x.id in H))}` : empty('Inget dolt', 'Det du markerar som "Inte för mig" hamnar här och kan tas tillbaka.');
  return `<div class="seg" style="margin:4px 16px 14px">${tabs.map(([v, l]) => `<button data-act="savedtab" data-val="${v}" class="${ui.saved === v ? 'on' : ''}">${l}</button>`).join('')}</div>${body}
    <p class="muted small" style="padding:22px 16px 0;text-align:center">Sparat, dolt och anteckningar finns bara på den här enheten. Säkerhetskopiera under inställningar.</p>`;
}

function render() {
  store.set('ui2', ui);
  renderNav();
  renderTop();
  const main = $('#main');
  const isMap = ui.tab === 'karta';
  $('#map').hidden = !isMap;
  main.hidden = isMap;
  $$('.maptools, .mapcard, .mapbar').forEach((el) => el.remove());
  dirty = false;
  if (isMap) { drawMap(mapNeedsFit); mapNeedsFit = false; return; }
  main.innerHTML = ui.tab === 'idag' ? viewToday() : ui.tab === 'jobb' ? viewList('jobs') : ui.tab === 'bostader' ? viewList('homes') : ui.tab === 'par' ? viewPairs() : viewSaved();
  if (moreObserver) moreObserver.disconnect();
  const more = $('#more');
  if (more) {
    moreObserver = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { limit += 20; render(); } }, { rootMargin: '600px' });
    moreObserver.observe(more);
  }
}

// ---------- ark ----------
function openSheet(spec) {
  sheets.push(spec);
  history.pushState({ sheet: sheets.length }, '');
  mountSheet(true);
}
function mountSheet(animate) {
  const spec = sheets[sheets.length - 1];
  const overlay = $('#overlay');
  if (!spec) { overlay.innerHTML = ''; document.body.classList.remove('locked'); return; }
  document.body.classList.add('locked');
  const keepScroll = !animate && $('.sheet', overlay) ? $('.sheet', overlay).scrollTop : 0;
  overlay.innerHTML = `<div class="scrim ${animate ? '' : 'in'}" data-act="close"></div>
    <section class="sheet ${spec.half ? 'half' : ''} ${animate ? '' : 'in'}" role="dialog" aria-modal="true">
      ${spec.half ? '<div class="grab"></div>' : ''}
      <div class="head"><button class="iconbtn" data-act="close" aria-label="Stäng">${icon(spec.half || spec.closeX ? 'x' : 'back')}</button><div class="title">${esc(spec.title || '')}</div>${spec.tools ? spec.tools() : ''}</div>
      ${spec.body()}
    </section>${spec.bar ? `<div class="actionbar">${spec.bar()}</div>` : ''}`;
  const sheet = $('.sheet', overlay);
  if (animate) requestAnimationFrame(() => requestAnimationFrame(() => { const sc = $('.scrim', overlay); if (sc) sc.classList.add('in'); if (sheet.isConnected) sheet.classList.add('in'); }));
  else sheet.scrollTop = spec.keep ? keepScroll : 0;
  if (spec.mount) spec.mount(sheet);
}
const refreshSheet = () => { const s = sheets[sheets.length - 1]; if (s) { s.keep = true; mountSheet(false); s.keep = false; } };
window.addEventListener('popstate', () => {
  if ($('.lightbox')) { $('.lightbox').remove(); return; }
  if (sheets.length) {
    const y = window.scrollY;
    sheets.pop();
    mountSheet(false);
    if (dirty && !sheets.length) { render(); window.scrollTo(0, y); } // rita bara om när något faktiskt ändrats
  }
});
const closeSheet = () => history.back();

async function miniMap(sheet, item, others) {
  const el = $('.minimap', sheet);
  if (!el || item.lat == null) return;
  try { await loadLeaflet(); } catch { el.remove(); return; }
  if (!el.isConnected) return;
  const map = L.map(el, { zoomControl: false, attributionControl: false, dragging: !L.Browser.mobile, scrollWheelZoom: false, tap: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
  const pts = [[item.lat, item.lon]];
  const pin = (x, html, cls, z) => L.marker([x.lat, x.lon], { icon: L.divIcon({ className: '', html: `<span class="pin ${cls}">${html}</span>`, iconSize: [0, 0] }), zIndexOffset: z })
    .on('click', () => { if (x.id !== item.id) openItem(x.id); }).addTo(map);
  others.filter((x) => x.lat != null).slice(0, 14).forEach((x) => { pts.push([x.lat, x.lon]); pin(x, x.id in J ? x.score : (x.rent ? nf(x.rent) + ' kr' : 'Bostad'), x.id in J ? 'job' : '', 0); });
  pin(item, item.id in J ? item.score : (item.rent ? nf(item.rent) + ' kr' : 'Här'), item.id in J ? 'job here' : 'view', 900);
  if (pts.length > 1) map.fitBounds(pts, { padding: [34, 34], maxZoom: 13 }); else map.setView(pts[0], 12);
}

function openItem(id) {
  if (id in H) openSheet(homeSheet(id)); else if (id in J) openSheet(jobSheet(id));
}

function homeSheet(id) {
  const h = H[id];
  return {
    title: h.place || h.kommune || 'Bostad',
    tools: () => `<button class="iconbtn" data-act="share" data-id="${esc(id)}" aria-label="Dela">${icon('share')}</button>`,
    body: () => {
      const imgs = h.images && h.images.length ? h.images : (h.cover ? [h.cover] : []);
      const near = (nearHome[id] || []).filter((n) => J[n.id] && !isHidden(n.id)).sort((a, b) => J[b.id].rank - J[a.id].rank);
      const facts = [['Hyra', h.rent ? `${nf(h.rent)} kr/mån` : 'Saknas'], ['Storlek', h.size ? `${h.size} m²` : 'Saknas'], ['Rum', h.rooms ? `${h.rooms}${h.bedrooms ? ` (${h.bedrooms} sovrum)` : ''}` : (h.bedrooms ? `${h.bedrooms} sovrum` : 'Saknas')],
        ['Ledig', availInfo(h).replace(/^Ledig:? ?/, '') || 'Saknas'], ['Depositum', h.deposit ? `${nf(h.deposit)} kr` : 'Saknas'], ['Typ', h.type || 'Saknas']];
      return `${imgs.length ? `<div class="media hero-media"><div class="gallery" data-zoom>${imgs.map((src, i) => `<img src="${esc(src)}" loading="${i ? 'lazy' : 'eager'}" alt="Bild ${i + 1} av ${imgs.length}">`).join('')}</div>
          ${imgs.length > 1 ? `<span class="counter">1/${imgs.length}</span>` : ''}</div>` : ''}
        <div class="pad">
          <h1 style="margin-top:20px;font-size:1.5rem">${esc(h.headline || h.title)}</h1>
          <p class="facts" style="margin-top:6px">${esc([h.address || h.place, areaName(h.area)].filter(Boolean).join(' · '))}</p>
          <div class="tags">${isNew(h) ? '<span class="tag new">Ny</span>' : ''}${h.view ? '<span class="tag view">Utsikt</span>' : ''}${h.move_in_fits ? '<span class="tag good">Ledig jan/feb 2027</span>' : ''}
            ${h.big_house ? '<span class="tag">Stort hus</span>' : ''}${h.shared ? '<span class="tag">Delat boende</span>' : ''}${h.geo_approx ? '<span class="tag warn">Ungefärlig plats</span>' : ''}</div>
          <dl class="dl">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
          ${h.includes ? `<p class="facts" style="margin-top:12px">Ingår i hyran: ${esc(h.includes)}</p>` : ''}
          ${h.text ? `<div class="block"><h2>Om bostaden</h2><p class="prose clamp" id="prose">${esc(h.text)}</p><button class="textbtn" data-act="expand">Visa mer</button></div>` : ''}
          ${(h.amenities || []).length ? `<div class="block"><h2>Detta finns</h2><div class="tags">${h.amenities.map((a) => `<span class="tag">${esc(a)}</span>`).join('')}</div></div>` : ''}
          <div class="block"><h2>Jobb inom ${DATA.limits.drive} minuter</h2>
            ${h.lat != null ? `<div class="minimap" aria-label="Karta över bostaden och jobb i närheten"></div><p class="muted small" style="margin:8px 0 6px">${h.geo_approx ? 'Bostadens plats är ungefärlig. ' : ''}Svarta punkter är jobb, siffran är betyget.</p>` : ''}
            ${near.length ? `<div class="nearby">${near.slice(0, 8).map((n) => { const j = J[n.id]; return `<button data-act="open" data-id="${esc(j.id)}">${ring(j.score)}<div><b>${esc(j.title)}</b><div class="facts">${esc(j.employer)} · ${esc(j.kommune)}</div></div><div class="min">${n.min} min<small>bil</small></div></button>`; }).join('')}</div>
              ${near.length > 8 ? `<p class="muted small" style="margin-top:8px">och ${near.length - 8} till</p>` : ''}` : '<p class="muted">Inga bra jobb inom körtiden just nu.</p>'}</div>
          <div class="block"><h2>Din anteckning</h2><textarea data-note="${esc(id)}" placeholder="Till exempel: mejlade hyresvärden 14 nov.">${esc(mk(id).note || '')}</textarea></div>
          <div class="block row">${h.lat != null ? `<a class="btn" href="${mapsUrl(h)}" target="_blank" rel="noopener">${icon('pin')} Karta</a>` : ''}
            <button class="btn ${isHidden(id) ? 'on' : ''}" data-act="hide" data-id="${esc(id)}">${icon('eyeoff')} ${isHidden(id) ? 'Visa igen' : 'Inte för mig'}</button></div>
          <p class="muted small" style="margin-top:14px">Källa: ${h.source === 'hybel' ? 'hybel.no' : 'FINN'}</p>
        </div>`;
    },
    mount: (sheet) => miniMap(sheet, h, (nearHome[id] || []).filter((n) => J[n.id] && !isHidden(n.id)).map((n) => J[n.id]).sort((a, b) => b.rank - a.rank)),
    bar: () => `<div class="info"><b>${h.rent ? nf(h.rent) + ' kr' : 'Hyra saknas'}</b><span>${h.rent ? 'per månad' : ''}${availInfo(h) ? ' · ' + esc(availInfo(h).toLowerCase()) : ''}</span></div>
      <button class="btn sq ${isSaved(id) ? 'on' : ''}" data-act="save" data-id="${esc(id)}" aria-label="Spara">${icon('heart')}</button>
      <a class="btn primary" href="${esc(h.url)}" target="_blank" rel="noopener">Annons ${icon('out')}</a>`,
  };
}

function letterUrl(j, draft) {
  if (draft) {
    const edit = `Här är ett utkast till personligt brev för jobbet "${j.title}" hos ${j.employer} (${j.url}). Hjälp mig förbättra det. Behåll det kort och konkret, utan klyschor, och hitta inte på något. Fråga mig vad jag vill ändra.\n\n${draft}`;
    return `https://claude.ai/new?q=${encodeURIComponent(edit.slice(0, 1800))}`;
  }
  const prompt = `Skriv ett personligt brev till det här jobbet. Läs annonsen på länken först. Utgå från mitt CV (jag klistrar in det om du inte redan har det). ` +
    `Skriv kort, högst en halv sida, konkret och utan klyschor. Visa mig brevet innan något skickas.\n\nJobb: ${j.title}\nArbetsgivare: ${j.employer}\nOrt: ${j.kommune}\nAnnons: ${j.url}`;
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

function jobSheet(id) {
  const j = J[id];
  return {
    title: j.employer || 'Jobb',
    tools: () => `<button class="iconbtn" data-act="share" data-id="${esc(id)}" aria-label="Dela">${icon('share')}</button>`,
    body: () => {
      const due = dueInfo(j), st = mk(id).st || '', letter = (DATA.letters || {})[id];
      const near = (nearJob[id] || []).filter((n) => H[n.id] && !isHidden(n.id)).sort((a, b) => a.min - b.min);
      const facts = [['Arbetsgivare', j.employer], ['Ort', `${j.kommune}, ${areaName(j.area)}`], ['Omfattning', [j.extent, j.engagement].filter(Boolean).join(', ') || 'Saknas'],
        ['Start', j.start || 'Saknas'], ['Ansökningsfrist', due.label.replace(/^Frist:? ?/i, '') || 'Saknas'], ['Boende', j.housing === 'ja' ? 'Erbjuds' : j.housing === 'nej' ? 'Ordnas inte' : 'Okänt']];
      return `<div class="pad">
          <div style="display:grid;grid-template-columns:62px 1fr;gap:16px;align-items:center;margin-top:6px">${ring(j.score, 'big')}
            <div><h1 style="font-size:1.4rem">${esc(j.title)}</h1><p class="facts" style="margin-top:4px">${esc(j.employer)} · ${esc(j.kommune)}</p></div></div>
          <div class="tags">${jobTags(j, true)}</div>
          ${j.reason ? `<div class="callout" style="margin-top:16px">${icon('check')}<div><b>${j.scored_by === 'ai' ? 'Varför betyget' : 'Preliminärt betyg'}</b><div class="facts" style="color:var(--ink)">${esc(j.reason)}</div></div></div>` : ''}
          ${(j.lacks || []).length ? `<div class="callout warn" style="margin-top:10px">${icon('eyeoff')}<div><b>Krav du kanske saknar</b><div>${esc(j.lacks.join(', '))}</div></div></div>` : ''}
          <dl class="dl">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
          ${(j.requirements || []).length ? `<div class="block"><h2>Krav i annonsen</h2><div class="tags">${j.requirements.map((r) => `<span class="tag">${esc(r)}</span>`).join('')}</div></div>` : ''}
          <div class="block"><h2>Min ansökan</h2>
            <div class="seg">${[['', 'Inte sökt'], ...Object.entries(STATUS)].map(([k, l]) => `<button data-act="status" data-id="${esc(id)}" data-val="${k}" class="${st === k ? 'on' : ''}">${l}</button>`).join('')}</div>
            <textarea data-note="${esc(id)}" placeholder="Anteckning: vem du pratade med, när du sökte, vad som sades.">${esc(mk(id).note || '')}</textarea>
          </div>
          <div class="block"><h2>Personligt brev</h2>
            ${letter ? `<div class="letter" id="letter">${esc(letter.text)}</div>
              <div class="row" style="margin-top:10px"><button class="btn primary" data-act="copyletter" data-id="${esc(id)}">Kopiera brevet</button>
                <a class="btn" href="${esc(letterUrl(j, letter.text))}" target="_blank" rel="noopener">${icon('pen')} Ändra</a></div>
              <p class="muted small" style="margin-top:8px">Utkast skrivet av Claude utifrån ditt CV. Läs igenom och ändra innan du skickar. Inget skickas automatiskt.</p>`
            : `<p class="muted">Brev skrivs i förväg för de bäst rankade jobben, några nya varje morgon. För det här jobbet kan du be om ett direkt.</p>
              <a class="btn block quiet" style="margin-top:10px" href="${esc(letterUrl(j))}" target="_blank" rel="noopener">${icon('pen')} Skriv brev med Claude</a>`}</div>
          <div class="block"><h2>Bostäder inom ${DATA.limits.drive} minuter</h2>
            ${j.lat != null ? `<div class="minimap" aria-label="Karta över arbetsplatsen och bostäder i närheten"></div><p class="muted small" style="margin:8px 0 6px">${j.geo_approx ? 'Annonsen saknar adress, så jobbet visas mitt i kommunen. ' : ''}Prislapparna är bostäder.</p>` : ''}
            ${j.lacks && j.lacks.length || j.score < 3 ? '<p class="muted">Bostäder paras bara ihop med jobb som har betyg 3 eller högre och inga saknade krav.</p>'
              : near.length ? `<div class="nearby">${near.slice(0, 8).map((n) => { const h = H[n.id]; return `<button data-act="open" data-id="${esc(h.id)}">${h.cover ? `<img src="${esc(h.cover)}" loading="lazy" alt="">` : '<div class="ph"></div>'}<div><b>${esc(h.headline || h.title)}</b><div class="facts">${kr(h.rent)} · ${esc(h.place || h.kommune || '')}</div></div><div class="min">${n.min} min<small>bil</small></div></button>`; }).join('')}</div>`
              : '<p class="muted">Inga bostäder inom körtiden just nu.</p>'}</div>
          <div class="block row">${j.lat != null ? `<a class="btn" href="${mapsUrl(j)}" target="_blank" rel="noopener">${icon('pin')} Karta</a>` : ''}
            <button class="btn ${isHidden(id) ? 'on' : ''}" data-act="hide" data-id="${esc(id)}">${icon('eyeoff')} ${isHidden(id) ? 'Visa igen' : 'Inte för mig'}</button></div>
          <p class="muted small" style="margin-top:14px">Källa: ${j.source === 'nav' ? 'NAV / arbeidsplassen.no' : 'FINN'}${j.geo_approx ? ' · platsen på kartan är kommunens mittpunkt' : ''}</p>
        </div>`;
    },
    mount: (sheet) => miniMap(sheet, j, (nearJob[id] || []).filter((n) => H[n.id] && !isHidden(n.id)).map((n) => H[n.id])),
    bar: () => `<div class="info"><b>Betyg ${j.score} av 5</b><span>${esc(dueInfo(j).label || 'Ingen frist angiven')}</span></div>
      <button class="btn sq ${isSaved(id) ? 'on' : ''}" data-act="save" data-id="${esc(id)}" aria-label="Spara">${icon('heart')}</button>
      <a class="btn primary" href="${esc(j.url)}" target="_blank" rel="noopener">Annons ${icon('out')}</a>`,
  };
}

// Snabbsortering: en annons i taget, med stora knappar eller svep åt sidan.
function triageSheet(kind) {
  const queue = (kind === 'jobs' ? jobList() : homeList()).filter((x) => !isSaved(x.id) && !mk(x.id).st).map((x) => x.id);
  const spec = {
    queue, i: 0, prev: [], closeX: true,
    get title() { return `${Math.min(this.i + 1, queue.length)} av ${queue.length}`; },
    tools: () => `<button class="iconbtn" data-act="tri" data-val="undo" aria-label="Ångra senaste">${icon('undo')}</button>`,
    body: () => {
      const id = queue[spec.i], x = J[id] || H[id];
      if (!x) return '<div class="empty"><b>Inget att gå igenom</b>Allt i den här listan är redan sparat eller sökt.</div>';
      if (id in H) {
        const imgs = (x.images && x.images.length ? x.images : (x.cover ? [x.cover] : [])).slice(0, 8);
        return `<div class="tri" data-swipe>${imgs.length ? `<div class="media hero-media"><div class="gallery">${imgs.map((src, n) => `<img src="${esc(src)}" loading="${n ? 'lazy' : 'eager'}" alt="">`).join('')}</div>
            ${imgs.length > 1 ? `<span class="counter">1/${(x.images || imgs).length}</span>` : ''}</div>` : ''}
          <div class="pad"><h1 style="margin-top:16px;font-size:1.4rem">${esc(x.place || x.kommune || '')}</h1>
            <p class="facts">${esc(x.headline || x.title)}</p>
            <p class="facts">${esc([x.type, x.size ? `${x.size} m²` : '', x.rooms ? `${x.rooms} rum` : '', availInfo(x)].filter(Boolean).join(' · '))}</p>
            <p class="pricel" style="font-size:1.1rem"><b>${kr(x.rent)}</b>${x.rent ? ' / mån' : ''}</p>
            <div class="tags">${x.view ? '<span class="tag view">Utsikt</span>' : ''}${x.big_house ? '<span class="tag">Stort hus</span>' : ''}${x.shared ? '<span class="tag">Delat boende</span>' : ''}
              ${(nearHome[id] || []).length ? `<span class="tag view">${(nearHome[id] || []).length} jobb inom ${DATA.limits.drive} min</span>` : ''}</div>
            ${x.text ? `<p class="prose clamp" style="margin-top:14px">${esc(x.text)}</p>` : ''}
            <button class="textbtn" data-act="open" data-id="${esc(id)}">Visa allt om bostaden</button></div></div>`;
      }
      return `<div class="tri pad" data-swipe><div style="display:grid;grid-template-columns:62px 1fr;gap:16px;align-items:center;margin-top:10px">${ring(x.score, 'big')}
          <div><h1 style="font-size:1.4rem">${esc(x.title)}</h1><p class="facts" style="margin-top:4px">${esc(x.employer)} · ${esc(x.kommune)}</p></div></div>
        <div class="tags">${jobTags(x, true)}</div>
        ${x.reason ? `<div class="callout" style="margin-top:16px">${icon('check')}<div>${esc(x.reason)}</div></div>` : ''}
        ${(x.lacks || []).length ? `<div class="callout warn" style="margin-top:10px">${icon('eyeoff')}<div><b>Krav du kanske saknar</b>${esc(x.lacks.join(', '))}</div></div>` : ''}
        <dl class="dl">${[['Omfattning', [x.extent, x.engagement].filter(Boolean).join(', ') || 'Saknas'], ['Start', x.start || 'Saknas'], ['Frist', dueInfo(x).label.replace(/^Frist:? ?/i, '') || 'Saknas'], ['Boende', x.housing === 'ja' ? 'Erbjuds' : 'Okänt']]
          .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <button class="textbtn" data-act="open" data-id="${esc(id)}">Visa allt om jobbet</button></div>`;
    },
    bar: () => `<button class="btn" data-act="tri" data-val="hide" style="flex:1">${icon('x')} Inte för mig</button>
      <button class="btn primary" data-act="tri" data-val="save" style="flex:1">${icon('heart')} Spara</button>`,
    mount: (sheet) => {
      const el = $('[data-swipe]', sheet);
      if (!el) return;
      let x0 = null, y0 = 0;
      el.addEventListener('touchstart', (e) => { if (e.target.closest('.gallery')) { x0 = null; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
      el.addEventListener('touchend', (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 2) $(`[data-act="tri"][data-val="${dx > 0 ? 'save' : 'hide'}"]`).click();
      }, { passive: true });
    },
  };
  return spec;
}

function filterSheet(kind) {
  const opt = (key, label, hint) => `<div class="opt ${ui[kind][key] ? 'on' : ''}" data-act="toggle" data-kind="${kind}" data-key="${key}" role="switch" aria-checked="${!!ui[kind][key]}" tabindex="0">
    <div>${label}${hint ? `<small>${hint}</small>` : ''}</div><span class="switch"></span></div>`;
  return {
    half: true, title: 'Filter',
    body: () => {
      const f = ui[kind];
      const count = (kind === 'jobs' ? jobList() : homeList()).length;
      const areas = `<div class="block"><h2>Område</h2><div class="grid2">${[['alla', 'Alla områden'], ...DATA.areas.map((a) => [a.id, a.name])]
        .map(([v, l]) => `<button class="pick ${f.area === v ? 'on' : ''}" data-act="area" data-kind="${kind}" data-area="${v}">${esc(l)}</button>`).join('')}</div></div>`;
      const specific = kind === 'jobs'
        ? `<div class="block"><h2>Yrke</h2><div class="grid2">${Object.entries(DATA.categories).map(([v, l]) => `<button class="pick ${f.cats.includes(v) ? 'on' : ''}" data-act="cat" data-val="${v}">${esc(l)}</button>`).join('')}</div></div>
           <div class="block"><h2>Lägsta betyg</h2><div class="seg">${[[0, 'Alla'], [3, '3+'], [4, '4+'], [5, '5']].map(([v, l]) => `<button data-act="set" data-kind="jobs" data-key="min" data-val="${v}" class="${f.min === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
           <div class="block">${opt('onlyNew', 'Bara nya', 'Tillkommet sedan du senast öppnade appen')}${opt('housing', 'Boende erbjuds', 'Arbetsgivaren ordnar eller hjälper till med bostad')}${opt('start', 'Start passar', 'Januari eller februari 2027, snarest eller efter avtal')}
             ${opt('noLacks', 'Utan krav jag saknar', 'Döljer fagbrev, säkerhetsklarering och tungt körkort')}${opt('english', 'Engelska räcker')}${opt('hideApplied', 'Dölj jobb jag redan sökt')}</div>`
        : `<div class="block"><h2>Högsta hyra: ${nf(f.maxRent)} kr</h2><input type="range" min="4000" max="16000" step="500" value="${f.maxRent}" data-range="maxRent"></div>
           <div class="block">${opt('onlyNew', 'Bara nya', 'Tillkommet sedan du senast öppnade appen')}${opt('view', 'Utsikt', 'Annonsen nämner utsikt, havutsikt eller panorama')}${opt('moveIn', 'Ledig januari eller februari 2027')}${opt('noShared', 'Dölj delat boende', 'Rum i kollektiv och bofellesskap')}</div>`;
      return `<div class="pad">${areas}${specific}
        <div class="block row"><button class="btn" data-act="reset" data-kind="${kind}">Rensa</button><button class="btn primary" data-act="close">Visa ${count}</button></div></div>`;
    },
  };
}

function settingsSheet() {
  return {
    half: true, title: 'Inställningar',
    body: () => {
      const s = DATA.summary, theme = store.get('theme', 'auto');
      return `<div class="pad">
        <div class="block"><h2>Utseende</h2><div class="seg">${[['auto', 'Automatiskt'], ['light', 'Ljust'], ['dark', 'Mörkt']].map(([v, l]) => `<button data-act="theme" data-val="${v}" class="${theme === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="block"><h2>Senaste körningen</h2>
          <table>${s.sources.map((x) => `<tr><td>${esc(x.name)}</td><td style="text-align:left">${esc(x.status)}${x.note ? `<div class="muted small">${esc(x.note)}</div>` : ''}</td></tr>`).join('')}</table>
          <p class="muted small" style="margin-top:8px">Kostnad: ${s.costs.total_sek} kr. Stora hus i listan: ${s.big_houses}.${s.estimated_drive ? ' Körtiderna är uppskattade (fågelvägen × 1,4).' : ''}</p>
          ${DATA.run_url ? `<a class="btn block" style="margin-top:10px" href="${esc(DATA.run_url)}" target="_blank" rel="noopener">${icon('refresh')} Starta en ny körning på GitHub</a>` : ''}</div>
        <div class="block"><h2>Dina markeringar</h2>
          <p class="muted small">Sparat, dolt, ansökningar och anteckningar finns bara i den här webbläsaren. Spara en kopia om du byter telefon.</p>
          <div class="row" style="margin-top:10px"><button class="btn" data-act="export">Säkerhetskopiera</button><button class="btn" data-act="import">Återställ</button></div>
          <input type="file" id="importfile" accept="application/json" hidden></div>
        <div class="block"><h2>Din länk</h2>
          <p class="muted small">Har du lagt appen på hemskärmen och den ber om en nyckel? Kopiera länken här i webbläsaren och klistra in den där.</p>
          <button class="btn block" style="margin-top:10px" data-act="copylink">Kopiera min länk</button></div>
      </div>`;
    },
  };
}

// ---------- karta ----------
let lmap = null, llayer = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; js.onload = resolve; js.onerror = reject;
    document.head.appendChild(js);
  });
}
async function drawMap(fit = true) {
  const tools = document.createElement('div');
  tools.className = 'maptools';
  tools.innerHTML = `<div class="chips">
    <button class="chip ${ui.map.homes ? 'on' : ''}" data-act="maptoggle" data-key="homes">${icon('home')} Bostäder</button>
    <button class="chip ${ui.map.jobs ? 'on' : ''}" data-act="maptoggle" data-key="jobs">${icon('work')} Jobb</button>
    <button class="chip ${ui.map.top ? 'on' : ''}" data-act="maptoggle" data-key="top">Bara betyg 4+</button></div>`;
  document.body.appendChild(tools);
  const bar = document.createElement('button');
  bar.className = 'mapbar';
  bar.dataset.act = 'maplist';
  bar.textContent = 'Laddar kartan…';
  document.body.appendChild(bar);
  try { await loadLeaflet(); } catch { toast('Kartan kunde inte laddas. Kontrollera uppkopplingen.'); return; }
  if (!lmap) {
    lmap = L.map('map', { zoomControl: false, attributionControl: true }).setView([68.6, 16], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(lmap);
    llayer = L.layerGroup().addTo(lmap);
    lmap.on('click', () => $$('.mapcard').forEach((el) => el.remove()));
    lmap.on('moveend zoomend', renderPins);
  }
  mapItems = [];
  const add = (x, i) => {
    if (x.lat == null) return;
    const spread = x.geo_approx ? 0.014 : 0; // jobb utan adress ligger på kommunens mittpunkt: sprid ut dem
    mapItems.push({ x, job: x.id in J, lat: x.lat + Math.sin(i * 2.4) * spread, lon: x.lon + Math.cos(i * 2.4) * spread * 2.6 });
  };
  if (ui.map.jobs) DATA.jobs.filter((j) => !isHidden(j.id) && (!ui.map.top || j.score >= 4)).forEach(add);
  if (ui.map.homes) DATA.homes.filter((h) => !isHidden(h.id)).forEach(add);
  setTimeout(() => {
    lmap.invalidateSize();
    const homes = mapItems.filter((it) => !it.job), focus = (homes.length ? homes : mapItems).map((it) => [it.lat, it.lon]); // börja där bostäderna finns
    if (fit && focus.length) lmap.fitBounds(focus, { padding: [50, 50], maxZoom: 11 });
    renderPins();
  }, 60);
}

// Annonser som hamnar nära varandra på skärmen slås ihop till en bubbla med antal. Tryck zoomar in.
function renderPins() {
  if (!lmap || ui.tab !== 'karta') return;
  llayer.clearLayers();
  const view = lmap.getBounds(), wide = view.pad(0.25), cell = 66, grid = new Map(), zoom = lmap.getZoom();
  mapVisible = [];
  for (const it of mapItems) {
    if (!wide.contains([it.lat, it.lon])) continue;
    if (view.contains([it.lat, it.lon])) mapVisible.push(it.x);
    const pt = lmap.latLngToContainerPoint([it.lat, it.lon]);
    const key = `${Math.floor(pt.x / (cell * 2))}:${Math.floor(pt.y / cell)}`; // bubblorna är breda, så rutorna är det också
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(it);
  }
  const marker = (lat, lon, html, cls, z, onClick) => L.marker([lat, lon], { icon: L.divIcon({ className: '', html: `<span class="pin ${cls}">${html}</span>`, iconSize: [0, 0] }), zIndexOffset: z })
    .on('click', (e) => { L.DomEvent.stopPropagation(e); onClick(); }).addTo(llayer);
  for (const group of grid.values()) {
    if (group.length === 1 || zoom >= 15) {
      group.forEach((it) => marker(it.lat, it.lon, it.job ? it.x.score : (it.x.rent ? nf(it.x.rent) + ' kr' : 'Bostad'), it.job ? 'job' : (it.x.view ? 'view' : ''), it.job ? 0 : 400, () => showMapCard(it.x.id)));
      continue;
    }
    const homes = group.filter((it) => !it.job).length, jobs = group.length - homes;
    const label = [homes ? `${homes} ${homes === 1 ? 'bostad' : 'bostäder'}` : '', jobs ? `${jobs} jobb` : ''].filter(Boolean).join(' · ');
    const lat = group.reduce((a, it) => a + it.lat, 0) / group.length, lon = group.reduce((a, it) => a + it.lon, 0) / group.length;
    marker(lat, lon, label, `cluster ${homes ? '' : 'jobs'}`, 800, () => lmap.fitBounds(group.map((it) => [it.lat, it.lon]), { padding: [70, 70], maxZoom: Math.min(zoom + 3, 15) }));
  }
  const bar = $('.mapbar');
  if (bar) {
    const h = mapVisible.filter((x) => x.id in H).length, j = mapVisible.length - h;
    bar.innerHTML = mapVisible.length ? `${[h ? `${h} ${h === 1 ? 'bostad' : 'bostäder'}` : '', j ? `${j} jobb` : ''].filter(Boolean).join(' och ')} här · <u>Visa lista</u>` : 'Inget i det här området. Zooma ut.';
    bar.disabled = !mapVisible.length;
  }
}

// Listan över det som syns i kartan just nu: bostäder först, sedan jobb.
function mapListSheet() {
  const homes = mapVisible.filter((x) => x.id in H).sort((a, b) => b.rank - a.rank), jobs = mapVisible.filter((x) => x.id in J).sort((a, b) => b.rank - a.rank);
  return {
    half: true, title: 'I kartan just nu',
    body: () => `<div class="pad">
      ${homes.length ? `<div class="block" style="margin-top:8px"><h2>${homes.length} ${homes.length === 1 ? 'bostad' : 'bostäder'}</h2><div class="nearby">${homes.slice(0, 40).map((h) => `<button data-act="open" data-id="${esc(h.id)}">
        ${h.cover ? `<img src="${esc(h.cover.replace('/dynamic/960w/', '/dynamic/480w/'))}" loading="lazy" alt="">` : '<div class="ph"></div>'}<div><b>${esc(h.place || h.kommune || '')}${h.view ? ' · utsikt' : ''}</b><div class="facts clamp1">${esc(h.headline || h.title)}</div></div>
        <div class="min">${h.rent ? nf(h.rent) + ' kr' : ''}<small>${h.rent ? 'per månad' : ''}</small></div></button>`).join('')}</div></div>` : ''}
      ${jobs.length ? `<div class="block"><h2>${jobs.length} jobb</h2><div class="nearby">${jobs.slice(0, 40).map((j) => `<button data-act="open" data-id="${esc(j.id)}">
        ${ring(j.score)}<div><b>${esc(j.title)}</b><div class="facts clamp1">${esc(j.employer)} · ${esc(j.kommune)}</div></div><div class="min"></div></button>`).join('')}</div></div>` : ''}
    </div>`,
  };
}

function showMapCard(id) {
  $$('.mapcard').forEach((el) => el.remove());
  const el = document.createElement('div');
  el.className = 'mapcard';
  el.innerHTML = id in J ? jobCard(J[id]) : `<div class="mini home" data-act="open" data-id="${esc(id)}">
    ${H[id].cover ? `<img src="${esc(H[id].cover)}" alt="">` : '<div class="ph"></div>'}<div><h3 class="clamp1">${esc(H[id].place || H[id].kommune || '')}${H[id].view ? ' · utsikt' : ''}</h3>
    <p class="facts clamp1">${esc(H[id].headline || H[id].title)}</p><p class="pricel"><b>${kr(H[id].rent)}</b>${H[id].rent ? ' / mån' : ''}</p></div></div>`;
  document.body.appendChild(el);
}

// ---------- händelser ----------
function lightbox(imgs, index) {
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.innerHTML = imgs.map((src) => `<img src="${esc(src)}" alt="">`).join('') + `<button class="iconbtn close" data-act="closebox" aria-label="Stäng">${icon('x')}</button>`;
  document.body.appendChild(el);
  history.pushState({ box: 1 }, '');
  el.scrollLeft = index * el.clientWidth;
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) {
    const img = e.target.closest('.gallery[data-zoom] img');
    if (img) { const all = $$('img', img.parentElement); lightbox(all.map((i) => i.src), all.indexOf(img)); }
    return;
  }
  const d = t.dataset, act = d.act;
  if (act !== 'open') e.stopPropagation();
  switch (act) {
    case 'tab': {
      if (d.tab === ui.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); break; } // tryck på aktiv flik = till toppen
      scrollPos[ui.tab] = window.scrollY; tabLimit[ui.tab] = limit;
      ui.tab = d.tab; limit = tabLimit[d.tab] || 24;
      render();
      window.scrollTo(0, scrollPos[d.tab] || 0);
      const main = $('#main'); main.classList.remove('fade'); void main.offsetWidth; main.classList.add('fade');
      break;
    }
    case 'open': if (e.target.closest('a, button:not([data-act="open"])')) return; openItem(d.id); break;
    case 'close': closeSheet(); break;
    case 'closebox': history.back(); break;
    case 'save': {
      e.preventDefault();
      const was = isSaved(d.id);
      setMark(d.id, { s: was ? null : 'saved' });
      toast(was ? 'Borttagen från sparat' : 'Sparad');
      if (!was && navigator.vibrate) { try { navigator.vibrate(8); } catch { /* inte tillåtet här */ } }
      if (sheets.length) refreshSheet(); else { const y = window.scrollY; render(); window.scrollTo(0, y); }
      if (!was) requestAnimationFrame(() => $$('[data-act="save"]').filter((el) => el.dataset.id === d.id).forEach((el) => el.classList.add('pop')));
      break;
    }
    case 'hide': {
      const before = mk(d.id).s || null;
      setMark(d.id, { s: before === 'hidden' ? null : 'hidden' });
      if (sheets.length) closeSheet();
      else {
        const card = $$('#main article.card').find((el) => el.dataset.id === d.id);
        const redraw = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };
        if (card) { card.classList.add('leaving'); setTimeout(redraw, 200); } else redraw();
      }
      if (before !== 'hidden') toast('Dold. Finns under Sparat.', 'Ångra', () => { setMark(d.id, { s: before }); render(); });
      break;
    }
    case 'status': setMark(d.id, { st: d.val || null, s: d.val && !mk(d.id).s ? 'saved' : mk(d.id).s }); refreshSheet(); if (d.val) toast(`Markerat som ${STATUS[d.val].toLowerCase()}`); break;
    case 'area': ui[d.kind].area = d.area; limit = 20; render(); if (sheets.length) refreshSheet(); break;
    case 'toggle': ui[d.kind][d.key] = !ui[d.kind][d.key]; limit = 20; render(); if (sheets.length) refreshSheet(); break;
    case 'set': ui[d.kind][d.key] = isNaN(d.val) || d.val === '' ? d.val : +d.val; limit = 20; render(); if (sheets.length) refreshSheet(); break;
    case 'cat': { const c = ui.jobs.cats; ui.jobs.cats = c.includes(d.val) ? c.filter((x) => x !== d.val) : [...c, d.val]; limit = 20; render(); refreshSheet(); break; }
    case 'reset': ui[d.kind] = { ...DEF[d.kind] }; limit = 20; render(); if (sheets.length) refreshSheet(); break;
    case 'filters': openSheet(filterSheet(d.kind)); break;
    case 'settings': openSheet(settingsSheet()); break;
    case 'savedtab': ui.saved = d.val; render(); break;
    case 'expand': $('#prose').classList.toggle('clamp'); t.textContent = $('#prose').classList.contains('clamp') ? 'Visa mer' : 'Visa mindre'; break;
    case 'maptoggle': ui.map[d.key] = !ui.map[d.key]; store.set('ui2', ui); $$('.maptools, .mapcard, .mapbar').forEach((el) => el.remove()); drawMap(false); break;
    case 'theme': store.set('theme', d.val); if (d.val === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = d.val; refreshSheet(); break;
    case 'share': {
      const x = J[d.id] || H[d.id];
      const payload = { title: x.headline || x.title, url: x.url };
      if (navigator.share) navigator.share(payload).catch(() => {}); else navigator.clipboard.writeText(x.url).then(() => toast('Länken är kopierad'));
      break;
    }
    case 'copyletter': navigator.clipboard.writeText((DATA.letters[d.id] || {}).text || '').then(() => toast('Brevet är kopierat'), () => toast('Kunde inte kopiera')); break;
    case 'triage': openSheet(triageSheet(d.kind)); break;
    case 'tri': {
      const spec = sheets[sheets.length - 1], cur = spec.queue[spec.i];
      const before = mk(cur).s || null;
      if (d.val === 'hide') setMark(cur, { s: 'hidden' });
      if (d.val === 'save') setMark(cur, { s: 'saved' });
      if (d.val === 'undo' && spec.i > 0) { spec.i -= 1; setMark(spec.queue[spec.i], { s: spec.prev.pop() ?? null }); mountSheet(false); break; }
      spec.prev.push(before);
      spec.i += 1;
      if (spec.i >= spec.queue.length) { closeSheet(); toast('Klart. Du har gått igenom alla.'); } else mountSheet(false);
      break;
    }
    case 'clearq': ui[d.kind].q = ''; limit = 24; render(); break;
    case 'maplist': openSheet(mapListSheet()); break;
    case 'copylink': navigator.clipboard.writeText(`${location.origin}${location.pathname}#k=${store.get('key', '')}`).then(() => toast('Länken är kopierad'), () => toast('Kunde inte kopiera')); break;
    case 'export': {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ marks, saved_at: new Date().toISOString() })], { type: 'application/json' }));
      a.download = 'norge-i-dag-markeringar.json'; a.click(); URL.revokeObjectURL(a.href);
      break;
    }
    case 'import': $('#importfile').click(); break;
    case 'key': {
      const value = $('#key').value.trim();
      const key = (value.match(/k=([A-Za-z0-9_-]{20,})/) || [null, value])[1];
      if (key) { store.set('key', key); start(); }
      break;
    }
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.act === 'sort') { ui[t.dataset.kind].sort = t.value; limit = 20; render(); }
  if (t.id === 'importfile' && t.files[0]) {
    t.files[0].text().then((text) => {
      const data = JSON.parse(text);
      Object.assign(marks, data.marks || {});
      store.set('marks', marks);
      toast('Markeringarna är återställda'); render();
    }).catch(() => toast('Filen gick inte att läsa'));
  }
});
let typing = null;
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') {
    const kind = ui.tab === 'jobb' ? 'jobs' : 'homes';
    ui[kind].q = t.value;
    clearTimeout(typing);
    typing = setTimeout(() => { limit = 20; const pos = t.selectionStart; $('#main').innerHTML = viewList(kind); render(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); }, 220);
  } else if (t.dataset.note) { setMark(t.dataset.note, { note: t.value }); }
  else if (t.dataset.range) { ui.homes[t.dataset.range] = +t.value; clearTimeout(typing); typing = setTimeout(() => { render(); refreshSheet(); }, 120); }
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.opt, .card[data-act]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape' && (sheets.length || $('.lightbox'))) history.back();
});
// Bildräknaren på korten följer med när man bläddrar.
document.addEventListener('scroll', (e) => {
  const g = e.target;
  if (!(g instanceof Element) || !g.classList.contains('gallery')) return;
  const index = Math.round(g.scrollLeft / g.clientWidth);
  const counter = $('.counter', g.parentElement);
  if (counter) counter.textContent = `${index + 1}/${counter.textContent.split('/')[1]}`;
  $$('.dots i', g.parentElement).forEach((dot, k) => dot.classList.toggle('on', k === index));
}, true);
window.addEventListener('scroll', () => $('#top').classList.toggle('scrolled', window.scrollY > 4), { passive: true });
const net = () => { $('#offline').hidden = navigator.onLine; };
window.addEventListener('online', net); window.addEventListener('offline', net);

// ---------- start ----------
async function start() {
  try { DATA = await loadData(); }
  catch (err) {
    if (err.message === 'nokey') return askForKey(false);
    if (err.message === 'badkey') return askForKey(true);
    $('#main').innerHTML = `<div class="empty">${icon('refresh')}<b>Kunde inte hämta listan</b>Kontrollera uppkopplingen och försök igen.<br><br><button class="btn" onclick="location.reload()">Försök igen</button></div>`;
    return;
  }
  J = Object.fromEntries(DATA.jobs.map((j) => [j.id, j]));
  H = Object.fromEntries(DATA.homes.map((h) => [h.id, h]));
  nearJob = {}; nearHome = {};
  for (const [job, home, min] of DATA.links || DATA.pairs.map((p) => [p.job, p.home, p.minutes])) {
    (nearJob[job] = nearJob[job] || []).push({ id: home, min });
    (nearHome[home] = nearHome[home] || []).push({ id: job, min });
  }
  // "Ny" = tillkommen sedan den förra versionen av listan som den här enheten såg.
  const visit = store.get('visit', {});
  if (visit.latest !== DATA.generated) { visit.cut = visit.latest || null; visit.latest = DATA.generated; store.set('visit', visit); }
  newCut = visit.cut || null;
  net();
  render();
  const deep = location.hash.match(/^#\/(?:j|h)\/(.+)$/);
  if (deep && (decodeURIComponent(deep[1]) in J || decodeURIComponent(deep[1]) in H)) openItem(decodeURIComponent(deep[1]));
}

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
start();
