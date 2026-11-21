import { Database, Globe, KeyRound, LogOut, Moon, Shield, Sun, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { DICTIONARIES, LANGUAGE_OPTIONS } from '../i18n/index.ts';
import { apiRequest, emitNotificationsUpdated } from '../services/api.ts';
import type { SupportedLanguage } from '../types/index.ts';

interface HealthStatus {
  ok: boolean;
  geminiConfigured: boolean;
  databaseEngine: string;
  firebaseConfigured: boolean;
}

export function SettingsPage() {
  const { user, updateProfile, logout, deleteAccount } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { showToast } = useToast();

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [savingLanguage, setSavingLanguage] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    apiRequest<HealthStatus>('/api/health').then(setHealth).catch(() => setHealth(null));
  }, []);

  const handleLanguageChange = async (next: SupportedLanguage) => {
    if (savingLanguage || next === language) return;
    setLanguage(next);
    setSavingLanguage(true);
    const nextDict = DICTIONARIES[next] ?? DICTIONARIES.en;
    try {
      await updateProfile({ language: next });
      showToast(
        nextDict.settings.languageUpdatedToast(nextDict.settings.languageNames[next].native),
        'success'
      );
    } catch {
      showToast(nextDict.settings.languageLocalToast, 'info');
    } finally {
      setSavingLanguage(false);
    }
  };

  const handleThemeChange = async (next: 'light' | 'dark') => {
    setTheme(next);
    try {
      await updateProfile({ theme: next });
      showToast(t.settings.themeSwitchedToast(next), 'info');
    } catch {
      showToast(t.settings.themeLocalToast, 'info');
    }
  };

  const handleToggleSetting = async (
    key: 'notificationsEnabled' | 'privacySaveReports',
    value: boolean
  ) => {
    try {
      await updateProfile({ [key]: value });
      if (key === 'notificationsEnabled') {
        emitNotificationsUpdated();
      }
      showToast(t.settings.preferenceUpdatedToast, 'success');
    } catch (err) {
      showToast(
        err instanceof Error && err.message ? err.message : t.settings.saveSettingErrorToast,
        'error'
      );
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      showToast(t.settings.currentPasswordRequired, 'error');
      return;
    }
    if (newPassword.length < 8) {
      showToast(t.settings.passwordMinError, 'error');
      return;
    }
    setChangingPassword(true);
    try {
      await apiRequest('/api/profile/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      showToast(t.settings.passwordUpdatedToast, 'success');
    } catch (err) {
      showToast(
        err instanceof Error && err.message ? err.message : t.settings.passwordErrorToast,
        'error'
      );
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      showToast(t.settings.enterPasswordToast, 'error');
      return;
    }
    setDeletingAccount(true);
    try {
      await deleteAccount(deletePassword);
      showToast(t.settings.accountDeletedToast, 'info');
    } catch (err) {
      showToast(
        err instanceof Error && err.message ? err.message : t.settings.accountDeleteFailedToast,
        'error'
      );
    } finally {
      setDeletingAccount(false);
      setDeleteDialogOpen(false);
      setDeletePassword('');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Language Selector */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            {t.settings.languageTitle}
          </h2>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t.settings.languageSubtitle}
        </p>

        <div
          role="radiogroup"
          aria-label={t.settings.languageTitle}
          className="mt-4 grid gap-2.5 sm:grid-cols-3"
        >
          {LANGUAGE_OPTIONS.map((opt) => {
            const isSelected = language === opt.id;
            const meta = t.settings.languageNames[opt.id];
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={savingLanguage}
                onClick={() => void handleLanguageChange(opt.id)}
                className={`rounded-xl border p-3.5 text-left transition-colors disabled:opacity-60 ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/80 dark:border-emerald-500 dark:bg-emerald-950/40'
                    : 'border-slate-200 bg-slate-50/70 hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-emerald-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    {opt.nativeName}
                  </span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      isSelected ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                </div>
                <div className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                  {meta.label}
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                  {meta.description}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Appearance */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          {t.settings.appearanceTitle}
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t.settings.appearanceSubtitle}
        </p>

        <div className="mt-4 grid max-w-sm grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => void handleThemeChange('light')}
            className={`inline-flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-colors ${
              theme === 'light'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Sun className="h-4 w-4" />
            <span>{t.settings.lightMode}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleThemeChange('dark')}
            className={`inline-flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-colors ${
              theme === 'dark'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Moon className="h-4 w-4" />
            <span>{t.settings.darkMode}</span>
          </button>
        </div>
      </section>

      {/* Notifications & Privacy */}
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            {t.settings.notificationsPrivacyTitle}
          </h2>
        </div>

        <label className="flex cursor-pointer items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.settings.inAppNotificationsTitle}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t.settings.inAppNotificationsSubtitle}
            </div>
          </div>
          <input
            type="checkbox"
            checked={user?.notificationsEnabled ?? true}
            onChange={(e) => void handleToggleSetting('notificationsEnabled', e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
        </label>

        <label className="flex cursor-pointer items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.settings.defaultSaveReportsTitle}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t.settings.defaultSaveReportsSubtitle}
            </div>
          </div>
          <input
            type="checkbox"
            checked={user?.privacySaveReports ?? false}
            onChange={(e) => void handleToggleSetting('privacySaveReports', e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
        </label>
      </section>

      {/* Honest Service Connection Info */}
      {health && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {t.settings.serviceTitle}
            </h2>
          </div>
          <dl className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">{t.settings.geminiBackendLabel}</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200">
                {health.geminiConfigured
                  ? t.settings.geminiConnected
                  : t.settings.geminiMissing}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">{t.settings.databaseAuthLabel}</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200">
                {t.settings.databaseAuthValue}
              </dd>
            </div>
            <div className="pt-1 text-slate-500 dark:text-slate-400">
              {t.settings.serviceNote}
            </div>
          </dl>
        </section>
      )}

      {/* Change Password */}
      <form
        noValidate
        onSubmit={handleChangePassword}
        className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            {t.settings.changePasswordTitle}
          </h2>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="curr-pw" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t.settings.currentPasswordLabel}
            </label>
            <input
              id="curr-pw"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="new-pw" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t.settings.newPasswordLabel}
            </label>
            <input
              id="new-pw"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={changingPassword}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {changingPassword ? t.settings.updatingPasswordButton : t.settings.updatePasswordButton}
          </button>
        </div>
      </form>

      {/* Session & Account Deletion */}
      <section className="rounded-xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-slate-900">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          {t.settings.sessionAccountTitle}
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t.settings.sessionAccountSubtitle}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4" />
            <span>{t.settings.logoutButton}</span>
          </button>

          <button
            type="button"
            onClick={() => setDeleteDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            <Trash2 className="h-4 w-4" />
            <span>{t.settings.deleteAccountButton}</span>
          </button>
        </div>

        {deleteDialogOpen && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50/70 p-4 dark:border-red-900 dark:bg-red-950/30">
            <label htmlFor="del-pw" className="block text-xs font-semibold text-red-900 dark:text-red-200">
              {t.settings.confirmDeletePasswordLabel}
            </label>
            <input
              id="del-pw"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder={t.settings.confirmDeletePasswordPlaceholder}
              className="mt-2 w-full max-w-xs rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-500 focus:outline-none dark:border-red-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        )}
      </section>

      <ConfirmDialog
        open={deleteDialogOpen && deletePassword.length > 0}
        title={t.settings.deleteAccountTitle}
        description={t.settings.deleteAccountDescription}
        confirmLabel={t.settings.deleteForeverButton}
        loading={deletingAccount}
        onConfirm={handleDeleteAccount}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setDeletePassword('');
        }}
      />
    </div>
  );
}
