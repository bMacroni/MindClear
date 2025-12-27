
const supabaseConfig = {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY,
};

export const getSupabaseConfig = () => {
    return supabaseConfig;
};
