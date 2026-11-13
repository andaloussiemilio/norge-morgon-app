/* Norge i dag: läser dagens (krypterade) data och visar den med filter, karta och egna markeringar.
   Markeringarna ("sparat", "inte för mig") ligger bara i den här enhetens webbläsare. */
'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const store = {
  get(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privat läge: fungerar utan */ } },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kr = (n) => (n ? n.toLocaleString('sv-SE').replace(/ /g, ' ') + ' kr' : 'Hyra saknas');

let DATA = null;
let jobsById = {}, homesById = {};
let newCut = null;
const marks = store.get('marks', {}); // id -> "saved" | "hidden"
const ui = Object.assign(
  { tab: 'oversikt', area: 'alla', onlyNew: false, view: false, housing: false, start: false, noLacks: false, moveIn: false, cat: 'alla', map: false },
  store.get('ui', {}), { map: false });
let limit = 30;
let leafletMap = null, leafletLayer = null;

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
  $('#filters').hidden = true;
  $('#stamp').textContent = 'Låst';
  $('#main').innerHTML = `<div class="keybox">
    <h3>${wrong ? 'Nyckeln stämmer inte' : 'Öppna med din länk'}</h3>
    <p class="muted">Listan är krypterad. Klistra in din personliga länk eller nyckel här. Det behövs bara en gång per enhet.</p>
    <input id="key" autocomplete="off" autocapitalize="off" placeholder="https://…#k=… eller bara nyckeln">
    <button class="btn primary" id="keyok">Öppna</button></div>`;
  $('#keyok').onclick = () => {
    const value = $('#key').value.trim();
    const key = (value.match(/k=([A-Za-z0-9_-]{20,})/) || [null, value])[1];
    if (key) { store.set('key', key); start(); }
  };
}

// ---------- hjälpare ----------
const isNew = (x) => (newCut ? x.first_seen > newCut : x.first_seen >= DATA.latest_batch);
const hidden = (id) => marks[id] === 'hidden';
const saved = (id) => marks[id] === 'saved';
const areaName = (id) => (DATA.areas.find((a) => a.id === id) || {}).name || id;
const mapsUrl = (x) => `https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lon}`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) : '');

function setMark(id, value) {
  const before = marks[id];
  if (before === value) delete marks[id]; else marks[id] = value;
  store.set('marks', marks);
  render();
  if (marks[id] === 'hidden') {
    toast('Dold. Du hittar den under Sparat.', 'Ångra', () => { if (before) marks[id] = before; else delete marks[id]; store.set('marks', marks); render(); });
  }
}

let toastTimer = null;
function toast(text, action, fn) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(text)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  el.hidden = false;
  if (action) $('button', el).onclick = () => { el.hidden = true; fn(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
}

// ---------- kort ----------
function markButtons(id) {
  return `<button class="btn small ${saved(id) ? 'on' : ''}" data-mark="saved" data-id="${esc(id)}">${saved(id) ? '★ Sparad' : '☆ Spara'}</button>
    <button class="btn small ${hidden(id) ? 'on' : ''}" data-mark="hidden" data-id="${esc(id)}">${hidden(id) ? 'Visa igen' : 'Inte för mig'}</button>`;
}

function homeCard(h) {
  const imgs = (h.images && h.images.length ? h.images : (h.cover ? [h.cover] : [])).slice(0, 12);
  const gallery = imgs.length
    ? `<div class="gallery ${imgs.length > 1 ? 'multi' : ''}">${imgs.map((src, i) =>
        `<img src="${esc(i === 0 && h.cover ? h.cover : src)}" data-full="${esc(src)}" loading="lazy" alt="Bild ${i + 1} av ${imgs.length}" onerror="if(this.src!==this.dataset.full)this.src=this.dataset.full">`).join('')}</div>`
    : '<div class="noimg">Inga bilder i annonsen</div>';
  const facts = [h.type, h.size ? `${h.size} m²` : '', h.rooms ? `${h.rooms} rum` : '', h.bedrooms ? `${h.bedrooms} sovrum` : ''].filter(Boolean).join(' · ');
  const tags = [
    isNew(h) ? '<span class="tag new">Ny</span>' : '',
    h.view ? '<span class="tag view">Utsikt</span>' : '',
    h.move_in_fits ? '<span class="tag good">Ledig jan/feb 2027</span>' : (h.available ? `<span class="tag">Ledig ${esc(h.available)}</span>` : ''),
    h.big_house ? '<span class="tag">Stort hus</span>' : '',
    h.shared ? '<span class="tag">Delat boende</span>' : '',
    ...(h.nice || []).slice(0, 3).map((n) => `<span class="tag">${esc(n)}</span>`),
    h.geo_approx ? '<span class="tag warn">Ungefärlig plats</span>' : '',
  ].join('');
  return `<article class="card" id="c-${esc(h.id)}">${gallery}<div class="body">
    <div class="row"><h3>${esc(h.headline || h.title)}</h3><span class="price">${kr(h.rent)}</span></div>
    <p class="facts">${esc(facts)}</p>
    <p class="facts">${esc([h.address || h.place, areaName(h.area)].filter(Boolean).join(' · '))}</p>
    <div class="tags">${tags}</div>
    <div class="actions">
      <a class="btn small primary" href="${esc(h.url)}" target="_blank" rel="noopener">Annons</a>
      ${h.lat != null ? `<a class="btn small" href="${mapsUrl(h)}" target="_blank" rel="noopener">Karta</a>` : ''}
      ${markButtons(h.id)}
    </div></div></article>`;
}

function jobTags(j) {
  return [
    isNew(j) ? '<span class="tag new">Ny</span>' : '',
    j.housing === 'ja' ? '<span class="tag good">Boende erbjuds</span>' : '',
    j.start_fits ? '<span class="tag good">Start passar</span>' : '',
    j.english_ok === 'ja' ? '<span class="tag">Engelska räcker</span>' : '',
    ...(j.lacks || []).map((l) => `<span class="tag warn">Krav du kanske saknar: ${esc(l)}</span>`),
    ...(j.cats || []).map((c) => `<span class="tag">${esc(DATA.categories[c] || c)}</span>`),
    j.scored_by !== 'ai' ? '<span class="tag">Preliminärt betyg</span>' : '',
  ].join('');
}

function jobCard(j) {
  const facts = [j.extent, j.engagement].filter(Boolean).join(' · ');
  const when = [j.start ? `Start: ${j.start}` : '', j.due ? `Frist: ${j.due}` : '', `Boende: ${j.housing || 'okänt'}`].filter(Boolean).join(' · ');
  return `<article class="card" id="c-${esc(j.id)}"><div class="body">
    <div class="jobhead"><div class="score s${j.score}" title="Betyg ${j.score} av 5">${j.score}</div>
      <div><h3>${esc(j.title)}</h3><p class="facts">${esc(j.employer)} · ${esc(j.kommune)} · ${esc(areaName(j.area))}</p></div></div>
    <p class="facts">${esc(facts)}</p><p class="facts">${esc(when)}</p>
    <div class="tags">${jobTags(j)}</div>
    <p class="reason">${esc(j.reason || '')}</p>
    <div class="actions">
      <a class="btn small primary" href="${esc(j.url)}" target="_blank" rel="noopener">Annons</a>
      ${j.lat != null ? `<a class="btn small" href="${mapsUrl(j)}" target="_blank" rel="noopener">Karta</a>` : ''}
      ${markButtons(j.id)}
    </div></div></article>`;
}

function pairCard(p) {
  const j = jobsById[p.job], h = homesById[p.home];
  if (!j || !h) return '';
  const img = h.cover ? `<img src="${esc(h.cover)}" loading="lazy" alt="">` : '<div class="ph"></div>';
  return `<article class="card"><div class="body">
    <div class="jobhead"><div class="score s${j.score}">${j.score}</div>
      <div><h3>${esc(j.title)}</h3><p class="facts">${esc(j.employer)} · ${esc(j.kommune)}</p></div></div>
    <div class="tags">${jobTags(j)}</div>
    <div class="plus pair">${img}<div>
      <div class="row"><h3>${esc(h.headline || h.title)}</h3><span class="price">${kr(h.rent)}</span></div>
      <p class="facts">${esc([h.type, h.size ? h.size + ' m²' : '', h.place].filter(Boolean).join(' · '))}</p>
      <p class="facts"><span class="drive">${p.minutes} min med bil</span>${DATA.summary.estimated_drive ? ' (uppskattat)' : ''}${p.approx ? ' · jobbets plats ungefärlig' : ''}</p>
      <div class="tags">${p.car ? '<span class="tag warn">Bil behövs</span>' : '<span class="tag good">Nära</span>'}${h.view ? '<span class="tag view">Utsikt</span>' : ''}</div>
    </div></div>
    <div class="actions">
      <a class="btn small primary" href="${esc(j.url)}" target="_blank" rel="noopener">Jobbet</a>
      <a class="btn small primary" href="${esc(h.url)}" target="_blank" rel="noopener">Bostaden</a>
      <a class="btn small" href="https://www.google.com/maps/dir/?api=1&origin=${h.lat},${h.lon}&destination=${j.lat},${j.lon}&travelmode=driving" target="_blank" rel="noopener">Vägen</a>
    </div></div></article>`;
}

// ---------- filter ----------
function chip(label, on, attrs) { return `<button class="chip ${on ? 'on' : ''}" ${attrs}>${esc(label)}</button>`; }

function renderFilters() {
  const el = $('#filters');
  if (ui.tab === 'oversikt' || ui.tab === 'sparat') { el.hidden = true; return; }
  el.hidden = false;
  let html = chip('Alla områden', ui.area === 'alla', 'data-area="alla"') +
    DATA.areas.map((a) => chip(a.name, ui.area === a.id, `data-area="${a.id}"`)).join('') + '<span class="sep"></span>' +
    chip('Bara nya', ui.onlyNew, 'data-toggle="onlyNew"');
  if (ui.tab !== 'jobb') html += chip('Utsikt', ui.view, 'data-toggle="view"') + chip('Ledig jan/feb', ui.moveIn, 'data-toggle="moveIn"');
  if (ui.tab === 'jobb' || ui.tab === 'par') {
    html += chip('Boende erbjuds', ui.housing, 'data-toggle="housing"') + chip('Start passar', ui.start, 'data-toggle="start"');
  }
  if (ui.tab === 'jobb') {
    html += chip('Utan krav jag saknar', ui.noLacks, 'data-toggle="noLacks"') + '<span class="sep"></span>' +
      chip('Alla yrken', ui.cat === 'alla', 'data-cat="alla"') +
      Object.entries(DATA.categories).map(([id, name]) => chip(name, ui.cat === id, `data-cat="${id}"`)).join('');
  }
  if (ui.tab !== 'par') html += '<span class="sep"></span>' + chip(ui.map ? 'Visa lista' : 'Visa karta', ui.map, 'data-toggle="map"');
  el.innerHTML = html;
}

const jobOk = (j) => !hidden(j.id) && (ui.area === 'alla' || j.area === ui.area) && (!ui.onlyNew || isNew(j)) &&
  (!ui.housing || j.housing === 'ja') && (!ui.start || j.start_fits) && (!ui.noLacks || !(j.lacks || []).length) &&
  (ui.cat === 'alla' || (j.cats || []).includes(ui.cat));
const homeOk = (h) => !hidden(h.id) && (ui.area === 'alla' || h.area === ui.area) && (!ui.onlyNew || isNew(h)) &&
  (!ui.view || h.view) && (!ui.moveIn || h.move_in_fits);

function currentItems() {
  if (ui.tab === 'jobb') return { kind: 'job', items: DATA.jobs.filter(jobOk) };
  if (ui.tab === 'bostader') return { kind: 'home', items: DATA.homes.filter((h) => h.within_budget && homeOk(h)) };
  if (ui.tab === 'storahus') return { kind: 'home', items: DATA.homes.filter((h) => h.big_house && homeOk(h)) };
  if (ui.tab === 'par') {
    return { kind: 'pair', items: DATA.pairs.filter((p) => {
      const j = jobsById[p.job], h = homesById[p.home];
      return j && h && !hidden(j.id) && !hidden(h.id) && (ui.area === 'alla' || j.area === ui.area) && (!ui.onlyNew || isNew(j) || isNew(h)) &&
        (!ui.view || h.view) && (!ui.moveIn || h.move_in_fits) && (!ui.housing || j.housing === 'ja') && (!ui.start || j.start_fits);
    }) };
  }
  return { kind: 'none', items: [] };
}

// ---------- vyer ----------
function renderOverview() {
  const s = DATA.summary;
  const rows = s.per_area.map((a) => `<tr><td>${esc(a.name)}</td><td>${a.jobs}${a.new_jobs ? ` <em>+${a.new_jobs}</em>` : ''}</td>
    <td>${a.homes}${a.new_homes ? ` <em>+${a.new_homes}</em>` : ''}</td><td>${a.pairs}</td></tr>`).join('');
  const sources = s.sources.map((x) => `<tr><td>${esc(x.name)}</td><td style="text-align:left">${esc(x.status)}${x.note ? ` <span class="muted">(${esc(x.note)})</span>` : ''}</td></tr>`).join('');
  const newHomes = DATA.homes.filter((h) => isNew(h) && !hidden(h.id)).slice(0, 3);
  const topPairs = DATA.pairs.filter((p) => jobsById[p.job] && homesById[p.home] && !hidden(p.job) && !hidden(p.home)).slice(0, 3);
  const topJobs = DATA.jobs.filter((j) => isNew(j) && !hidden(j.id)).slice(0, 3);
  const stat = (n, label, plus) => `<div class="stat"><b>${n}</b><small>${label}</small>${plus ? `<br><em>+${plus} nya</em>` : ''}</div>`;
  return `<div class="stats">${stat(s.jobs, 'jobb', s.new_jobs)}${stat(s.homes, 'bostäder', s.new_homes)}${stat(s.pairs, 'par jobb + bostad')}</div>
    <div class="card"><div class="body"><table><tr><th>Område</th><th>Jobb</th><th>Bostäder</th><th>Par</th></tr>${rows}</table>
      <p class="muted" style="margin-top:8px">Stora hus (upp till ${DATA.limits.big_rent.toLocaleString('sv-SE')} kr): ${s.big_houses}. Körtid för par: högst ${DATA.limits.drive} min${s.estimated_drive ? ' (uppskattad: fågelvägen × 1,4)' : ''}.</p></div></div>
    ${topPairs.length ? `<h2>Bästa kombinationerna</h2>${topPairs.map(pairCard).join('')}<button class="btn more" data-go="par">Alla ${DATA.pairs.length} par</button>` : ''}
    ${newHomes.length ? `<h2>Nya bostäder</h2>${newHomes.map(homeCard).join('')}<button class="btn more" data-go="bostader">Alla bostäder</button>` : ''}
    ${topJobs.length ? `<h2>Nya jobb</h2>${topJobs.map(jobCard).join('')}<button class="btn more" data-go="jobb">Alla jobb</button>` : ''}
    <h2>Källor och kostnad</h2>
    <div class="card"><div class="body"><table>${sources}</table>
      <p class="muted" style="margin-top:8px">Senaste körningen kostade ${s.costs.total_sek} kr (Claude ${s.costs.claude_usd} USD, Apify ${s.costs.apify_usd} USD).</p></div></div>`;
}

function renderSaved() {
  const all = [...DATA.homes.map((h) => ['home', h]), ...DATA.jobs.map((j) => ['job', j])];
  const kept = all.filter(([, x]) => saved(x.id));
  const gone = all.filter(([, x]) => hidden(x.id));
  const draw = ([kind, x]) => (kind === 'home' ? homeCard(x) : jobCard(x));
  return `<h2>Sparat (${kept.length})</h2>${kept.map(draw).join('') || '<p class="muted pad">Tryck på ☆ Spara på en bostad eller ett jobb, så hamnar det här.</p>'}
    <h2>Inte för mig (${gone.length})</h2>${gone.map(draw).join('') || '<p class="muted pad">Det du döljer hamnar här och kan tas tillbaka.</p>'}
    <p class="muted pad">Markeringarna sparas bara i den här enhetens webbläsare.</p>`;
}

function render() {
  store.set('ui', ui);
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  renderFilters();
  const main = $('#main');
  $('#map').hidden = !ui.map;
  main.hidden = ui.map;
  if (ui.tab === 'oversikt') { main.innerHTML = renderOverview(); return; }
  if (ui.tab === 'sparat') { main.innerHTML = renderSaved(); return; }
  const { kind, items } = currentItems();
  if (ui.map) { drawMap(kind, items); return; }
  const draw = kind === 'job' ? jobCard : kind === 'home' ? homeCard : pairCard;
  const noun = kind === 'job' ? 'jobb' : kind === 'home' ? 'bostäder' : 'par';
  main.innerHTML = `<p class="muted count">${items.length} ${noun}</p>` +
    (items.slice(0, limit).map(draw).join('') || '<p class="muted pad">Inget matchar filtren just nu.</p>') +
    (items.length > limit ? `<button class="btn more" data-more="1">Visa fler (${items.length - limit} kvar)</button>` : '');
}

// ---------- karta ----------
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

async function drawMap(kind, items) {
  try { await loadLeaflet(); } catch { ui.map = false; render(); toast('Kartan kunde inte laddas.'); return; }
  if (!leafletMap) {
    leafletMap = L.map('map', { zoomControl: false }).setView([68.3, 15.5], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(leafletMap);
    leafletLayer = L.layerGroup().addTo(leafletMap);
  }
  leafletLayer.clearLayers();
  const points = [];
  items.forEach((x, i) => {
    if (x.lat == null) return;
    // Jobb utan exakt adress ligger på kommunens mittpunkt: sprid ut dem lite så att de går att trycka på.
    const spread = x.geo_approx ? 0.012 : 0;
    const lat = x.lat + Math.sin(i * 2.4) * spread, lon = x.lon + Math.cos(i * 2.4) * spread * 2.5;
    const isJob = kind === 'job';
    const label = isJob ? `<b>${esc(x.title)}</b>${esc(x.employer)} · betyg ${x.score}` : `<b>${esc(x.headline || x.title)}</b>${kr(x.rent)} · ${esc(x.place || '')}`;
    L.circleMarker([lat, lon], { radius: 9, weight: 2, color: '#fff', fillOpacity: 0.95, fillColor: isJob ? '#c8553d' : (x.view ? '#1b6a8a' : '#16324a') })
      .bindPopup(`${label}<br><a href="${esc(x.url)}" target="_blank" rel="noopener">Öppna annonsen</a>`).addTo(leafletLayer);
    points.push([lat, lon]);
  });
  setTimeout(() => { leafletMap.invalidateSize(); if (points.length) leafletMap.fitBounds(points, { padding: [30, 30], maxZoom: 12 }); }, 50);
}

// ---------- händelser ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  const d = t.dataset;
  if (d.tab || d.go) { ui.tab = d.tab || d.go; ui.map = false; limit = 30; render(); window.scrollTo(0, 0); }
  else if (d.area) { ui.area = d.area; limit = 30; render(); }
  else if (d.cat) { ui.cat = d.cat; limit = 30; render(); }
  else if (d.toggle) { ui[d.toggle] = !ui[d.toggle]; limit = 30; render(); }
  else if (d.more) { limit += 30; render(); }
  else if (d.mark) setMark(d.id, d.mark);
});

async function start() {
  try { DATA = await loadData(); }
  catch (err) {
    if (err.message === 'nokey') return askForKey(false);
    if (err.message === 'badkey') return askForKey(true);
    $('#main').innerHTML = '<p class="muted pad">Kunde inte hämta listan. Kontrollera uppkopplingen och försök igen.</p>';
    return;
  }
  jobsById = Object.fromEntries(DATA.jobs.map((j) => [j.id, j]));
  homesById = Object.fromEntries(DATA.homes.map((h) => [h.id, h]));
  // "Ny" = tillkommen sedan den förra versionen av listan som den här enheten såg.
  const visit = store.get('visit', {});
  if (visit.latest !== DATA.generated) { visit.cut = visit.latest || null; visit.latest = DATA.generated; store.set('visit', visit); }
  newCut = visit.cut || null;
  $('#stamp').textContent = 'Uppdaterad ' + new Date(DATA.generated).toLocaleString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (DATA.run_url) { $('#run').href = DATA.run_url; $('#run').hidden = false; }
  render();
}

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
start();
