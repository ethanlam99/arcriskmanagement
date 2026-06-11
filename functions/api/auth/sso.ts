// LEO Dashboard SSO receiver — Cloudflare Pages Function (server-side; never the browser).
//
// Door 2 of the dual-entry auth: a user already signed into LEO Dashboard clicks the
// ARC card there, Dashboard mints a one-time ticket and 302s here. We verify the ticket
// against Dashboard, find-or-create the Supabase user, mint a single-use magic-link
// token, and hand off to the client callback (/sso/callback) which completes sign-in
// into the same Supabase session the password login uses.
//
// The organic email/password gate (src/auth, src/pages/login) is untouched — additive.
//
// Pages Functions take precedence over the SPA `public/_redirects` fallback, so this
// handles /api/auth/sso while /sso/callback still falls through to the SPA.
//
// Required env (Cloudflare Pages → Settings → Variables, Production — server-side only;
// DIRECTORY_API_TOKEN and the service-role key must NEVER reach the SPA bundle):
//   DASHBOARD_SSO_VERIFY_URL   https://lean-effective-ops.vercel.app/api/auth/sso
//   DIRECTORY_API_TOKEN        dir_… (issued once by the LEO admin)
//   SUPABASE_SERVICE_ROLE_KEY  service-role key for project pnkrjyfusqrrdmlcvxxi
//   SUPABASE_URL               (falls back to VITE_SUPABASE_URL)
import { createClient } from '@supabase/supabase-js';

interface Env {
  DASHBOARD_SSO_VERIFY_URL?: string;
  DIRECTORY_API_TOKEN?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

// Minimal shape of the Cloudflare Pages event context we use (avoids a workers-types dep).
interface PagesContext {
  request: Request;
  env: Env;
}

interface VerifyResult {
  allowed?: boolean;
  email?: string;
  name?: string;
  organization?: string;
  roles?: string[];
}

const TOKEN_RE = /^[0-9a-f]{64}$/;

// Only same-site paths — guards against open redirect. Default = ARC's post-login landing.
function safePath(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/overview';
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = url.origin;
  // [SSO-DEBUG] temporary: surface where the flow ends in-browser. REMOVE after diagnosis.
  const debug = (msg: string): Response =>
    new Response(`SSO-DEBUG (temporary)\n${msg}\n`, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });

  const verifyUrl = env.DASHBOARD_SSO_VERIFY_URL;
  const directoryToken = env.DIRECTORY_API_TOKEN;
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  // [SSO-DEBUG] env-presence probe — curlable without a ticket: ?__debug=env
  if (url.searchParams.get('__debug') === 'env') {
    return debug(
      `env presence (booleans only):\n` +
        `DASHBOARD_SSO_VERIFY_URL=${!!verifyUrl}\n` +
        `DIRECTORY_API_TOKEN=${!!directoryToken}\n` +
        `SUPABASE_URL_or_VITE=${!!supabaseUrl}\n` +
        `SUPABASE_SERVICE_ROLE_KEY=${!!serviceRoleKey}`,
    );
  }

  const token = (url.searchParams.get('t') ?? '').trim();
  const redirect = safePath(url.searchParams.get('redirect'));
  if (!TOKEN_RE.test(token)) return debug(`STAGE: bad-token-format tokenLen=${token.length}`);

  if (!verifyUrl || !directoryToken || !supabaseUrl || !serviceRoleKey) {
    return debug(
      `STAGE: missing-env verify=${!!verifyUrl} dir=${!!directoryToken} url=${!!supabaseUrl} svc=${!!serviceRoleKey}`,
    );
  }

  // ③ Verify the ticket against LEO Dashboard (single-use; never retry the same token).
  let result: VerifyResult;
  try {
    const verifyRes = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${directoryToken}` },
      body: JSON.stringify({ action: 'verify', token }),
    });
    const rawBody = await verifyRes.text();
    try {
      result = JSON.parse(rawBody) as VerifyResult;
    } catch {
      result = {};
    }
    if (!verifyRes.ok || !result.allowed || !result.email) {
      return debug(`STAGE: verify-reject status=${verifyRes.status}\nbody: ${rawBody.slice(0, 300)}`);
    }
  } catch (e) {
    return debug(`STAGE: verify-threw\n${e instanceof Error ? e.message : String(e)}`);
  }

  const email = result.email.toLowerCase().trim();
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // ④a Find-or-create. SSO users carry password_set:true so AuthProvider waves them
  //     straight through (the forced first-login password change is for organic
  //     accounts, which SSO users never have). Ignore "already exists".
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      name: result.name ?? null,
      organization: result.organization ?? null,
      roles: result.roles ?? [],
      password_set: true,
      sso_provisioned: true,
    },
  });
  if (createError && !/already|exists|registered/i.test(createError.message)) {
    return debug(`STAGE: createUser FAILED\nmessage: ${createError.message}`);
  }

  // ④b Mint a single-use magic-link token; the browser completes verifyOtp so the
  //     session lands in localStorage (where AuthProvider reads it) and the
  //     service-role key stays server-side.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    return debug(`STAGE: generateLink FAILED\nerr: ${linkError?.message ?? 'no-hash'} hasHash=${!!tokenHash}`);
  }

  // ⑤ [SSO-DEBUG] confirm the server fully succeeded before the browser step.
  return debug(
    `STAGE: server SUCCESS — verify ok, user ready, magic-link minted.\n` +
      `The browser callback (/sso/callback) is the next step.\n` +
      `email: ${email}\ntokenHash length: ${tokenHash.length}\nredirect: ${redirect}`,
  );
}
