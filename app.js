import { state, api, init, onChange, DEMO } from './store.js';
import { ICONS, TOPICS, NAV } from './icons.js';

// ============================================================ helpers
const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (name, size = 16, color = 'currentColor', sw = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0">${ICONS[name] || ''}</svg>`;
const topicOf = (name) => TOPICS.find((t) => t.name === name);
const PRIO = { 3: { label: 'גבוהה', icon: 'p_high', color: '#D64545', pts: 15 }, 2: { label: 'בינונית', icon: 'p_med', color: '#F4A261', pts: 10 }, 1: { label: 'נמוכה', icon: 'p_low', color: '#3B7DD8', pts: 5 } };
const STATUS = { todo: 'לביצוע', doing: 'בתהליך', done: 'בוצע' };
const COLORS = { purple: ['var(--purple)', 'var(--purple-bg)', 'var(--purple-ink)'], blue: ['var(--blue)', 'var(--blue-bg)', 'var(--blue-ink)'] };
const BOTH = ['var(--both)', 'var(--both-bg)', 'var(--both-ink)'];

const member = (id) => state.members.find((m) => m.id === id);
const me = () => state.me;
const partner = () => state.members.find((m) => m.id !== state.me?.id);
const colorsOf = (m) => COLORS[m?.color] || COLORS.purple;
const nameOf = (id) => (id === state.me?.id ? 'את/ה' : member(id)?.display_name || 'מישהו');

function av(m, size = 26) {
  if (!m) return '';
  const [c] = colorsOf(m);
  return `<span class="av" title="${esc(m.display_name)}" style="width:${size}px;height:${size}px;background:${c};font-size:${Math.round(size * 0.42)}px">${esc((m.display_name || '?').trim().charAt(0))}</span>`;
}
function ownerAv(t, size = 26) {
  if (t.assignee) return av(member(t.assignee), size);
  const ms = state.members.length ? state.members : [state.me];
  return `<span class="pair" role="img" aria-label="שנינו">${ms.slice(0, 2).map((m) => av(m, size)).join('')}</span>`;
}
function ownerLabel(t) {
  if (!t.assignee) return 'שנינו';
  return t.assignee === state.me?.id ? 'אני' : member(t.assignee)?.display_name || '';
}

// ---- dates
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoOf(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
function fmtDate(iso) {
  if (!iso) return '';
  const t = today();
  if (iso === t) return 'היום';
  if (iso === addDays(t, 1)) return 'מחר';
  if (iso === addDays(t, -1)) return 'אתמול';
  const d = new Date(iso + 'T12:00:00');
  return `יום ${DAYS[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}`;
}
function fmtAgo(ts) {
  const m = Math.round((Date.now() - new Date(ts)) / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return `לפני ${h === 1 ? 'שעה' : h + ' שעות'}`;
  const d = new Date(ts);
  return `${fmtDate(isoOf(d))}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function bucket(t) {
  if (!t.due_date) return 'none';
  const td = today();
  if (t.due_date < td) return 'overdue';
  if (t.due_date === td) return 'today';
  if (t.due_date <= addDays(td, 6)) return 'week';
  return 'later';
}

// ---- data views
const parents = () => state.tasks.filter((t) => !t.parent_id);
const openParents = () => parents().filter((t) => t.status !== 'done');
const subsOf = (id) => state.tasks.filter((t) => t.parent_id === id);
const commentsOf = (id) => state.comments.filter((c) => c.task_id === id);
function coinWindow() {
  const last = state.redemptions[0]?.created_at || '';
  return state.coins.filter((c) => c.created_at > last);
}
function coinTotals() {
  const w = coinWindow();
  const per = {};
  for (const m of state.members) per[m.id] = 0;
  for (const c of w) per[c.user_id] = (per[c.user_id] || 0) + c.amount;
  return { total: w.reduce((s, c) => s + c.amount, 0), per, events: w };
}

// ============================================================ ui state
const ui = {
  filters: { who: 'all', when: 'all', topic: 'all', prio: 'all' },
  form: null,
  confirmDelete: null,
  authMode: 'signin',
  error: '',
  busy: false,
  pick: null,
};
let toastTimer;
function toast(html) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status'); el.innerHTML = html;
  document.body.appendChild(el);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2600);
}
function heb(m) {
  if (/fetch|network/i.test(m)) return 'אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.';
  if (/invalid login/i.test(m)) return 'המייל או הסיסמה לא נכונים.';
  if (/already registered|already exists/i.test(m)) return 'המייל הזה כבר רשום. עברו ל״כניסה״.';
  if (/at least 6/i.test(m)) return 'הסיסמה צריכה להיות לפחות 6 תווים.';
  if (/rate limit/i.test(m)) return 'יותר מדי ניסיונות. חכו דקה ונסו שוב.';
  return m;
}
async function run(fn) {
  ui.error = ''; ui.busy = true; render();
  try { await fn(); } catch (e) { ui.error = heb(e.message || String(e)); console.error(e); }
  ui.busy = false; render();
}

// ============================================================ pieces
function box(status, big) {
  const cls = `box ${status === 'todo' ? '' : status}${big ? ' big' : ''}`;
  return `<span class="${cls}">${status === 'done' ? ic('check', 12, '#fff', 3) : ''}</span>`;
}
function topicTag(name) {
  const tp = topicOf(name);
  if (!tp) return '';
  return `<span class="tag" style="background:${tp.color}1A">${ic(tp.icon, 14, tp.color, 2.2)}${esc(name)}</span>`;
}
function prioTag(p) {
  const x = PRIO[p] || PRIO[2];
  return `<span class="meta" style="color:var(--ink);font-weight:400">${ic(x.icon, 14, x.color, 2.2)}${x.label}</span>`;
}
function taskCard(t, extra = '') {
  const b = bucket(t), done = t.status === 'done';
  const subs = subsOf(t.id), nc = commentsOf(t.id).length;
  const metas = [];
  if (t.due_date) {
    metas.push(b === 'overdue' && !done
      ? `<span class="meta red">${ic('alert', 14, 'var(--red)')}באיחור · היה צריך עד ${fmtDate(t.due_date)}</span>`
      : `<span class="meta">${ic('calendar', 14)}עד ${fmtDate(t.due_date)}</span>`);
  }
  if (subs.length) {
    const d = subs.filter((s) => s.status === 'done').length;
    metas.push(`<span class="meta">${ic('checks', 14)}${d}/${subs.length} תתי משימות</span>`);
  }
  if (nc) metas.push(`<span class="meta">${ic('chat', 14)}${nc}</span>`);
  if (t.priority === 3 && !done) metas.push(prioTag(3));
  return `<div class="card task ${done ? 'done' : ''}">
    <button class="check" data-action="toggle" data-id="${t.id}" aria-label="${done ? 'החזרה לביצוע' : 'סימון כבוצע'}: ${esc(t.title)}" title="${STATUS[t.status]}">${box(t.status)}</button>
    <div class="body"><a href="#/task/${t.id}" class="stack" style="gap:10px;text-decoration:none;color:inherit">
      <span class="title">${esc(t.title)}</span>
      ${t.topic ? `<span class="tags">${topicTag(t.topic)}</span>` : ''}
      ${metas.length ? `<span class="metas">${metas.join('')}</span>` : ''}
    </a>${extra}</div>
    <span style="align-self:center;display:flex">${ownerAv(t)}</span>
  </div>`;
}
function section(title, count, red, icon) {
  return `<div class="section ${red ? 'red' : ''}">${icon ? ic(icon, 14, red ? 'var(--red)' : 'var(--muted)') : ''}<span>${title}</span><span>${count}</span></div>`;
}
function backBar(href, label, extra = '') {
  return `<div class="bar"><a class="back" href="${href}">${ic('right', 20)}${label}</a>${extra}</div>`;
}
function coin(size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="flex-shrink:0"><circle cx="12" cy="12" r="10" fill="#F4B63F"/><circle cx="12" cy="12" r="7" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/><path d="M12 8l1.2 2.5 2.7.4-2 1.9.5 2.7L12 14.2l-2.4 1.3.5-2.7-2-1.9 2.7-.4z" fill="#fff"/></svg>`;
}
function jar(pct, w = 190) {
  pct = Math.max(0, Math.min(100, pct));
  const top = 172 - Math.round(120 * pct / 100);
  let coins = '';
  for (let y = 166, row = 0; y > top + 6; y -= 9, row++) {
    for (let x = 62; x < 152; x += 18) coins += `<ellipse cx="${x + (row % 2 ? 9 : 0)}" cy="${y}" rx="9" ry="5" fill="#F4B63F" stroke="#B7791F" stroke-width="1.2"/>`;
  }
  const body = 'M58 48h94v6c10 8 16 20 16 36v74c0 10-8 18-18 18H60c-10 0-18-8-18-18V90c0-16 6-28 16-36z';
  return `<svg width="${w}" height="${Math.round(w * 200 / 210)}" viewBox="0 0 210 200" aria-hidden="true">
    <ellipse cx="105" cy="188" rx="80" ry="8" fill="#EBEBF0"/>
    <defs><clipPath id="jarc"><path d="${body}"/></clipPath></defs>
    <g clip-path="url(#jarc)">${coins}</g>
    <path d="${body}" fill="#fff" fill-opacity=".25" stroke="#1B1F1D" stroke-width="2.5"/>
    <rect x="52" y="30" width="106" height="20" rx="6" fill="#1B1F1D"/>
    <path d="M62 70c-5 8-6 16-6 26" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".8"/>
    <g fill="#8F72DA"><path d="M30 60l2.5 5 5 2.5-5 2.5-2.5 5-2.5-5-5-2.5 5-2.5z"/></g>
    <g fill="#0FA9FF"><circle cx="186" cy="110" r="3.5"/><rect x="20" y="130" width="7" height="7" rx="2" transform="rotate(20 23 133)"/></g>
    <circle cx="40" cy="28" r="3" fill="#E36A9B"/>
  </svg>`;
}
const ILL_DONE = `<svg width="200" height="170" viewBox="0 0 200 170" aria-hidden="true"><ellipse cx="100" cy="158" rx="78" ry="8" fill="#EBEBF0"/><g fill="#F4A261"><circle cx="30" cy="40" r="4"/><circle cx="172" cy="56" r="3"/></g><g fill="#0FA9FF"><rect x="160" y="22" width="8" height="8" rx="2" transform="rotate(20 164 26)"/><circle cx="44" cy="92" r="3"/></g><g fill="#8F72DA"><path d="M150 96l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/><path d="M48 18l2 4 4 2-4 2-2 4-2-4-4-2 4-2z"/></g><rect x="58" y="30" width="84" height="116" rx="12" fill="#fff" stroke="#1B1F1D" stroke-width="2.5"/><rect x="80" y="22" width="40" height="16" rx="6" fill="#1B1F1D"/><g stroke-linecap="round" stroke-linejoin="round"><rect x="72" y="54" width="16" height="16" rx="4" fill="#49B64E"/><path d="M76 62l3 3 6-6" stroke="#fff" stroke-width="2.5" fill="none"/><path d="M96 62h32" stroke="#D5D9D4" stroke-width="5"/><rect x="72" y="82" width="16" height="16" rx="4" fill="#49B64E"/><path d="M76 90l3 3 6-6" stroke="#fff" stroke-width="2.5" fill="none"/><path d="M96 90h26" stroke="#D5D9D4" stroke-width="5"/><rect x="72" y="110" width="16" height="16" rx="4" fill="#49B64E"/><path d="M76 118l3 3 6-6" stroke="#fff" stroke-width="2.5" fill="none"/><path d="M96 118h30" stroke="#D5D9D4" stroke-width="5"/></g><path d="M150 158c0-18 5-28 10-34 5 6 10 16 10 34z" fill="#49B64E"/><path d="M160 128v30" stroke="#2E8B3A" stroke-width="2"/><path d="M22 158c0-12 4-20 8-24 4 4 8 12 8 24z" fill="#0FA9FF"/></svg>`;
const ILL_CREATED = `<svg width="230" height="190" viewBox="0 0 230 190" aria-hidden="true"><ellipse cx="115" cy="176" rx="86" ry="9" fill="#EBEBF0"/><g fill="#F4A261"><circle cx="34" cy="52" r="4"/><circle cx="196" cy="70" r="3"/><rect x="186" y="128" width="7" height="7" rx="2" transform="rotate(25 189 131)"/></g><g fill="#0FA9FF"><rect x="176" y="26" width="9" height="9" rx="2" transform="rotate(20 180 30)"/><circle cx="46" cy="118" r="3.5"/><rect x="24" y="150" width="6" height="6" rx="1.5" transform="rotate(-15 27 153)"/></g><g fill="#8F72DA"><path d="M168 100l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/><path d="M56 22l2.5 5 5 2.5-5 2.5-2.5 5-2.5-5-5-2.5 5-2.5z"/></g><g fill="#E36A9B"><circle cx="150" cy="18" r="3"/><circle cx="78" cy="162" r="2.5"/></g><rect x="66" y="40" width="98" height="124" rx="14" fill="#FFFFFF" stroke="#1B1F1D" stroke-width="2.5"/><rect x="92" y="31" width="46" height="17" rx="6" fill="#1B1F1D"/><g stroke-linecap="round"><path d="M84 74h40" stroke="#DDDDE2" stroke-width="5"/><path d="M84 90h28" stroke="#DDDDE2" stroke-width="5"/><path d="M84 106h34" stroke="#DDDDE2" stroke-width="5"/></g><circle cx="140" cy="132" r="26" fill="#49B64E"/><path d="M128 132l8 8 15-16" fill="none" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 176c0-14 4-24 9-29 5 5 9 15 9 29z" fill="#0FA9FF"/><path d="M178 176c0-20 6-31 11-37 5 6 11 17 11 37z" fill="#49B64E"/><path d="M189 145v31" stroke="#2E8B3A" stroke-width="2"/></svg>`;

// ---- bottom nav
const HOUSE = NAV.house, BELL = NAV.bell, GEAR = NAV.gear;
function navIcon(name, on) {
  const w = 'stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"', c = 'var(--ink)';
  let inner = '';
  if (name === 'home') inner = on ? `<path d="${HOUSE}" fill="${c}" stroke="${c}" ${w}/><path d="M12 15v2.5" stroke="#fff" ${w}/>` : `<path d="${HOUSE}" fill="none" stroke="${c}" ${w}/><path d="M12 15v2.5" stroke="${c}" ${w}/>`;
  if (name === 'list') {
    const lines = `<path d="M7.8 9.4l1.4 1.4 2.4-2.6M14 9.6h2.4M7.8 15h8.6" fill="none" stroke="${on ? '#fff' : c}" ${w}/>`;
    inner = `<rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="${on ? c : 'none'}" stroke="${c}" ${w}/>${lines}`;
  }
  if (name === 'bell') inner = `<path d="${BELL}" fill="${on ? c : 'none'}" stroke="${c}" ${w}/><path d="M10 20a2.3 2.3 0 0 0 4 0" fill="none" stroke="${c}" ${w}/>`;
  if (name === 'gear') inner = on ? `<path d="${GEAR}" fill="${c}" stroke="${c}" ${w}/><circle cx="12" cy="12" r="2.6" fill="#fff"/>` : `<path d="${GEAR}" fill="none" stroke="${c}" ${w}/><circle cx="12" cy="12" r="3" fill="none" stroke="${c}" ${w}/>`;
  return `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
}
function nav(active) {
  const unread = updates().filter((u) => u.unread).length;
  const tab = (key, ic2, label, href, left, badge) =>
    `<a class="tab" href="${href}" ${key === active ? 'aria-current="page"' : ''} style="left:${left}%"><span style="position:relative;display:flex">${navIcon(ic2, key === active)}${badge ? `<span class="badge">${badge}</span>` : ''}</span><span>${label}</span></a>`;
  return `<nav class="nav" aria-label="ניווט ראשי">
    <svg class="shape" viewBox="15 20 1180 280" preserveAspectRatio="none" aria-hidden="true"><path d="M15 300H1195V132Q1195 106 1169 103L750 62Q716 58 716 100A111 111 0 0 1 494 100Q494 58 460 62L41 103Q15 106 15 132Z" fill="#fff"/></svg>
    <div class="fill"></div>
    ${tab('home', 'home', 'בית', '#/home', 84.5)}
    ${tab('tasks', 'list', 'משימות', '#/tasks', 64.6)}
    ${tab('updates', 'bell', 'עדכונים', '#/updates', 35.2, unread > 9 ? '9+' : unread || '')}
    ${tab('settings', 'gear', 'הגדרות', '#/settings', 15.2)}
    <a class="plus" href="#/new" aria-label="משימה חדשה">${ic('plus', 26, '#fff', 2)}</a>
  </nav>`;
}

// ============================================================ updates feed
const SEEN_KEY = () => `bayit-seen-${state.me?.id}`;
function updates() {
  if (!state.me) return [];
  let seen = '';
  try { seen = localStorage.getItem(SEEN_KEY()) || ''; } catch {}
  const mine = state.me.id;
  const items = [];
  for (const t of state.tasks) {
    const parent = t.parent_id ? state.tasks.find((p) => p.id === t.parent_id) : null;
    const target = parent || t;
    if (t.created_by && t.created_by !== mine && !t.parent_id)
      items.push({ at: t.created_at, who: t.created_by, icon: 'plus', text: `הוסיף/ה את <b>${esc(t.title)}</b>${t.assignee === mine ? ' ושייך/ה אלייך' : ''}`, href: `#/task/${target.id}` });
    if (t.completed_by && t.completed_by !== mine && t.completed_at)
      items.push({ at: t.completed_at, who: t.completed_by, icon: 'checks', text: `סימן/ה כבוצע <b>${esc(t.title)}</b>${parent ? ` (ב״${esc(parent.title)}״)` : ''}`, href: `#/task/${target.id}` });
  }
  for (const c of state.comments) {
    if (c.author_id === mine) continue;
    const t = state.tasks.find((x) => x.id === c.task_id);
    items.push({ at: c.created_at, who: c.author_id, icon: 'chat', text: `הגיב/ה על <b>${esc(t?.title || '')}</b>: ״${esc(c.body.slice(0, 80))}״`, href: `#/task/${c.task_id}` });
  }
  for (const r of state.redemptions) {
    items.push({ at: r.created_at, who: r.chosen_by, icon: 't_gift', text: `בחר/ה את ההפתעה: <b>${esc(r.surprise)}</b> 🎉`, href: '#/rewards' });
  }
  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return items.slice(0, 50).map((u) => ({ ...u, unread: u.at > seen && u.who !== mine }));
}

// ============================================================ screens
function screenAuth() {
  const up = ui.authMode === 'signup';
  return `<div class="screen no-nav pad" style="justify-content:center;gap:22px">
    <div class="stack" style="align-items:center;text-align:center;gap:8px">${ILL_DONE}
      <h1 style="font-size:26px;font-weight:500">הבית שלנו</h1>
      <p class="muted">משימות הבית, ביחד</p></div>
    <div class="seg" role="tablist">
      <button class="opt" role="tab" aria-pressed="${!up}" data-action="auth-mode" data-mode="signin">כניסה</button>
      <button class="opt" role="tab" aria-pressed="${up}" data-action="auth-mode" data-mode="signup">הרשמה</button>
    </div>
    <form class="stack" data-form="auth">
      ${up ? `<div class="field"><label for="a-name">איך קוראים לך?</label><input class="input" id="a-name" name="name" required autocomplete="given-name"></div>` : ''}
      <div class="field"><label for="a-email">מייל</label><input class="input" id="a-email" name="email" type="email" dir="ltr" required autocomplete="email"></div>
      <div class="field"><label for="a-pw">סיסמה</label><input class="input" id="a-pw" name="password" type="password" dir="ltr" minlength="6" required autocomplete="${up ? 'new-password' : 'current-password'}"></div>
      ${ui.error ? `<p class="err">${esc(ui.error)}</p>` : ''}
      <button class="btn" ${ui.busy ? 'disabled' : ''}>${up ? 'יצירת חשבון' : 'כניסה'}</button>
    </form>
  </div>`;
}

function screenOnboard() {
  return `<div class="screen no-nav pad" style="gap:22px;padding-top:40px">
    <div class="stack" style="gap:6px"><h1 style="font-size:24px;font-weight:500">היי ${esc(state.me?.display_name || '')} 👋</h1>
    <p class="muted">כדי להתחיל, יוצרים בית חדש, או מצטרפים לבית שבן/בת הזוג כבר יצר/ה.</p></div>
    <form class="card stack" style="padding:16px" data-form="create-house">
      <h2 style="font-size:17px;font-weight:600">בית חדש</h2>
      <div class="field"><label for="h-name">שם הבית</label><input class="input" id="h-name" name="name" value="הבית שלנו"></div>
      <button class="btn" ${ui.busy ? 'disabled' : ''}>יצירת הבית</button>
    </form>
    <form class="card stack" style="padding:16px" data-form="join-house">
      <h2 style="font-size:17px;font-weight:600">יש לי קוד הזמנה</h2>
      <div class="field"><label for="h-code">קוד בן 6 תווים</label><input class="input" id="h-code" name="code" dir="ltr" required style="text-transform:uppercase;letter-spacing:3px;text-align:center" maxlength="6"></div>
      <button class="btn secondary" ${ui.busy ? 'disabled' : ''}>הצטרפות</button>
    </form>
    ${ui.error ? `<p class="err">${esc(ui.error)}</p>` : ''}
    <button class="link-btn" data-action="signout" style="color:var(--muted)">יציאה מהחשבון</button>
  </div>`;
}

function screenHome() {
  const td = today();
  const h = new Date().getHours();
  const greet = h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
  const all = parents();
  const todays = all.filter((t) => t.due_date === td || (t.status === 'done' && t.completed_at && isoOf(new Date(t.completed_at)) === td && t.due_date && t.due_date <= td));
  const doneToday = todays.filter((t) => t.status === 'done').length;
  const open = openParents();
  const overdue = open.filter((t) => bucket(t) === 'overdue').length;
  const week = open.filter((t) => ['today', 'week'].includes(bucket(t))).length;
  const whenever = open.filter((t) => !t.due_date).length;
  const pct = todays.length ? doneToday / todays.length : 0;
  const R = 30, C = 2 * Math.PI * R;
  const { total, per } = coinTotals();
  const p = partner();
  const lastDone = all.filter((t) => t.status === 'done' && t.completed_at).sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1))[0];
  const owners = [
    { label: 'אני', av: av(me(), 24), n: open.filter((t) => t.assignee === me()?.id).length, c: colorsOf(me())[0] },
    ...(p ? [{ label: p.display_name, av: av(p, 24), n: open.filter((t) => t.assignee === p.id).length, c: colorsOf(p)[0] }] : []),
    { label: 'שנינו', av: `<span class="pair">${state.members.slice(0, 2).map((m) => av(m, 24)).join('')}</span>`, n: open.filter((t) => !t.assignee).length, c: 'var(--both)' },
  ];
  const max = Math.max(1, ...owners.map((o) => o.n));
  const attention = open.filter((t) => ['overdue', 'today'].includes(bucket(t))).sort((a, b) => (a.due_date > b.due_date ? 1 : -1)).slice(0, 3);
  const d = new Date();
  return `<div class="screen">
    <header class="top"><div class="stack" style="gap:2px"><h1 style="font-size:22px">${greet}, ${esc(me()?.display_name)}</h1>
      <span class="muted small">יום ${DAYS[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1} · ${esc(state.household?.name)}</span></div></header>
    <div class="pad stack" style="gap:16px">
      ${!p ? `<a href="#/settings" class="card row" style="padding:14px;text-decoration:none;color:var(--ink);background:var(--both-bg);border-color:transparent">${ic('users', 20, 'var(--both-ink)')}<span class="grow"><b style="font-weight:600;color:var(--both-ink)">הזמנת בן/בת הזוג</b><br><span class="small">קוד ההזמנה שלכם: <b dir="ltr" style="letter-spacing:2px">${esc(state.household?.invite_code)}</b></span></span>${ic('back', 16, 'var(--muted)')}</a>` : ''}
      <a href="#/tasks" class="card row" style="padding:18px;gap:16px;text-decoration:none;color:var(--ink);border-radius:18px">
        <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label="${doneToday} מתוך ${todays.length} הושלמו" style="flex-shrink:0;transform:scaleX(-1)"><circle cx="42" cy="42" r="${R}" fill="none" stroke="#E3F5FF" stroke-width="9"/><circle cx="42" cy="42" r="${R}" fill="none" stroke="#0FA9FF" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C * pct} ${C}" transform="rotate(-90 42 42)"/><text x="42" y="48" text-anchor="middle" font-size="18" font-family="Rubik" fill="#1B1F1D" transform="scale(-1 1) translate(-84 0)">${doneToday}/${todays.length}</text></svg>
        <span class="stack" style="gap:4px"><span class="muted small">היום</span><span style="font-size:18px;font-weight:500">${todays.length ? `${doneToday} מתוך ${todays.length} משימות הושלמו` : 'אין משימות להיום'}</span>
        ${lastDone ? `<span class="muted small">${esc(lastDone.completed_by === me()?.id ? 'השלמת' : (member(lastDone.completed_by)?.display_name || '') + ' השלים/ה')} ״${esc(lastDone.title)}״</span>` : ''}</span></a>
      <div class="row" style="gap:8px">
        <a class="stat ${overdue ? 'alert' : ''}" href="#/tasks?when=overdue"><b>${overdue}</b><span class="small">באיחור</span></a>
        <a class="stat" href="#/tasks?when=week"><b>${week}</b><span class="small muted">השבוע</span></a>
        <a class="stat" href="#/whenever"><b>${whenever}</b><span class="small muted">מתישהו</span></a>
      </div>
      <a href="#/rewards" class="card stack" style="padding:16px;gap:10px;text-decoration:none;color:var(--ink);border-radius:16px">
        <span class="row">${coin(28)}<span class="grow stack" style="gap:2px"><span style="font-size:15px;font-weight:600">קופת ההפתעות</span><span class="muted small">${total >= 100 ? 'הגעתם ל-100! זמן לבחור הפתעה 🎉' : `עוד ${100 - total} מטבעות להפתעה`}</span></span><span style="font-size:18px;font-weight:600">${total}<span class="muted" style="font-size:13px;font-weight:400">/100</span></span>${ic('back', 16, 'var(--muted)')}</span>
        <span class="progress">${state.members.map((m) => `<span style="width:${Math.min(100, per[m.id] || 0)}%;background:${colorsOf(m)[0]}"></span>`).join('')}</span>
      </a>
      <section class="stack" style="gap:8px"><h2 class="section" style="padding-top:0">מי אחראי על מה</h2>
        <div class="list-card" style="padding:6px 14px">
          ${owners.map((o) => `<div class="row" style="min-height:40px">${o.av}<span style="width:64px;font-size:14px;font-weight:500">${esc(o.label)}</span><span class="grow progress" style="background:var(--grey)"><span style="width:${(o.n / max) * 100}%;background:${o.c};border-radius:4px"></span></span><b style="width:20px;text-align:center;font-weight:500">${o.n}</b></div>`).join('')}
          <span class="muted small" style="padding:8px 0;border-top:1px solid var(--line)">${open.length} משימות פתוחות בבית</span>
        </div></section>
      ${attention.length ? `<section class="stack" style="gap:8px"><div class="row"><h2 class="section grow" style="padding-top:0">דורש תשומת לב</h2><a href="#/tasks" class="small" style="text-decoration:none">לכל המשימות</a></div>${attention.map(taskCard).join('')}</section>` : ''}
    </div>
  </div>${nav('home')}`;
}

function applyFilters(list) {
  const f = ui.filters, m = me()?.id, p = partner()?.id;
  return list.filter((t) => {
    if (f.who === 'me' && t.assignee !== m) return false;
    if (f.who === 'partner' && t.assignee !== p) return false;
    if (f.who === 'both' && t.assignee) return false;
    if (f.topic !== 'all' && t.topic !== f.topic) return false;
    if (f.prio !== 'all' && String(t.priority) !== f.prio) return false;
    const b = bucket(t);
    if (f.when === 'overdue' && b !== 'overdue') return false;
    if (f.when === 'today' && b !== 'today') return false;
    if (f.when === 'week' && !['today', 'week'].includes(b)) return false;
    return true;
  });
}
function selectBox(key, label, options) {
  const v = ui.filters[key];
  const cur = options.find((o) => o[0] === v)?.[1] || 'הכל';
  return `<label class="select ${v !== 'all' ? 'on' : ''}"><span class="lbl">${label}:</span><span class="val">${esc(cur)}</span>${ic('down', 16, 'var(--muted)')}
    <select data-filter="${key}" aria-label="${label}">${options.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
}
function screenTasks() {
  const p = partner();
  const list = applyFilters(parents());
  const open = list.filter((t) => t.status !== 'done');
  const groups = [
    ['overdue', 'באיחור', true, 'alert'], ['today', 'היום'], ['week', 'השבוע'], ['later', 'מאוחר יותר'],
  ];
  const doneRecent = list.filter((t) => t.status === 'done' && t.completed_at && Date.now() - new Date(t.completed_at) < 3 * 864e5)
    .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1)).slice(0, 6);
  const noDate = open.filter((t) => !t.due_date).length;
  const any = ui.filters.who !== 'all' || ui.filters.when !== 'all' || ui.filters.topic !== 'all' || ui.filters.prio !== 'all';
  let body = '';
  for (const [key, title, red, icon] of groups) {
    const g = open.filter((t) => bucket(t) === key).sort((a, b) => (a.due_date > b.due_date ? 1 : -1));
    if (g.length) body += section(title, g.length, red, icon) + g.map(taskCard).join('');
  }
  if (!body && !doneRecent.length) {
    body = `<div class="empty">${ILL_DONE}<h2 style="font-size:20px;font-weight:500">${any ? 'אין משימות שמתאימות לסינון' : 'הכל בוצע! 🎉'}</h2><p class="muted">${any ? '' : 'אין משימות פתוחות עם תאריך. אפשר להציץ ב״מתישהו״.'}</p></div>`;
  }
  return `<div class="screen">
    <header class="top"><div class="stack" style="gap:2px"><span class="eyebrow">${esc(state.household?.name)}</span><h1>משימות</h1></div>
      <div class="filters">
        ${selectBox('who', 'מי אחראי', [['all', 'הכל'], ['me', 'שלי'], ...(p ? [['partner', `של ${p.display_name}`]] : []), ['both', 'משותפות']])}
        ${selectBox('when', 'מתי', [['all', 'הכל'], ['overdue', 'באיחור'], ['today', 'היום'], ['week', 'השבוע']])}
        ${selectBox('topic', 'נושא', [['all', 'הכל'], ...TOPICS.map((t) => [t.name, t.name])])}
        ${selectBox('prio', 'עדיפות', [['all', 'הכל'], ['3', 'גבוהה'], ['2', 'בינונית'], ['1', 'נמוכה']])}
      </div>
      ${any ? `<button class="link-btn" data-action="clear-filters" style="align-self:flex-start;padding:0">${ic('x', 14, 'var(--link)', 2.5)}ניקוי סינון</button>` : ''}
    </header>
    <main class="pad stack">
      ${body}
      ${noDate && ui.filters.when === 'all' ? `<a href="#/whenever" class="row" style="gap:14px;padding:16px;border-radius:14px;background:var(--grey);color:var(--ink);text-decoration:none;margin-top:4px"><span class="ico-sq" style="background:#fff;width:40px;height:40px;border-radius:12px">${ic('infinity', 20)}</span><span class="grow stack" style="gap:2px"><b style="font-weight:600">מתישהו</b><span class="muted small">${noDate} משימות בלי תאריך יעד</span></span>${ic('back', 16, 'var(--muted)')}</a>` : ''}
      ${doneRecent.length ? section('בוצעו לאחרונה', doneRecent.length) + doneRecent.map(taskCard).join('') : ''}
      <a href="#/topics" class="link-btn" style="align-self:center;text-decoration:none">${ic('list', 16, 'var(--link)')}לפי נושאים</a>
    </main>
  </div>${nav('tasks')}`;
}

function screenWhenever() {
  const list = openParents().filter((t) => !t.due_date);
  return `<div class="screen">${backBar('#/tasks', 'משימות')}
    <header class="pad stack" style="gap:6px;margin-bottom:14px"><h1 style="font-size:24px;font-weight:500">מתישהו</h1><p class="muted small">משימות בלי תאריך יעד. הן אף פעם לא באיחור.</p></header>
    <main class="pad stack">${list.length ? list.map((t) => taskCard(t, `<a href="#/edit/${t.id}?focus=date" class="link-btn" style="padding:0;text-decoration:none;align-self:flex-start">${ic('calendar', 14, 'var(--link)')}הוספת תאריך יעד</a>`)).join('') : `<div class="empty">${ILL_DONE}<p class="muted">אין כרגע משימות בלי תאריך</p></div>`}</main>
  </div>${nav('tasks')}`;
}

function screenTopics() {
  const ps = parents();
  return `<div class="screen">${backBar('#/tasks', 'משימות')}
    <header class="pad" style="margin-bottom:14px"><h1 style="font-size:24px;font-weight:500">נושאים</h1></header>
    <main class="pad"><div class="list-card">${TOPICS.map((tp) => {
      const all = ps.filter((t) => t.topic === tp.name), open = all.filter((t) => t.status !== 'done').length;
      const right = all.length && !open ? `<span class="small" style="color:#1E8A47">${ic('check', 14, '#1E8A47', 2.5)} הושלם</span>` : `<span class="muted small">${open || ''}</span>`;
      return `<a class="list-row" href="#/topic/${encodeURIComponent(tp.name)}"><span class="ico-sq" style="background:${tp.color}1A">${ic(tp.icon, 18, tp.color, 1.8)}</span><span class="grow" style="font-size:15px">${esc(tp.name)}</span>${right}${ic('back', 16, 'var(--muted)')}</a>`;
    }).join('')}</div></main>
  </div>${nav('tasks')}`;
}
function screenTopic(name) {
  const tp = topicOf(name);
  const all = parents().filter((t) => t.topic === name);
  const open = all.filter((t) => t.status !== 'done'), done = all.filter((t) => t.status === 'done');
  return `<div class="screen">${backBar('#/topics', 'נושאים')}
    <header class="pad row" style="margin-bottom:14px;gap:12px">${tp ? `<span class="ico-sq" style="background:${tp.color}1A;width:44px;height:44px">${ic(tp.icon, 22, tp.color, 1.8)}</span>` : ''}<span class="stack" style="gap:2px"><h1 style="font-size:22px;font-weight:500">${esc(name)}</h1><span class="muted small">${open.length} פתוחות · ${done.length} בוצעו</span></span></header>
    <main class="pad stack">
      ${!open.length && done.length ? `<div class="card row" style="padding:14px;background:#E6F5E7;border-color:transparent">${ic('checks', 20, '#1E8A47')}<b style="font-weight:600;color:#1E6B3A">כל המשימות בנושא הזה הושלמו!</b></div>` : ''}
      ${open.map(taskCard).join('')}
      ${done.length ? section('בוצעו', done.length) + done.map(taskCard).join('') : ''}
      ${!all.length ? `<div class="empty"><p class="muted">אין עדיין משימות בנושא הזה</p></div>` : ''}
      <a class="dashed" href="#/new?topic=${encodeURIComponent(name)}" style="text-decoration:none">${ic('plus', 18, 'var(--link)')}משימה חדשה בנושא</a>
    </main>
  </div>${nav('tasks')}`;
}

function screenTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return `<div class="screen">${backBar('#/tasks', 'משימות')}<div class="empty"><p class="muted">המשימה לא נמצאה (אולי נמחקה)</p></div></div>${nav('tasks')}`;
  const parent = t.parent_id ? state.tasks.find((x) => x.id === t.parent_id) : null;
  const subs = parent ? [] : subsOf(t.id);
  const subDone = subs.filter((s) => s.status === 'done').length;
  const cs = commentsOf(t.id);
  const shared = !t.assignee;
  const o = shared ? BOTH : colorsOf(member(t.assignee));
  const row = (icon, title, value) => `<a class="list-row" href="#/edit/${t.id}"><span class="ico-sq">${ic(icon, 18)}</span><span class="grow stack" style="gap:2px"><span class="muted" style="font-size:13px;font-weight:500">${title}</span><span style="font-size:15px;font-weight:500">${value}</span></span>${ic('back', 16, 'var(--muted)')}</a>`;
  const confirm = ui.confirmDelete === t.id;
  return `<div class="screen no-nav">
    ${backBar(parent ? `#/task/${parent.id}` : '#/tasks', parent ? esc(parent.title) : 'משימות', `<a class="icon-btn" href="#/edit/${t.id}" aria-label="עריכה">${ic('pencil', 20)}</a>`)}
    <main class="pad stack" style="gap:18px">
      <div class="stack" style="gap:8px">${parent ? `<span class="muted small">תת משימה</span>` : ''}<h1 style="font-size:26px;font-weight:500;line-height:1.25">${esc(t.title)}</h1></div>
      <a href="#/edit/${t.id}" class="row" style="padding:14px;border-radius:16px;background:${o[1]};text-decoration:none;color:var(--ink);gap:12px">${ownerAv(t, 34)}<span class="grow stack" style="gap:2px"><b style="font-weight:600;color:${o[2]}">${shared ? 'משימה משותפת · שניכם' : `באחריות ${esc(ownerLabel(t))}`}</b><span class="small" style="line-height:1.4">${shared ? 'כל אחד יכול לעדכן ולסמן כבוצע. כשאחד מסיים, השני רואה את זה מיד.' : 'לחיצה לשינוי האחראי'}</span></span>${ic('back', 16, o[2])}</a>
      <div class="field"><span class="label">סטטוס</span><div class="seg" role="radiogroup" aria-label="סטטוס">
        ${['todo', 'doing', 'done'].map((s) => `<button class="opt" role="radio" aria-checked="${t.status === s}" data-action="status" data-id="${t.id}" data-status="${s}">${box(s)}${STATUS[s]}</button>`).join('')}
      </div>${t.completed_at && t.status === 'done' ? `<span class="muted small" style="padding:0 4px">בוצע ע״י ${esc(nameOf(t.completed_by))} · ${fmtAgo(t.completed_at)}</span>` : ''}</div>
      <div class="list-card">
        ${row('calendar', 'תאריך יעד', t.due_date ? fmtDate(t.due_date) : 'מתישהו (בלי תאריך)')}
        ${row('flag', 'עדיפות', prioTag(t.priority))}
        ${!parent ? row('list', 'נושא', t.topic ? topicTag(t.topic) : '<span class="muted">בלי נושא</span>') : ''}
      </div>
      ${!parent ? `<section class="card stack" style="padding:14px 14px 4px;gap:0;border-radius:16px">
        <div class="row" style="padding-bottom:10px"><h2 style="font-size:16px;font-weight:500">תתי משימות</h2>${subs.length ? `<span class="muted small">${subDone} מתוך ${subs.length} בוצעו</span>` : ''}</div>
        ${subs.length ? `<div class="progress" style="margin-bottom:10px;background:var(--grey)"><span style="width:${(subDone / subs.length) * 100}%;background:var(--green);border-radius:4px"></span></div>` : ''}
        ${subs.map((s) => `<div class="row" style="min-height:52px;border-top:1px solid var(--line);gap:12px"><button class="check" style="margin:0 -12px" data-action="toggle" data-id="${s.id}" aria-label="סימון: ${esc(s.title)}">${box(s.status, true)}</button><a href="#/task/${s.id}" class="grow" style="font-size:15px;color:${s.status === 'done' ? 'var(--muted)' : 'var(--ink)'};text-decoration:${s.status === 'done' ? 'line-through' : 'none'}">${esc(s.title)}${s.due_date ? `<br><span class="muted" style="font-size:12.5px">עד ${fmtDate(s.due_date)}</span>` : ''}</a>${ownerAv(s, 24)}</div>`).join('')}
        <form class="row" data-form="add-sub" data-id="${t.id}" style="min-height:52px;border-top:${subs.length ? '1px solid var(--line)' : '0'};gap:12px">${ic('plus', 20, 'var(--link)')}<input name="title" class="grow" placeholder="הוספת תת משימה" aria-label="הוספת תת משימה" style="border:0;outline:none;background:none;font-size:15px;height:44px"></form>
        <p class="muted" style="font-size:12px;padding:0 0 10px">תתי משימות לא מזכות במטבעות, רק המשימה השלמה.</p>
      </section>` : ''}
      <section class="stack" style="gap:14px"><h2 class="row" style="font-size:18px;font-weight:500;gap:8px">${ic('chat', 18)}תגובות<span class="muted" style="font-size:14px">${cs.length || ''}</span></h2>
        ${cs.map((c) => { const a = member(c.author_id); return `<article class="comment ${c.author_id === me()?.id ? 'mine' : ''} row" style="align-items:flex-start;gap:10px">${av(a, 32)}<div class="grow stack" style="gap:4px"><span class="row" style="gap:8px;align-items:baseline"><b style="font-size:14px">${esc(a?.display_name)}</b><time class="muted" style="font-size:12px">${fmtAgo(c.created_at)}</time></span><p>${esc(c.body)}</p></div></article>`; }).join('')}
        <form class="row" data-form="comment" data-id="${t.id}" style="padding:6px;padding-inline-start:14px;border-radius:14px;background:#fff;border:1px solid var(--field)"><input name="body" class="grow" placeholder="הוספת תגובה או עדכון…" aria-label="הוספת תגובה" style="border:0;outline:none;background:none;font-size:15px;height:40px"><button class="icon-btn" aria-label="שליחה" style="background:var(--ink);border-radius:12px"><span style="display:flex;transform:scaleX(-1)">${ic('send', 18, '#fff')}</span></button></form>
      </section>
      <button class="btn danger" data-action="delete" data-id="${t.id}">${ic('trash', 18, 'var(--red)')}${confirm ? 'בטוח? לחיצה נוספת תמחק' : 'מחיקת המשימה'}</button>
    </main>
    <div class="pad" style="padding-top:16px;position:sticky;bottom:0;padding-bottom:calc(16px + var(--safe-bottom));background:linear-gradient(transparent, var(--ground) 30%)">
      <button class="btn" data-action="toggle" data-id="${t.id}">${t.status === 'done' ? `${ic('redo', 20, '#fff')}החזרה לביצוע` : `${ic('check', 20, '#fff', 2.6)}סימון כבוצע`}</button>
    </div>
  </div>`;
}

function newForm(existing, params) {
  if (existing) return { id: existing.id, parent_id: existing.parent_id, title: existing.title, assignee: existing.assignee || 'both', due_date: existing.due_date || '', hasDate: !!existing.due_date, priority: existing.priority, topic: existing.topic || '', subs: [] };
  return { title: '', assignee: 'both', due_date: today(), hasDate: true, priority: 2, topic: params.get('topic') || '', subs: [] };
}
function screenForm(id, params) {
  const existing = id ? state.tasks.find((t) => t.id === id) : null;
  if (id && !existing) return `<div class="screen no-nav">${backBar('#/tasks', 'משימות')}<div class="empty"><p class="muted">המשימה לא נמצאה</p></div></div>`;
  const key = id || 'new';
  if (!ui.form || ui.form._key !== key) ui.form = { ...newForm(existing, params), _key: key };
  const f = ui.form, p = partner(), td = today();
  const isSub = !!f.parent_id;
  const owners = [['me', me()], ...(p ? [['partner', p]] : []), ['both', null]];
  const ownerVal = (k, m) => (k === 'both' ? 'both' : m.id);
  const dow = new Date().getDay(); const fri = addDays(td, (5 - dow + 7) % 7 || 7);
  return `<div class="screen no-nav">
    ${backBar(existing ? `#/task/${existing.id}` : '#/tasks', 'ביטול')}
    <form class="pad stack" style="gap:20px" data-form="task" novalidate>
      <h1 style="font-size:24px;font-weight:500">${existing ? 'עריכת משימה' : 'משימה חדשה'}</h1>
      <div class="field"><label for="f-title">מה צריך לעשות?</label><input class="input" id="f-title" data-bind="title" value="${esc(f.title)}" placeholder="למשל: להרכיב את העריסה" maxlength="200" required></div>
      <div class="field"><span class="label">מי אחראי?</span><div class="seg" role="radiogroup">
        ${owners.map(([k, m]) => { const v = ownerVal(k, m); return `<button type="button" class="opt" role="radio" aria-checked="${f.assignee === v}" data-action="set" data-key="assignee" data-val="${v}">${k === 'both' ? `<span class="pair">${state.members.slice(0, 2).map((x) => av(x, 22)).join('')}</span>שנינו` : `${av(m, 22)}${k === 'me' ? 'אני' : esc(m.display_name)}`}</button>`; }).join('')}
      </div></div>
      <div class="field"><div class="row"><span class="label grow" style="padding:0 4px">תאריך יעד</span><button type="button" class="switch" role="switch" aria-checked="${f.hasDate}" aria-label="תאריך יעד" data-action="set" data-key="hasDate" data-val="${!f.hasDate}"><span class="track"><span class="knob"></span></span></button></div>
        ${f.hasDate ? `<div class="chips">${[['היום', td], ['מחר', addDays(td, 1)], ['שישי', fri], ['בעוד שבוע', addDays(td, 7)]].map(([l, v]) => `<button type="button" class="chip" aria-pressed="${f.due_date === v}" data-action="set" data-key="due_date" data-val="${v}">${l}</button>`).join('')}</div>
        <input class="input" type="date" id="f-date" data-bind="due_date" value="${esc(f.due_date)}" aria-label="תאריך יעד">` : `<p class="muted small" style="padding:0 4px">בלי תאריך, המשימה תעבור ל״מתישהו״ ולא תסומן כבאיחור.</p>`}
      </div>
      <div class="field"><span class="label">עדיפות${isSub ? '' : ' (קובעת כמה מטבעות היא שווה)'}</span><div class="seg" role="radiogroup">
        ${[1, 2, 3].map((n) => `<button type="button" class="opt" role="radio" aria-checked="${f.priority === n}" data-action="set" data-key="priority" data-val="${n}">${ic(PRIO[n].icon, 16, PRIO[n].color, 2.2)}${PRIO[n].label}${isSub ? '' : `<span class="muted small" style="display:inline-flex;align-items:center;gap:2px">${PRIO[n].pts}${coin(13)}</span>`}</button>`).join('')}
      </div></div>
      ${isSub ? '' : `<div class="field"><label for="f-topic">נושא</label><select class="input" id="f-topic" data-bind="topic"><option value="">בלי נושא</option>${TOPICS.map((t) => `<option ${f.topic === t.name ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>`}
      ${existing || isSub ? '' : `<div class="field"><span class="label">תתי משימות (לא חובה)</span>
        ${f.subs.map((s, i) => `<div class="row card" style="padding:0 14px;min-height:48px">${box('todo')}<span class="grow">${esc(s)}</span><button type="button" class="icon-btn" aria-label="הסרה" data-action="rm-sub" data-i="${i}">${ic('x', 16, 'var(--muted)')}</button></div>`).join('')}
        <div class="row" style="gap:8px"><input class="input" id="f-sub" placeholder="למשל: לקנות מברגים" aria-label="תת משימה חדשה"><button type="button" class="btn secondary" style="width:auto;padding:0 16px;height:48px" data-action="add-sub-draft">הוספה</button></div></div>`}
      ${ui.error ? `<p class="err">${esc(ui.error)}</p>` : ''}
      <button class="btn" ${ui.busy ? 'disabled' : ''}>${existing ? 'שמירה' : 'יצירת משימה'}</button>
    </form>
  </div>`;
}

function screenCreated(id) {
  const t = state.tasks.find((x) => x.id === id);
  const p = partner();
  const who = !t ? '' : !t.assignee ? (p ? `${esc(p.display_name)} רואה אותה עכשיו אצלו/ה.` : '') : t.assignee !== me()?.id ? `${esc(member(t.assignee)?.display_name)} רואה אותה עכשיו אצלו/ה.` : 'היא מחכה לך ברשימה.';
  return `<div class="screen no-nav pad" style="text-align:center;gap:14px">
    <div class="bar" style="padding:12px 0 0;justify-content:flex-start"><a class="icon-btn" href="#/tasks" aria-label="סגירה">${ic('x', 22)}</a></div>
    <div class="grow stack" style="align-items:center;justify-content:center;gap:14px">${ILL_CREATED}
      <h1 style="font-size:24px;font-weight:500">המשימה נוצרה!</h1>
      <p class="muted" style="max-width:300px;line-height:1.5">${who}</p>
      ${t ? `<div class="card stack" style="align-self:stretch;padding:16px;text-align:start;gap:12px"><div class="row"><b class="grow" style="font-size:16px;font-weight:600">${esc(t.title)}</b>${ownerAv(t, 28)}</div>${t.topic ? `<span class="tags">${topicTag(t.topic)}</span>` : ''}<span class="metas">${t.due_date ? `<span class="meta">${ic('calendar', 14)}עד ${fmtDate(t.due_date)}</span>` : `<span class="meta">${ic('infinity', 14)}מתישהו</span>`}${prioTag(t.priority)}</span></div>` : ''}
    </div>
    <div class="stack" style="gap:10px;padding-bottom:calc(12px + var(--safe-bottom))"><a class="btn" href="#/tasks">חזרה למשימות</a><a class="btn secondary" href="#/new">${ic('plus', 18)}יצירת משימה נוספת</a></div>
  </div>`;
}

function screenUpdates() {
  const items = updates();
  const html = items.length ? `<div class="list-card">${items.map((u) => {
    const m = member(u.who);
    return `<a class="list-row" href="${u.href}" style="align-items:flex-start;padding:14px 0">${av(m, 36)}<span class="grow stack" style="gap:4px"><span style="font-size:14.5px;line-height:1.45"><b style="font-weight:600">${esc(m?.display_name || '')}</b> ${u.text}</span><span class="muted" style="font-size:12px">${fmtAgo(u.at)}</span></span>${u.unread ? `<span aria-label="לא נקרא" style="width:9px;height:9px;border-radius:50%;background:var(--link);flex-shrink:0;margin-top:6px"></span>` : ''}</a>`;
  }).join('')}</div>` : `<div class="empty">${ic('bell', 40, 'var(--muted)', 1.5)}<p class="muted">כאן יופיעו עדכונים כש${esc(partner()?.display_name || 'בן/בת הזוג')} מוסיף/ה, מסיים/ת או מגיב/ה על משימות.</p></div>`;
  // סימון כנקרא אחרי שהמסך הוצג
  setTimeout(() => { try { localStorage.setItem(SEEN_KEY(), new Date().toISOString()); } catch {} }, 1500);
  return `<div class="screen"><header class="top"><h1 style="font-size:22px">עדכונים</h1></header><main class="pad">${html}</main></div>${nav('updates')}`;
}

function screenRewards() {
  const { total, per, events } = coinTotals();
  const p = partner();
  const ranked = [...state.members].sort((a, b) => (per[b.id] || 0) - (per[a.id] || 0));
  const leader = ranked[0], second = ranked[1];
  const tie = second && (per[leader.id] || 0) === (per[second.id] || 0);
  const lead = second ? (per[leader.id] || 0) - (per[second.id] || 0) : 0;
  const unlocked = total >= 100;
  const iPick = unlocked && (tie || leader?.id === me()?.id);
  const lastR = state.redemptions[0];
  const ideaChip = (i) => `<span class="chip" style="height:38px">${ic('t_gift', 16, '#4F46E5')}${esc(i.label)}<button class="icon-btn" style="width:24px;height:24px;margin-inline-start:-2px" aria-label="מחיקת ${esc(i.label)}" data-action="del-idea" data-id="${i.id}">${ic('x', 13, 'var(--muted)', 2.4)}</button></span>`;
  let pickHtml = '';
  if (unlocked) {
    pickHtml = iPick ? `<section class="card stack" style="padding:16px;gap:10px;border:2px solid var(--ink)">
      <h2 style="font-size:18px;font-weight:600">🎉 ${tie ? 'שוויון! מי שבוחר/ת ראשון/ה' : `${esc(me()?.display_name)}, צברת הכי הרבה - את/ה בוחר/ת!`}</h2>
      <div role="radiogroup" class="stack" style="gap:8px">${state.ideas.map((i) => `<button class="opt" role="radio" aria-checked="${ui.pick === i.label}" data-action="pick" data-val="${esc(i.label)}" style="justify-content:flex-start">${ic('t_gift', 18, '#4F46E5')}${esc(i.label)}</button>`).join('')}</div>
      <input class="input" id="pick-other" placeholder="או משהו אחר…" aria-label="הפתעה אחרת" value="${esc(ui.pick && !state.ideas.some((i) => i.label === ui.pick) ? ui.pick : '')}">
      ${ui.error ? `<p class="err">${esc(ui.error)}</p>` : ''}
      <button class="btn" data-action="redeem" ${ui.busy ? 'disabled' : ''}>זאת ההפתעה!</button>
      <span class="muted small" style="text-align:center">אחרי הבחירה הקופה מתאפסת ומתחילים לחסוך להפתעה הבאה</span></section>`
      : `<section class="card row" style="padding:16px;gap:12px;background:var(--both-bg);border-color:transparent">${av(leader, 36)}<span class="grow"><b style="font-weight:600">הגעתם ל-100! 🎉</b><br><span class="small">${esc(leader.display_name)} צבר/ה הכי הרבה, ולכן הוא/היא בוחר/ת את ההפתעה.</span></span></section>`;
  }
  return `<div class="screen">${backBar('#/home', 'בית')}
    <main class="pad stack" style="gap:18px">
      <div class="stack" style="align-items:center;text-align:center;gap:6px">${jar(total)}<h1 style="font-size:24px;font-weight:500">קופת ההפתעות</h1>
        <p class="muted" style="font-size:14.5px">${unlocked ? 'הקופה מלאה!' : `עוד <b style="color:var(--ink);font-weight:600">${100 - total} מטבעות</b> ואתם פותחים הפתעה`}</p></div>
      ${pickHtml}
      <div class="stack" style="gap:8px"><div class="row" style="justify-content:space-between;align-items:baseline"><span class="row" style="gap:6px;font-size:22px;font-weight:600">${total}${coin(20)}</span><span class="muted small">מתוך 100</span></div>
        <span class="progress" style="height:12px;border-radius:6px">${state.members.map((m) => `<span style="width:${Math.min(100, per[m.id] || 0)}%;background:${colorsOf(m)[0]}"></span>`).join('')}</span>
        <span class="row small muted" style="gap:14px">${state.members.map((m) => `<span class="row" style="gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${colorsOf(m)[0]}"></span>${esc(m.display_name)} ${per[m.id] || 0}</span>`).join('')}</span></div>
      ${p && !unlocked ? `<section class="stack" style="gap:8px"><h2 class="section" style="padding-top:0">מי בוחר את ההפתעה?</h2><div class="row" style="padding:14px;border-radius:14px;background:${colorsOf(leader)[1]};gap:12px">${av(leader, 36)}<span class="grow stack" style="gap:2px"><b style="font-weight:600;color:${colorsOf(leader)[2]}">${tie ? 'כרגע יש שוויון' : `${esc(leader.display_name)} מוביל/ה ב-${lead} מטבעות`}</b><span class="small" style="line-height:1.45">מי שצבר יותר מטבעות כשהקופה מגיעה ל-100 בוחר את ההפתעה</span></span></div></section>` : ''}
      <section class="stack" style="gap:8px"><h2 class="section" style="padding-top:0">רעיונות להפתעה · משותף לשניכם</h2>
        <div class="chips">${state.ideas.map(ideaChip).join('')}</div>
        <form class="row" data-form="idea" style="gap:8px"><input class="input" name="label" placeholder="רעיון חדש…" aria-label="רעיון חדש" maxlength="80"><button class="btn secondary" style="width:auto;padding:0 16px;height:48px">${ic('plus', 16)}הוספה</button></form></section>
      <section class="stack" style="gap:8px"><h2 class="section" style="padding-top:0">איך מרוויחים</h2>
        <div class="row" style="gap:8px">${[1, 2, 3].map((n) => `<div class="card stack" style="flex:1;padding:12px;gap:6px;font-size:13px">${prioTag(n)}<span class="row" style="gap:4px;font-size:16px;font-weight:600">${PRIO[n].pts}${coin(15)}</span></div>`).join('')}</div>
        <span class="muted" style="font-size:12.5px;line-height:1.5;padding:0 4px">רק משימה שלמה מזכה במטבעות, לא תת משימה. משימה משותפת נותנת מטבעות לשניכם.</span></section>
      ${events.length ? `<section class="list-card"><h2 class="muted" style="font-size:13px;font-weight:500;padding:12px 0">הרווחתם לאחרונה</h2>${events.slice(0, 12).map((c) => `<div class="list-row">${av(member(c.user_id), 26)}<span class="grow stack" style="gap:2px"><span style="font-size:14.5px">${esc(c.title)}</span><span class="muted" style="font-size:12.5px">${fmtAgo(c.created_at)}</span></span><span class="row" style="gap:4px;font-weight:600;color:var(--gold-ink)">+${c.amount}${coin(16)}</span></div>`).join('')}</section>` : ''}
      ${lastR ? `<p class="muted small" style="text-align:center">ההפתעה האחרונה: <b>${esc(lastR.surprise)}</b> (בחר/ה ${esc(member(lastR.chosen_by)?.display_name || '')})</p>` : ''}
    </main></div>${nav('home')}`;
}

function screenSettings() {
  const h = state.household;
  return `<div class="screen"><header class="top"><h1 style="font-size:22px">הגדרות</h1></header>
    <main class="pad stack" style="gap:20px">
      <section class="stack" style="gap:8px"><h2 class="section" style="padding-top:0">חברי הבית</h2><div class="list-card">
        ${state.members.map((m) => `<div class="list-row">${av(m, 36)}<span class="grow stack" style="gap:2px"><b style="font-weight:600">${esc(m.display_name)}${m.id === me()?.id ? ' (את/ה)' : ''}</b></span></div>`).join('')}
        <div class="list-row stack" style="align-items:stretch;gap:10px;padding:14px 0"><span class="stack" style="gap:2px"><span>קוד הזמנה</span><span class="muted small">שולחים לבן/בת הזוג, והם מזינים אותו אחרי ההרשמה</span></span><span class="row"><b dir="ltr" class="grow" style="letter-spacing:4px;font-size:20px;font-weight:600">${esc(h?.invite_code)}</b><button class="btn secondary" style="width:auto;height:40px;padding:0 14px" data-action="share-code">${ic('copy', 16)}שיתוף</button></span></div>
      </div></section>
      <form class="stack" style="gap:8px" data-form="rename"><h2 class="section" style="padding-top:0">השם שלי</h2><div class="row" style="gap:8px"><input class="input" name="name" value="${esc(me()?.display_name)}" aria-label="השם שלי" maxlength="30"><button class="btn secondary" style="width:auto;padding:0 16px;height:48px">שמירה</button></div></form>
      <section class="stack" style="gap:8px"><h2 class="section" style="padding-top:0">התקנה בטלפון</h2><div class="card" style="padding:14px;font-size:14px;line-height:1.6">
        <b>אייפון:</b> Safari ← כפתור השיתוף ← ״הוסף למסך הבית״<br><b>אנדרואיד:</b> Chrome ← ⋮ ← ״התקנת אפליקציה״</div></section>
      <section class="stack" style="gap:8px"><h2 class="section" style="padding-top:0">בקרוב</h2><div class="card muted" style="padding:14px;font-size:14px">חיבור ליומן גוגל והתראות לטלפון</div></section>
      ${ui.error ? `<p class="err">${esc(ui.error)}</p>` : ''}
      <button class="btn danger" data-action="signout">יציאה מהחשבון</button>
      <p class="muted small" style="text-align:center">${esc(state.session?.email || '')}</p>
    </main></div>${nav('settings')}`;
}

// ============================================================ router + render
function route() {
  const [path, qs] = (location.hash.slice(1) || '/home').split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(qs || '') };
}
let lastKey = '';
function render() {
  const { parts, params } = route();
  const key = location.hash;
  let html;
  if (!state.ready) html = '<div class="spinner" role="status" aria-label="טוען"></div>';
  else if (!state.session) html = screenAuth();
  else if (!state.household) html = screenOnboard();
  else {
    const [a, b] = parts;
    if (a === 'tasks' && params.get('when') && key !== lastKey) ui.filters = { who: 'all', when: params.get('when'), topic: 'all', prio: 'all' };
    if (!['new', 'edit'].includes(a)) ui.form = null;
    if (a !== 'task' || b !== ui.confirmDelete) ui.confirmDelete = null;
    html = a === 'tasks' ? screenTasks()
      : a === 'whenever' ? screenWhenever()
      : a === 'topics' ? screenTopics()
      : a === 'topic' ? screenTopic(decodeURIComponent(b || ''))
      : a === 'task' ? screenTask(b)
      : a === 'new' ? screenForm(null, params)
      : a === 'edit' ? screenForm(b, params)
      : a === 'created' ? screenCreated(b)
      : a === 'updates' ? screenUpdates()
      : a === 'rewards' ? screenRewards()
      : a === 'settings' ? screenSettings()
      : screenHome();
  }
  const scroll = key === lastKey ? window.scrollY : 0;
  const focusId = document.activeElement?.id;
  $app.innerHTML = (DEMO ? '<div class="demo">מצב הדגמה · הנתונים לא נשמרים</div>' : '') + html;
  window.scrollTo(0, scroll);
  if (key !== lastKey) {
    ui.error = '';
    if (parts[0] === 'new') setTimeout(() => document.getElementById('f-title')?.focus(), 50);
    if (params.get('focus') === 'date') setTimeout(() => document.getElementById('f-date')?.focus(), 50);
  } else if (focusId) document.getElementById(focusId)?.focus();
  lastKey = key;
}

// ============================================================ events
async function toggle(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  const next = t.status === 'done' ? 'todo' : 'done';
  await run(() => api.updateTask(id, { status: next }));
  if (next === 'done' && !t.parent_id && !ui.error) {
    const pts = PRIO[t.priority]?.pts || 10;
    toast(`${coin(18)} +${pts} מטבעות${t.assignee ? '' : ' לכל אחד'}`);
  }
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action, id = el.dataset.id;
  if (el.tagName === 'BUTTON' && el.type !== 'submit') e.preventDefault();
  if (a === 'toggle') return toggle(id);
  if (a === 'status') return run(() => api.updateTask(id, { status: el.dataset.status }));
  if (a === 'auth-mode') { ui.authMode = el.dataset.mode; ui.error = ''; return render(); }
  if (a === 'signout') return run(() => api.signOut());
  if (a === 'clear-filters') { ui.filters = { who: 'all', when: 'all', topic: 'all', prio: 'all' }; if (location.hash.includes('?')) location.hash = '#/tasks'; return render(); }
  if (a === 'set') {
    const k = el.dataset.key; let v = el.dataset.val;
    if (k === 'priority') v = Number(v);
    if (k === 'hasDate') { v = v === 'true'; if (v && !ui.form.due_date) ui.form.due_date = today(); }
    ui.form[k] = v; return render();
  }
  if (a === 'add-sub-draft') {
    const inp = document.getElementById('f-sub'); const v = inp.value.trim();
    if (v) { ui.form.subs.push(v); render(); document.getElementById('f-sub')?.focus(); }
    return;
  }
  if (a === 'rm-sub') { ui.form.subs.splice(Number(el.dataset.i), 1); return render(); }
  if (a === 'delete') {
    if (ui.confirmDelete !== id) { ui.confirmDelete = id; return render(); }
    const t = state.tasks.find((x) => x.id === id);
    await run(() => api.deleteTask(id));
    location.hash = t?.parent_id ? `#/task/${t.parent_id}` : '#/tasks';
    return;
  }
  if (a === 'del-idea') return run(() => api.deleteIdea(id));
  if (a === 'pick') { ui.pick = el.dataset.val; const o = document.getElementById('pick-other'); if (o) o.value = ''; return render(); }
  if (a === 'redeem') {
    const other = document.getElementById('pick-other')?.value.trim();
    const choice = other || ui.pick;
    if (!choice) { ui.error = 'בוחרים רעיון או כותבים משהו אחר'; return render(); }
    await run(() => api.redeem(choice));
    if (!ui.error) { ui.pick = null; toast(`🎉 ההפתעה: ${esc(choice)}`); }
    return;
  }
  if (a === 'share-code') {
    const code = state.household?.invite_code;
    const text = `הצטרפ/י לבית שלנו באפליקציה: ${location.origin + location.pathname}\nקוד הזמנה: ${code}`;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('הקוד הועתק'); } } catch {}
  }
});

document.addEventListener('input', (e) => {
  const b = e.target.dataset?.bind;
  if (b && ui.form) ui.form[b] = e.target.value;
});
document.addEventListener('change', (e) => {
  const f = e.target.dataset?.filter;
  if (f) { ui.filters[f] = e.target.value; render(); }
  const b = e.target.dataset?.bind;
  if (b && ui.form) { ui.form[b] = e.target.value; if (b === 'due_date') render(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'f-sub') { e.preventDefault(); document.querySelector('[data-action="add-sub-draft"]')?.click(); }
});

document.addEventListener('submit', async (e) => {
  const form = e.target; const kind = form.dataset.form;
  if (!kind) return;
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(form).entries());
  if (kind === 'auth') {
    return run(() => (ui.authMode === 'signup' ? api.signUp(fd.email.trim(), fd.password, fd.name.trim()) : api.signIn(fd.email.trim(), fd.password)));
  }
  if (kind === 'create-house') return run(() => api.createHousehold(fd.name.trim()));
  if (kind === 'join-house') return run(() => api.joinHousehold(fd.code.trim()));
  if (kind === 'comment') {
    const body = (fd.body || '').trim(); if (!body) return;
    return run(() => api.addComment(form.dataset.id, body));
  }
  if (kind === 'add-sub') {
    const title = (fd.title || '').trim(); if (!title) return;
    await run(() => api.addTask({ title, parent_id: form.dataset.id, assignee: null, priority: 2 }));
    document.querySelector('[data-form="add-sub"] input')?.focus();
    return;
  }
  if (kind === 'idea') {
    const label = (fd.label || '').trim(); if (!label) return;
    return run(() => api.addIdea(label));
  }
  if (kind === 'rename') {
    const n = (fd.name || '').trim(); if (!n) return;
    await run(() => api.rename(n)); if (!ui.error) toast('נשמר');
    return;
  }
  if (kind === 'task') {
    const f = ui.form;
    const pending = document.getElementById('f-sub')?.value.trim();
    if (pending) f.subs.push(pending);
    if (!f.title.trim()) { ui.error = 'צריך לכתוב מה המשימה'; return render(); }
    const row = {
      title: f.title.trim(),
      assignee: f.assignee === 'both' ? null : f.assignee,
      due_date: f.hasDate && f.due_date ? f.due_date : null,
      priority: f.priority,
      topic: f.parent_id ? null : f.topic || null,
    };
    let created;
    await run(async () => {
      if (f.id) await api.updateTask(f.id, row);
      else {
        created = await api.addTask(row);
        for (const s of f.subs) await api.addTask({ title: s, parent_id: created.id, assignee: null, priority: 2 });
      }
    });
    if (ui.error) return;
    ui.form = null;
    location.hash = f.id ? `#/task/${f.id}` : `#/created/${created.id}`;
  }
});

window.addEventListener('hashchange', render);
onChange(render);
render();
init().catch((e) => { ui.error = e.message; state.ready = true; render(); });

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
