-- pgTAP tests for row-level security and data isolation.
-- Run with:  supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

-- ---------------------------------------------------------------------------
-- Fixtures: two users (profiles are created by the on_auth_user_created trigger)
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'alice@example.test', extensions.crypt('password-a', extensions.gen_salt('bf')), '{"username":"alice"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bob@example.test', extensions.crypt('password-b', extensions.gen_salt('bf')), '{"username":"bob"}', now(), now());

select is((select count(*)::int from public.profiles where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')),
  2, 'profiles are auto-created for new auth users');
select is((select currency from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'INR', 'default currency is INR');

-- Bob's data, inserted as superuser
insert into public.bets (id, user_id, bet_name, sport, bet_type, stake, odds, status)
values ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Bob secret bet', 'Cricket', 'moneyline', 100, 2.00, 'won');
insert into public.bankroll_transactions (id, user_id, type, amount)
values ('bbbbbbbb-0000-0000-0000-0000000000a1', '22222222-2222-2222-2222-222222222222', 'deposit', 1000);

-- ---------------------------------------------------------------------------
-- Anonymous role: no access at all
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select count(*) from public.bets $$, '42501', null, 'anon cannot read bets');
select throws_ok($$ select count(*) from public.bankroll_transactions $$, '42501', null, 'anon cannot read bankroll');
select throws_ok($$ select count(*) from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ insert into public.bets (user_id, bet_name, sport, bet_type, stake, odds) values ('22222222-2222-2222-2222-222222222222','x','x','other',1,2) $$,
  '42501', null, 'anon cannot insert bets');
reset role;

-- ---------------------------------------------------------------------------
-- Alice (authenticated)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((select count(*)::int from public.bets), 0, 'alice sees none of bob''s bets');
select is((select count(*)::int from public.bankroll_transactions), 0, 'alice sees none of bob''s transactions');
select is((select count(*)::int from public.profiles), 1, 'alice sees only her own profile');
select is((select count(*)::int from public.audit_log), 0, 'alice sees none of bob''s audit log');

-- Insert own bet (user_id defaults to auth.uid())
select lives_ok($$ insert into public.bets (id, bet_name, sport, bet_type, stake, odds, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Alice pick', 'Football', 'spread', 500, 1.90, 'pending') $$,
  'alice can insert her own bet');
select is((select user_id::text from public.bets where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111', 'user_id defaults to the caller');

select throws_ok($$ insert into public.bets (user_id, bet_name, sport, bet_type, stake, odds)
  values ('22222222-2222-2222-2222-222222222222', 'forged', 'x', 'other', 1, 2) $$,
  '42501', null, 'alice cannot insert a bet owned by bob');

-- Updates / deletes against bob's rows silently affect nothing
update public.bets set stake = 1 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
delete from public.bets where id = 'bbbbbbbb-0000-0000-0000-000000000001';
delete from public.bankroll_transactions where id = 'bbbbbbbb-0000-0000-0000-0000000000a1';

select throws_ok($$ update public.bets set user_id = '22222222-2222-2222-2222-222222222222' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'alice cannot reassign her bet to bob');
select throws_ok($$ update public.profiles set username = 'hacker' where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'username cannot be changed by the client');
select lives_ok($$ update public.profiles set currency = 'USD' where id = '11111111-1111-1111-1111-111111111111' $$,
  'alice can update her preferences');
select throws_ok($$ select count(*) from public.login_attempts $$, '42501', null, 'clients cannot read login attempts');

-- Settlement maths in the database
update public.bets set status = 'won' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select results_eq($$ select payout, net_profit from public.bets where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  $$ values (950.00::numeric(14,2), 450.00::numeric(14,2)) $$, 'won ₹500 @ 1.90 → payout 950, profit 450');
select isnt((select settled_at from public.bets where id = 'aaaaaaaa-0000-0000-0000-000000000001'), null, 'settled_at set on settlement');

update public.bets set status = 'half_lost' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select results_eq($$ select payout, net_profit from public.bets where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  $$ values (250.00::numeric(14,2), -250.00::numeric(14,2)) $$, 'half lost → payout 250, profit -250');

select throws_ok($$ update public.bets set status = 'cashed_out' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23514', null, 'cashed out requires a cash-out amount');
select throws_ok($$ insert into public.bets (bet_name, sport, bet_type, stake, odds) values ('bad', 'x', 'other', 0, 2) $$,
  '23514', null, 'stake must be > 0');
select throws_ok($$ insert into public.bets (bet_name, sport, bet_type, stake, odds) values ('bad', 'x', 'other', 10, 1.0) $$,
  '23514', null, 'odds must be >= 1.01');

select is((select count(*)::int from public.audit_log where record_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 3,
  'every insert/update of alice''s bet is audited');
reset role;

-- ---------------------------------------------------------------------------
-- Bob's records survived alice's attempts
-- ---------------------------------------------------------------------------
select is((select stake from public.bets where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 100.00::numeric(14,2),
  'bob''s bet was not modified by alice');
select is((select count(*)::int from public.bankroll_transactions where id = 'bbbbbbbb-0000-0000-0000-0000000000a1'), 1,
  'bob''s transaction was not deleted by alice');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.bets), 1, 'bob sees exactly his own bet');
select is((select count(*)::int from public.bets where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'bob cannot see alice''s bet');
reset role;

select * from finish();
rollback;
