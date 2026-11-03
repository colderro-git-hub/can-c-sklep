// Klient Supabase w przeglądarce – tylko klucz publishable i sesja zalogowanego klienta.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLIC_URL, SUPABASE_PUBLISHABLE_KEY } from '../config';

let client: SupabaseClient | null = null;

export function sb() {
  if (!client) {
    client = createClient(SUPABASE_PUBLIC_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        flowType: 'implicit',      // link działa także otwarty w innej przeglądarce/aplikacji
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'canc-auth',
      },
    });
  }
  return client;
}
