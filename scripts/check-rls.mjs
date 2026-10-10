// Uso: npm run check-rls   (dopo npm run seed:demo)
// Prova, con client reali non privilegiati, che la sicurezza a livello di riga regga.
import { createClient } from '@supabase/supabase-js';
import { DEMO, loadEnv } from './lib-env.mjs';

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) { console.error('Mancano NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.'); process.exit(1); }

const mk = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
let failed = 0, passed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${detail}`); }
}
const empty = (r) => !r.error && (r.data ?? []).length === 0;

async function login(email) {
  const c = mk();
  const { data, error } = await c.auth.signInWithPassword({ email, password: DEMO.password });
  if (error) { console.error(`Login ${email} fallito: ${error.message}. Hai eseguito npm run seed:demo?`); process.exit(1); }
  return { c, user: data.user };
}

console.log('\nUtente anonimo');
{
  const a = mk();
  for (const t of ['orders', 'order_items', 'vendors', 'profiles', 'stripe_events', 'audit_logs', 'refund_requests', 'cart_items', 'addresses', 'favorites', 'order_messages', 'rate_limits', 'store_funnel_daily', 'coupons']) {
    check(`non legge ${t}`, empty(await a.from(t).select('*').limit(5)));
  }
  check('non vede prodotti in bozza/pending', empty(await a.from('products').select('id').in('status', ['draft', 'pending', 'suspended'])));
  const pub = await a.from('products').select('id').eq('status', 'published');
  check('vede i prodotti pubblicati', !pub.error && pub.data.length > 0, '(serve il seed demo)');
  const cats = await a.from('categories').select('id');
  check('legge le categorie', !cats.error && cats.data.length > 0);
  check('non può inserire prodotti', !!(await a.from('products').insert({ store_id: crypto.randomUUID(), slug: 'x', title_it: 'x', base_price_cents: 100 })).error);
  check('non può chiamare mark_order_paid', !!(await a.rpc('mark_order_paid', { p_order_id: crypto.randomUUID(), p_payment_intent: 'pi_x' })).error);
  check('non legge le statistiche visite', empty(await a.from('product_view_daily').select('*').limit(5)));
  const prod = await a.from('products').select('id').eq('slug', 'demo-vaso-spirale').maybeSingle();
  check('può registrare una visita (anonima, aggregata)', !(await a.rpc('track_product_view', { p_product_id: prod.data?.id ?? crypto.randomUUID() })).error);
  check('non può scrivere direttamente le visite', !!(await a.from('product_view_daily').insert({ product_id: prod.data?.id ?? crypto.randomUUID(), views: 999999 })).error);
  check('non può chiamare restock_order', !!(await a.rpc('restock_order', { p_order_id: crypto.randomUUID() })).error);
  check('non può chiamare rate_limit_hit', !!(await a.rpc('rate_limit_hit', { p_key: 'x', p_limit: 1, p_window_seconds: 1 })).error);
  check('non può gonfiare il funnel', !!(await a.rpc('track_funnel', { p_store_id: crypto.randomUUID(), p_event: 'cart_add', p_n: 1000 })).error);
  check('non può chiamare rate_limit_peek', !!(await a.rpc('rate_limit_peek', { p_key: 'x', p_limit: 1 })).error);
  check('non può chiamare cleanup_stale', !!(await a.rpc('cleanup_stale', { p_hours: 0 })).error);
}

console.log('\nCliente');
{
  const { c, user } = await login(DEMO.customer);
  const own = await c.from('profiles').select('user_id');
  check('vede solo il proprio profilo', !own.error && own.data.length === 1 && own.data[0].user_id === user.id);
  const ord = await c.from('orders').select('customer_id');
  check('vede solo i propri ordini', !ord.error && ord.data.every((o) => o.customer_id === user.id));
  const up = await c.from('profiles').update({ role: 'admin' }).eq('user_id', user.id);
  check('non può promuoversi admin', !!up.error, JSON.stringify(up.data));
  check('non può creare ordini', !!(await c.from('orders').insert({ customer_id: user.id, store_id: crypto.randomUUID(), subtotal_cents: 1, total_cents: 1 })).error);
  check('non può scrivere recensioni direttamente', !!(await c.from('reviews').insert({ order_id: crypto.randomUUID(), product_id: crypto.randomUUID(), store_id: crypto.randomUUID(), customer_id: user.id, rating: 5 })).error);
  check('non può leggere i vendor', empty(await c.from('vendors').select('id')));
  check('non può leggere audit_logs', empty(await c.from('audit_logs').select('id')));
  check('non può cambiare app_config', empty(await c.from('app_config').update({ value: 0 }).eq('key', 'default_commission_bps').select()));
  check('non può scrivere messaggi direttamente (solo via server)', !!(await c.from('order_messages').insert({ order_id: crypto.randomUUID(), sender_id: user.id, sender_role: 'seller', body: 'x' })).error);
  check('non legge rate_limits', empty(await c.from('rate_limits').select('*')));
  check('non vede i codici sconto degli shop', empty(await c.from('coupons').select('*')));
  check('non può creare codici sconto', !!(await c.from('coupons').insert({ store_id: crypto.randomUUID(), code: 'HACK90', kind: 'percent', value: 90 })).error);
  const shop = await c.from('stores').select('id').eq('slug', 'demo-maker-lab').maybeSingle();
  check('non può caricare file nella cartella di uno shop altrui', !!(await c.storage.from('product-images').upload(`${shop.data?.id ?? crypto.randomUUID()}/x/intruso.png`, new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), { contentType: 'image/png' })).error);
}

console.log('\nVenditore');
{
  const { c } = await login(DEMO.seller);
  const draft = await c.from('products').select('id, status').eq('slug', 'demo-bozza').maybeSingle();
  check('vede la propria bozza', !draft.error && !!draft.data, '(serve il seed demo)');
  const pubTry = await c.from('products').update({ status: 'published' }).eq('id', draft.data?.id ?? crypto.randomUUID());
  check('non può auto-pubblicare saltando la moderazione', !!pubTry.error, JSON.stringify(pubTry.data));

  const prod = await c.from('products').select('id').eq('slug', 'demo-vaso-spirale').maybeSingle();
  await c.from('products').update({ avg_rating: 5, review_count: 999 }).eq('id', prod.data?.id ?? crypto.randomUUID());
  const after = await c.from('products').select('avg_rating, review_count').eq('slug', 'demo-vaso-spirale').maybeSingle();
  check('non può falsare il rating', Number(after.data?.avg_rating) === 0 && after.data?.review_count === 0, JSON.stringify(after.data));

  const store = await c.from('stores').select('id, status').eq('slug', 'demo-maker-lab').maybeSingle();
  await c.from('stores').update({ status: 'suspended' }).eq('id', store.data?.id ?? crypto.randomUUID());
  const store2 = await c.from('stores').select('status').eq('slug', 'demo-maker-lab').maybeSingle();
  check('non può cambiare lo stato del proprio shop', store2.data?.status === 'active');

  await c.from('vendors').update({ commission_bps: 0, charges_enabled: false }).neq('id', crypto.randomUUID());
  const v = await c.from('vendors').select('commission_bps, charges_enabled').maybeSingle();
  check('non può cambiare commissione o stato Stripe', v.data?.commission_bps === 1000 && v.data?.charges_enabled === true, JSON.stringify(v.data));
  check('non può leggere ordini altrui', (await c.from('orders').select('store_id')).data?.every((o) => o.store_id === store.data?.id) ?? true);
  const rev = await c.from('reviews').update({ seller_reply: 'ok', rating: 5 }).neq('id', crypto.randomUUID()).select();
  check('non può modificare le recensioni (risposta solo via server)', !rev.error && (rev.data ?? []).length === 0, JSON.stringify(rev.data));
  check('legge il funnel del proprio shop', !(await c.from('store_funnel_daily').select('*')).error);
  const code = `RLS${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const ins = await c.from('coupons').insert({ store_id: store.data?.id, code, kind: 'percent', value: 10, uses: 999 }).select('id, uses').single();
  check('crea codici sconto per il proprio shop (utilizzi azzerati dal sistema)', !ins.error && ins.data?.uses === 0, JSON.stringify(ins.error ?? ins.data));
  if (ins.data) {
    await c.from('coupons').update({ uses: 500 }).eq('id', ins.data.id);
    const after2 = await c.from('coupons').select('uses').eq('id', ins.data.id).single();
    check('non può falsare gli utilizzi di un codice', after2.data?.uses === 0, JSON.stringify(after2.data));
    await c.from('coupons').delete().eq('id', ins.data.id);
  }
  check('non può creare codici per altri shop', !!(await c.from('coupons').insert({ store_id: crypto.randomUUID(), code: 'ALTRO10', kind: 'percent', value: 10 })).error);
  check('può caricare foto nella cartella del proprio shop', !(await c.storage.from('product-images').upload(`${store.data?.id}/${prod.data?.id}/${crypto.randomUUID()}.png`, new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), { contentType: 'image/png' })).error);
}

console.log(`\n${passed} superati, ${failed} falliti.`);
process.exit(failed ? 1 : 0);
