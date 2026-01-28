-- =============================================
-- INVITATIONS TABLE
-- For inviting users to organizations
-- =============================================

-- Invitations tabell
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, email, status) -- Kun én pending invitasjon per e-post per tenant
);

CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_tenant ON invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- Aktiver RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Policies for invitations
-- Admins/owners kan se og opprette invitasjoner for sin tenant
CREATE POLICY "Admins kan se invitasjoner"
  ON invitations FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins kan opprette invitasjoner"
  ON invitations FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins kan oppdatere invitasjoner"
  ON invitations FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins kan slette invitasjoner"
  ON invitations FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Funksjon for å akseptere invitasjon
CREATE OR REPLACE FUNCTION accept_invitation(invitation_token UUID)
RETURNS JSON AS $$
DECLARE
  inv RECORD;
  user_email TEXT;
  result JSON;
BEGIN
  -- Hent brukerens e-post
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  
  -- Finn invitasjonen
  SELECT * INTO inv FROM invitations 
  WHERE token = invitation_token 
    AND email = user_email
    AND status = 'pending'
    AND expires_at > NOW();
  
  IF inv IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invitasjon ikke funnet eller utløpt');
  END IF;
  
  -- Oppdater brukerens profil med tenant og rolle
  UPDATE profiles 
  SET tenant_id = inv.tenant_id, 
      role = inv.role
  WHERE id = auth.uid();
  
  -- Marker invitasjonen som akseptert
  UPDATE invitations 
  SET status = 'accepted', 
      accepted_at = NOW()
  WHERE id = inv.id;
  
  RETURN json_build_object('success', true, 'tenant_id', inv.tenant_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funksjon for å sjekke pending invitasjoner for en e-post
CREATE OR REPLACE FUNCTION check_pending_invitation(user_email TEXT)
RETURNS JSON AS $$
DECLARE
  inv RECORD;
BEGIN
  SELECT i.*, t.name as tenant_name
  INTO inv 
  FROM invitations i
  JOIN tenants t ON t.id = i.tenant_id
  WHERE i.email = user_email
    AND i.status = 'pending'
    AND i.expires_at > NOW()
  ORDER BY i.created_at DESC
  LIMIT 1;
  
  IF inv IS NULL THEN
    RETURN json_build_object('has_invitation', false);
  END IF;
  
  RETURN json_build_object(
    'has_invitation', true,
    'invitation_id', inv.id,
    'token', inv.token,
    'tenant_name', inv.tenant_name,
    'role', inv.role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
