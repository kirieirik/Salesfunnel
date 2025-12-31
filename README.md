# Salesfunnel

En moderne SaaS-løsning for kundestyring og salgssporing bygget med React, Vite og Supabase.

## 🚀 Teknisk Stack

- **Frontend:** Vite + React
- **Backend/Database:** Supabase (PostgreSQL + Row Level Security)
- **Hosting:** Vercel
- **Autentisering:** Supabase Auth

## 📋 Funksjonalitet

- ✅ Multi-tenant arkitektur med organisasjoner
- ✅ Brukeradministrasjon med roller (owner, admin, member)
- ✅ Kunderegistrering med org.nr, kontaktinfo
- ✅ Import av kunder fra CSV
- ✅ Aktivitetslogg (samtaler, e-post, møter, notater)
- ✅ Salgsregistrering per kunde
- ✅ Statistikk og rapporter
- ✅ Responsivt design (mobil + desktop)

## 🛠 Oppsett

### 1. Klon prosjektet

```bash
git clone https://github.com/kirieirik/Salesfunnel.git
cd Salesfunnel
npm install
```

### 2. Supabase Setup

1. Opprett et prosjekt på [supabase.com](https://supabase.com)
2. Kjør SQL-skriptet i `supabase/schema.sql` i Supabase SQL Editor
3. Kopier `.env.example` til `.env` og fyll inn dine Supabase-credentials:

```bash
cp .env.example .env
```

Rediger `.env`:
```
VITE_SUPABASE_URL=https://din-prosjekt-id.supabase.co
VITE_SUPABASE_ANON_KEY=din-anon-key
```

### 3. Start utviklingsserver

```bash
npm run dev
```

Åpne [http://localhost:5173](http://localhost:5173)

## 📁 Prosjektstruktur

```
src/
├── components/
│   ├── common/          # Gjenbrukbare UI-komponenter
│   │   ├── Button.jsx
│   │   ├── Card.jsx
│   │   ├── Input.jsx
│   │   └── Modal.jsx
│   ├── customers/       # Kundekomponenter
│   │   ├── CustomerForm.jsx
│   │   ├── ActivityForm.jsx
│   │   ├── SaleForm.jsx
│   │   └── ImportCustomers.jsx
│   └── layout/          # Layout-komponenter
│       ├── Header.jsx
│       ├── Layout.jsx
│       └── Sidebar.jsx
├── contexts/
│   ├── AuthContext.jsx  # Autentisering
│   └── OrgContext.jsx   # Organisasjonshåndtering
├── hooks/
│   ├── useActivities.js # Aktivitets-CRUD
│   ├── useCustomers.js  # Kunde-CRUD
│   └── useSales.js      # Salgs-CRUD
├── lib/
│   └── supabase.js      # Supabase-klient
├── pages/
│   ├── auth/
│   │   ├── Login.jsx
│   │   └── Register.jsx
│   ├── Customers.jsx
│   ├── CustomerDetail.jsx
│   ├── Dashboard.jsx
│   ├── Settings.jsx
│   └── Statistics.jsx
├── App.jsx
├── index.css
└── main.jsx
```

## 🔐 Sikkerhet

- **Row Level Security (RLS):** All data er isolert per organisasjon
- **Multi-tenant:** Brukere kan bare se data fra sine egne organisasjoner
- **Rollebasert tilgang:** Owner, Admin og Member med ulike rettigheter

## 🗃 Database-modell

```
profiles (auth brukere)
    └── org_members (kobling)
            └── organizations (tenants)
                    ├── customers
                    │       ├── activities
                    │       └── sales
```

## 📊 API / Hooks

### useCustomers()
```javascript
const { 
  customers, 
  createCustomer, 
  updateCustomer, 
  deleteCustomer,
  importCustomers 
} = useCustomers()
```

### useActivities(customerId?)
```javascript
const { 
  activities, 
  createActivity, 
  updateActivity, 
  deleteActivity 
} = useActivities(customerId)
```

### useSales(customerId?)
```javascript
const { 
  sales, 
  createSale, 
  updateSale, 
  deleteSale,
  getSalesByMonth,
  getTotalSales 
} = useSales(customerId)
```

## 🚢 Deploy til Vercel

1. Push til GitHub
2. Importer prosjektet i [Vercel](https://vercel.com)
3. Legg til environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy!

## 📝 Lisens

MIT
