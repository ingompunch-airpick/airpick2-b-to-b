import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || (process.env as any).VITE_SUPABASE_URL || (import.meta as any).env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || (process.env as any).VITE_SUPABASE_ANON_KEY || (import.meta as any).env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL 또는 Anon Key가 설정되지 않았습니다. .env 파일을 확인해주세요.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
