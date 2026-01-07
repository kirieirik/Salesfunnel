// Supabase Edge Function: Save IMAP Credentials (encrypted)
// Deploy: supabase functions deploy save-imap-credentials

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Simple encryption using Web Crypto API
async function encryptPassword(password: string, key: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  
  // Create key from secret
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12))
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  )
  
  // Combine IV + encrypted data and base64 encode
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  
  return btoa(String.fromCharCode(...combined))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Ikke autorisert')
    }

    // Initialize Supabase client with user's token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      throw new Error('Kunne ikke hente bruker')
    }

    // Get user's tenant from profile
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (!profile?.tenant_id) {
      throw new Error('Ingen bedrift funnet')
    }

    const { email, password } = await req.json()

    if (!email || !password) {
      throw new Error('E-post og passord er påkrevd')
    }

    // Encrypt password with server-side secret
    const encryptionKey = Deno.env.get('IMAP_ENCRYPTION_KEY') || 'default-dev-key-change-in-prod'
    const encryptedPassword = await encryptPassword(password, encryptionKey)

    // Use service role client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Upsert credentials
    console.log('Upserting credentials for user:', user.id, 'tenant:', profile.tenant_id)
    
    const { error: upsertError } = await supabaseAdmin
      .from('imap_credentials')
      .upsert({
        user_id: user.id,
        tenant_id: profile.tenant_id,
        encrypted_password: encryptedPassword,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,tenant_id'
      })

    if (upsertError) {
      console.error('Upsert error:', upsertError)
      throw upsertError
    }

    console.log('Credentials saved successfully')
    
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
