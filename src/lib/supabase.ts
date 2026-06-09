import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — check .env');
}

// Browser client: anon key only. Project: pnkrjyfusqrrdmlcvxxi ("arc risk management", Tokyo).
// Gate-only — auth is the sole Supabase concern; app data still lives in localStorage.
export const supabase = createClient(url, anonKey);
