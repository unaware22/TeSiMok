/**
 * services/supabase.js
 * The single Supabase client plus auth helpers.
 * Every other service imports the client from here.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL);
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[TeSiMok] Missing Supabase credentials. Copy .env.example to .env and set ' +
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// ============================================================
// Auth
// ============================================================

export async function signUp(email, password, displayName, avatarEmoji = '😎') {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName, avatar_emoji: avatarEmoji },
    },
  });
  return { data, error };
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  return { data, error };
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  return { error };
}

// ============================================================
// RPC helper — converts Postgres errors into readable messages
// ============================================================

const ERROR_MESSAGES = {
  NO_LIVES: 'Nyawa kamu habis! Tunggu pulih atau isi ulang di Toko.',
  NOT_AUTHENTICATED: 'Kamu harus masuk dulu untuk melakukan ini.',
  ALREADY_CLAIMED_TODAY: 'Hadiah hari ini sudah kamu ambil. Kembali besok!',
  SKU_NOT_FOUND: 'Item ini tidak tersedia.',
  BATTLE_NOT_ACTIVE: 'Pertandingan sudah tidak aktif.',
  BATTLE_ENDED: 'Waktu pertandingan sudah habis.',
  ALREADY_ANSWERED: 'Soal ini sudah kamu jawab.',
  FORBIDDEN: 'Kamu tidak punya akses ke ini.',
  NO_KEYS: 'Kunci jawaban kamu habis.',
  ALREADY_OWNED: 'Kamu sudah memiliki stiker ini.',
  PREMIUM_REQUIRED: 'Stiker ini hanya untuk pemain Premium.',
  INSUFFICIENT_COINS: 'Koin kamu tidak cukup. Beli koin dulu di Toko.',
};

export function humanizeError(error) {
  if (!error) return 'Terjadi kesalahan yang tidak diketahui.';

  const raw = error.message || String(error);

  for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
    if (raw.includes(code)) return message;
  }

  if (raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
    return 'Koneksi bermasalah. Periksa internet kamu.';
  }
  if (raw.includes('JWT') || raw.includes('token')) {
    return 'Sesi kamu sudah berakhir. Silakan masuk kembali.';
  }

  return raw;
}

/**
 * Call a Postgres function and unwrap the result.
 * Throws a humanised Error on failure.
 */
export async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(humanizeError(error));
  return data;
}

// ============================================================
// Edge function helper (kept for the legacy score endpoints)
// ============================================================

export async function callFunction(name, body = {}) {
  const session = await getSession();

  const headers = {
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey,
  };
  if (session) headers.Authorization = `Bearer ${session.access_token}`;

  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`Fungsi "${name}" mengembalikan respons tidak valid (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(humanizeError({ message: result.error || result.message || `HTTP ${response.status}` }));
  }
  return result;
}

export const SUPABASE_URL = supabaseUrl;
