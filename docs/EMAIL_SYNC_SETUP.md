# E-post Synkronisering - Oppsett

## Oversikt
Systemet synkroniserer automatisk e-poster fra brukerens IMAP-konto og logger dem på kundekort basert på e-postadresse-matching.

## Komponenter

### 1. Database (kjør migrasjonen)
```bash
supabase db push
```

Eller kjør SQL manuelt:
- `supabase/migrations/add_email_sync_fields.sql`

### 2. Edge Functions (deploy)
```bash
# Test IMAP-tilkobling
supabase functions deploy test-imap-connection

# Lagre krypterte credentials
supabase functions deploy save-imap-credentials

# Slett credentials
supabase functions deploy clear-imap-credentials

# Sync e-poster (kalles av cron)
supabase functions deploy sync-emails
```

### 3. Environment Variables (sett i Supabase Dashboard)
```
IMAP_ENCRYPTION_KEY=<generer en sterk nøkkel>
```

Generer nøkkel:
```bash
openssl rand -hex 32
```

### 4. Cron Job (sett opp i Supabase Dashboard)
Gå til **Database → Extensions** og aktiver `pg_cron`.

Deretter, kjør denne SQL:
```sql
-- Kjør sync hvert 5. minutt
SELECT cron.schedule(
  'sync-emails-job',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := '<din-supabase-url>/functions/v1/sync-emails',
    headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb
  );
  $$
);
```

Eller bruk **Supabase Cron** via Dashboard:
1. Gå til **Edge Functions**
2. Velg `sync-emails`
3. Klikk **Schedule**
4. Sett til `*/5 * * * *` (hvert 5. minutt)

## Hvordan det fungerer

1. **Bruker setter opp synkronisering:**
   - Går til Innstillinger → E-postsynkronisering
   - Fyller inn e-post og passord
   - Klikker "Test og aktiver"

2. **System tester tilkobling:**
   - `test-imap-connection` verifiserer IMAP-tilgang
   - `save-imap-credentials` lagrer kryptert passord

3. **Automatisk synkronisering:**
   - `sync-emails` kjøres hvert 5. minutt
   - Kobler til IMAP og henter nye e-poster
   - Matcher avsender/mottaker mot kunders `email` og `contact_email`
   - Oppretter aktivitet på kundekortet

## Sikkerhet

- Passord krypteres med AES-256-GCM før lagring
- Krypteringsnøkkel er server-side only (Edge Function secret)
- RLS policies sikrer at brukere kun ser egne credentials
- IMAP-tilkobling bruker STARTTLS

## Feilsøking

### "Kunne ikke koble til e-postserveren"
- Sjekk at e-post og passord er korrekt
- Verifiser at IMAP er aktivert hos Uniweb
- Sjekk brannmur/nettverk (port 143)

### E-poster synkroniseres ikke
- Sjekk at kunden har `email` eller `contact_email` satt
- Sjekk at e-postadressen matcher eksakt
- Se Supabase logs for feilmeldinger
