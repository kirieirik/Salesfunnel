-- =============================================
-- SALESFUNNEL DATABASE SCHEMA
-- Supabase (PostgreSQL) med Row Level Security
-- =============================================

-- Aktiver UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. PROFILES (kobles til Supabase Auth)
-- =============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for å oppdatere updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-opprett profil når bruker registrerer seg
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- =============================================
-- 2. ORGANIZATIONS (bedrifter/tenants)
-- =============================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- 3. ORG_MEMBERS (kobling bruker <-> org)
-- =============================================
CREATE TYPE org_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_org ON org_members(org_id);
CREATE INDEX idx_org_members_user ON org_members(user_id);

-- =============================================
-- 4. CUSTOMERS (kunder per organisasjon)
-- =============================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  org_nr TEXT,  -- Organisasjonsnummer (kan dupliseres på tvers av orgs)
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_customers_org ON customers(org_id);
CREATE INDEX idx_customers_org_nr ON customers(org_id, org_nr);

-- =============================================
-- 5. ACTIVITIES (kontaktlogg per kunde)
-- =============================================
CREATE TYPE activity_type AS ENUM ('call', 'email', 'meeting', 'note');

CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type activity_type NOT NULL,
  description TEXT NOT NULL,
  content TEXT,  -- For e-post innhold, møtenotater etc.
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_activities_org ON activities(org_id);
CREATE INDEX idx_activities_customer ON activities(customer_id);
CREATE INDEX idx_activities_date ON activities(activity_date DESC);

-- =============================================
-- 6. SALES (salg per kunde)
-- =============================================
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER sales_updated_at
  BEFORE UPDATE ON sales
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_sales_org ON sales(org_id);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_date ON sales(sale_date DESC);

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Aktiver RLS på alle tabeller
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- Hjelpefunksjon: Sjekk om bruker er medlem av org
CREATE OR REPLACE FUNCTION is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.org_id = is_org_member.org_id
    AND org_members.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hjelpefunksjon: Sjekk brukers rolle i org
CREATE OR REPLACE FUNCTION get_user_role(org_id UUID)
RETURNS org_role AS $$
DECLARE
  user_role org_role;
BEGIN
  SELECT role INTO user_role FROM org_members
  WHERE org_members.org_id = get_user_role.org_id
  AND org_members.user_id = auth.uid();
  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- PROFILES POLICIES
-- =============================================
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- For å kunne se andre brukeres email (f.eks. medlemmer i org)
CREATE POLICY "Users can view profiles of org members"
  ON profiles FOR SELECT
  USING (
    id IN (
      SELECT om.user_id FROM org_members om
      WHERE om.org_id IN (
        SELECT org_id FROM org_members WHERE user_id = auth.uid()
      )
    )
  );

-- =============================================
-- ORGANIZATIONS POLICIES
-- =============================================
CREATE POLICY "Users can view organizations they are member of"
  ON organizations FOR SELECT
  USING (is_org_member(id));

CREATE POLICY "Users can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Owners and admins can update organization"
  ON organizations FOR UPDATE
  USING (get_user_role(id) IN ('owner', 'admin'));

CREATE POLICY "Only owners can delete organization"
  ON organizations FOR DELETE
  USING (get_user_role(id) = 'owner');

-- =============================================
-- ORG_MEMBERS POLICIES
-- =============================================
CREATE POLICY "Users can view members of their organizations"
  ON org_members FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "Users can insert themselves as member"
  ON org_members FOR INSERT
  WITH CHECK (user_id = auth.uid() OR get_user_role(org_id) IN ('owner', 'admin'));

CREATE POLICY "Owners and admins can update members"
  ON org_members FOR UPDATE
  USING (get_user_role(org_id) IN ('owner', 'admin'));

CREATE POLICY "Owners and admins can delete members"
  ON org_members FOR DELETE
  USING (
    get_user_role(org_id) IN ('owner', 'admin')
    AND user_id != auth.uid()  -- Kan ikke slette seg selv
  );

-- =============================================
-- CUSTOMERS POLICIES
-- =============================================
CREATE POLICY "Users can view customers in their organizations"
  ON customers FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "Users can create customers in their organizations"
  ON customers FOR INSERT
  WITH CHECK (is_org_member(org_id));

CREATE POLICY "Users can update customers in their organizations"
  ON customers FOR UPDATE
  USING (is_org_member(org_id));

CREATE POLICY "Owners and admins can delete customers"
  ON customers FOR DELETE
  USING (get_user_role(org_id) IN ('owner', 'admin', 'member'));

-- =============================================
-- ACTIVITIES POLICIES
-- =============================================
CREATE POLICY "Users can view activities in their organizations"
  ON activities FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "Users can create activities in their organizations"
  ON activities FOR INSERT
  WITH CHECK (is_org_member(org_id));

CREATE POLICY "Users can update activities in their organizations"
  ON activities FOR UPDATE
  USING (is_org_member(org_id));

CREATE POLICY "Users can delete activities in their organizations"
  ON activities FOR DELETE
  USING (is_org_member(org_id));

-- =============================================
-- SALES POLICIES
-- =============================================
CREATE POLICY "Users can view sales in their organizations"
  ON sales FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "Users can create sales in their organizations"
  ON sales FOR INSERT
  WITH CHECK (is_org_member(org_id));

CREATE POLICY "Users can update sales in their organizations"
  ON sales FOR UPDATE
  USING (is_org_member(org_id));

CREATE POLICY "Users can delete sales in their organizations"
  ON sales FOR DELETE
  USING (is_org_member(org_id));

-- =============================================
-- VIEWS FOR STATISTICS
-- =============================================

-- Månedlig salg per org
CREATE OR REPLACE VIEW monthly_sales AS
SELECT 
  org_id,
  DATE_TRUNC('month', sale_date) AS month,
  SUM(amount) AS total_sales,
  COUNT(*) AS num_sales
FROM sales
GROUP BY org_id, DATE_TRUNC('month', sale_date)
ORDER BY month DESC;

-- Salg per kunde per org
CREATE OR REPLACE VIEW customer_sales AS
SELECT 
  c.org_id,
  c.id AS customer_id,
  c.name AS customer_name,
  COALESCE(SUM(s.amount), 0) AS total_sales,
  COUNT(s.id) AS num_sales
FROM customers c
LEFT JOIN sales s ON s.customer_id = c.id
GROUP BY c.org_id, c.id, c.name
ORDER BY total_sales DESC;
