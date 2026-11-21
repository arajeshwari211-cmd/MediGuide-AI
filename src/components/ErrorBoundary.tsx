import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { DICTIONARIES, normalizeClientLanguage } from '../i18n/index.ts';

interface ErrorBoundaryProps {
  children: ReactNode;
  sectionName?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

function getActiveDictionary() {
  try {
    const langAttr = document.documentElement.lang || localStorage.getItem('mg_language');
    return DICTIONARIES[normalizeClientLanguage(langAttr)];
  } catch {
    return DICTIONARIES.en;
  }
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || '',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.sectionName ?? 'Module'}]`, error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      const t = getActiveDictionary();
      const displayMessage = this.state.errorMessage || t.errorBoundary.unexpectedFallback;
      return (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900/60 dark:bg-slate-900"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div className="flex-1">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {this.props.sectionName
                  ? t.errorBoundary.titleWithSection(this.props.sectionName)
                  : t.errorBoundary.titleGeneric}
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {t.errorBoundary.body}
              </p>
              <p className="mt-2 rounded-lg border border-red-100 bg-red-50/70 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                {displayMessage}
              </p>
              <button
                type="button"
                onClick={this.handleReset}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{t.common.tryAgain}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
