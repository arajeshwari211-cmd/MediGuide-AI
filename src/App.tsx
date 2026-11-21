import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { ToastProvider } from './components/Toast.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LanguageProvider, useLanguage } from './context/LanguageContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { AppLayout } from './layouts/AppLayout.tsx';
import { AssistantPage } from './pages/AssistantPage.tsx';
import { AuthPage } from './pages/AuthPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { HealthRecordsPage } from './pages/HealthRecordsPage.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { MedicineInfoPage } from './pages/MedicineInfoPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { PreventiveTipsPage } from './pages/PreventiveTipsPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { ReportExplainerPage } from './pages/ReportExplainerPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { SymptomInfoPage } from './pages/SymptomInfoPage.tsx';
import type { AppView } from './types/index.ts';

const VALID_VIEWS = new Set<AppView>([
  'dashboard',
  'assistant',
  'symptoms',
  'reports',
  'medicines',
  'records',
  'tips',
  'profile',
  'settings',
]);

function getInitialRoute(): {
  page: 'landing' | 'auth' | 'app' | '404';
  authMode: 'login' | 'register';
  view: AppView;
} {
  const path = window.location.pathname;
  if (path === '/' || path === '') {
    return { page: 'landing', authMode: 'login', view: 'dashboard' };
  }
  if (path === '/login') {
    return { page: 'auth', authMode: 'login', view: 'dashboard' };
  }
  if (path === '/register') {
    return { page: 'auth', authMode: 'register', view: 'dashboard' };
  }
  if (path.startsWith('/app')) {
    const sub = path.replace(/^\/app\/?/, '') as AppView;
    if (!sub) return { page: 'app', authMode: 'login', view: 'dashboard' };
    if (VALID_VIEWS.has(sub)) return { page: 'app', authMode: 'login', view: sub };
    return { page: '404', authMode: 'login', view: 'dashboard' };
  }
  return { page: '404', authMode: 'login', view: 'dashboard' };
}

function AppRouter() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const initial = getInitialRoute();

  const [publicPage, setPublicPage] = useState<'landing' | 'auth'>(
    initial.page === 'auth' ? 'auth' : initial.page === 'app' ? 'auth' : 'landing'
  );
  const [authMode, setAuthMode] = useState<'login' | 'register'>(initial.authMode);
  const [activeView, setActiveView] = useState<AppView>(initial.view);
  const [is404, setIs404] = useState(initial.page === '404');
  const prevUserRef = useRef<typeof user>(undefined);

  // Sync URL and route guards cleanly when auth state changes
  useEffect(() => {
    if (loading) return;

    const wasLoggedIn = Boolean(prevUserRef.current);
    const isLoggedIn = Boolean(user);
    prevUserRef.current = user;

    const path = window.location.pathname;

    if (isLoggedIn) {
      // Redirect from public routes or right after sign-in to the dashboard
      if (!wasLoggedIn || path === '/' || path === '/login' || path === '/register') {
        const targetView = path.startsWith('/app/') && VALID_VIEWS.has(activeView)
          ? activeView
          : 'dashboard';
        setActiveView(targetView);
        setIs404(false);
        if (path !== `/app/${targetView}`) {
          window.history.replaceState({}, '', `/app/${targetView}`);
        }
      }
    } else if (wasLoggedIn && !isLoggedIn) {
      // User just signed out or deleted account -> return to landing page
      setPublicPage('landing');
      setIs404(false);
      if (path.startsWith('/app')) {
        window.history.replaceState({}, '', '/');
      }
    } else if (!isLoggedIn && path.startsWith('/app')) {
      // Unauthenticated user hit a protected route -> guard with AuthPage
      setAuthMode('login');
      setPublicPage('auth');
    }
  }, [user, loading, activeView]);

  useEffect(() => {
    const onPopState = () => {
      const next = getInitialRoute();
      setIs404(next.page === '404');
      if (next.page === 'auth') {
        setAuthMode(next.authMode);
        setPublicPage('auth');
      } else if (next.page === 'landing') {
        setPublicPage('landing');
      } else if (next.page === 'app') {
        setActiveView(next.view);
        if (!user) {
          setAuthMode('login');
          setPublicPage('auth');
        }
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [user]);

  const navigateApp = (view: AppView) => {
    setIs404(false);
    setActiveView(view);
    window.history.pushState({}, '', `/app/${view}`);
  };

  const openAuth = (mode: 'login' | 'register') => {
    setIs404(false);
    setAuthMode(mode);
    setPublicPage('auth');
    window.history.pushState({}, '', mode === 'login' ? '/login' : '/register');
  };

  const goHome = () => {
    setIs404(false);
    if (user) {
      navigateApp('dashboard');
    } else {
      setPublicPage('landing');
      window.history.pushState({}, '', '/');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span>{t.common.loadingApp}</span>
        </div>
      </div>
    );
  }

  if (is404) {
    return <NotFoundPage onGoHome={goHome} />;
  }

  if (!user) {
    if (publicPage === 'auth') {
      return (
        <AuthPage
          initialMode={authMode}
          onBack={() => {
            setPublicPage('landing');
            window.history.pushState({}, '', '/');
          }}
        />
      );
    }
    return <LandingPage onOpenAuth={openAuth} />;
  }

  return (
    <AppLayout activeView={activeView} onNavigate={navigateApp}>
      {activeView === 'dashboard' && <DashboardPage onNavigate={navigateApp} />}
      {activeView === 'assistant' && <AssistantPage />}
      {activeView === 'symptoms' && <SymptomInfoPage />}
      {activeView === 'reports' && <ReportExplainerPage />}
      {activeView === 'medicines' && <MedicineInfoPage />}
      {activeView === 'records' && <HealthRecordsPage />}
      {activeView === 'tips' && (
        <ErrorBoundary sectionName={t.tips.sectionName}>
          <PreventiveTipsPage />
        </ErrorBoundary>
      )}
      {activeView === 'profile' && <ProfilePage />}
      {activeView === 'settings' && <SettingsPage />}
    </AppLayout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <LanguageProvider>
            <AppRouter />
          </LanguageProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
