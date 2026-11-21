import { ArrowLeft, Eye, EyeOff, KeyRound, Languages, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { BrandLogo } from '../components/BrandLogo.tsx';
import { useToast } from '../components/Toast.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { LANGUAGE_OPTIONS } from '../i18n/index.ts';
import { apiRequest } from '../services/api.ts';
import type { SupportedLanguage } from '../types/index.ts';

interface AuthPageProps {
  initialMode: 'login' | 'register';
  onBack: () => void;
}

export function AuthPage({ initialMode, onBack }: AuthPageProps) {
  const { login, register } = useAuth();
  const { showToast } = useToast();
  const { language, setLanguage, t } = useLanguage();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [resetStep, setResetStep] = useState<'request' | 'verify'>('request');
  const [resetCodeInput, setResetCodeInput] = useState('');
  const [issuedDemoCode, setIssuedDemoCode] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const trimmedEmail = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        throw new Error(t.auth.errors.emailInvalid);
      }

      if (mode === 'login') {
        if (!password) {
          throw new Error(t.auth.errors.passwordRequired);
        }
        await login(trimmedEmail, password);
        showToast(t.auth.toasts.signedIn, 'success');
      } else if (mode === 'register') {
        if (name.trim().length < 2) {
          throw new Error(t.auth.errors.nameMin);
        }
        let parsedAge: number | null = null;
        if (age.trim()) {
          const n = Number(age.trim());
          if (!Number.isInteger(n) || n < 1 || n > 120) {
            throw new Error(t.auth.errors.ageInvalid);
          }
          parsedAge = n;
        }
        if (password.length < 8) {
          throw new Error(t.auth.errors.passwordMin);
        }
        await register({
          name: name.trim(),
          email: trimmedEmail,
          password,
          age: parsedAge,
          language,
        });
        showToast(t.auth.toasts.accountCreated, 'success');
      } else if (mode === 'forgot') {
        if (resetStep === 'request') {
          const res = await apiRequest<{ message: string; verificationCode: string }>(
            '/api/auth/forgot-password',
            {
              method: 'POST',
              body: JSON.stringify({ email: trimmedEmail }),
            }
          );
          setIssuedDemoCode(res.verificationCode);
          setResetStep('verify');
          showToast(t.auth.toasts.resetCodeGenerated, 'info');
        } else {
          if (!/^\d{6}$/.test(resetCodeInput.trim())) {
            throw new Error(t.auth.errors.resetCodeInvalid);
          }
          if (newPassword.length < 8) {
            throw new Error(t.auth.errors.newPasswordMin);
          }
          await apiRequest('/api/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({
              email: trimmedEmail,
              code: resetCodeInput.trim(),
              newPassword,
            }),
          });
          showToast(t.auth.toasts.passwordUpdated, 'success');
          setMode('login');
          setResetStep('request');
          setIssuedDemoCode(null);
          setPassword('');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.errors.authFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{t.auth.backToHome}</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="relative flex items-center">
              <Languages className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                aria-label={t.landing.languageLabel}
                className="h-9 rounded-lg border border-slate-200 bg-white py-1 pr-2.5 pl-8 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.nativeName}
                  </option>
                ))}
              </select>
            </div>
            <BrandLogo />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {mode === 'login'
                ? t.auth.loginTitle
                : mode === 'register'
                  ? t.auth.registerTitle
                  : t.auth.forgotTitle}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              {mode === 'login'
                ? t.auth.loginSubtitle
                : mode === 'register'
                  ? t.auth.registerSubtitle
                  : t.auth.forgotSubtitle}
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          {mode === 'forgot' && issuedDemoCode && (
            <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs leading-relaxed text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              <div className="flex items-center gap-1.5 font-semibold">
                <KeyRound className="h-4 w-4" />
                <span>{t.auth.resetCodeTitle}</span>
              </div>
              <p className="mt-1">
                {t.auth.resetCodeBody}{' '}
                <strong className="font-mono text-sm tracking-wider">{issuedDemoCode}</strong>
              </p>
            </div>
          )}

          <form noValidate onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t.auth.fullNameLabel}
                </label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.auth.fullNamePlaceholder}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t.auth.emailLabel}
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.auth.emailPlaceholder}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label htmlFor="auth-age" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t.auth.ageLabel}{' '}
                  <span className="font-normal text-slate-400">({t.common.optional})</span>
                </label>
                <input
                  id="auth-age"
                  type="number"
                  min={1}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder={t.auth.agePlaceholder}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            )}

            {(mode === 'login' || mode === 'register') && (
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t.auth.passwordLabel}
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setResetStep('request');
                        setError(null);
                      }}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    >
                      {t.auth.forgotPasswordLink}
                    </button>
                  )}
                </div>
                <div className="relative mt-1.5">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={mode === 'register' ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === 'register'
                        ? t.auth.registerPasswordPlaceholder
                        : t.auth.loginPasswordPlaceholder
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pr-10 pl-3.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? t.auth.hidePasswordAria : t.auth.showPasswordAria}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'forgot' && resetStep === 'verify' && (
              <>
                <div>
                  <label htmlFor="reset-code" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t.auth.verificationCodeLabel}
                  </label>
                  <input
                    id="reset-code"
                    type="text"
                    required
                    maxLength={6}
                    value={resetCodeInput}
                    onChange={(e) => setResetCodeInput(e.target.value)}
                    placeholder="123456"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm tracking-widest text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t.auth.newPasswordLabel}
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t.auth.newPasswordPlaceholder}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting
                ? t.auth.submittingButton
                : mode === 'login'
                  ? t.auth.signInButton
                  : mode === 'register'
                    ? t.auth.createAccountButton
                    : resetStep === 'request'
                      ? t.auth.generateResetCodeButton
                      : t.auth.updatePasswordButton}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
            {mode === 'login' ? (
              <>
                {t.auth.newToApp}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className="font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                >
                  {t.auth.createAnAccountLink}
                </button>
              </>
            ) : (
              <>
                {t.auth.alreadyHaveAccount}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setResetStep('request');
                    setIssuedDemoCode(null);
                    setError(null);
                  }}
                  className="font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                >
                  {t.auth.signInLink}
                </button>
              </>
            )}
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{t.auth.securityFooter}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
