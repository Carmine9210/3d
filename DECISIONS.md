# Decisioni prese in autonomia (Prompt 0 §12)

| Tema | Scelta | Motivo |
|---|---|---|
| Checkout | Stripe **Checkout Session** (hosted) per ordine, non Payment Element | Più semplice e robusto con più ordini per carrello; crea comunque un PaymentIntent con destination charge e application fee |
| Carrello multi-shop | Un ordine + un pagamento per shop | Nessuna logica di split complessa; tracciabilità chiara |
| Carrello | Richiede login | Evita carrelli anonimi da unire in seguito |
| Ruolo "seller" | `profiles.role = 'seller'` impostato alla creazione dello shop | Ruoli customer/seller/admin come da blueprint; un utente resta anche cliente |
| Commissione | 10% (`vendors.commission_bps`, default da `app_config`) sul subtotale, spedizione esclusa | Piano Free del blueprint; piani a pagamento in Fase 3 |
| Spedizione | Flat 4,90 € (gratis sopra 60 €, 0 per ritiro locale), da `app_config` | Segnaposto da validare |
| Moderazione | Nuovi venditori: revisione admin finché < 3 prodotti pubblicati | Bilancia controllo e attrito |
| Pubblicazione | Richiede ≥ 1 foto e Stripe attivo | Evita schede vuote o non acquistabili |
| Varianti | Ogni prodotto ha ≥ 1 variante (stock per variante) | Semplifica stock e checkout |
| Ricerca | `ILIKE` + trigram su titoli/descrizioni; `tsvector` già popolato per evoluzioni | Niente motore esterno (Prompt 0 §3) |
| Localizzazione contenuti | Campi `_it` / `_en` con fallback sull'altra lingua | Come da Prompt 0 §9 |
| Rotte | Segmenti in inglese (`/product`, `/shop`, `/cart`) per entrambe le lingue | Semplicità; pathnames localizzati rimandabili |
| Client Supabase | Non tipizzati (`any`) | Evita errori di tipo senza tipi generati; da sostituire con `supabase gen types` |
| Testi legali | Segnaposto `TODO-LEGAL` | Non inventare testi legali definitivi |
| Visite/analytics | Non implementate | Fase 2 |
| Variabili di business | In tabella `app_config`, editabili da `/admin/settings` | Cambiare commissione/spedizione senza deploy |
| Validazione env | Zod lazy (`serverEnv()`) + script `check-env` | La build non si rompe senza env; errori chiari a runtime |
| Email | Resend via `fetch`, mai bloccanti | Un'email fallita non deve far fallire un pagamento |
| Rate limit | In memoria per istanza | Zero dipendenze; limite noto, sostituibile con Upstash |
| Webhook secret | Lista separata da virgola | Account e Connect hanno secret distinti |
| Rimborsi | Parziali e totali, una richiesta aperta per ordine | Copre i casi reali senza workflow complessi |
| Fondi rimborsati | `reverse_transfer` + `refund_application_fee` | Il costo ricade sul venditore e la piattaforma restituisce la sua commissione |
| Magazzino | Rimesso a stock solo se rimborso totale prima della spedizione | Dopo la spedizione l'oggetto non è tornato |
| Chi decide | Venditore (suo ordine) o admin | Il venditore è responsabile dell'ordine; l'admin può sempre intervenire |
| Contestazioni | Solo elenco + link a Stripe | La risposta con prove si fa in Stripe; automazione rimandata |
| Contestazione vinta | Ordine torna allo stato precedente (`pre_dispute_status`) | Evita di perdere l'avanzamento di spedizione |
| Contestazione persa | Ordine `refunded`, `refunded_cents = total` | Il cliente riavrà l'importo dalla banca |
| Dati demo | Script idempotente, bloccato fuori da localhost | Evita di sporcare la produzione |
| Test sicurezza | Script `check-rls` con client reali | La RLS è la difesa principale: va verificata, non data per scontata |
| E2E nel CI | Opzionale (variabile `RUN_E2E`) | Richiede un Supabase di test dedicato |
| Visite | Contatore giornaliero per prodotto, nessun cookie né IP | Statistiche utili senza consenso e senza dati personali |
| Eliminazione account | Cancellazione dati personali, ordini archiviati con accesso disattivato | Diritto alla cancellazione vs obblighi fiscali sugli ordini |
| Account venditore | Chiusura solo via assistenza | Evita di eliminare shop con ordini e pagamenti aperti |
| Indirizzo checkout | Salvato come predefinito a ogni acquisto | Meno attrito; modificabile al checkout successivo |
| Tipi DB | Script `db:types`, client ancora `any` | Serve un progetto Supabase reale per generarli |
| Carrello ospite | Cookie httpOnly + unione al login | Togliere l'account dal percorso di scoperta; il pagamento resta protetto da login |
| Prezzi nel carrello ospite | Mai nel cookie: sempre riletti dal database | Il cookie è manomissibile |
| Stima consegna | Produzione + 2–4 giorni lavorativi (costanti in `lib/delivery.ts`) | Ipotesi da calibrare con i tempi reali dei corrieri |
| Urgenza | Solo "ultimi pezzi" con stock reale | Niente conti alla rovescia o scarsità finta |
| Recensioni in home | Solo reali, minimo 2 con commento ≥ 4★ | Prova sociale onesta; sezione nascosta se non c'è |
| Commissione in home | Letta da `app_config` | Il testo non può diventare incoerente con le impostazioni |
| **Step 7** | | |
| Hosting | **Netlify** (adapter ufficiale `@netlify/plugin-nextjs`) al posto di Vercel | Richiesta del progetto; Server Actions, middleware (Edge) e immagini supportati |
| URL del sito su Netlify | `NEXT_PUBLIC_SITE_URL` facoltativa, fallback `URL` / `DEPLOY_PRIME_URL` al build | I deploy preview hanno redirect Stripe/Auth corretti senza configurazione per branch |
| Upload foto | Dal browser direttamente a Supabase Storage, il server verifica il percorso | Limite ~6 MB per richiesta sulle funzioni Netlify; meno carico sul server |
| Ridimensionamento foto | Nel browser, lato lungo max 2000 px | Meno banda e storage; nessuna dipendenza server (sharp) |
| Rate limit | Tabella `rate_limits` su Supabase, fallback in memoria | Globale tra istanze senza aggiungere Upstash; un guasto del limiter non blocca login/pagamenti |
| Limite login | 10 / 10 min per account+IP, 50 / 10 min per IP | Il vecchio 10 per IP bloccava reti condivise (uffici, 4G) |
| Pulizia periodica | Funzione schedulata Netlify oraria → `cleanup_stale(48)` | Ordini abbandonati annullati; tabelle tecniche contenute |
| Messaggi | Legati all'ordine, scrittura solo via server, lettura con RLS + Realtime | Nessuna chat libera tra sconosciuti; contesto sempre chiaro; niente spam pre-acquisto |
| Notifica messaggi | Email a ogni messaggio | Semplice; se diventa rumoroso → riepilogo periodico |
| Risposta recensioni | Una risposta pubblica per recensione, modificabile/eliminabile | Come i marketplace principali; niente thread |
| Utenti admin | Ruolo e blocco via Supabase Auth (`ban_duration`), mai su sé stessi | Evita di chiudersi fuori; tutto in audit log |
| Funnel | Contatori aggregati per shop/giorno scritti solo dal server | Nessun dato personale né cookie; non gonfiabile dall'esterno |
| Tipi DB | Generati dallo schema, client tipizzati | Il compilatore verifica ogni colonna usata |
| Font | Self-hosted (OFL) | Build offline riproducibile; nessuna richiesta a Google (GDPR) |
| Estensioni Postgres | Schema `extensions` | Raccomandazione Supabase (linter) |
| **Step 8** | | |
| Codici sconto | Per shop, non di piattaforma | Il costo dello sconto ricade su chi lo emette; nessuna ripartizione tra shop |
| Base della commissione | Subtotale scontato | La piattaforma non guadagna sulla parte regalata al cliente |
| Spedizione gratuita con sconto | Soglia sul subtotale scontato | Coerente con quanto il cliente paga davvero |
| Sconto su Stripe | Coupon monouso creato all'atto del pagamento | Stripe Checkout non accetta righe negative; l'importo resta identico all'ordine |
| Utilizzi del codice | Contati a pagamento confermato, nel `mark_order_paid` | Un ordine abbandonato non consuma il codice; idempotente |
| Validità del codice | Verificata alla creazione dell'ordine | Semplice; un codice scaduto tra ordine e pagamento resta valido per quell'ordine |
| Ferie | Prodotti visibili ma non acquistabili | Niente perdita di SEO e preferiti durante l'assenza |
| CSV | `;`, virgola decimale, BOM | Si apre correttamente in Excel con impostazioni italiane |
| Rate limit login | Solo tentativi falliti per account, tutti per IP | Protegge dal brute force senza bloccare chi accede spesso |
| Loading globale | Non usato | Con lo streaming le 404 risponderebbero 200 (soft 404) |
| **Step 9 — pronto per Netlify** | | |
| Versioni | Esatte in `package.json` + lockfile, plugin Netlify Next.js fissato | Build identici oggi e tra un anno; gli aggiornamenti arrivano via Dependabot e passano dalla CI |
| next-intl | 3 → 4.14.9 | Correzione open redirect (GHSA-8f24-v5vv-gm5j) disponibile solo nella 4 |
| PostCSS | override 8.5.29 | Corregge le vulnerabilità del PostCSS incluso in Next 15 senza passare a Next 16 |
| Vitest | 2 → 5 | Vulnerabilità critiche negli strumenti di test |
| Tailwind | resta 3.4 | Restano avvisi solo in strumenti di build (nessun impatto sul sito); la 4 è una migrazione dedicata |
| Controllo pre-build | `scripts/verify-build-env.mjs` blocca il deploy su Netlify | Meglio un deploy fermato con messaggio chiaro che un sito online rotto, o una chiave segreta nel browser |
| Nomi variabili | Accettati anche quelli dell'integrazione Supabase di Netlify e le chiavi publishable/secret | Nessun errore se si usa l'integrazione o le nuove chiavi Supabase |
| Scansione segreti | Escluse solo le variabili pubbliche e i file di esempio | La chiave anon nel browser è attesa; quelle segrete restano controllate |
| Netlify Drop | Non supportato (documentato) | Il sito richiede build e funzioni server |
