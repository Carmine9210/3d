# 3D Market — MVP (Fase 1 + Step 7–9)

Marketplace verticale per la stampa 3D: shop venditori, catalogo di **prodotti fisici**, checkout con **Stripe Connect** (commissione trattenuta in automatico), **IT + EN**, dashboard venditore e admin.

Stack: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · next-intl · Supabase (Auth, Postgres, Storage, RLS) · Stripe Connect Express · Zod · Vitest · Playwright.

> **Stato del codice (Step 7):** il progetto ora **compila, supera lint/typecheck/unit test e il build di produzione**, ed è stato eseguito contro uno stack Supabase reale (Postgres 16 + PostgREST + GoTrue): **52/52 controlli RLS** e **54/54 test E2E Playwright** passano (Step 8), compreso il pagamento simulato via webhook Stripe firmato. Non sono stati provati: un vero pagamento Stripe (serve il tuo account), l'invio email reale e il deploy effettivo su Netlify (il build Netlify locale arriva fino al bundling delle funzioni). Guida al deploy: **[NETLIFY-LEGGIMI.md](NETLIFY-LEGGIMI.md)** (rapida) e **[docs/DEPLOY.md](docs/DEPLOY.md)** (completa).

## 1. Avvio locale

```bash
npm install
cp .env.example .env.local     # compila le variabili (vedi sotto)
npm run dev                    # http://localhost:3000  (→ /it)
```

### Variabili d'ambiente
Tutte le variabili sono elencate e commentate in `.env.example`. Dopo averle compilate:
```bash
npm run check-env      # verifica presenza e formato (non stampa mai i valori)
```
Lato codice sono validate con Zod in `lib/env.ts` (messaggio chiaro se ne manca una).

| Variabile | Obbligatoria | Dove si usa |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sì | client e server |
| `SUPABASE_SERVICE_ROLE_KEY` | sì | **solo server** (webhook, azioni verificate) |
| `STRIPE_SECRET_KEY` | sì | pagamenti e Connect |
| `STRIPE_WEBHOOK_SECRET` | sì | uno o più secret separati da virgola |
| `NEXT_PUBLIC_SITE_URL` | sì | redirect Stripe/Auth, sitemap (senza slash finale) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` | no | email transazionali (senza chiave: solo log) |

Le **variabili di business** (commissione, spedizione, soglia di pubblicazione diretta) non sono in `.env`: si modificano da `/admin/settings` e valgono subito, senza deploy. La commissione di un singolo venditore si cambia da `/admin/sellers`.

### Supabase
1. Crea un progetto su supabase.com (o usa `supabase start` in locale).
2. Esegui in ordine nel SQL editor (o con `supabase db push`):
   `supabase/migrations/0001_schema.sql` → … → `0006_analytics.sql` → `0007_phase2.sql` → `0008_launch.sql` → `supabase/seed.sql`
   Con la CLI: `npm run db:link && npm run db:push` (vedi [docs/DEPLOY.md](docs/DEPLOY.md)). In locale con Docker: `npm run db:start`.
3. Copia URL, anon key e **service role key** in `.env.local`. La service role key resta solo lato server.
4. Authentication → URL Configuration: aggiungi `http://localhost:3000/auth/callback` (e l'URL di produzione).
   Per provare senza email di conferma: Authentication → Providers → Email → disattiva "Confirm email" (solo in sviluppo).

### Stripe (modalità test)
1. Dashboard Stripe → attiva **Connect** (account Express, Italia).
2. Metti `STRIPE_SECRET_KEY` (sk_test_…) in `.env.local`.
3. Webhook in locale:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook --forward-connect-to localhost:3000/api/stripe/webhook
   ```
   Copia il `whsec_…` in `STRIPE_WEBHOOK_SECRET`.
4. In produzione crea **due endpoint** verso `/api/stripe/webhook`: uno "Account" (`checkout.session.completed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`) e uno "Connected accounts" (`account.updated`). Ogni endpoint ha il suo secret: mettili entrambi in `STRIPE_WEBHOOK_SECRET` separati da virgola (`whsec_aaa,whsec_bbb`).

### Creare il primo admin
Registrati dall'app, poi nel SQL editor:
```sql
update public.profiles set role = 'admin' where user_id = (select id from auth.users where email = 'tua@email.it');
```

## 2. Come funziona (flusso completo)

1. **Venditore**: `/seller/onboarding` (profilo, dati fiscali, accettazione policy) → crea `vendor` + `store` → `/seller` → "Completa la verifica Stripe" (Connect Express) → crea prodotto (bozza), carica foto, varianti → **Pubblica**.
2. **Moderazione**: finché lo shop ha meno di `auto_publish_threshold` (default 3) prodotti pubblicati, la pubblicazione va in `pending` e un admin approva in `/admin/products`. Dopo, pubblica direttamente. Serve almeno una foto e Stripe attivo.
3. **Cliente**: cerca/filtra → scheda prodotto → carrello (richiede login) → `/checkout` (indirizzo) → il carrello viene **diviso in un ordine per shop** → `/checkout/pay`: "Paga ora" apre una Stripe Checkout Session per ordine con `transfer_data.destination` = conto del venditore e `application_fee_amount` = commissione.
4. **Webhook** `checkout.session.completed` → RPC `mark_order_paid` (atomica e idempotente: stato `paid`, scala stock, svuota il carrello).
5. **Venditore** gestisce lo stato: pagato → in produzione → spedito (corriere + tracking) → consegnato.
6. **Cliente** lascia la recensione (solo su ordini spediti/consegnati propri). Il rating medio si aggiorna via trigger.
7. **Admin**: panoramica (GMV, commissioni), moderazione prodotti, sospensione venditori (sospende anche i prodotti), segnalazioni, ordini, audit log.

## 3. Sicurezza (cosa è già protetto)

- **RLS attiva su tutte le tabelle**; `stripe_events` senza policy (solo service role).
- I venditori **non possono** auto-approvarsi, alterare rating/stato shop né modificare commissione o dati Stripe (trigger `guard_products` / `guard_stores` + nessuna policy di update su `vendors`).
- Ordini, pagamenti, recensioni e audit si scrivono solo lato server (service role) dopo verifica di proprietà.
- I prezzi si **ricalcolano sul server**; importi sempre in centesimi.
- Webhook con verifica firma + tabella `stripe_events` per idempotenza (se il handler fallisce il record viene rimosso e Stripe ritenta).
- Upload immagini: solo JPG/PNG/WebP ≤ 5 MB, path vincolato all'id dello shop tramite policy Storage.
- Header di sicurezza base in `next.config.mjs`; ruolo admin ri-verificato in ogni azione.

## 4. Struttura

```
app/[locale]/…        pagine (public, account, seller, admin, checkout, legal)
app/api/stripe/…      webhook + onboarding/dashboard Connect
netlify/functions/    funzioni Netlify (cleanup schedulato)
types/database.ts     tipi del database (npm run db:types)
docs/DEPLOY.md        guida deploy Supabase + Netlify + Stripe
lib/actions/…         server actions (auth, cart, checkout, seller, social, admin)
lib/supabase, lib/stripe, lib/*.ts
components/           UI condivisa
messages/             it.json / en.json (chiavi identiche)
supabase/             migrazioni SQL + seed
tests/                Vitest (unit) + Playwright (smoke)
```

## 5. Test

```bash
npm test          # unit: prezzi, commissione, slug, validatori
npm run e2e       # smoke Playwright (routing i18n, home, redirect login)
```

### Test end-to-end manuale (Stripe test mode)
1. Account A: diventa venditore, completa Connect con i dati di test Stripe, crea prodotto con foto, pubblica.
2. Account admin: approva il prodotto in `/admin/products`.
3. Account B (cliente): acquista con la carta `4242 4242 4242 4242`.
4. Verifica: ordine `paid`, stock scalato, commissione trattenuta in Stripe, poi spedizione, consegna e recensione.

## 5b. Step 2 — configurazione e hardening

- **Validazione env** (`lib/env.ts`, `npm run check-env`) e `.env.example` completo.
- **Impostazioni admin** (`/admin/settings`): commissione predefinita, soglia di pubblicazione diretta, spedizione fissa e gratuita sopra soglia. Ogni modifica finisce nell'audit log.
- **Commissione per venditore** modificabile da `/admin/sellers`.
- **Email transazionali** (Resend, via REST, nessuna dipendenza): ordine pagato (cliente + venditore) e ordine spedito con tracking, in IT/EN secondo la lingua dell'utente. Inviate una sola volta anche se Stripe ripete l'evento. Senza `RESEND_API_KEY` vengono solo loggate.
- **Rate limiting** su login (10 / 10 min), registrazione (5 / ora), creazione ordini, pagamento, segnalazioni. È in memoria, quindi per istanza: per una protezione globale sostituisci `lib/rate-limit.ts` con Upstash Ratelimit (stessa firma).
- **Webhook** con più secret.
- Nuovi test: rate limit, validazione env, escape HTML delle email.

## 5c. Step 3 — rimborsi e contestazioni

**Flusso rimborso**
1. **Cliente** (`/account/orders/[id]`): su un ordine pagato/in produzione/spedito/consegnato può aprire **una** richiesta (motivo + dettagli). Vede lo stato (in esame / approvata / rifiutata) e l'importo già rimborsato.
2. **Venditore** (`/seller/orders`) o **admin** (`/admin/refunds`): approva (importo libero, vuoto = tutto il residuo) o rifiuta. Il venditore può anche rimborsare direttamente senza richiesta.
3. Il rimborso parte su Stripe con `reverse_transfer` (recupera i fondi dal conto del venditore) e `refund_application_fee` (restituisce la commissione in proporzione).
4. L'ordine aggiorna `refunded_cents`; a rimborso totale passa a `refunded` e, se non ancora spedito, **rimette a magazzino** le quantità. Il cliente riceve un'email.
5. Il webhook `charge.refunded` riallinea `refunded_cents` a Stripe: vale anche per rimborsi fatti dalla dashboard Stripe.

**Contestazioni (chargeback)**: il webhook porta l'ordine a `disputed`. `/admin/refunds` le elenca con link diretto a Stripe, dove si caricano le prove e si risponde. Alla chiusura (`charge.dispute.closed`): se **vinta** l'ordine torna allo stato precedente, se **persa** diventa `refunded`.

Sicurezza: ogni azione ricontrolla che chi agisce sia admin o il venditore proprietario dell'ordine; importi validati (interi, ≤ residuo); chiave di idempotenza su ogni rimborso Stripe per evitare doppi rimborsi.

## 5d. Step 4 — collaudo e qualità

Serve un progetto Supabase **di test** (mai quello di produzione) con le migrazioni applicate.

```bash
npm run seed:demo     # crea admin/venditore/cliente demo, shop e 7 prodotti (6 pubblicati + 1 bozza)
npm run check-rls     # prova la sicurezza RLS con client reali non privilegiati
npm run e2e           # test Playwright su browser reale (avvia da solo il dev server)
```
Utenti demo (password `Demo-Passw0rd!`): `admin@demo.test`, `seller@demo.test`, `customer@demo.test`. Il seed rifiuta di girare se `NEXT_PUBLIC_SITE_URL` non è localhost (salvo `--force`).

- **`check-rls`** (≈25 controlli): un anonimo non legge ordini, venditori, profili, audit né prodotti in bozza e non può chiamare le funzioni di pagamento; un cliente non può promuoversi admin, creare ordini o scrivere recensioni; un venditore non può auto-pubblicare, falsare il rating, cambiare stato dello shop, commissione o stato Stripe. Esce con codice ≠ 0 se qualcosa non regge, quindi è usabile in CI.
- **E2E**: smoke (i18n, redirect, 404, legali), catalogo (ricerca IT/EN, filtri, categoria, shop, JSON-LD, bozza irraggiungibile), acquisto (carrello → checkout → ordine da pagare, limite stock, accessi negati) e ruoli (dashboard venditore, tutte le pagine admin, modifica di una variabile di business).
- **Contestazioni**: `charge.dispute.closed` ora aggiorna lo stato (vinta → ripristino, persa → `refunded`).
- **CI GitHub** (`docs/ci-workflow.yml`, da copiare a mano in `.github/workflows/ci.yml` dal sito di GitHub): typecheck, lint, unit test e build a ogni push/PR. Il job E2E parte solo se imposti la variabile di repository `RUN_E2E=true` e i secret `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY`, `TEST_STRIPE_SECRET_KEY`.

Il pagamento reale su Stripe non è automatizzato: va provato a mano in test mode (vedi sezione 5).

## 5e. Step 5 — completamento della Fase 1

- **Shop del venditore** (`/seller/settings`): modifica dati, descrizioni IT/EN, politica di reso, **logo e copertina** (JPG/PNG/WebP ≤ 5 MB, le vecchie immagini vengono rimosse). Logo e copertina compaiono sulla pagina pubblica dello shop.
- **Statistiche** (`/seller/analytics` + riquadro visite in dashboard): visite, ordini pagati, **conversione**, fatturato e pezzi venduti negli ultimi 30 giorni, grafico giornaliero e prodotti più visti. Le visite sono **aggregate per giorno, senza cookie e senza dati personali**; non conta chi guarda il proprio shop.
- **Indirizzo** del checkout salvato come predefinito e precompilato agli acquisti successivi.
- **Profilo cliente** (`/account/profile`): nome, telefono, lingua; **download dei propri dati in JSON** (portabilità GDPR); **eliminazione account** con conferma via email. Bloccata se ci sono ordini in corso o se l'utente è venditore. Senza storico ordini l'utente è cancellato del tutto; con storico i dati personali vengono cancellati, gli ordini restano archiviati (obblighi fiscali) e l'accesso è disattivato.
- `npm run db:types` genera i tipi del database (richiede Supabase CLI e `SUPABASE_PROJECT_ID`).

## 5f. Step 6 — design orientato alla conversione

Principio: ogni elemento che spinge all'acquisto si basa su **dati reali**. Niente urgenza finta, niente recensioni inventate.

- **Carrello ospite**: si aggiunge al carrello senza account; si registra/accede solo al pagamento. Il carrello vive in un cookie (`gc`, httpOnly) con parsing difensivo (UUID validi, quantità 1–99, max 20 righe), i **prezzi si rileggono sempre dal database**, e al login/registrazione/conferma email viene **unito** a quello dell'account rispettando lo stock. Il `next` si conserva lungo tutto il percorso (carrello → registrazione → conferma email → checkout).
- **Home come funnel**: promessa + ricerca + ricerche frequenti, barra di fiducia, categorie, novità, "come funziona", recensioni (compaiono solo se esistono ≥ 2 recensioni vere con commento ≥ 4 stelle), CTA venditore con la commissione reale da `app_config`, FAQ con dati strutturati `FAQPage`.
- **Scheda prodotto**: galleria con miniature, breadcrumb (+ `BreadcrumbList`), **consegna stimata** (giorni di produzione + 2–4 giorni lavorativi di spedizione, weekend esclusi), costo spedizione e soglia gratuita dalle impostazioni, "ultimi pezzi" solo con stock reale ≤ 5, garanzie vicino al pulsante, scheda del maker con rating, **barra d'acquisto fissa su mobile**.
- **Card prodotto**: badge *Ultimi pezzi* (stock ≤ 3), *Esaurito* e *Personalizzabile*.
- **Carrello**: barra di avanzamento verso la spedizione gratuita per shop, garanzie, CTA grande.
- **Checkout**: indicatore dei passi, riepilogo ordine sempre visibile, nota di sicurezza sul pagamento.
- **Header** con barra categorie e conteggio carrello anche per gli ospiti; **footer** con garanzie.
- Nuovi test: stima consegna, carrello ospite (parsing, merge, limiti), e2e di conversione.

**Da misurare dopo il lancio** (non ancora tracciato): funnel visita → carrello → checkout → pagamento. Le sole visite e la conversione finale sono già in `/seller/analytics`. Prima di fare A/B test serve traffico reale.

## 5g. Step 7 — Supabase + Netlify, verifica reale e Fase 2

**Messa in produzione**
- **Netlify**: `netlify.toml` (Node 22, adapter `@netlify/plugin-nextjs`, header no-cache su `/api/*`), `NEXT_PUBLIC_SITE_URL` ricavata in automatico da `URL`/`DEPLOY_PRIME_URL` (deploy preview funzionanti), IP reale da `x-nf-client-connection-ip`.
- **Funzione schedulata** `netlify/functions/cleanup.mts` (ogni ora): annulla ordini non pagati dopo 48 h, pulisce rate limit ed eventi Stripe vecchi (`cleanup_stale()`).
- **Supabase CLI**: `supabase/config.toml` + script `db:start`, `db:link`, `db:push`, `db:types`. Estensioni nello schema `extensions`, `search_path` fissato sulle funzioni trigger, limiti dei bucket applicati anche da Storage.
- **Upload diretto su Storage** (`components/DirectUpload.tsx`): le foto vanno dal browser a Supabase (ridimensionate a max 2000 px), il server verifica solo il percorso. Necessario perché Netlify accetta richieste fino a ~6 MB.
- **Rate limiting globale** su Supabase (`rate_limits` + `rate_limit_hit()` atomica), con ripiego in memoria. Login: 10 tentativi / 10 min per account + 50 per IP.
- **Client Supabase tipizzati** (`types/database.ts`): ogni colonna usata nel codice è verificata dal compilatore. `@supabase/ssr` aggiornato a 0.12.
- **Font self-hosted** (OFL) al posto di Google Fonts: build riproducibile offline e nessuna richiesta a Google (GDPR).

**Bug corretti trovati eseguendo l'app**
- La **scheda prodotto andava in errore 500** (funzione passata a un Client Component in `Gallery`).
- `next/image` rifiutava le immagini di Supabase locale (`http://127.0.0.1:54321`).
- Test E2E con race condition (navigazione prima della fine della Server Action) e dati demo che si "consumavano" tra un'esecuzione e l'altra: ora `seed:demo` ripristina stock, carrello e contatori.

**Nuove funzioni**
- **Password dimenticata / nuova password** (`/forgot-password`, `/reset-password`), risposta neutra che non rivela gli account esistenti.
- **Rubrica indirizzi** (`/account/addresses`): fino a 10, predefinito, scelta rapida al checkout.
- **Messaggi cliente ↔ venditore sull'ordine** con **Supabase Realtime**, conferma di lettura, badge "nuovi messaggi" per il venditore, email all'altra parte. Nuova pagina **dettaglio ordine venditore** (`/seller/orders/[id]`).
- **Risposta pubblica alle recensioni** (`/seller/reviews`), mostrata nella scheda prodotto.
- **Admin → Utenti** (`/admin/users`): elenco con email, ruolo, blocco/sblocco accesso (mai su sé stessi), tutto nell'audit log.
- **Funnel di conversione** in `/seller/analytics`: visite → carrello → checkout → pagati, aggregato per giorno, senza cookie.
- Webhook: gestito anche `checkout.session.async_payment_succeeded` (pagamenti asincroni).

**Verifica**
```bash
npm run typecheck && npm run lint && npm test     # 33 unit test
npm run seed:demo && npm run check-rls            # 45 controlli RLS + Storage
npm run build && npm start & E2E_BASE_URL=http://localhost:3000 npm run e2e   # 45 test E2E
```
I test E2E ora coprono anche: reset password, rubrica, firma webhook, ordine pagato via webhook firmato, messaggi in entrambe le direzioni, spedizione con tracking, recensione + risposta, funnel, utenti admin, upload diretto di una foto.

## 5h. Step 8 — strumenti per il lancio

- **Codici sconto per shop** (`/seller/coupons`): percentuale (1–90%) o importo fisso, spesa minima, scadenza, utilizzi massimi, pausa/riattiva. Il cliente lo inserisce nel riepilogo del checkout e vede subito lo sconto; vale solo per lo shop che l'ha emesso. Lo sconto riduce il subtotale, la **commissione si calcola sul netto scontato** e la spedizione gratuita sul subtotale scontato. Su Stripe diventa un coupon monouso dello stesso importo. Gli utilizzi si contano **solo a pagamento confermato** (una volta, anche se Stripe ripete l'evento) e il venditore non può alterarli (trigger).
- **Modalità ferie** (impostazioni shop): prodotti visibili ma non acquistabili, messaggio ai clienti su scheda prodotto e pagina shop, carrello e checkout bloccati per quello shop.
- **Scorte basse**: soglia scelta dal venditore; email dopo ogni ordine pagato e riquadro in dashboard.
- **Export CSV** degli ordini per la contabilità (venditore: `/seller/orders`, admin: `/admin/orders`): formato Excel italiano (`;`, virgola decimale, BOM), sconto, commissione e netto venditore, protezione da formula injection, intervallo di date. Gli export admin finiscono nell'audit log.
- **Duplica prodotto** come bozza (varianti e foto incluse); le foto condivise non vengono cancellate finché sono in uso.
- **Annulla ordine non pagato** dalla pagina di pagamento.
- **Login più sensato**: per account si contano solo i tentativi **falliti** (max 10 in 10 minuti), più un tetto di 50 tentativi per IP.
- **Pagine di errore** (`error.tsx`, `global-error.tsx`) con codice da comunicare all'assistenza e **`/api/health`** per i monitor di uptime (200 se app e database rispondono, altrimenti 503).
- Netto venditore in dashboard e statistiche ora al netto degli sconti.

Nota: niente `loading.tsx` globale — farebbe rispondere le pagine inesistenti con 200 invece di 404 (soft 404, dannoso per la SEO). Verificato dai test.

## 5i. Step 9 — pronto per Netlify, senza sorprese

- **Build riproducibile**: versioni esatte, `package-lock.json`, `.nvmrc` (Node 22), plugin `@netlify/plugin-nextjs` fissato. Verificato `npm ci` da zero e `netlify build` di produzione completo (server handler, funzione schedulata ed Edge Function del middleware).
- **Sicurezza dipendenze**: `npm audit --omit=dev` → **0 vulnerabilità** (next-intl 4, override PostCSS, Vitest 5).
- **Il deploy si ferma da solo** se mancano le variabili essenziali o se la chiave segreta di Supabase è finita in una variabile pubblica (`scripts/verify-build-env.mjs`).
- **Scansione segreti di Netlify** configurata in `netlify.toml`; verificato che nessuna chiave segreta compaia nell'output del build.
- Accettati i nomi dell'**integrazione Supabase di Netlify** e le **nuove chiavi** `sb_publishable_` / `sb_secret_`.
- **Dependabot** per gli aggiornamenti settimanali (solo minor/patch, verificati dalla CI).
- Guida rapida e tabella errori: **[NETLIFY-LEGGIMI.md](NETLIFY-LEGGIMI.md)**.

## 6. Cosa NON c'è (volutamente, Fase 1)

Stampa su richiesta/RFQ, file digitali, abbonamenti e piani a pagamento (commissione unica 10% da `app_config`/`vendors.commission_bps`), 3D Ads, AI, app mobile, mappa "stampatori vicino a me" (lat/lng già nello schema), codici sconto validi su tutta la piattaforma (oggi sono per shop). Messaggistica e risposte alle recensioni sono state aggiunte nello Step 7, codici sconto e ferie nello Step 8.

## 7. Da fare prima del lancio

- Sostituire i testi legali `TODO-LEGAL` (termini, privacy, cookie) con versioni redatte da un professionista; verificare GDPR, DSA (notice-and-action), consumer law, IVA e fatturazione.
- Rigenerare i tipi con `npm run db:types` dopo ogni nuova migrazione (i client sono tipizzati da `types/database.ts`).
- Creare l'account Resend, verificare il dominio mittente e impostare `RESEND_API_KEY` / `EMAIL_FROM`.
- Validare nome, dominio, prezzi e commissioni (vedi Blueprint §18).


## 8. Checklist di lancio

**Infrastruttura**
- [ ] Progetto Supabase di **produzione** separato da quello di test; migrazioni `0001`→`0008` + `seed.sql`
- [ ] `npm run check-rls` superato sul progetto di test dopo ogni nuova migrazione
- [ ] Auth: conferma email attiva, SMTP personalizzato, URL di redirect di produzione
- [ ] Backup automatici Supabase attivi
- [ ] Variabili d'ambiente su Netlify (`npm run check-env` in locale con le chiavi di produzione)
- [ ] Redirect URL di Supabase Auth: dominio di produzione + `https://**--<sito>.netlify.app/**` per i deploy preview
- [ ] SMTP personalizzato in Supabase Auth (conferma email e reset password)
- [ ] Dominio, HTTPS, `NEXT_PUBLIC_SITE_URL` corretto

**Pagamenti**
- [ ] Stripe in modalità **live**, Connect attivato, branding Express configurato
- [ ] Due endpoint webhook con eventi: `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `account.updated`; entrambi i secret in `STRIPE_WEBHOOK_SECRET`
- [ ] Prova completa in test mode: acquisto, spedizione, recensione, rimborso parziale e totale
- [ ] Commissione, spedizione e soglie validate da `/admin/settings`

**Legale e fiscale** (con un professionista)
- [ ] Sostituiti tutti i `TODO-LEGAL`: termini di vendita, privacy, cookie, policy prodotti vietati
- [ ] IVA, fatturazione e trattamento di venditori privati vs professionisti
- [ ] DSA: procedura notice-and-action (oggi: segnalazione + moderazione admin), punto di contatto
- [ ] Informazioni precontrattuali e diritto di recesso per i consumatori
- [ ] Conservazione dei dati degli ordini dopo la cancellazione account

**Operatività**
- [ ] Dominio e mittente email verificati su Resend (`RESEND_API_KEY`, `EMAIL_FROM`)
- [ ] Primo admin creato, indirizzo assistenza (`SUPPORT_EMAIL`)
- [ ] Monitor di uptime su `https://<sito>/api/health` (UptimeRobot, Better Stack…)
- [ ] Monitoraggio errori (es. Sentry) e log del webhook
- [ ] Beta privata con i primi venditori prima dell'apertura pubblica
