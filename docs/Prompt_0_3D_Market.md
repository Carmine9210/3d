# PROMPT 0 — 3D MARKET (MVP Fase 1)

Sei l'agent di sviluppo senior del progetto **3D Market**, un marketplace verticale per la stampa 3D. Costruisci lo scheletro dell'MVP seguendo questo documento. Lavora a step, committa a ogni step, non anticipare funzioni fuori scope.

---

## 1. Contesto

3D Market permette a maker, laboratori e aziende di aprire uno shop e vendere **prodotti fisici stampati in 3D**. Clienti finali acquistano in un ambiente sicuro, con pagamento marketplace e commissione di piattaforma.

Tagline: *Dall'idea all'oggetto.*
Palette: blu profondo (#0B1F3A), arancio energico (#F28C28), neutri chiari.
Tono: semplice per i clienti, professionale per i venditori.

## 2. Decisioni già prese

| Tema | Decisione |
|---|---|
| Pagamenti | **Stripe Connect dal giorno 1** (payout automatici ai venditori) |
| Lingue | **Italiano + Inglese attivi al lancio** (default: `it`) |
| Priorità MVP | **Prodotti fisici** (shop + catalogo). Niente RFQ, niente file digitali |
| Mercato | Italia, architettura pronta per UE (multivaluta predisposta, solo EUR attiva) |

## 3. Stack

- **Frontend:** Next.js (App Router) + React + TypeScript + Tailwind
- **i18n:** `next-intl`, routing `/it/...` e `/en/...`, tutti i testi in file di messaggi, mai hardcoded
- **Backend:** Supabase (Auth, PostgreSQL, Storage, Realtime, Edge Functions)
- **Pagamenti:** Stripe + Stripe Connect (account **Express**)
- **Validazione:** Zod su ogni input server-side
- **Hosting:** Vercel (preview per branch)
- **Ricerca:** PostgreSQL full-text + trigram (nessun motore esterno)
- **Test:** Vitest (unit) + Playwright (e2e flusso acquisto)

## 4. Struttura cartelle

```
/app
  /[locale]
    /(public)        home, categorie, ricerca, prodotto, shop/[slug]
    /(auth)          login, registrazione, reset password
    /(customer)      account, ordini, preferiti, indirizzi
    /(seller)        seller/dashboard, prodotti, ordini, payout, onboarding
    /(admin)         admin/utenti, venditori, prodotti, ordini, segnalazioni
    /cart, /checkout
  /api
    /stripe/webhook
    /stripe/connect/onboarding
/components           ui/, product/, shop/, layout/, forms/
/lib                  supabase/, stripe/, validators/, utils/, i18n/
/messages             it.json, en.json
/supabase
  /migrations         SQL versionato
  /functions          edge functions
  seed.sql
/tests
```

## 5. Ruoli e permessi

Ruoli: `customer`, `seller`, `admin`. Un utente può essere customer + seller.

- **customer:** legge catalogo, gestisce carrello/ordini/preferiti/recensioni propri
- **seller:** CRUD solo su proprio shop, prodotti, varianti, immagini; vede solo ordini che contengono i suoi articoli
- **admin:** accesso completo, sospende utenti/shop/prodotti, vede audit log

Regole: **RLS attiva su tutte le tabelle**. Nessuna tabella senza policy. Il service role key vive solo server-side (webhook, edge functions). Ogni azione admin sensibile scrive su `audit_logs`.

## 6. Schema database (MVP)

Crea le migrazioni SQL per queste tabelle (tutte con `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`):

- **profiles**: `user_id` (fk auth.users), `display_name`, `role`, `locale`, `phone`, `avatar_url`
- **vendors**: `user_id`, `type` (private | professional | company), `status` (pending | active | suspended), `stripe_account_id`, `charges_enabled`, `payouts_enabled`, `tax_data` (jsonb), `commission_bps` (default 1000 = 10%)
- **stores**: `vendor_id`, `slug` (unique), `name`, `description_it`, `description_en`, `logo_url`, `cover_url`, `city`, `region`, `country`, `lat`, `lng`, `avg_production_days`, `return_policy`, `status`
- **categories**: `parent_id`, `slug`, `name_it`, `name_en`, `sort_order` — seed con le 12 categorie del blueprint
- **products**: `store_id`, `category_id`, `slug`, `title_it`, `title_en`, `description_it`, `description_en`, `base_price_cents`, `currency` (default EUR), `production_days`, `is_customizable`, `customization_note`, `local_pickup`, `status` (draft | pending | published | suspended), `search_vector` (tsvector)
- **product_variants**: `product_id`, `sku`, `material`, `color`, `size`, `finish`, `price_delta_cents`, `stock`
- **product_images**: `product_id`, `storage_path`, `alt`, `sort_order`
- **carts / cart_items**: `user_id`, `variant_id`, `quantity`, `customization_text`
- **orders**: `customer_id`, `store_id`, `status` (pending_payment | paid | in_production | shipped | delivered | cancelled | refunded | disputed), `subtotal_cents`, `shipping_cents`, `platform_fee_cents`, `total_cents`, `currency`, `stripe_payment_intent_id`, `shipping_address` (jsonb), `tracking_code`, `carrier`
- **order_items**: `order_id`, `product_id`, `variant_id`, `title_snapshot`, `unit_price_cents`, `quantity`, `customization_text`
- **reviews**: `order_id` (unique per prodotto), `product_id`, `store_id`, `customer_id`, `rating` (1-5), `comment`, `status`
- **favorites**: `user_id`, `product_id`
- **addresses**: `user_id`, campi indirizzo standard
- **reports**: `reporter_id`, `target_type`, `target_id`, `reason`, `status`
- **stripe_events**: `event_id` (unique), `type`, `processed_at` — per idempotenza webhook
- **audit_logs**: `actor_id`, `action`, `target_type`, `target_id`, `metadata` (jsonb)
- **app_config**: chiave/valore per feature flag e commissione default

Indici: `products(store_id, status)`, GIN su `search_vector`, trigram su `title_*`, `stores(slug)`, `orders(customer_id)`, `orders(store_id)`.

Storage bucket: `product-images` (pubblico in lettura, scrittura solo owner), `store-assets`.

## 7. Flusso pagamenti (Stripe Connect)

**Modello:** destination charges con `application_fee_amount`.

1. **Onboarding venditore:** crea account Express → link di onboarding → al ritorno e via webhook `account.updated` aggiorna `charges_enabled` / `payouts_enabled`.
2. **Regola:** un prodotto è acquistabile solo se lo store ha `charges_enabled = true`.
3. **Carrello multi-venditore:** il carrello può contenere articoli di più shop, ma al checkout viene **diviso in un ordine per shop**, con un PaymentIntent per ordine. Semplice, tracciabile, nessuna logica di split complessa.
4. **Checkout:** server crea `orders` (status `pending_payment`) + PaymentIntent con `transfer_data.destination = stripe_account_id` e `application_fee_amount = round(subtotal * commission_bps / 10000)`.
5. **Webhook** `/api/stripe/webhook`: verifica firma, controlla `stripe_events` per idempotenza, gestisce `payment_intent.succeeded` (→ `paid`, scala stock), `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `account.updated`.
6. Gli importi sono **sempre in centesimi (integer)**. Il prezzo finale si ricalcola server-side, mai fidarsi del client.

## 8. Pagine MVP

**Pubbliche:** home, categoria, ricerca con filtri, scheda prodotto, pagina shop, pagine legali (termini, privacy, cookie — placeholder).
**Cliente:** account, ordini + tracking, preferiti, indirizzi, recensione post-acquisto.
**Venditore:** onboarding guidato (profilo → dati fiscali → Stripe → crea shop → primo prodotto), dashboard essenziale (ordini, fatturato, visite base), CRUD prodotti/varianti/immagini, gestione stati ordine e tracking, stato payout.
**Admin:** lista utenti/venditori (sospendi/attiva), coda prodotti da moderare, ordini, segnalazioni, audit log.

**Filtri ricerca MVP:** categoria, prezzo, materiale, colore, dimensione, personalizzabile, disponibilità immediata, tempi di produzione, rating, ritiro locale.

**Moderazione:** i nuovi prodotti dei venditori senza storico entrano in `pending` e vanno approvati da admin; venditori con N prodotti approvati senza segnalazioni pubblicano direttamente (soglia in `app_config`).

## 9. Requisiti trasversali

- **i18n:** ogni stringa UI in `messages/it.json` e `en.json`; contenuti prodotto con campi `_it` / `_en` (fallback sull'altra lingua se mancante); `hreflang` e sitemap per entrambe.
- **SEO:** metadata dinamici, dati strutturati `Product` e `Organization`, URL puliti, niente pagine categoria vuote indicizzate (`noindex` se 0 prodotti).
- **Sicurezza:** validazione Zod, rate limiting su auth e checkout, upload immagini con controllo tipo/dimensione, nessun segreto nel client.
- **Policy prodotti vietati:** pagina policy + checkbox di accettazione in onboarding; segnalazione prodotto visibile su ogni scheda.
- **Privacy:** minimizzazione dati, cookie banner, export/cancellazione account predisposti.
- **Performance:** immagini ottimizzate (`next/image`), paginazione, server components dove possibile.
- **Accessibilità:** contrasto AA, navigazione da tastiera, label su tutti i form.
- **Mobile-first:** il layout deve funzionare prima su telefono.
- **Predisposizione futura:** colonne `currency` ovunque, nessuna assunzione hardcoded di EUR/IT nella logica.

## 10. Ordine di implementazione

Esegui in quest'ordine, fermandoti alla fine di ogni step con un riepilogo e i comandi per verificare.

1. **Setup:** repo Next.js + TS + Tailwind, ESLint/Prettier, `next-intl`, design tokens (palette), layout base, env template.
2. **Database:** migrazioni, seed categorie, RLS e policy, bucket storage, tipi TypeScript generati.
3. **Auth:** registrazione/login, profili, middleware ruoli, verifica email.
4. **Onboarding venditore:** wizard, creazione vendor/store, integrazione Stripe Connect Express, sync stato via webhook.
5. **Catalogo venditore:** CRUD prodotti, varianti, upload immagini, stato draft/pending/published.
6. **Vetrina pubblica:** home, categorie, pagina shop, scheda prodotto, ricerca + filtri, SEO base.
7. **Carrello e checkout:** carrello persistente, split per shop, PaymentIntent, pagina conferma.
8. **Webhook e ordini:** gestione eventi Stripe idempotente, stati ordine, tracking, email transazionali.
9. **Recensioni, preferiti, segnalazioni.**
10. **Dashboard venditore** (metriche essenziali) **e admin** (moderazione, sospensioni, audit log).
11. **Test e2e** del flusso completo: registrazione venditore → onboarding → prodotto → acquisto → pagamento → spedizione → recensione.
12. **Hardening:** rate limit, controlli sicurezza, performance, checklist legale (GDPR, cookie, DSA notice-and-action, termini).

## 11. Fuori scope (NON costruire)

Stampa su richiesta/RFQ, marketplace file digitali, abbonamenti SaaS e piani a pagamento (per ora commissione unica da `app_config`), 3D Ads, AI, app mobile, logistica proprietaria, motore di quoting, funzioni enterprise, mappa "stampatori vicino a me" (salva solo lat/lng per dopo).

## 12. Regole di lavoro per l'agent

- Se manca un'informazione, scegli l'opzione più semplice e segnalala in un file `DECISIONS.md` invece di bloccarti.
- Mai inventare prezzi, percentuali o testi legali definitivi: usa placeholder marcati `TODO-LEGAL`.
- Ogni migrazione deve essere reversibile e ogni tabella avere RLS.
- Dopo ogni step: elenco file creati/modificati, come testare, cosa resta aperto.
- Mantieni `README.md` con setup locale, variabili d'ambiente (`SUPABASE_*`, `STRIPE_*`, `NEXT_PUBLIC_*`) e comandi.

## 13. Definition of Done dell'MVP

Un venditore si registra, completa l'onboarding Stripe, pubblica un prodotto (approvato da admin); un cliente lo trova con la ricerca in italiano o inglese, lo acquista con carta, il venditore vede l'ordine, lo segna spedito, il payout arriva sull'account Stripe del venditore con la commissione trattenuta, il cliente lascia una recensione. Tutto senza intervento manuale sul database.

---

**Inizia dallo Step 1 e fermati al termine per il riepilogo.**
