const supabaseUrl = "https://lopgzpsyrcjytlipjrns.supabase.co";
const supabasePublishableKey = "sb_publishable_yQHgHkfDm_yGj_vkb0X5bg_i2kHjs4o";

if (!window.supabase?.createClient) {
  console.error("Supabase failed to load. Check your internet connection and try again.");
  window.supabaseClient = null;
} else {
  window.supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
