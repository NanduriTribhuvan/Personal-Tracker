/**
 * PBKDF2-SHA256 password hashing for local mode (WebCrypto). Supabase mode
 * never uses this — Supabase Auth hashes passwords with bcrypt server-side.
 */
export const DEFAULT_ITERATIONS = 310_000;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export interface PasswordHash {
  algorithm: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  hash: string;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = DEFAULT_ITERATIONS): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations);
  return { algorithm: 'PBKDF2-SHA256', iterations, salt: toBase64(salt), hash: toBase64(hash) };
}

/** Constant-time comparison of the derived key. */
export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const expected = fromBase64(stored.hash);
  const actual = await derive(password, fromBase64(stored.salt), stored.iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
