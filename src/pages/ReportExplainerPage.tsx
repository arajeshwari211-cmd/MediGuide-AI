import {
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCircle2,
  Download,
  FileText,
  FileUp,
  Info,
  Loader2,
  Pencil,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { getDateLocale, translateLabStatus } from '../i18n/index.ts';
import { apiRequest, emitNotificationsUpdated } from '../services/api.ts';
import type { MedicalReportExplanation, SavedReportSummary } from '../types/index.ts';
import { downloadReportExplanationPdf } from '../utils/pdfExport.ts';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function resolveReportMimeType(file: File): (typeof ALLOWED_TYPES)[number] | null {
  const mime = (file.type || '').trim().toLowerCase();
  if (mime === 'application/pdf' || mime === 'application/x-pdf') {
    return 'application/pdf';
  }
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return 'image/jpeg';
  }
  if (mime === 'image/png') {
    return 'image/png';
  }
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.png')) return 'image/png';
  return null;
}

export function ReportExplainerPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { language, t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [resolvedMimeType, setResolvedMimeType] = useState<string>('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [saveSummary, setSaveSummary] = useState(user?.privacySaveReports ?? false);

  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState('');
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<MedicalReportExplanation | null>(null);
  const [discardedNotice, setDiscardedNotice] = useState(false);
  const [savingCurrentSummary, setSavingCurrentSummary] = useState(false);

  const [savedReports, setSavedReports] = useState<SavedReportSummary[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFileName, setEditFileName] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [updatingReport, setUpdatingReport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadSavedReports = async () => {
    try {
      const data = await apiRequest<{ reports: SavedReportSummary[] }>('/api/reports');
      setSavedReports(data.reports);
    } catch {
      // ignore initial error
    }
  };

  useEffect(() => {
    void loadSavedReports();
  }, []);

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setResolvedMimeType('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      clearSelectedFile();
      return;
    }
    const mimeType = resolveReportMimeType(file);
    if (!mimeType) {
      setError(t.reports.errors.unsupportedFormat);
      clearSelectedFile();
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(t.reports.errors.fileTooLarge);
      clearSelectedFile();
      return;
    }
    setSelectedFile(file);
    setResolvedMimeType(mimeType);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const commaIndex = result.indexOf(',');
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      };
      reader.onerror = () => reject(new Error(t.reports.errors.unableToExplain));
      reader.readAsDataURL(file);
    });

  const handleAnalyze = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedFile) {
      setError(t.reports.errors.selectFile);
      return;
    }
    if (!consentGiven) {
      setError(t.reports.errors.confirmConsent);
      return;
    }

    const mimeType = resolvedMimeType || resolveReportMimeType(selectedFile);
    if (!mimeType) {
      setError(t.reports.errors.unsupportedFormat);
      return;
    }

    const fileName = selectedFile.name;
    setExplanation(null);
    setActiveSavedId(null);
    setDiscardedNotice(false);
    setAnalyzing(true);
    try {
      const base64Data = await fileToBase64(selectedFile);
      const data = await apiRequest<{
        explanation: MedicalReportExplanation;
        savedId: string | null;
        discardedOriginalFile?: boolean;
      }>('/api/reports/explain', {
        method: 'POST',
        timeoutMs: 45000,
        body: JSON.stringify({
          fileName,
          mimeType,
          base64Data,
          consentGiven: true,
          saveSummary,
          language,
        }),
      });

      if (!data?.explanation || typeof data.explanation.summary !== 'string') {
        throw new Error(t.reports.errors.incompleteAnalysis);
      }

      const normalized: MedicalReportExplanation = {
        summary: data.explanation.summary,
        tests: Array.isArray(data.explanation.tests) ? data.explanation.tests : [],
        questionsForDoctor: Array.isArray(data.explanation.questionsForDoctor)
          ? data.explanation.questionsForDoctor
          : [],
        labVarianceNote:
          data.explanation.labVarianceNote || t.reports.defaultLabVarianceNote,
        disclaimer:
          data.explanation.disclaimer || t.reports.defaultDisclaimer,
      };

      setActiveFileName(fileName);
      setActiveSavedId(data.savedId ?? null);
      setExplanation(normalized);
      setDiscardedNotice(true);
      clearSelectedFile();

      if (data.savedId) {
        await loadSavedReports();
        emitNotificationsUpdated();
        showToast(t.reports.toasts.analyzedAndSaved, 'success');
      } else {
        showToast(t.reports.toasts.analyzedOnly, 'success');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t.reports.errors.unableToExplain;
      setError(message);
      showToast(message, 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveCurrentSummary = async () => {
    if (!explanation || !activeFileName || activeSavedId || savingCurrentSummary) return;
    setSavingCurrentSummary(true);
    try {
      const data = await apiRequest<{ report: SavedReportSummary }>('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          fileName: activeFileName,
          summary: explanation.summary,
          tests: explanation.tests,
          questionsForDoctor: explanation.questionsForDoctor,
        }),
      });
      setSavedReports((prev) => [data.report, ...prev]);
      setActiveSavedId(data.report.id);
      emitNotificationsUpdated();
      showToast(t.reports.toasts.summarySaved, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.reports.errors.couldNotSave, 'error');
    } finally {
      setSavingCurrentSummary(false);
    }
  };

  const startEditingReport = (item: SavedReportSummary) => {
    setEditingId(item.id);
    setEditFileName(item.fileName);
    setEditSummary(item.summary);
    setEditError(null);
  };

  const cancelEditingReport = () => {
    setEditingId(null);
    setEditFileName('');
    setEditSummary('');
    setEditError(null);
  };

  const handleUpdateSavedReport = async (e: FormEvent, item: SavedReportSummary) => {
    e.preventDefault();
    if (updatingReport) return;

    const trimmedName = editFileName.trim();
    const trimmedSummary = editSummary.trim();
    if (!trimmedName) {
      setEditError(t.reports.errors.reportNameRequired);
      return;
    }
    if (!trimmedSummary) {
      setEditError(t.reports.errors.summaryEmpty);
      return;
    }

    setEditError(null);
    setUpdatingReport(true);
    try {
      const data = await apiRequest<{ report: SavedReportSummary }>(
        `/api/reports/${encodeURIComponent(item.id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            fileName: trimmedName,
            summary: trimmedSummary,
          }),
        }
      );

      setSavedReports((prev) => prev.map((r) => (r.id === item.id ? data.report : r)));
      if (activeSavedId === item.id) {
        setActiveFileName(data.report.fileName);
        setExplanation((prev) => (prev ? { ...prev, summary: data.report.summary } : prev));
      }
      cancelEditingReport();
      emitNotificationsUpdated();
      showToast(t.reports.toasts.summaryUpdated, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.reports.errors.couldNotUpdate;
      setEditError(msg);
      showToast(msg, 'error');
    } finally {
      setUpdatingReport(false);
    }
  };

  const confirmDeleteSaved = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/reports/${deleteId}`, { method: 'DELETE' });
      setSavedReports((prev) => prev.filter((r) => r.id !== deleteId));
      if (activeSavedId === deleteId) {
        setActiveSavedId(null);
      }
      if (editingId === deleteId) {
        cancelEditingReport();
      }
      showToast(t.reports.toasts.summaryDeleted, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.reports.errors.deleteFailed, 'error');
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const renderStatusLabel = (status: string) => {
    const label = translateLabStatus(status, t);
    if (status === 'Within Range') {
      return (
        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>{label}</span>
        </span>
      );
    }
    if (status === 'High' || status === 'Low') {
      return (
        <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{label}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>{label}</span>
      </span>
    );
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Upload & Consent Form */}
        <form
          onSubmit={handleAnalyze}
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              {t.reports.uploadTitle}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {t.reports.uploadSubtitle}
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-6 text-center transition-colors hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-emerald-600">
            <FileUp className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            <span className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              {selectedFile ? selectedFile.name : t.reports.clickToSelect}
            </span>
            <span className="mt-1 font-mono text-xs text-slate-400">
              {selectedFile
                ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                : t.reports.upTo10Mb}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf,image/jpeg,image/png"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>

          {/* Privacy Consent Checkboxes */}
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-800/50">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="leading-relaxed text-slate-700 dark:text-slate-300">
                <strong>{t.reports.requiredConsentPrefix}</strong> {t.reports.requiredConsentBody}
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={saveSummary}
                onChange={(e) => setSaveSummary(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="leading-relaxed text-slate-600 dark:text-slate-400">
                {t.reports.optionalSaveLabel}
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={analyzing || !selectedFile || !consentGiven}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t.reports.analyzingButton}</span>
              </>
            ) : (
              <span>{t.reports.explainButton}</span>
            )}
          </button>
        </form>

        {/* Explanation Result */}
        <div className="lg:col-span-7">
          {!explanation && !analyzing && !error && (
            <div className="flex h-full min-h-[380px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
              <FileText className="h-10 w-10 text-emerald-600/70 dark:text-emerald-400/70" />
              <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-white">
                {t.reports.emptyTitle}
              </h3>
              <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
                {t.reports.emptyBody}
              </p>
            </div>
          )}

          {!explanation && !analyzing && error && (
            <div className="flex h-full min-h-[380px] flex-col items-center justify-center rounded-xl border border-red-200 bg-white p-8 text-center dark:border-red-900/60 dark:bg-slate-900">
              <AlertCircle className="h-10 w-10 text-red-500 dark:text-red-400" />
              <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-white">
                {t.reports.breakdownTitle}
              </h3>
              <p className="mt-2 max-w-md text-sm text-red-600 dark:text-red-300">
                {error}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {t.reports.errorHelp}
              </p>
            </div>
          )}

          {analyzing && (
            <div className="flex h-full min-h-[380px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                {t.reports.analyzingStateText}
              </p>
            </div>
          )}

          {explanation && !analyzing && (
            <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                  <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {t.reports.breakdownTitle}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {activeFileName}
                    {discardedNotice && ` · ${t.reports.discardedNotice}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={Boolean(activeSavedId) || savingCurrentSummary}
                    onClick={() => void handleSaveCurrentSummary()}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-70 ${
                      activeSavedId
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {savingCurrentSummary ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t.common.saving}</span>
                      </>
                    ) : activeSavedId ? (
                      <>
                        <BookmarkCheck className="h-4 w-4" />
                        <span>{t.common.saved}</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="h-4 w-4" />
                        <span>{t.reports.saveSummary}</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadReportExplanationPdf(activeFileName, explanation, { language, t })
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950"
                  >
                    <Download className="h-4 w-4" />
                    <span>{t.reports.downloadPdf}</span>
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {t.reports.summaryHeading}
                </h4>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                  {explanation.summary}
                </p>
              </div>

              {/* Clean Test Table */}
              {explanation.tests.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">{t.reports.tableHeaders.test}</th>
                        <th className="px-3 py-2.5 font-semibold">{t.reports.tableHeaders.value}</th>
                        <th className="px-3 py-2.5 font-semibold">{t.reports.tableHeaders.unit}</th>
                        <th className="px-3 py-2.5 font-semibold">{t.reports.tableHeaders.refRange}</th>
                        <th className="px-3 py-2.5 font-semibold">{t.reports.tableHeaders.status}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {explanation.tests.map((test, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="px-3 py-3 align-top">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {test.testName}
                            </div>
                            <div className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                              {test.explanation}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                            {test.reportedValue}
                          </td>
                          <td className="px-3 py-3 align-top font-mono text-slate-500 dark:text-slate-400">
                            {test.unit}
                          </td>
                          <td className="px-3 py-3 align-top font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {test.referenceRange}
                          </td>
                          <td className="px-3 py-3 align-top whitespace-nowrap">
                            {renderStatusLabel(test.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  {t.reports.noStructuredTests}
                </div>
              )}

              {explanation.questionsForDoctor.length > 0 && (
                <div>
                  <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    {t.reports.questionsForDoctor}
                  </h4>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
                    {explanation.questionsForDoctor.map((q, idx) => (
                      <li key={idx}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2 rounded-lg bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{t.reports.labNoteHeading}</span>
                </div>
                <p>{explanation.labVarianceNote}</p>
                <p>{explanation.disclaimer}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Saved Summaries */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          {t.reports.savedSectionTitle}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {t.reports.savedSectionSubtitle}
        </p>

        {savedReports.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {t.reports.noSavedSummaries}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {savedReports.map((item) => {
              const isEditing = editingId === item.id;
              return (
                <div key={item.id} className="py-4">
                  {isEditing ? (
                    <form
                      noValidate
                      onSubmit={(e) => void handleUpdateSavedReport(e, item)}
                      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40"
                    >
                      <div>
                        <label
                          htmlFor={`edit-name-${item.id}`}
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                        >
                          {t.reports.reportNameLabel}
                        </label>
                        <input
                          id={`edit-name-${item.id}`}
                          type="text"
                          value={editFileName}
                          onChange={(e) => setEditFileName(e.target.value)}
                          disabled={updatingReport}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`edit-summary-${item.id}`}
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                        >
                          {t.reports.reportSummaryLabel}
                        </label>
                        <textarea
                          id={`edit-summary-${item.id}`}
                          rows={3}
                          value={editSummary}
                          onChange={(e) => setEditSummary(e.target.value)}
                          disabled={updatingReport}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                      {editError && (
                        <p className="text-xs text-red-600 dark:text-red-400">{editError}</p>
                      )}
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={updatingReport}
                          onClick={cancelEditingReport}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>{t.common.cancel}</span>
                        </button>
                        <button
                          type="submit"
                          disabled={updatingReport}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {updatingReport ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          <span>{updatingReport ? t.common.saving : t.common.saveChanges}</span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                          <span className="truncate">{item.fileName}</span>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                            ·
                          </span>
                          <span className="shrink-0 font-mono text-xs font-normal text-slate-400">
                            {new Date(item.createdAt).toLocaleDateString(getDateLocale(language))}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                          {item.summary}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setDiscardedNotice(false);
                            setActiveFileName(item.fileName);
                            setActiveSavedId(item.id);
                            setExplanation({
                              summary: item.summary,
                              tests: item.tests,
                              questionsForDoctor: item.questionsForDoctor,
                              labVarianceNote: t.reports.defaultLabVarianceNote,
                              disclaimer: t.reports.defaultDisclaimer,
                            });
                          }}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {t.common.view}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditingReport(item)}
                          aria-label={t.reports.editAria(item.fileName)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>{t.common.edit}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadReportExplanationPdf(
                              item.fileName,
                              {
                                summary: item.summary,
                                tests: item.tests,
                                questionsForDoctor: item.questionsForDoctor,
                                labVarianceNote: t.reports.defaultLabVarianceNote,
                                disclaimer: t.reports.defaultDisclaimer,
                              },
                              { language, t }
                            )
                          }
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-slate-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                        >
                          {t.reports.pdfButton}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(item.id)}
                          aria-label={t.reports.deleteAria(item.fileName)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={deleteId !== null}
        title={t.reports.deleteDialogTitle}
        description={t.reports.deleteDialogDescription}
        confirmLabel={t.common.delete}
        loading={deleting}
        onConfirm={confirmDeleteSaved}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
