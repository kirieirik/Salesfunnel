// Supabase Edge Function: Send Invitation Email
// Deploy: supabase functions deploy send-invite --no-verify-jwt
//
// This function only handles sending the auth invite email.
// The invitation record is created by the frontend (protected by RLS).
// Deploy with --no-verify-jwt since we validate the invitation via service role.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('send-invite: Function called, method:', req.method)
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase admin client (service role) for auth invite
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse request body
    const body = await req.json()
    const { invitationId, email, inviteLink, tenantName, inviterName } = body
    console.log('send-invite: Request body:', { invitationId, email, tenantName })

    if (!email || !invitationId) {
      throw new Error('Mangler påkrevde felt (email, invitationId)')
    }

    // Verify invitation exists using service role (bypasses RLS)
    const { data: invitation, error: invError } = await supabaseAdmin
      .from('invitations')
      .select('id, email, tenant_id, token, status')
      .eq('id', invitationId)
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .single()

    if (invError || !invitation) {
      console.error('send-invite: Invitation not found:', invError)
      throw new Error('Invitasjon ikke funnet')
    }
    console.log('send-invite: Invitation verified:', invitation.id)

    // Try to invite user via Supabase Auth (sends magic link email)
    const { error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteLink || undefined,
      data: {
        invitation_token: invitation.token,
        tenant_id: invitation.tenant_id
      }
    })

    if (authError) {
      // If user already has an account, that's OK - they can log in normally
      if (authError.message?.includes('already been registered')) {
        console.log('send-invite: User already exists, invitation still valid')
      } else {
        console.warn('send-invite: Auth invite error:', authError.message)
        // Don't throw - the invitation record exists, user can use the link
      }
    } else {
      console.log('send-invite: Auth invite email sent successfully')
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invitasjon sendt til ${email}`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('send-invite: Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Noe gikk galt'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
