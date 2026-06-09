import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Logo } from '@/components/shared/Logo';

const MIN_PASSWORD_LENGTH = 8;

export function ChangePasswordPage() {
  const { t } = useTranslation();
  const { isAuthenticated, needsPasswordChange, updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Password already set — nothing to do here.
  if (!needsPasswordChange) return <Navigate to="/overview" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('change_password.error_too_short', { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirm) {
      setError(t('change_password.error_mismatch'));
      return;
    }

    setSubmitting(true);
    const err = await updatePassword(password);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    // Success: the USER_UPDATED auth event clears needsPasswordChange and the
    // Navigate guard above redirects to /overview.
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-arc-50 dark:bg-arc-dark-900">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-arc-900 dark:bg-arc-dark-900 rounded-xl">
            <Logo size="sm" variant="light" />
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-arc-900 dark:text-arc-dark-700 text-center">
          {t('change_password.heading')}
        </h1>
        <p className="text-sm text-arc-500 dark:text-arc-dark-500 mt-1 text-center">
          {t('change_password.subtitle')}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-xs font-semibold text-arc-700 dark:text-arc-dark-700 mb-1.5">
              {t('change_password.new_password_label')}
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-arc-200 dark:border-arc-dark-300 bg-white dark:bg-arc-dark-100 px-3 py-2.5 text-sm text-arc-900 dark:text-arc-dark-700 focus:outline-none focus:ring-2 focus:ring-forest-500 dark:focus:ring-forest-dark-600 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-xs font-semibold text-arc-700 dark:text-arc-dark-700 mb-1.5">
              {t('change_password.confirm_password_label')}
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-arc-200 dark:border-arc-dark-300 bg-white dark:bg-arc-dark-100 px-3 py-2.5 text-sm text-arc-900 dark:text-arc-dark-700 focus:outline-none focus:ring-2 focus:ring-forest-500 dark:focus:ring-forest-dark-600 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-forest-500 dark:bg-forest-dark-600 text-white font-medium py-2.5 text-sm hover:bg-forest-600 dark:hover:bg-forest-dark-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? t('change_password.submitting') : t('change_password.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
