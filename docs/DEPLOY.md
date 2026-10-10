# Deploy: Supabase + Netlify (+ Stripe)

> Guida rapida e soluzione dei problemi: **[NETLIFY-LEGGIMI.md](../NETLIFY-LEGGIMI.md)**. Non usare "Netlify Drop" (trascinare lo zip): serve il build di Netlify, via GitHub o CLI.

Guida passo-passo per mettere online 3D Market. Tempo stimato: 30–45 minuti la prima volta.
Fai tutto prima con un progetto **di test** (Supabase separato + chiavi Stripe `sk_test_`), poi ripeti per la produzione.

---

## 1. Supabase

### 1.1 Crea il progetto
1. [supabase.com](https://supabase.com) → **New project**. Regione consigliata: `eu-central-1` (Francoforte) o `eu-south-1` (Milano) se disponibile.
2. Annota da **Project Settings → API**: `Project URL`, `anon public` key, `service_role` key.
3. Annota il **Reference ID** (Project Settings → General): è il `SUPABASE_PROJECT_ID`.

### 1.2 Applica migrazioni e dati iniziali
Opzione A — CLI (consigliata, ripetibile):
```bash
export SUPABASE_PROJECT_ID=<reference-id>
npx supabase login                 # una volta sola
npm run db:link                    # collega la cartella al progetto (chiede la password del DB)
npm run db:push                    # applica supabase/migrations/0001→0008 + supabase/seed.sql
npm run db:types                   # rigenera types/database.ts dallo schema reale
```
Opzione B — dashboard: **SQL Editor**, esegui in ordine i file `supabase/migrations/0001_schema.sql` … `0008_launch.sql`, poi `supabase/seed.sql` — oppure, in un colpo solo, incolla ed esegui `supabase/setup-completo.sql` (migrazioni 0001→0008 + seed).

### 1.3 Authentication
**Authentication → URL Configuration**
- **Site URL**: `https://<tuo-sito>.netlify.app` (o il dominio definitivo)
- **Redirect URLs** (una per riga):
  - `https://<tuo-sito>.netlify.app/**`
  - `https://**--<tuo-sito>.netlify.app/**` ← deploy preview e branch deploy
  - `http://localhost:3000/**` (solo nel progetto di test)

**Authentication → Providers → Email**: lascia attivo *Confirm email* in produzione.

**Authentication → SMTP Settings**: configura un SMTP tuo (es. Resend: host `smtp.resend.com`, porta 465, utente `resend`, password = API key). L'SMTP di default di Supabase ha limiti molto bassi e non va bene per il lancio.

### 1.4 Realtime
Le migrazioni aggiungono `order_messages` alla pubblicazione `supabase_realtime`: i messaggi sull'ordine arrivano senza ricaricare. Verifica in **Database → Publications** che `order_messages` sia spuntata.

### 1.5 Storage
I bucket `product-images` e `store-assets` vengono creati dalle migrazioni (pubblici in lettura, 5 MB, solo JPG/PNG/WebP). La scrittura è consentita solo nella cartella del proprio shop (`{store_id}/…`).

### 1.6 Primo admin
Registrati dal sito, poi nel SQL Editor:
```sql
update public.profiles set role = 'admin'
where user_id = (select id from auth.users where email = 'tua@email.it');
```
Da lì in poi i ruoli si gestiscono da **/admin/users**.

---

## 2. Netlify

### 2.1 Collega il repository
1. Carica il progetto su GitHub (o GitLab/Bitbucket).
2. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project** → scegli il repository.
3. Netlify legge `netlify.toml`: build `npm run build`, publish `.next`, Node 22, adapter `@netlify/plugin-nextjs`. Non serve cambiare nulla.

### 2.2 Variabili d'ambiente
**Site configuration → Environment variables** (scope: *Builds* + *Functions*; per i deploy preview usa i valori del progetto di test):

| Variabile | Valore |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL di Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key (o la nuova *publishable* `sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (o la nuova *secret* `sb_secret_…`) — **segreta**, marcala "Contains secret values" |
| `STRIPE_SECRET_KEY` | `sk_test_…` / `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | i due `whsec_…` separati da virgola (vedi §3) |
| `NEXT_PUBLIC_SITE_URL` | facoltativa: se vuota si usa l'URL del deploy. Impostala quando colleghi il dominio |
| `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` | facoltative (email transazionali) |

Puoi usare la CLI: `npx netlify-cli env:set NOME valore`. Con contesti diversi (production vs deploy-preview) usa `--context`.

### 2.3 Deploy
**Deploys → Trigger deploy**. A build finito apri il sito: deve rispondere `/it`.

### 2.4 Funzione schedulata
`netlify/functions/cleanup.mts` gira **ogni ora** (solo sui deploy pubblicati in produzione): annulla gli ordini mai pagati dopo 48 h e pulisce i contatori di rate limit e gli eventi Stripe più vecchi di 90 giorni. La trovi in **Logs → Functions → cleanup**.

### 2.5 Dominio
**Domain management → Add a domain**. Poi aggiorna `NEXT_PUBLIC_SITE_URL`, il *Site URL* di Supabase e gli URL degli endpoint Stripe, e rifai il deploy.

---

## 3. Stripe

1. Dashboard Stripe → **Connect** attivo (account Express, Italia), branding configurato.
2. **Developers → Webhooks → Add endpoint** — creane **due**, entrambi verso `https://<tuo-sito>/api/stripe/webhook`:
   - *Events on your account*: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`
   - *Events on Connected accounts*: `account.updated`
3. Copia i due *Signing secret* in `STRIPE_WEBHOOK_SECRET` separati da virgola: `whsec_aaa,whsec_bbb`.
4. Prova in test mode (carta `4242 4242 4242 4242`): acquisto → ordine `Pagato` → spedizione → recensione → rimborso.

---

## 4. Verifiche dopo il deploy

```bash
# contro il progetto Supabase di TEST (mai produzione):
npm run seed:demo      # utenti e prodotti demo
npm run check-rls      # 52 controlli di sicurezza RLS + Storage
E2E_BASE_URL=https://<deploy-preview>.netlify.app npm run e2e
```

Checklist rapida in produzione:
- [ ] `/it` e `/en` si aprono, ricerca e scheda prodotto funzionano
- [ ] registrazione → email di conferma ricevuta → login
- [ ] "Password dimenticata?" → email → nuova password
- [ ] venditore: onboarding Stripe completato, foto caricate (upload diretto su Storage), prodotto pubblicato
- [ ] acquisto di prova → webhook `200` in Stripe → ordine `Pagato`, email a cliente e venditore
- [ ] messaggio sull'ordine dal cliente → il venditore lo vede (badge "nuovo messaggio") e riceve l'email
- [ ] funzione `cleanup` eseguita (Logs → Functions)
- [ ] `https://<sito>/api/health` risponde `{"ok":true,"db":"ok"}` → collegalo a un monitor di uptime
- [ ] codice sconto di prova: creato dal venditore, applicato al checkout, sconto visibile anche su Stripe

---

## 5. Sviluppo locale con lo stack Supabase completo

Richiede Docker.
```bash
npm run db:start            # Supabase locale: API :54321, DB :54322, Studio :54323, email di test :54324
# copia URL e chiavi stampate in .env.local (NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321)
npm run seed:demo
npm run dev                 # oppure: npm run netlify:dev (emula Netlify su :8888)
```
Webhook Stripe in locale: `stripe listen --forward-to localhost:3000/api/stripe/webhook --forward-connect-to localhost:3000/api/stripe/webhook`.

## Limiti di Netlify da conoscere
- **Richieste fino a ~6 MB** per funzione: per questo le foto vanno dal browser direttamente a Supabase Storage (componente `DirectUpload`) e il server riceve solo il percorso.
- **Timeout delle funzioni** (10 s di default): il webhook Stripe invia le email in linea (con Resend di solito meno di un secondo). Se Stripe segnala timeout, è il primo punto da spostare in una Background Function.
- Le istanze sono effimere: per questo il rate limiting usa la tabella `rate_limits` su Supabase e non la memoria.
