import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mergeGuestCartIntoUser } from '@/lib/guest-cart';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next') ?? '/it/account';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/it/account';
  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    if (data.user) await mergeGuestCartIntoUser(supabase, data.user.id);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
