import { Calendar, Mail, Upload, UserCircle } from 'lucide-react';
import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useToast } from '../components/Toast.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { getDateLocale } from '../i18n/index.ts';

export function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const { showToast } = useToast();
  const { language, t } = useLanguage();

  const [name, setName] = useState(user?.name || '');
  const [age, setAge] = useState(user?.age ? String(user.age) : '');
  const [preferences, setPreferences] = useState(user?.preferences || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  const [saving, setSaving] = useState(false);

  const handleAvatarUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast(t.profile.toasts.selectImage, 'error');
      return;
    }
    if (file.size > 120 * 1024) {
      showToast(t.profile.toasts.imageTooLarge, 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      showToast(t.profile.toasts.nameMinLength, 'error');
      return;
    }
    let parsedAge: number | null = null;
    if (age.trim()) {
      const n = Number(age.trim());
      if (!Number.isInteger(n) || n < 1 || n > 120) {
        showToast(t.profile.toasts.ageInvalid, 'error');
        return;
      }
      parsedAge = n;
    }
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        age: parsedAge,
        preferences: preferences.trim(),
        avatarUrl,
      });
      showToast(t.profile.toasts.updated, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.profile.toasts.updateFailed, 'error');
    } finally {
      setSaving(false);
    }
  };

  const initials = (name || user?.name || 'U')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col items-start gap-5 border-b border-slate-100 pb-6 sm:flex-row sm:items-center dark:border-slate-800">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              referrerPolicy="no-referrer"
              className="h-20 w-20 rounded-2xl border border-slate-200 object-cover dark:border-slate-700"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-600 font-display text-2xl font-bold text-white">
              {initials}
            </div>
          )}

          <div className="flex-1">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              {user?.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {user?.email}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {t.profile.joinedLabel(
                  user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString(getDateLocale(language))
                    : '—'
                )}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                <Upload className="h-3.5 w-3.5" />
                <span>{t.profile.uploadPhoto}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="sr-only"
                />
              </label>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl(null)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 dark:text-slate-400"
                >
                  {t.profile.removePhoto}
                </button>
              )}
            </div>
          </div>
        </div>

        <form noValidate onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="prof-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t.profile.fullNameLabel}
              </label>
              <input
                id="prof-name"
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="prof-age" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t.profile.ageLabel}{' '}
                <span className="font-normal text-slate-400">({t.common.optional})</span>
              </label>
              <input
                id="prof-age"
                type="number"
                min={1}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder={t.profile.agePlaceholder}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="prof-prefs" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t.profile.preferencesLabel}{' '}
              <span className="font-normal text-slate-400">{t.profile.preferencesTag}</span>
            </label>
            <textarea
              id="prof-prefs"
              rows={3}
              maxLength={500}
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              placeholder={t.profile.preferencesPlaceholder}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="mt-1 text-xs text-slate-400">
              {t.profile.preferencesHint}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <UserCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>{t.profile.privateNotice}</span>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? t.common.saving : t.profile.saveProfile}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
