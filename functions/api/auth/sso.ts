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
  // On any failure send the user to the normal login screen; never leak why.
  const toLogin = (): Response => Response.redirect(new URL('/login', origin).toString(), 302);

  const token = (url.searchParams.get('t') ?? '').trim();
  const redirect = safePath(url.searchParams.get('redirect'));
  if (!TOKEN_RE.test(token)) return toLogin();

  const verifyUrl = env.DASHBOARD_SSO_VERIFY_URL;
  const directoryToken = env.DIRECTORY_API_TOKEN;
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!verifyUrl || !directoryToken || !supabaseUrl || !serviceRoleKey) return toLogin();

  // ③ Verify the ticket against LEO Dashboard (single-use; never retry the same token).
  let result: VerifyResult;
  try {
    const verifyRes = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${directoryToken}` },
      body: JSON.stringify({ action: 'verify', token }),
    });
    result = (await verifyRes.json()) as VerifyResult;
    if (!verifyRes.ok || !result.allowed || !result.email) return toLogin();
  } catch {
    return toLogin();
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
  if (createError && !/already|exists|registered/i.test(createError.message)) return toLogin();

  // ④b Mint a single-use magic-link token; the browser completes verifyOtp so the
  //     session lands in localStorage (where AuthProvider reads it) and the
  //     service-role key stays server-side.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return toLogin();

  // ⑤ Hand off to the client callback. token_hash rides the URL fragment (single-use,
  //    short-lived) and the callback strips it via location.replace once consumed.
  const callback = new URL('/sso/callback', origin);
  callback.hash = `token_hash=${encodeURIComponent(tokenHash)}&redirect=${encodeURIComponent(redirect)}`;
  return Response.redirect(callback.toString(), 302);
}
