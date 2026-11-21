import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  RotateCcw,
  Stethoscope,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useToast } from '../components/Toast.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { apiRequest } from '../services/api.ts';
import type { SymptomAnalysisResult } from '../types/index.ts';

type SeverityLevel = 'Mild' | 'Moderate' | 'Severe';

const SEVERITY_OPTIONS: SeverityLevel[] = ['Mild', 'Moderate', 'Severe'];

export function SymptomInfoPage() {
  const { showToast } = useToast();
  const { language, t } = useLanguage();
  const symptomsRef = useRef<HTMLTextAreaElement>(null);
  const durationRef = useRef<HTMLInputElement>(null);

  const [symptoms, setSymptoms] = useState('');
  const [duration, setDuration] = useState('');
  const [severity, setSeverity] = useState<SeverityLevel | ''>('');
  const [additionalInfo, setAdditionalInfo] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SymptomAnalysisResult | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const trimmedSymptoms = symptoms.trim();
    const trimmedDuration = duration.trim();

    if (trimmedSymptoms.length < 3) {
      setError(t.symptoms.validationSymptoms);
      symptomsRef.current?.focus();
      return;
    }

    if (trimmedDuration.length < 1) {
      setError(t.symptoms.validationDuration);
      durationRef.current?.focus();
      return;
    }

    if (!severity || !SEVERITY_OPTIONS.includes(severity)) {
      setError(t.symptoms.validationSeverity);
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const data = await apiRequest<{ analysis?: SymptomAnalysisResult }>(
        '/api/symptoms/analyze',
        {
          method: 'POST',
          timeoutMs: 45000,
          body: JSON.stringify({
            symptoms: trimmedSymptoms,
            duration: trimmedDuration,
            severity,
            additionalInfo: additionalInfo.trim(),
            language,
          }),
        }
      );

      const analysis = data?.analysis;
      if (
        !analysis ||
        !analysis.reportedSummary?.trim() ||
        !Array.isArray(analysis.possibleExplanations) ||
        analysis.possibleExplanations.length === 0
      ) {
        throw new Error(t.symptoms.incompleteResponseError);
      }

      setResult(analysis);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : t.symptoms.genericError;
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSymptoms('');
    setDuration('');
    setSeverity('');
    setAdditionalInfo('');
    setError(null);
    setResult(null);
    window.setTimeout(() => {
      symptomsRef.current?.focus();
    }, 0);
  };

  const hasImmediateEmergencyCue =
    severity === 'Severe' ||
    /\b(?:sudden severe headache|worst headache|thunderclap headache|chest pain|chest discomfort|chest pressure|shortness of breath|difficulty breathing|trouble breathing|cannot breathe|unconscious|loss of consciousness|fainting|seizure|seizures|severe bleeding|coughing up blood|vomiting blood|confusion|difficulty speaking|slurred speech|new weakness|sudden weakness|one side|anaphylaxis|swollen tongue|swollen throat)\b/i.test(
      `${symptoms} ${additionalInfo}`
    ) ||
    /(ಹಠಾತ್ ತೀವ್ರ ತಲೆನೋವು|ಎದೆ ನೋವು|ಉಸಿರಾಟದ ತೊಂದರೆ|ಉಸಿರಾಡಲು ಕಷ್ಟ|ಮೂರ್ಛೆ|ಪ್ರಜ್ಞಾಹೀನ|ರಕ್ತಸ್ರಾವ|ಮಾತನಾಡಲು ಕಷ್ಟ|ಹಠಾತ್ ದೌರ್ಬಲ್ಯ|ಸೆಳೆತ|ಅचानक तेज सिरदर्द|सीने में दर्द|सांस लेने में कठिनाई|सांस फूलना|बेहोशी|अचानक कमजोरी|दौरे|बोलने में कठिनाई|अत्यधिक रक्तस्राव)/i.test(
      `${symptoms} ${additionalInfo}`
    );

  return (
    <div className="space-y-6">
      {/* Safety & Emergency Escalation Banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        <div className="flex items-start gap-3">
          <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-semibold">{t.symptoms.safetyTitle}</p>
            <p className="mt-1 text-xs leading-relaxed">
              {t.symptoms.safetyBody}
            </p>
          </div>
        </div>
      </div>

      {hasImmediateEmergencyCue && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-semibold">{t.symptoms.emergencyBannerTitle}</p>
              <p className="mt-1 text-xs leading-relaxed">
                {t.symptoms.emergencyBannerBody}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Symptom Input Form */}
      <form
        noValidate
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              {t.symptoms.formTitle}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t.symptoms.formSubtitle}
            </p>
          </div>
          {(symptoms || duration || severity || additionalInfo || result) && !loading && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-emerald-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t.symptoms.clearForm}</span>
            </button>
          )}
        </div>

        <div>
          <label htmlFor="sym-desc" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            {t.symptoms.symptomsLabel} <span className="text-red-500">*</span>
          </label>
          <textarea
            ref={symptomsRef}
            id="sym-desc"
            name="symptoms"
            rows={3}
            value={symptoms}
            onChange={(e) => {
              setSymptoms(e.target.value);
              if (error) setError(null);
            }}
            placeholder={t.symptoms.symptomsPlaceholder}
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="sym-duration" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t.symptoms.durationLabel} <span className="text-red-500">*</span>
            </label>
            <input
              ref={durationRef}
              id="sym-duration"
              name="duration"
              type="text"
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t.symptoms.durationPlaceholder}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div>
            <span id="sym-severity-label" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t.symptoms.severityLabel} <span className="text-red-500">*</span>
            </span>
            <div
              role="group"
              aria-labelledby="sym-severity-label"
              className="mt-1.5 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800"
            >
              {SEVERITY_OPTIONS.map((level) => {
                const isSelected = severity === level;
                return (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSeverity(level);
                      if (error) setError(null);
                    }}
                    className={`rounded-md py-2 text-xs font-semibold transition-colors ${
                      isSelected
                        ? level === 'Severe'
                          ? 'bg-red-600 text-white shadow-xs'
                          : level === 'Moderate'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
                    }`}
                  >
                    {t.symptoms.severityLevels[level]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="sym-extra" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            {t.symptoms.additionalContextLabel}{' '}
            <span className="font-normal text-slate-400">({t.common.optional})</span>
          </label>
          <textarea
            id="sym-extra"
            name="additionalInfo"
            rows={2}
            value={additionalInfo}
            onChange={(e) => setAdditionalInfo(e.target.value)}
            placeholder={t.symptoms.additionalContextPlaceholder}
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t.symptoms.severityNote}
          </p>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t.symptoms.generatingButton}</span>
              </>
            ) : (
              <span>{t.symptoms.submitButton}</span>
            )}
          </button>
        </div>
      </form>

      {/* Results Area Below the Form */}
      {!result && !loading && (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <Stethoscope className="h-10 w-10 text-emerald-600/70 dark:text-emerald-400/70" />
          <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-white">
            {t.symptoms.emptyTitle}
          </h3>
          <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
            {t.symptoms.emptyBody}
          </p>
        </div>
      )}

      {loading && (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
            {t.symptoms.loadingTitle}
          </p>
          <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
            {t.symptoms.loadingBody}
          </p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          {/* 1. Symptom Overview */}
          <section className="border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-2 font-display text-base font-semibold text-slate-900 dark:text-white">
              <Info className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <h3>{t.symptoms.sections.overview}</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {result.reportedSummary}
            </p>
          </section>

          {/* 2. General Possible Factors */}
          <section className="border-b border-slate-100 pb-4 dark:border-slate-800">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {t.symptoms.sections.possibleFactors}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                {t.symptoms.sections.educationalOnlyTag}
              </span>
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t.symptoms.sections.possibleFactorsNote}
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
              {result.possibleExplanations.map((item, idx) => (
                <li key={idx} className="leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* 3. Red-Flag Warning Signs */}
          <section className="rounded-lg border border-red-200 bg-red-50/70 p-4 dark:border-red-900/60 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-display text-base font-semibold text-red-800 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <h3>{t.symptoms.sections.redFlags}</h3>
            </div>
            {result.emergencyWarningSigns && result.emergencyWarningSigns.length > 0 ? (
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-900 dark:text-red-200">
                    {t.symptoms.sections.lifeThreateningHeading}
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-sm text-red-900/95 dark:text-red-100">
                    {result.emergencyWarningSigns.map((sign, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {sign}
                      </li>
                    ))}
                  </ul>
                </div>
                {result.promptMedicalSigns && result.promptMedicalSigns.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                      {t.symptoms.sections.promptMedicalHeading}
                    </p>
                    <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-sm text-amber-950/90 dark:text-amber-100">
                      {result.promptMedicalSigns.map((sign, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {sign}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-red-800/90 dark:text-red-200">
                {result.warningSigns.map((sign, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {sign}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 rounded-md border border-red-200/80 bg-white/80 p-3 text-xs font-medium text-red-900 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-100">
              <strong>{t.symptoms.sections.immediateEmergencyPrefix}</strong> {result.emergencyGuidance}
            </div>
          </section>

          {/* 4. Safe Self-Care Information */}
          <section className="border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-2 font-display text-base font-semibold text-slate-900 dark:text-white">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <h3>{t.symptoms.sections.selfCare}</h3>
            </div>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
              {result.generalSelfCare.map((care, idx) => (
                <li key={idx} className="leading-relaxed">
                  {care}
                </li>
              ))}
            </ul>
          </section>

          {/* 5. When to Consult a Doctor */}
          <section>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {t.symptoms.sections.consultDoctor}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {result.doctorRecommendation}
            </p>
          </section>

          {/* Educational Disclaimer */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
            {result.disclaimer}
          </div>
        </div>
      )}
    </div>
  );
}
