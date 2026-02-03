-- Opprett budsjett-tabell
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  month TEXT NOT NULL, -- Format: 'YYYY-MM'
  sales_budget DECIMAL(12, 2) DEFAULT 0,
  profit_budget DECIMAL(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, month)
);

-- Index for raskere oppslag
CREATE INDEX idx_budgets_tenant ON budgets(tenant_id);
CREATE INDEX idx_budgets_month ON budgets(month);

-- Row Level Security
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

-- Policies for budgets
CREATE POLICY "Users can view budgets for their tenant"
  ON budgets FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert budgets for their tenant"
  ON budgets FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update budgets for their tenant"
  ON budgets FOR UPDATE
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can delete budgets for their tenant"
  ON budgets FOR DELETE
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
