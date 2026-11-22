// שכבת הנתונים: Supabase אמיתי, או מצב הדגמה בזיכרון כשאין הגדרות.
const cfg = window.BAYIT_CONFIG || {};
export const DEMO = !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY;

const listeners = new Set();
export const state = {
  ready: false,
  session: null,      // { userId, email }
  me: null,           // profile
  household: null,
  members: [],
  tasks: [],
  comments: [],
  coins: [],
  ideas: [],
  redemptions: [],
};
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn(state)); }

// ---------------------------------------------------------------- Supabase
let sb = null;
let channel = null;
let refreshTimer = null;

async function sbInit() {
  const { createClient } = window.supabase;
  sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  const { data } = await sb.auth.getSession();
  await setSession(data.session);
  sb.auth.onAuthStateChange((_e, session) => { setSession(session); });
}

async function setSession(session) {
  const uid = session?.user?.id || null;
  if (uid && state.session?.userId === uid && state.ready) return;
  state.session = uid ? { userId: uid, email: session.user.email } : null;
  if (!uid) {
    Object.assign(state, { me: null, household: null, members: [], tasks: [], comments: [], coins: [], ideas: [], redemptions: [] });
    if (channel) { sb.removeChannel(channel); channel = null; }
    state.ready = true; emit(); return;
  }
  await sbRefresh();
  subscribe();
  state.ready = true; emit();
}

function check({ data, error }) { if (error) throw new Error(error.message); return data; }

async function sbRefresh() {
  const uid = state.session?.userId;
  if (!uid) return;
  const me = check(await sb.from('profiles').select('*').eq('id', uid).maybeSingle());
  state.me = me;
  if (!me?.household_id) {
    Object.assign(state, { household: null, members: [], tasks: [], comments: [], coins: [], ideas: [], redemptions: [] });
    return;
  }
  const [household, members, tasks, comments, coins, ideas, redemptions] = await Promise.all([
    sb.from('households').select('*').eq('id', me.household_id).single().then(check),
    sb.from('profiles').select('*').eq('household_id', me.household_id).order('created_at').then(check),
    sb.from('tasks').select('*').order('created_at').then(check),
    sb.from('comments').select('*').order('created_at').then(check),
    sb.from('coin_events').select('*').order('created_at', { ascending: false }).then(check),
    sb.from('reward_ideas').select('*').order('created_at').then(check),
    sb.from('redemptions').select('*').order('created_at', { ascending: false }).then(check),
  ]);
  Object.assign(state, { household, members, tasks, comments, coins, ideas, redemptions });
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => { try { await sbRefresh(); emit(); } catch (e) { console.warn(e); } }, 250);
}

function subscribe() {
  if (channel) return;
  channel = sb.channel('bayit');
  for (const t of ['tasks', 'comments', 'coin_events', 'reward_ideas', 'redemptions', 'profiles']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, scheduleRefresh);
  }
  channel.subscribe();
  // חזרה לאפליקציה אחרי שהטלפון היה ברקע
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRefresh(); });
}

async function after(promise) { const r = check(await promise); await sbRefresh(); emit(); return r; }

const remote = {
  signUp: async (email, password, name) => {
    const r = check(await sb.auth.signUp({ email, password, options: { data: { display_name: name } } }));
    if (!r.session) throw new Error('נשלח מייל אישור. אם לא ביקשת אישור במייל, כבי את Confirm email ב-Supabase.');
  },
  signIn: async (email, password) => { check(await sb.auth.signInWithPassword({ email, password })); },
  signOut: async () => { await sb.auth.signOut(); },
  createHousehold: (name) => after(sb.rpc('create_household', { p_name: name })),
  joinHousehold: (code) => after(sb.rpc('join_household', { p_code: code })),
  addTask: (t) => after(sb.from('tasks').insert(t).select().single()),
  updateTask: (id, patch) => after(sb.from('tasks').update(patch).eq('id', id).select().single()),
  deleteTask: (id) => after(sb.from('tasks').delete().eq('id', id)),
  addComment: (task_id, body) => after(sb.from('comments').insert({ task_id, body }).select().single()),
  addIdea: (label) => after(sb.from('reward_ideas').insert({ label }).select().single()),
  deleteIdea: (id) => after(sb.from('reward_ideas').delete().eq('id', id)),
  redeem: (surprise) => after(sb.rpc('redeem_surprise', { p_surprise: surprise })),
  rename: (display_name) => after(sb.from('profiles').update({ display_name }).eq('id', state.session.userId)),
};

// ---------------------------------------------------------------- מצב הדגמה
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
function iso(d) { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); }
function ago(hours) { return new Date(Date.now() - hours * 3600e3).toISOString(); }

function demoSeed() {
  const M = 'demo-maayan', R = 'demo-rihan', H = 'demo-house';
  state.session = { userId: M, email: 'maayan@demo' };
  state.household = { id: H, name: 'הבית שלנו', invite_code: 'A7K2Q9' };
  state.members = [
    { id: M, display_name: 'מעיין', color: 'purple', household_id: H },
    { id: R, display_name: 'ריחן', color: 'blue', household_id: H },
  ];
  state.me = state.members[0];
  const t = (title, o) => ({ id: uuid(), household_id: H, parent_id: null, title, assignee: null, priority: 2, topic: null,
    status: 'todo', due_date: null, created_by: M, completed_by: null, completed_at: null, created_at: ago(48), ...o });
  const shed = t('לסדר את המחסן', { topic: 'שיפוץ', status: 'doing', due_date: daysFromNow(8) });
  const friday = t('קניות לארוחת שישי', { topic: 'אירועים משפחתיים', status: 'doing', due_date: daysFromNow(0) });
  state.tasks = [
    t('לחדש ביטוח רכב', { assignee: M, topic: 'ביטוחים ואישורים', priority: 3, due_date: daysFromNow(-3) }),
    t('להחזיר לשכנים את המקדחה', { assignee: R, topic: 'תחזוקת בית שוטפת', priority: 1, due_date: daysFromNow(-2), created_by: R }),
    friday,
    t('להתקשר לאינסטלטור בגלל הנזילה', { assignee: R, topic: 'תחזוקת בית שוטפת', priority: 3, due_date: daysFromNow(0), created_by: R, created_at: ago(5) }),
    t('לשלם חשבון חשמל', { assignee: M, topic: 'כספים', due_date: daysFromNow(3) }),
    t('לקבוע תור לסקירת מערכות', { topic: 'תורים לרופא ובריאות', priority: 3, due_date: daysFromNow(5) }),
    shed,
    t('להרכיב את העריסה', { topic: 'לקראת הלידה', due_date: daysFromNow(12) }),
    t('לקנות עגלה', { topic: 'לקראת הלידה', priority: 3 }),
    t('להשוות אפשרויות לספה', { topic: 'קניות חד פעמיות', priority: 1 }),
    t('לתקן את הידית בארון', { assignee: R, topic: 'תחזוקת בית שוטפת', priority: 1, created_by: R }),
    t('ללמוד לנגן בגיטרה', { assignee: M, topic: 'פרויקטים אישיים', priority: 1 }),
    t('לשלם ארנונה', { assignee: M, topic: 'כספים', status: 'done', completed_by: M, completed_at: ago(26), due_date: daysFromNow(-1) }),
    t('לנקות את המזגן', { assignee: R, topic: 'תחזוקת בית שוטפת', status: 'done', completed_by: R, completed_at: ago(3), due_date: daysFromNow(0) }),
  ];
  const sub = (title, done, assignee) => t(title, { parent_id: shed.id, assignee, status: done ? 'done' : 'todo', completed_at: done ? ago(20) : null });
  state.tasks.push(sub('לפנות ולמיין את מה שיש במחסן', true, null), sub('לשטוף את הרצפה והקירות', true, R),
    sub('לסייד', false, R), sub('להחליף מנעול', false, M), sub('לרהט - מדפים וארון אחסון', false, null));
  state.comments = [
    { id: uuid(), task_id: friday.id, author_id: R, body: 'אני אקנה יין וגבינות בדרך הביתה.', created_at: ago(20) },
    { id: uuid(), task_id: friday.id, author_id: M, body: 'מעולה, אני אקח ירקות ולחם מהשוק מחר בבוקר.', created_at: ago(14) },
    { id: uuid(), task_id: friday.id, author_id: R, body: 'לא לשכוח קרקרים ללא גלוטן בשביל דנה!', created_at: ago(2) },
  ];
  state.coins = [
    { id: uuid(), user_id: R, title: 'לנקות את המזגן', amount: 5, created_at: ago(3) },
    { id: uuid(), user_id: M, title: 'לשלם ארנונה', amount: 10, created_at: ago(26) },
    { id: uuid(), user_id: M, title: 'להזמין טכנאי למקרר', amount: 15, created_at: ago(50) },
    { id: uuid(), user_id: R, title: 'להזמין טכנאי למקרר', amount: 15, created_at: ago(50) },
    { id: uuid(), user_id: M, title: 'לקנות מתנה לאמא', amount: 15, created_at: ago(70) },
    { id: uuid(), user_id: R, title: 'לתקן את הברז', amount: 10, created_at: ago(90) },
  ];
  state.ideas = ['ארוחה זוגית במסעדה', 'עיסוי זוגי', 'יום ספא', 'הופעה', 'סופ״ש בצימר'].map((label) => ({ id: uuid(), label, created_by: M }));
  state.redemptions = [];
}

function demoAward(task, before) {
  if (task.parent_id) return;
  if (task.status === 'done' && before !== 'done') {
    const pts = { 1: 5, 2: 10, 3: 15 }[task.priority] || 10;
    const who = task.assignee ? [task.assignee] : state.members.map((m) => m.id);
    for (const u of who) state.coins.unshift({ id: uuid(), user_id: u, task_id: task.id, title: task.title, amount: pts, created_at: new Date().toISOString() });
  } else if (before === 'done' && task.status !== 'done') {
    const last = state.redemptions[0]?.created_at || '';
    state.coins = state.coins.filter((c) => !(c.task_id === task.id && c.created_at > last));
  }
}

const demo = {
  signUp: async () => {}, signIn: async () => {}, signOut: async () => { alert('במצב הדגמה אין התנתקות'); },
  createHousehold: async () => {}, joinHousehold: async () => {},
  addTask: async (t) => {
    const row = { id: uuid(), household_id: state.household.id, parent_id: null, assignee: null, priority: 2, topic: null, status: 'todo',
      due_date: null, created_by: state.me.id, completed_by: null, completed_at: null, created_at: new Date().toISOString(), ...t };
    state.tasks.push(row); demoAward(row, 'todo'); emit(); return row;
  },
  updateTask: async (id, patch) => {
    const row = state.tasks.find((x) => x.id === id); const before = row.status;
    Object.assign(row, patch);
    if (patch.status === 'done' && before !== 'done') { row.completed_at = new Date().toISOString(); row.completed_by = state.me.id; }
    if (patch.status && patch.status !== 'done') { row.completed_at = null; row.completed_by = null; }
    demoAward(row, before); emit(); return row;
  },
  deleteTask: async (id) => {
    const kill = new Set([id, ...state.tasks.filter((t) => t.parent_id === id).map((t) => t.id)]);
    state.tasks = state.tasks.filter((t) => !kill.has(t.id)); emit();
  },
  addComment: async (task_id, body) => { state.comments.push({ id: uuid(), task_id, author_id: state.me.id, body, created_at: new Date().toISOString() }); emit(); },
  addIdea: async (label) => { state.ideas.push({ id: uuid(), label, created_by: state.me.id }); emit(); },
  deleteIdea: async (id) => { state.ideas = state.ideas.filter((i) => i.id !== id); emit(); },
  redeem: async (surprise) => { state.redemptions.unshift({ id: uuid(), surprise, chosen_by: state.me.id, created_at: new Date().toISOString() }); emit(); },
  rename: async (name) => { state.me.display_name = name; emit(); },
};

// ---------------------------------------------------------------- API
export const api = new Proxy({}, { get: (_, k) => (DEMO ? demo : remote)[k] });

export async function init() {
  if (DEMO) { demoSeed(); state.ready = true; emit(); return; }
  await sbInit();
}
