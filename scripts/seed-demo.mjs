// Uso: npm run seed:demo     (idempotente; usa il service role)
// Crea 3 utenti demo (admin, venditore, cliente), uno shop attivo e 6 prodotti pubblicati + 1 bozza.
import { createClient } from '@supabase/supabase-js';
import { DEMO, loadEnv } from './lib-env.mjs';

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
if (env.NEXT_PUBLIC_SITE_URL && !env.NEXT_PUBLIC_SITE_URL.includes('localhost') && !process.argv.includes('--force')) {
  console.error('NEXT_PUBLIC_SITE_URL non è localhost: rifiuto di creare dati demo. Usa --force se sei sicuro.');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function ensureUser(email, name) {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = data?.users?.find((u) => u.email === email);
  if (found) return found.id;
  const { data: created, error } = await db.auth.admin.createUser({
    email, password: DEMO.password, email_confirm: true, user_metadata: { display_name: name, locale: 'it' },
  });
  if (error) throw error;
  return created.user.id;
}

const adminId = await ensureUser(DEMO.admin, 'Admin Demo');
const sellerId = await ensureUser(DEMO.seller, 'Maker Demo');
await ensureUser(DEMO.customer, 'Cliente Demo');
await db.from('profiles').update({ role: 'admin' }).eq('user_id', adminId);
await db.from('profiles').update({ role: 'seller' }).eq('user_id', sellerId);

let { data: vendor } = await db.from('vendors').select('id').eq('user_id', sellerId).maybeSingle();
if (!vendor) {
  ({ data: vendor } = await db.from('vendors').insert({
    user_id: sellerId, type: 'professional', status: 'active', charges_enabled: true, payouts_enabled: true,
    tax_data: { tax_id: 'DEMO0000000' }, accepted_terms_at: new Date().toISOString(),
  }).select('id').single());
}
let { data: store } = await db.from('stores').select('id').eq('vendor_id', vendor.id).maybeSingle();
if (!store) {
  ({ data: store } = await db.from('stores').insert({
    vendor_id: vendor.id, slug: 'demo-maker-lab', name: 'Demo Maker Lab', city: 'Bari', region: 'Puglia',
    description_it: 'Laboratorio di stampa 3D di prova. Pezzi unici in PLA e PETG.',
    description_en: 'Demo 3D printing lab. One-off pieces in PLA and PETG.', avg_production_days: 3,
    return_policy: 'Reso entro 14 giorni.',
  }).select('id').single());
}

const { data: cats } = await db.from('categories').select('id, slug');
const cat = (slug) => cats.find((c) => c.slug === slug)?.id;

const products = [
  { slug: 'demo-vaso-spirale', it: 'Vaso Spirale', en: 'Spiral Vase', price: 1890, cat: 'casa-decorazione', days: 2, custom: false, status: 'published',
    variants: [{ material: 'PLA', color: 'Bianco', size: 'M', stock: 10 }, { material: 'PLA', color: 'Arancio', size: 'M', stock: 5 }] },
  { slug: 'demo-supporto-cuffie', it: 'Supporto per Cuffie', en: 'Headphone Stand', price: 1450, cat: 'ufficio-organizzazione', days: 3, custom: false, status: 'published',
    variants: [{ material: 'PETG', color: 'Nero', size: 'L', stock: 8 }] },
  { slug: 'demo-targa-nome', it: 'Targa con Nome', en: 'Name Plate', price: 1200, cat: 'articoli-personalizzati', days: 4, custom: true, status: 'published',
    variants: [{ material: 'PLA', color: 'Blu', size: 'S', stock: 20 }] },
  { slug: 'demo-miniatura-drago', it: 'Miniatura Drago', en: 'Dragon Miniature', price: 2400, cat: 'miniature-modellismo', days: 5, custom: false, status: 'published',
    variants: [{ material: 'Resina', color: 'Grigio', size: 'S', stock: 3 }] },
  { slug: 'demo-clip-ricambio', it: 'Clip di Ricambio Elettrodomestico', en: 'Appliance Spare Clip', price: 690, cat: 'ricambi-componenti', days: 1, custom: false, status: 'published',
    variants: [{ material: 'PETG', color: 'Nero', size: 'S', stock: 50 }] },
  { slug: 'demo-portachiavi', it: 'Portachiavi Geometrico', en: 'Geometric Keyring', price: 590, cat: 'gadget-regali', days: 2, custom: true, status: 'published',
    variants: [{ material: 'PLA', color: 'Arancio', size: 'S', stock: 0 }, { material: 'PLA', color: 'Blu', size: 'S', stock: 15 }] },
  { slug: 'demo-bozza', it: 'Prodotto in bozza', en: 'Draft product', price: 999, cat: 'design-arte', days: 3, custom: false, status: 'draft',
    variants: [{ material: 'PLA', color: 'Bianco', size: 'M', stock: 1 }] },
];

for (const p of products) {
  const { data: exists } = await db.from('products').select('id').eq('slug', p.slug).maybeSingle();
  if (exists) {
    // Riesecuzione: ripristino lo stock demo (gli acquisti di prova lo scalano) per test ripetibili.
    for (const v of p.variants) {
      await db.from('product_variants').update({ stock: v.stock }).eq('product_id', exists.id).eq('material', v.material).eq('color', v.color);
    }
    continue;
  }
  const { data: prod, error } = await db.from('products').insert({
    store_id: store.id, category_id: cat(p.cat), slug: p.slug, title_it: p.it, title_en: p.en,
    description_it: `${p.it}: prodotto demo stampato in 3D.`, description_en: `${p.en}: demo 3D-printed product.`,
    base_price_cents: p.price, production_days: p.days, is_customizable: p.custom, local_pickup: p.slug === 'demo-vaso-spirale',
    customization_note: p.custom ? 'Scrivi il testo da stampare.' : null, status: p.status,
  }).select('id').single();
  if (error) throw error;
  await db.from('product_variants').insert(p.variants.map((v) => ({ ...v, product_id: prod.id })));
}

// Carrello del cliente demo vuoto a ogni esecuzione.
const { data: demoCustomer } = await db.from('profiles').select('user_id').eq('display_name', 'Cliente Demo').maybeSingle();
if (demoCustomer) await db.from('cart_items').delete().eq('user_id', demoCustomer.user_id);

// Ambiente di test: azzera i contatori di rate limit, così i test E2E ripetuti non vengono bloccati.
await db.from('rate_limits').delete().neq('key', '');
console.log('Dati demo pronti.\n');
console.log(`  admin     ${DEMO.admin}`);
console.log(`  venditore ${DEMO.seller}`);
console.log(`  cliente   ${DEMO.customer}`);
console.log(`  password  ${DEMO.password}`);
console.log('\nNota: lo shop demo ha charges_enabled=true senza un vero conto Stripe. Gli ordini si creano, il pagamento reale no.');
