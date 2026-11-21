export type SupportedLanguage = 'en' | 'kn' | 'hi';

export interface User {
  id: string;
  name: string;
  email: string;
  age: number | null;
  avatarUrl: string | null;
  preferences: string;
  theme: 'light' | 'dark';
  language: SupportedLanguage;
  notificationsEnabled: boolean;
  privacySaveReports: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RecordCategory =
  | 'General health information'
  | 'Medical reports'
  | 'Doctor visits'
  | 'Allergies'
  | 'Vaccination records'
  | 'Other health documents';

export interface HealthRecord {
  id: string;
  title: string;
  category: RecordCategory;
  recordDate: string;
  providerOrSource: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: string;
}

export interface SymptomAnalysisResult {
  reportedSummary: string;
  possibleExplanations: string[];
  warningSigns: string[];
  emergencyWarningSigns?: string[];
  promptMedicalSigns?: string[];
  emergencyGuidance: string;
  generalSelfCare: string[];
  doctorRecommendation: string;
  disclaimer: string;
}

export interface ExtractedLabTest {
  testName: string;
  reportedValue: string;
  unit: string;
  referenceRange: string;
  status: 'Within Range' | 'High' | 'Low' | 'Not Specified';
  explanation: string;
}

export interface MedicalReportExplanation {
  summary: string;
  tests: ExtractedLabTest[];
  questionsForDoctor: string[];
  labVarianceNote: string;
  disclaimer: string;
}

export interface SavedReportSummary {
  id: string;
  fileName: string;
  summary: string;
  tests: ExtractedLabTest[];
  questionsForDoctor: string[];
  createdAt: string;
}

export interface MedicineSource {
  title: string;
  organization: string;
  uri: string;
  retrievedAndUsed: boolean;
  retrievedAt?: string;
  excerpt?: string;
  sourceType?: 'official_monograph' | 'product_label' | 'web_reference';
  isProductSpecificLabel?: boolean;
}

export interface MedicineSupportingExcerpt {
  sourceTitle: string;
  organization: string;
  sourceUri: string;
  quote: string;
  retrievedAt?: string;
  isProductSpecificLabel?: boolean;
}

export interface MedicineSection {
  heading: string;
  contentMarkdown: string;
  supportingExcerpts: MedicineSupportingExcerpt[];
  verificationStatus: 'verified_from_sources' | 'general_knowledge';
}

export interface MedicineInfoResult {
  medicineName: string;
  markdownContent: string;
  sections?: MedicineSection[];
  groundingStatus: 'live_grounded' | 'live_source_retrieved' | 'general_knowledge';
  verificationNote: string;
  retrievedAt?: string;
  sources: MedicineSource[];
}

export interface GeneratedTip {
  title: string;
  category: string;
  content: string;
  actionableSteps: string[];
}

export interface SavedTip extends GeneratedTip {
  id: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  actionType: string;
  description: string;
  createdAt: string;
}

export interface DashboardData {
  counts: {
    totalRecords: number;
    totalReports: number;
    totalConversations: number;
    totalSavedTips: number;
  };
  recordsByCategory: Array<{ category: string; count: number }>;
  activityByDay: Array<{ date: string; count: number }>;
  recentReports: Array<{ id: string; fileName: string; summary: string; createdAt: string }>;
  recentConversations: Array<{ id: string; title: string; updatedAt: string; messageCount: number }>;
  recentActivities: ActivityItem[];
}

export type AppView =
  | 'dashboard'
  | 'assistant'
  | 'symptoms'
  | 'reports'
  | 'medicines'
  | 'records'
  | 'tips'
  | 'profile'
  | 'settings';
