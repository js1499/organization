// ============================================================================
// Operating Plan — interactive Gantt application.
// Source of truth: a `state` plan object (categories + tasks). Every edit mutates
// state, re-renders, and saves (localStorage instantly + cloud when available).
// View prefs (active tab, hidden items, mute) are per-device, not synced.
// ============================================================================
import { SEED, PALETTE } from './data.js';

const MS = 86400000;
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const $ = (s) => document.querySelector(s);
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
const uid = (p) => p + Math.random().toString(36).slice(2, 9);
const UIFONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
let _mctx;
function measureText(s, font) {
  try { if (_mctx === undefined) { const c = document.createElement('canvas'); _mctx = (c.getContext && c.getContext('2d')) || null; } if (_mctx) { _mctx.font = font; return _mctx.measureText(s || '').width; } } catch (e) {}
  return (s ? s.length : 0) * 7;  // fallback (e.g. headless without canvas)
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- DOM refs --------------------------------------------------------------
const D = {
  sub: $('#sub'), asof: $('#asof'), sync: $('#sync'),
  tabs: $('#tabs'), muteBtn: $('#muteBtn'), printBtn: $('#printBtn'), manageBtn: $('#manageBtn'), addBtn: $('#addBtn'),
  legend: $('#legend'), hiddenNote: $('#hiddenNote'),
  labHead: $('#labHead'), labels: $('#labels'), axis: $('#axis'),
  timeScroll: $('#timeScroll'), timeInner: $('#timeInner'), bg: $('#bg'), rows: $('#rows'),
  notes: $('#notes'), tip: $('#tip'), modal: $('#modal'), toast: $('#toast'),
};

// ---- App state -------------------------------------------------------------
let state = null;           // the plan { version, updatedAt, categories[], tasks[] }
let cloudOK = false;        // is the cloud store reachable & configured?
const view = { tab: 'all', hiddenCats: new Set(), muted: false, nameW: null };
let scale = null;           // { start: Date, days, dayWidth, x(date) }
let printFit = 0;           // when >0, fit the whole timeline into this many px (for printing)
let todayISO = null;

// ============================================================================
// Dates & derived fields
// ============================================================================
function parse(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
const fmtLong = (d) => MON[d.getMonth()] + ' ' + String(d.getDate()).padStart(2, '0') + ', ' + d.getFullYear();
const fmtShort = (d) => MON[d.getMonth()] + ' ' + d.getDate();
// A task's target end-dates form a push history: targets[0] = original target,
// last = current target, the ones between = successive pushes. oe/ne are kept in
// sync for back-compat with older clients, but `targets` is the source of truth.
function targetsOf(t) { return (t.targets && t.targets.length) ? t.targets : [t.oe, t.ne].filter(Boolean); }
function origEndISO(t) { const a = targetsOf(t); return a[0] || null; }
function curEndISO(t) { const a = targetsOf(t); return a[a.length - 1] || null; }
function pushesOf(t) { return targetsOf(t).slice(1, -1); }  // intermediate pushes only
function slipDays(t) { const o = parse(origEndISO(t)), c = parse(curEndISO(t)); return (o && c) ? Math.round((c - o) / MS) : 0; }
function isoAdd(iso, n) { const d = parse(iso); if (!d) return iso; const x = new Date(d.getTime() + n * MS); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
function endOf(t) { return parse(curEndISO(t)) || parse(origEndISO(t)); }
function startOf(t) { const a = parse(origEndISO(t)) || parse(curEndISO(t)); if (!a || t.dur == null) return a; return new Date(a.getTime() - t.dur * MS); }
function isUnscheduled(t) { return t.status === 'tbd' || !endOf(t); }

// "Postponed" markers: a category carries a flag (e.g. Tax's "REVISITED POST
// JAPAN"), or a task is explicitly striped / tagged delayed|postponed|deferred.
function catPostponed(c) { return !!(c && c.flag); }
function taskPostponed(t) { return !!(t.striped || /delay|postpon|defer/i.test((t.tag || '') + ' ' + (t.note || ''))); }

function etNow() {
  const now = new Date();
  const dp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const lp = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(now);
  const g = (arr, t) => (arr.find((p) => p.type === t) || {}).value || '';
  const iso = `${g(dp, 'year')}-${g(dp, 'month')}-${g(dp, 'day')}`;
  const label = `${g(lp, 'weekday')} ${g(lp, 'month')} ${g(lp, 'day')}, ${g(lp, 'year')} · ${g(lp, 'hour')}:${g(lp, 'minute')} ${g(lp, 'dayPeriod')} ET`;
  return { iso, label };
}

// ============================================================================
// Selectors
// ============================================================================
const catById = (id) => state.categories.find((c) => c.id === id);
function visibleCategories() {
  if (view.tab !== 'all') return state.categories.filter((c) => c.id === view.tab);
  return state.categories.filter((c) => !view.hiddenCats.has(c.id));
}
function tasksOf(catId) { return state.tasks.filter((t) => t.cat === catId); }
function orderedTasks(catId) {
  const items = tasksOf(catId);
  const sched = items.filter((t) => !isUnscheduled(t));
  const uns = items.filter((t) => isUnscheduled(t));
  sched.sort((a, b) => endOf(a) - endOf(b));
  return sched.concat(uns);
}

// ============================================================================
// Scale (date -> pixels), window auto-fits visible tasks + today
// ============================================================================
function computeScale() {
  const today = parse(todayISO);
  let min = today, max = today;
  for (const c of visibleCategories()) {
    for (const t of tasksOf(c.id)) {
      const s = startOf(t), e = endOf(t);
      if (s && s < min) min = s; if (s && s > max) max = s;
      if (e && e < min) min = e; if (e && e > max) max = e;
    }
  }
  // pad and snap start back to a Monday for clean weekly gridlines
  let start = new Date(min.getTime() - 4 * MS);
  while (start.getDay() !== 1) start = new Date(start.getTime() - MS);
  let end = new Date(max.getTime() + 5 * MS);
  const days = Math.max(7, Math.round((end - start) / MS));
  const cw = printFit || D.timeScroll.clientWidth || 900;
  const dayWidth = clamp(cw / days, printFit ? 4 : 9, 30);
  scale = { start, days, dayWidth, x: (d) => Math.round((d - start) / MS) * dayWidth };
  return { start, end, days, dayWidth, width: days * dayWidth, today };
}

// ============================================================================
// Render
// ============================================================================
function render(opts = {}) {
  const animate = !!opts.animate;
  const sc = computeScale();
  const width = printFit ? sc.width : Math.max(sc.width, D.timeScroll.clientWidth - 2);
  D.timeInner.style.width = width + 'px';

  renderTabs();
  renderLegend();
  renderHiddenNote();

  // axis: months + weekday ticks (Mondays)
  D.axis.innerHTML = '';
  const months = el('div', 'months'); const ticks = el('div', 'ticks');
  let mIter = new Date(sc.start.getFullYear(), sc.start.getMonth(), 1);
  while (mIter <= sc.end) {
    const segStart = mIter < sc.start ? sc.start : mIter;
    const next = new Date(mIter.getFullYear(), mIter.getMonth() + 1, 1);
    const m = el('div', 'month', MON[mIter.getMonth()] + (mIter.getMonth() === 0 ? " '" + String(mIter.getFullYear()).slice(2) : ''));
    m.style.left = scale.x(segStart) + 'px';
    months.appendChild(m);
    mIter = next;
  }
  for (let i = 0; i <= sc.days; i++) {
    const d = new Date(sc.start.getTime() + i * MS);
    if (d.getDay() === 1) { const tk = el('div', 'tick'); tk.style.left = scale.x(d) + 'px'; tk.appendChild(el('div', 'v')); tk.appendChild(el('div', 't mono', MON[d.getMonth()] + ' ' + d.getDate())); ticks.appendChild(tk); }
  }
  D.axis.appendChild(months); D.axis.appendChild(ticks);

  // background: weekend bands, gridlines, today
  D.bg.innerHTML = '';
  for (let i = 0; i < sc.days; i++) {
    const d = new Date(sc.start.getTime() + i * MS); const wd = d.getDay();
    if (wd === 0 || wd === 6) { const b = el('div', 'band'); b.style.left = scale.x(d) + 'px'; b.style.width = scale.dayWidth + 'px'; D.bg.appendChild(b); }
    if (wd === 1) { const g = el('div', 'grid'); g.style.left = scale.x(d) + 'px'; D.bg.appendChild(g); }
    if (d.getDate() === 1) { const g = el('div', 'grid m'); g.style.left = scale.x(d) + 'px'; D.bg.appendChild(g); }
  }
  const tdy = el('div', 'today'); tdy.id = 'todayLine'; tdy.style.left = scale.x(sc.today) + 'px';
  tdy.appendChild(el('div', 'pill', 'Today')); D.bg.appendChild(tdy);

  // labels column + plot rows
  D.labels.innerHTML = ''; D.rows.innerHTML = '';
  D.rows.classList.toggle('anim', animate);
  let rowIndex = 0;
  const cats = visibleCategories();
  // Date columns flex to the most-pushed task in view: Original · [up to 3 recent
  // pushes] · Current · Slip. Older pushes past 3 collapse into a "…".
  let maxInter = 0;
  for (const c of cats) for (const t of tasksOf(c.id)) maxInter = Math.max(maxInter, targetsOf(t).length - 2);
  const pushCols = Math.max(0, Math.min(3, maxInter));
  // Auto-fit the title column to the longest visible title so full titles show by
  // default; a user-dragged width (view.nameW) overrides it.
  let autoW = 240;
  for (const c of cats) {
    autoW = Math.max(autoW, measureText(c.name + (c.alias ? ' · ' + c.alias : ''), '700 13px ' + UIFONT) + 112);
    for (const t of tasksOf(c.id)) autoW = Math.max(autoW, measureText(t.name, '12.5px ' + UIFONT) + 140 + (t.status === 'done' ? 52 : 0));
  }
  autoW = clamp(Math.round(autoW), 240, 640);
  let nameW = view.nameW || autoW;
  if (printFit) nameW = Math.min(nameW, 300);
  document.documentElement.style.setProperty('--name-w', nameW + 'px');
  const gc = ['var(--name-w)', 'var(--dcol)']; for (let i = 0; i < pushCols; i++) gc.push('var(--dcol)'); gc.push('var(--dcol)', 'var(--scol)');
  document.documentElement.style.setProperty('--grid-cols', gc.join(' '));
  document.documentElement.style.setProperty('--extra-cols', pushCols);
  renderHead(pushCols);
  if (!cats.length) {
    const empty = el('div', 'tlab'); empty.style.gridTemplateColumns = '1fr';
    const w = el('div', 'nmwrap'); w.appendChild(el('span', 'nm', 'Nothing to show — add a task or un-hide a business.')); empty.appendChild(w);
    D.labels.appendChild(empty);
    const pr = el('div', 'prow'); D.rows.appendChild(pr);
  }
  for (const c of cats) {
    // group label
    const cpp = catPostponed(c);
    const grp = el('div', 'grp' + (cpp ? ' postponed' : ''));
    const nw = el('div', 'nmwrap');
    const gb = el('div', 'gbar'); gb.style.background = c.color; nw.appendChild(gb);
    nw.appendChild(el('span', 'nm', c.name));
    if (c.alias && !c.flag) nw.appendChild(el('span', 'al', '· ' + c.alias));
    if (cpp) { const b = el('span', 'pp-badge', '⏸ POSTPONED'); if (c.flag) { b.title = c.flag; grp.title = c.flag; } nw.appendChild(b); }
    else nw.appendChild(el('span', 'ct mono', String(tasksOf(c.id).length)));
    const add = el('button', 'gadd', '+'); add.title = 'Add task to ' + c.name; add.type = 'button';
    add.onclick = (e) => { e.stopPropagation(); Sound.open(); openTaskEditor(null, c.id); };
    nw.appendChild(add);
    grp.appendChild(nw);
    for (let k = 0; k < 3 + pushCols; k++) grp.appendChild(el('div', 'dcell'));
    D.labels.appendChild(grp);
    const sp = el('div', 'rspace'); sp.appendChild(el('div', 'sep')); D.rows.appendChild(sp);

    // tasks
    for (const t of orderedTasks(c.id)) {
      const sd = startOf(t);
      const uns = isUnscheduled(t);
      const pp = cpp || taskPostponed(t);
      const tl = el('div', 'tlab' + (uns ? ' uns' : '') + (t.status === 'done' ? ' done-row' : '') + (pp ? ' postponed' : ''));
      const nm = el('div', 'nmwrap');
      const dot = el('span', 'dot'); dot.style.background = c.color; nm.appendChild(dot);
      nm.appendChild(el('span', 'nm', t.name));
      if (t.tag) nm.appendChild(el('span', 'tag', t.tag));
      if (uns) nm.appendChild(el('span', 'tag', 'tbd'));
      if (t.status === 'done') nm.appendChild(el('span', 'done-tag', '✓ Done'));
      if (taskPostponed(t)) nm.appendChild(el('span', 'pp-tag', 'postponed'));
      const acts = el('div', 'rowacts');
      const editB = el('button', 'ra', '✎'); editB.title = 'Edit'; editB.onclick = () => { Sound.open(); openTaskEditor(t.id); };
      const delB = el('button', 'ra ra-del', '✕'); delB.title = 'Delete task (removes it for everyone)'; delB.onclick = () => { if (confirm('Delete "' + t.name + '"? This removes it for everyone.')) { state.tasks = state.tasks.filter((x) => x.id !== t.id); Sound.delete(); commit('Task deleted', { type: 'deleteTask', id: t.id }); } };
      const pushB = el('button', 'ra ra-push', '↣'); pushB.title = 'Push to a new date'; pushB.onclick = (e) => { e.stopPropagation(); openPushPopover(t, pushB); };
      acts.appendChild(editB); acts.appendChild(pushB); acts.appendChild(delB); nm.appendChild(acts);
      tl.appendChild(nm);
      buildDateCells(t, pushCols).forEach((cell) => tl.appendChild(cell));
      tl.ondblclick = () => { Sound.open(); openTaskEditor(t.id); };
      D.labels.appendChild(tl);

      // plot row + bar
      const pr = el('div', 'prow' + (pp ? ' postponed' : ''));
      const delay = animate ? Math.min(rowIndex * 9, 320) + 'ms' : '0ms';
      if (uns) {
        const up = el('div', 'uns-pill', t.status === 'tbd' ? 'TBD' : 'Unscheduled'); up.style.animationDelay = delay;
        up.onclick = () => { Sound.open(); openTaskEditor(t.id); };
        attachTip(up, t, c); pr.appendChild(up);
      } else {
        let l, w;
        if (t.status === 'inProgress') { l = scale.x(sd); w = Math.max(scale.x(sc.today) - l, 6); }
        else { l = scale.x(sd); w = Math.max(scale.x(endOf(t)) - l, 6); }
        const bw = el('div', 'barwrap'); bw.style.left = l + 'px'; bw.style.width = w + 'px'; bw.style.animationDelay = delay;
        const bar = el('div', 'bar' + (t.striped ? ' striped' : '') + (c.flag ? ' deferred' : '') + (t.status === 'done' ? ' done' : '') + (t.status === 'inProgress' ? ' inprogress' : ''));
        bar.style.background = c.color; bw.appendChild(bar);
        bw.onclick = () => { Sound.open(); openTaskEditor(t.id); };
        attachTip(bw, t, c); pr.appendChild(bw);
      }
      const tgN = targetsOf(t);   // amber notches marking each past target it was pushed off of
      if (!uns && tgN.length > 1) for (let i = 0; i < tgN.length - 1; i++) { const nx = el('div', 'pnotch'); nx.style.left = scale.x(parse(tgN[i])) + 'px'; nx.title = 'was due ' + fmtShort(parse(tgN[i])); pr.appendChild(nx); }
      D.rows.appendChild(pr);
      rowIndex++;
    }
  }

  renderNotes();
}

function renderHead(pushCols) {
  D.labHead.innerHTML = '';
  D.labHead.appendChild(el('div', 'h-task', 'Workstream / Task'));
  D.labHead.appendChild(el('div', 'h-date', 'Original'));
  if (pushCols > 0) { const h = el('div', 'h-date push', 'Pushed →'); h.style.gridColumn = 'span ' + pushCols; D.labHead.appendChild(h); }
  D.labHead.appendChild(el('div', 'h-date hi', 'Current'));
  D.labHead.appendChild(el('div', 'h-date', 'Slip'));
  const handle = el('div', 'col-resize'); handle.title = 'Drag to resize the title column · double-click to auto-fit';
  handle.onmousedown = (e) => {
    e.preventDefault();
    const startX = e.clientX, startW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--name-w')) || 300;
    const move = (ev) => document.documentElement.style.setProperty('--name-w', clamp(startW + (ev.clientX - startX), 200, 760) + 'px');
    const up = (ev) => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); view.nameW = Math.round(clamp(startW + (ev.clientX - startX), 200, 760)); saveView(); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };
  handle.ondblclick = () => { view.nameW = null; saveView(); render(); };
  D.labHead.appendChild(handle);
}

// Cells: Original · [up to `pushCols` recent pushes, right-aligned, older→"…"] · Current · Slip
function buildDateCells(t, pushCols) {
  const cells = [];
  const tg = targetsOf(t);
  const uns = isUnscheduled(t);
  const orig = tg[0] ? parse(tg[0]) : null;
  const cur = tg[tg.length - 1] ? parse(tg[tg.length - 1]) : null;
  const inter = tg.slice(1, -1);
  cells.push(el('div', 'dcell mono oe', orig && !uns ? fmtShort(orig) : '—'));
  const shown = inter.slice(-pushCols);
  const blanks = pushCols - shown.length;
  const hiddenOlder = inter.length - shown.length;
  for (let j = 0; j < pushCols; j++) {
    if (j < blanks) { cells.push(el('div', 'dcell')); continue; }
    const d = shown[j - blanks];
    const cell = el('div', 'dcell mono push');
    if (j === blanks && hiddenOlder > 0) { const dots = el('span', 'pmore', '…'); dots.title = inter.map((x) => fmtShort(parse(x))).join(' → '); cell.appendChild(dots); }
    cell.appendChild(el('span', 'pd', fmtShort(parse(d))));
    cells.push(cell);
  }
  let curCell;
  if (t.status === 'inProgress') curCell = el('div', 'dcell ne prog', 'In progress');
  else if (uns) curCell = el('div', 'dcell ne tbdv', 'TBD');
  else curCell = el('div', 'dcell mono ne', cur ? fmtShort(cur) : '—');
  cells.push(curCell);
  const slip = slipDays(t);
  const slipCell = el('div', 'dcell slip');
  if (slip > 0 && !uns) slipCell.appendChild(el('span', 'slip-badge' + (slip > 14 ? ' big' : ''), '+' + slip + 'd'));
  cells.push(slipCell);
  return cells;
}

let pushPop = null;
function closePushPopover() { if (pushPop) { pushPop.remove(); pushPop = null; document.removeEventListener('mousedown', pushOutside, true); } }
function pushOutside(e) { if (pushPop && !pushPop.contains(e.target)) closePushPopover(); }
function openPushPopover(t, anchor) {
  closePushPopover();
  const pop = el('div', 'push-pop');
  pop.appendChild(el('div', 'pp-lbl', 'Push “' + t.name + '” to'));
  const cur = curEndISO(t);
  const inp = input('date', cur ? isoAdd(cur, 7) : todayISO);
  const go = el('button', 'btn primary sm', 'Push');
  const row = el('div', 'pp-row'); row.appendChild(inp); row.appendChild(go); pop.appendChild(row);
  pushPop = pop;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.top = (r.bottom + 6) + 'px';
  pop.style.left = Math.max(8, Math.min(r.left - 40, window.innerWidth - pop.offsetWidth - 8)) + 'px';
  const doPush = () => {
    const v = inp.value; if (!v) return;
    const tk = state.tasks.find((x) => x.id === t.id); if (!tk) { closePushPopover(); return; }
    const tg = targetsOf(tk).slice(); tg.push(v);
    tk.targets = tg; tk.oe = tg[0]; tk.ne = tg[tg.length - 1];
    Sound.add(); commit('Pushed “' + tk.name + '” to ' + fmtShort(parse(v)), { type: 'upsertTask', task: { ...tk } });
    closePushPopover();
  };
  go.onclick = doPush;
  inp.onkeydown = (e) => { if (e.key === 'Enter') doPush(); if (e.key === 'Escape') closePushPopover(); };
  setTimeout(() => { inp.focus(); document.addEventListener('mousedown', pushOutside, true); }, 30);
}

function renderTabs() {
  D.tabs.innerHTML = '';
  const mk = (id, name, color, count) => {
    const b = el('button', 'tab' + (view.tab === id ? ' active' : ''));
    if (color) { const d = el('span', 'tdot'); d.style.background = color; b.appendChild(d); }
    b.appendChild(el('span', 'tnm', name));
    if (count != null) b.appendChild(el('span', 'tct', String(count)));
    b.onclick = () => { if (view.tab === id) return; view.tab = id; saveView(); Sound.tab(); render({ animate: true }); };
    D.tabs.appendChild(b);
  };
  mk('all', 'All', null, state.tasks.length);
  for (const c of state.categories) mk(c.id, c.name, c.color, state.tasks.filter((t) => t.cat === c.id).length);
}

function renderLegend() {
  // The legend toggles whole businesses, which only applies to the All view.
  // On an individual business tab it's redundant, so hide it.
  if (view.tab !== 'all') { D.legend.style.display = 'none'; D.legend.innerHTML = ''; return; }
  D.legend.style.display = '';
  D.legend.innerHTML = '';
  state.categories.forEach((c) => {
    const n = state.tasks.filter((t) => t.cat === c.id).length;
    const off = view.hiddenCats.has(c.id);
    const chip = el('div', 'chip' + (off ? ' off' : ''));
    const sw = el('span', 'sw'); sw.style.background = c.color; chip.appendChild(sw);
    chip.appendChild(el('span', 'nm', c.name));
    if (c.alias) chip.appendChild(el('span', 'al', '· ' + c.alias));
    chip.appendChild(el('span', 'ct mono', String(n)));
    chip.title = (off ? 'Show ' : 'Hide ') + c.name + ' (on the All view)';
    chip.onclick = () => { if (off) view.hiddenCats.delete(c.id); else view.hiddenCats.add(c.id); Sound.toggle(); saveView(); render({ animate: true }); };
    D.legend.appendChild(chip);
  });
}

function renderHiddenNote() {
  // Only hidden businesses matter now (and only on the All view). Tasks are
  // deleted for everyone, not hidden per-device.
  const hc = view.tab === 'all' ? view.hiddenCats.size : 0;
  if (!hc) { D.hiddenNote.innerHTML = ''; return; }
  D.hiddenNote.innerHTML = hc + ' business' + (hc > 1 ? 'es' : '') + ' hidden on this device — <a id="showAll">show all</a>';
  $('#showAll').onclick = () => { view.hiddenCats.clear(); Sound.toggle(); saveView(); render({ animate: true }); };
}

function renderNotes() {
  const t = parse(todayISO);
  D.notes.innerHTML =
    '<div style="margin-bottom:8px">' +
      '<span class="k"><span class="kb"></span> Bar spans start to new end (start = original end minus duration).</span>' +
      '<span class="k"><span class="kt"></span> Dashed line is today (live US-Eastern), ' + fmtLong(t) + '.</span>' +
    '</div>' +
    'Three date columns: <b>Start</b>, <b>Original end</b> and <b>New end</b> (drives the bars). Click any bar, row, or the pencil to edit; <b>+ Add task</b> and the <b>Businesses</b> button manage the plan. Tasks sort by new end; weekends are shaded. The window auto-fits whatever is visible.';
}

// ============================================================================
// Tooltip
// ============================================================================
let lastMove = null;
window.addEventListener('mousemove', (e) => { lastMove = e; });
function attachTip(node, t, c) {
  node.addEventListener('mouseenter', () => {
    D.tip.innerHTML = '';
    D.tip.appendChild(el('div', 'tn', t.name));
    D.tip.appendChild(el('div', 'tr', c.name + (c.alias ? ' · ' + c.alias : '')));
    if (isUnscheduled(t)) {
      const u = el('div', 'tr'); u.innerHTML = 'Schedule: <b>' + (t.status === 'tbd' ? 'TBD' : 'not set') + '</b>'; D.tip.appendChild(u);
    } else {
      const sd = startOf(t);
      const a = el('div', 'tr'); a.innerHTML = 'Start: <b>' + (sd ? fmtLong(sd) : '—') + '</b>'; D.tip.appendChild(a);
      const o = el('div', 'tr'); o.innerHTML = 'Original: <b>' + (origEndISO(t) ? fmtLong(parse(origEndISO(t))) : 'not set') + '</b>'; D.tip.appendChild(o);
      const ps = pushesOf(t);
      if (ps.length) { const pr = el('div', 'tr'); pr.innerHTML = 'Pushed: <b>' + ps.map((d) => fmtShort(parse(d))).join(' → ') + '</b>'; D.tip.appendChild(pr); }
      const nn = el('div', 'tr'); nn.innerHTML = 'Current: <b>' + (t.status === 'inProgress' ? 'In progress' : (curEndISO(t) ? fmtLong(parse(curEndISO(t))) : '—')) + '</b>'; D.tip.appendChild(nn);
      const sl = slipDays(t); if (sl > 0) { const s = el('div', 'tr'); s.innerHTML = 'Slipped: <b>+' + sl + ' days</b>'; D.tip.appendChild(s); }
      const du = el('div', 'tr'); du.innerHTML = 'Duration: <b>' + t.dur + ' day' + (t.dur === 1 ? '' : 's') + '</b>'; D.tip.appendChild(du);
    }
    if (t.note) D.tip.appendChild(el('div', 'tnote', t.note));
    moveTip();
  });
  node.addEventListener('mousemove', moveTip);
  node.addEventListener('mouseleave', () => D.tip.classList.remove('on'));
}
function moveTip() {
  const e = lastMove; if (!e) return;
  const tw = D.tip.offsetWidth || 220, th = D.tip.offsetHeight || 60;
  let left = e.clientX + 14, top = e.clientY + 16;
  if (left + tw > window.innerWidth - 8) left = e.clientX - tw - 14;
  if (top + th > window.innerHeight - 8) top = e.clientY - th - 14;
  D.tip.style.left = left + 'px'; D.tip.style.top = top + 'px'; D.tip.classList.add('on');
}

// ============================================================================
// Editor — tasks
// ============================================================================
function openModal(node, wide) {
  D.modal.innerHTML = '';
  const dlg = el('div', 'dialog' + (wide ? ' wide' : '')); dlg.appendChild(node);
  D.modal.appendChild(dlg);
  D.modal.classList.add('open');
  D.modal.onclick = (e) => { if (e.target === D.modal) closeModal(); };
}
function closeModal() { D.modal.classList.remove('open'); setTimeout(() => { if (!D.modal.classList.contains('open')) D.modal.innerHTML = ''; }, 220); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && D.modal.classList.contains('open')) closeModal(); });

function field(label, control) { const f = el('div', 'field'); f.appendChild(el('label', null, label)); f.appendChild(control); return f; }
function input(type, value, attrs = {}) { const i = el('input'); i.type = type; if (value != null) i.value = value; for (const k in attrs) i.setAttribute(k, attrs[k]); return i; }

function openTaskEditor(taskId, presetCat) {
  const editing = !!taskId;
  const t = editing ? state.tasks.find((x) => x.id === taskId) : { name: '', cat: presetCat || (view.tab !== 'all' ? view.tab : state.categories[0].id), oe: null, ne: null, dur: 1, status: 'normal', note: '' };

  const wrap = el('div');
  const head = el('div', 'dlg-head'); head.appendChild(el('h2', null, editing ? 'Edit task' : 'Add task'));
  const x = el('button', 'dlg-x', '×'); x.onclick = closeModal; head.appendChild(x); wrap.appendChild(head);

  const body = el('div', 'dlg-body');
  const fName = input('text', t.name, { placeholder: 'Task name', maxlength: 120 });
  body.appendChild(field('Task name', fName));

  const sel = el('select');
  state.categories.forEach((c) => { const o = el('option', null, c.name); o.value = c.id; if (c.id === t.cat) o.selected = true; sel.appendChild(o); });
  body.appendChild(field('Business', sel));

  let targets = targetsOf(t).slice();
  const tlist = el('div', 'target-list');
  function renderTargets() {
    tlist.innerHTML = '';
    if (!targets.length) tlist.appendChild(el('div', 'tl-empty', 'No date yet — add the first target below.'));
    targets.forEach((d, i) => {
      const row = el('div', 'target-row');
      row.appendChild(el('span', 't-lbl', i === 0 ? 'Original' : (i === targets.length - 1 ? 'Current' : 'Push ' + i)));
      const di = input('date', d); di.onchange = () => { targets[i] = di.value; };
      const rm = el('button', 't-rm', '×'); rm.type = 'button'; rm.title = 'Remove this date'; rm.onclick = () => { targets.splice(i, 1); renderTargets(); };
      row.appendChild(di); row.appendChild(rm); tlist.appendChild(row);
    });
  }
  renderTargets();
  const addT = el('button', 'btn ghost sm', '+ Push to a new date'); addT.type = 'button';
  addT.onclick = () => { const last = targets[targets.length - 1]; targets.push(last ? isoAdd(last, 7) : todayISO); renderTargets(); };
  const tWrap = el('div'); tWrap.appendChild(tlist); tWrap.appendChild(addT);
  body.appendChild(field('Target dates  ·  original → pushes → current', tWrap));
  const fDur = input('number', t.dur != null ? t.dur : 1, { min: '0', max: '999', step: '1' });
  body.appendChild(field('Duration (days)', fDur));

  const seg = el('div', 'seg');
  const statuses = [['normal', 'Normal'], ['inProgress', 'In progress'], ['done', 'Done'], ['tbd', 'TBD']];
  let curStatus = t.status || 'normal';
  statuses.forEach(([val, lbl]) => { const b = el('button', curStatus === val ? 'on' : '', lbl); b.type = 'button'; b.onclick = () => { curStatus = val; [...seg.children].forEach((c) => c.classList.remove('on')); b.classList.add('on'); Sound.tick(); }; seg.appendChild(b); });
  body.appendChild(field('Status', seg));

  const fNote = el('textarea'); fNote.value = t.note || ''; fNote.placeholder = 'Optional note (shown in the tooltip)';
  body.appendChild(field('Note', fNote));

  const err = el('div', 'err-text'); body.appendChild(err);
  wrap.appendChild(body);

  const foot = el('div', 'dlg-foot');
  if (editing) { const del = el('button', 'btn danger', 'Delete'); del.onclick = () => { if (confirm('Delete "' + t.name + '"?')) { state.tasks = state.tasks.filter((x) => x.id !== taskId); Sound.delete(); commit('Task deleted', { type: 'deleteTask', id: taskId }); closeModal(); } }; foot.appendChild(del); }
  const right = el('div', 'right');
  const cancel = el('button', 'btn ghost', 'Cancel'); cancel.onclick = closeModal; right.appendChild(cancel);
  const save = el('button', 'btn primary', editing ? 'Save' : 'Add task');
  save.onclick = () => {
    const name = fName.value.trim();
    if (!name) { err.textContent = 'Please enter a task name.'; fName.focus(); return; }
    const dur = clamp(parseInt(fDur.value, 10) || 0, 0, 999);
    let tg = targets.filter(Boolean); tg = tg.filter((d, i) => i === 0 || d !== tg[i - 1]);
    const patch = { name, cat: sel.value, targets: tg, oe: tg[0] || null, ne: tg[tg.length - 1] || null, dur, status: curStatus, note: fNote.value.trim() };
    if (editing) { Object.assign(t, patch); Sound.save(); commit('Task updated', { type: 'upsertTask', task: { ...t } }); }
    else { const nt = { id: uid('k'), ...patch }; state.tasks.push(nt); Sound.add(); commit('Task added', { type: 'upsertTask', task: { ...nt } }); }
    closeModal();
  };
  right.appendChild(save); foot.appendChild(right); wrap.appendChild(foot);

  openModal(wrap);
  setTimeout(() => fName.focus(), 60);
}

// ============================================================================
// Editor — businesses (categories)
// ============================================================================
function openBizManager() {
  Sound.open();
  const wrap = el('div');
  const head = el('div', 'dlg-head'); head.appendChild(el('h2', null, 'Businesses'));
  const x = el('button', 'dlg-x', '×'); x.onclick = closeModal; head.appendChild(x); wrap.appendChild(head);

  const body = el('div', 'dlg-body');
  const list = el('div', 'biz-list');
  const refresh = () => {
    list.innerHTML = '';
    state.categories.forEach((c, i) => {
      const row = el('div', 'biz-row');
      const sw = el('span', 'bsw'); sw.style.background = c.color; row.appendChild(sw);
      row.appendChild(el('span', 'bname', c.name + (c.alias ? '  · ' + c.alias : '')));
      row.appendChild(el('span', 'bct', state.tasks.filter((t) => t.cat === c.id).length + ' tasks'));
      const acts = el('div', 'bacts');
      const up = el('button', 'ba', '↑'); up.disabled = i === 0; up.title = 'Move up'; up.onclick = () => { swapCat(i, i - 1); refresh(); };
      const dn = el('button', 'ba', '↓'); dn.disabled = i === state.categories.length - 1; dn.title = 'Move down'; dn.onclick = () => { swapCat(i, i + 1); refresh(); };
      const ed = el('button', 'ba', '✎'); ed.title = 'Edit'; ed.onclick = () => openBizEditor(c, refresh);
      const del = el('button', 'ba', '✕'); del.title = 'Delete'; del.onclick = () => {
        const n = state.tasks.filter((t) => t.cat === c.id).length;
        if (confirm('Delete "' + c.name + '"' + (n ? ' and its ' + n + ' task' + (n > 1 ? 's' : '') : '') + '?')) {
          state.categories = state.categories.filter((z) => z.id !== c.id);
          state.tasks = state.tasks.filter((t) => t.cat !== c.id);
          if (view.tab === c.id) view.tab = 'all';
          Sound.delete(); commit('Business deleted', { type: 'deleteCat', id: c.id }); refresh();
        }
      };
      acts.append(up, dn, ed, del); row.appendChild(acts); list.appendChild(row);
    });
  };
  refresh();
  body.appendChild(list);
  wrap.appendChild(body);

  const foot = el('div', 'dlg-foot');
  const add = el('button', 'btn primary', '+ Add business'); add.onclick = () => openBizEditor(null, refresh);
  const right = el('div', 'right'); const done = el('button', 'btn ghost', 'Done'); done.onclick = closeModal; right.appendChild(done);
  foot.appendChild(add); foot.appendChild(right); wrap.appendChild(foot);
  openModal(wrap, true);
}

function swapCat(i, j) { const a = state.categories; [a[i], a[j]] = [a[j], a[i]]; commit(null, { type: 'reorderCats', order: state.categories.map((c) => c.id) }); }

function openBizEditor(cat, after) {
  const editing = !!cat;
  const c = editing ? { ...cat } : { name: '', alias: '', color: PALETTE[0] };
  const wrap = el('div');
  const head = el('div', 'dlg-head'); head.appendChild(el('h2', null, editing ? 'Edit business' : 'Add business'));
  const x = el('button', 'dlg-x', '×'); x.onclick = () => openBizManager(); head.appendChild(x); wrap.appendChild(head);
  const body = el('div', 'dlg-body');
  const fName = input('text', c.name, { placeholder: 'Business name', maxlength: 60 });
  const fAlias = input('text', c.alias, { placeholder: 'Optional alias', maxlength: 40 });
  const r2 = el('div', 'row2'); r2.appendChild(field('Name', fName)); r2.appendChild(field('Alias', fAlias)); body.appendChild(r2);
  let color = c.color;
  const sws = el('div', 'swatches');
  const palette = PALETTE.includes(color) ? PALETTE : [color, ...PALETTE];
  palette.forEach((hex) => { const s = el('div', 'swatch' + (hex === color ? ' on' : '')); s.style.background = hex; s.onclick = () => { color = hex; [...sws.children].forEach((z) => z.classList.remove('on')); s.classList.add('on'); Sound.tick(); }; sws.appendChild(s); });
  body.appendChild(field('Colour', sws));
  const err = el('div', 'err-text'); body.appendChild(err);
  wrap.appendChild(body);
  const foot = el('div', 'dlg-foot'); const right = el('div', 'right');
  const back = el('button', 'btn ghost', 'Back'); back.onclick = () => openBizManager(); right.appendChild(back);
  const save = el('button', 'btn primary', editing ? 'Save' : 'Add');
  save.onclick = () => {
    const name = fName.value.trim(); if (!name) { err.textContent = 'Please enter a name.'; return; }
    if (editing) { const real = catById(cat.id); real.name = name; real.alias = fAlias.value.trim(); real.color = color; Sound.save(); commit('Business updated', { type: 'upsertCat', cat: { ...real } }); }
    else { const nc = { id: uid('c'), name, alias: fAlias.value.trim(), color, flag: '' }; state.categories.push(nc); Sound.add(); commit('Business added', { type: 'upsertCat', cat: { ...nc } }); }
    openBizManager();
  };
  right.appendChild(save); foot.appendChild(right); wrap.appendChild(foot);
  openModal(wrap);
  setTimeout(() => fName.focus(), 60);
}

// ============================================================================
// Persistence — localStorage (always) + cloud (/api/plan when available)
// ============================================================================
const LS_DATA = 'opplan:data', LS_VIEW = 'opplan:view';
let saveTimer = null;

function seedPlan() { return { version: 1, updatedAt: Date.now(), categories: structuredClone(SEED.categories), tasks: structuredClone(SEED.tasks) }; }
function normalize(p) {
  return {
    version: p.version || 1, updatedAt: p.updatedAt || 0,
    categories: (p.categories || []).map((c) => ({ id: c.id || uid('c'), name: c.name || 'Untitled', alias: c.alias || '', color: c.color || '#7F7F7F', flag: c.flag || '' })),
    tasks: (p.tasks || []).map((t) => {
      let targets = (Array.isArray(t.targets) ? t.targets : [t.oe, t.ne]).filter(Boolean);
      targets = targets.filter((d, i) => i === 0 || d !== targets[i - 1]);  // drop consecutive dups
      return { id: t.id || uid('k'), cat: t.cat, name: t.name || '', targets, oe: targets[0] || null, ne: targets[targets.length - 1] || null, dur: t.dur == null ? 1 : t.dur, status: t.status || 'normal', tag: t.tag || '', striped: !!t.striped, note: t.note || '' };
    }),
  };
}
function saveLS() { try { localStorage.setItem(LS_DATA, JSON.stringify(state)); } catch (e) {} }
function loadLS() { try { const s = localStorage.getItem(LS_DATA); return s ? normalize(JSON.parse(s)) : null; } catch (e) { return null; } }
function saveView() { try { localStorage.setItem(LS_VIEW, JSON.stringify({ tab: view.tab, hiddenCats: [...view.hiddenCats], muted: view.muted, nameW: view.nameW })); } catch (e) {} }
function loadView() {
  try { const v = JSON.parse(localStorage.getItem(LS_VIEW) || '{}'); view.tab = v.tab || 'all'; view.hiddenCats = new Set(v.hiddenCats || []); view.muted = !!v.muted; view.nameW = v.nameW || null; } catch (e) {}
}

function setSync(stateName) {
  const map = { saving: 'Saving…', synced: 'Synced', local: 'On this device', error: 'Sync error — retrying' };
  D.sync.dataset.state = stateName;
  const txt = D.sync.querySelector('.txt'); if (txt) txt.textContent = map[stateName] || stateName;
  D.sync.title = stateName === 'local'
    ? 'Cloud sync is off. Edits are saved in this browser. Connect Upstash Redis in Vercel to share across devices.'
    : stateName === 'synced' ? 'Saved to the shared cloud — everyone with the password sees this.'
    : stateName === 'saving' ? 'Saving to the cloud…' : 'Could not reach the cloud; kept a local copy.';
}

// An edit is sent as an "operation" — the intent, not the whole document:
//   { type:'deleteTask', id }        { type:'upsertTask', task }
//   { type:'deleteCat', id }         { type:'upsertCat', cat }
//   { type:'reorderCats', order }    { type:'replaceAll', plan }
// The server applies each op to the CURRENT shared plan, so a stale tab can
// never clobber others' changes or resurrect a deleted item.
const POLL_MS = 10000;      // how often an open tab re-checks the cloud
const opQueue = [];         // ops waiting to be sent, in order
let pumping = false;        // is the queue currently sending?

// Mutate local state -> persist -> re-render, then sync the op to the cloud.
// `op` is optional (omitted for pure view changes, and ignored in local mode).
function commit(toastMsg, op) {
  state.updatedAt = Date.now();
  saveLS();
  render();
  if (toastMsg) toast(toastMsg);
  if (cloudOK && op) enqueueOp(op);
}

function enqueueOp(op) { if (!cloudOK || !op) return; opQueue.push(op); pumpQueue(); }

// Send queued ops one at a time (preserving order), then adopt the authoritative
// plan the server returns so this device converges on the shared version.
async function pumpQueue() {
  if (pumping) return;
  pumping = true;
  setSync('saving');
  let latest = null;
  while (opQueue.length) {
    let r;
    try {
      r = await fetch('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: opQueue[0] }) });
    } catch (e) { return pumpRetry(); }
    if (r.status === 401) { pumping = false; return sessionExpired(); }
    if (!r.ok) return pumpRetry();
    try { const data = await r.json(); latest = data && data.plan; } catch (e) { return pumpRetry(); }
    opQueue.shift();
  }
  pumping = false;
  if (latest) adoptServer(latest);
  setSync('synced');
}
function pumpRetry() { pumping = false; setSync('error'); clearTimeout(saveTimer); saveTimer = setTimeout(pumpQueue, 4000); }

// Replace local state with the server's authoritative plan (skip the re-render
// if an editor is open so the form isn't yanked out from under the user).
function adoptServer(plan) {
  if (!plan || !Array.isArray(plan.categories)) return;
  state = normalize(plan);
  saveLS();
  if (!D.modal.classList.contains('open')) render();
}

function sessionExpired() { toast('Session expired — reloading to sign in…'); setTimeout(() => location.reload(), 1200); }

async function load() {
  loadView();
  Sound.muted = view.muted; updateMuteBtn();
  todayISO = etNow().iso;
  let cloud = null, configured = false;
  try {
    const res = await fetch('/api/plan', { headers: { accept: 'application/json' } });
    const ct = res.headers.get('content-type') || '';
    if (res.status === 401) { /* not logged in; will be handled by page reload elsewhere */ }
    else if (res.status === 503) { configured = false; }
    else if (res.ok && ct.includes('application/json')) {
      const data = await res.json();
      configured = true;
      if (data && Array.isArray(data.categories) && data.categories.length) cloud = normalize(data);
    }
  } catch (e) { /* offline → local */ }

  if (cloud) { state = cloud; cloudOK = true; saveLS(); setSync('synced'); }
  else if (configured) {
    // Cloud is connected but empty: seed it from this device's existing work
    // (so edits made before connecting the cloud aren't lost), else the default.
    state = loadLS() || seedPlan(); cloudOK = true; saveLS(); setSync('saving');
    enqueueOp({ type: 'replaceAll', plan: { version: state.version, updatedAt: state.updatedAt, categories: state.categories, tasks: state.tasks } });
  } else { state = loadLS() || seedPlan(); cloudOK = false; saveLS(); setSync('local'); }

  render({ animate: true });
  startClock();
}

// Pull the shared plan and adopt it if it's newer than ours. Skipped while our
// own edits are in flight or an editor is open, so nothing gets yanked away.
async function syncFromCloud() {
  if (!cloudOK || document.visibilityState !== 'visible') return;
  if (pumping || opQueue.length || D.modal.classList.contains('open')) return;
  try {
    const res = await fetch('/api/plan', { headers: { accept: 'application/json' } });
    const ct = res.headers.get('content-type') || '';
    if (res.status === 401) return sessionExpired();
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json();
      if (data && data.updatedAt && data.updatedAt > (state.updatedAt || 0)) {
        state = normalize(data); saveLS(); render(); toast('Updated');
      }
    }
  } catch (e) {}
}

// Live convergence: poll while the tab is visible, and refetch on refocus.
setInterval(syncFromCloud, POLL_MS);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncFromCloud(); });

// ============================================================================
// Live Eastern clock
// ============================================================================
function startClock() { tickClock(); setInterval(tickClock, 30000); }
function tickClock() {
  const { iso, label } = etNow();
  D.asof.innerHTML = '<span class="live"></span>As of <b>' + label + '</b>';
  if (iso !== todayISO) { todayISO = iso; render(); }       // new day → window may shift
  else { const line = $('#todayLine'); if (line && scale) line.style.left = scale.x(parse(iso)) + 'px'; }
}

// ============================================================================
// Sound (synthesized — no asset files)
// ============================================================================
const Sound = (() => {
  let ctx = null, muted = false;
  const ensure = () => { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return ctx; };
  function blip(freq, dur, type, gain) {
    if (muted) return; const c = ensure(); if (!c) return; if (c.state === 'suspended') c.resume();
    const o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.value = freq;
    o.connect(g); g.connect(c.destination); const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain || 0.035, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }
  return {
    get muted() { return muted; }, set muted(v) { muted = v; },
    tick() { blip(520, 0.05, 'sine', 0.025); },
    toggle() { blip(360, 0.06, 'triangle', 0.03); },
    tab() { blip(460, 0.05, 'sine', 0.022); },
    add() { blip(620, 0.07, 'sine', 0.035); setTimeout(() => blip(840, 0.08, 'sine', 0.03), 55); },
    save() { blip(700, 0.06, 'sine', 0.028); },
    open() { blip(500, 0.045, 'sine', 0.02); },
    delete() { blip(220, 0.12, 'sawtooth', 0.025); },
  };
})();
function updateMuteBtn() { D.muteBtn.textContent = view.muted ? '🔇' : '🔊'; D.muteBtn.title = view.muted ? 'Sound off' : 'Sound on'; }

// ============================================================================
// Toast
// ============================================================================
let toastTimer = null;
function toast(msg) { D.toast.textContent = msg; D.toast.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => D.toast.classList.remove('on'), 2400); }

// ============================================================================
// Wire up + boot
// ============================================================================
D.addBtn.onclick = () => { Sound.open(); openTaskEditor(null, view.tab !== 'all' ? view.tab : undefined); };
D.printBtn.onclick = () => window.print();
// Printing: reflow the timeline to fit the page (so nothing is clipped), then
// restore the on-screen scale. Fires for both the button and Cmd/Ctrl+P.
window.addEventListener('beforeprint', () => { printFit = 620; render(); });
window.addEventListener('afterprint', () => { printFit = 0; render(); });
D.manageBtn.onclick = openBizManager;
D.muteBtn.onclick = () => { view.muted = !view.muted; Sound.muted = view.muted; if (!view.muted) Sound.toggle(); updateMuteBtn(); saveView(); };
let resizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => render(), 150); });

D.sub.textContent = 'Live operating plan · click anything to edit · syncs across everyone with the password';
load();
