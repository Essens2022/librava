// =====================================================================
//  LIBRAVA — configurare
//  Site-ul lucrează cu proiectul Supabase „librava” (baza de date reală).
//  Aici stau DOAR adrese și cheia PUBLICĂ (făcută să fie văzută în browser; datele sunt
//  protejate de regulile din baza de date). Parolele și cheile secrete (Stripe sk_..., whsec_...,
//  service_role) stau numai în Supabase → Edge Functions → Secrets, niciodată în cod.
// =====================================================================
export const CONFIG = {
  siteName: 'Librava',

  // --- Supabase (Settings → API în proiectul tău Supabase) ---
  supabaseUrl: 'https://pgyprsklpewfsqtkljha.supabase.co',        // ex: 'https://abcdxyz.supabase.co'
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBneXByc2tscGV3ZnNxdGtsamhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MjMyMTUsImV4cCI6MjEwNzk5OTIxNX0.n7FHB6BDYJFx_mq-av7wReXykZmSzQw4zrX6q5Dk7uM',    // DOAR cheia publică "anon" / "publishable". Nu pune aici niciodată
                          // cheia service_role sau chei Stripe sk_... (acelea stau doar în Supabase secrets).

  // --- Magazin ---
  currency: 'EUR',
  previewPages: 4,              // câte pagini PDF vede gratuit un vizitator (în modul demo)
  previewPercent: 0.25,         // ce procent dintr-un EPUB vede gratuit (în modul demo)
  supportEmail: 'contact@librava.store',

  // --- Login cu Google (activează providerul în Supabase → Authentication) ---
  googleLogin: false,          // devine true după ce activezi Google în Supabase → Authentication → Providers
};

export const IS_DEMO = !CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey;
