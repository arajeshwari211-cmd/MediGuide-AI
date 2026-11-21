import { ArrowLeft, FileQuestion } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.tsx';

interface NotFoundPageProps {
  onGoHome: () => void;
}

export function NotFoundPage({ onGoHome }: NotFoundPageProps) {
  const { t } = useLanguage();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center dark:bg-slate-950">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
        <FileQuestion className="h-7 w-7" />
      </div>
      <h1 className="mt-4 font-display text-3xl font-bold text-slate-900 dark:text-white">
        {t.notFound.title}
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
        {t.notFound.body}
      </p>
      <button
        type="button"
        onClick={onGoHome}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>{t.notFound.returnButton}</span>
      </button>
    </div>
  );
}
