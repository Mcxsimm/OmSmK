/* Configuration de la synchronisation en ligne (projet Supabase).
   La clé « publishable » est publique par conception : l'accès aux données
   est protégé côté serveur par les règles RLS (voir supabase/migrations). */
// deno-lint-ignore no-unused-vars
const OMSMK_CONFIG = {
  supabaseUrl: 'https://pykyvpxxwsegxbqhvxvu.supabase.co',
  supabaseKey: 'sb_publishable_aJGR2ZNTfe4c2CNEQn2fXg_mdh2phiM',
  // Identifiant client OAuth Google (stockage sur Google Drive) ; peut aussi être saisi dans Paramètres → Google Drive
  googleClientId: ''
};
