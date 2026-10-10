'use client';

/** Ultima rete di sicurezza (errore nel layout): niente traduzioni disponibili, testo bilingue. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="it">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#F3F5F8', color: '#0B1F3A', margin: 0 }}>
        <main style={{ maxWidth: 480, margin: '15vh auto', padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 28 }}>Qualcosa è andato storto · Something went wrong</h1>
          <p>Riprova tra poco. · Please try again shortly.</p>
          <button type="button" onClick={reset} style={{ background: '#F28C28', border: 0, borderRadius: 6, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>
            Riprova · Retry
          </button>
          {error.digest && <p style={{ fontSize: 12, opacity: 0.7, marginTop: 16 }}>{error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
