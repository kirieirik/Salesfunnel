// Supabase Edge Function: Sync Emails from IMAP
// This function is called by a cron job (pg_cron) every 5 minutes
// Deploy: supabase functions deploy sync-emails

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ImapFlow } from 'npm:imapflow@1.0.162'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Decrypt password
async function decryptPassword(encryptedData: string, key: string): Promise<string> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  
  // Decode base64
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0))
  
  // Extract IV and encrypted data
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)
  
  // Create key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encrypted
  )
  
  return decoder.decode(decrypted)
}

// Extract email address from "Name <email@example.com>" format
function extractEmail(addressStr: string): string {
  const match = addressStr.match(/<([^>]+)>/)
  return match ? match[1].toLowerCase() : addressStr.toLowerCase().trim()
}

serve(async (req) => {
  console.log('=== SYNC-EMAILS STARTED ===')
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const encryptionKey = Deno.env.get('IMAP_ENCRYPTION_KEY') || 'default-dev-key-change-in-prod'
  console.log('Encryption key exists:', !!encryptionKey && encryptionKey !== 'default-dev-key-change-in-prod')

  try {
    // Get all users with email sync enabled
    console.log('Fetching profiles with email sync enabled...')
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        imap_email,
        last_email_sync
      `)
      .eq('email_sync_enabled', true)
      .not('imap_email', 'is', null)

    if (profilesError) {
      console.error('Profile fetch error:', profilesError)
      throw profilesError
    }

    console.log(`Found ${profiles?.length || 0} profiles with email sync enabled`)

    let totalSynced = 0
    let totalErrors = 0

    for (const profile of profiles || []) {
      console.log(`Processing user: ${profile.id}, email: ${profile.imap_email}`)
      try {
        // Get tenant for this user from their profile
        const { data: userProfile } = await supabaseAdmin
          .from('profiles')
          .select('tenant_id')
          .eq('id', profile.id)
          .single()

        if (!userProfile?.tenant_id) {
          console.log('No tenant_id found for user, skipping')
          continue
        }
        console.log(`Tenant: ${userProfile.tenant_id}`)

        // Get encrypted password
        const { data: creds } = await supabaseAdmin
          .from('imap_credentials')
          .select('encrypted_password')
          .eq('user_id', profile.id)
          .eq('tenant_id', userProfile.tenant_id)
          .single()

        if (!creds) {
          console.log('No credentials found for user, skipping')
          continue
        }
        console.log('Credentials found, decrypting...')

        const password = await decryptPassword(creds.encrypted_password, encryptionKey)
        console.log('Password decrypted successfully')

        // Get all customer emails for matching
        const { data: customers } = await supabaseAdmin
          .from('customers')
          .select('id, email, contact_email')
          .eq('tenant_id', userProfile.tenant_id)

        const customerEmails = new Map()
        for (const customer of customers || []) {
          if (customer.email) {
            customerEmails.set(customer.email.toLowerCase(), customer.id)
          }
          if (customer.contact_email) {
            customerEmails.set(customer.contact_email.toLowerCase(), customer.id)
          }
        }
        console.log(`Found ${customers?.length || 0} customers, ${customerEmails.size} email addresses to match`)

        // Connect to IMAP with SSL on port 993
        console.log('Connecting to IMAP server...')
        const client = new ImapFlow({
          host: 'mail.uniweb.no',
          port: 993,
          secure: true,
          auth: {
            user: profile.imap_email,
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

        await client.connect()
        console.log('Connected to IMAP server successfully')

        // Calculate since date (last sync or 24 hours ago)
        // Subtract 1 hour buffer to ensure we don't miss emails due to timezone issues
        const sinceDate = profile.last_email_sync 
          ? new Date(new Date(profile.last_email_sync).getTime() - 60 * 60 * 1000)
          : new Date(Date.now() - 24 * 60 * 60 * 1000)
        
        console.log(`Syncing emails since: ${sinceDate.toISOString()} (last_sync: ${profile.last_email_sync})`)

        // Check INBOX
        await client.mailboxOpen('INBOX')
        
        const messages = []
        for await (const message of client.fetch(
          { since: sinceDate },
          { envelope: true, uid: true }
        )) {
          messages.push({
            uid: message.uid,
            messageId: message.envelope.messageId,
            date: message.envelope.date,
            from: message.envelope.from?.[0]?.address || '',
            to: message.envelope.to?.map(t => t.address) || [],
            subject: message.envelope.subject || '(Ingen emne)'
          })
        }
        
        console.log(`Found ${messages.length} messages in INBOX`)

        // Check multiple Sent folders - check all that exist
        const sentFolderNames = [
          'Sendte elementer', 'Sent', 'Sent Items', 'Sendt'
        ]
        let sentFoldersChecked = 0
        
        for (const folderName of sentFolderNames) {
          try {
            const mailbox = await client.mailboxOpen(folderName)
            if (mailbox.exists > 0) {
              console.log(`Checking sent folder: ${folderName} (${mailbox.exists} messages)`)
              sentFoldersChecked++
            
              for await (const message of client.fetch(
                { since: sinceDate },
                { envelope: true, uid: true }
              )) {
                messages.push({
                  uid: message.uid,
                  messageId: message.envelope.messageId,
                  date: message.envelope.date,
                  from: message.envelope.from?.[0]?.address || '',
                  to: message.envelope.to?.map(t => t.address) || [],
                  subject: message.envelope.subject || '(Ingen emne)',
                  isSent: true
                })
              }
              // Don't break - continue checking other sent folders
            }
          } catch {
            // Folder doesn't exist, try next
          }
        }
        
        if (sentFoldersChecked === 0) {
          console.log('Could not find any Sent folder')
        }

        console.log(`Total messages to process: ${messages.length}`)

        await client.logout()

        // Process messages
        for (const msg of messages) {
          // Check if already synced
          const { data: existing } = await supabaseAdmin
            .from('synced_emails')
            .select('id')
            .eq('tenant_id', userProfile.tenant_id)
            .eq('message_id', msg.messageId)
            .single()

          if (existing) continue

          // Find matching customer
          let customerId = null
          const fromEmail = extractEmail(msg.from)
          const toEmails = msg.to.map(extractEmail)

          console.log(`Processing email: "${msg.subject}" from=${fromEmail} to=${toEmails.join(',')} isSent=${msg.isSent || false}`)

          // Check from address
          if (customerEmails.has(fromEmail)) {
            customerId = customerEmails.get(fromEmail)
            console.log(`  -> Matched from address: ${fromEmail}`)
          }
          
          // Check to addresses
          if (!customerId) {
            for (const toEmail of toEmails) {
              if (customerEmails.has(toEmail)) {
                customerId = customerEmails.get(toEmail)
                console.log(`  -> Matched to address: ${toEmail}`)
                break
              }
            }
          }

          if (!customerId) {
            console.log(`  -> No customer match found, skipping`)
          }

          // Only log if we found a matching customer
          if (customerId) {
            console.log(`  -> Creating activity for customer: ${customerId}`)
            // Create activity
            const { data: activity, error: activityError } = await supabaseAdmin
              .from('activities')
              .insert({
                tenant_id: userProfile.tenant_id,
                customer_id: customerId,
                user_id: profile.id,
                type: 'email',
                description: msg.isSent 
                  ? `E-post sendt: ${msg.subject}`
                  : `E-post mottatt: ${msg.subject}`,
                content: msg.isSent
                  ? `Til: ${msg.to.join(', ')}`
                  : `Fra: ${msg.from}`,
                activity_date: new Date(msg.date).toISOString().split('T')[0],
                is_scheduled: false,
                is_completed: true
              })
              .select('id')
              .single()

            if (!activityError && activity) {
              // Record synced email
              await supabaseAdmin
                .from('synced_emails')
                .insert({
                  tenant_id: userProfile.tenant_id,
                  message_id: msg.messageId,
                  customer_id: customerId,
                  activity_id: activity.id,
                  email_date: msg.date,
                  from_address: msg.from,
                  to_address: msg.to.join(', '),
                  subject: msg.subject
                })

              totalSynced++
            }
          }
        }

        // Update last sync time
        await supabaseAdmin
          .from('profiles')
          .update({ last_email_sync: new Date().toISOString() })
          .eq('id', profile.id)

      } catch (userError) {
        console.error(`Error syncing for user ${profile.id}:`, userError)
        totalErrors++
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced: totalSynced,
        errors: totalErrors,
        usersProcessed: profiles?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Sync error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
