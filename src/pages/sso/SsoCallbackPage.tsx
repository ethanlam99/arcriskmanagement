// Client landing for the LEO Dashboard SSO hand-off (served at /sso/callback).
//
// The Pages Function (functions/api/auth/sso.ts) has already verified the ticket and
// minted a single-use magic-link token_hash, passed here in the URL fragment. We
// complete verifyOtp — which writes the session into the same localStorage slot the
// password login uses — then replace the URL with the landing path (dropping the token
// from history). A full navigation lets AuthProvider re-read the session from scratch,
// avoiding any race with the AppShell auth guard. On failure we fall back to /login.
//
// Self-contained on purpose (no AuthProvider dependency).

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

function parseFragment(): { tokenHash: string; redirect: string } {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const redirect = params.get('redirect');
  const safe = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/overview';
  return { tokenHash: params.get('token_hash') ?? '', redirect: safe };
}

export function SsoCallbackPage() {
  // Parsed once at mount; a missing token is a failure we can show synchronously.
  const [{ tokenHash, redirect }] = useState(parseFragment);
  const [failed, setFailed] = useState(!tokenHash);

  useEffect(() => {
    if (!tokenHash) return;

    let cancelled = false;
    void (async () => {
      const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
      if (cancelled) return;
      if (error) {
        setFailed(true);
        return;
      }
      window.location.replace(redirect);
    })();

    return () => {
      cancelled = true;
    };
  }, [tokenHash, redirect]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-arc-50 px-4 text-center dark:bg-arc-dark-50">
      {failed ? (
        <>
          <p className="text-sm text-arc-700 dark:text-arc-dark-700">We couldn’t complete sign-in.</p>
          <a
            href="/login"
            className="rounded-lg bg-forest-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-forest-600"
          >
            Go to login
          </a>
        </>
      ) : (
        <>
          <span
            aria-hidden
            className="h-6 w-6 animate-spin rounded-full border-2 border-arc-200 border-t-forest-500 dark:border-arc-dark-200"
          />
          <p className="text-sm text-arc-500 dark:text-arc-dark-500">Signing you in…</p>
        </>
      )}
    </div>
  );
}
