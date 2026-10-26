// EdgeTrack — username login (Supabase Edge Function, Deno runtime)
//
// Supabase Auth signs users in by email. EdgeTrack users sign in with a
// username, so this function performs the username → account mapping on the
// server, where the email addresses are never exposed to the browser:
//
//   1. Throttle by username and by client IP (brute-force protection).
//   2. Resolve username → user id (profiles) → email (auth.admin, service role).
//   3. Verify the password with Supabase Auth (passwords are bcrypt-hashed by
//      Supabase; this function never sees or stores a hash).
//   4. Return the session tokens; the client calls supabase.auth.setSession().
//
// Every failure returns the same generic message so usernames can't be probed.
//
// Deploy:  supabase functions deploy username-login --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are
//          injected automatically. Optionally set ALLOWED_ORIGINS
//          (comma-separated) to restrict CORS to your deployed site.

import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_FAILURES_PER_USERNAME = 5;
const MAX_FAILURES_PER_IP = 20;
const WINDOW_MINUTES = 15;
const GENERIC_ERROR = 'Invalid username or password.';

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): HeadersInit {
  const allow =
    allowedOrigins.length === 0 ? '*' : origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  const started = Date.now();
  // Equalise response timing so "unknown user" and "wrong password" look alike.
  const fail = async (status = 401, message = GENERIC_ERROR) => {
    const elapsed = Date.now() - started;
    if (elapsed < 600) await sleep(600 - elapsed + Math.random() * 150);
    return json({ error: message }, status, origin);
  };

  let username: string;
  let password: string;
  try {
    const body = await req.json();
    username = typeof body?.username === 'string' ? body.username.trim() : '';
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return json({ error: 'Invalid request body.' }, 400, origin);
  }
  if (username.length < 3 || username.length > 64 || password.length < 1 || password.length > 128) {
    return fail();
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const usernameKey = `u:${username.toLowerCase()}`;
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const ipKey = `ip:${ip}`;
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  const countFailures = async (key: string) => {
    const { count } = await admin
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('username_key', key)
      .eq('succeeded', false)
      .gte('attempted_at', since);
    return count ?? 0;
  };

  const [userFailures, ipFailures] = await Promise.all([countFailures(usernameKey), countFailures(ipKey)]);
  if (userFailures >= MAX_FAILURES_PER_USERNAME || ipFailures >= MAX_FAILURES_PER_IP) {
    return fail(429, `Too many failed attempts. Try again in ${WINDOW_MINUTES} minutes.`);
  }

  const record = (succeeded: boolean) =>
    admin.from('login_attempts').insert([
      { username_key: usernameKey, succeeded },
      { username_key: ipKey, succeeded },
    ]);

  // username → user id (case-insensitive; usernames are unique on lower()).
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .ilike('username', username.replace(/[\\%_]/g, (c) => `\\${c}`))
    .maybeSingle();

  if (!profile) {
    await record(false);
    return fail();
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id);
  const email = userData?.user?.email;
  if (userError || !email) {
    await record(false);
    return fail();
  }

  const publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signIn, error: signInError } = await publicClient.auth.signInWithPassword({ email, password });
  if (signInError || !signIn.session) {
    await record(false);
    return fail();
  }

  await record(true);
  // Opportunistic cleanup of old throttle rows.
  await admin.from('login_attempts').delete().lt('attempted_at', new Date(Date.now() - 86_400_000).toISOString());

  return json(
    {
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    },
    200,
    origin,
  );
});
