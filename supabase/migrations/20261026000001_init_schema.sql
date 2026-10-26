-- =============================================================================
-- EdgeTrack — initial schema
-- Tables: profiles, bets, bankroll_transactions, audit_log, login_attempts
-- Every user-owned table has row-level security: a user can only ever see or
-- modify rows where user_id = auth.uid().
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles — one row per auth user, holds username + preferences
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  username              text not null,
  currency              text not null default 'INR',
  date_format           text not null default 'dd MMM yyyy',
  odds_precision        smallint not null default 2,
  default_stake         numeric(14, 2),
  default_status        text not null default 'pending',
  dashboard_range       text not null default 'all',
  stake_warning_enabled boolean not null default false,
  stake_warning_percent numeric(5, 2) not null default 5,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint profiles_username_format check (username ~ '^[A-Za-z0-9._@-]{3,32}$'),
  constraint profiles_currency_check check (currency in ('INR','USD','EUR','GBP','AUD','CAD','NZD','ZAR','NGN','KES','BRL','JPY')),
  constraint profiles_date_format_check check (date_format in ('dd MMM yyyy','dd/MM/yyyy','MM/dd/yyyy','yyyy-MM-dd')),
  constraint profiles_odds_precision_check check (odds_precision in (2, 3)),
  constraint profiles_default_stake_check check (default_stake is null or default_stake > 0),
  constraint profiles_default_status_check check (default_status in ('pending','won','lost','void','half_won','half_lost','cashed_out')),
  constraint profiles_dashboard_range_check check (dashboard_range in ('today','last7','last30','thisMonth','lastMonth','ytd','all')),
  constraint profiles_stake_warning_percent_check check (stake_warning_percent > 0 and stake_warning_percent <= 100)
);

comment on table public.profiles is 'Per-user profile and display preferences.';

-- Usernames are unique case-insensitively.
create unique index profiles_username_lower_key on public.profiles (lower(username));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically whenever an auth user is created.
-- The username comes from user metadata (set by scripts/create-user.mjs).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  desired text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
begin
  if desired is null or desired !~ '^[A-Za-z0-9._@-]{3,32}$' then
    desired := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;
  insert into public.profiles (id, username) values (new.id, desired);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- bets
-- -----------------------------------------------------------------------------
create table public.bets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bet_name       text not null,
  sport          text not null,
  league         text,
  event          text,
  bet_type       text not null,
  stake          numeric(14, 2) not null,
  odds           numeric(10, 4) not null,
  status         text not null default 'pending',
  cashout_amount numeric(14, 2),
  bookmaker      text,
  reference_id   text,
  notes          text,
  tags           text[] not null default '{}',
  bet_date       timestamptz not null default now(),
  settled_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Realised figures, derived in the database with the same rules as the
  -- client settlement module (src/lib/settlement.ts). numeric round() is
  -- half-away-from-zero, matching the client.
  net_profit numeric(14, 2) generated always as (
    case status
      when 'won'        then round(stake * (odds - 1), 2)
      when 'lost'       then -stake
      when 'void'       then 0
      when 'half_won'   then round(stake * (odds - 1) / 2, 2)
      when 'half_lost'  then round(-stake / 2, 2)
      when 'cashed_out' then cashout_amount - stake
      else null
    end
  ) stored,
  payout numeric(14, 2) generated always as (
    case status
      when 'won'        then stake + round(stake * (odds - 1), 2)
      when 'lost'       then 0
      when 'void'       then stake
      when 'half_won'   then stake + round(stake * (odds - 1) / 2, 2)
      when 'half_lost'  then stake + round(-stake / 2, 2)
      when 'cashed_out' then cashout_amount
      else null
    end
  ) stored,

  constraint bets_bet_name_check check (char_length(trim(bet_name)) between 1 and 200),
  constraint bets_sport_check check (char_length(trim(sport)) between 1 and 60),
  constraint bets_league_check check (league is null or char_length(league) <= 100),
  constraint bets_event_check check (event is null or char_length(event) <= 200),
  constraint bets_bookmaker_check check (bookmaker is null or char_length(bookmaker) <= 60),
  constraint bets_reference_id_check check (reference_id is null or char_length(reference_id) <= 100),
  constraint bets_notes_check check (notes is null or char_length(notes) <= 2000),
  constraint bets_tags_check check (cardinality(tags) <= 20),
  constraint bets_bet_type_check check (bet_type in ('moneyline','spread','over_under','player_props','parlay','live','futures','other')),
  constraint bets_status_check check (status in ('pending','won','lost','void','half_won','half_lost','cashed_out')),
  constraint bets_stake_check check (stake > 0),
  constraint bets_odds_check check (odds >= 1.01 and odds <= 1000),
  constraint bets_cashout_amount_check check (cashout_amount is null or cashout_amount >= 0),
  -- A cash-out amount is required for cashed-out bets and forbidden otherwise.
  constraint bets_cashout_consistency check ((status = 'cashed_out') = (cashout_amount is not null))
);

comment on table public.bets is 'Individual bets. Stake and odds are stored as entered so history stays exact.';
comment on column public.bets.payout is 'Total returned including stake (null while pending).';
comment on column public.bets.net_profit is 'payout − stake (null while pending).';

create index bets_user_bet_date_idx on public.bets (user_id, bet_date desc);
create index bets_user_status_idx on public.bets (user_id, status);
create index bets_user_sport_idx on public.bets (user_id, sport);
create index bets_user_bookmaker_idx on public.bets (user_id, bookmaker);

create trigger bets_set_updated_at
  before update on public.bets
  for each row execute function public.set_updated_at();

-- Maintain settled_at and protect ownership/immutable columns.
create or replace function public.bets_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'user_id cannot be changed' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
  end if;

  if new.status = 'pending' then
    new.settled_at := null;
  elsif tg_op = 'INSERT' or old.status = 'pending' or new.status is distinct from old.status then
    new.settled_at := now();
  else
    new.settled_at := old.settled_at;
  end if;
  return new;
end;
$$;

create trigger bets_before_write
  before insert or update on public.bets
  for each row execute function public.bets_before_write();

-- -----------------------------------------------------------------------------
-- bankroll_transactions — capital movements, kept separate from betting P/L
-- -----------------------------------------------------------------------------
create table public.bankroll_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type        text not null,
  amount      numeric(14, 2) not null,
  occurred_at timestamptz not null default now(),
  description text,
  created_at  timestamptz not null default now(),

  constraint bankroll_transactions_type_check check (type in ('initial','deposit','withdrawal')),
  constraint bankroll_transactions_amount_check check (amount > 0),
  constraint bankroll_transactions_description_check check (description is null or char_length(description) <= 200)
);

comment on table public.bankroll_transactions is 'Deposits, withdrawals and the initial bankroll. Never counted as betting profit.';

create index bankroll_transactions_user_date_idx on public.bankroll_transactions (user_id, occurred_at);
-- At most one initial bankroll entry per user.
create unique index bankroll_transactions_one_initial_idx
  on public.bankroll_transactions (user_id) where type = 'initial';

create or replace function public.bankroll_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed' using errcode = '42501';
  end if;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger bankroll_before_update
  before update on public.bankroll_transactions
  for each row execute function public.bankroll_before_update();

-- -----------------------------------------------------------------------------
-- audit_log — immutable history of every change to bets & transactions, so
-- edits and deletes never lose the original record.
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  table_name text not null,
  record_id  uuid not null,
  action     text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data   jsonb,
  new_data   jsonb,
  changed_at timestamptz not null default now()
);

create index audit_log_user_changed_idx on public.audit_log (user_id, changed_at desc);
create index audit_log_record_idx on public.audit_log (record_id);

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Skip when the owning account itself is being deleted (cascade).
  if not exists (select 1 from auth.users u where u.id = coalesce(new.user_id, old.user_id)) then
    return null;
  end if;
  insert into public.audit_log (user_id, table_name, record_id, action, old_data, new_data)
  values (
    coalesce(new.user_id, old.user_id),
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger bets_audit
  after insert or update or delete on public.bets
  for each row execute function public.write_audit_log();

create trigger bankroll_transactions_audit
  after insert or update or delete on public.bankroll_transactions
  for each row execute function public.write_audit_log();

-- -----------------------------------------------------------------------------
-- login_attempts — used only by the username-login Edge Function (service
-- role) for brute-force throttling. Not accessible to clients at all.
-- -----------------------------------------------------------------------------
create table public.login_attempts (
  id           bigint generated always as identity primary key,
  username_key text not null,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);

create index login_attempts_lookup_idx on public.login_attempts (username_key, attempted_at desc);

-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.bets                  enable row level security;
alter table public.bankroll_transactions enable row level security;
alter table public.audit_log             enable row level security;
alter table public.login_attempts        enable row level security;

alter table public.profiles              force row level security;
alter table public.bets                  force row level security;
alter table public.bankroll_transactions force row level security;
alter table public.audit_log             force row level security;
alter table public.login_attempts        force row level security;

-- Anonymous visitors get nothing.
revoke all on public.profiles, public.bets, public.bankroll_transactions, public.audit_log, public.login_attempts from anon;
revoke all on public.login_attempts from authenticated;
revoke all on public.audit_log from authenticated;
revoke all on public.profiles from authenticated;

-- profiles: read own; update only preference columns (never id/username/created_at).
grant select on public.profiles to authenticated;
grant update (currency, date_format, odds_precision, default_stake, default_status,
              dashboard_range, stake_warning_enabled, stake_warning_percent)
  on public.profiles to authenticated;

create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- bets: full CRUD on own rows only.
-- UPDATE is granted per column so ownership/timestamps can never be rewritten.
grant select, insert, delete on public.bets to authenticated;
grant update (bet_name, sport, league, event, bet_type, stake, odds, status, cashout_amount,
              bookmaker, reference_id, notes, tags, bet_date)
  on public.bets to authenticated;

create policy "bets: read own" on public.bets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "bets: insert own" on public.bets
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "bets: update own" on public.bets
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "bets: delete own" on public.bets
  for delete to authenticated using ((select auth.uid()) = user_id);

-- bankroll_transactions: full CRUD on own rows only.
grant select, insert, delete on public.bankroll_transactions to authenticated;
grant update (type, amount, occurred_at, description) on public.bankroll_transactions to authenticated;

create policy "bankroll: read own" on public.bankroll_transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "bankroll: insert own" on public.bankroll_transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "bankroll: update own" on public.bankroll_transactions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "bankroll: delete own" on public.bankroll_transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- audit_log: read-only, own rows. Writes happen only via the security-definer trigger.
grant select on public.audit_log to authenticated;
create policy "audit: read own" on public.audit_log
  for select to authenticated using ((select auth.uid()) = user_id);

-- login_attempts: no policies → no client access (service role bypasses RLS).

-- Lock down helper functions.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.write_audit_log() from public, anon, authenticated;
