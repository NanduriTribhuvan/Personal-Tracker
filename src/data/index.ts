import { createClient } from '@supabase/supabase-js';
import { LocalAuthService } from './localAuth';
import { SupabaseAuthService } from './supabaseAuth';
import type { AuthService } from './types';

export * from './types';

export const IDLE_TIMEOUT_MS = Math.max(5, Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES) || 60) * 60_000;

export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

let instance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (instance) return instance;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && anonKey) {
    const client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'edgetrack-auth' },
    });
    instance = new SupabaseAuthService(client, `${url.replace(/\/$/, '')}/functions/v1`, anonKey);
  } else {
    instance = new LocalAuthService({ idleTimeoutMs: IDLE_TIMEOUT_MS });
  }
  return instance;
}
