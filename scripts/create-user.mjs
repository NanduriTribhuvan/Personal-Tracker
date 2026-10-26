#!/usr/bin/env node
/**
 * Create (or reset the password of) an EdgeTrack account — server-side only.
 *
 * Credentials are read from environment variables at runtime so they are
 * never written to the repository or bundled into the frontend:
 *
 *   SUPABASE_URL=https://xyz.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   EDGETRACK_USERNAME='your-username' \
 *   EDGETRACK_PASSWORD='your-password' \
 *   npm run create-user
 *
 * Optional: EDGETRACK_EMAIL (defaults to a private, non-routable address
 * derived from the username — users always sign in with the username).
 *
 * Supabase stores the password as a bcrypt hash; this script never logs it.
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EDGETRACK_USERNAME, EDGETRACK_PASSWORD, EDGETRACK_EMAIL } = process.env;

function die(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) die('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
if (!EDGETRACK_USERNAME || !EDGETRACK_PASSWORD) die('Set EDGETRACK_USERNAME and EDGETRACK_PASSWORD.');

const username = EDGETRACK_USERNAME.trim();
if (!/^[A-Za-z0-9._@-]{3,32}$/.test(username)) die('Username must be 3–32 characters: letters, numbers, . _ @ -');
if (EDGETRACK_PASSWORD.length < 6) die('Password must be at least 6 characters (Supabase minimum).');

const email =
  EDGETRACK_EMAIL?.trim() ||
  `u-${createHash('sha256').update(username.toLowerCase()).digest('hex').slice(0, 20)}@users.edgetrack.invalid`;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: existing, error: lookupError } = await admin
  .from('profiles')
  .select('id')
  .ilike('username', username.replace(/[\\%_]/g, (c) => `\\${c}`))
  .maybeSingle();
if (lookupError) die(`Could not query profiles — have you run the migrations? (${lookupError.message})`);

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, { password: EDGETRACK_PASSWORD });
  if (error) die(`Could not update password: ${error.message}`);
  console.log(`✔ Password reset for existing user "${username}".`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: EDGETRACK_PASSWORD,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error) die(`Could not create user: ${error.message}`);
  console.log(`✔ Created user "${username}" (id ${data.user.id}).`);
}
console.log('  Sign in to EdgeTrack with this username. Change the password from Settings after first login.');
