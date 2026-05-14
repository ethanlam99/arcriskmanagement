import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { UserAvatar } from '@/components/shared/UserAvatar';
import type { User, UserRole } from '@/types';

const ROLE_LABELS: Record<UserRole, string> = {
  risk_analyst: 'Risk Analyst',
  tester: 'Tester',
  admin: 'Admin',
};

const ROLE_COLORS: Record<UserRole, string> = {
  risk_analyst: 'bg-aegis-50 text-aegis-700 border border-aegis-200',
  tester: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  admin: 'bg-amber-50 text-amber-700 border border-amber-200',
};

export function LoginPage() {
  const repo = useRepository();
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['aegis', 'users'],
    queryFn: () => repo.users.list(),
  });

  function handleSignIn(user: User) {
    signIn(user);
    navigate('/home');
  }

  return (
    <div className="min-h-screen bg-aegis-50 flex flex-col items-center justify-center p-8">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-aegis-900 rounded-xl mb-4">
          <span className="text-white text-xl font-bold">A</span>
        </div>
        <h1 className="text-2xl font-semibold text-aegis-900">AEGIS</h1>
        <p className="text-aegis-200 text-sm mt-1">AI-Enabled Governance for Intelligent Strategy</p>
      </div>

      {/* Persona picker card */}
      <div className="w-full max-w-2xl bg-white rounded-xl border border-aegis-200 p-8">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-aegis-900">Select a persona to continue</h2>
          <p className="text-sm text-aegis-200 mt-0.5">
            Phase 1 — no password required. Each persona has a different role and permission set.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-aegis-200 text-sm">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => handleSignIn(user)}
                className="group flex items-center gap-4 p-4 rounded-xl border border-aegis-200 bg-white hover:border-aegis-500 hover:bg-aegis-50 transition-all text-left"
              >
                <UserAvatar seed={user.avatar_seed} name={user.name} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-aegis-900 truncate">{user.name}</p>
                  <p className="text-xs text-aegis-200 truncate">{user.email}</p>
                  <span
                    className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.role]}`}
                  >
                    {ROLE_LABELS[user.role]}
                  </span>
                </div>
                <svg
                  className="w-4 h-4 text-aegis-200 group-hover:text-aegis-500 transition-colors shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}

        <p className="mt-6 text-xs text-aegis-200 text-center">
          Phase 1 POC — all data is local. No external systems are contacted.
        </p>
      </div>
    </div>
  );
}
