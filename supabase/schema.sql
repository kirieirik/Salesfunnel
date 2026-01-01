-- =====================================================
-- SALESFUNNEL DATABASE SCHEMA
-- Supabase PostgreSQL Schema for SaaS CRM Application
-- Version: 2.0 (Desember 2025)
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PROFILES (Brukerdata synkronisert med auth.users)
-- =====================================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,  -- Hvilken bedrift brukeren tilhører
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for e-post oppslag
CREATE INDEX idx_profiles_email ON profiles(email);

-- Trigger: Opprett profil automatisk når bruker registrerer seg
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- TENANTS (Bedrifter/Organisasjoner som bruker systemet)
-- =====================================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for tenant oppslag på profiles
CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);

-- =====================================================
-- CUSTOMERS (Kunder)
-- =====================================================
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Grunnleggende info
    name VARCHAR(255) NOT NULL,
    org_nr VARCHAR(20),                          -- Organisasjonsnummer (kan være tom for privatkunder)
    
    -- Kontaktinfo bedrift
    email VARCHAR(255),
    phone VARCHAR(50),
    
    -- Kontaktperson
    contact_person VARCHAR(255),
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    
    -- Adresse (splittet)
    address VARCHAR(255),                        -- Gateadresse
    postal_code VARCHAR(10),                     -- Postnummer
    city VARCHAR(100),                           -- Poststed
    
    -- Bedriftsinfo fra Brønnøysund
    industry VARCHAR(255),                       -- Bransje/Næringskode
    employee_count VARCHAR(20),                  -- Antall ansatte
    website VARCHAR(255),                        -- Hjemmeside
    org_form VARCHAR(100),                       -- Organisasjonsform (AS, ENK, etc.)
    
    -- Økonomi (aggregert fra salg/import)
    total_sales DECIMAL(15,2) DEFAULT 0,         -- Total omsetning
    total_profit DECIMAL(15,2) DEFAULT 0,        -- Total fortjeneste
    margin_percent DECIMAL(5,2) DEFAULT 0,       -- Dekningsgrad i prosent
    
    -- Metadata
    notes TEXT,
    brreg_updated_at TIMESTAMPTZ,                -- Sist synkronisert fra Brønnøysund
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_org_nr ON customers(org_nr) WHERE org_nr IS NOT NULL AND org_nr != '';
CREATE INDEX idx_customers_name ON customers(tenant_id, name);

-- =====================================================
-- ACTIVITIES (Aktiviteter/Hendelser)
-- =====================================================
CREATE TABLE activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Aktivitetstype
    type VARCHAR(50) NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'note')),
    
    -- Innhold
    description VARCHAR(500) NOT NULL,           -- Kort beskrivelse
    content TEXT,                                -- Detaljert innhold/notater
    
    -- Dato og tid
    activity_date DATE NOT NULL,
    activity_time TIME,                          -- Klokkeslett (valgfritt, for bookinger)
    
    -- Status
    is_scheduled BOOLEAN DEFAULT FALSE,          -- Er dette en planlagt aktivitet?
    is_completed BOOLEAN DEFAULT FALSE,          -- Er aktiviteten fullført?
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_activities_tenant ON activities(tenant_id);
CREATE INDEX idx_activities_customer ON activities(customer_id);
CREATE INDEX idx_activities_user ON activities(user_id);
CREATE INDEX idx_activities_date ON activities(activity_date);
CREATE INDEX idx_activities_scheduled ON activities(tenant_id, is_scheduled, is_completed) 
    WHERE is_scheduled = TRUE AND is_completed = FALSE;

-- =====================================================
-- SALES (Salg - importert data)
-- =====================================================
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Salgsinfo
    description VARCHAR(500),                    -- Beskrivelse av salget
    amount DECIMAL(15,2) NOT NULL,               -- Beløp eks. mva
    sale_date DATE NOT NULL,
    
    -- Metadata
    notes TEXT,
    import_ref VARCHAR(255),                     -- Referanse fra CSV-import
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sales_tenant ON sales(tenant_id);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_tenant_date ON sales(tenant_id, sale_date);

-- =====================================================
-- UPDATED_AT TRIGGERS
-- Automatisk oppdatering av updated_at kolonne
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activities_updated_at
    BEFORE UPDATE ON activities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_updated_at
    BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VIEWS (Nyttige visninger)
-- =====================================================

-- Månedlig salg per tenant
CREATE VIEW monthly_sales_by_tenant AS
SELECT 
    tenant_id,
    DATE_TRUNC('month', sale_date) AS month,
    SUM(amount) AS total_sales,
    COUNT(*) AS sale_count
FROM sales
GROUP BY tenant_id, DATE_TRUNC('month', sale_date)
ORDER BY tenant_id, month DESC;

-- Kunde-statistikk view
CREATE VIEW customer_stats AS
SELECT 
    c.id AS customer_id,
    c.tenant_id,
    c.name,
    COALESCE(SUM(s.amount), 0) AS calculated_total_sales,
    COUNT(s.id) AS sale_count,
    COUNT(DISTINCT a.id) AS activity_count,
    MAX(s.sale_date) AS last_sale_date,
    MAX(a.activity_date) AS last_activity_date
FROM customers c
LEFT JOIN sales s ON s.customer_id = c.id
LEFT JOIN activities a ON a.customer_id = c.id
GROUP BY c.id, c.tenant_id, c.name;

-- =====================================================
-- KOMMENTARER PÅ TABELLER
-- =====================================================
COMMENT ON TABLE tenants IS 'Bedrifter/organisasjoner som bruker SaaS-løsningen';
COMMENT ON TABLE profiles IS 'Brukerprofiler med kobling til tenant og rolle';
COMMENT ON TABLE customers IS 'Kunder registrert av hver tenant, inkl. data fra Brønnøysund';
COMMENT ON TABLE activities IS 'Aktiviteter (møter, samtaler, e-poster, notater) knyttet til kunder';
COMMENT ON TABLE sales IS 'Salgsdata, primært importert fra CSV';

COMMENT ON COLUMN customers.org_nr IS 'Norsk organisasjonsnummer, tom for privatkunder';
COMMENT ON COLUMN customers.brreg_updated_at IS 'Tidspunkt for siste sync fra Brønnøysundregisteret API';
COMMENT ON COLUMN activities.is_scheduled IS 'TRUE = fremtidig booking, FALSE = historisk aktivitet';
COMMENT ON COLUMN sales.import_ref IS 'Unik referanse fra CSV-import for å unngå duplikater';
