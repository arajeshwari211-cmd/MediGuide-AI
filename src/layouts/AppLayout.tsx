import {
  Activity,
  AlertCircle,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  FileText,
  FolderHeart,
  Languages,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MessageSquareHeart,
  Moon,
  Pill,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  UserCircle,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BrandLogo } from '../components/BrandLogo.tsx';
import { useToast } from '../components/Toast.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { DICTIONARIES, getDateLocale, LANGUAGE_OPTIONS, translateNotification } from '../i18n/index.ts';
import { apiRequest, NOTIFICATIONS_UPDATED_EVENT } from '../services/api.ts';
import type { AppView, NotificationItem, SupportedLanguage } from '../types/index.ts';

interface AppLayoutProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  children: ReactNode;
}

interface SearchResults {
  records: Array<{ id: string; title: string; category: string; recordDate: string }>;
  conversations: Array<{ id: string; title: string; updatedAt: string }>;
  tips: Array<{ id: string; title: string; category: string; createdAt: string }>;
}

export function AppLayout({ activeView, onNavigate, children }: AppLayoutProps) {
  const { user, logout, updateProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { showToast } = useToast();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const notificationsEnabled = user?.notificationsEnabled ?? true;

  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const navItems: Array<{ id: AppView; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'assistant', label: t.nav.assistant, icon: MessageSquareHeart },
    { id: 'symptoms', label: t.nav.symptoms, icon: Activity },
    { id: 'reports', label: t.nav.reports, icon: FileText },
    { id: 'medicines', label: t.nav.medicines, icon: Pill },
    { id: 'records', label: t.nav.records, icon: FolderHeart },
    { id: 'tips', label: t.nav.tips, icon: Sparkles },
    { id: 'profile', label: t.nav.profile, icon: UserCircle },
    { id: 'settings', label: t.nav.settings, icon: Settings },
  ];

  const loadNotifs = useCallback(async () => {
    if (!notificationsEnabled) {
      setNotifications([]);
      setUnreadCount(0);
      setNotifError(null);
      setNotifLoading(false);
      return;
    }

    setNotifLoading(true);
    setNotifError(null);
    try {
      const data = await apiRequest<{
        notifications?: NotificationItem[];
        unreadCount?: number;
        notificationsEnabled?: boolean;
      }>('/api/notifications');

      if (data?.notificationsEnabled === false) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      const list = Array.isArray(data?.notifications) ? data.notifications : [];
      setNotifications(list);
      setUnreadCount(
        typeof data?.unreadCount === 'number'
          ? data.unreadCount
          : list.filter((n) => !n.isRead).length
      );
    } catch (err) {
      setNotifError(
        err instanceof Error && err.message ? err.message : t.layout.unableToLoadNotifications
      );
    } finally {
      setNotifLoading(false);
    }
  }, [notificationsEnabled, t.layout.unableToLoadNotifications]);

  useEffect(() => {
    void loadNotifs();
  }, [loadNotifs, activeView]);

  useEffect(() => {
    const onNotificationsUpdated = () => {
      void loadNotifs();
    };
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, onNotificationsUpdated);
    return () => {
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, onNotificationsUpdated);
    };
  }, [loadNotifs]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await apiRequest<SearchResults>(
          `/api/search?q=${encodeURIComponent(trimmed)}`
        );
        setSearchResults(data);
        setSearchOpen(true);
      } catch {
        setSearchResults(null);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const visibleUnreadCount = notificationsEnabled ? unreadCount : 0;

  const handleToggleNotifPanel = () => {
    setNotifOpen((prev) => {
      const next = !prev;
      if (next) {
        void loadNotifs();
      }
      return next;
    });
  };

  const handleMarkAsRead = async (id: string) => {
    if (markingId || markingAll) return;
    setMarkingId(id);
    try {
      await apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, {
        method: 'POST',
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      showToast(
        err instanceof Error && err.message ? err.message : t.layout.couldNotMarkRead,
        'error'
      );
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (markingAll || visibleUnreadCount === 0) return;
    setMarkingAll(true);
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      showToast(
        err instanceof Error && err.message ? err.message : t.layout.couldNotMarkAllRead,
        'error'
      );
    } finally {
      setMarkingAll(false);
    }
  };

  const formatNotifDateTime = (iso: string) => {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString(getDateLocale(language), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleThemeToggle = async () => {
    const next = theme === 'light' ? 'dark' : 'light';
    toggleTheme();
    try {
      await updateProfile({ theme: next });
    } catch {
      // keep local theme active even if network fails
    }
  };

  const handleHeaderLanguageChange = async (next: SupportedLanguage) => {
    if (next === language) return;
    setLanguage(next);
    const nextDict = DICTIONARIES[next] ?? DICTIONARIES.en;
    try {
      await updateProfile({ language: next });
      showToast(
        nextDict.settings.languageUpdatedToast(nextDict.settings.languageNames[next].native),
        'success'
      );
    } catch {
      showToast(nextDict.settings.languageLocalToast, 'info');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      showToast(t.layout.signedOutToast, 'info');
    } catch {
      showToast(t.layout.signOutErrorToast, 'error');
    }
  };

  const initials = (user?.name || 'U')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              onNavigate('dashboard');
              setMobileMenuOpen(false);
            }}
            className="text-left focus-visible:outline-2 focus-visible:outline-emerald-600"
          >
            <BrandLogo />
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label={t.layout.closeMenu}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-4 space-y-1 px-3" aria-label={t.layout.primaryNavLabel}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
            <ShieldAlert className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{t.layout.educationalNoticeTitle}</span>
          </div>
          <p className="mt-1">
            {t.layout.educationalNoticeBody}
          </p>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>{t.layout.logout}</span>
        </button>
      </div>
    </div>
  );

  const hasAnySearchResults =
    searchResults &&
    (searchResults.records.length > 0 ||
      searchResults.conversations.length > 0 ||
      searchResults.tips.length > 0);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
        <div className="sticky top-0 h-screen overflow-y-auto">{renderSidebarContent()}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-white shadow-xl dark:bg-slate-900">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label={t.layout.openMenu}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm">
              <span className="hidden text-slate-400 sm:inline dark:text-slate-500">
                {t.layout.workspace}
              </span>
              <span className="hidden text-slate-300 sm:inline dark:text-slate-700">/</span>
              <h1 className="truncate font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {t.nav[activeView]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Global Search */}
            <div ref={searchRef} className="relative hidden md:block">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchResults && setSearchOpen(true)}
                  placeholder={t.layout.searchPlaceholder}
                  aria-label={t.layout.searchLabel}
                  className="w-60 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none lg:w-72 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-500 dark:focus:bg-slate-900"
                />
              </div>

              {searchOpen && searchQuery.trim() && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {!hasAnySearchResults ? (
                    <p className="py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                      {t.layout.noSearchResults}
                    </p>
                  ) : (
                    <div className="space-y-3 text-xs">
                      {searchResults!.records.length > 0 && (
                        <div>
                          <div className="mb-1 font-semibold text-slate-500 dark:text-slate-400">
                            {t.layout.searchGroups.records}
                          </div>
                          {searchResults!.records.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                setSearchOpen(false);
                                onNavigate('records');
                              }}
                              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                                {r.title}
                              </span>
                              <span className="ml-2 shrink-0 font-mono text-slate-400">
                                {r.recordDate}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {searchResults!.conversations.length > 0 && (
                        <div>
                          <div className="mb-1 font-semibold text-slate-500 dark:text-slate-400">
                            {t.layout.searchGroups.conversations}
                          </div>
                          {searchResults!.conversations.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setSearchOpen(false);
                                onNavigate('assistant');
                              }}
                              className="block w-full truncate rounded-md px-2 py-1.5 text-left font-medium text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              {c.title}
                            </button>
                          ))}
                        </div>
                      )}
                      {searchResults!.tips.length > 0 && (
                        <div>
                          <div className="mb-1 font-semibold text-slate-500 dark:text-slate-400">
                            {t.layout.searchGroups.tips}
                          </div>
                          {searchResults!.tips.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setSearchOpen(false);
                                onNavigate('tips');
                              }}
                              className="block w-full truncate rounded-md px-2 py-1.5 text-left font-medium text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              {t.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Language Switcher */}
            <div className="relative flex items-center">
              <Languages className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              <select
                value={language}
                onChange={(e) => void handleHeaderLanguageChange(e.target.value as SupportedLanguage)}
                aria-label={t.layout.languageLabel}
                className="h-9 rounded-lg border border-slate-200 bg-white py-1 pr-2.5 pl-8 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.nativeName}
                  </option>
                ))}
              </select>
            </div>

            {/* Theme Switch */}
            <button
              type="button"
              onClick={handleThemeToggle}
              aria-label={theme === 'light' ? t.common.switchToDark : t.common.switchToLight}
              title={theme === 'light' ? t.common.switchToDark : t.common.switchToLight}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {/* Notifications */}
            <div ref={notifRef} className="relative">
              <button
                type="button"
                onClick={handleToggleNotifPanel}
                aria-label={
                  visibleUnreadCount > 0
                    ? t.layout.openNotificationsUnread(visibleUnreadCount)
                    : t.layout.openNotifications
                }
                aria-expanded={notifOpen}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Bell className="h-4 w-4" />
                {visibleUnreadCount > 0 && (
                  <span
                    data-testid="unread-notification-count"
                    className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 font-mono text-[10px] font-semibold text-white"
                  >
                    {visibleUnreadCount > 99 ? '99+' : visibleUnreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  role="dialog"
                  aria-label={t.layout.notificationsDialogLabel}
                  className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg sm:w-96 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {t.layout.notificationsTitle}
                      </span>
                      {visibleUnreadCount > 0 && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          {t.layout.unreadBadge(visibleUnreadCount)}
                        </span>
                      )}
                    </div>
                    {notificationsEnabled && visibleUnreadCount > 0 && (
                      <button
                        type="button"
                        disabled={markingAll}
                        onClick={() => void handleMarkAllRead()}
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50 dark:text-emerald-400"
                      >
                        {markingAll ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCheck className="h-3.5 w-3.5" />
                        )}
                        <span>{t.layout.markAllRead}</span>
                      </button>
                    )}
                  </div>

                  <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
                    {!notificationsEnabled ? (
                      <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        <Bell className="mx-auto mb-2 h-5 w-5 text-slate-400" />
                        <p>{t.layout.notificationsDisabledMessage}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            onNavigate('settings');
                          }}
                          className="mt-3 rounded-md border border-slate-200 px-3 py-1.5 font-medium text-emerald-600 hover:bg-slate-50 dark:border-slate-700 dark:text-emerald-400 dark:hover:bg-slate-800"
                        >
                          {t.layout.manageInSettings}
                        </button>
                      </div>
                    ) : notifLoading && notifications.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                        <span>{t.layout.loadingNotifications}</span>
                      </div>
                    ) : notifError ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                        <AlertCircle className="mx-auto mb-1.5 h-4 w-4" />
                        <p>{notifError}</p>
                        <button
                          type="button"
                          onClick={() => void loadNotifs()}
                          className="mt-2 inline-flex items-center gap-1 rounded border border-red-300 bg-white px-2.5 py-1 font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-slate-900 dark:text-red-300"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>{t.common.retry}</span>
                        </button>
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        <BookOpen className="mx-auto mb-2 h-5 w-5 text-slate-400" />
                        {t.layout.noNotificationsYet}
                      </div>
                    ) : (
                      notifications.map((n) => {
                        const timeLabel = formatNotifDateTime(n.createdAt);
                        const isMarkingThis = markingId === n.id;
                        const localizedNotif = translateNotification(n.title, n.message, t);
                        return (
                          <div
                            key={n.id}
                            className={`rounded-lg border p-3 text-xs transition-colors ${
                              n.isRead
                                ? 'border-slate-100 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400'
                                : 'border-emerald-200/80 bg-emerald-50/80 text-slate-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-slate-200'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5 font-semibold">
                                {!n.isRead && (
                                  <span
                                    aria-label={t.layout.unreadDotLabel}
                                    className="h-2 w-2 shrink-0 rounded-full bg-emerald-600 dark:bg-emerald-400"
                                  />
                                )}
                                <span>{localizedNotif.title}</span>
                              </div>
                              {!n.isRead && (
                                <button
                                  type="button"
                                  disabled={isMarkingThis || markingAll}
                                  onClick={() => void handleMarkAsRead(n.id)}
                                  className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                                >
                                  {isMarkingThis ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3 w-3" />
                                  )}
                                  <span>{t.layout.markAsRead}</span>
                                </button>
                              )}
                            </div>
                            <p className="mt-1 leading-relaxed">{localizedNotif.message}</p>
                            {timeLabel && (
                              <div className="mt-1.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                                {timeLabel}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Trigger */}
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white py-1 pr-3 pl-1.5 text-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  className="h-7 w-7 rounded-md object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 font-display text-xs font-semibold text-white">
                  {initials}
                </span>
              )}
              <span className="hidden max-w-28 truncate font-medium text-slate-800 sm:inline dark:text-slate-200">
                {user?.name}
              </span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
