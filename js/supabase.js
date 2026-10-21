import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

if (SUPABASE_URL.startsWith('YOUR_') || SUPABASE_ANON_KEY.startsWith('YOUR_')) {
  document.body.innerHTML =
    '<p style="font-family:sans-serif;padding:2rem">Open <b>js/config.js</b> and paste your Supabase URL and anon key.</p>';
  throw new Error('Supabase URL / anon key not set in js/config.js');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
