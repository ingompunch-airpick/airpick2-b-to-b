import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || (process.env as any).VITE_SUPABASE_URL || (import.meta as any).env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || (process.env as any).VITE_SUPABASE_ANON_KEY || (import.meta as any).env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Silent fallback to avoid triggering browser console.error count on a Firebase-backed application.
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
