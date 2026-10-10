# Mettere online 3D Market su Netlify — guida rapida

> ⚠️ **Non trascinare lo zip su Netlify ("Netlify Drop").** Quel metodo pubblica solo file statici:
> questo sito ha pagine dinamiche, login, pagamenti e funzioni server, quindi **deve essere compilato da Netlify**.
> Usa uno dei due metodi qui sotto.

## Prima di tutto (una volta sola)
1. **Supabase**: crea il progetto e applica il database → [docs/DEPLOY.md §1](docs/DEPLOY.md).
2. Tieni a portata di mano: Project URL, chiave **anon/publishable**, chiave **service_role/secret**, chiavi **Stripe**.

## Metodo A — GitHub (consigliato: ogni modifica si pubblica da sola)
1. Estrai lo zip. Crea un repository **privato** su GitHub e carica **il contenuto della cartella `3d-market`**
   (deve esserci `package.json` alla radice del repository).
   - Da browser: GitHub → *New repository* → *uploading an existing file* → trascina i file e le cartelle.
   - Da terminale: `cd 3d-market && git init && git add . && git commit -m "3D Market" && git branch -M main && git remote add origin <url> && git push -u origin main`
2. Netlify → **Add new site → Import an existing project → GitHub** → scegli il repository.
   Le impostazioni di build si leggono da `netlify.toml`: **non cambiare nulla**.
3. Prima di premere *Deploy*, apri **Environment variables** e aggiungi le variabili (tabella sotto).
4. **Deploy**. Dopo 2–3 minuti il sito è su `https://<nome>.netlify.app/it`.

## Metodo B — Netlify CLI (senza GitHub)
Serve Node.js 22 sul tuo computer.
```bash
cd 3d-market
npm ci
npx netlify-cli login
npx netlify-cli init            # crea/collega il sito (scegli "Create & configure a new project")
npx netlify-cli env:import .env.production   # oppure aggiungi le variabili dal pannello Netlify
npm run deploy                  # compila e pubblica in produzione
```

## Variabili d'ambiente (Netlify → Site configuration → Environment variables)
| Nome | Valore | "Contains secret values" |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | **No** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chiave *anon* o *publishable* (`sb_publishable_…`) | **No** |
| `SUPABASE_SERVICE_ROLE_KEY` | chiave *service_role* o *secret* (`sb_secret_…`) | **Sì** |
| `STRIPE_SECRET_KEY` | `sk_test_…` (poi `sk_live_…`) | **Sì** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…,whsec_…` (i due endpoint) | **Sì** |
| `RESEND_API_KEY` | facoltativa, per le email | **Sì** |
| `EMAIL_FROM`, `SUPPORT_EMAIL` | facoltative | No |
| `NEXT_PUBLIC_SITE_URL` | facoltativa: lasciala vuota finché non hai un dominio tuo | No |

Il build **si ferma da solo con un messaggio in italiano** se manca una variabile essenziale o se hai messo la chiave segreta al posto di quella pubblica: leggi il log, correggi e premi *Retry deploy*.

## Dopo il primo deploy (5 minuti)
1. **Supabase → Authentication → URL Configuration**: Site URL = `https://<nome>.netlify.app`; Redirect URLs = `https://<nome>.netlify.app/**` e `https://**--<nome>.netlify.app/**`.
2. **Stripe → Webhooks**: due endpoint verso `https://<nome>.netlify.app/api/stripe/webhook` (eventi in [docs/DEPLOY.md §3](docs/DEPLOY.md)); copia i due secret in `STRIPE_WEBHOOK_SECRET` e rifai il deploy.
3. Apri `https://<nome>.netlify.app/api/health` → deve rispondere `{"ok":true,"db":"ok"}`.
4. Registrati sul sito e rendi admin il tuo utente (SQL in [docs/DEPLOY.md §1.6](docs/DEPLOY.md)).

## Se qualcosa va storto
| Messaggio / sintomo | Causa | Soluzione |
|---|---|---|
| `Deploy fermato: …` con ✗ nel log | variabile mancante o sbagliata | correggi la variabile indicata → *Retry deploy* |
| `Secrets scanning found secrets in build` | una variabile pubblica è stata segnata come segreta, o la smart detection segnala la chiave anon | togli "Contains secret values" dalle `NEXT_PUBLIC_*`; se persiste aggiungi la variabile `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` con il valore della chiave **anon** (mai quella segreta) |
| `/api/health` risponde 503 | Supabase non raggiungibile o progetto in pausa | Supabase → riattiva il progetto; controlla URL e chiave anon |
| Login: "link non valido" dopo la conferma email | Redirect URL mancanti in Supabase | punto 1 della sezione precedente |
| Ordini fermi su "In attesa di pagamento" | webhook Stripe non configurato o secret errato | Stripe → Webhooks → guarda le risposte; deve essere `200` |
| Foto che non si caricano | bucket Storage mancanti | riapplica le migrazioni (`npm run db:push`) |
| Build fallisce su `npm ci` | `package-lock.json` non caricato | carica anche `package-lock.json` (è nello zip) |

## Per non avere problemi in futuro
- **Versioni bloccate**: `package.json` usa versioni esatte e `package-lock.json` le fissa tutte. Netlify userà sempre le stesse.
- **Aggiornamenti di sicurezza**: con GitHub, Dependabot apre ogni settimana una Pull Request con gli aggiornamenti minori; la CI li verifica prima che tu li unisca. Gli aggiornamenti "major" (es. Next.js 16) vanno fatti a mano, con calma.
- **Node.js 22** è fissato in `netlify.toml` e `.nvmrc` (supportato fino ad aprile 2027).
- **Supabase gratuito** mette in pausa i progetti inattivi: la funzione `cleanup` gira ogni ora e tiene attivo il database.
- **Nuove migrazioni**: aggiungi file in `supabase/migrations/` con numero crescente e applicale con `npm run db:push` **prima** del deploy del codice che le usa.
