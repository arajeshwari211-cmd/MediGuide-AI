import {
  Activity,
  ArrowUpRight,
  FileText,
  FolderHeart,
  MessageSquareHeart,
  Pill,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import {
  getDateLocale,
  translateActivityDescription,
  translateRecordCategory,
} from '../i18n/index.ts';
import { apiRequest } from '../services/api.ts';
import type { AppView, DashboardData } from '../types/index.ts';

interface DashboardPageProps {
  onNavigate: (view: AppView) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiRequest<DashboardData>('/api/dashboard');
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error && err.message ? err.message : t.dashboard.unableToLoad);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [t.dashboard.unableToLoad]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/70" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
          <div className="h-72 animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        {error || t.dashboard.unableToLoad}
      </div>
    );
  }

  const statCards = [
    {
      label: t.dashboard.stats.savedRecords,
      value: data.counts.totalRecords,
      icon: FolderHeart,
      view: 'records' as AppView,
    },
    {
      label: t.dashboard.stats.savedReports,
      value: data.counts.totalReports,
      icon: FileText,
      view: 'reports' as AppView,
    },
    {
      label: t.dashboard.stats.aiConversations,
      value: data.counts.totalConversations,
      icon: MessageSquareHeart,
      view: 'assistant' as AppView,
    },
    {
      label: t.dashboard.stats.savedTips,
      value: data.counts.totalSavedTips,
      icon: Sparkles,
      view: 'tips' as AppView,
    },
  ];

  const shortcuts: Array<{
    title: string;
    subtitle: string;
    view: AppView;
    icon: typeof Activity;
  }> = [
    {
      title: t.dashboard.shortcuts.assistantTitle,
      subtitle: t.dashboard.shortcuts.assistantSubtitle,
      view: 'assistant',
      icon: MessageSquareHeart,
    },
    {
      title: t.dashboard.shortcuts.symptomsTitle,
      subtitle: t.dashboard.shortcuts.symptomsSubtitle,
      view: 'symptoms',
      icon: Activity,
    },
    {
      title: t.dashboard.shortcuts.reportsTitle,
      subtitle: t.dashboard.shortcuts.reportsSubtitle,
      view: 'reports',
      icon: FileText,
    },
    {
      title: t.dashboard.shortcuts.medicinesTitle,
      subtitle: t.dashboard.shortcuts.medicinesSubtitle,
      view: 'medicines',
      icon: Pill,
    },
  ];

  const dateLocale = getDateLocale(language);

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/80 via-white to-white p-6 sm:flex-row sm:items-center dark:border-emerald-900/50 dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t.dashboard.welcomeBack(user?.name || '')}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {t.dashboard.welcomeSubtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('records')}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          <span>{t.dashboard.addHealthRecord}</span>
        </button>
      </section>

      {/* Real Statistic Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.view}
              type="button"
              onClick={() => onNavigate(card.view)}
              className="group rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-700"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="font-mono text-3xl font-semibold tabular-nums text-slate-900 dark:text-white">
                  {card.value}
                </span>
                <ArrowUpRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-emerald-600 dark:text-slate-600" />
              </div>
            </button>
          );
        })}
      </section>

      {/* Charts from Stored Data */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {t.dashboard.recordsByCategoryTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.dashboard.recordsByCategorySubtitle}
              </p>
            </div>
          </div>

          {data.recordsByCategory.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 text-center dark:border-slate-800">
              <FolderHeart className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                {t.dashboard.noRecordsYet}
              </p>
              <button
                type="button"
                onClick={() => onNavigate('records')}
                className="mt-3 text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
              >
                {t.dashboard.addFirstRecord}
              </button>
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.recordsByCategory.map((r) => ({
                    name: translateRecordCategory(r.category, t),
                    count: r.count,
                  }))}
                  margin={{ top: 8, right: 12, left: -16, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar
                    name={t.dashboard.chartSeriesCount}
                    dataKey="count"
                    fill="#059669"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {t.dashboard.recentActivityTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.dashboard.recentActivitySubtitle}
            </p>
          </div>

          {data.activityByDay.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 text-center dark:border-slate-800">
              <Activity className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {t.dashboard.noActivityChartYet}
              </p>
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.activityByDay}
                  margin={{ top: 8, right: 12, left: -16, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    name={t.dashboard.chartSeriesCount}
                    dataKey="count"
                    stroke="#059669"
                    fill="#10b981"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Quick Access Modules */}
      <section>
        <h3 className="mb-3 font-display text-base font-semibold text-slate-900 dark:text-white">
          {t.dashboard.shortcutsTitle}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => onNavigate(item.view)}
                className="flex items-start gap-3.5 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/30 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-700"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {item.title}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {item.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent Reports, Recent Chats & Recent Activities */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              {t.dashboard.recentReportsTitle}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
            >
              {t.dashboard.openExplainer}
            </button>
          </div>
          {data.recentReports.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {t.dashboard.noSavedReports}
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {data.recentReports.map((r) => (
                <div
                  key={r.id}
                  className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0 dark:border-slate-800"
                >
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    {r.fileName}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                    {r.summary}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              {t.dashboard.recentConversationsTitle}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('assistant')}
              className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
            >
              {t.dashboard.openAssistant}
            </button>
          </div>
          {data.recentConversations.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {t.dashboard.noConversations}
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {data.recentConversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onNavigate('assistant')}
                  className="block w-full border-b border-slate-100 pb-3 text-left last:border-b-0 last:pb-0 hover:opacity-80 dark:border-slate-800"
                >
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    {c.title}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono tabular-nums">
                      {c.messageCount} {t.common.messagesUnit}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{new Date(c.updatedAt).toLocaleDateString(dateLocale)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              {t.dashboard.recentActivityLogTitle}
            </h3>
          </div>
          {data.recentActivities.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {t.dashboard.noActivityLog}
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {data.recentActivities.map((act) => (
                <div
                  key={act.id}
                  className="border-b border-slate-100 pb-2.5 text-xs last:border-b-0 last:pb-0 dark:border-slate-800"
                >
                  <div className="text-slate-700 dark:text-slate-300">
                    {translateActivityDescription(act.description, t)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                    {new Date(act.createdAt).toLocaleString(dateLocale)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
