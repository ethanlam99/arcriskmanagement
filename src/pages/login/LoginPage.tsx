import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { UserAvatar } from '@/components/shared/UserAvatar';
import type { User, UserRole } from '@/types';

const ROLE_LABELS: Record<UserRole, string> = {
  risk_analyst:  'Risk Analyst',
  tester:        'Tester',
  admin:         'Admin',
  risk_lead:     'Risk Lead',
  testing_lead:  'Testing Lead',
  it_team:       'IT Team',
};

const ROLE_COLORS: Record<UserRole, string> = {
  risk_analyst:  'bg-arc-50 text-arc-700 border border-arc-200',
  tester:        'bg-emerald-50 text-emerald-700 border border-emerald-200',
  admin:         'bg-amber-50 text-amber-700 border border-amber-200',
  risk_lead:     'bg-arc-100 text-arc-900 border border-arc-300',
  testing_lead:  'bg-teal-50 text-teal-700 border border-teal-200',
  it_team:       'bg-slate-100 text-slate-700 border border-slate-300',
};

const ROLE_ORDER: UserRole[] = ['risk_analyst', 'risk_lead', 'tester', 'testing_lead', 'it_team', 'admin'];

export function LoginPage() {
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

  // Group personas by role for legibility
  const grouped = ROLE_ORDER.reduce<Record<UserRole, User[]>>((acc, role) => {
    acc[role] = users.filter((u) => u.role === role);
    return acc;
  }, {} as Record<UserRole, User[]>);

  return (
    <div className="min-h-screen bg-arc-50 flex flex-col items-center justify-center p-8">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-arc-900 rounded-xl mb-4">
          <span className="text-white text-xl font-bold">A</span>
        </div>
        <h1 className="text-2xl font-semibold text-arc-900">ARC</h1>
        <p className="text-arc-200 text-sm mt-1">AI Risk Control</p>
      </div>

      {/* Persona picker card */}
      <div className="w-full max-w-2xl bg-white rounded-xl border border-arc-200 p-8">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-arc-900">Select a persona to continue</h2>
          <p className="text-sm text-arc-200 mt-0.5">
            Phase 1 — no password required. Each persona has a different role and permission set.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-arc-200 text-sm">Loading…</div>
        ) : (
          <div className="space-y-5">
            {ROLE_ORDER.filter((role) => grouped[role]?.length > 0).map((role) => (
              <div key={role}>
                <p className="text-xs font-semibold text-arc-200 uppercase tracking-wider mb-2">
                  {ROLE_LABELS[role]}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {grouped[role].map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleSignIn(user)}
                      className="group flex items-center gap-4 p-4 rounded-xl border border-arc-200 bg-white hover:border-arc-500 hover:bg-arc-50 transition-all text-left"
                    >
                      <UserAvatar seed={user.avatar_seed} name={user.name} size="lg" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-arc-900 truncate">{user.name}</p>
                        <p className="text-xs text-arc-200 truncate">{user.email}</p>
                        <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.role]}`}>
                          {ROLE_LABELS[user.role]}
                        </span>
                      </div>
                      <svg
                        className="w-4 h-4 text-arc-200 group-hover:text-arc-500 transition-colors shrink-0"
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

        <p className="mt-6 text-xs text-arc-200 text-center">
          Phase 1 POC — all data is local. No external systems are contacted.
        </p>
      </div>
    </div>
  );
}
