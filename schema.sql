-- =====================================================================
-- הבית שלנו - מסד הנתונים ב-Supabase
-- הדביקי את כל הקובץ ב-SQL Editor ולחצי Run (פעם אחת).
-- =====================================================================

create extension if not exists pgcrypto;

-- ניקוי (מאפשר להריץ את הקובץ שוב בלי שגיאות)
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.redemptions, public.reward_ideas, public.coin_events,
  public.comments, public.tasks, public.profiles, public.households cascade;
drop function if exists public.my_household(), public.handle_new_user(), public.tasks_before_update(),
  public.award_coins(), public.create_household(text), public.join_household(text), public.redeem_surprise(text) cascade;


-- ---------- בתים ----------
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'הבית שלנו',
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_at  timestamptz not null default now()
);

-- ---------- פרופילים (אחד לכל משתמש) ----------
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null,
  household_id uuid references public.households on delete set null,
  color        text not null default 'purple' check (color in ('purple', 'blue')),
  created_at   timestamptz not null default now()
);

-- הבית של המשתמש המחובר (משמש בכל ההרשאות)
create or replace function public.my_household()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from public.profiles where id = auth.uid()
$$;

-- פרופיל נוצר אוטומטית בהרשמה
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- משימות (וגם תתי משימות: parent_id) ----------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  parent_id    uuid references public.tasks on delete cascade,
  title        text not null check (length(title) between 1 and 200),
  assignee     uuid references public.profiles on delete set null,   -- ריק = שנינו
  priority     smallint not null default 2 check (priority between 1 and 3), -- 1 נמוכה, 2 בינונית, 3 גבוהה
  topic        text,
  status       text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  due_date     date,
  created_by   uuid default auth.uid() references public.profiles on delete set null,
  completed_by uuid references public.profiles on delete set null,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.tasks (household_id);
create index on public.tasks (parent_id);

-- ---------- תגובות ----------
create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  task_id      uuid not null references public.tasks on delete cascade,
  author_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  body         text not null check (length(body) between 1 and 2000),
  created_at   timestamptz not null default now()
);
create index on public.comments (task_id);

-- ---------- קופת ההפתעות ----------
create table public.coin_events (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  user_id      uuid not null references public.profiles on delete cascade,
  task_id      uuid references public.tasks on delete set null,
  title        text not null,
  amount       int not null,
  created_at   timestamptz not null default now(),
  unique (task_id, user_id)
);

create table public.reward_ideas (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  label        text not null check (length(label) between 1 and 80),
  created_by   uuid default auth.uid() references public.profiles on delete set null,
  created_at   timestamptz not null default now()
);

create table public.redemptions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  surprise     text not null,
  chosen_by    uuid references public.profiles on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------- טריגרים למשימות ----------
create or replace function public.tasks_before_update()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'done' and old.status <> 'done' then
    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif new.status <> 'done' and old.status = 'done' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end $$;

create trigger tasks_before_update
  before update on public.tasks
  for each row execute function public.tasks_before_update();

-- מטבעות: רק משימה שלמה (לא תת משימה). נמוכה 5, בינונית 10, גבוהה 15.
-- משימה משותפת נותנת מטבעות לשניכם.
create or replace function public.award_coins()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pts int;
  last_redeem timestamptz;
begin
  if new.parent_id is not null then
    return new;
  end if;

  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    pts := case new.priority when 1 then 5 when 3 then 15 else 10 end;
    if new.assignee is null then
      insert into coin_events (household_id, user_id, task_id, title, amount)
      select new.household_id, p.id, new.id, new.title, pts
      from profiles p where p.household_id = new.household_id
      on conflict (task_id, user_id) do nothing;
    else
      insert into coin_events (household_id, user_id, task_id, title, amount)
      values (new.household_id, new.assignee, new.id, new.title, pts)
      on conflict (task_id, user_id) do nothing;
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'done' and new.status <> 'done' then
    select max(created_at) into last_redeem from redemptions where household_id = new.household_id;
    delete from coin_events
    where task_id = new.id and created_at > coalesce(last_redeem, '-infinity'::timestamptz);
  end if;
  return new;
end $$;

create trigger tasks_award_coins
  after insert or update of status on public.tasks
  for each row execute function public.award_coins();

-- ---------- פעולות (RPC) ----------
-- יצירת בית חדש (המשתמש הראשון)
create or replace function public.create_household(p_name text default 'הבית שלנו')
returns public.households language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into households (name) values (coalesce(nullif(p_name, ''), 'הבית שלנו')) returning * into h;
  update profiles set household_id = h.id, color = 'purple' where id = auth.uid();
  insert into reward_ideas (household_id, label, created_by)
  select h.id, x, auth.uid() from unnest(array['ארוחה זוגית במסעדה', 'עיסוי זוגי', 'יום ספא', 'הופעה', 'סופ״ש בצימר']) as x;
  return h;
end $$;

-- הצטרפות לבית קיים עם קוד הזמנה
create or replace function public.join_household(p_code text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h households; members int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into h from households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'קוד הזמנה לא נמצא'; end if;
  select count(*) into members from profiles where household_id = h.id and id <> auth.uid();
  if members >= 6 then raise exception 'הבית מלא'; end if;
  update profiles
     set household_id = h.id,
         color = case when members = 0 then 'purple' else 'blue' end
   where id = auth.uid();
  return h;
end $$;

-- מימוש הפתעה כשהקופה הגיעה ל-100
create or replace function public.redeem_surprise(p_surprise text)
returns public.redemptions language plpgsql security definer set search_path = public as $$
declare
  hid uuid := my_household();
  last_redeem timestamptz;
  total int;
  r redemptions;
begin
  if hid is null then raise exception 'no household'; end if;
  select max(created_at) into last_redeem from redemptions where household_id = hid;
  select coalesce(sum(amount), 0) into total from coin_events
   where household_id = hid and created_at > coalesce(last_redeem, '-infinity'::timestamptz);
  if total < 100 then raise exception 'עוד לא הגעתם ל-100 מטבעות'; end if;
  insert into redemptions (household_id, surprise, chosen_by)
  values (hid, p_surprise, auth.uid()) returning * into r;
  return r;
end $$;

-- ---------- הרשאות (Row Level Security) ----------
alter table public.households   enable row level security;
alter table public.profiles     enable row level security;
alter table public.tasks        enable row level security;
alter table public.comments     enable row level security;
alter table public.coin_events  enable row level security;
alter table public.reward_ideas enable row level security;
alter table public.redemptions  enable row level security;

create policy "households: read own"   on public.households for select using (id = public.my_household());
create policy "households: rename own" on public.households for update using (id = public.my_household());

create policy "profiles: read household" on public.profiles for select
  using (id = auth.uid() or household_id = public.my_household());
create policy "profiles: update self" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
-- גישה בסיסית לטבלאות (ההרשאות בפועל נקבעות ע״י המדיניות למעלה)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- אפשר לשנות רק את השם. בית וצבע משתנים רק דרך הפעולות למעלה.
revoke update on public.profiles from authenticated, anon;
grant update (display_name) on public.profiles to authenticated;

create policy "tasks: household" on public.tasks for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());

create policy "comments: read" on public.comments for select using (household_id = public.my_household());
create policy "comments: write" on public.comments for insert
  with check (household_id = public.my_household() and author_id = auth.uid());
create policy "comments: delete own" on public.comments for delete using (author_id = auth.uid());

create policy "coins: read" on public.coin_events for select using (household_id = public.my_household());

create policy "ideas: household" on public.reward_ideas for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());

create policy "redemptions: read" on public.redemptions for select using (household_id = public.my_household());

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text)   to authenticated;
grant execute on function public.redeem_surprise(text)  to authenticated;

-- ---------- סנכרון בזמן אמת ----------
alter publication supabase_realtime add table
  public.tasks, public.comments, public.coin_events, public.reward_ideas, public.redemptions, public.profiles;
