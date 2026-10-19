// =====================================================================
//  LIBRAVA — configurare
//  Lasă supabaseUrl gol ca să rulezi în MODUL DEMO (date în browser).
//  Completează-le (vezi README.md) ca site-ul să lucreze cu baza de date reală.
// =====================================================================
export const CONFIG = {
  siteName: 'Librava',

  // --- Supabase (Settings → API în proiectul tău Supabase) ---
  supabaseUrl: '',        // ex: 'https://abcdxyz.supabase.co'
  supabaseAnonKey: '',    // DOAR cheia publică "anon" / "publishable". Nu pune aici niciodată
                          // cheia service_role sau chei Stripe sk_... (acelea stau doar în Supabase secrets).

  // --- Magazin ---
  currency: 'EUR',
  previewPages: 4,              // câte pagini PDF vede gratuit un vizitator (în modul demo)
  previewPercent: 0.25,         // ce procent dintr-un EPUB vede gratuit (în modul demo)
  supportEmail: 'contact@librava.store',

  // --- Login cu Google (activează providerul în Supabase → Authentication) ---
  googleLogin: true,
};

export const IS_DEMO = !CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey;
