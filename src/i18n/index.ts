import type { RecordCategory, SupportedLanguage } from '../types/index.ts';
import { en } from './en.ts';
import { hi } from './hi.ts';
import { kn } from './kn.ts';
import type { TranslationDictionary } from './types.ts';

export type { TranslationDictionary };

export const DICTIONARIES: Record<SupportedLanguage, TranslationDictionary> = {
  en,
  kn,
  hi,
};

export const LANGUAGE_OPTIONS: Array<{
  id: SupportedLanguage;
  nativeName: string;
}> = [
  { id: 'en', nativeName: 'English' },
  { id: 'kn', nativeName: 'ಕನ್ನಡ' },
  { id: 'hi', nativeName: 'हिन्दी' },
];

export function normalizeClientLanguage(value: unknown): SupportedLanguage {
  if (value === 'kn' || value === 'hi' || value === 'en') {
    return value;
  }
  return 'en';
}

export function getDateLocale(language: SupportedLanguage): string {
  if (language === 'kn') return 'kn-IN';
  if (language === 'hi') return 'hi-IN';
  return 'en-US';
}

export function translateRecordCategory(
  category: string,
  t: TranslationDictionary
): string {
  if (category in t.records.categories) {
    return t.records.categories[category as RecordCategory];
  }
  return category;
}

export function translateTipCategory(
  category: string,
  t: TranslationDictionary
): string {
  return t.tips.categories[category] ?? category;
}

export function translateLabStatus(
  status: string,
  t: TranslationDictionary
): string {
  if (status === 'Within Range') return t.reports.statuses.withinRange;
  if (status === 'High') return t.reports.statuses.high;
  if (status === 'Low') return t.reports.statuses.low;
  return t.reports.statuses.notSpecified;
}

const KNOWN_WELCOME_TITLES = new Set([
  en.notifications.welcomeTitle,
  kn.notifications.welcomeTitle,
  hi.notifications.welcomeTitle,
]);

const KNOWN_SAVED_TITLES = new Set([
  en.notifications.reportSavedTitle,
  kn.notifications.reportSavedTitle,
  hi.notifications.reportSavedTitle,
]);

const KNOWN_UPDATED_TITLES = new Set([
  en.notifications.reportUpdatedTitle,
  kn.notifications.reportUpdatedTitle,
  hi.notifications.reportUpdatedTitle,
]);

export function translateNotification(
  title: string,
  message: string,
  t: TranslationDictionary
): { title: string; message: string } {
  if (KNOWN_WELCOME_TITLES.has(title)) {
    return {
      title: t.notifications.welcomeTitle,
      message: t.notifications.welcomeMessage,
    };
  }
  if (KNOWN_SAVED_TITLES.has(title)) {
    return {
      title: t.notifications.reportSavedTitle,
      message: t.notifications.reportSavedMessage,
    };
  }
  if (KNOWN_UPDATED_TITLES.has(title)) {
    return {
      title: t.notifications.reportUpdatedTitle,
      message: t.notifications.reportUpdatedMessage,
    };
  }
  return { title, message };
}

export function translateActivityDescription(
  description: string,
  t: TranslationDictionary
): string {
  const a = t.dashboard.activities;
  if (description === 'Created MediGuide AI personal account') return a.createdAccount;
  if (description === 'Signed in to MediGuide AI') return a.signedIn;
  if (description === 'Updated profile or preferences') return a.updatedProfile;
  if (description === 'Changed account password') return a.changedPassword;
  if (description === 'Reset account password') return a.resetPassword;
  if (description === 'Deleted an AI health conversation') return a.deletedConsultation;
  if (description === 'Cleared all AI health conversation history') return a.clearedConsultations;
  if (description === 'Deleted a saved medical report summary') return a.deletedReportSummary;
  if (description === 'Deleted a health record') return a.deletedRecord;
  if (description === 'Removed a saved wellness tip') return a.removedTip;

  let m = description.match(/^Started AI consultation: "(.+)"$/);
  if (m) return a.startedConsultation(m[1]);

  m = description.match(/^Explored symptom information \((Mild|Moderate|Severe) severity\)$/);
  if (m) {
    const sevKey = m[1] as 'Mild' | 'Moderate' | 'Severe';
    return a.exploredSymptoms(t.symptoms.severityLevels[sevKey] ?? m[1]);
  }

  m = description.match(/^Saved medical report summary for "(.+)"$/);
  if (m) return a.savedReportSummary(m[1]);

  m = description.match(/^Updated saved medical report summary "(.+)"$/);
  if (m) return a.updatedReportSummary(m[1]);

  m = description.match(/^Analyzed medical report "(.+)" \(raw file discarded from memory\)$/);
  if (m) return a.analyzedReportDiscarded(m[1]);

  m = description.match(/^Searched medicine reference: "(.+)"$/);
  if (m) return a.searchedMedicine(m[1]);

  m = description.match(/^Added health record: "(.+)"$/);
  if (m) return a.addedRecord(m[1]);

  m = description.match(/^Updated health record: "(.+)"$/);
  if (m) return a.updatedRecord(m[1]);

  m = description.match(/^Generated preventive health tips for "(.+)"$/);
  if (m) return a.generatedTips(translateTipCategory(m[1], t));

  m = description.match(/^Saved wellness tip: "(.+)"$/);
  if (m) return a.savedTip(m[1]);

  return description;
}
