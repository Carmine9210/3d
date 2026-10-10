import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

import { escapeHtml } from '@/lib/email';

describe('email', () => {
  it('esegue l’escape dell’HTML nei contenuti utente', () => {
    expect(escapeHtml('<script>alert("x")</script> & co')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co');
  });
});
