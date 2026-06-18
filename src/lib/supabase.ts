import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rqmfihedebhwvcrcjkkr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_H7AuDajtrmfGWmcvE6p8TQ_ySBHBBb5'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'bard-auth-v1',
  },
})
