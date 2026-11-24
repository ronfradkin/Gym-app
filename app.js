'use strict';

/* ---------- Storage & helpers ---------- */

const KEY = 'wt.data.v1';
const DRAFT_KEY = 'wt.draft.v1';

const $ = (s) => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').trim().toLowerCase();
const num = (v) => {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const fmt = (n) => String(Math.round(n * 100) / 100);
const setStr = (s) => `${s.kg ? fmt(s.kg) : 'BW'}×${s.reps}`;
const setLabel = (s) => (s.kg ? `${fmt(s.kg)} kg × ${s.reps}` : `${s.reps} reps`);

function todayISO(d = new Date()) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + 'T12:00');
  d.setDate(d.getDate() + n);
  return todayISO(d);
}
function fmtDate(iso, year) {
  const opts = year ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' };
  return new Date(iso + 'T12:00').toLocaleDateString('en-GB', opts);
}

function isValidData(s) {
  return s && Array.isArray(s.days) && Array.isArray(s.sessions);
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (isValidData(s)) return s;
  } catch (e) { /* fall through */ }
  const s = sampleData();
  persist(s);
  return s;
}
function persist(s = state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    toast('Could not save. Storage may be full or blocked.');
  }
}
function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null; } catch (e) { return null; }
}
function saveDraft() {
  try {
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(DRAFT_KEY);
  } catch (e) { /* ignore */ }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------- Sample data ---------- */

function sampleData() {
  // [name, sets, reps, start kg, weekly increase kg]
  const P = [
    ['Push', [['Bench Press', 3, 8, 60, 2.5], ['Overhead Press', 3, 8, 35, 1.25], ['Incline Dumbbell Press', 3, 10, 22, 1], ['Triceps Pushdown', 3, 12, 25, 1.25]]],
    ['Pull', [['Deadlift', 3, 5, 100, 5], ['Pull-up', 3, 8, 0, 0], ['Barbell Row', 3, 8, 50, 2.5], ['Biceps Curl', 3, 12, 12, 0.5]]],
    ['Legs', [['Squat', 3, 5, 80, 2.5], ['Romanian Deadlift', 3, 8, 70, 2.5], ['Leg Press', 3, 10, 120, 5], ['Calf Raise', 3, 15, 40, 2.5]]],
  ];
  const days = P.map(([name, exs]) => ({
    id: uid(), name, sample: true,
    exercises: exs.map(([n, sets, reps]) => ({ id: uid(), name: n, sets, reps })),
  }));
  const sessions = [];
  const today = todayISO();
  const WEEKS = 6;
  for (let w = 0; w < WEEKS; w++) {
    days.forEach((d, di) => {
      const date = addDays(today, -((WEEKS - 1 - w) * 7 + 6 - di * 2));
      const entries = P[di][1].map(([n, s, r, base, inc], ei) => {
        const step = w - Math.floor(w / 3); // a stall every third week
        const kg = base + inc * step;
        const sets = [];
        for (let i = 0; i < s; i++) {
          let reps = r;
          if (i === s - 1 && (w + ei) % 2 === 0) reps = r - 1;
          if (base === 0) reps = r - 2 + Math.floor(w / 2) - (i === s - 1 ? 1 : 0);
          sets.push({ kg, reps });
        }
        return { name: n, sets };
      });
      sessions.push({ id: uid(), date, dayId: d.id, dayName: d.name, savedAt: new Date(date + 'T18:00').getTime(), sample: true, entries });
    });
  }
  return { days, sessions };
}

/* ---------- Stats ---------- */

function sortedSessions() {
  return [...state.sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.savedAt || 0) - (b.savedAt || 0)));
}
function topSet(sets) {
  return sets.reduce((best, s) => (!best || better(s, best) ? s : best), null);
}
function better(a, b) {
  return a.kg > b.kg || (a.kg === b.kg && a.reps > b.reps);
}
function volumeOf(sets) { return sets.reduce((t, s) => t + s.kg * s.reps, 0); }
function repsOf(sets) { return sets.reduce((t, s) => t + s.reps, 0); }

// All logged entries for one exercise (matched by name), oldest first, with PR flags.
function seriesFor(name) {
  const n = norm(name);
  const out = [];
  let best = null;
  let bestVol = 0;
  for (const s of sortedSessions()) {
    for (const e of s.entries) {
      if (norm(e.name) !== n || !e.sets.length) continue;
      const top = topSet(e.sets);
      const volume = volumeOf(e.sets);
      const pr = best != null && better(top, best);
      const volPr = out.length > 0 && volume > bestVol;
      if (!best || better(top, best)) best = top;
      if (volume > bestVol) bestVol = volume;
      out.push({ session: s, date: s.date, sets: e.sets, top, volume, reps: repsOf(e.sets), pr, volPr });
    }
  }
  return out;
}
function lastEntry(name) {
  const s = seriesFor(name);
  return s.length ? s[s.length - 1] : null;
}
function bestSet(name) {
  return seriesFor(name).reduce((b, p) => (!b || better(p.top, b) ? p.top : b), null);
}

/* ---------- App state ---------- */

let state = loadState();
let draft = loadDraft();
let tab = 'log';
let progName = null;
let progMetric = 'volume';

/* ---------- Rendering ---------- */

function render() {
  document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const view = $('#view');
  if (tab === 'log') view.innerHTML = draft ? renderSession() : renderLogHome();
  else if (tab === 'program') view.innerHTML = renderProgram();
  else if (tab === 'progress') view.innerHTML = renderProgress();
  else view.innerHTML = renderData();
}

function renderLogHome() {
  const recent = sortedSessions().reverse();
  const lastDone = (d) => {
    const s = recent.find((x) => x.dayId === d.id);
    return s ? 'last ' + fmtDate(s.date) : 'not done yet';
  };
  let h = '<h1>Log workout</h1>';
  if (!state.days.length) {
    h += `<div class="card empty">No workout days yet.<br><br><button class="btn primary" data-act="tab" data-tab="program">Set up your program</button></div>`;
  } else {
    h += state.days.map((d) => `
      <button class="day-btn" data-act="start" data-id="${d.id}">
        <span><b>${esc(d.name || 'Untitled')}</b><small>${d.exercises.length} exercises · ${lastDone(d)}</small></span>
        <span class="go">›</span>
      </button>`).join('');
  }
  if (recent.length) {
    h += '<div class="section-title">Recent sessions</div><div class="card"><ul class="list">';
    h += recent.slice(0, 10).map((s) => {
      const sets = s.entries.reduce((t, e) => t + e.sets.length, 0);
      return `<li><div class="grow"><b>${esc(s.dayName)}</b> <span class="muted small">· ${fmtDate(s.date, true)}</span>
        <div class="muted small">${s.entries.length} exercises · ${sets} sets</div></div>
        <button class="icon del" data-act="del-session" data-id="${s.id}" aria-label="Delete session">✕</button></li>`;
    }).join('');
    h += '</ul></div>';
  }
  return h;
}

function draftRows(ex) {
  const rows = draft.values[ex.id] || (draft.values[ex.id] = []);
  while (rows.length < ex.sets) rows.push({ kg: '', reps: '' });
  return rows;
}

function renderSession() {
  const day = state.days.find((d) => d.id === draft.dayId);
  if (!day) { draft = null; saveDraft(); return renderLogHome(); }
  const exercises = day.exercises.filter((e) => e.name.trim());
  let h = `<div class="session-head"><h1>${esc(day.name)}</h1>
    <input type="date" data-field="draft-date" value="${esc(draft.date)}" aria-label="Session date"></div>`;
  if (!exercises.length) h += '<div class="card empty">This day has no exercises. Add some in Program.</div>';
  for (const ex of exercises) {
    const rows = draftRows(ex);
    const last = lastEntry(ex.name);
    const best = bestSet(ex.name);
    const bestKg = best ? best.kg : null;
    h += `<section class="card">
      <div class="ex-head"><h3>${esc(ex.name)}</h3><span class="target">${ex.sets} × ${ex.reps}</span></div>
      <div class="last">${last ? `Last time (${fmtDate(last.date)}): <b>${last.sets.map(setStr).join(' · ')}</b>` : 'First time: no history yet'}</div>
      <div class="set-grid">
        <span class="h">Set</span><span class="h">kg</span><span class="h">Reps</span>
        ${rows.map((r, i) => {
          const ls = last && last.sets[i];
          const isPr = bestKg != null && num(r.kg) != null && num(r.kg) > bestKg;
          return `<span class="set-no">${i + 1}</span>
          <input type="text" inputmode="decimal" autocomplete="off" data-field="set" data-ex="${ex.id}" data-i="${i}" data-f="kg"
            data-best="${bestKg ?? ''}" class="${isPr ? 'pr' : ''}" value="${esc(r.kg)}" placeholder="${ls ? fmt(ls.kg) : 'kg'}" aria-label="Set ${i + 1} weight in kg">
          <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-field="set" data-ex="${ex.id}" data-i="${i}" data-f="reps"
            value="${esc(r.reps)}" placeholder="${ls ? ls.reps : ex.reps}" aria-label="Set ${i + 1} reps">`;
        }).join('')}
      </div>
      <div class="ex-actions">
        ${last ? `<button class="btn small-btn" data-act="copy-last" data-ex="${ex.id}">Copy last time</button>` : ''}
        <button class="btn small-btn" data-act="add-set" data-ex="${ex.id}">+ Set</button>
      </div>
    </section>`;
  }
  h += `<div class="stack" style="margin-top:16px">
    <button class="btn primary block" data-act="save-session">Save workout</button>
    <button class="btn block danger" data-act="discard">Discard</button></div>
    <p class="muted small" style="margin-top:12px">Grey numbers show last time. Empty sets aren't saved. A weight above your best turns orange.</p>`;
  return h;
}

function renderProgram() {
  let h = '<h1>Program</h1>';
  if (!state.days.length) h += '<p class="muted">Add a workout day (e.g. Push, Pull, Legs), then add its exercises.</p>';
  state.days.forEach((d, di) => {
    h += `<section class="card">
      <div class="day-head">
        <input type="text" data-field="day-name" data-day="${d.id}" value="${esc(d.name)}" placeholder="Day name" aria-label="Day name">
        <button class="icon" data-act="day-up" data-day="${d.id}" ${di === 0 ? 'disabled' : ''} aria-label="Move day up">↑</button>
        <button class="icon" data-act="day-down" data-day="${d.id}" ${di === state.days.length - 1 ? 'disabled' : ''} aria-label="Move day down">↓</button>
        <button class="icon del" data-act="day-del" data-day="${d.id}" aria-label="Delete day">✕</button>
      </div>`;
    d.exercises.forEach((ex, ei) => {
      h += `<div class="ex-item">
        <input type="text" data-field="ex-name" data-day="${d.id}" data-ex="${ex.id}" value="${esc(ex.name)}" placeholder="Exercise name" aria-label="Exercise name">
        <div class="nums">
          <label>Sets <input type="text" inputmode="numeric" pattern="[0-9]*" data-field="ex-sets" data-day="${d.id}" data-ex="${ex.id}" value="${ex.sets}"></label>
          <label>Reps <input type="text" inputmode="numeric" pattern="[0-9]*" data-field="ex-reps" data-day="${d.id}" data-ex="${ex.id}" value="${ex.reps}"></label>
          <span class="spacer"></span>
          <button class="icon" data-act="ex-up" data-day="${d.id}" data-ex="${ex.id}" ${ei === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="icon" data-act="ex-down" data-day="${d.id}" data-ex="${ex.id}" ${ei === d.exercises.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button class="icon del" data-act="ex-del" data-day="${d.id}" data-ex="${ex.id}" aria-label="Delete exercise">✕</button>
        </div>
      </div>`;
    });
    h += `<button class="btn block" data-act="ex-add" data-day="${d.id}" style="margin-top:6px">+ Add exercise</button></section>`;
  });
  h += '<button class="btn primary block" data-act="day-add">+ Add workout day</button>';
  return h;
}

function exerciseNames() {
  const seen = new Map();
  for (const d of state.days) for (const e of d.exercises) if (e.name.trim() && !seen.has(norm(e.name))) seen.set(norm(e.name), e.name.trim());
  for (const s of state.sessions) for (const e of s.entries) if (!seen.has(norm(e.name))) seen.set(norm(e.name), e.name);
  return [...seen.values()];
}

function renderProgress() {
  const names = exerciseNames();
  let h = '<h1>Progress</h1>';
  if (!names.length) return h + '<div class="card empty">Log a workout to see your progress here.</div>';
  if (!progName || !names.some((n) => norm(n) === norm(progName))) progName = names[0];
  h += `<select data-field="prog-select" aria-label="Exercise" style="margin-bottom:12px">
    ${names.map((n) => `<option ${norm(n) === norm(progName) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;

  const series = seriesFor(progName);
  if (!series.length) return h + '<div class="card empty">No sessions logged for this exercise yet.</div>';

  const best = series.reduce((b, p) => (!b || better(p.top, b.top) ? p : b), null);
  const bestVol = series.reduce((b, p) => (!b || p.volume > b.volume ? p : b), null);
  const bodyweight = series.every((p) => p.top.kg === 0);
  const metric = bodyweight ? 'reps' : progMetric;

  h += `<div class="tiles">
    <div class="tile"><div class="k">Best set</div><div class="v">${setLabel(best.top)}</div><div class="d">${fmtDate(best.date, true)}</div></div>
    <div class="tile"><div class="k">${bodyweight ? 'Most reps' : 'Best volume'}</div><div class="v">${bodyweight ? Math.max(...series.map((p) => p.reps)) : fmt(bestVol.volume) + ' kg'}</div><div class="d">${bodyweight ? 'in a session' : fmtDate(bestVol.date, true)}</div></div>
    <div class="tile"><div class="k">Sessions</div><div class="v">${series.length}</div><div class="d">since ${fmtDate(series[0].date)}</div></div>
  </div>`;

  if (!bodyweight) {
    h += `<section class="card chart">
      <div class="chart-head"><h3>Top set weight (kg)</h3></div>
      ${lineChart(series.map((p) => ({ date: p.date, y: p.top.kg, pr: p.pr, label: setLabel(p.top) })), 'kg')}
      <div class="legend"><i></i>Personal record</div></section>`;
  }
  h += `<section class="card chart">
    <div class="chart-head"><h3>${metric === 'volume' ? 'Volume (kg)' : 'Total reps'}</h3>
      ${bodyweight ? '' : `<div class="seg">
        <button data-act="metric" data-m="volume" class="${metric === 'volume' ? 'on' : ''}">Volume</button>
        <button data-act="metric" data-m="reps" class="${metric === 'reps' ? 'on' : ''}">Reps</button></div>`}
    </div>
    ${lineChart(series.map((p) => ({
      date: p.date,
      y: metric === 'volume' ? p.volume : p.reps,
      pr: metric === 'volume' ? p.volPr : p.pr,
      label: metric === 'volume' ? fmt(p.volume) + ' kg' : p.reps + ' reps',
    })), metric === 'volume' ? 'kg' : 'reps')}
    ${metric === 'volume' ? '<div class="muted small">Volume = kg × reps, summed over all sets.</div>' : ''}
  </section>`;

  h += `<section class="card"><h3 style="margin-bottom:6px">History</h3>
    <table class="hist"><thead><tr><th>Date</th><th>Sets</th><th class="num">${bodyweight ? 'Reps' : 'Volume'}</th></tr></thead><tbody>
    ${[...series].reverse().map((p) => `<tr class="${p.pr || p.volPr ? 'pr' : ''}">
      <td style="white-space:nowrap">${fmtDate(p.date, true)}<br>${p.pr ? '<span class="badge">PR</span>' : ''}${p.volPr && !bodyweight ? '<span class="badge">Vol PR</span>' : ''}</td>
      <td>${p.sets.map(setStr).join(', ')}</td>
      <td class="num">${bodyweight ? p.reps : fmt(p.volume) + ' kg'}</td></tr>`).join('')}
    </tbody></table>
    <p class="muted small" style="margin:10px 0 0">PR = heaviest top set so far (more reps at the same weight counts too). Vol PR = highest volume so far.</p>
  </section>`;
  return h;
}

function lineChart(pts, unit) {
  if (!pts.length) return '';
  const W = 340, H = 170, L = 42, R = 12, T = 14, B = 24;
  const xs = pts.map((p) => new Date(p.date + 'T12:00').getTime());
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ys = pts.map((p) => p.y);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  let y0 = yMin, y1 = yMax;
  if (y0 === y1) { const d = Math.max(1, Math.abs(y0) * 0.1); y0 -= d; y1 += d; }
  else { const pad = (y1 - y0) * 0.15; y0 -= pad; y1 += pad; }
  if (y0 < 0 && yMin >= 0) y0 = 0;
  // spread points evenly when several share a date
  const X = (t, i) => (x1 === x0 ? (pts.length === 1 ? L + (W - L - R) / 2 : L + (i / (pts.length - 1)) * (W - L - R)) : L + ((t - x0) / (x1 - x0)) * (W - L - R));
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const tick = (v) => (Math.abs(v) >= 10000 ? (v / 1000).toFixed(1) + 'k' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart">`;
  for (const k of [0, 0.5, 1]) {
    const v = y0 + (y1 - y0) * k, y = Y(v);
    s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${tick(v)}</text>`;
  }
  s += `<text x="${L}" y="${H - 6}" text-anchor="start">${fmtDate(pts[0].date)}</text>`;
  if (pts.length > 1) s += `<text x="${W - R}" y="${H - 6}" text-anchor="end">${fmtDate(pts[pts.length - 1].date)}</text>`;
  const coords = pts.map((p, i) => [X(xs[i], i), Y(p.y)]);
  if (coords.length > 1) s += `<path class="line" d="M${coords.map((c) => c.join(',')).join('L')}"/>`;
  pts.forEach((p, i) => {
    s += `<circle class="dot ${p.pr ? 'pr' : ''}" cx="${coords[i][0]}" cy="${coords[i][1]}" r="${p.pr ? 5 : 3.5}"><title>${fmtDate(p.date, true)}: ${esc(p.label)}</title></circle>`;
  });
  return s + '</svg>';
}

function renderData() {
  const hasSample = state.days.some((d) => d.sample) || state.sessions.some((s) => s.sample);
  return `<h1>Data</h1>
    <section class="card stack">
      <h3>Backup</h3>
      <p class="muted small">Your data lives only in this browser on this device. Export a backup now and then, and import it to restore or move to another device.</p>
      <div class="row">
        <button class="btn primary" data-act="export">Export JSON</button>
        <button class="btn" data-act="import">Import JSON</button>
      </div>
    </section>
    <section class="card stack">
      <h3>Sample data</h3>
      <p class="muted small">${hasSample
        ? 'The app came with a sample Push/Pull/Legs program and six weeks of example sessions. Remove them when you\'re ready to start. Sample days you have edited are kept.'
        : 'Load the example program and sessions to explore the app.'}</p>
      ${hasSample
        ? '<button class="btn block danger" data-act="clear-sample">Remove sample data</button>'
        : '<button class="btn block" data-act="load-sample">Load sample data</button>'}
    </section>
    <section class="card stack">
      <h3>Reset</h3>
      <p class="muted small">${state.days.length} workout days · ${state.sessions.length} sessions saved.</p>
      <button class="btn block danger" data-act="erase">Erase all data</button>
    </section>`;
}

/* ---------- Actions ---------- */

const findDay = (id) => state.days.find((d) => d.id === id);
const move = (arr, i, dir) => {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
};
function touchDay(d) { if (d) delete d.sample; }
function focusLast(selector) {
  const els = document.querySelectorAll(selector);
  const el = els[els.length - 1];
  if (el) { el.focus(); el.select && el.select(); el.scrollIntoView({ block: 'center' }); }
}

const actions = {
  tab(b) { tab = b.dataset.tab; render(); window.scrollTo(0, 0); },

  start(b) {
    const day = findDay(b.dataset.id);
    if (!day) return;
    draft = { dayId: day.id, date: todayISO(), values: {} };
    day.exercises.forEach((ex) => draftRows(ex));
    saveDraft(); render(); window.scrollTo(0, 0);
  },
  'add-set'(b) {
    draft.values[b.dataset.ex].push({ kg: '', reps: '' });
    saveDraft(); render();
  },
  'copy-last'(b) {
    const day = findDay(draft.dayId);
    const ex = day && day.exercises.find((e) => e.id === b.dataset.ex);
    const last = ex && lastEntry(ex.name);
    if (!last) return;
    draft.values[ex.id] = last.sets.map((s) => ({ kg: fmt(s.kg), reps: String(s.reps) }));
    draftRows(ex);
    saveDraft(); render();
  },
  discard() {
    if (!confirm('Discard this workout? Entered sets will be lost.')) return;
    draft = null; saveDraft(); render();
  },
  'save-session'() {
    const day = findDay(draft.dayId);
    if (!day) return;
    const entries = [];
    let skipped = 0;
    for (const ex of day.exercises.filter((e) => e.name.trim())) {
      const sets = [];
      for (const r of draft.values[ex.id] || []) {
        const kg = num(r.kg), reps = num(r.reps);
        if (reps != null && reps > 0) sets.push({ kg: Math.max(0, kg ?? 0), reps: Math.round(reps) });
        else if (kg != null) skipped++;
      }
      if (sets.length) entries.push({ name: ex.name.trim(), sets });
    }
    if (!entries.length) { toast('Enter reps for at least one set first.'); return; }
    if (skipped && !confirm(`${skipped} set(s) have a weight but no reps and won't be saved. Save anyway?`)) return;

    const prs = entries.filter((e) => {
      const best = bestSet(e.name);
      return best && better(topSet(e.sets), best);
    }).map((e) => `${e.name} ${setLabel(topSet(e.sets))}`);

    state.sessions.push({ id: uid(), date: draft.date || todayISO(), dayId: day.id, dayName: day.name, savedAt: Date.now(), entries });
    persist();
    draft = null; saveDraft();
    render(); window.scrollTo(0, 0);
    toast(prs.length ? `Saved. New PR: ${prs.join(', ')}` : 'Workout saved');
  },
  'del-session'(b) {
    const s = state.sessions.find((x) => x.id === b.dataset.id);
    if (!s || !confirm(`Delete ${s.dayName} on ${fmtDate(s.date, true)}?`)) return;
    state.sessions = state.sessions.filter((x) => x !== s);
    persist(); render();
  },

  'day-add'() {
    state.days.push({ id: uid(), name: '', exercises: [] });
    persist(); render(); focusLast('[data-field="day-name"]');
  },
  'day-up'(b) { move(state.days, state.days.indexOf(findDay(b.dataset.day)), -1); persist(); render(); },
  'day-down'(b) { move(state.days, state.days.indexOf(findDay(b.dataset.day)), 1); persist(); render(); },
  'day-del'(b) {
    const d = findDay(b.dataset.day);
    if (!d || !confirm(`Delete "${d.name || 'Untitled'}" and its exercises? Logged sessions are kept.`)) return;
    state.days = state.days.filter((x) => x !== d);
    if (draft && draft.dayId === d.id) { draft = null; saveDraft(); }
    persist(); render();
  },
  'ex-add'(b) {
    const d = findDay(b.dataset.day);
    touchDay(d);
    d.exercises.push({ id: uid(), name: '', sets: 3, reps: 10 });
    persist(); render(); focusLast(`[data-field="ex-name"][data-day="${d.id}"]`);
  },
  'ex-up'(b) { const d = findDay(b.dataset.day); touchDay(d); move(d.exercises, d.exercises.findIndex((e) => e.id === b.dataset.ex), -1); persist(); render(); },
  'ex-down'(b) { const d = findDay(b.dataset.day); touchDay(d); move(d.exercises, d.exercises.findIndex((e) => e.id === b.dataset.ex), 1); persist(); render(); },
  'ex-del'(b) {
    const d = findDay(b.dataset.day);
    const ex = d.exercises.find((e) => e.id === b.dataset.ex);
    if (ex.name.trim() && !confirm(`Remove ${ex.name} from ${d.name || 'this day'}? Its history is kept.`)) return;
    touchDay(d);
    d.exercises = d.exercises.filter((e) => e !== ex);
    persist(); render();
  },

  metric(b) { progMetric = b.dataset.m; render(); },

  export() {
    const data = { app: 'workout-tracker', version: 1, exportedAt: new Date().toISOString(), days: state.days, sessions: state.sessions };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `workouts-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup exported');
  },
  import() { $('#importFile').value = ''; $('#importFile').click(); },
  'clear-sample'() {
    if (!confirm('Remove the sample program and sample sessions?')) return;
    state.days = state.days.filter((d) => !d.sample);
    state.sessions = state.sessions.filter((s) => !s.sample);
    if (draft && !findDay(draft.dayId)) { draft = null; saveDraft(); }
    persist(); render(); toast('Sample data removed');
  },
  'load-sample'() {
    const s = sampleData();
    state.days.push(...s.days);
    state.sessions.push(...s.sessions);
    persist(); render(); toast('Sample data loaded');
  },
  erase() {
    if (!confirm('Erase ALL workout days and sessions on this device? Export a backup first if you might want them.')) return;
    state = { days: [], sessions: [] };
    draft = null; saveDraft();
    persist(); render(); toast('All data erased');
  },
};

/* ---------- Import ---------- */

function sanitize(raw) {
  if (!isValidData(raw)) throw new Error('This file is not a workout backup.');
  const int = (v, d) => { const n = parseInt(v, 10); return n > 0 ? n : d; };
  const days = raw.days.map((d) => ({
    id: String(d.id || uid()),
    name: String(d.name || ''),
    ...(d.sample ? { sample: true } : {}),
    exercises: (Array.isArray(d.exercises) ? d.exercises : []).map((e) => ({
      id: String(e.id || uid()), name: String(e.name || ''), sets: int(e.sets, 3), reps: int(e.reps, 10),
    })),
  }));
  const sessions = raw.sessions
    .filter((s) => s && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && Array.isArray(s.entries))
    .map((s) => ({
      id: String(s.id || uid()),
      date: s.date,
      dayId: String(s.dayId || ''),
      dayName: String(s.dayName || 'Workout'),
      savedAt: Number(s.savedAt) || 0,
      ...(s.sample ? { sample: true } : {}),
      entries: s.entries
        .filter((e) => e && Array.isArray(e.sets))
        .map((e) => ({
          name: String(e.name || ''),
          sets: e.sets.map((x) => ({ kg: Math.max(0, Number(x.kg) || 0), reps: Math.max(0, Math.round(Number(x.reps) || 0)) })).filter((x) => x.reps > 0),
        }))
        .filter((e) => e.name && e.sets.length),
    }));
  return { days, sessions };
}

$('#importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = sanitize(JSON.parse(reader.result));
      if (!confirm(`Replace your current data (${state.days.length} days, ${state.sessions.length} sessions) with this backup (${data.days.length} days, ${data.sessions.length} sessions)?`)) return;
      state = data;
      draft = null; saveDraft();
      persist(); render(); toast('Backup imported');
    } catch (err) {
      alert('Import failed: ' + (err.message || 'invalid file'));
    }
  };
  reader.readAsText(file);
});

/* ---------- Events ---------- */

document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (b && !b.disabled && actions[b.dataset.act]) actions[b.dataset.act](b, e);
});

document.addEventListener('input', (e) => {
  const t = e.target;
  const f = t.dataset.field;
  if (!f) return;
  if (f === 'set' && draft) {
    const rows = draft.values[t.dataset.ex];
    if (!rows || !rows[t.dataset.i]) return;
    rows[t.dataset.i][t.dataset.f] = t.value;
    saveDraft();
    if (t.dataset.f === 'kg') {
      const best = num(t.dataset.best), kg = num(t.value);
      t.classList.toggle('pr', best != null && kg != null && kg > best);
    }
    return;
  }
  if (f === 'draft-date' && draft) { draft.date = t.value || todayISO(); saveDraft(); return; }
  if (f === 'prog-select') { progName = t.value; render(); return; }

  const d = t.dataset.day && findDay(t.dataset.day);
  if (!d) return;
  touchDay(d);
  if (f === 'day-name') d.name = t.value;
  else {
    const ex = d.exercises.find((x) => x.id === t.dataset.ex);
    if (!ex) return;
    if (f === 'ex-name') ex.name = t.value;
    if (f === 'ex-sets' || f === 'ex-reps') {
      const n = parseInt(t.value, 10);
      if (n > 0 && n <= 99) ex[f === 'ex-sets' ? 'sets' : 'reps'] = n;
    }
  }
  persist();
});

// Snap invalid numbers in the program editor back to the stored value.
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.field !== 'ex-sets' && t.dataset.field !== 'ex-reps') return;
  const ex = findDay(t.dataset.day)?.exercises.find((x) => x.id === t.dataset.ex);
  if (ex) t.value = t.dataset.field === 'ex-sets' ? ex.sets : ex.reps;
});

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
