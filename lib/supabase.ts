import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const FALLBACK_SUPABASE_URL = 'https://example.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'public-anon-key-placeholder';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
	// Do not throw here but surface a clear warning for debugging in console
	// Frontend code should check `isSupabaseConfigured` before attempting writes.
	// eslint-disable-next-line no-console
	console.warn('[supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
}

const supabase = createClient(
	SUPABASE_URL || FALLBACK_SUPABASE_URL,
	SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY
);

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export default supabase;
