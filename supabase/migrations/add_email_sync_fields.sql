-- Add email sync fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS imap_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_sync_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_email_sync TIMESTAMPTZ;

-- Create separate table for encrypted IMAP credentials (more secure)
CREATE TABLE IF NOT EXISTS imap_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  encrypted_password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

-- Create table to track synced emails (avoid duplicates)
CREATE TABLE IF NOT EXISTS synced_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL, -- Email Message-ID header
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  email_date TIMESTAMPTZ NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_emails_tenant ON synced_emails(tenant_id);
CREATE INDEX IF NOT EXISTS idx_synced_emails_customer ON synced_emails(customer_id);

-- RLS policies
ALTER TABLE imap_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_emails ENABLE ROW LEVEL SECURITY;

-- Users can only see their own IMAP credentials
CREATE POLICY "Users can view own imap_credentials" ON imap_credentials
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own imap_credentials" ON imap_credentials
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own imap_credentials" ON imap_credentials
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own imap_credentials" ON imap_credentials
  FOR DELETE USING (user_id = auth.uid());

-- Synced emails visible to users in same tenant (via profiles.tenant_id)
CREATE POLICY "Tenant users can view synced_emails" ON synced_emails
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
