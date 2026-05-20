import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Logo } from '@/components/shared/Logo';
import type { User, UserRole } from '@/types';

const ROLE_COLORS: Record<UserRole, string> = {
  risk_analyst:  'bg-arc-100 dark:bg-arc-dark-100 text-arc-700 dark:text-arc-dark-700 border border-arc-200 dark:border-arc-dark-200',
  tester:        'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50',
  admin:         'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50',
  risk_lead:     'bg-arc-100 dark:bg-arc-dark-100 text-arc-900 dark:text-arc-dark-700 border border-arc-300 dark:border-arc-dark-300',
  testing_lead:  'bg-forest-50 dark:bg-forest-dark-700/20 text-forest-700 dark:text-forest-dark-700 border border-forest-100 dark:border-forest-dark-700',
  it_team:       'bg-slate-100 text-slate-700 border border-slate-300',
};

const ROLE_ORDER: UserRole[] = ['risk_analyst', 'risk_lead', 'tester', 'testing_lead', 'it_team', 'admin'];

export function LoginPage() {
  const { t } = useTranslation();
  const repo = useRepository();
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['arc', 'users'],
    queryFn: () => repo.users.list(),
  });

  function handleSignIn(user: User) {
    signIn(user);
    navigate('/overview');
  }

  const grouped = ROLE_ORDER.reduce<Record<UserRole, User[]>>((acc, role) => {
    acc[role] = users.filter((u) => u.role === role);
    return acc;
  }, {} as Record<UserRole, User[]>);

  return (
    <div className="min-h-screen bg-arc-100 dark:bg-arc-dark-900 flex flex-col items-center justify-center p-8">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-arc-900 dark:bg-arc-dark-900 rounded-xl mb-4">
          <Logo size="sm" variant="light" />
        </div>
        <h1 className="text-2xl font-semibold text-arc-900 dark:text-arc-dark-700">{t('login.title')}</h1>
        <p className="text-arc-500 dark:text-arc-dark-500 text-sm mt-1">{t('login.tagline')}</p>
        <p className="text-arc-500 dark:text-arc-dark-500 text-xs mt-2 italic">{t('login.phase_1_credit')}</p>
      </div>

      {/* Persona picker card */}
      <div className="w-full max-w-2xl bg-white dark:bg-arc-dark-100 rounded-xl border border-arc-200 dark:border-arc-dark-200 p-8">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-arc-900 dark:text-arc-dark-700">{t('login.subtitle')}</h2>
          <p className="text-sm text-arc-500 dark:text-arc-dark-500 mt-0.5">{t('login.subtitle_help')}</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-arc-500 dark:text-arc-dark-500 text-sm">
            {t('login.loading')}
          </div>
        ) : (
          <div className="space-y-5">
            {ROLE_ORDER.filter((role) => grouped[role]?.length > 0).map((role) => (
              <div key={role}>
                <p className="text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wider mb-2">
                  {t(`role.${role}`)}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {grouped[role].map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleSignIn(user)}
                      className="group flex items-center gap-4 p-4 rounded-xl border border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 hover:border-arc-500 dark:hover:border-arc-dark-300 hover:bg-arc-100 dark:hover:bg-arc-dark-50 transition-all text-left"
                    >
                      <UserAvatar seed={user.avatar_seed} name={user.name} size="lg" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-arc-900 dark:text-arc-dark-700 truncate">{user.name}</p>
                        <p className="text-xs text-arc-500 dark:text-arc-dark-500 truncate">{user.email}</p>
                        <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.role]}`}>
                          {t(`role.${user.role}`)}
                        </span>
                      </div>
                      <svg
                        className="w-4 h-4 text-arc-500 dark:text-arc-dark-500 group-hover:text-arc-700 dark:group-hover:text-arc-dark-700 transition-colors shrink-0"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-6 text-xs text-arc-500 dark:text-arc-dark-500 text-center">{t('login.footer_note')}</p>
      </div>
    </div>
  );
}
