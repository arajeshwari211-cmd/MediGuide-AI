import { normalizeLanguage, type SupportedLanguage } from './auth.ts';

export interface ServerMessages {
  contactInvalid: string;
  contactSaved: string;
  registerName: string;
  registerEmail: string;
  registerPassword: string;
  registerEmailExists: string;
  registerAge: string;
  loginInvalidInput: string;
  loginInvalidCredentials: string;
  forgotEmail: string;
  forgotNotFound: string;
  forgotSuccess: string;
  resetInvalidInput: string;
  resetInvalidEmailOrCode: string;
  resetCodeExpired: string;
  resetSuccess: string;
  profileName: string;
  profileAge: string;
  profileAvatar: string;
  profilePreferences: string;
  profileTheme: string;
  profileLanguage: string;
  changePasswordInvalidInput: string;
  changePasswordWrongCurrent: string;
  changePasswordSuccess: string;
  deletePasswordRequired: string;
  deleteWrongPassword: string;
  notifInvalidId: string;
  notifNotFound: string;
  assistantInvalidMsg: string;
  assistantConvoNotFound: string;
  symptomsInvalidInput: string;
  reportName: string;
  reportSummaryRequired: string;
  reportSummaryCannotBeEmpty: string;
  reportInvalidId: string;
  reportNotFound: string;
  reportConsentRequired: string;
  reportInvalidFile: string;
  reportFileTooLarge: string;
  medicineInvalidName: string;
  recordTitle: string;
  recordCategory: string;
  recordDate: string;
  recordNotFound: string;
  tipsInvalidCategory: string;
  tipsEmptyFromAi: string;
  tipsSaveRequired: string;
  tipsNotFound: string;
  endpointNotFound: string;
  geminiTimeout: string;
  geminiKeyInvalid: string;
  geminiRateLimit: string;
  geminiModelUnavailable: string;
  geminiOverloaded: string;
  geminiInvalidDocument: string;
  geminiNetworkError: string;
  geminiGenericError: string;
  geminiNotConfigured: string;
}

const MESSAGES: Record<SupportedLanguage, ServerMessages> = {
  en: {
    contactInvalid:
      'Please provide a valid name, email address, subject (min 3 chars), and message (min 10 chars).',
    contactSaved: 'Your message has been recorded. Thank you for reaching out to MediGuide AI.',
    registerName: 'Name must be between 2 and 80 characters.',
    registerEmail: 'Please enter a valid email address.',
    registerPassword: 'Password must be at least 8 characters long.',
    registerEmailExists: 'An account with this email already exists.',
    registerAge: 'If provided, age must be a whole number between 1 and 120.',
    loginInvalidInput: 'Please provide a valid email and password.',
    loginInvalidCredentials: 'Invalid email or password.',
    forgotEmail: 'Please provide a valid email address.',
    forgotNotFound: 'No account found with that email address.',
    forgotSuccess:
      'No external email provider is attached in this local runtime. Use the verification code below within 15 minutes to reset your password.',
    resetInvalidInput:
      'Provide your email, 6-digit verification code, and a new password (min 8 characters).',
    resetInvalidEmailOrCode: 'Invalid email or verification code.',
    resetCodeExpired: 'Verification code is invalid or expired.',
    resetSuccess: 'Password updated successfully. You can now sign in.',
    profileName: 'Name must be between 2 and 80 characters.',
    profileAge: 'Age must be between 1 and 120.',
    profileAvatar: 'Avatar image data is too large (max ~150KB).',
    profilePreferences: 'Preferences must be under 500 characters.',
    profileTheme: 'Theme must be light or dark.',
    profileLanguage: 'Language must be en, kn, or hi.',
    changePasswordInvalidInput:
      'Provide your current password and a new password of at least 8 characters.',
    changePasswordWrongCurrent: 'Current password is incorrect.',
    changePasswordSuccess: 'Password changed successfully.',
    deletePasswordRequired: 'Please confirm your password to delete your account.',
    deleteWrongPassword: 'Incorrect password.',
    notifInvalidId: 'Invalid notification ID.',
    notifNotFound: 'Notification not found.',
    assistantInvalidMsg: 'Please enter a health question (2 to 2000 characters).',
    assistantConvoNotFound: 'Conversation not found.',
    symptomsInvalidInput:
      'Please enter your symptoms, duration, and severity (Mild, Moderate, or Severe).',
    reportName: 'Report name must be between 1 and 200 characters.',
    reportSummaryRequired: 'Report summary text is required (max 10,000 characters).',
    reportSummaryCannotBeEmpty: 'Report summary text cannot be empty (max 10,000 characters).',
    reportInvalidId: 'Invalid report summary ID.',
    reportNotFound: 'Saved report summary not found.',
    reportConsentRequired:
      'Explicit user consent is required before processing your uploaded medical document.',
    reportInvalidFile: 'Please upload a valid PDF, JPG, or PNG medical report.',
    reportFileTooLarge: 'Uploaded file exceeds the 10MB security limit.',
    medicineInvalidName: 'Please enter a valid medicine name (2 to 100 characters).',
    recordTitle: 'Title must be between 2 and 120 characters.',
    recordCategory: 'Please select a valid record category.',
    recordDate: 'Please select a valid date (YYYY-MM-DD).',
    recordNotFound: 'Health record not found.',
    tipsInvalidCategory: 'Please select a valid wellness category.',
    tipsEmptyFromAi: 'The AI service returned no wellness suggestions. Please try again.',
    tipsSaveRequired: 'Tip category, title, and content are required.',
    tipsNotFound: 'Saved tip not found.',
    endpointNotFound: 'API endpoint not found.',
    geminiTimeout: 'The AI service took too long to respond (timeout). Please try again.',
    geminiKeyInvalid:
      'Gemini API key is invalid or lacks permission. Please verify your key in Settings > Secrets.',
    geminiRateLimit: 'AI service quota or rate limit reached. Please wait a moment and try again.',
    geminiModelUnavailable: 'Selected AI service model is currently unavailable.',
    geminiOverloaded:
      'The AI service is temporarily experiencing high demand. Please try again in a few moments.',
    geminiInvalidDocument:
      'Unable to read the uploaded document. Please ensure it is a clear, unencrypted PDF, JPG, or PNG file.',
    geminiNetworkError:
      'Network error communicating with the Gemini AI service. Please try again.',
    geminiGenericError: 'Unable to process AI request. Please try again.',
    geminiNotConfigured:
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.',
  },
  kn: {
    contactInvalid:
      'ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ಹೆಸರು, ಇಮೇಲ್ ವಿಳಾಸ, ವಿಷಯ (ಕನಿಷ್ಠ 3 ಅಕ್ಷರಗಳು) ಮತ್ತು ಸಂದೇಶವನ್ನು (ಕನಿಷ್ಠ 10 ಅಕ್ಷರಗಳು) ನಮೂದಿಸಿ.',
    contactSaved: 'ನಿಮ್ಮ ಸಂದೇಶವನ್ನು ದಾಖಲಿಸಲಾಗಿದೆ. MediGuide AI ಅನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು.',
    registerName: 'ಹೆಸರು 2 ರಿಂದ 80 ಅಕ್ಷರಗಳ ನಡುವೆ ಇರಬೇಕು.',
    registerEmail: 'ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ಇಮೇಲ್ ವಿಳಾಸವನ್ನು ನಮೂದಿಸಿ.',
    registerPassword: 'ಪಾಸ್‌ವರ್ಡ್ ಕನಿಷ್ಠ 8 ಅಕ್ಷರಗಳಷ್ಟು ಉದ್ದವಾಗಿರಬೇಕು.',
    registerEmailExists: 'ಈ ಇಮೇಲ್ ವಿಳಾಸದೊಂದಿಗೆ ಖಾತೆ ಈಗಾಗಲೇ ಅಸ್ತಿತ್ವದಲ್ಲಿದೆ.',
    registerAge: 'ನಮೂದಿಸಿದರೆ, ವಯಸ್ಸು 1 ಮತ್ತು 120 ರ ನಡುವಿನ ಪೂರ್ಣ ಸಂಖ್ಯೆಯಾಗಿರಬೇಕು.',
    loginInvalidInput: 'ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ಇಮೇಲ್ ಮತ್ತು ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ.',
    loginInvalidCredentials: 'ತಪ್ಪಾದ ಇಮೇಲ್ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್.',
    forgotEmail: 'ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ಇಮೇಲ್ ವಿಳಾಸವನ್ನು ನಮೂದಿಸಿ.',
    forgotNotFound: 'ಆ ಇಮೇಲ್ ವಿಳಾಸದೊಂದಿಗೆ ಯಾವುದೇ ಖಾತೆ ಕಂಡುಬಂದಿಲ್ಲ.',
    forgotSuccess:
      'ಈ ಸ್ಥಳೀಯ ರನ್‌ಟೈಮ್‌ನಲ್ಲಿ ಯಾವುದೇ ಬಾಹ್ಯ ಇಮೇಲ್ ಸೇವೆಯನ್ನು ಜೋಡಿಸಲಾಗಿಲ್ಲ. ನಿಮ್ಮ ಪಾಸ್‌ವರ್ಡ್ ಮರುಹೊಂದಿಸಲು 15 ನಿಮಿಷಗಳ ಒಳಗೆ ಕೆಳಗಿನ ಪರಿಶೀಲನಾ ಕೋಡ್ ಬಳಸಿ.',
    resetInvalidInput:
      'ನಿಮ್ಮ ಇಮೇಲ್, 6-ಅಂಕಿಯ ಪರಿಶೀಲನಾ ಕೋಡ್ ಮತ್ತು ಹೊಸ ಪಾಸ್‌ವರ್ಡ್ (ಕನಿಷ್ಠ 8 ಅಕ್ಷರಗಳು) ನಮೂದಿಸಿ.',
    resetInvalidEmailOrCode: 'ತಪ್ಪಾದ ಇಮೇಲ್ ಅಥವಾ ಪರಿಶೀಲನಾ ಕೋಡ್.',
    resetCodeExpired: 'ಪರಿಶೀಲನಾ ಕೋಡ್ ಅಮಾನ್ಯವಾಗಿದೆ ಅಥವಾ ಅವಧಿ ಮೀರಿದೆ.',
    resetSuccess: 'ಪಾಸ್‌ವರ್ಡ್ ಯಶಸ್ವಿಯಾಗಿ ನವೀಕರಿಸಲಾಗಿದೆ. ನೀವು ಈಗ ಸೈನ್ ಇನ್ ಮಾಡಬಹುದು.',
    profileName: 'ಹೆಸರು 2 ರಿಂದ 80 ಅಕ್ಷರಗಳ ನಡುವೆ ಇರಬೇಕು.',
    profileAge: 'ವಯಸ್ಸು 1 ಮತ್ತು 120 ರ ನಡುವೆ ಇರಬೇಕು.',
    profileAvatar: 'ಪ್ರೊಫೈಲ್ ಚಿತ್ರದ ಡೇಟಾ ತುಂಬಾ ದೊಡ್ಡದಾಗಿದೆ (ಗರಿಷ್ಠ ~150KB).',
    profilePreferences: 'ಆದ್ಯತೆಗಳು 500 ಅಕ್ಷರಗಳಿಗಿಂತ ಕಡಿಮೆಯಿರಬೇಕು.',
    profileTheme: 'ಥೀಮ್ ಲೈಟ್ ಅಥವಾ ಡಾರ್ಕ್ ಆಗಿರಬೇಕು.',
    profileLanguage: 'ಭಾಷೆ en, kn, ಅಥವಾ hi ಆಗಿರಬೇಕು.',
    changePasswordInvalidInput:
      'ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಪಾಸ್‌ವರ್ಡ್ ಮತ್ತು ಕನಿಷ್ಠ 8 ಅಕ್ಷರಗಳ ಹೊಸ ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ.',
    changePasswordWrongCurrent: 'ಪ್ರಸ್ತುತ ಪಾಸ್‌ವರ್ಡ್ ತಪ್ಪಾಗಿದೆ.',
    changePasswordSuccess: 'ಪಾಸ್‌ವರ್ಡ್ ಯಶಸ್ವಿಯಾಗಿ ಬದಲಾಯಿಸಲಾಗಿದೆ.',
    deletePasswordRequired: 'ನಿಮ್ಮ ಖಾತೆಯನ್ನು ಅಳಿಸಲು ದಯವಿಟ್ಟು ಪಾಸ್‌ವರ್ಡ್ ದೃಢೀಕರಿಸಿ.',
    deleteWrongPassword: 'ತಪ್ಪಾದ ಪಾಸ್‌ವರ್ಡ್.',
    notifInvalidId: 'ಅಮಾನ್ಯ ಸೂಚನೆ ಗುರುತು.',
    notifNotFound: 'ಸೂಚನೆ ಕಂಡುಬಂದಿಲ್ಲ.',
    assistantInvalidMsg: 'ದಯವಿಟ್ಟು ಆರೋಗ್ಯ ಪ್ರಶ್ನೆಯನ್ನು ನಮೂದಿಸಿ (2 ರಿಂದ 2000 ಅಕ್ಷರಗಳು).',
    assistantConvoNotFound: 'ಸಂಭಾಷಣೆ ಕಂಡುಬಂದಿಲ್ಲ.',
    symptomsInvalidInput:
      'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಲಕ್ಷಣಗಳು, ಅವಧಿ ಮತ್ತು ತೀವ್ರತೆಯನ್ನು (ಸೌಮ್ಯ, ಮಧ್ಯಮ, ಅಥವಾ ತೀವ್ರ) ನಮೂದಿಸಿ.',
    reportName: 'ವರದಿಯ ಹೆಸರು 1 ರಿಂದ 200 ಅಕ್ಷರಗಳ ನಡುವೆ ಇರಬೇಕು.',
    reportSummaryRequired: 'ವರದಿ ಸಾರಾಂಶ ಪಠ್ಯ ಅಗತ್ಯವಿದೆ (ಗರಿಷ್ಠ 10,000 ಅಕ್ಷರಗಳು).',
    reportSummaryCannotBeEmpty: 'ವರದಿ ಸಾರಾಂಶ ಪಠ್ಯ ಖಾಲಿಯಾಗಿರಬಾರದು (ಗರಿಷ್ಠ 10,000 ಅಕ್ಷರಗಳು).',
    reportInvalidId: 'ಅಮಾನ್ಯ ವರದಿ ಸಾರಾಂಶ ಗುರುತು.',
    reportNotFound: 'ಉಳಿಸಿದ ವರದಿ ಸಾರಾಂಶ ಕಂಡುಬಂದಿಲ್ಲ.',
    reportConsentRequired:
      'ನಿಮ್ಮ ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ವೈದ್ಯಕೀಯ ದಾಖಲೆಯನ್ನು ಪ್ರಕ್ರಿಯೆಗೊಳಿಸುವ ಮೊದಲು ಸ್ಪಷ್ಟ ಬಳಕೆದಾರರ ಸಮ್ಮತಿ ಅಗತ್ಯವಿದೆ.',
    reportInvalidFile: 'ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ PDF, JPG, ಅಥವಾ PNG ವೈದ್ಯಕೀಯ ವರದಿಯನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.',
    reportFileTooLarge: 'ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ಫೈಲ್ 10MB ಸುರಕ್ಷತಾ ಮಿತಿಯನ್ನು ಮೀರಿದೆ.',
    medicineInvalidName: 'ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ಔಷಧಿಯ ಹೆಸರನ್ನು ನಮೂದಿಸಿ (2 ರಿಂದ 100 ಅಕ್ಷರಗಳು).',
    recordTitle: 'ಶೀರ್ಷಿಕೆಯು 2 ರಿಂದ 120 ಅಕ್ಷರಗಳ ನಡುವೆ ಇರಬೇಕು.',
    recordCategory: 'ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ದಾಖಲೆ ವರ್ಗವನ್ನು ಆಯ್ಕೆಮಾಡಿ.',
    recordDate: 'ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ದಿನಾಂಕವನ್ನು ಆಯ್ಕೆಮಾಡಿ.',
    recordNotFound: 'ಆರೋಗ್ಯ ದಾಖಲೆ ಕಂಡುಬಂದಿಲ್ಲ.',
    tipsInvalidCategory: 'ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ಕ್ಷೇಮ ವರ್ಗವನ್ನು ಆಯ್ಕೆಮಾಡಿ.',
    tipsEmptyFromAi: 'AI ಸೇವೆಯು ಯಾವುದೇ ಕ್ಷೇಮ ಸಲಹೆಗಳನ್ನು ನೀಡಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    tipsSaveRequired: 'ಸಲಹೆಯ ವರ್ಗ, ಶೀರ್ಷಿಕೆ ಮತ್ತು ವಿಷಯ ಅಗತ್ಯವಿದೆ.',
    tipsNotFound: 'ಉಳಿಸಿದ ಸಲಹೆ ಕಂಡುಬಂದಿಲ್ಲ.',
    endpointNotFound: 'API ಮಾರ್ಗ ಕಂಡುಬಂದಿಲ್ಲ.',
    geminiTimeout: 'AI ಸೇವೆಯಿಂದ ಪ್ರತಿಕ್ರಿಯಿಸಲು ಸಮಯ ಮೀರಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    geminiKeyInvalid:
      'Gemini API ಕೀ ಅಮಾನ್ಯವಾಗಿದೆ ಅಥವಾ ಅನುಮತಿ ಹೊಂದಿಲ್ಲ. ದಯವಿಟ್ಟು ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಪರಿಶೀಲಿಸಿ.',
    geminiRateLimit: 'AI ಸೇವೆಯ ಕೋಟಾ ಅಥವಾ ಮಿತಿ ತಲುಪಿದೆ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    geminiModelUnavailable: 'ಆಯ್ಕೆಮಾಡಿದ AI ಸೇವಾ ಮಾದರಿ ಪ್ರಸ್ತುತ ಲಭ್ಯವಿಲ್ಲ.',
    geminiOverloaded:
      'AI ಸೇವೆಯು ತಾತ್ಕಾಲಿಕವಾಗಿ ಹೆಚ್ಚಿನ ಬೇಡಿಕೆಯನ್ನು ಎದುರಿಸುತ್ತಿದೆ. ದಯವಿಟ್ಟು ಕೆಲವು ಕ್ಷಣಗಳಲ್ಲಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    geminiInvalidDocument:
      'ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ದಾಖಲೆಯನ್ನು ಓದಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಅದು ಸ್ಪಷ್ಟವಾದ, ಎನ್‌ಕ್ರಿಪ್ಟ್ ಮಾಡದ PDF, JPG, ಅಥವಾ PNG ಫೈಲ್ ಆಗಿದೆಯೇ ಎಂದು ಖಚಿತಪಡಿಸಿಕೊಳ್ಳಿ.',
    geminiNetworkError:
      'Gemini AI ಸೇವೆಯೊಂದಿಗೆ ಸಂಪರ್ಕಿಸುವಾಗ ನೆಟ್‌ವರ್ಕ್ ದೋಷ ಉಂಟಾಗಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    geminiGenericError: 'AI ವಿನಂತಿಯನ್ನು ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    geminiNotConfigured:
      'GEMINI_API_KEY ಕಾನ್ಫಿಗರ್ ಮಾಡಲಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು Secrets ನಲ್ಲಿ ನಿಮ್ಮ Gemini API ಕೀ ಸೇರಿಸಿ.',
  },
  hi: {
    contactInvalid:
      'कृपया मान्य नाम, ईमेल पता, विषय (कम से कम 3 अक्षर) और संदेश (कम से कम 10 अक्षर) दर्ज करें।',
    contactSaved: 'आपका संदेश दर्ज कर लिया गया है। MediGuide AI से संपर्क करने के लिए धन्यवाद।',
    registerName: 'नाम 2 से 80 अक्षरों के बीच होना चाहिए।',
    registerEmail: 'कृपया एक मान्य ईमेल पता दर्ज करें।',
    registerPassword: 'पासवर्ड कम से कम 8 अक्षरों का होना चाहिए।',
    registerEmailExists: 'इस ईमेल पते से एक खाता पहले से मौजूद है।',
    registerAge: 'यदि दर्ज किया गया है, तो आयु 1 से 120 के बीच एक पूर्ण संख्या होनी चाहिए।',
    loginInvalidInput: 'कृपया मान्य ईमेल और पासवर्ड दर्ज करें।',
    loginInvalidCredentials: 'ईमेल या पासवर्ड गलत है।',
    forgotEmail: 'कृपया एक मान्य ईमेल पता दर्ज करें।',
    forgotNotFound: 'उस ईमेल पते के साथ कोई खाता नहीं मिला।',
    forgotSuccess:
      'इस स्थानीय रनटाइम में कोई बाहरी ईमेल सेवा जुड़ी नहीं है। अपना पासवर्ड रीसेट करने के लिए 15 मिनट के भीतर नीचे दिए गए सत्यापन कोड का उपयोग करें।',
    resetInvalidInput:
      'अपना ईमेल, 6-अंकीय सत्यापन कोड और नया पासवर्ड (कम से कम 8 अक्षर) दर्ज करें।',
    resetInvalidEmailOrCode: 'अमान्य ईमेल या सत्यापन कोड।',
    resetCodeExpired: 'सत्यापन कोड अमान्य है या समाप्त हो गया है।',
    resetSuccess: 'पासवर्ड सफलतापूर्वक अपडेट हो गया। अब आप साइन इन कर सकते हैं।',
    profileName: 'नाम 2 से 80 अक्षरों के बीच होना चाहिए।',
    profileAge: 'आयु 1 से 120 के बीच होनी चाहिए।',
    profileAvatar: 'प्रोफ़ाइल छवि डेटा बहुत बड़ा है (अधिकतम ~150KB)।',
    profilePreferences: 'प्राथमिकताएं 500 अक्षरों से कम होनी चाहिए।',
    profileTheme: 'थीम लाइट या डार्क होनी चाहिए।',
    profileLanguage: 'भाषा en, kn, या hi होनी चाहिए।',
    changePasswordInvalidInput:
      'अपना वर्तमान पासवर्ड और कम से कम 8 अक्षरों का नया पासवर्ड दर्ज करें।',
    changePasswordWrongCurrent: 'वर्तमान पासवर्ड गलत है।',
    changePasswordSuccess: 'पासवर्ड सफलतापूर्वक बदल दिया गया।',
    deletePasswordRequired: 'अपना खाता हटाने के लिए कृपया पासवर्ड की पुष्टि करें।',
    deleteWrongPassword: 'गलत पासवर्ड।',
    notifInvalidId: 'अमान्य सूचना पहचान।',
    notifNotFound: 'सूचना नहीं मिली।',
    assistantInvalidMsg: 'कृपया एक स्वास्थ्य प्रश्न दर्ज करें (2 से 2000 अक्षर)।',
    assistantConvoNotFound: 'वार्तालाप नहीं मिला।',
    symptomsInvalidInput:
      'कृपया अपने लक्षण, अवधि और गंभीरता (हल्का, मध्यम, या गंभीर) दर्ज करें।',
    reportName: 'रिपोर्ट का नाम 1 से 200 अक्षरों के बीच होना चाहिए।',
    reportSummaryRequired: 'रिपोर्ट सारांश पाठ आवश्यक है (अधिकतम 10,000 अक्षर)।',
    reportSummaryCannotBeEmpty: 'रिपोर्ट सारांश पाठ खाली नहीं हो सकता (अधिकतम 10,000 अक्षर)।',
    reportInvalidId: 'अमान्य रिपोर्ट सारांश पहचान।',
    reportNotFound: 'सहेजा गया रिपोर्ट सारांश नहीं मिला।',
    reportConsentRequired:
      'अपलोड किए गए चिकित्सा दस्तावेज़ को प्रोसेस करने से पहले उपयोगकर्ता की स्पष्ट सहमति आवश्यक है।',
    reportInvalidFile: 'कृपया एक मान्य PDF, JPG, या PNG मेडिकल रिपोर्ट अपलोड करें।',
    reportFileTooLarge: 'अपलोड की गई फ़ाइल 10MB सुरक्षा सीमा से अधिक है।',
    medicineInvalidName: 'कृपया दवा का मान्य नाम दर्ज करें (2 से 100 अक्षर)।',
    recordTitle: 'शीर्षक 2 से 120 अक्षरों के बीच होना चाहिए।',
    recordCategory: 'कृपया एक मान्य रिकॉर्ड श्रेणी चुनें।',
    recordDate: 'कृपया एक मान्य तिथि चुनें।',
    recordNotFound: 'स्वास्थ्य रिकॉर्ड नहीं मिला।',
    tipsInvalidCategory: 'कृपया एक मान्य वेलनेस श्रेणी चुनें।',
    tipsEmptyFromAi: 'AI सेवा ने कोई वेलनेस सुझाव नहीं लौटाया। कृपया पुनः प्रयास करें।',
    tipsSaveRequired: 'सुझाव श्रेणी, शीर्षक और सामग्री आवश्यक हैं।',
    tipsNotFound: 'सहेजा गया सुझाव नहीं मिला।',
    endpointNotFound: 'API एंडपॉइंट नहीं मिला।',
    geminiTimeout: 'AI सेवा से उत्तर मिलने में बहुत समय लगा (टाइमआउट)। कृपया पुनः प्रयास करें।',
    geminiKeyInvalid:
      'Gemini API कुंजी अमान्य है या उसके पास अनुमति नहीं है। कृपया सेटिंग्स में जांचें।',
    geminiRateLimit: 'AI सेवा की सीमा पूरी हो गई है। कृपया कुछ देर प्रतीक्षा करें और पुनः प्रयास करें।',
    geminiModelUnavailable: 'चयनित AI सेवा मॉडल वर्तमान में अनुपलब्ध है।',
    geminiOverloaded:
      'AI सेवा अस्थायी रूप से अत्यधिक व्यस्त है। कृपया कुछ क्षणों में पुनः प्रयास करें।',
    geminiInvalidDocument:
      'अपलोड किया गया दस्तावेज़ पढ़ा नहीं जा सका। कृपया सुनिश्चित करें कि यह एक स्पष्ट, अनएन्क्रिप्टेड PDF, JPG, या PNG फ़ाइल है।',
    geminiNetworkError: 'Gemini AI सेवा से संपर्क करने में नेटवर्क त्रुटि हुई। कृपया पुनः प्रयास करें।',
    geminiGenericError: 'AI अनुरोध प्रोसेस करने में असमर्थ। कृपया पुनः प्रयास करें।',
    geminiNotConfigured:
      'GEMINI_API_KEY कॉन्फ़िगर नहीं है। कृपया Secrets में अपनी Gemini API कुंजी जोड़ें।',
  },
};

export function getServerMessages(language?: unknown): ServerMessages {
  return MESSAGES[normalizeLanguage(language)];
}

export function getLocalizedWelcomeNotification(language?: unknown): {
  title: string;
  message: string;
} {
  const lang = normalizeLanguage(language);
  if (lang === 'kn') {
    return {
      title: 'MediGuide AI ಗೆ ಸ್ವಾಗತ',
      message:
        'ನಿಮ್ಮ ಖಾಸಗಿ ಆರೋಗ್ಯ ಕಾರ್ಯಕ್ಷೇತ್ರ ಸಿದ್ಧವಾಗಿದೆ. ಎಲ್ಲಾ AI ಮಾಹಿತಿಯು ಕೇವಲ ಶೈಕ್ಷಣಿಕವಾಗಿದೆ ಮತ್ತು ವೃತ್ತಿಪರ ವೈದ್ಯಕೀಯ ಸಲಹೆಗೆ ಪರ್ಯಾಯವಲ್ಲ ಎಂಬುದನ್ನು ನೆನಪಿಡಿ.',
    };
  }
  if (lang === 'hi') {
    return {
      title: 'MediGuide AI में आपका स्वागत है',
      message:
        'आपका निजी स्वास्थ्य कार्यक्षेत्र तैयार है। याद रखें कि सभी AI जानकारी केवल शैक्षिक है और पेशेवर चिकित्सा सलाह का स्थान नहीं लेती है।',
    };
  }
  return {
    title: 'Welcome to MediGuide AI',
    message:
      'Your private health workspace is ready. Remember that all AI insights are educational and do not replace professional medical advice.',
  };
}

export function getLocalizedReportNotification(
  kind: 'saved' | 'updated',
  language?: unknown
): { title: string; message: string } {
  const lang = normalizeLanguage(language);
  if (kind === 'saved') {
    if (lang === 'kn') {
      return {
        title: 'ವರದಿ ಸಾರಾಂಶ ಉಳಿಸಲಾಗಿದೆ',
        message: 'ನಿಮ್ಮ ವೈದ್ಯಕೀಯ ವರದಿಯ ಸಾರಾಂಶವನ್ನು ಯಶಸ್ವಿಯಾಗಿ ಉಳಿಸಲಾಗಿದೆ.',
      };
    }
    if (lang === 'hi') {
      return {
        title: 'रिपोर्ट सारांश सहेजा गया',
        message: 'आपका मेडिकल रिपोर्ट सारांश सफलतापूर्वक सहेजा गया है।',
      };
    }
    return {
      title: 'Report Summary Saved',
      message: 'Your medical report summary was saved successfully.',
    };
  }
  if (lang === 'kn') {
    return {
      title: 'ವರದಿ ಸಾರಾಂಶ ನವೀಕರಿಸಲಾಗಿದೆ',
      message: 'ನಿಮ್ಮ ಉಳಿಸಿದ ವೈದ್ಯಕೀಯ ವರದಿಯ ಸಾರಾಂಶವನ್ನು ನವೀಕರಿಸಲಾಗಿದೆ.',
    };
  }
  if (lang === 'hi') {
    return {
      title: 'रिपोर्ट सारांश अपडेट किया गया',
      message: 'आपका सहेजा गया मेडिकल रिपोर्ट सारांश अपडेट कर दिया गया है।',
    };
  }
  return {
    title: 'Report Summary Updated',
    message: 'Your saved medical report summary has been updated.',
  };
}
