import {
  Activity,
  ArrowRight,
  CheckCircle2,
  FileText,
  FolderHeart,
  HeartPulse,
  Languages,
  MessageSquareHeart,
  Moon,
  Pill,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import heroImage from '../assets/images/hero_healthcare_illustration_1794749455467.jpg';
import aboutImage from '../assets/images/about_sdg3_wellness_1794749455985.jpg';
import reportImage from '../assets/images/feature_report_explainer_1794749456025.jpg';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { BrandLogo } from '../components/BrandLogo.tsx';
import { useToast } from '../components/Toast.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { LANGUAGE_OPTIONS } from '../i18n/index.ts';
import { apiRequest } from '../services/api.ts';
import type { SupportedLanguage } from '../types/index.ts';

interface LandingPageProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
}

interface PublicStats {
  registeredUsers: number;
  savedRecords: number;
  analyzedReports: number;
  savedWellnessTips: number;
  aiModules: number;
}

export function LandingPage({ onOpenAuth }: LandingPageProps) {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { showToast } = useToast();

  const [stats, setStats] = useState<PublicStats | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [aboutImgFailed, setAboutImgFailed] = useState(false);
  const [reportImgFailed, setReportImgFailed] = useState(false);

  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactSent, setContactSent] = useState(false);

  const [legalModal, setLegalModal] = useState<'privacy' | 'disclaimer' | null>(null);

  useEffect(() => {
    apiRequest<PublicStats>('/api/public/stats')
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const handleContactSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = contactName.trim();
    const trimmedEmail = contactEmail.trim();
    const trimmedSubject = contactSubject.trim();
    const trimmedMessage = contactMessage.trim();

    if (trimmedName.length < 2) {
      showToast(t.landing.contactErrors.nameMin, 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      showToast(t.landing.contactErrors.emailInvalid, 'error');
      return;
    }
    if (trimmedSubject.length < 3) {
      showToast(t.landing.contactErrors.subjectMin, 'error');
      return;
    }
    if (trimmedMessage.length < 10) {
      showToast(t.landing.contactErrors.messageMin, 'error');
      return;
    }

    setContactSubmitting(true);
    try {
      await apiRequest('/api/contact', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          subject: trimmedSubject,
          message: trimmedMessage,
        }),
      });
      setContactSent(true);
      setContactName('');
      setContactEmail('');
      setContactSubject('');
      setContactMessage('');
      showToast(t.landing.contactSuccessToast, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.landing.contactErrorToast, 'error');
    } finally {
      setContactSubmitting(false);
    }
  };

  return (
    <div id="home" className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          <a href="#home" className="whitespace-nowrap shrink-0">
            <BrandLogo />
          </a>

          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex dark:text-slate-300">
            <a href="#home" className="whitespace-nowrap shrink-0 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400">
              {t.landing.navHome}
            </a>
            <a href="#about" className="whitespace-nowrap shrink-0 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400">
              {t.landing.navAbout}
            </a>
            <a href="#features" className="whitespace-nowrap shrink-0 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400">
              {t.landing.navFeatures}
            </a>
            <a href="#how-it-works" className="whitespace-nowrap shrink-0 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400">
              {t.landing.navHowItWorks}
            </a>
            <a href="#contact" className="whitespace-nowrap shrink-0 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400">
              {t.landing.navContact}
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative flex items-center">
              <Languages className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                aria-label={t.landing.languageLabel}
                className="h-9 rounded-lg border border-slate-200 bg-white py-1 pr-2.5 pl-8 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.nativeName}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? t.common.switchToDark : t.common.switchToLight}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="whitespace-nowrap shrink-0 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t.landing.login}
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('register')}
              className="whitespace-nowrap shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              {t.landing.getStarted}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-emerald-50/50 via-white to-white py-16 lg:py-24 dark:border-slate-900 dark:from-emerald-950/20 dark:via-slate-950 dark:to-slate-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-stretch gap-12 lg:grid-cols-12">
            <div className="flex flex-col justify-center lg:col-span-6">
              <p className="text-xs font-medium tracking-wide text-emerald-700 dark:text-emerald-400">
                {t.landing.heroBadge}
              </p>
              <h1
                className="mt-4 font-display font-bold tracking-tight text-slate-900 dark:text-white"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.6rem)', lineHeight: 1.1, textWrap: 'balance' }}
              >
                {t.landing.heroTitle}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-300">
                {t.landing.heroSubtitle}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  <span>{t.landing.getStarted}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <a
                  href="#features"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {t.landing.exploreFeatures}
                </a>
              </div>

              <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
                {t.landing.heroDisclaimer}
              </p>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full overflow-hidden rounded-2xl border border-slate-200 bg-emerald-50/40 dark:border-slate-800 dark:bg-slate-900">
                {!heroImgFailed ? (
                  <img
                    src={heroImage}
                    alt={t.landing.heroImgAlt}
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="h-full min-h-[300px] w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100 p-8 text-center dark:from-emerald-950/40 dark:to-slate-900">
                    <HeartPulse className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
                    <p className="mt-3 font-display text-lg font-semibold text-slate-800 dark:text-slate-200">
                      {t.landing.heroAltFallback}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Real Application Database Metrics (No fabricated stats) */}
          {stats && (
            <div className="mt-14 grid grid-cols-2 gap-6 border-t border-slate-200 pt-10 sm:grid-cols-4 dark:border-slate-800">
              <div>
                <div className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                  {stats.aiModules}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t.landing.stats.aiModules}
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                  {stats.registeredUsers}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t.landing.stats.activeAccounts}
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                  {stats.savedRecords}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t.landing.stats.savedRecords}
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                  {stats.analyzedReports}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t.landing.stats.analyzedReports}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Problem & SDG 3 Alignment */}
      <section id="about" className="border-b border-slate-100 py-20 dark:border-slate-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                {!aboutImgFailed ? (
                  <img
                    src={aboutImage}
                    alt={t.landing.aboutImgAlt}
                    referrerPolicy="no-referrer"
                    onError={() => setAboutImgFailed(true)}
                    className="aspect-[4/3] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-emerald-50 dark:bg-emerald-950/30">
                    <ShieldCheck className="h-12 w-12 text-emerald-600" />
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-7">
              <p className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
                {t.landing.aboutBadge}
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                {t.landing.aboutTitle}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600 dark:text-slate-300">
                {t.landing.aboutPara1}
              </p>
              <p className="mt-4 text-base leading-relaxed text-slate-600 dark:text-slate-300">
                {t.landing.aboutPara2}
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    {t.landing.aboutCard1Title}
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                    {t.landing.aboutCard1Body}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    {t.landing.aboutCard2Title}
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                    {t.landing.aboutCard2Body}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Modules Bento Grid */}
      <section id="features" className="border-b border-slate-100 bg-slate-50/70 py-20 dark:border-slate-900 dark:bg-slate-900/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
              {t.landing.featuresBadge}
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t.landing.featuresTitle}
            </h2>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {/* Highlighted Multimodal Report Card */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-2 lg:flex-row lg:items-center lg:gap-8 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <FileText className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold text-slate-900 dark:text-white">
                  {t.landing.features.reportTitle}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {t.landing.features.reportBody}
                </p>
              </div>
              <div className="mt-6 w-full shrink-0 overflow-hidden rounded-xl border border-slate-200 lg:mt-0 lg:w-64 dark:border-slate-800">
                {!reportImgFailed ? (
                  <img
                    src={reportImage}
                    alt={t.landing.reportImgAlt}
                    referrerPolicy="no-referrer"
                    onError={() => setReportImgFailed(true)}
                    className="aspect-[4/3] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-emerald-50 dark:bg-emerald-950/30">
                    <FileText className="h-8 w-8 text-emerald-600" />
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <MessageSquareHeart className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-xl font-semibold text-slate-900 dark:text-white">
                {t.landing.features.assistantTitle}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {t.landing.features.assistantBody}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <Activity className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-xl font-semibold text-slate-900 dark:text-white">
                {t.landing.features.symptomsTitle}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {t.landing.features.symptomsBody}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <Pill className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-xl font-semibold text-slate-900 dark:text-white">
                {t.landing.features.medicineTitle}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {t.landing.features.medicineBody}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <FolderHeart className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-xl font-semibold text-slate-900 dark:text-white">
                {t.landing.features.recordsTipsTitle}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {t.landing.features.recordsTipsBody}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="border-b border-slate-100 py-20 dark:border-slate-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
              {t.landing.howBadge}
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t.landing.howTitle}
            </h2>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
              <div className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {t.landing.steps.step1Num}
              </div>
              <h3 className="mt-3 font-display text-lg font-semibold text-slate-900 dark:text-white">
                {t.landing.steps.step1Title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {t.landing.steps.step1Body}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
              <div className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {t.landing.steps.step2Num}
              </div>
              <h3 className="mt-3 font-display text-lg font-semibold text-slate-900 dark:text-white">
                {t.landing.steps.step2Title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {t.landing.steps.step2Body}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
              <div className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {t.landing.steps.step3Num}
              </div>
              <h3 className="mt-3 font-display text-lg font-semibold text-slate-900 dark:text-white">
                {t.landing.steps.step3Title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {t.landing.steps.step3Body}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
                {t.landing.contactBadge}
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                {t.landing.contactTitle}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {t.landing.contactSubtitle}
              </p>

              <div className="mt-8 space-y-3 text-sm text-slate-600 dark:text-slate-400">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-200">
                    {t.landing.projectScopeLabel}
                  </span>{' '}
                  {t.landing.projectScopeValue}
                </div>
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-200">
                    {t.landing.supportEmailLabel}
                  </span>{' '}
                  support@mediguide-edu.example
                </div>
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-200">
                    {t.landing.emergenciesLabel}
                  </span>{' '}
                  {t.landing.emergenciesValue}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <form
                noValidate
                onSubmit={handleContactSubmit}
                className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900"
              >
                {contactSent && (
                  <div className="mb-6 flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{t.landing.contactSuccess}</span>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="contact-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t.landing.contactNameLabel}
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      required
                      minLength={2}
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder={t.landing.contactNamePlaceholder}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t.landing.contactEmailLabel}
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder={t.landing.contactEmailPlaceholder}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label htmlFor="contact-subject" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t.landing.contactSubjectLabel}
                  </label>
                  <input
                    id="contact-subject"
                    type="text"
                    required
                    minLength={3}
                    value={contactSubject}
                    onChange={(e) => setContactSubject(e.target.value)}
                    placeholder={t.landing.contactSubjectPlaceholder}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="mt-4">
                  <label htmlFor="contact-message" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t.landing.contactMessageLabel}
                  </label>
                  <textarea
                    id="contact-message"
                    required
                    minLength={10}
                    rows={4}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder={t.landing.contactMessagePlaceholder}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="mt-6 flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={contactSubmitting}
                    className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {contactSubmitting ? t.landing.contactSending : t.landing.contactSend}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 py-10 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div>
            <BrandLogo />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t.landing.footerTagline}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-slate-600 dark:text-slate-400">
            <button
              type="button"
              onClick={() => setLegalModal('privacy')}
              className="hover:text-emerald-600 dark:hover:text-emerald-400"
            >
              {t.landing.privacyPolicy}
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('disclaimer')}
              className="hover:text-emerald-600 dark:hover:text-emerald-400"
            >
              {t.landing.medicalDisclaimer}
            </button>
            <a href="#contact" className="hover:text-emerald-600 dark:hover:text-emerald-400">
              {t.landing.navContact}
            </a>
            <span className="text-slate-400 dark:text-slate-500">
              © {new Date().getFullYear()} {t.common.appName}
            </span>
          </div>
        </div>
      </footer>

      {/* Privacy & Disclaimer Modal */}
      {legalModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {legalModal === 'privacy'
                  ? t.landing.privacyModalTitle
                  : t.landing.disclaimerModalTitle}
              </h3>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                aria-label={t.common.close}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {legalModal === 'privacy'
                ? t.landing.privacyParagraphs.map((paragraph, idx) => <p key={idx}>{paragraph}</p>)
                : t.landing.disclaimerParagraphs.map((paragraph, idx) => (
                    <p key={idx}>{paragraph}</p>
                  ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
