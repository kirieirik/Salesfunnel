// Supabase Edge Function: Send Invitation Email
// Deploy: supabase functions deploy send-invite

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Get user's profile with tenant info
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('tenant_id, role, first_name, last_name, tenant:tenants(name)')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Profile error:', profileError)
      throw new Error('Kunne ikke hente profil')
    }
    
    if (!profile?.tenant_id) {
      throw new Error('Ingen bedrift funnet')
    }

    // Check if user has permission to invite
    if (!['owner', 'admin'].includes(profile.role)) {
      throw new Error('Du har ikke tilgang til å invitere brukere')
    }

    const { email, role } = await req.json()

    if (!email || !email.includes('@')) {
      throw new Error('Ugyldig e-postadresse')
    }

    if (!['admin', 'member'].includes(role)) {
      throw new Error('Ugyldig rolle')
    }

    // Check if user is already a member
    const { data: existingMember } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('email', email)
      .single()

    if (existingMember) {
      throw new Error('Denne brukeren er allerede medlem av organisasjonen')
    }

    // Check if there's already a pending invitation
    const { data: existingInvite } = await supabaseClient
      .from('invitations')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .single()

    if (existingInvite) {
      throw new Error('Det finnes allerede en ventende invitasjon til denne e-posten')
    }

    // Create the invitation
    const { data: invitation, error: inviteError } = await supabaseClient
      .from('invitations')
      .insert({
        tenant_id: profile.tenant_id,
        email: email.toLowerCase(),
        role: role,
        invited_by: user.id
      })
      .select()
      .single()

    if (inviteError) {
      console.error('Invite error:', inviteError)
      throw new Error('Kunne ikke opprette invitasjon')
    }

    // Get the app URL from environment or use default
    const appUrl = Deno.env.get('APP_URL') || 'https://salesfunnel.vercel.app'
    const inviteLink = `${appUrl}/register?invite=${invitation.token}`

    // Use Supabase Admin client to send email via Supabase Auth
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Try to invite the user via Supabase Auth (this sends an email)
    const { error: authInviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteLink,
      data: {
        invitation_token: invitation.token,
        tenant_id: profile.tenant_id,
        role: role
      }
    })

    // If user already exists in auth, we'll still create the invitation
    // They'll see it when they log in
    if (authInviteError && !authInviteError.message.includes('already been registered')) {
      console.warn('Auth invite warning:', authInviteError.message)
    }

    const inviterName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || user.email
    const tenantName = profile.tenant?.name || 'organisasjonen'

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invitasjon sendt til ${email}`,
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expires_at: invitation.expires_at
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error:', error)
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
