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
const REPEAT = { daily: 'כל יום', weekly: 'כל שבוע', biweekly: 'כל שבועיים', monthly: 'כל חודש' };
function repeatLabel(t) {
  if (!t.repeat) return '';
  if (!t.due_date) return REPEAT[t.repeat];
  const d = new Date(t.due_date + 'T12:00:00');
  if (t.repeat === 'weekly') return `כל יום ${DAYS[d.getDay()]}`;
  if (t.repeat === 'biweekly') return `כל שבועיים, ביום ${DAYS[d.getDay()]}`;
  if (t.repeat === 'monthly') return `כל חודש, ב-${d.getDate()}`;
  return REPEAT[t.repeat];
}
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
  if (m.avatar_url) return `<img class="av" src="${esc(m.avatar_url)}" alt="${esc(m.display_name)}" title="${esc(m.display_name)}" style="width:${size}px;height:${size}px;object-fit:cover;background:${c}">`;
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
  filters: { who: [], when: [], prio: [] },
  openFilter: null,
  statusOpen: null,
  menuOpen: null,
  addSub: null,
  wOwner: 'all',
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
  if (!t.due_date && !done) metas.push(`<span class="meta" style="font-weight:400">${ic('calendar', 14)}בלי תאריך יעד</span>`);
  if (t.due_date) {
    metas.push(b === 'overdue' && !done
      ? `<span class="meta red">${ic('alert', 14, 'var(--red)')}באיחור · היה צריך עד ${fmtDate(t.due_date)}</span>`
      : `<span class="meta">${ic('calendar', 14)}עד ${fmtDate(t.due_date)}</span>`);
  }
  if (t.repeat) metas.push(`<span class="meta">${ic('repeat', 14)}${repeatLabel(t)}</span>`);
  if (subs.length) {
    const d = subs.filter((s) => s.status === 'done').length;
    metas.push(`<span class="meta">${ic('checks', 14)}${d}/${subs.length} תתי משימות</span>`);
  }
  if (nc) metas.push(`<span class="meta">${ic('chat', 14)}${nc === 1 ? 'תגובה אחת' : nc + ' תגובות'}</span>`);
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
  const tab = (key, ic2, label, href, cx, badge) =>
    `<a class="tab" href="${href}" ${key === active ? 'aria-current="page"' : ''} style="left:${cx}%"><span style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center">${navIcon(ic2, key === active)}${badge ? `<span class="badge">${badge}</span>` : ''}</span><span>${label}</span></a>`;
  return `<nav class="nav" aria-label="ניווט ראשי"><div class="nav-in">
    <svg class="shape" viewBox="15 20 1180 280" aria-hidden="true"><path d="M15 300H1195V132Q1195 106 1169 103L750 62Q716 58 716 100A111 111 0 0 1 494 100Q494 58 460 62L41 103Q15 106 15 132Z" fill="#fff"/></svg>
    ${tab('home', 'home', 'בית', '#/home', 84.5)}
    ${tab('tasks', 'list', 'משימות', '#/tasks', 64.6)}
    ${tab('updates', 'bell', 'עדכונים', '#/updates', 35.2, unread > 9 ? '9+' : unread || '')}
    ${tab('settings', 'gear', 'הגדרות', '#/settings', 15.2)}
    <a class="plus" href="#/new" aria-label="משימה חדשה">${ic('plus', 26, '#fff', 2)}</a>
  </div><div class="fill"></div></nav>`;
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
      items.push({ at: t.created_at, who: t.created_by, icon: 'plus', short: `הוסיף/ה את <strong style="font-weight:700">${esc(t.title)}</strong>`, sub: t.assignee === mine ? 'שויכה אלייך' : '', text: `הוסיף/ה את <b>${esc(t.title)}</b>${t.assignee === mine ? ' ושייך/ה אלייך' : ''}`, href: `#/task/${target.id}` });
    if (t.completed_by && t.completed_by !== mine && t.completed_at)
      items.push({ at: t.completed_at, who: t.completed_by, icon: 'checks', short: `סימן/ה כבוצעה את <strong style="font-weight:700">${esc(t.title)}</strong>`, sub: parent ? `תת משימה ב״${esc(parent.title)}״` : '', text: `סימן/ה כבוצע <b>${esc(t.title)}</b>${parent ? ` (ב״${esc(parent.title)}״)` : ''}`, href: `#/task/${target.id}` });
  }
  for (const c of state.comments) {
    if (c.author_id === mine) continue;
    const t = state.tasks.find((x) => x.id === c.task_id);
    items.push({ at: c.created_at, who: c.author_id, icon: 'chat', short: `הגיב/ה על <strong style="font-weight:700">${esc(t?.title || '')}</strong>`, sub: `״${esc(c.body.slice(0, 80))}״`, text: `הגיב/ה על <b>${esc(t?.title || '')}</b>: ״${esc(c.body.slice(0, 80))}״`, href: `#/task/${c.task_id}` });
  }
  for (const r of state.redemptions) {
    items.push({ at: r.created_at, who: r.chosen_by, icon: 't_gift', short: `בחר/ה את ההפתעה: <strong style="font-weight:700">${esc(r.surprise)}</strong> 🎉`, sub: '', text: `בחר/ה את ההפתעה: <b>${esc(r.surprise)}</b> 🎉`, href: '#/rewards' });
  }
  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return items.slice(0, 50).map((u) => ({ ...u, unread: u.at > seen && u.who !== mine }));
}

// ============================================================ screens (לפי העיצוב)
const C = { ink: '#1B1F1D', muted: '#5B635F', line: '#E4E7E2', field: '#C9CEC9', ground: '#F8F8FA', grey: '#F3F3F7', link: '#0FA9FF', red: '#B42318' };
const STATUS_PILL = {
  todo: { fg: '#0FA9FF', bg: '#E3F5FF', ink: '#06639A' },
  doing: { fg: '#F0954A', bg: '#FFF3E8', ink: '#8F4A12' },
  done: { fg: '#49B64E', bg: '#E6F5E7', ink: '#1E6B3A' },
};
const MONTHS = ['בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני', 'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'];
function fmtLong(iso) {
  const d = new Date(iso + 'T12:00:00');
  return `יום ${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function statusPill(s) {
  const p = STATUS_PILL[s];
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:999px;background:${p.bg};color:${p.fg};font-weight:600"><span style="width:8px;height:8px;border-radius:50%;background:${p.fg}"></span>${STATUS[s]}</span>`;
}
function householdLine() {
  const ms = state.members.map((m) => m.display_name);
  return ms.length > 1 ? `הבית של ${esc(ms[0])} ו${esc(ms[1])}` : esc(state.household?.name || 'הבית שלנו');
}
function chipLabel(t) {
  if (!t.assignee) return 'אחריות משותפת';
  return t.assignee === me()?.id ? 'באחריותי' : `באחריות ${member(t.assignee)?.display_name || ''}`;
}
function ownerChip(t, size = 26) {
  return `<span role="img" aria-label="${esc(chipLabel(t))}" title="${esc(chipLabel(t))}" style="display:inline-flex;align-items:center;flex-shrink:0">${ownerAv(t, size)}</span>`;
}
const backLink = (href, label) => `<a href="${href}" style="align-self:flex-start;display:inline-flex;align-items:center;gap:2px;height:44px;margin-inline-start:-8px;padding:0 8px;color:${C.ink};text-decoration:none;font-size:15px;font-weight:600">${ic('right', 20, C.ink)}${label}</a>`;
const sectionHead = (title, link) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px"><h2 style="margin:0;font-size:13px;font-weight:500;color:${C.muted}">${title}</h2>${link || ''}</div>`;
const smallLink = (href, label) => `<a href="${href}" style="font-size:13px;font-weight:400;color:${C.link};text-decoration:none;display:inline-flex;align-items:center;min-height:32px">${label}</a>`;
const syncPill = () => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#1E6B3A;background:#E5F3EA;padding:5px 10px;border-radius:999px"><span style="width:7px;height:7px;border-radius:50%;background:#1E8A47"></span>מסונכרן</span>`;
function switchBtn(on, label, action, extra = '') {
  return `<button type="button" role="switch" aria-checked="${on}" aria-label="${esc(label)}" ${action} ${extra} style="width:44px;height:44px;border:0;padding:0;background:none;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0"><span style="width:36px;height:14px;border-radius:7px;background:#A9B0AB;position:relative;display:block"><span style="position:absolute;top:-3px;${on ? 'left:0;background:#1B1F1D' : 'right:0;background:#FFFFFF'};width:20px;height:20px;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></span></span></button>`;
}
const soon = `<span style="font-size:11px;font-weight:600;color:#8F4A12;background:#FFF3E8;padding:2px 8px;border-radius:999px">בקרוב</span>`;

// ---------------------------------------------------------------- auth / onboarding
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

// ---------------------------------------------------------------- home
function compactRow(t, first) {
  const b = bucket(t);
  const meta = b === 'overdue'
    ? `<span style="display:inline-flex;align-items:center;gap:4px;color:${C.red};font-weight:400">${ic('alert', 13, C.red)}באיחור · מאז ${fmtDate(t.due_date).replace('יום ', 'יום ').split(',')[0]}</span>`
    : `<span style="display:inline-flex;align-items:center;gap:4px;color:${C.muted};font-weight:400">${ic('calendar', 13, C.muted)}עד ${fmtDate(t.due_date)}</span>`;
  return `<div style="display:flex;align-items:center;gap:10px;padding:12px 0;${first ? '' : `border-top:1px solid ${C.line};`}"><span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><a href="#/task/${t.id}" style="color:${C.ink};text-decoration:none;font-size:14.5px;font-weight:600">${esc(t.title)}</a><span style="font-size:12.5px">${meta}</span></span>${ownerChip(t)}</div>`;
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
  const R = 31, CIRC = 2 * Math.PI * R;
  const { total, per } = coinTotals();
  const p = partner();
  const lastDone = all.filter((t) => t.status === 'done' && t.completed_at).sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1))[0];
  const owners = [
    { label: 'אני', chip: ownerChip({ assignee: me()?.id }, 26), n: open.filter((t) => t.assignee === me()?.id).length, c: colorsOf(me())[0] },
    ...(p ? [{ label: p.display_name, chip: ownerChip({ assignee: p.id }, 26), n: open.filter((t) => t.assignee === p.id).length, c: colorsOf(p)[0] }] : []),
    { label: 'שנינו', chip: ownerChip({ assignee: null }, 26), n: open.filter((t) => !t.assignee).length, c: 'var(--both)' },
  ];
  const attention = open.filter((t) => ['overdue', 'today'].includes(bucket(t))).sort((a, b) => (a.due_date > b.due_date ? 1 : -1)).slice(0, 4);
  const acts = updates().slice(0, 2);
  const d = new Date();
  const doneBy = lastDone ? (lastDone.completed_by === me()?.id ? 'השלמת' : `${member(lastDone.completed_by)?.display_name || ''} השלים/ה`) : '';
  const stat = (n, label, href, alert) => `<a href="${href}" style="flex:1;display:flex;flex-direction:column;gap:4px;padding:14px;border-radius:14px;background:${alert ? '#FDECEA' : '#FFFFFF'};border:1px solid ${alert ? '#F8D3CF' : C.line};color:${C.ink};text-decoration:none"><span style="font-size:24px;font-weight:500;line-height:1;${alert ? 'color:#C9382F' : ''}">${n}</span><span style="font-size:13px;color:${alert ? '#C9382F' : C.muted}">${label}</span></a>`;
  return `<div class="screen">
    <header style="padding:20px 20px 8px;display:flex;flex-direction:column;gap:2px">
      <h1 style="margin:0;font-size:20px;font-weight:500">${greet}, ${esc(me()?.display_name)}</h1>
      <span style="font-size:13px;color:${C.muted}">יום ${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} · ${householdLine()}</span>
    </header>
    <main style="padding:8px 20px 0;display:flex;flex-direction:column;gap:20px">
      ${!p ? `<a href="#/invite" style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:16px;background:#D9F0ED;border:1px solid #A9DBD4;text-decoration:none;color:${C.ink}">${ic('users', 20, '#0B5F57')}<span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:15px;font-weight:700;color:#0B5F57">הזמנת בן/בת הזוג</span><span style="font-size:13px;color:#134E4A">קוד ההזמנה: <b dir="ltr" style="letter-spacing:2px">${esc(state.household?.invite_code)}</b></span></span>${ic('back', 16, '#0B5F57')}</a>` : ''}
      <div style="display:flex;flex-direction:column;gap:10px">
        <a href="#/tasks?when=today" style="display:flex;align-items:center;gap:16px;padding:18px;border-radius:18px;background:#FFFFFF;border:1px solid ${C.line};color:${C.ink};text-decoration:none">
          <span style="position:relative;display:flex;align-items:center;justify-content:center"><svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true"><circle cx="38" cy="38" r="${R}" fill="none" stroke="#E3F5FF" stroke-width="8"/><circle cx="38" cy="38" r="${R}" fill="none" stroke="#0FA9FF" stroke-width="8" stroke-linecap="round" stroke-dasharray="${CIRC * pct} ${CIRC}" transform="rotate(-90 38 38)"/></svg><span style="position:absolute;font-size:20px;font-weight:500">${doneToday}/${todays.length}</span></span>
          <span style="flex:1;display:flex;flex-direction:column;gap:4px"><span style="font-size:13px;font-weight:500;color:${C.muted}">היום</span><span style="font-size:18px;font-weight:500">${todays.length ? `${doneToday} מתוך ${todays.length} משימות הושלמו` : 'אין משימות להיום'}</span>
          ${lastDone ? `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:${C.muted}">${av(member(lastDone.completed_by), 20)}${esc(doneBy)} ״${esc(lastDone.title)}״</span>` : ''}</span></a>
        <div style="display:flex;gap:10px">${stat(overdue, 'באיחור', '#/tasks?when=overdue', overdue > 0)}${stat(week, 'השבוע', '#/tasks?when=week')}${stat(whenever, 'מתישהו', '#/whenever')}</div>
      </div>
      <a href="#/rewards" style="display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:16px;background:#FFFFFF;border:1px solid ${C.line};color:${C.ink};text-decoration:none">
        <div style="display:flex;align-items:center;gap:10px">${coin(28)}<span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:15px;font-weight:600">קופת ההפתעות</span><span style="font-size:12.5px;color:${C.muted}">${total >= 100 ? 'הגעתם ל-100! זמן לבחור הפתעה 🎉' : `עוד ${100 - total} מטבעות להפתעה`}</span></span><span style="font-size:18px;font-weight:600">${total}<span style="font-size:13px;font-weight:400;color:${C.muted}">/100</span></span>${ic('back', 16, C.muted)}</div>
        <div aria-hidden="true" style="height:8px;border-radius:4px;background:#EBEBF0;overflow:hidden;display:flex">${state.members.map((m) => `<span style="width:${Math.min(100, per[m.id] || 0)}%;background:${colorsOf(m)[0]}"></span>`).join('')}</div>
      </a>
      <section style="display:flex;flex-direction:column;gap:8px">${sectionHead('מי אחראי על מה')}
        <div style="background:#FFFFFF;border:1px solid ${C.line};border-radius:14px;padding:4px 14px"><div style="display:flex;flex-direction:column;gap:12px;padding:12px 0">
          ${owners.map((o) => `<div style="display:flex;align-items:center;gap:10px"><span style="width:92px;flex-shrink:0;display:flex;align-items:center;gap:8px">${o.chip}<span style="font-size:13px;font-weight:600">${esc(o.label)}</span></span><span style="flex:1;height:8px;border-radius:4px;background:${C.grey};overflow:hidden;display:flex"><span style="width:${open.length ? (o.n / open.length) * 100 : 0}%;height:100%;background:${o.c};border-radius:4px"></span></span><span style="width:20px;text-align:left;font-size:14px;font-weight:700">${o.n}</span></div>`).join('')}
          <span style="font-size:12.5px;color:${C.muted}">${open.length} משימות פתוחות בבית</span>
        </div></div></section>
      ${attention.length ? `<section style="display:flex;flex-direction:column;gap:8px">${sectionHead('דורש תשומת לב', smallLink('#/tasks', 'לכל המשימות'))}<div style="background:#FFFFFF;border:1px solid ${C.line};border-radius:14px;padding:4px 14px">${attention.map((t, i) => compactRow(t, i === 0)).join('')}</div></section>` : ''}
      ${acts.length ? `<section style="display:flex;flex-direction:column;gap:8px">${sectionHead('פעילות אחרונה', smallLink('#/updates', 'לכל העדכונים'))}<div style="background:#FFFFFF;border:1px solid ${C.line};border-radius:14px;padding:4px 14px">${acts.map((u, i) => `<a href="${u.href}" style="display:flex;align-items:flex-start;gap:10px;padding:12px 0;${i ? `border-top:1px solid ${C.line};` : ''}color:${C.ink};text-decoration:none">${av(member(u.who), 28)}<span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:14px;line-height:1.45"><strong style="font-weight:700">${esc(member(u.who)?.display_name || '')}</strong> ${u.short}</span><time style="font-size:12px;color:${C.muted}">${fmtAgo(u.at)}</time></span></a>`).join('')}</div></section>` : ''}
    </main>
  </div>${nav('home')}`;
}

// ---------------------------------------------------------------- tasks + filters
const FILTERS = {
  who: { label: 'מי אחראי', opts: () => [['me', 'שלי'], ...(partner() ? [['partner', `של ${partner().display_name}`]] : []), ['both', 'משותפות']] },
  when: { label: 'מתי', opts: () => [['overdue', 'באיחור'], ['today', 'היום'], ['week', 'השבוע'], ['later', 'מאוחר יותר']] },
  prio: { label: 'עדיפות', opts: () => [['3', 'גבוהה'], ['2', 'בינונית'], ['1', 'נמוכה']] },
};
function matchOne(key, v, t) {
  if (key === 'who') return v === 'me' ? t.assignee === me()?.id : v === 'partner' ? t.assignee === partner()?.id : !t.assignee;
  if (key === 'when') { const b = bucket(t); return v === 'week' ? ['today', 'week'].includes(b) : b === v; }
  if (key === 'prio') return String(t.priority) === v;
  return true;
}
function applyFilters(list, skip) {
  return list.filter((t) => Object.keys(FILTERS).every((k) => k === skip || !ui.filters[k].length || ui.filters[k].some((v) => matchOne(k, v, t))));
}
function dropdown(key, side) {
  const f = FILTERS[key], sel = ui.filters[key], open = ui.openFilter === key;
  const labels = f.opts().filter(([k]) => sel.includes(k)).map(([, l]) => l);
  const val = labels.length ? labels.join(', ') : 'הכל';
  const base = openParents();
  const items = f.opts().map(([k, l]) => {
    const on = sel.includes(k);
    const n = applyFilters(base, key).filter((t) => matchOne(key, k, t)).length;
    const boxHtml = on ? `<span style="width:18px;height:18px;border-radius:5px;background:${C.ink};display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic('check', 12, '#FFFFFF', 3)}</span>` : `<span style="width:18px;height:18px;border-radius:5px;border:1.5px solid #A9B0AB;box-sizing:border-box;flex-shrink:0"></span>`;
    const lbl = key === 'prio' ? `<span style="display:inline-flex;align-items:center;gap:6px">${ic(PRIO[k].icon, 16, PRIO[k].color, 2)}${l}</span>` : esc(l);
    return `<button type="button" role="option" aria-selected="${on}" data-action="filter-toggle" data-key="${key}" data-val="${k}" style="display:flex;align-items:center;gap:10px;height:40px;padding:0 12px;border:0;background:${on ? C.grey : '#FFFFFF'};border-radius:8px;font-size:14px;font-weight:${on ? 700 : 500};color:${C.ink};cursor:pointer;text-align:start;width:100%">${boxHtml}<span style="flex:1">${lbl}</span><span style="font-size:12px;color:${C.muted}">${n}</span></button>`;
  }).join('');
  const menu = open ? `<div role="listbox" aria-multiselectable="true" aria-label="${f.label}" style="position:absolute;top:44px;${side}:0;width:220px;padding:6px;background:#FFFFFF;border:1px solid ${C.line};border-radius:12px;box-shadow:0 10px 28px rgba(27,31,29,0.16);display:flex;flex-direction:column;gap:2px;z-index:30">${items}
    <div style="display:flex;align-items:center;gap:8px;margin-top:4px;padding:6px 4px 0;border-top:1px solid ${C.line}"><button type="button" data-action="filter-clear" data-key="${key}" style="height:36px;padding:0 8px;border:0;background:none;color:${C.link};font-size:13px;font-weight:400;display:inline-flex;align-items:center;gap:4px;cursor:pointer">${ic('x', 14, C.link, 2.5)}ניקוי בחירה</button></div></div>` : '';
  return `<div style="position:relative;flex:1 1 0;min-width:0"><button type="button" aria-haspopup="listbox" aria-expanded="${open}" data-action="filter-open" data-key="${key}" style="width:100%;height:40px;padding:0 12px;border-radius:8px;background:#FFFFFF;border:1px solid ${open || sel.length ? C.ink : C.field};color:${C.ink};font-size:13px;display:flex;align-items:center;gap:6px;white-space:nowrap;cursor:pointer;text-align:start;box-sizing:border-box"><span style="color:${C.muted};font-weight:400">${f.label}:</span><span style="flex:1;font-weight:${sel.length ? 600 : 400};color:${sel.length ? C.ink : C.muted};overflow:hidden;text-overflow:ellipsis">${esc(val)}</span>${ic('down', 16, C.muted, 2)}</button>${menu}</div>`;
}
function tasksHeader(title, eyebrow = esc(state.household?.name || 'הבית שלנו')) {
  return `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px">
    <div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:14px;font-weight:600;color:${C.muted}">${eyebrow}</span><h1 style="margin:0;font-size:20px;font-weight:500">${title}</h1></div>
    <div style="display:flex;align-items:center;gap:10px">${syncPill()}<span class="pair">${state.members.slice(0, 2).map((m) => av(m, 32)).join('')}</span></div></div>`;
}
function summaryBar(n) {
  const parts = Object.keys(FILTERS).flatMap((k) => FILTERS[k].opts().filter(([v]) => ui.filters[k].includes(v)).map(([, l]) => (k === 'prio' ? `עדיפות ${l}` : l)));
  return `<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;background:${C.grey};font-size:14px"><span style="font-weight:700">${n} משימות</span><span style="color:${C.muted}">· ${esc(parts.join(' · '))}</span></div>`;
}
function emptyToday() {
  return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:30px 20px 40px;text-align:center">${ILL_DONE}
    <h2 style="margin:8px 0 0;font-size:22px;font-weight:500">הכל בוצע להיום!</h2>
    <p style="margin:0;max-width:300px;font-size:15px;line-height:1.5;color:${C.muted}">${householdLine().replace('הבית של ', '')}, סגרתם את כל המשימות של היום!<br>אתם צוות מעולה!</p>
    <a href="#/whenever" style="align-self:stretch;margin-top:8px;height:52px;border-radius:14px;border:1px solid ${C.field};box-sizing:border-box;color:${C.ink};text-decoration:none;font-size:16px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:8px">${ic('infinity', 18, C.ink)}להציץ ב״מתישהו״</a></div>`;
}
function screenTasks() {
  const any = Object.values(ui.filters).some((v) => v.length);
  const list = applyFilters(parents());
  const open = list.filter((t) => t.status !== 'done');
  const groups = [['overdue', 'באיחור', true, 'alert'], ['today', 'היום'], ['week', 'השבוע'], ['later', 'מאוחר יותר']];
  const doneRecent = list.filter((t) => t.status === 'done' && t.completed_at && Date.now() - new Date(t.completed_at) < 3 * 864e5)
    .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1)).slice(0, 6);
  const noDate = openParents().filter((t) => !t.due_date).length;
  let body = '';
  for (const [key, title, red, icon] of groups) {
    const g = open.filter((t) => bucket(t) === key).sort((a, b) => (a.due_date > b.due_date ? 1 : -1));
    if (g.length) body += section(title, g.length, red, icon) + g.map((t) => taskCard(t)).join('');
  }
  const onlyToday = ui.filters.when.length === 1 && ui.filters.when[0] === 'today';
  if (!open.filter((t) => t.due_date).length) body = onlyToday || !any ? emptyToday() : `<div class="empty"><p class="muted">אין משימות שמתאימות לסינון</p></div>`;
  const whenLink = noDate && !any ? `<a href="#/whenever" style="display:flex;align-items:center;gap:14px;padding:16px;margin-top:4px;border-radius:14px;background:${C.grey};color:${C.ink};text-decoration:none"><span style="width:40px;height:40px;border-radius:12px;background:#FFFFFF;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic('infinity', 20, C.ink)}</span><span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:15px;font-weight:600">מתישהו</span><span style="font-size:13px;color:${C.muted}">${noDate} משימות בלי תאריך יעד · אף פעם לא באיחור</span></span>${ic('back', 16, C.muted)}</a>` : '';
  return `<div class="screen">
    <header style="padding:20px 20px 12px;display:flex;flex-direction:column;gap:14px">
      ${tasksHeader('משימות')}
      <div style="display:flex;gap:8px;flex-wrap:wrap">${dropdown('who', 'right')}${dropdown('when', 'left')}
        <div style="flex-basis:100%;display:flex;gap:8px"><a href="#/topics" style="flex:1 1 0;min-width:0;height:40px;padding:0 12px;border-radius:8px;background:#FFFFFF;border:1px solid ${C.field};color:${C.ink};font-size:13px;display:flex;align-items:center;gap:6px;white-space:nowrap;text-decoration:none;box-sizing:border-box"><span style="color:${C.muted}">נושא:</span><span style="flex:1;color:${C.muted}">הכל</span>${ic('down', 16, C.muted, 2)}</a>${dropdown('prio', 'left')}</div></div>
      ${any ? summaryBar(open.length) : ''}
    </header>
    <main style="padding:4px 20px 0;display:flex;flex-direction:column;gap:12px">
      ${body}
      ${whenLink}
      ${doneRecent.length && body.indexOf('הכל בוצע') < 0 ? section('בוצעו לאחרונה', doneRecent.length) + doneRecent.map((t) => taskCard(t)).join('') : ''}
    </main>
  </div>${ui.openFilter ? '<div data-action="filter-close" style="position:fixed;inset:0;z-index:20"></div>' : ''}${nav('tasks')}`;
}

// ---------------------------------------------------------------- whenever
function screenWhenever() {
  const own = ui.wOwner || 'all';
  const p = partner();
  const list = openParents().filter((t) => !t.due_date).filter((t) => own === 'all' || (own === 'me' ? t.assignee === me()?.id : own === 'partner' ? t.assignee === p?.id : !t.assignee));
  const seg = (k, l) => `<button type="button" aria-pressed="${own === k}" data-action="w-owner" data-val="${k}" style="flex:1;height:40px;border:0;border-radius:9px;${own === k ? 'background:#FFFFFF;color:' + C.ink + ';box-shadow:0 1px 3px rgba(27,31,29,0.12)' : 'background:transparent;color:' + C.muted};font-size:14px;font-weight:${own === k ? 500 : 400};cursor:pointer">${esc(l)}</button>`;
  const card = (t) => {
    const nc = commentsOf(t.id).length;
    const d = new Date(t.created_at);
    return `<div style="display:flex;flex-direction:column;gap:12px;padding:16px;background:#FFFFFF;border-radius:16px;border:1px solid ${C.line}">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px"><a href="#/task/${t.id}" style="font-size:15px;font-weight:600;line-height:1.35;color:${C.ink};text-decoration:none">${esc(t.title)}</a><span style="font-size:12px;color:${C.muted};white-space:nowrap;flex-shrink:0">נוספה ב־${pad(d.getDate())}.${pad(d.getMonth() + 1)}</span></div>
      <div style="display:flex;align-items:flex-end;gap:12px"><div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:10px">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;font-size:13px">${t.topic ? topicTag(t.topic) : ''}<span style="display:inline-flex;align-items:center;gap:4px;color:${C.muted};font-weight:400">${ic(PRIO[t.priority].icon, 14, PRIO[t.priority].color, 2.2)}עדיפות ${PRIO[t.priority].label}</span>${nc ? `<span style="display:inline-flex;align-items:center;gap:4px;color:${C.muted};font-weight:400">${ic('chat', 14, C.muted)}${nc === 1 ? 'תגובה אחת' : nc + ' תגובות'}</span>` : ''}</div>
        <a href="#/edit/${t.id}?focus=date" style="display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;margin-inline-start:-10px;border-radius:8px;color:${C.link};font-size:13px;text-decoration:none">${ic('calendar', 15, C.link)}הוספת תאריך יעד</a></div>
        ${ownerChip(t)}</div></div>`;
  };
  let body = '';
  for (const [lv, title, col] of [[3, 'עדיפות גבוהה', C.red], [2, 'עדיפות בינונית', '#F4A261'], [1, 'עדיפות נמוכה', C.muted]]) {
    const g = list.filter((t) => t.priority === lv);
    if (g.length) body += `<div style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:${col};padding:6px 4px 0"><span>${title}</span><span>${g.length}</span></div>` + g.map(card).join('');
  }
  return `<div class="screen">
    <header style="padding:12px 20px 14px;display:flex;flex-direction:column;gap:14px">${backLink('#/tasks', 'משימות')}
      <div style="display:flex;flex-direction:column;gap:6px"><h1 style="margin:0;display:flex;align-items:center;gap:10px;font-size:20px;font-weight:500">${ic('infinity', 18, C.ink, 2)}מתישהו</h1>
      <p style="margin:0;font-size:15px;line-height:1.5;color:${C.muted}">בלי תאריך יעד, ולכן אף פעם לא באיחור. עדיין יש אחראי ועדיפות - קובעים מועד כשמתאים.</p></div>
      <div role="group" aria-label="סינון לפי אחראי" style="display:flex;gap:4px;padding:4px;border-radius:12px;background:${C.grey}">${seg('all', 'הכל')}${seg('me', 'אני')}${p ? seg('partner', p.display_name) : ''}${seg('both', 'שנינו')}</div>
    </header>
    <main style="padding:0 20px;display:flex;flex-direction:column;gap:12px">${body || `<div class="empty"><p class="muted">אין כרגע משימות בלי תאריך</p></div>`}</main>
  </div>${nav('tasks')}`;
}

// ---------------------------------------------------------------- topics
function screenTopics() {
  const ps = parents();
  const rows = TOPICS.map((tp, i) => {
    const all = ps.filter((t) => t.topic === tp.name), open = all.filter((t) => t.status !== 'done').length;
    const sub = all.length && !open ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:13px;color:#2E8B3A;font-weight:500">${ic('check', 14, '#49B64E', 2.6)}הכל בוצע</span>` : `<span style="font-size:13px;color:${C.muted}">${open} משימות</span>`;
    return `<a href="#/topic/${encodeURIComponent(tp.name)}" style="display:flex;align-items:center;gap:12px;min-height:60px;padding:0 14px;${i ? `border-top:1px solid ${C.line};` : ''}color:${C.ink};text-decoration:none"><span style="width:36px;height:36px;border-radius:10px;background:${tp.color}1A;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic(tp.icon, 18, tp.color, 2.2)}</span><span style="flex:1;font-size:15px;font-weight:400">${esc(tp.name)}</span>${sub}${ic('back', 16, C.muted)}</a>`;
  }).join('');
  return `<div class="screen">
    <header style="padding:12px 20px 8px;display:flex;flex-direction:column;gap:10px">${backLink('#/tasks', 'משימות')}
      <div style="display:flex;flex-direction:column;gap:4px"><h1 style="margin:0;font-size:20px;font-weight:500">נושאים</h1><p style="margin:0;font-size:14px;color:${C.muted}">כל המשימות של הבית, לפי תחום</p></div></header>
    <main style="padding:8px 20px 0"><div style="background:#FFFFFF;border:1px solid ${C.line};border-radius:16px;overflow:hidden">${rows}</div></main>
  </div>${nav('tasks')}`;
}
function doneList(done) {
  if (!done.length) return '';
  return `<section style="display:flex;flex-direction:column;gap:8px"><span style="font-size:12px;font-weight:700;color:${C.muted};padding:0 2px">הושלמו <span style="font-weight:500">${done.length}</span></span><div style="background:#FFFFFF;border:1px solid ${C.line};border-radius:14px;overflow:hidden">${done.map((t, i) => {
    const d = t.completed_at ? new Date(t.completed_at) : null;
    return `<a href="#/task/${t.id}" style="display:flex;align-items:center;gap:10px;padding:14px;${i ? `border-top:1px solid ${C.line};` : ''}color:${C.ink};text-decoration:none"><span style="width:18px;height:18px;border-radius:5px;background:#A9B0AB;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic('check', 12, '#FFFFFF', 3)}</span><span style="flex:1;font-size:14px;color:${C.muted};text-decoration:line-through">${esc(t.title)}</span><span style="font-size:12px;color:${C.muted}">${d ? `${d.getDate()}.${d.getMonth() + 1}` : ''}</span>${ownerChip(t)}</a>`;
  }).join('')}</div></section>`;
}
function screenTopic(name) {
  const tp = topicOf(name) || { color: C.muted, icon: 'list' };
  const all = parents().filter((t) => t.topic === name);
  const open = all.filter((t) => t.status !== 'done').sort((a, b) => (a.due_date || '9') > (b.due_date || '9') ? 1 : -1);
  const done = all.filter((t) => t.status === 'done').sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1));
  const allDone = all.length && !open.length;
  return `<div class="screen">
    <header style="padding:12px 20px 8px;display:flex;flex-direction:column;gap:12px">${backLink('#/topics', 'נושאים')}
      <div style="display:flex;align-items:center;gap:12px"><span style="width:44px;height:44px;border-radius:12px;background:${tp.color}1A;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic(tp.icon, 22, tp.color, 2.2)}</span>
      <div style="display:flex;flex-direction:column;gap:2px"><h1 style="margin:0;font-size:20px;font-weight:500">${esc(name)}</h1>${allDone ? '' : `<span style="font-size:13px;color:${C.muted}">${open.length} משימות פתוחות</span>`}</div></div></header>
    <main style="padding:4px 20px 0;display:flex;flex-direction:column;gap:${allDone ? 18 : 12}px">
      ${allDone ? `<div style="display:flex;align-items:center;gap:14px;padding:16px;border-radius:16px;background:#E6F5E7"><span style="width:44px;height:44px;border-radius:50%;background:#49B64E;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic('check', 22, '#FFFFFF', 3)}</span><span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:16px;font-weight:500;color:#1E6B3A">כל המשימות בנושא הושלמו</span><span style="font-size:13px;color:#2E6B3A">כל הכבוד לשניכם!</span></span></div>` : ''}
      ${open.map((t) => taskCard(t)).join('')}
      ${!all.length ? `<div class="empty"><p class="muted">אין עדיין משימות בנושא הזה</p></div>` : ''}
      ${doneList(done)}
    </main>
  </div>${nav('tasks')}`;
}

// ---------------------------------------------------------------- task detail
function dueLong(iso) {
  const d = new Date(iso + 'T12:00:00'), rel = fmtDate(iso), base = `יום ${DAYS[d.getDay()]}`, dm = `${d.getDate()}.${d.getMonth() + 1}`;
  return ['היום', 'מחר', 'אתמול'].includes(rel) ? `${rel}, ${base} ${dm}` : `${base}, ${dm}`;
}
function statusField(t) {
  const open = ui.statusOpen === t.id;
  const opts = ['todo', 'doing', 'done'].map((s) => `<button type="button" role="option" aria-selected="${t.status === s}" data-action="status" data-id="${t.id}" data-status="${s}" style="display:flex;align-items:center;gap:10px;height:44px;padding:0 12px;border:0;border-radius:8px;background:${t.status === s ? C.grey : 'transparent'};font-weight:${t.status === s ? 700 : 500};color:${C.ink};font-size:15px;cursor:pointer;text-align:start;width:100%"><span style="flex:1;display:flex;font-size:14px">${statusPill(s)}</span>${t.status === s ? ic('check', 16, C.ink, 2.6) : ''}</button>`).join('');
  return `<div style="position:relative"><button type="button" aria-haspopup="listbox" aria-expanded="${open}" data-action="status-open" data-id="${t.id}" style="width:100%;height:48px;padding:0 14px;border-radius:12px;background:#FFFFFF;border:1px solid ${open ? C.ink : C.field};display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;color:${C.ink};cursor:pointer;text-align:start"><span style="flex:1;display:flex;font-size:14px">${statusPill(t.status)}</span>${ic('down', 18, C.muted, 2)}</button>
    ${open ? `<div role="listbox" aria-label="סטטוס" style="position:absolute;top:54px;left:0;right:0;padding:6px;background:#FFFFFF;border:1px solid ${C.line};border-radius:12px;box-shadow:0 10px 28px rgba(27,31,29,0.16);display:flex;flex-direction:column;gap:6px;z-index:30">${opts}</div>` : ''}</div>`;
}
function detailRow(icon, title, value, sub, href) {
  return `<a href="${href}" style="display:flex;align-items:center;gap:12px;padding:14px 0;border-top:1px solid ${C.line};color:${C.ink};text-decoration:none"><span style="width:36px;height:36px;border-radius:10px;background:${C.ground};display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic(icon, 18, C.ink)}</span><span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:13px;font-weight:600;color:${C.muted}">${title}</span><span style="font-size:15px;font-weight:600">${value}</span>${sub ? `<span style="font-size:13px;color:${C.muted}">${sub}</span>` : ''}</span>${ic('back', 16, C.muted)}</a>`;
}
function subItem(s) {
  const done = s.status === 'done', doing = s.status === 'doing';
  const b = done ? `<span style="width:20px;height:20px;border-radius:6px;background:${C.ink};display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic('check', 13, '#FFFFFF', 3)}</span>`
    : `<span style="width:20px;height:20px;border-radius:6px;border:${doing ? '2px dashed #F0954A' : '1.5px solid #A8A8B0'};box-sizing:border-box;flex-shrink:0"></span>`;
  return `<div style="display:flex;align-items:center;gap:12px;min-height:52px;padding:6px 0;border-top:1px solid ${C.line}"><button type="button" role="checkbox" aria-checked="${done}" aria-label="סימון: ${esc(s.title)}" data-action="toggle" data-id="${s.id}" style="width:44px;height:44px;margin:-12px;border:0;background:none;padding:0;display:flex;align-items:center;justify-content:center;cursor:pointer">${b}</button>
    <a href="#/task/${s.id}" style="flex:1;display:flex;flex-direction:column;gap:2px;text-decoration:none"><span style="font-size:15px;color:${done ? C.muted : C.ink};${done ? 'text-decoration:line-through' : ''}">${esc(s.title)}</span>${s.due_date ? `<span style="font-size:12.5px;color:${C.muted}">עד ${fmtDate(s.due_date)}</span>` : ''}</a>${s.assignee || state.members.length > 1 ? ownerAv(s, 24) : ''}</div>`;
}
function screenTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return `<div class="screen">${backBar('#/tasks', 'משימות')}<div class="empty"><p class="muted">המשימה לא נמצאה (אולי נמחקה)</p></div></div>${nav('tasks')}`;
  const parent = t.parent_id ? state.tasks.find((x) => x.id === t.parent_id) : null;
  const subs = parent ? [] : subsOf(t.id);
  const subDone = subs.filter((s) => s.status === 'done').length;
  const cs = commentsOf(t.id);
  const shared = !t.assignee;
  const am = member(t.assignee);
  const oc = shared ? { bg: '#D9F0ED', border: '#A9DBD4', ink: '#0B5F57', text: '#134E4A' } : am?.color === 'blue' ? { bg: '#E0F4FD', border: '#BAE3F7', ink: '#0369A1', text: '#0C4A6E' } : { bg: '#EFEBFC', border: '#DDD2F5', ink: '#5B3FB8', text: '#3F2D80' };
  const names = state.members.map((m) => m.display_name).join(' ו');
  const ownTitle = shared ? `משימה משותפת · ${esc(names)}` : t.assignee === me()?.id ? 'באחריותך' : `באחריות ${esc(am?.display_name || '')}`;
  const ownText = shared ? 'כל אחד מכם יכול לעדכן סטטוס ולסמן כבוצע. כשאחד מסיים - השני רואה את זה מיד.' : 'לחיצה לשינוי האחראי';
  const sp = STATUS_PILL[t.status];
  const menu = ui.menuOpen === t.id ? `<div data-action="menu-close" style="position:fixed;inset:0;z-index:20"></div><div role="menu" aria-label="פעולות על המשימה" style="position:absolute;top:58px;left:12px;width:240px;padding:6px;background:#FFFFFF;border:1px solid ${C.line};border-radius:14px;box-shadow:0 12px 32px rgba(27,31,29,0.18);display:flex;flex-direction:column;gap:2px;z-index:31">
      <a role="menuitem" href="#/edit/${t.id}" style="display:flex;align-items:center;gap:12px;height:46px;padding:0 12px;border-radius:8px;color:${C.ink};font-size:15px;text-decoration:none">${ic('pencil', 18, C.ink)}עריכת משימה</a>
      ${parent ? '' : `<button role="menuitem" data-action="duplicate" data-id="${t.id}" style="display:flex;align-items:center;gap:12px;height:46px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:${C.ink};font-size:15px;cursor:pointer;text-align:start;width:100%">${ic('copy', 18, C.ink)}שכפול משימה</button>`}
      <div style="height:1px;background:${C.line};margin:4px 8px"></div>
      <button role="menuitem" data-action="delete" data-id="${t.id}" style="display:flex;align-items:center;gap:12px;height:46px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:${C.red};font-size:15px;cursor:pointer;text-align:start;width:100%">${ic('trash', 18, C.red)}${ui.confirmDelete === t.id ? 'בטוח? לחיצה נוספת תמחק' : 'מחיקת משימה'}</button></div>` : '';
  const showSubs = !parent && (subs.length || ui.addSub === t.id);
  return `<div class="screen no-nav" style="position:relative">
    <header style="padding:12px 8px 4px;display:flex;align-items:center;justify-content:space-between">
      <a href="${parent ? `#/task/${parent.id}` : '#/tasks'}" style="display:inline-flex;align-items:center;gap:2px;height:44px;padding:0 8px;color:${C.ink};text-decoration:none;font-size:15px;font-weight:600">${ic('right', 20, C.ink)}${parent ? esc(parent.title) : 'משימות'}</a>
      <button aria-label="אפשרויות נוספות" data-action="menu-open" data-id="${t.id}" style="width:44px;height:44px;border:0;background:none;display:flex;align-items:center;justify-content:center;cursor:pointer">${ic('more', 22, C.ink, 3)}</button>
    </header>${menu}
    <main style="flex:1;display:flex;flex-direction:column;gap:18px;padding:4px 20px 20px">
      <div style="display:flex;flex-direction:column;gap:10px">
        <span style="align-self:flex-start;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:${sp.bg};color:${sp.ink};font-size:13px;font-weight:700"><span style="width:7px;height:7px;border-radius:50%;background:${sp.fg}"></span>${STATUS[t.status]}</span>
        <h1 style="margin:0;font-size:28px;font-weight:500;line-height:1.2">${esc(t.title)}</h1>
        ${t.notes ? `<p style="margin:0;font-size:15px;line-height:1.5;color:${C.muted};white-space:pre-wrap">${esc(t.notes)}</p>` : ''}
        ${parent ? `<span style="font-size:13px;color:${C.muted}">תת משימה של ״${esc(parent.title)}״</span>` : ''}
      </div>
      <a href="#/edit/${t.id}" aria-label="אחריות - לחיצה לשינוי" style="display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:16px;background:${oc.bg};border:1px solid ${oc.border};text-decoration:none"><div style="display:flex;align-items:center;gap:12px">${ownerAv(t, 36)}
        <span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:15px;font-weight:700;color:${oc.ink}">${ownTitle}</span><span style="font-size:13px;color:${oc.text};line-height:1.4">${ownText}</span></span>
        <span style="margin-inline-start:auto;display:flex">${ic('back', 16, oc.ink)}</span></div></a>
      <div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:13px;font-weight:500;color:${C.muted};padding:0 4px">בחירת סטטוס למשימה</span>${statusField(t)}
        <span style="font-size:12.5px;color:${C.muted}">${t.status === 'done' && t.completed_by ? `בוצע ע״י ${esc(nameOf(t.completed_by))} · ${fmtAgo(t.completed_at)}` : `עודכן לאחרונה · ${fmtAgo(t.updated_at || t.created_at)}`}</span></div>
      <div style="display:flex;flex-direction:column;background:#FFFFFF;border-radius:16px;border:1px solid ${C.line};padding:0 14px"><div style="margin-top:-1px"></div>
        ${detailRow('calendar', 'תאריך יעד', t.due_date ? dueLong(t.due_date) : 'מתישהו', t.due_date ? 'עד מתי המשימה צריכה להסתיים' : 'בלי תאריך יעד, אף פעם לא באיחור', `#/edit/${t.id}`)}
        ${!parent ? detailRow('repeat', 'חוזרת', t.repeat ? repeatLabel(t) : 'לא חוזרת', '', `#/edit/${t.id}`) : ''}
        ${detailRow('flag', 'עדיפות', `<span style="display:inline-flex;align-items:center;gap:4px;color:${C.ink};font-weight:400">${ic(PRIO[t.priority].icon, 14, PRIO[t.priority].color, 2.2)}${PRIO[t.priority].label}</span>`, '', `#/edit/${t.id}`)}
        ${!parent ? detailRow('list', 'נושא', t.topic ? topicTag(t.topic).replace('font-size:', 'font-size:14px;') : `<span style="color:${C.muted};font-weight:400">בלי נושא</span>`, '', `#/edit/${t.id}`) : ''}
      </div>
      ${showSubs ? `<section aria-labelledby="s-h" style="display:flex;flex-direction:column;background:#FFFFFF;border-radius:16px;border:1px solid ${C.line};padding:14px 14px 4px">
        <div style="display:flex;align-items:center;gap:8px;padding-bottom:10px"><h2 id="s-h" style="margin:0;font-size:16px;font-weight:500">תתי משימות</h2>${subs.length ? `<span style="font-size:13px;color:${C.muted}">${subDone} מתוך ${subs.length} בוצעו</span>` : ''}</div>
        ${subs.length ? `<div role="progressbar" aria-valuenow="${Math.round((subDone / subs.length) * 100)}" aria-valuemin="0" aria-valuemax="100" style="height:6px;border-radius:3px;background:${C.grey};margin-bottom:10px;overflow:hidden"><div style="width:${(subDone / subs.length) * 100}%;height:100%;border-radius:3px;background:#49B64E"></div></div>` : ''}
        ${subs.map(subItem).join('')}
        <form data-form="add-sub" data-id="${t.id}" style="display:flex;align-items:center;gap:12px;min-height:52px;border-top:${subs.length ? `1px solid ${C.line}` : '0'}">${ic('plus', 20, C.link, 2)}<input name="title" id="sub-input" placeholder="הוספת תת משימה" aria-label="הוספת תת משימה" style="flex:1;border:0;outline:none;background:none;font-size:15px;height:44px;color:${C.ink}"></form>
      </section>` : !parent ? `<button type="button" data-action="show-add-sub" data-id="${t.id}" style="display:flex;align-items:center;gap:10px;height:52px;padding:0 14px;border-radius:16px;border:1px dashed ${C.field};background:none;color:${C.link};font-size:15px;font-weight:400;cursor:pointer;text-align:start">${ic('plus', 18, C.link, 2)}הוספת תת משימה</button>` : ''}
      <section aria-labelledby="c-h" style="display:flex;flex-direction:column;gap:14px">
        <h2 id="c-h" style="margin:0;display:flex;align-items:center;gap:8px;font-size:18px;font-weight:700">${ic('chat', 18, C.ink)}תגובות ועדכונים<span style="font-size:14px;font-weight:500;color:${C.muted}">${cs.length || ''}</span></h2>
        ${cs.map((c) => { const a = member(c.author_id), mine = c.author_id === me()?.id; return `<article style="display:flex;gap:10px;align-items:flex-start">${av(a, 32)}<div style="flex:1;display:flex;flex-direction:column;gap:4px"><div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:14px;font-weight:700">${esc(a?.display_name)}</span><time style="font-size:12px;color:${C.muted}">${fmtAgo(c.created_at)}</time></div><p style="margin:0;padding:10px 12px;border-radius:14px 4px 14px 14px;background:${mine ? colorsOf(a)[1] : '#FFFFFF'};border:1px solid ${mine ? 'transparent' : C.line};font-size:15px;line-height:1.5;white-space:pre-wrap;word-break:break-word">${esc(c.body)}</p></div></article>`; }).join('')}
        <form data-form="comment" data-id="${t.id}" style="display:flex;align-items:center;gap:8px;padding:6px;padding-inline-start:14px;border-radius:14px;background:#FFFFFF;border:1px solid ${C.field}"><input name="body" id="c-new" placeholder="הוספת תגובה או עדכון…" aria-label="הוספת תגובה" style="flex:1;min-width:0;height:40px;border:0;outline:none;background:transparent;font-size:15px;color:${C.ink}"><button aria-label="שליחת תגובה" style="width:44px;height:44px;border-radius:12px;border:0;background:${C.ink};display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0"><span style="display:flex;transform:scaleX(-1)">${ic('send', 18, '#FFFFFF')}</span></button></form>
      </section>
    </main>
    <div style="padding:14px 20px calc(30px + var(--safe-bottom));position:sticky;bottom:0;background:linear-gradient(rgba(248,248,250,0), ${C.ground} 30%)">
      <button data-action="toggle" data-id="${t.id}" style="width:100%;height:54px;border-radius:14px;border:0;background:${C.ink};color:#FFFFFF;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer">${t.status === 'done' ? `${ic('redo', 20, '#FFFFFF')}החזרה לביצוע` : `${ic('check', 20, '#FFFFFF', 2.6)}סימון כבוצע`}</button>
    </div>
    ${ui.statusOpen === t.id ? '<div data-action="status-close" style="position:fixed;inset:0;z-index:20"></div>' : ''}
  </div>`;
}

// ---------------------------------------------------------------- new / edit (bottom sheet)
function newForm(existing, params) {
  if (existing) return { id: existing.id, repeat: existing.repeat || '', parent_id: existing.parent_id, title: existing.title, notes: existing.notes || '', assignee: existing.assignee || 'both', due_date: existing.due_date || '', hasDate: !!existing.due_date, priority: existing.priority, topic: existing.topic || '' };
  return { title: '', notes: '', repeat: '', assignee: 'both', due_date: today(), hasDate: true, priority: 2, topic: params.get('topic') || '' };
}
function screenForm(id, params) {
  const existing = id ? state.tasks.find((t) => t.id === id) : null;
  if (id && !existing) return `<div class="screen no-nav">${backBar('#/tasks', 'משימות')}<div class="empty"><p class="muted">המשימה לא נמצאה</p></div></div>`;
  const key = id || 'new';
  if (!ui.form || ui.form._key !== key) ui.form = { ...newForm(existing, params), _key: key };
  const f = ui.form, p = partner(), isSub = !!f.parent_id;
  const close = existing ? `#/task/${existing.id}` : '#/tasks';
  const label = (txt, opt) => `<span style="font-size:14px;font-weight:700">${txt}${opt ? `<span style="font-weight:400;color:${C.muted}"> · לא חובה</span>` : ''}</span>`;
  const inputSt = `width:100%;box-sizing:border-box;height:48px;padding:0 14px;border-radius:12px;border:1px solid ${C.field};background:#FFFFFF;font-size:16px;color:${C.ink}`;
  const owners = [[me()?.id, me()], ...(p ? [[p.id, p]] : []), ['both', null]];
  const radioDot = (on) => `<span style="width:20px;height:20px;border-radius:50%;border:${on ? '6px solid ' + C.ink : '2px solid #A9B0AB'};box-sizing:border-box;flex-shrink:0"></span>`;
  const ownerRows = owners.map(([v, m]) => { const on = f.assignee === v; return `<button type="button" role="radio" aria-checked="${on}" data-action="set" data-key="assignee" data-val="${v}" style="display:flex;align-items:center;height:52px;padding:0 12px;border:0;border-radius:8px;background:${on ? C.grey : 'transparent'};cursor:pointer;width:100%;gap:12px;color:${C.ink}">${radioDot(on)}${m ? av(m, 30) : `<span class="pair">${state.members.slice(0, 2).map((x) => av(x, 30)).join('')}</span>`}<span style="flex:1;text-align:start;font-size:15px;font-weight:${on ? 700 : 500}">${m ? esc(m.display_name) : 'שנינו'}</span></button>`; }).join('');
  const chip = (k, l) => { const on = (f.repeat || '') === k; return `<button type="button" aria-pressed="${on}" data-action="set" data-key="repeat" data-val="${k}" style="height:36px;padding:0 12px;border-radius:10px;border:1px solid ${on ? C.ink : C.line};background:${on ? C.grey : '#FFFFFF'};font-weight:${on ? 600 : 400};font-size:14px;color:${C.ink};display:inline-flex;align-items:center;gap:6px;cursor:pointer">${k ? ic('repeat', 14, C.ink) : ''}${l}</button>`; };
  const prioRows = [3, 2, 1].map((n) => { const on = f.priority === n; return `<button type="button" role="radio" aria-checked="${on}" data-action="set" data-key="priority" data-val="${n}" style="display:flex;align-items:center;gap:12px;height:44px;padding:0 12px;border:0;border-radius:8px;background:${on ? C.grey : 'transparent'};color:${C.ink};font-weight:${on ? 700 : 500};font-size:15px;cursor:pointer;text-align:start;width:100%">${ic(PRIO[n].icon, 18, PRIO[n].color, 2.2)}<span style="flex:1">${PRIO[n].label}</span>${on ? ic('check', 16, C.ink, 2.6) : ''}</button>`; }).join('');
  const td = today(), dow = new Date().getDay();
  const quick = [['היום', td], ['מחר', addDays(td, 1)], ['שישי', addDays(td, (5 - dow + 7) % 7 || 7)], ['בעוד שבוע', addDays(td, 7)]];
  return `<div class="screen no-nav" style="background:#DADDD8;padding-bottom:0">
    <div style="height:44px;flex-shrink:0"></div>
    <div style="flex:1;display:flex;flex-direction:column;background:#FFFFFF;border-radius:22px 22px 0 0;box-shadow:0 -4px 24px rgba(27,31,29,0.08)">
      <div style="display:flex;justify-content:center;padding-top:8px"><span style="width:40px;height:5px;border-radius:3px;background:#D5D9D4"></span></div>
      <header style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px 6px 20px"><h1 style="margin:0;font-size:24px;font-weight:500">${existing ? (isSub ? 'עריכת תת משימה' : 'עריכת משימה') : 'משימה חדשה'}</h1><a href="${close}" aria-label="סגירה" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;color:${C.ink};border-radius:22px">${ic('x', 22, C.ink, 2)}</a></header>
      <form data-form="task" novalidate style="flex:1;display:flex;flex-direction:column;gap:24px;padding:8px 20px calc(20px + var(--safe-bottom))">
        <div style="display:flex;flex-direction:column;gap:10px"><label for="f-title">${label('מה צריך לעשות?')}</label><input id="f-title" data-bind="title" value="${esc(f.title)}" placeholder="למשל: להרכיב את העריסה" maxlength="200" style="${inputSt}"></div>
        <div style="display:flex;flex-direction:column;gap:10px"><label for="f-notes">${label('פרטים', true)}</label><textarea id="f-notes" data-bind="notes" rows="2" style="${inputSt};height:auto;padding:12px 14px;resize:none;line-height:1.45;font-family:inherit">${esc(f.notes)}</textarea></div>
        ${isSub ? '' : `<div style="display:flex;flex-direction:column;gap:10px"><label for="f-topic">${label('נושא', true)}</label><label style="${inputSt};display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding-inline-end:12px;position:relative"><span style="display:flex">${f.topic ? topicTag(f.topic).replace('font-size:', 'font-size:14px;') : `<span style="color:${C.muted}">בלי נושא</span>`}</span>${ic('down', 18, C.muted, 2)}<select id="f-topic" data-bind="topic" style="position:absolute;inset:0;opacity:0;width:100%;cursor:pointer"><option value="">בלי נושא</option>${TOPICS.map((t) => `<option ${f.topic === t.name ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label></div>`}
        <div role="radiogroup" aria-labelledby="own-l" style="display:flex;flex-direction:column;gap:8px"><span id="own-l" style="font-size:14px;font-weight:700;margin-bottom:2px">מי אחראי/ת?</span><div style="display:flex;flex-direction:column;gap:2px;padding:4px;border:1px solid ${C.line};border-radius:12px">${ownerRows}</div></div>
        <div style="display:flex;flex-direction:column;gap:12px;padding-top:4px;border-top:1px solid ${C.line}">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:16px"><span style="display:flex;flex-direction:column;gap:2px"><span style="display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700">${ic('calendar', 16, C.ink)}תאריך יעד</span><span style="font-size:13px;color:${C.muted}">עד מתי המשימה צריכה להסתיים</span></span>${switchBtn(f.hasDate, 'הגדרת תאריך יעד', `data-action="set" data-key="hasDate" data-val="${!f.hasDate}"`)}</div>
          ${f.hasDate ? `<label style="${inputSt};display:flex;align-items:center;justify-content:space-between;cursor:pointer;position:relative"><span>${f.due_date ? fmtLong(f.due_date) : 'בחירת תאריך'}</span>${ic('calendar', 18, C.muted)}<input type="date" id="f-date" data-bind="due_date" value="${esc(f.due_date)}" aria-label="תאריך יעד" style="position:absolute;inset:0;opacity:0;width:100%;cursor:pointer"></label>
          <div style="display:flex;align-items:center;gap:10px;padding:0 2px;opacity:.55">${ic('calendar', 16, C.muted)}<span style="flex:1;font-size:14px">להוסיף ליומן גוגל</span>${soon}</div>` : ''}
          <p style="margin:0;font-size:13px;color:${C.muted};line-height:1.45">בלי תאריך? המשימה תעבור ל״מתישהו״ ולא תסומן כבאיחור.</p>
        </div>
        ${isSub ? '' : `<div style="display:flex;flex-direction:column;gap:12px;border-top:1px solid ${C.line};padding-top:16px"><span style="display:flex;flex-direction:column;gap:2px"><span style="display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700">${ic('repeat', 16, C.ink)}חוזרת על עצמה?</span><span style="font-size:13px;color:${C.muted}">כשמסמנים כבוצע, המשימה הבאה נוצרת לבד עם אותן תתי משימות</span></span>
          <div role="radiogroup" aria-label="חזרה" style="display:flex;flex-wrap:wrap;gap:8px">${chip('', 'לא')}${Object.entries(REPEAT).map(([k, l]) => chip(k, l)).join('')}</div>
          ${f.repeat && f.hasDate && f.due_date ? `<span style="font-size:13px;color:${C.muted}">${repeatLabel({ repeat: f.repeat, due_date: f.due_date })}</span>` : ''}</div>`}
        <div style="display:flex;flex-direction:column;gap:12px;border-top:1px solid ${C.line};padding-top:16px;opacity:.55"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><span style="display:flex;flex-direction:column;gap:2px"><span style="display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700">${ic('bell', 16, C.ink)}תזכורת</span><span style="font-size:13px;color:${C.muted}">התראה לפני תאריך היעד</span></span>${soon}</div></div>
        <div style="display:flex;flex-direction:column;gap:10px;border-top:1px solid ${C.line};padding-top:16px"><span style="font-size:14px;font-weight:700">עדיפות</span><div role="radiogroup" aria-label="עדיפות" style="display:flex;flex-direction:column;gap:2px;padding:4px;border:1px solid ${C.line};border-radius:12px">${prioRows}</div></div>
        ${ui.error ? `<p class="err">${esc(ui.error)}</p>` : ''}
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:auto;padding-top:8px">
          <button style="height:52px;border-radius:14px;border:0;background:${C.ink};color:#FFFFFF;font-size:16px;font-weight:700;cursor:pointer" ${ui.busy ? 'disabled' : ''}>${existing ? 'שמירה' : 'יצירת משימה'}</button>
          <a href="${close}" style="height:52px;border-radius:14px;border:1px solid ${C.field};box-sizing:border-box;color:${C.ink};text-decoration:none;font-size:16px;font-weight:600;display:flex;align-items:center;justify-content:center">ביטול</a>
        </div>
      </form>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- created
function screenCreated(id) {
  const t = state.tasks.find((x) => x.id === id);
  const p = partner();
  const who = !t ? '' : (!t.assignee || t.assignee !== me()?.id) && p ? `${esc(p.display_name)} רואה אותה עכשיו אצלו/ה.` : 'היא מחכה לך ברשימה.';
  return `<div class="screen no-nav">
    <header style="padding:12px 8px 0;display:flex"><a href="#/tasks" aria-label="סגירה" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center">${ic('x', 22, C.ink, 2)}</a></header>
    <main style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:0 24px 24px;text-align:center">${ILL_CREATED}
      <h1 style="margin:8px 0 0;font-size:24px;font-weight:500">המשימה נוצרה!</h1>
      <p style="margin:0;max-width:300px;font-size:15px;line-height:1.5;color:${C.muted}">${who}</p>
      ${t ? `<div style="align-self:stretch;display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:16px;background:#FFFFFF;border:1px solid ${C.line};text-align:start">
        <div style="display:flex;align-items:center;gap:10px"><span style="flex:1;font-size:16px;font-weight:600">${esc(t.title)}</span>${ownerAv(t, 28)}</div>
        ${t.topic ? `<div style="display:flex;flex-wrap:wrap;gap:6px;font-size:12.5px">${topicTag(t.topic)}</div>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:8px 14px;font-size:13px">${t.due_date ? meta('calendar', `עד ${fmtDate(t.due_date)}`) : meta('infinity', 'מתישהו')}${t.repeat ? meta('repeat', repeatLabel(t)) : ''}</div></div>` : ''}
    </main>
    <div style="padding:12px 20px calc(30px + var(--safe-bottom));display:flex;flex-direction:column;gap:10px">
      <a href="#/tasks" style="height:54px;border-radius:14px;background:${C.ink};color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:600;display:flex;align-items:center;justify-content:center">חזרה למשימות</a>
      <a href="#/new" style="height:52px;border-radius:14px;border:1px solid ${C.field};box-sizing:border-box;color:${C.ink};text-decoration:none;font-size:16px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:8px">${ic('plus', 18, C.ink, 2)}יצירת משימה נוספת</a>
    </div></div>`;
}
const meta = (icon, text) => `<span style="display:inline-flex;align-items:center;gap:4px;color:${C.muted};font-weight:500">${ic(icon, 14, C.muted)}${text}</span>`;

// ---------------------------------------------------------------- updates
function screenUpdates() {
  const items = updates();
  const unread = items.filter((u) => u.unread).length;
  const groups = {};
  const td = today(), yd = addDays(td, -1);
  for (const u of items) { const d = isoOf(new Date(u.at)); const g = d === td ? 'היום' : d === yd ? 'אתמול' : 'קודם'; (groups[g] = groups[g] || []).push(u); }
  const note = (u) => {
    const m = member(u.who); const mc = colorsOf(m);
    const style = u.icon === 'checks' ? ['#FFFFFF', 'var(--both)'] : u.icon === 't_gift' ? ['#4F46E5', '#4F46E51A'] : [mc[2], mc[1]];
    return `<a href="${u.href}" style="display:flex;align-items:flex-start;gap:12px;padding:14px;border-radius:14px;background:${u.unread ? '#FFFFFF' : 'transparent'};border:1px solid ${u.unread ? C.line : 'transparent'};color:${C.ink};text-decoration:none">
      <span style="width:40px;height:40px;border-radius:12px;background:${style[1]};display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic(u.icon, 20, style[0])}</span>
      <span style="flex:1;display:flex;flex-direction:column;gap:4px;min-width:0"><span style="font-size:14.5px;line-height:1.45"><strong style="font-weight:700">${esc(m?.display_name || '')}</strong> ${u.short}</span>${u.sub ? `<span style="font-size:13.5px;color:${C.muted};line-height:1.45">${u.sub}</span>` : ''}<time style="font-size:12px;color:${C.muted}">${fmtAgo(u.at)}</time></span>
      ${u.unread ? `<span aria-label="לא נקרא" style="width:9px;height:9px;border-radius:50%;background:${C.link};flex-shrink:0;margin-top:6px"></span>` : '<span style="width:9px;flex-shrink:0"></span>'}</a>`;
  };
  const body = items.length ? Object.entries(groups).map(([g, us]) => `<div class="section"><span>${g}</span></div>` + us.map(note).join('')).join('')
    : `<div class="empty">${ic('bell', 40, C.muted, 1.5)}<p class="muted">כאן יופיעו עדכונים כש${esc(partner()?.display_name || 'בן/בת הזוג')} מוסיף/ה, מסיים/ת או מגיב/ה על משימות.</p></div>`;
  return `<div class="screen">
    <header style="padding:20px 20px 12px;display:flex;align-items:flex-end;justify-content:space-between;gap:12px">
      <div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:14px;font-weight:600;color:${C.muted}">${unread ? (unread === 1 ? 'התראה חדשה אחת' : `${unread} התראות חדשות`) : 'אין התראות חדשות'}</span><h1 style="margin:0;font-size:20px;font-weight:500">עדכונים</h1></div>
      ${unread ? `<button data-action="mark-read" style="height:44px;padding:0 12px;border:0;background:none;color:${C.link};font-size:14px;font-weight:400;cursor:pointer">סימון הכל כנקרא</button>` : ''}
    </header>
    <main style="padding:0 20px;display:flex;flex-direction:column;gap:8px">${body}</main>
  </div>${nav('updates')}`;
}

// ---------------------------------------------------------------- rewards
function screenRewards() {
  const { total, per, events } = coinTotals();
  const p = partner();
  const ranked = [...state.members].sort((a, b) => (per[b.id] || 0) - (per[a.id] || 0));
  const leader = ranked[0], second = ranked[1];
  const tie = second && (per[leader.id] || 0) === (per[second.id] || 0);
  const lead = second ? (per[leader.id] || 0) - (per[second.id] || 0) : 0;
  const unlocked = total >= 100;
  const iPick = unlocked && (tie || leader?.id === me()?.id);
  if (unlocked && iPick) return screenRewardPick(per);
  const lastR = state.redemptions[0];
  const ideaChip = (i) => `<span style="display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 6px 0 12px;border-radius:10px;background:#FFFFFF;border:1px solid ${C.line};font-size:14px">${ic('t_gift', 16, '#4F46E5', 2)}${esc(i.label)}<button aria-label="מחיקת ${esc(i.label)}" data-action="del-idea" data-id="${i.id}" style="width:26px;height:26px;border:0;background:none;display:flex;align-items:center;justify-content:center;cursor:pointer">${ic('x', 13, C.muted, 2.4)}</button></span>`;
  const person = (m) => `<div style="flex:1;display:flex;align-items:center;gap:10px;padding:12px;border-radius:14px;background:#FFFFFF;border:1px solid ${C.line}">${av(m, 32)}<span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:13px;color:${C.muted}">${esc(m.display_name)} צבר/ה</span><span style="display:inline-flex;align-items:center;gap:4px;font-size:17px;font-weight:600">${per[m.id] || 0}${coin(16)}</span></span></div>`;
  return `<div class="screen">
    <header style="padding:12px 8px 0;display:flex"><a href="#/home" style="display:inline-flex;align-items:center;gap:2px;height:44px;padding:0 8px;color:${C.ink};text-decoration:none;font-size:15px;font-weight:600">${ic('right', 20, C.ink)}בית</a></header>
    <main style="display:flex;flex-direction:column;gap:18px;padding:0 20px">
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center">${jar(total, 210)}<h1 style="margin:0;font-size:24px;font-weight:500">קופת ההפתעות</h1>
        <p style="margin:0;font-size:14.5px;color:${C.muted}">${unlocked ? 'הקופה מלאה! 🎉' : `עוד <b style="color:${C.ink};font-weight:600">${100 - total} מטבעות</b> ואתם פותחים הפתעה`}</p></div>
      ${unlocked ? `<section style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:14px;background:${colorsOf(leader)[1]}">${av(leader, 36)}<span style="flex:1"><b style="font-weight:600">הגעתם ל-100!</b><br><span style="font-size:13px">${esc(leader.display_name)} צבר/ה הכי הרבה, ולכן הוא/היא בוחר/ת את ההפתעה.</span></span></section>` : ''}
      <div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:baseline;justify-content:space-between"><span style="display:inline-flex;align-items:center;gap:6px;font-size:22px;font-weight:600">${total}${coin(20)}</span><span style="font-size:13px;color:${C.muted}">מתוך 100</span></div>
        <div role="progressbar" aria-valuenow="${total}" aria-valuemin="0" aria-valuemax="100" aria-label="התקדמות הקופה" style="height:12px;border-radius:6px;background:#EBEBF0;overflow:hidden;display:flex">${state.members.map((m) => `<span style="width:${Math.min(100, per[m.id] || 0)}%;background:${colorsOf(m)[0]}"></span>`).join('')}</div>
        <div style="display:flex;gap:14px;font-size:12.5px;color:${C.muted}">${state.members.map((m) => `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${colorsOf(m)[0]}"></span>${esc(m.display_name)} ${per[m.id] || 0}</span>`).join('')}</div></div>
      <div style="display:flex;gap:10px">${state.members.map(person).join('')}</div>
      ${p && !unlocked ? `<section style="display:flex;flex-direction:column;gap:10px">${sectionHead('מי בוחר את ההפתעה?')}<div style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:14px;background:${colorsOf(leader)[1]}">${av(leader, 36)}<span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:15px;font-weight:600;color:${colorsOf(leader)[2]}">${tie ? 'כרגע יש שוויון' : `${esc(leader.display_name)} מוביל/ה ב-${lead} מטבעות`}</span><span style="font-size:12.5px;line-height:1.45">מי שצבר יותר מטבעות כשהקופה מגיעה ל-100 בוחר את ההפתעה</span></span></div></section>` : ''}
      <section style="display:flex;flex-direction:column;gap:10px">${sectionHead('רעיונות להפתעה · משותף לשניכם')}<div style="display:flex;flex-wrap:wrap;gap:8px">${state.ideas.map(ideaChip).join('')}
        <form data-form="idea" style="display:inline-flex"><label style="display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 12px;border-radius:10px;border:1px dashed ${C.field};color:${C.link};font-size:14px">${ic('plus', 16, C.link, 2)}<input name="label" placeholder="הוספת רעיון" aria-label="רעיון חדש" maxlength="80" style="border:0;outline:none;background:none;width:96px;font-size:14px;color:${C.ink}"></label></form></div></section>
      <section style="display:flex;flex-direction:column;gap:8px">${sectionHead('איך מרוויחים')}<div style="display:flex;gap:8px">${[1, 2, 3].map((n) => `<div style="flex:1;padding:12px;border-radius:14px;background:#FFFFFF;border:1px solid ${C.line};display:flex;flex-direction:column;gap:6px;font-size:13px"><span style="display:inline-flex;align-items:center;gap:4px">${ic(PRIO[n].icon, 14, PRIO[n].color, 2.2)}${PRIO[n].label}</span><span style="display:inline-flex;align-items:center;gap:4px;font-size:16px;font-weight:600">${PRIO[n].pts}${coin(15)}</span></div>`).join('')}</div>
        <span style="padding:0 4px;font-size:12.5px;color:${C.muted};line-height:1.5">רק משימה שלמה מזכה במטבעות, לא תת משימה. משימה משותפת נותנת מטבעות לשניכם.</span></section>
      ${events.length ? `<section style="display:flex;flex-direction:column;background:#FFFFFF;border:1px solid ${C.line};border-radius:14px;padding:4px 14px 0"><h2 style="margin:0;padding:10px 0;font-size:13px;font-weight:500;color:${C.muted}">הרווחתם לאחרונה</h2>${events.slice(0, 12).map((c) => `<div style="display:flex;align-items:center;gap:12px;min-height:56px;border-top:1px solid ${C.line}">${av(member(c.user_id), 26)}<span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:14.5px">${esc(c.title)}</span><span style="font-size:12.5px;color:${C.muted}">${fmtAgo(c.created_at)}</span></span><span style="display:inline-flex;align-items:center;gap:4px;font-size:14px;font-weight:600;color:#B7791F">+${c.amount}${coin(16)}</span></div>`).join('')}</section>` : ''}
      ${lastR ? `<p style="margin:0;text-align:center;font-size:13px;color:${C.muted}">ההפתעה האחרונה: <b>${esc(lastR.surprise)}</b></p>` : ''}
    </main></div>${nav('home')}`;
}
function screenRewardPick(per) {
  const pick = (i) => { const on = ui.pick === i.label; return `<button type="button" role="radio" aria-checked="${on}" data-action="pick" data-val="${esc(i.label)}" style="display:flex;align-items:center;gap:12px;min-height:56px;padding:0 14px;border-radius:14px;background:#FFFFFF;border:${on ? `2px solid ${C.ink}` : `1px solid ${C.line}`};color:${C.ink};font-size:15px;font-weight:${on ? 600 : 400};cursor:pointer;text-align:start"><span style="width:34px;height:34px;border-radius:10px;background:#4F46E51A;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic('t_gift', 18, '#4F46E5', 2)}</span><span style="flex:1">${esc(i.label)}</span>${on ? `<span style="width:22px;height:22px;border-radius:50%;background:${C.ink};display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic('check', 13, '#FFFFFF', 3)}</span>` : `<span style="width:22px;height:22px;border-radius:50%;border:1.5px solid #A9B0AB;box-sizing:border-box;flex-shrink:0"></span>`}</button>`; };
  const m = me();
  return `<div class="screen no-nav">
    <header style="padding:12px 8px 0;display:flex"><a href="#/home" aria-label="סגירה" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center">${ic('x', 22, C.ink, 2)}</a></header>
    <main style="flex:1;display:flex;flex-direction:column;gap:14px;padding:0 20px 20px">
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center">${jar(100, 168)}<h1 style="margin:4px 0 0;font-size:26px;font-weight:500">הגעתם ל-100 מטבעות!</h1>
        <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border-radius:999px;background:${colorsOf(m)[1]}">${av(m, 26)}<span style="font-size:14px;color:${colorsOf(m)[2]};font-weight:600">${esc(m.display_name)} צבר/ה הכי הרבה (${per[m.id] || 0}) - את/ה בוחר/ת!</span></div></div>
      <div role="radiogroup" aria-label="בחירת הפתעה" style="display:flex;flex-direction:column;gap:8px">${state.ideas.map(pick).join('')}
        <div style="display:flex;align-items:center;gap:10px;min-height:56px;padding:0 14px;border-radius:14px;background:#FFFFFF;border:1px dashed ${C.field}">${ic('plus', 18, C.muted, 2)}<input id="pick-other" placeholder="משהו אחר..." aria-label="הפתעה אחרת" style="flex:1;min-width:0;border:0;outline:none;background:transparent;font-size:15px;color:${C.ink}"></div></div>
      ${ui.error ? `<p class="err">${esc(ui.error)}</p>` : ''}
    </main>
    <div style="padding:12px 20px calc(30px + var(--safe-bottom));display:flex;flex-direction:column;gap:10px">
      <button data-action="redeem" style="height:54px;border-radius:14px;border:0;background:${C.ink};color:#FFFFFF;font-size:16px;font-weight:600;cursor:pointer" ${ui.busy ? 'disabled' : ''}>זאת ההפתעה!</button>
      <span style="font-size:12.5px;color:${C.muted};text-align:center">${partner() ? `${esc(partner().display_name)} יקבל/תקבל הודעה על הבחירה, ` : ''}והקופה תתאפס להפתעה הבאה</span></div></div>`;
}

// ---------------------------------------------------------------- settings / profile / invite
function prefOn(k) { try { return localStorage.getItem(`bayit-pref-${k}`) !== '0'; } catch { return true; } }
function screenSettings() {
  const card = (inner) => `<div style="background:#FFFFFF;border:1px solid ${C.line};border-radius:14px;padding:0 14px;display:flex;flex-direction:column">${inner}</div>`;
  const sec = (title, inner) => `<section style="display:flex;flex-direction:column;gap:8px"><h2 style="margin:0;padding:0 4px;font-size:13px;font-weight:500;color:${C.muted}">${title}</h2>${card(inner)}</section>`;
  const sep = (i) => (i ? `border-top:1px solid ${C.line};` : '');
  const memberRow = (m, i) => `<div style="display:flex;align-items:center;gap:12px;min-height:60px;${sep(i)}">${av(m, 36)}<span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:15px;font-weight:600">${esc(m.display_name)}</span><span style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:${C.muted}"><span style="width:7px;height:7px;border-radius:50%;background:#1E8A47"></span>${m.id === me()?.id ? 'את/ה · מחובר/ת' : 'חבר/ת בית'}</span></span><span style="font-size:12.5px;color:${C.muted};background:${C.grey};padding:3px 10px;border-radius:999px">${i === 0 ? 'מנהל/ת' : 'חבר/ה'}</span></div>`;
  const toggleRow = (k, icon, label, i) => `<div style="display:flex;align-items:center;gap:10px;min-height:48px;${sep(i)}">${ic(icon, 16, C.muted)}<span style="flex:1;font-size:14.5px">${label}</span>${switchBtn(prefOn(k), label, `data-action="pref" data-key="${k}"`)}</div>`;
  const linkRow = (href, icon, label, value, i, color = C.ink) => `<a href="${href}" style="display:flex;align-items:center;gap:10px;min-height:48px;${sep(i)}color:${color};text-decoration:none">${ic(icon, 16, color === C.ink ? C.muted : color)}<span style="flex:1;font-size:14.5px">${label}</span>${value ? `<span style="font-size:13.5px;color:${C.muted}">${value}</span>` : ''}${ic('back', 16, C.muted)}</a>`;
  return `<div class="screen">
    <header style="padding:20px 20px 12px;display:flex;align-items:flex-end;justify-content:space-between;gap:12px"><div style="display:flex;flex-direction:column;gap:2px"><h1 style="margin:0;font-size:20px;font-weight:500">הגדרות</h1><span style="font-size:13px;color:${C.muted}">${householdLine()}</span></div>${syncPill()}</header>
    <main style="padding:0 20px;display:flex;flex-direction:column;gap:20px">
      ${sec('חברי הבית', state.members.map(memberRow).join('') + `<a href="#/invite" style="display:flex;align-items:center;gap:10px;min-height:52px;border-top:1px solid ${C.line};color:${C.link};text-decoration:none;font-size:14.5px"><span style="width:36px;height:36px;border-radius:50%;border:1.5px dashed ${C.link};box-sizing:border-box;display:flex;align-items:center;justify-content:center">${ic('plus', 16, C.link, 2.5)}</span>הזמנת בן/בת משפחה</a>`)}
      ${sec('עדכונים מהבית', toggleRow('comment', 'chat', 'תגובה חדשה על משימה', 0) + toggleRow('shareddone', 'checks', 'משימה משותפת הושלמה', 1) + toggleRow('assigned', 'redo', 'משימה שויכה אליי', 2) + toggleRow('overdue', 'alert', 'משימות באיחור', 3))}
      ${sec('נושאים', TOPICS.map((tp, i) => `<a href="#/topic/${encodeURIComponent(tp.name)}" style="display:flex;align-items:center;gap:12px;min-height:52px;${sep(i)}color:${C.ink};text-decoration:none"><span style="width:30px;height:30px;border-radius:9px;background:${tp.color}1A;display:flex;align-items:center;justify-content:center">${ic(tp.icon, 16, tp.color, 1.6)}</span><span style="flex:1;font-size:14.5px">${esc(tp.name)}</span>${ic('back', 16, C.muted)}</a>`).join(''))}
      ${sec('חיבור ליומן', `<div style="display:flex;align-items:center;gap:10px;min-height:56px;opacity:.6">${ic('calendar', 16, C.muted)}<span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:14.5px">יומן גוגל שלי</span><span style="font-size:12.5px;color:${C.muted}">משימות עם תאריך יעד ייכנסו ליומן</span></span>${soon}</div>`)}
      ${sec('ברירות מחדל', `<div style="display:flex;align-items:center;gap:10px;min-height:48px;opacity:.6">${ic('bell', 16, C.muted)}<span style="flex:1;font-size:14.5px">תזכורת ברירת מחדל</span>${soon}</div>`)}
      ${sec('חשבון', linkRow('#/profile', 'users', 'הפרופיל שלי', '', 0) + `<button data-action="signout" style="display:flex;align-items:center;gap:10px;min-height:48px;border:0;border-top:1px solid ${C.line};background:none;padding:0;color:${C.red};font-size:14.5px;cursor:pointer;text-align:start;width:100%">${ic('back', 16, C.red)}יציאה מהחשבון</button>`)}
      ${ui.error ? `<p class="err">${esc(ui.error)}</p>` : ''}
    </main></div>${nav('settings')}`;
}
function screenProfile() {
  const m = me();
  return `<div class="screen">
    <header style="padding:12px 20px 8px;display:flex;flex-direction:column;gap:10px">${backLink('#/settings', 'הגדרות')}<h1 style="margin:0;font-size:20px;font-weight:500">הפרופיל שלי</h1></header>
    <main style="padding:8px 20px 0;display:flex;flex-direction:column;gap:20px">
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px">${av(m, 96)}
        <label style="display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 14px;border-radius:12px;border:1px solid ${C.field};background:#FFFFFF;font-size:14px;cursor:pointer">${ic('pencil', 16, C.ink)}${m?.avatar_url ? 'החלפת תמונה' : 'הוספת תמונה'}<input type="file" accept="image/*" data-action="avatar" class="sr"></label></div>
      <form data-form="rename" style="display:flex;flex-direction:column;gap:10px"><label for="p-name" style="font-size:14px;font-weight:700">השם שלי</label><div style="display:flex;gap:8px"><input id="p-name" name="name" value="${esc(m?.display_name)}" maxlength="30" style="flex:1;height:48px;padding:0 14px;border-radius:12px;border:1px solid ${C.field};font-size:16px"><button style="height:48px;padding:0 16px;border-radius:12px;border:1px solid ${C.field};background:#FFFFFF;font-size:15px;font-weight:600;cursor:pointer">שמירה</button></div></form>
      <div style="display:flex;flex-direction:column;gap:10px"><span style="font-size:14px;font-weight:700">הצבע שלי</span><div style="display:flex;gap:12px">${['purple', 'blue'].map((c) => `<button data-action="color" data-val="${c}" aria-pressed="${m?.color === c}" style="flex:1;height:52px;border-radius:12px;border:${m?.color === c ? `2px solid ${C.ink}` : `1px solid ${C.line}`};background:#FFFFFF;display:flex;align-items:center;justify-content:center;gap:10px;font-size:15px;font-weight:${m?.color === c ? 700 : 500};cursor:pointer"><span style="width:22px;height:22px;border-radius:50%;background:${COLORS[c][0]}"></span>${c === 'purple' ? 'סגול' : 'תכלת'}</button>`).join('')}</div>
        <span style="font-size:12.5px;color:${C.muted}">הצבע מסמן את המשימות שלך, ו״שנינו״ תמיד בטורקיז.</span></div>
      ${ui.error ? `<p class="err">${esc(ui.error)}</p>` : ''}
      <p style="margin:0;text-align:center;font-size:13px;color:${C.muted}">${esc(state.session?.email || '')}</p>
    </main></div>${nav('settings')}`;
}
function screenInvite() {
  const code = state.household?.invite_code || '';
  return `<div class="screen">
    <header style="padding:12px 20px 8px;display:flex;flex-direction:column;gap:10px">${backLink('#/settings', 'הגדרות')}<h1 style="margin:0;font-size:20px;font-weight:500">הזמנה לבית</h1></header>
    <main style="padding:8px 20px 0;display:flex;flex-direction:column;gap:18px">
      <p style="margin:0;font-size:15px;line-height:1.5;color:${C.muted}">שולחים את הקישור והקוד. אחרי ההרשמה, בוחרים ״יש לי קוד הזמנה״ ומזינים אותו.</p>
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px;border-radius:16px;background:#FFFFFF;border:1px solid ${C.line}"><span style="font-size:13px;color:${C.muted}">קוד ההזמנה</span><b dir="ltr" style="font-size:32px;font-weight:600;letter-spacing:8px">${esc(code)}</b></div>
      <button data-action="share-code" style="height:52px;border-radius:14px;border:0;background:${C.ink};color:#FFFFFF;font-size:16px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer">${ic('send', 18, '#FFFFFF')}שליחת הזמנה</button>
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
    if (key !== lastKey) {
      if (a === 'tasks' && params.get('when')) ui.filters = { who: [], when: [params.get('when')], prio: [] };
      ui.openFilter = null; ui.statusOpen = null; ui.menuOpen = null;
      if (a !== 'task' || b !== ui.addSub) ui.addSub = null;
    }
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
      : a === 'profile' ? screenProfile()
      : a === 'invite' ? screenInvite()
      : screenHome();
  }
  const scroll = key === lastKey ? window.scrollY : 0;
  const focusId = document.activeElement?.id;
  $app.innerHTML = (DEMO ? '<div class="demo">מצב הדגמה · הנתונים לא נשמרים</div>' : '') + html;
  window.scrollTo(0, scroll);
  if (key !== lastKey) {
    ui.error = '';
    if (parts[0] === 'new') setTimeout(() => document.getElementById('f-title')?.focus(), 50);
    if (params.get('focus') === 'date') setTimeout(() => { const d = document.getElementById('f-date'); d?.focus(); try { d?.showPicker?.(); } catch {} }, 80);
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
    const nt = t.repeat && state.tasks.find((x) => x.id === state.tasks.find((y) => y.id === id)?.next_id);
    toast(`${coin(18)} +${pts} מטבעות${t.assignee ? '' : ' לכל אחד'}${nt ? ` · הבאה: ${fmtDate(nt.due_date)}` : ''}`);
  }
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action, id = el.dataset.id;
  if (el.tagName === 'BUTTON' && el.type !== 'submit') e.preventDefault();
  if (a === 'toggle') return toggle(id);
  if (a === 'status') { ui.statusOpen = null; return run(() => api.updateTask(id, { status: el.dataset.status })); }
  if (a === 'status-open') { ui.statusOpen = ui.statusOpen === id ? null : id; return render(); }
  if (a === 'status-close') { ui.statusOpen = null; return render(); }
  if (a === 'menu-open') { ui.menuOpen = id; return render(); }
  if (a === 'menu-close') { ui.menuOpen = null; ui.confirmDelete = null; return render(); }
  if (a === 'filter-open') { ui.openFilter = ui.openFilter === el.dataset.key ? null : el.dataset.key; return render(); }
  if (a === 'filter-close') { ui.openFilter = null; return render(); }
  if (a === 'filter-toggle') {
    const arr = ui.filters[el.dataset.key], v = el.dataset.val;
    const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v);
    if (location.hash.includes('?')) history.replaceState(null, '', '#/tasks');
    return render();
  }
  if (a === 'filter-clear') { ui.filters[el.dataset.key] = []; ui.openFilter = null; if (location.hash.includes('?')) history.replaceState(null, '', '#/tasks'); return render(); }
  if (a === 'w-owner') { ui.wOwner = el.dataset.val; return render(); }
  if (a === 'show-add-sub') { ui.addSub = id; render(); document.getElementById('sub-input')?.focus(); return; }
  if (a === 'mark-read') { try { localStorage.setItem(SEEN_KEY(), new Date().toISOString()); } catch {} return render(); }
  if (a === 'pref') { const k = el.dataset.key; try { localStorage.setItem(`bayit-pref-${k}`, prefOn(k) ? '0' : '1'); } catch {} return render(); }
  if (a === 'auth-mode') { ui.authMode = el.dataset.mode; ui.error = ''; return render(); }
  if (a === 'signout') return run(() => api.signOut());
  if (a === 'set') {
    const k = el.dataset.key; let v = el.dataset.val;
    if (k === 'priority') v = Number(v);
    if (k === 'hasDate') { v = v === 'true'; if (v && !ui.form.due_date) ui.form.due_date = today(); }
    ui.form[k] = v; return render();
  }
  if (a === 'duplicate') {
    const t = state.tasks.find((x) => x.id === id);
    ui.menuOpen = null;
    let copy;
    await run(async () => {
      copy = await api.addTask({ title: t.title, notes: t.notes || null, assignee: t.assignee, priority: t.priority, topic: t.topic, due_date: t.due_date, repeat: t.repeat || null });
      for (const s of subsOf(t.id)) await api.addTask({ title: s.title, parent_id: copy.id, assignee: s.assignee, priority: s.priority });
    });
    if (!ui.error && copy) { toast('המשימה שוכפלה'); location.hash = `#/task/${copy.id}`; }
    return;
  }
  if (a === 'delete') {
    if (ui.confirmDelete !== id) { ui.confirmDelete = id; return render(); }
    const t = state.tasks.find((x) => x.id === id);
    ui.menuOpen = null;
    await run(() => api.deleteTask(id));
    location.hash = t?.parent_id ? `#/task/${t.parent_id}` : '#/tasks';
    return;
  }
  if (a === 'del-idea') return run(() => api.deleteIdea(id));
  if (a === 'color') return run(() => api.updateProfile({ color: el.dataset.val }));
  if (a === 'pick') { ui.pick = el.dataset.val; const o = document.getElementById('pick-other'); if (o) o.value = ''; return render(); }
  if (a === 'redeem') {
    const other = document.getElementById('pick-other')?.value.trim();
    const choice = other || ui.pick;
    if (!choice) { ui.error = 'בוחרים רעיון או כותבים משהו אחר'; return render(); }
    await run(() => api.redeem(choice));
    if (!ui.error) { ui.pick = null; toast(`🎉 ההפתעה: ${esc(choice)}`); location.hash = '#/rewards'; }
    return;
  }
  if (a === 'share-code') {
    const code = state.household?.invite_code;
    const text = `הצטרפ/י לבית שלנו באפליקציה: ${location.origin + location.pathname}\nקוד הזמנה: ${code}`;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('ההזמנה הועתקה'); } } catch {}
  }
});

document.addEventListener('input', (e) => {
  const b = e.target.dataset?.bind;
  if (b && ui.form) ui.form[b] = e.target.value;
});
async function resizeImage(file, max = 320) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const s = Math.min(img.width, img.height);
  const c = document.createElement('canvas'); c.width = c.height = Math.min(max, s);
  c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
}
document.addEventListener('change', (e) => {
  if (e.target.dataset?.action === 'avatar' && e.target.files?.[0]) {
    const f = e.target.files[0];
    run(async () => { await api.uploadAvatar(await resizeImage(f)); }).then(() => { if (!ui.error) toast('התמונה עודכנה'); });
    return;
  }
  const b = e.target.dataset?.bind;
  if (b && ui.form) { ui.form[b] = e.target.value; if (b === 'due_date' || b === 'topic') render(); }
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
    await run(() => api.addComment(form.dataset.id, body));
    return;
  }
  if (kind === 'add-sub') {
    const title = (fd.title || '').trim(); if (!title) return;
    ui.addSub = form.dataset.id;
    await run(() => api.addTask({ title, parent_id: form.dataset.id, assignee: null, priority: 2 }));
    document.getElementById('sub-input')?.focus();
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
    if (!f.title.trim()) { ui.error = 'צריך לכתוב מה המשימה'; return render(); }
    const row = {
      title: f.title.trim(),
      notes: (f.notes || '').trim() || null,
      assignee: f.assignee === 'both' ? null : f.assignee,
      due_date: f.hasDate && f.due_date ? f.due_date : null,
      priority: f.priority,
    };
    if (!f.parent_id) {
      row.topic = f.topic || null;
      row.repeat = f.repeat || null;
      if (row.repeat && !row.due_date) row.due_date = today();
    }
    let created;
    await run(async () => {
      if (f.id) await api.updateTask(f.id, row);
      else created = await api.addTask(row);
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
