import {
  Calendar,
  Edit3,
  Eye,
  FolderHeart,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { translateRecordCategory } from '../i18n/index.ts';
import { apiRequest } from '../services/api.ts';
import type { HealthRecord, RecordCategory } from '../types/index.ts';

const CATEGORIES: RecordCategory[] = [
  'General health information',
  'Medical reports',
  'Doctor visits',
  'Allergies',
  'Vaccination records',
  'Other health documents',
];

export function HealthRecordsPage() {
  const { showToast } = useToast();
  const { t } = useLanguage();

  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | RecordCategory>('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HealthRecord | null>(null);
  const [viewingRecord, setViewingRecord] = useState<HealthRecord | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<RecordCategory>('General health information');
  const [recordDate, setRecordDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [providerOrSource, setProviderOrSource] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadRecords = async () => {
    try {
      const data = await apiRequest<{ records: HealthRecord[] }>('/api/records');
      setRecords(data.records);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.records.toasts.loadFailed, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, []);

  const openCreateModal = () => {
    setEditingRecord(null);
    setTitle('');
    setCategory('General health information');
    setRecordDate(new Date().toISOString().slice(0, 10));
    setProviderOrSource('');
    setNotes('');
    setFormOpen(true);
  };

  const openEditModal = (rec: HealthRecord) => {
    setEditingRecord(rec);
    setTitle(rec.title);
    setCategory(rec.category);
    setRecordDate(rec.recordDate);
    setProviderOrSource(rec.providerOrSource || '');
    setNotes(rec.notes || '');
    setFormOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2) {
      showToast(t.records.toasts.titleMinLength, 'error');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate.trim())) {
      showToast(t.records.toasts.dateInvalid, 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingRecord) {
        const res = await apiRequest<{ record: HealthRecord }>(
          `/api/records/${editingRecord.id}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              title: title.trim(),
              category,
              recordDate,
              providerOrSource: providerOrSource.trim(),
              notes: notes.trim(),
            }),
          }
        );
        setRecords((prev) => prev.map((r) => (r.id === editingRecord.id ? res.record : r)));
        showToast(t.records.toasts.updated, 'success');
      } else {
        const res = await apiRequest<{ record: HealthRecord }>('/api/records', {
          method: 'POST',
          body: JSON.stringify({
            title: title.trim(),
            category,
            recordDate,
            providerOrSource: providerOrSource.trim(),
            notes: notes.trim(),
          }),
        });
        setRecords((prev) => [res.record, ...prev]);
        showToast(t.records.toasts.saved, 'success');
      }
      setFormOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.records.toasts.saveFailed, 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/records/${deleteId}`, { method: 'DELETE' });
      setRecords((prev) => prev.filter((r) => r.id !== deleteId));
      showToast(t.records.toasts.deleted, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.records.toasts.deleteFailed, 'error');
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((rec) => {
      if (categoryFilter !== 'All' && rec.category !== categoryFilter) return false;
      if (dateFrom && rec.recordDate < dateFrom) return false;
      if (dateTo && rec.recordDate > dateTo) return false;
      if (q) {
        const localizedCat = translateRecordCategory(rec.category, t);
        const hay = `${rec.title} ${rec.category} ${localizedCat} ${rec.providerOrSource} ${rec.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, categoryFilter, dateFrom, dateTo, searchQuery, t]);

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            {t.records.title}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {t.records.subtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          <span>{t.records.addRecord}</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-12 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative md:col-span-4">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.records.searchPlaceholder}
            aria-label={t.records.searchAria}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="md:col-span-4">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'All' | RecordCategory)}
            aria-label={t.records.filterCategoryAria}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="All">{t.records.allCategories}</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {translateRecordCategory(cat, t)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 md:col-span-4">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label={t.records.fromDateAria}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <span className="text-xs text-slate-400">{t.common.to}</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label={t.records.toDateAria}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Records List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
          ))}
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <FolderHeart className="h-10 w-10 text-emerald-600/70 dark:text-emerald-400/70" />
          <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-white">
            {records.length === 0 ? t.records.emptyTitle : t.records.emptyNoMatchTitle}
          </h3>
          <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
            {records.length === 0 ? t.records.emptyBody : t.records.emptyNoMatchBody}
          </p>
          {records.length === 0 && (
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
              <span>{t.records.addFirstRecord}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {filteredRecords.map((rec) => (
            <div
              key={rec.id}
              className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  {rec.title}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {translateRecordCategory(rec.category, t)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                    <Calendar className="h-3 w-3" />
                    {rec.recordDate}
                  </span>
                  {rec.providerOrSource && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{rec.providerOrSource}</span>
                    </>
                  )}
                </div>
                {rec.notes && (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                    {rec.notes}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewingRecord(rec)}
                  aria-label={t.records.viewAria(rec.title)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>{t.common.view}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(rec)}
                  aria-label={t.records.editAria(rec.title)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>{t.common.edit}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteId(rec.id)}
                  aria-label={t.records.deleteAria(rec.title)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <form
            noValidate
            onSubmit={handleSave}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {editingRecord ? t.records.editModalTitle : t.records.addModalTitle}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label={t.records.closeModalAria}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="rec-title" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t.records.recordTitleLabel}
                </label>
                <input
                  id="rec-title"
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t.records.recordTitlePlaceholder}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="rec-cat" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t.records.categoryLabel}
                  </label>
                  <select
                    id="rec-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as RecordCategory)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {translateRecordCategory(cat, t)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="rec-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t.records.dateLabel}
                  </label>
                  <input
                    id="rec-date"
                    type="date"
                    required
                    value={recordDate}
                    onChange={(e) => setRecordDate(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="rec-provider" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t.records.providerLabel}{' '}
                  <span className="font-normal text-slate-400">({t.common.optional})</span>
                </label>
                <input
                  id="rec-provider"
                  type="text"
                  maxLength={120}
                  value={providerOrSource}
                  onChange={(e) => setProviderOrSource(e.target.value)}
                  placeholder={t.records.providerPlaceholder}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="rec-notes" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t.records.notesLabel}
                </label>
                <textarea
                  id="rec-notes"
                  rows={4}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t.records.notesPlaceholder}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving
                  ? t.common.saving
                  : editingRecord
                    ? t.common.saveChanges
                    : t.records.createRecord}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* View Detail Modal */}
      {viewingRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {viewingRecord.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {translateRecordCategory(viewingRecord.category, t)} · {viewingRecord.recordDate}
                  {viewingRecord.providerOrSource ? ` · ${viewingRecord.providerOrSource}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                aria-label={t.records.closeDetailsAria}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {viewingRecord.notes || t.records.noNotesRecorded}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  const rec = viewingRecord;
                  setViewingRecord(null);
                  openEditModal(rec);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t.common.edit}
              </button>
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title={t.records.deleteDialogTitle}
        description={t.records.deleteDialogDescription}
        confirmLabel={t.records.deleteDialogConfirm}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
