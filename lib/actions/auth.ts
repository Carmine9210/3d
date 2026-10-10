'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { loginSchema, registerSchema } from '@/lib/validators';
import { enforceRateLimit, underLimit } from '@/lib/rate-limit';
import { mergeGuestCartIntoUser } from '@/lib/guest-cart';
import { siteUrl } from '@/lib/site';

function safeNext(value: FormDataEntryValue | null): string {
  const v = typeof value === 'string' ? value : '';
  return v.startsWith('/') && !v.startsWith('//') ? v : '/account';
}

export async function signIn(formData: FormData) {
  const locale = await getLocale();
  const next = safeNext(formData.get('next'));
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) redirect({ href: `/login?error=invalid`, locale });
  // Anti brute-force: max 10 tentativi FALLITI ogni 10 minuti per account (+IP), e un tetto di 50 tentativi per IP.
  const email = parsed.data!.email.toLowerCase();
  const okAccount = await underLimit('login-fail', 10, email);
  const okIp = okAccount && (await enforceRateLimit('login-ip', 50, 10 * 60_000));
  if (!okAccount || !okIp) redirect({ href: '/login?error=rate', locale });

  const supabase = await createClient();
  const { data: signed, error } = await supabase.auth.signInWithPassword(parsed.data!);
  if (error || !signed.user) {
    await enforceRateLimit('login-fail', 10, 10 * 60_000, email); // registra il fallimento
    redirect({ href: `/login?error=invalid&next=${encodeURIComponent(next)}`, locale });
  }
  await mergeGuestCartIntoUser(supabase, signed.user!.id);
  redirect({ href: next, locale });
}

export async function signUp(formData: FormData) {
  const locale = await getLocale();
  if (!(await enforceRateLimit('register', 5, 60 * 60_000))) redirect({ href: '/register?error=rate', locale });
  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName'),
  });
  if (!parsed.success) redirect({ href: '/register?error=weak', locale });
  const next = safeNext(formData.get('next'));

  const supabase = await createClient();
  const site = siteUrl();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data!.email,
    password: parsed.data!.password,
    options: {
      data: { display_name: parsed.data!.displayName, locale },
      emailRedirectTo: `${site}/auth/callback?next=${encodeURIComponent(`/${locale}${next}`)}`,
    },
  });
  if (error) redirect({ href: '/register?error=exists', locale });
  // Con la conferma email attiva non c'è ancora una sessione.
  if (!data.session) redirect({ href: '/register?sent=1', locale });
  await mergeGuestCartIntoUser(supabase, data.user!.id);
  redirect({ href: next, locale });
}

export async function signOut() {
  const locale = await getLocale();
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: '/', locale });
}

/** Invia l'email di recupero. Risponde sempre "inviata" per non rivelare quali email sono registrate. */
export async function requestPasswordReset(formData: FormData) {
  const locale = await getLocale();
  if (!(await enforceRateLimit('reset', 5, 60 * 60_000))) redirect({ href: '/forgot-password?error=rate', locale });
  const email = loginSchema.shape.email.safeParse(formData.get('email'));
  if (!email.success) redirect({ href: '/forgot-password?error=invalid', locale });
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data!, {
    redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(`/${locale}/reset-password`)}`,
  });
  redirect({ href: '/forgot-password?sent=1', locale });
}

/** Imposta la nuova password: richiede la sessione aperta dal link di recupero (o un utente loggato). */
export async function updatePassword(formData: FormData) {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/forgot-password?error=expired', locale });
  const password = registerSchema.shape.password.safeParse(formData.get('password'));
  if (!password.success || formData.get('password') !== formData.get('password_confirm')) {
    redirect({ href: '/reset-password?error=weak', locale });
  }
  const { error } = await supabase.auth.updateUser({ password: password.data! });
  if (error) redirect({ href: '/reset-password?error=generic', locale });
  redirect({ href: '/account?password=1', locale });
}
