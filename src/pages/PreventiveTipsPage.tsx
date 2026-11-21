import {
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { ErrorBoundary } from '../components/ErrorBoundary.tsx';
import { useToast } from '../components/Toast.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { getDateLocale, translateTipCategory } from '../i18n/index.ts';
import { apiRequest } from '../services/api.ts';
import type { GeneratedTip, SavedTip } from '../types/index.ts';

const TIP_CATEGORIES = [
  'Healthy eating',
  'Physical activity',
  'Sleep',
  'Hydration',
  'Stress management',
  'Personal hygiene',
  'Preventive health awareness',
];

function normalizeGeneratedTips(rawTips: unknown, fallbackCategory: string): GeneratedTip[] {
  if (!Array.isArray(rawTips)) return [];
  return rawTips
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => {
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const tipCategory =
        typeof item.category === 'string' && item.category.trim()
          ? item.category.trim()
          : fallbackCategory;
      const content = typeof item.content === 'string' ? item.content.trim() : '';
      const actionableSteps = Array.isArray(item.actionableSteps)
        ? item.actionableSteps
            .map((step) => (typeof step === 'string' ? step.trim() : ''))
            .filter(Boolean)
        : [];
      return {
        title,
        category: tipCategory,
        content,
        actionableSteps,
      };
    })
    .filter((tip) => tip.title.length > 0 && tip.content.length > 0);
}

function normalizeSavedTips(rawTips: unknown): SavedTip[] {
  if (!Array.isArray(rawTips)) return [];
  return rawTips
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => {
      const id = typeof item.id === 'string' ? item.id : '';
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const tipCategory =
        typeof item.category === 'string' && item.category.trim()
          ? item.category.trim()
          : TIP_CATEGORIES[0];
      const content = typeof item.content === 'string' ? item.content.trim() : '';
      const createdAt =
        typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : new Date().toISOString();
      const actionableSteps = Array.isArray(item.actionableSteps)
        ? item.actionableSteps
            .map((step) => (typeof step === 'string' ? step.trim() : ''))
            .filter(Boolean)
        : [];
      return {
        id,
        category: tipCategory,
        title,
        content,
        actionableSteps,
        createdAt,
      };
    })
    .filter((tip) => tip.id.length > 0 && tip.title.length > 0 && tip.content.length > 0);
}

function PreventiveTipsContent() {
  const { showToast } = useToast();
  const { language, t } = useLanguage();

  const [category, setCategory] = useState(TIP_CATEGORIES[0]);
  const [goal, setGoal] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedTips, setGeneratedTips] = useState<GeneratedTip[]>([]);
  const [generatedForCategory, setGeneratedForCategory] = useState(TIP_CATEGORIES[0]);
  const [savedTips, setSavedTips] = useState<SavedTip[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [savingTitle, setSavingTitle] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const loadSaved = async () => {
    try {
      const data = await apiRequest<{ tips?: unknown }>('/api/tips/saved');
      setSavedTips(normalizeSavedTips(data?.tips));
    } catch {
      // ignore initial error
    } finally {
      setLoadingSaved(false);
    }
  };

  useEffect(() => {
    void loadSaved();
  }, []);

  const runGenerate = async () => {
    if (generating) return;

    const selectedCategory = category?.trim();
    if (!selectedCategory) {
      const msg = t.tips.selectCategoryError;
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    setError(null);
    setGenerating(true);

    try {
      const data = await apiRequest<{ tips?: unknown }>('/api/tips/generate', {
        method: 'POST',
        timeoutMs: 45000,
        body: JSON.stringify({
          category: selectedCategory,
          goal: goal.trim(),
          language,
        }),
      });

      const normalized = normalizeGeneratedTips(data?.tips, selectedCategory);
      if (normalized.length === 0) {
        throw new Error(t.tips.emptyResponseError);
      }

      setGeneratedTips(normalized);
      setGeneratedForCategory(selectedCategory);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : t.tips.genericError;
      setError(message);
      showToast(message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    await runGenerate();
  };

  const handleSaveTip = async (tip: GeneratedTip) => {
    const key = tip.title.trim();
    if (!key || savingTitle) return;
    setSavingTitle(key);
    try {
      const res = await apiRequest<{ tip?: unknown }>('/api/tips/saved', {
        method: 'POST',
        body: JSON.stringify({
          category: tip.category,
          title: tip.title,
          content: tip.content,
          actionableSteps: Array.isArray(tip.actionableSteps) ? tip.actionableSteps : [],
        }),
      });
      const normalized = normalizeSavedTips(res?.tip ? [res.tip] : []);
      if (normalized.length > 0) {
        setSavedTips((prev) => [normalized[0], ...prev]);
      }
      showToast(t.tips.savedToast, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.tips.saveErrorToast, 'error');
    } finally {
      setSavingTitle(null);
    }
  };

  const confirmRemove = async () => {
    if (!removeId) return;
    setRemoving(true);
    try {
      await apiRequest(`/api/tips/saved/${removeId}`, { method: 'DELETE' });
      setSavedTips((prev) => prev.filter((item) => item.id !== removeId));
      showToast(t.tips.removedToast, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.tips.removeErrorToast, 'error');
    } finally {
      setRemoving(false);
      setRemoveId(null);
    }
  };

  const isSaved = (title: string) => {
    const normalizedTitle = (title ?? '').trim().toLowerCase();
    if (!normalizedTitle) return false;
    return savedTips.some((s) => (s?.title ?? '').trim().toLowerCase() === normalizedTitle);
  };

  const safeGeneratedTips = Array.isArray(generatedTips) ? generatedTips : [];
  const safeSavedTips = Array.isArray(savedTips) ? savedTips : [];

  return (
    <div className="space-y-8">
      {/* Generator Card */}
      <form
        noValidate
        onSubmit={handleGenerate}
        className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          {t.tips.title}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t.tips.subtitle}
        </p>

        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label={t.tips.categoriesAria}>
          {TIP_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              disabled={generating}
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
              className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${
                category === cat
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {translateTipCategory(cat, t)}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={generating}
            placeholder={t.tips.goalPlaceholder}
            aria-label={t.tips.goalAria}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={generating}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span>{generating ? t.tips.generatingButton : t.tips.generateButton}</span>
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 sm:flex-row sm:items-center sm:justify-between dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              disabled={generating}
              onClick={() => void runGenerate()}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t.common.retry}</span>
            </button>
          </div>
        )}
      </form>

      {/* Loading State for Results */}
      {generating && (
        <section
          aria-live="polite"
          className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t.tips.loadingMessage(translateTipCategory(category, t))}</span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((skeletonIdx) => (
              <div
                key={skeletonIdx}
                className="h-44 animate-pulse rounded-xl border border-slate-100 bg-slate-100/80 p-5 dark:border-slate-800 dark:bg-slate-800/60"
              />
            ))}
          </div>
        </section>
      )}

      {/* Generated Suggestions */}
      {!generating && safeGeneratedTips.length > 0 && (
        <section>
          <h3 className="mb-3 font-display text-base font-semibold text-slate-900 dark:text-white">
            {t.tips.generatedHeading(translateTipCategory(generatedForCategory, t))}
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            {safeGeneratedTips.map((tip, idx) => {
              const saved = isSaved(tip.title);
              const steps = Array.isArray(tip.actionableSteps) ? tip.actionableSteps : [];
              const isSavingThis = savingTitle === tip.title.trim();
              return (
                <div
                  key={`${tip.title}-${idx}`}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      {translateTipCategory(tip.category || generatedForCategory, t)}
                    </div>
                    <h4 className="mt-1 font-display text-base font-semibold text-slate-900 dark:text-white">
                      {tip.title}
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {tip.content}
                    </p>
                    {steps.length > 0 && (
                      <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-slate-500 dark:text-slate-400">
                        {steps.map((step, sIdx) => (
                          <li key={sIdx}>{step}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={saved || isSavingThis}
                    onClick={() => void handleSaveTip(tip)}
                    className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                      saved
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400'
                        : 'border-slate-200 text-slate-700 hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-slate-700 dark:text-slate-200 dark:hover:border-emerald-700'
                    }`}
                  >
                    {saved ? (
                      <>
                        <BookmarkCheck className="h-4 w-4" />
                        <span>{t.common.saved}</span>
                      </>
                    ) : isSavingThis ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t.common.saving}</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="h-4 w-4" />
                        <span>{t.tips.saveSuggestion}</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Saved Tips */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          {t.tips.savedHeading}
        </h3>

        {loadingSaved ? (
          <div className="mt-4 h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ) : safeSavedTips.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {t.tips.emptySaved}
          </p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {safeSavedTips.map((tip) => {
              const steps = Array.isArray(tip.actionableSteps) ? tip.actionableSteps : [];
              const parsedDate = tip.createdAt ? new Date(tip.createdAt) : null;
              const dateLabel =
                parsedDate && !Number.isNaN(parsedDate.getTime())
                  ? parsedDate.toLocaleDateString(getDateLocale(language))
                  : '';
              return (
                <div
                  key={tip.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          {translateTipCategory(tip.category, t)}
                        </span>
                        {dateLabel && (
                          <>
                            <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                            <span className="font-mono text-xs text-slate-400">{dateLabel}</span>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setRemoveId(tip.id)}
                        aria-label={t.tips.removeAria(tip.title)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <h4 className="mt-1 font-display text-base font-semibold text-slate-900 dark:text-white">
                      {tip.title}
                    </h4>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {tip.content}
                    </p>
                    {steps.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-500 dark:text-slate-400">
                        {steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={removeId !== null}
        title={t.tips.removeDialogTitle}
        description={t.tips.removeDialogDescription}
        confirmLabel={t.common.remove}
        loading={removing}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveId(null)}
      />
    </div>
  );
}

export function PreventiveTipsPage() {
  const { t } = useLanguage();
  return (
    <ErrorBoundary sectionName={t.tips.sectionName}>
      <PreventiveTipsContent />
    </ErrorBoundary>
  );
}
