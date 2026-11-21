import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Pill,
  RotateCcw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { useToast } from '../components/Toast.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { getDateLocale } from '../i18n/index.ts';
import { apiRequest } from '../services/api.ts';
import type { MedicineInfoResult } from '../types/index.ts';

const QUICK_MEDICINES = ['Paracetamol', 'Ibuprofen', 'Metformin', 'Amoxicillin', 'Cetirizine'];

function formatRetrievedTimestamp(iso: string | undefined, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function MedicineInfoPage() {
  const { showToast } = useToast();
  const { language, t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [activeTerm, setActiveTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MedicineInfoResult | null>(null);

  const performSearch = async (name: string) => {
    if (loading) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError(t.medicines.validationMinLength);
      inputRef.current?.focus();
      return;
    }
    setQuery(trimmed);
    setActiveTerm(trimmed);
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ result: MedicineInfoResult }>('/api/medicines/search', {
        method: 'POST',
        timeoutMs: 45000,
        body: JSON.stringify({ medicineName: trimmed, language }),
      });
      if (!data?.result?.markdownContent) {
        throw new Error(t.medicines.emptyResponseError);
      }
      setResult(data.result);
    } catch (err) {
      const message = err instanceof Error ? err.message : t.medicines.genericError;
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void performSearch(query);
  };

  const handleSearchAnother = () => {
    setQuery('');
    setError(null);
    setResult(null);
    setActiveTerm('');
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const hasConfirmedRetrievedSources =
    (result?.groundingStatus === 'live_grounded' ||
      result?.groundingStatus === 'live_source_retrieved') &&
    Boolean(result?.sources?.some((s) => s.retrievedAndUsed));
  const isGoogleGrounded = result?.groundingStatus === 'live_grounded' && hasConfirmedRetrievedSources;
  const dateLocale = getDateLocale(language);
  const formattedResultTimestamp = formatRetrievedTimestamp(result?.retrievedAt, dateLocale);

  return (
    <div className="space-y-6">
      {/* Disclaimer */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-xs leading-relaxed">
            <strong>{t.medicines.safetyPrefix}</strong> {t.medicines.safetyBody}
          </p>
        </div>
      </div>

      {/* Search Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          {t.medicines.searchTitle}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t.medicines.searchSubtitle}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div
            onClick={() => inputRef.current?.focus()}
            className="relative flex flex-1 cursor-text items-center"
          >
            <label htmlFor="medicine-search-input" className="sr-only">
              {t.medicines.inputLabel}
            </label>
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
            <input
              ref={inputRef}
              id="medicine-search-input"
              name="medicineName"
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t.medicines.inputPlaceholder}
              aria-label={t.medicines.inputLabel}
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pr-9 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {query.length > 0 && !loading && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuery('');
                  setError(null);
                  inputRef.current?.focus();
                }}
                aria-label={t.medicines.clearSearchAria}
                className="absolute right-2.5 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span>{loading ? t.medicines.searchingButton : t.medicines.searchButton}</span>
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">{t.medicines.commonExamples}</span>
          {QUICK_MEDICINES.map((med) => (
            <button
              key={med}
              type="button"
              disabled={loading}
              onClick={() => void performSearch(med)}
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-700"
            >
              {med}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {!result && !loading && (
        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <Pill className="h-10 w-10 text-emerald-600/70 dark:text-emerald-400/70" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            {t.medicines.emptyState}
          </p>
        </div>
      )}

      {loading && (
        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            {t.medicines.loadingState(activeTerm || t.medicines.fallbackQueryTerm)}
          </p>
        </div>
      )}

      {result && !loading && (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-8 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  {result.medicineName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {hasConfirmedRetrievedSources
                    ? t.medicines.verifiedSubheading
                    : t.medicines.unverifiedSubheading}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSearchAnother}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-emerald-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{t.medicines.searchAnother}</span>
              </button>
            </div>

            {/* Honest Source Verification Status Banner */}
            {hasConfirmedRetrievedSources ? (
              <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="space-y-1">
                  <div>
                    <span>{result.verificationNote}</span>
                  </div>
                  {formattedResultTimestamp && (
                    <div className="flex items-center gap-1 text-[11px] text-emerald-800 dark:text-emerald-300">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>{t.medicines.retrievedOn(formattedResultTimestamp)}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <span>{result.verificationNote}</span>
                </div>
              </div>
            )}

            <div className="space-y-5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {result.sections && result.sections.length > 0 ? (
                result.sections.map((section, sIdx) => (
                  <section key={sIdx} className="space-y-2">
                    <h4 className="border-b border-slate-100 pb-1.5 font-display text-base font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
                      {section.heading}
                    </h4>
                    <ReactMarkdown
                      components={{
                        h3: ({ children }) => (
                          <h5 className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-white">
                            {children}
                          </h5>
                        ),
                        h2: ({ children }) => (
                          <h5 className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-white">
                            {children}
                          </h5>
                        ),
                        p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
                        ul: ({ children }) => (
                          <ul className="my-2 list-disc space-y-1.5 pl-5">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="my-2 list-decimal space-y-1.5 pl-5">{children}</ol>
                        ),
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        strong: ({ children }) => (
                          <strong className="font-semibold text-slate-900 dark:text-white">
                            {children}
                          </strong>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="my-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                            {children}
                          </blockquote>
                        ),
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-emerald-700 underline hover:text-emerald-800 dark:text-emerald-400"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {section.contentMarkdown}
                    </ReactMarkdown>

                    {hasConfirmedRetrievedSources && section.supportingExcerpts.length > 0 && (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40">
                        <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span>{t.medicines.verifiedSupportingExcerpts}</span>
                        </div>
                        <ul className="space-y-2">
                          {section.supportingExcerpts.map((ex, exIdx) => (
                            <li
                              key={exIdx}
                              className="border-l-2 border-emerald-400 pl-2.5 text-[11px] leading-relaxed text-slate-600 dark:border-emerald-600 dark:text-slate-300"
                            >
                              <p className="italic">&ldquo;{ex.quote}&rdquo;</p>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                <a
                                  href={ex.sourceUri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                                >
                                  {ex.organization} — {ex.sourceTitle}
                                </a>
                                {ex.isProductSpecificLabel && (
                                  <span className="font-medium text-amber-700 dark:text-amber-300">
                                    {t.medicines.productSpecificLabelTag}
                                  </span>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                ))
              ) : (
                <ReactMarkdown
                  components={{
                    h3: ({ children }) => (
                      <h4 className="mt-5 border-b border-slate-100 pb-1.5 font-display text-base font-semibold text-slate-900 first:mt-0 dark:border-slate-800 dark:text-white">
                        {children}
                      </h4>
                    ),
                    h2: ({ children }) => (
                      <h4 className="mt-5 border-b border-slate-100 pb-1.5 font-display text-base font-semibold text-slate-900 first:mt-0 dark:border-slate-800 dark:text-white">
                        {children}
                      </h4>
                    ),
                    p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
                    ul: ({ children }) => (
                      <ul className="my-2 list-disc space-y-1.5 pl-5">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="my-2 list-decimal space-y-1.5 pl-5">{children}</ol>
                    ),
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    strong: ({ children }) => (
                      <strong className="font-semibold text-slate-900 dark:text-white">
                        {children}
                      </strong>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="my-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                        {children}
                      </blockquote>
                    ),
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-emerald-700 underline hover:text-emerald-800 dark:text-emerald-400"
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {result.markdownContent}
                </ReactMarkdown>
              )}
            </div>
          </div>

          <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
            {hasConfirmedRetrievedSources ? (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    {t.medicines.retrievedOfficialSourcesTitle}
                  </h4>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {isGoogleGrounded
                    ? t.medicines.googleGroundedDesc
                    : t.medicines.fetchedOfficialDesc}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    {t.medicines.sourceRetrievalUnavailableTitle}
                  </h4>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {t.medicines.sourceRetrievalUnavailableDesc}
                </p>
              </>
            )}

            {result.sources.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {t.medicines.noSourcesNotice}
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {result.sources.map((src, idx) => {
                  const retrievedTime = formatRetrievedTimestamp(src.retrievedAt, dateLocale);
                  return (
                    <li
                      key={idx}
                      className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                    >
                      <a
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold break-words text-emerald-700 group-hover:underline dark:text-emerald-400">
                            {src.title}
                          </span>
                          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        </div>
                      </a>

                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                        <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
                        <span>{src.organization}</span>
                      </div>

                      {src.isProductSpecificLabel && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          <FileText className="h-3 w-3 shrink-0" />
                          <span>{t.medicines.productSpecificFullNotice}</span>
                        </div>
                      )}

                      {retrievedTime && (
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                          <span>{t.medicines.retrievedLabel} {retrievedTime}</span>
                        </div>
                      )}

                      {src.excerpt && (
                        <div className="mt-2 rounded-md border border-slate-100 bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {t.medicines.supportingExcerptPrefix}{' '}
                          </span>
                          <span>&ldquo;{src.excerpt}&rdquo;</span>
                        </div>
                      )}

                      <a
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 block truncate font-mono text-[11px] text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                        title={src.uri}
                      >
                        {src.uri}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
