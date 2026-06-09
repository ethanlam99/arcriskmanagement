import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Logo } from '@/components/shared/Logo';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { HeroFlow } from './HeroFlow';

// Value-prop pillars. Each is a scroll section; the single HeroFlow scene's
// camera focuses the matching pipeline stage as the section comes into view.
const PILLARS: { id: string; titleKey: string; bodyKey: string }[] = [
  { id: 'author', titleKey: 'landing.p1_title', bodyKey: 'landing.p1_body' },
  { id: 'proof', titleKey: 'landing.p2_title', bodyKey: 'landing.p2_body' },
  { id: 'speed', titleKey: 'landing.p3_title', bodyKey: 'landing.p3_body' },
];

export function LoginPage() {
  const { t } = useTranslation();
  const { isAuthenticated, needsPasswordChange, signInWithPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Copy fade-in tracking. The visual itself is driven continuously by scroll
  // inside HeroFlow, so we only need to know which sections have been revealed.
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset.index);
          setSeen((prev) => (prev.has(idx) ? prev : new Set(prev).add(idx)));
        }
      },
      { threshold: 0.5 }
    );
    sectionRefs.current.forEach((node) => node && obs.observe(node));
    return () => obs.disconnect();
  }, []);

  // Scroll-snap so each section settles on its camera keyframe — the arc and the
  // copy land cleanly instead of resting mid-zoom between stages. Set on <html>
  // (the document scroller HeroFlow reads) and restored on unmount so it stays
  // scoped to this page. `proximity` snaps on rest near a section without trapping
  // mid-scroll; switch to 'y mandatory' here for a harder, always-on snap.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.scrollSnapType;
    html.style.scrollSnapType = 'y proximity';
    return () => {
      html.style.scrollSnapType = prev;
    };
  }, []);

  // Arrow keys step through the sections one keyframe at a time — a deterministic
  // "mandatory" snap on top of the free-scroll proximity feel. Down/Right go
  // forward, Up/Left go back. We track the active index ourselves so rapid presses
  // chain forward instead of fighting the in-flight smooth scroll, and re-sync to
  // the nearest section after any manual scroll.
  useEffect(() => {
    const getList = () => sectionRefs.current.filter(Boolean) as HTMLElement[];
    const nearest = (list: HTMLElement[]) => {
      let best = 0;
      let bestDist = Infinity;
      list.forEach((el, i) => {
        const d = Math.abs(el.getBoundingClientRect().top);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      return best;
    };

    let navIdx = 0;
    let animating = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const onScroll = () => {
      if (animating) return; // ignore our own programmatic scroll
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        navIdx = nearest(getList());
      }, 80);
    };

    const onKey = (e: KeyboardEvent) => {
      // Don't hijack arrows while typing in the login fields.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const dir =
        e.key === 'ArrowDown' || e.key === 'ArrowRight'
          ? 1
          : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
            ? -1
            : 0;
      if (!dir) return;
      const list = getList();
      if (!list.length) return;
      e.preventDefault();
      const base = animating ? navIdx : nearest(list);
      const next = Math.min(list.length - 1, Math.max(0, base + dir));
      if (next === base) return;
      navIdx = next;
      animating = true;
      list[next].scrollIntoView({ behavior: 'smooth', block: 'start' });
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        animating = false;
      }, 600);
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
      clearTimeout(settleTimer);
    };
  }, []);

  // Already signed in — let the gate decide where to go.
  if (isAuthenticated) {
    return <Navigate to={needsPasswordChange ? '/change-password' : '/overview'} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    const err = await signInWithPassword(email.trim(), password);
    setSubmitting(false);
    if (err) setError(t('login.error_generic'));
  }

  const fade = (idx: number) =>
    `max-w-md transition-all duration-700 ease-out ${
      seen.has(idx) ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
    }`;

  return (
    <div className="relative bg-arc-900 text-white">
      {/* ── Fixed visual: one persistent arc scene, navigated by scroll ── */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-forest-700/40 via-arc-900 to-black" />
        <HeroFlow />
        <div className="absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-arc-900/85 via-arc-900/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-l from-arc-900/85 via-transparent to-transparent" />
      </div>

      {/* Language toggle — top-right */}
      <div className="fixed top-6 right-6 z-40">
        <LanguageToggle variant="dark" />
      </div>

      {/* Fixed brand lockup — enlarged */}
      <div className="fixed top-7 left-8 z-30 flex items-center gap-3">
        <Logo size="lg" variant="light" />
        <div className="leading-tight">
          <span className="block text-2xl font-bold tracking-wide">{t('login.title')}</span>
          <span className="block text-xs text-arc-200">{t('login.tagline')}</span>
        </div>
      </div>

      {/* ── Content: scrolling narrative (left) + sticky login rail (right) ── */}
      <div className="relative z-10 flex flex-col md:flex-row">
        <main className="order-last flex-1 md:order-first">
          {/* Hero */}
          <section
            data-index={0}
            ref={(node) => {
              sectionRefs.current[0] = node;
            }}
            className="flex min-h-screen snap-start flex-col justify-center px-8 md:px-12 lg:px-20"
          >
            <div className={`${fade(0)} max-w-xl`}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-forest-dark-700">
                {t('login.hero_eyebrow')}
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight text-white md:text-5xl lg:text-6xl">
                {t('login.hero_headline')}
              </h1>
              <p className="mt-5 max-w-md text-base text-arc-200 md:text-lg">{t('login.hero_subline')}</p>
              <p className="mt-12 animate-pulse text-xs uppercase tracking-[0.2em] text-arc-200/60">
                {t('landing.scroll_hint')} ↓
              </p>
            </div>
          </section>

          {/* Pillars */}
          {PILLARS.map((p, i) => (
            <section
              key={p.id}
              data-index={i + 1}
              ref={(node) => {
                sectionRefs.current[i + 1] = node;
              }}
              className="flex min-h-screen snap-start flex-col justify-center px-8 md:px-12 lg:px-20"
            >
              <div className={fade(i + 1)}>
                <h2 className="text-3xl font-semibold leading-tight text-white lg:text-4xl">
                  {t(p.titleKey)}
                </h2>
                <p className="mt-4 text-base text-arc-200">{t(p.bodyKey)}</p>
              </div>
            </section>
          ))}

          {/* Final CTA — the climax, landing over the destination node of the arc */}
          <section
            data-index={PILLARS.length + 1}
            ref={(node) => {
              sectionRefs.current[PILLARS.length + 1] = node;
            }}
            className="flex min-h-screen snap-start flex-col justify-center px-8 md:px-12 lg:px-20"
          >
            <div className={`${fade(PILLARS.length + 1)} max-w-xl`}>
              <h2 className="text-3xl font-semibold leading-tight text-white md:text-4xl lg:text-5xl">
                {t('landing.cta_headline')}
              </h2>
              <p className="mt-6 text-xl font-medium text-forest-dark-700 md:text-2xl">
                {t('landing.cta_cue')}
              </p>
            </div>
          </section>
        </main>

        {/* Sticky login rail (stacks on top on mobile) — login + builder credit */}
        <aside className="order-first flex w-full flex-col border-white/10 bg-arc-900/50 px-10 py-16 backdrop-blur-xl md:sticky md:top-0 md:order-last md:h-screen md:max-w-md md:border-l md:py-10">
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
            <h2 className="text-2xl font-semibold text-white">{t('login.heading')}</h2>
            <p className="mt-1 text-sm text-arc-200">{t('login.subtitle')}</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-arc-200">
                  {t('login.email_label')}
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('login.email_placeholder')}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-forest-dark-600"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-arc-200">
                  {t('login.password_label')}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.password_placeholder')}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-forest-dark-600"
                />
              </div>

              {error && (
                <p className="text-sm text-rose-400" role="alert">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-forest-dark-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-forest-dark-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? t('login.signing_in') : t('login.sign_in')}
              </button>
            </form>

            <p className="mt-8 text-center text-xs text-arc-200/70">{t('login.footer_note')}</p>
          </div>

          {/* Builder credit + account-setup contact — always visible in the rail */}
          <div className="mx-auto mt-10 w-full max-w-sm border-t border-white/10 pt-6 text-center">
            <p className="text-xs text-arc-200">
              Designed &amp; built by <span className="font-semibold text-white">Ethan Lam</span>
            </p>
            <p className="mt-1.5 text-xs text-arc-200">
              Contact{' '}
              <a
                href="mailto:ethanlam15@gmail.com"
                className="font-medium text-white underline decoration-arc-200/40 underline-offset-4 transition-colors hover:decoration-white"
              >
                ethanlam15@gmail.com
              </a>{' '}
              to configure your account.
            </p>
            <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-arc-200/50">
              © 2026 ARC™. All rights reserved.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
