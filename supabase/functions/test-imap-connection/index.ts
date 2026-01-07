// Supabase Edge Function: Test IMAP Connection
// Deploy: supabase functions deploy test-imap-connection

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { ImapFlow } from 'npm:imapflow@1.0.162'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, password, server = 'mail.uniweb.no', port = 143 } = await req.json()

    if (!email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'E-post og passord er påkrevd' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Test IMAP connection - try SSL on port 993
    const client = new ImapFlow({
      host: server,
      port: port,
      secure: port === 993, // true for SSL on 993, false for STARTTLS on 143
      auth: {
        user: email,
        pass: password
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
      },
      greetingTimeout: 30000,
      socketTimeout: 60000,
      logger: false
    })

    try {
      await client.connect()
      
      // Try to select INBOX to verify full access
      const mailbox = await client.mailboxOpen('INBOX')
      
      await client.logout()

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Tilkoblet! Innboks har ${mailbox.exists} e-poster.` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (imapError) {
      // Log full error for debugging
      console.error('IMAP Error:', imapError)
      
      // Provide more helpful error messages
      const rawError = imapError.message || String(imapError)
      let errorMsg = rawError
      
      if (rawError.includes('Authentication') || rawError.includes('Command failed') || rawError.includes('Invalid credentials') || rawError.includes('LOGIN')) {
        errorMsg = `Autentisering feilet. Detaljer: ${rawError}. Tips: Sjekk om du trenger et app-passord fra One.com kontrollpanel.`
      } else if (rawError.includes('ENOTFOUND') || rawError.includes('getaddrinfo')) {
        errorMsg = 'Kunne ikke finne e-postserveren. Sjekk serveradressen.'
      } else if (rawError.includes('ECONNREFUSED')) {
        errorMsg = 'Tilkobling nektet. Sjekk port og sikkerhetsinnstillinger.'
      } else if (rawError.includes('timeout')) {
        errorMsg = 'Tilkoblingen tok for lang tid. Prøv igjen.'
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMsg
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
