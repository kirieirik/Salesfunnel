import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Demo mode når Supabase ikke er konfigurert
export const isDemoMode = !supabaseUrl || !supabaseAnonKey

if (isDemoMode) {
  console.info('🎭 Kjører i demo-modus. Koble til Supabase for full funksjonalitet.')
}

export const supabase = isDemoMode 
  ? null 
  : createClient(supabaseUrl, supabaseAnonKey)
