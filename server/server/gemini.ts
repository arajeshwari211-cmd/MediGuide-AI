import { type GenerateContentResponse, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { normalizeLanguage, type SupportedLanguage } from './auth.ts';
import { getServerMessages } from './i18nErrors.ts';

const MODEL_NAME = 'gemini-4-hydrogen';
const FAST_FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_REQUEST_TIMEOUT_MS = 25000;

function getLanguageDisplayName(language: SupportedLanguage): string {
  if (language === 'kn') return 'Kannada (ಕನ್ನಡ)';
  if (language === 'hi') return 'Hindi (हिन्दी)';
  return 'English';
}

function getLanguageDirective(language: SupportedLanguage): string {
  if (language === 'kn') {
    return [
      'LANGUAGE REQUIREMENT (MANDATORY):',
      '- Write ALL explanatory text, headings, guidance, questions, warning signs, and disclaimers in clear, natural, grammatically accurate Kannada (ಕನ್ನಡ script).',
      '- Preserve medicine generic/brand names accurately (write the standard English name alongside Kannada if helpful, e.g., "Paracetamol (ಪ್ಯಾರಾಸಿಟಮಾಲ್)").',
      '- Preserve clinical acronyms/terminology (such as HbA1c, CBC, TSH, NSAID, mg/dL) and all laboratory numbers, units, and reference ranges accurately.',
      '- Maintain all medical safety warnings, emergency escalation instructions, and non-diagnostic disclaimers clearly and accurately in Kannada.',
    ].join('\n');
  }
  if (language === 'hi') {
    return [
      'LANGUAGE REQUIREMENT (MANDATORY):',
      '- Write ALL explanatory text, headings, guidance, questions, warning signs, and disclaimers in clear, natural, grammatically accurate Hindi (हिन्दी, Devanagari script).',
      '- Preserve medicine generic/brand names accurately (write the standard English name alongside Hindi if helpful, e.g., "Paracetamol (पैरासिटामोल)").',
      '- Preserve clinical acronyms/terminology (such as HbA1c, CBC, TSH, NSAID, mg/dL) and all laboratory numbers, units, and reference ranges accurately.',
      '- Maintain all medical safety warnings, emergency escalation instructions, and non-diagnostic disclaimers clearly and accurately in Hindi.',
    ].join('\n');
  }
  return 'LANGUAGE REQUIREMENT: Respond in clear, natural English.';
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: GEMINI_REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withTimeout<T>(promise: Promise<T>, ms = GEMINI_REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Gemini request timed out after ${Math.round(ms / 1000)} seconds.`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let lastError: unknown;
  const startedAt = Date.now();
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const remainingMs = Math.max(5000, GEMINI_REQUEST_TIMEOUT_MS - (Date.now() - startedAt));
      return await withTimeout(fn(), remainingMs);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('503');
      if (!isTransient || attempt === retries || Date.now() - startedAt > 18000) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function formatGeminiError(
  error: unknown,
  language: SupportedLanguage = 'en'
): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const msg = getServerMessages(language);
  console.error('[Gemini API Error]', raw);

  if (raw.includes('GEMINI_API_KEY is not configured')) {
    return { status: 503, message: msg.geminiNotConfigured };
  }
  if (
    raw.includes('timed out') ||
    raw.includes('AbortError') ||
    raw.includes('DEADLINE_EXCEEDED') ||
    raw.includes('"code":504') ||
    raw.includes('504')
  ) {
    return {
      status: 504,
      message: msg.geminiTimeout,
    };
  }
  if (
    raw.includes('API_KEY_INVALID') ||
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('API key') ||
    raw.includes('403')
  ) {
    return {
      status: 403,
      message: msg.geminiKeyInvalid,
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: msg.geminiRateLimit,
    };
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return {
      status: 502,
      message: msg.geminiModelUnavailable,
    };
  }
  if (
    raw.includes('503') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('high demand') ||
    raw.includes('overloaded')
  ) {
    return {
      status: 503,
      message: msg.geminiOverloaded,
    };
  }
  if (
    raw.includes('INVALID_ARGUMENT') ||
    raw.includes('Unable to process input') ||
    raw.includes('Could not parse medical report')
  ) {
    return {
      status: 400,
      message: msg.geminiInvalidDocument,
    };
  }
  if (
    raw.includes('fetch failed') ||
    raw.includes('ENOTFOUND') ||
    raw.includes('ECONNREFUSED') ||
    raw.includes('ECONNRESET')
  ) {
    return {
      status: 502,
      message: msg.geminiNetworkError,
    };
  }
  return {
    status: 500,
    message: msg.geminiGenericError,
  };
}

export async function askHealthAssistant(
  history: Array<{ role: 'user' | 'model'; text: string }>,
  userMessage: string,
  language: SupportedLanguage = 'en'
): Promise<string> {
  const ai = getAiClient();
  const lang = normalizeLanguage(language);

  const systemInstruction = [
    'You are MediGuide AI, an educational healthcare awareness assistant aligned with UN SDG 3 (Good Health and Well-being).',
    'Follow these strict safety rules in every response:',
    '1. Use clear, plain, compassionate language accessible to everyday readers.',
    '2. Provide general educational health information only. Clearly distinguish general educational information from personalized medical advice.',
    '3. NEVER provide a definitive medical diagnosis or claim to diagnose any condition.',
    '4. NEVER recommend prescription medications, personalized dosages, or tell a user to start/stop prescribed treatments.',
    '5. Avoid unsupported medical claims or miracle cures.',
    '6. Recommend consulting a qualified doctor, pharmacist, or healthcare professional when appropriate, and advise urgent medical care if red-flag symptoms are mentioned.',
    '7. Keep answers structured with concise headings or bullet points where helpful.',
    getLanguageDirective(lang),
  ].join('\n');

  const contents = [
    ...history.map((item) => ({
      role: item.role,
      parts: [{ text: item.text }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: userMessage }],
    },
  ];

  const modelsToTry = [FAST_FALLBACK_MODEL, MODEL_NAME, FAST_FALLBACK_MODEL];
  const startedAt = Date.now();
  let response: GenerateContentResponse | undefined;
  let lastErr: unknown;

  for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
    const targetModel = modelsToTry[attempt];
    const elapsed = Date.now() - startedAt;
    const remaining = 38000 - elapsed;
    if (remaining < 5000) break;

    const budget = Math.min(13000, remaining);
    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: targetModel,
          contents,
          config: {
            systemInstruction,
            ...(targetModel === MODEL_NAME
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        }),
        budget
      );
      break;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
      const isTransient =
        isRateLimit ||
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('overloaded') ||
        msg.includes('504') ||
        msg.includes('DEADLINE_EXCEEDED') ||
        msg.includes('timed out');
      if (!isTransient || attempt === modelsToTry.length - 1) {
        throw err;
      }
      console.warn(
        `[Assistant Fallback] ${targetModel} failed (${msg}); trying ${modelsToTry[attempt + 1]}`
      );
      await new Promise((resolve) => setTimeout(resolve, isRateLimit ? 2000 : 800));
    }
  }

  if (!response) {
    throw lastErr ?? new Error('Unable to obtain a response from the AI service.');
  }

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Empty response received from Gemini AI.');
  }
  return text;
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

const SYMPTOM_LOCALIZED: Record<
  SupportedLanguage,
  {
    possibilityPrefix: string;
    emergencyGuidance: string;
    disclaimer: string;
    cues: Array<{ test: RegExp; item: string }>;
  }
> = {
  en: {
    possibilityPrefix: 'General educational possibility (not a confirmed cause):',
    emergencyGuidance:
      'Seek immediate emergency care (call local emergency services right away and do not wait) if a sudden severe headache, new weakness, confusion, difficulty speaking, seizures, or loss of consciousness occurs, or if severe symptoms worsen rapidly.',
    disclaimer:
      'AI-generated educational information only (not retrieved from verified external medical sources). These details do not identify the cause of your symptoms or constitute a diagnosis, probability estimate, or treatment plan. Always consult a qualified healthcare professional.',
    cues: [
      {
        test: /\bsudden severe\b|\bthunderclap\b|\bworst headache\b/i,
        item: 'Sudden, severe ("thunderclap") headache or abruptly worsening head pain',
      },
      {
        test: /\b(?:new weakness|sudden weakness|weakness|numbness|paralysis)\b/i,
        item: 'New weakness, numbness, or loss of movement (especially on one side of the face or body)',
      },
      {
        test: /\b(?:confusion|altered mental)\b/i,
        item: 'Confusion, disorientation, or sudden changes in alertness or behavior',
      },
      {
        test: /\b(?:difficulty speaking|slurred speech|trouble speaking)\b/i,
        item: 'Difficulty speaking, slurred speech, or trouble understanding speech',
      },
      {
        test: /\bseizures?\b/i,
        item: 'Seizures or uncontrolled shaking',
      },
      {
        test: /\b(?:loss of consciousness|unconscious|fainting|unresponsive)\b/i,
        item: 'Loss of consciousness, fainting, or difficulty waking up',
      },
    ],
  },
  kn: {
    possibilityPrefix: 'ಸಾಮಾನ್ಯ ಶೈಕ್ಷಣಿಕ ಸಾಧ್ಯತೆ (ದೃಢೀಕೃತ ಕಾರಣವಲ್ಲ):',
    emergencyGuidance:
      'ಹಠಾತ್ ತೀವ್ರ ತಲೆನೋವು, ದೇಹದ ಒಂದು ಬದಿಯಲ್ಲಿ ಹೊಸ ದೌರ್ಬಲ್ಯ ಅಥವಾ ಮರಗಟ್ಟುವಿಕೆ, ಗೊಂದಲ, ಮಾತನಾಡುವಲ್ಲಿ ತೊಂದರೆ, ಫಿಟ್ಸ್ (ಸೆಳೆತ), ಅಥವಾ ಪ್ರಜ್ಞೆ ತಪ್ಪುವಿಕೆ ಕಂಡುಬಂದರೆ ಅಥವಾ ತೀವ್ರ ಲಕ್ಷಣಗಳು ವೇಗವಾಗಿ ಉಲ್ಬಣಗೊಂಡರೆ ತಕ್ಷಣವೇ ತುರ್ತು ವೈದ್ಯಕೀಯ ಸೇವೆಯನ್ನು ಪಡೆಯಿರಿ (ಸ್ಥಳೀಯ ತುರ್ತು ಸಹಾಯವಾಣಿಗೆ ತಕ್ಷಣ ಕರೆ ಮಾಡಿ, ಕಾಯಬೇಡಿ).',
    disclaimer:
      'ಇದು AI ರಚಿಸಿದ ಸಾಮಾನ್ಯ ಶೈಕ್ಷಣಿಕ ಮಾಹಿತಿ ಮಾತ್ರ (ಪರಿಶೀಲಿಸಿದ ಬಾಹ್ಯ ವೈದ್ಯಕೀಯ ಮೂಲಗಳಿಂದ ಪಡೆದದ್ದಲ್ಲ). ಈ ವಿವರಗಳು ನಿಮ್ಮ ಲಕ್ಷಣಗಳ ನಿಖರ ಕಾರಣವನ್ನು ಗುರುತಿಸುವುದಿಲ್ಲ ಹಾಗೂ ರೋಗನಿರ್ಣಯ, ಸಂಭಾವ್ಯತೆ ಅಥವಾ ಚಿಕಿತ್ಸಾ ಯೋಜನೆಯಾಗಿರುವುದಿಲ್ಲ. ಯಾವಾಗಲೂ ಅರ್ಹ ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.',
    cues: [
      {
        test: /\bsudden severe\b|\bthunderclap\b|ಹಠಾತ್\s*ತೀವ್ರ\s*ತಲೆನೋವು|ಅಸಹನೀಯ\s*ತಲೆನೋವು/i,
        item: 'ಹಠಾತ್ ತೀವ್ರ ("ಥಂಡರ್‌ಕ್ಲ್ಯಾಪ್") ತಲೆನೋವು ಅಥವಾ ತಕ್ಷಣವೇ ಉಲ್ಬಣಗೊಳ್ಳುವ ತಲೆನೋವು',
      },
      {
        test: /\b(?:new weakness|weakness|numbness|paralysis)\b|ದೌರ್ಬಲ್ಯ|ಮರಗಟ್ಟುವಿಕೆ|ಪಾರ್ಶ್ವವಾಯು/i,
        item: 'ಹೊಸ ದೌರ್ಬಲ್ಯ, ಮರಗಟ್ಟುವಿಕೆ ಅಥವಾ ಚಲನೆಯ ನಷ್ಟ (ವಿಶೇಷವಾಗಿ ಮುಖ ಅಥವಾ ದೇಹದ ಒಂದು ಬದಿಯಲ್ಲಿ)',
      },
      {
        test: /\b(?:confusion|altered mental)\b|ಗೊಂದಲ|ದಿಗ್ಭ್ರಮೆ|ಅರಿವಿನ\s*ಬದಲಾವಣೆ/i,
        item: 'ಗೊಂದಲ, ದಿಗ್ಭ್ರಮೆ ಅಥವಾ ಎಚ್ಚರಿಕೆ ಮತ್ತು ವರ್ತನೆಯಲ್ಲಿ ಹಠಾತ್ ಬದಲಾವಣೆ',
      },
      {
        test: /\b(?:difficulty speaking|slurred speech)\b|ಮಾತನಾಡುವ|ಮಾತು\s*ತೊದಲುವಿಕೆ|ಮಾತು\s*ಅರ್ಥವಾಗದಿರುವುದು/i,
        item: 'ಮಾತನಾಡುವಲ್ಲಿ ತೊಂದರೆ, ಮಾತು ತೊದಲುವಿಕೆ ಅಥವಾ ಮಾತು ಅರ್ಥಮಾಡಿಕೊಳ್ಳುವಲ್ಲಿ ಕಷ್ಟ',
      },
      {
        test: /\bseizures?\b|ಸೆಳೆತ|ಫಿಟ್ಸ್|ಮೂರ್ಛೆ\s*ನಡುಕ/i,
        item: 'ಸೆಳೆತ (ಫಿಟ್ಸ್ / Seizures) ಅಥವಾ ನಿಯಂತ್ರಣವಿಲ್ಲದ ನಡುಕ',
      },
      {
        test: /\b(?:loss of consciousness|unconscious|fainting)\b|ಪ್ರಜ್ಞೆ\s*ತಪ್ಪು|ಮೂರ್ಛೆ|ಎಚ್ಚರಗೊಳ್ಳಲು/i,
        item: 'ಪ್ರಜ್ಞೆ ತಪ್ಪುವುದು, ಮೂರ್ಛೆ ಹೋಗುವುದು ಅಥವಾ ಎಚ್ಚರಗೊಳ್ಳಲು ಕಷ್ಟವಾಗುವುದು',
      },
    ],
  },
  hi: {
    possibilityPrefix: 'सामान्य शैक्षिक संभावना (पुष्ट कारण नहीं):',
    emergencyGuidance:
      'यदि अचानक तेज़ सिरदर्द, नई कमज़ोरी या सुन्नपन, भ्रम, बोलने में कठिनाई, दौरे (Seizures), या बेहोशी हो या गंभीर लक्षण तेज़ी से बढ़ रहे हों, तो बिना देर किए तुरंत आपातकालीन चिकित्सा सहायता लें (स्थानीय आपातकालीन सेवाओं को तुरंत कॉल करें)।',
    disclaimer:
      'यह केवल AI द्वारा तैयार सामान्य शैक्षिक जानकारी है (सत्यापित बाहरी चिकित्सा स्रोतों से प्राप्त नहीं)। यह जानकारी आपके लक्षणों का कारण नहीं बताती और न ही यह कोई निदान, रोग की संभावना या उपचार योजना है। हमेशा किसी योग्य चिकित्सक से परामर्श लें।',
    cues: [
      {
        test: /\bsudden severe\b|\bthunderclap\b|अचानक\s*(?:तेज़|गंभीर)\s*सिरदर्द|थंडरक्लैप/i,
        item: 'अचानक, अत्यधिक तेज़ ("थंडरक्लैप") सिरदर्द या तुरंत बढ़ने वाला सिर का दर्द',
      },
      {
        test: /\b(?:new weakness|weakness|numbness|paralysis)\b|कमज़ोरी|सुन्नपन|लकवा/i,
        item: 'नई कमज़ोरी, सुन्नपन, या हिलने-डुलने में असमर्थता (विशेषकर चेहरे या शरीर के एक हिस्से में)',
      },
      {
        test: /\b(?:confusion|altered mental)\b|भ्रम|उलझन|होश\s*में\s*बदलाव/i,
        item: 'भ्रम, भटकाव, या सतर्कता और व्यवहार में अचानक बदलाव',
      },
      {
        test: /\b(?:difficulty speaking|slurred speech)\b|बोलने\s*में\s*(?:कठिनाई|दिक्कत)|अस्पष्ट\s*बोली/i,
        item: 'बोलने में कठिनाई, अस्पष्ट बोली, या बात समझने में परेशानी',
      },
      {
        test: /\bseizures?\b|दौरे|झटके|मिर्गी/i,
        item: 'दौरे (Seizures) पड़ना या अनियंत्रित कंपन होना',
      },
      {
        test: /\b(?:loss of consciousness|unconscious|fainting)\b|बेहोशी|चेतना\s*खोना|होश\s*न/i,
        item: 'बेहोशी, चेतना खोना, या जागने में कठिनाई होना',
      },
    ],
  },
};

export async function analyzeSymptoms(input: {
  symptoms: string;
  duration: string;
  severity: string;
  additionalInfo?: string;
  language?: SupportedLanguage;
}): Promise<SymptomAnalysisResult> {
  const ai = getAiClient();
  const lang = normalizeLanguage(input.language);
  const localizedStrings = SYMPTOM_LOCALIZED[lang];

  const prompt = [
    'Provide general, educational health information for the following user-reported symptom context:',
    `Symptoms: ${input.symptoms}`,
    `Duration: ${input.duration}`,
    `Severity: ${input.severity}`,
    input.additionalInfo ? `Additional context: ${input.additionalInfo}` : '',
    '',
    getLanguageDirective(lang),
    '',
    'CRITICAL CLINICAL & SAFETY RULES (ALL MANDATORY):',
    '1. NON-CAUSAL OVERVIEW & EDUCATIONAL POSSIBILITIES ONLY:',
    '   - In `reportedSummary`, restate neutrally what the user reported (symptoms, duration, severity, context). NEVER state or imply that the AI has identified the cause of the user\'s symptoms or linked them definitively to any trigger or condition.',
    '   - In `possibleExplanations`, present 3 to 5 general educational possibilities commonly discussed with similar symptoms—explicitly framed as general educational possibilities, NEVER as confirmed causes or a personal explanation of why the user has these symptoms.',
    '2. CLEARLY SEPARATE LIFE-THREATENING EMERGENCY SIGNS FROM PROMPT-ASSESSMENT SIGNS:',
    '   - Populate `emergencyWarningSigns` strictly with potentially life-threatening symptoms requiring IMMEDIATE emergency care (call local emergency services / go to the nearest emergency department right away).',
    '   - If the reported symptoms involve headache, head/neck symptoms, dizziness, neurological symptoms, or general red-flag screening, you MUST clearly include immediate emergency warning signs such as sudden severe ("thunderclap") headache, new weakness or numbness, confusion, difficulty speaking or slurred speech, seizures, or loss of consciousness under `emergencyWarningSigns` and `emergencyGuidance`.',
    '   - Populate `promptMedicalSigns` strictly with non-immediately-life-threatening symptoms that still require PROMPT professional medical assessment (e.g., same-day or timely doctor/urgent-care evaluation such as worsening symptoms, persistent high fever, or symptoms not improving). Do NOT mix these with life-threatening emergencies.',
    '3. IMMEDIATE EMERGENCY ESCALATION:',
    '   - In `emergencyGuidance`, clearly instruct the user to seek immediate emergency medical care (e.g., call local emergency services right away and never wait) if sudden severe headache, new weakness, confusion, difficulty speaking, seizures, loss of consciousness, chest pain, severe trouble breathing, or severe bleeding occurs.',
    '4. ACTIONABLE DOCTOR CONSULTATION GUIDANCE:',
    '   - In `doctorRecommendation`, explain specifically when persistent, recurring, worsening, or concerning symptoms warrant professional medical evaluation, and list helpful details to share with the doctor (symptom timeline, severity pattern, triggers, medical history, and current medicines).',
    '5. GENERAL, LOW-RISK, SYMPTOM-RELEVANT SELF-CARE:',
    '   - In `generalSelfCare`, provide only conservative, low-risk, practical general comfort measures directly relevant to the entered symptoms (e.g., hydration, rest, gentle posture breaks, warm fluids). Avoid forceful physical maneuvers, diagnoses, prescription/OTC regimens, or numerical dosages.',
    '6. STRICT BOUNDARIES & NO INVENTED SOURCES:',
    '   - NEVER introduce diagnoses, disease probabilities/percentages, prescriptions, or personalized medication dosages.',
    '   - NEVER invent or name external medical sources, studies, guidelines, URLs, or claim "official source verification" (e.g., do not claim "verified by NHS/CDC/WHO/MedlinePlus/DailyMed").',
  ]
    .filter(Boolean)
    .join('\n');

  const schemaConfig = {
    systemInstruction:
      `You are a careful, safety-first medical education assistant responding in ${getLanguageDisplayName(lang)}. You never diagnose, never claim to identify the cause of a user's symptoms, never assign probabilities, never recommend prescriptions or personal dosages, never invent medical sources or claim official verification, and always separate life-threatening emergency warning signs from prompt-assessment symptoms.`,
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        reportedSummary: {
          type: Type.STRING,
          description:
            'Neutral summary of reported symptoms, duration, severity, and optional context without implying any identified cause.',
        },
        possibleExplanations: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            '3 to 5 general educational possibilities (explicitly framed as educational possibilities, not confirmed causes or a diagnosis).',
        },
        emergencyWarningSigns: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            'Potentially life-threatening symptoms requiring IMMEDIATE emergency services (including sudden severe headache, new weakness, confusion, difficulty speaking, seizures, loss of consciousness, chest pain, or severe breathing difficulty when applicable).',
        },
        promptMedicalSigns: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            'Concerning but non-emergency symptoms requiring prompt doctor or urgent-care assessment (kept separate from life-threatening emergency signs).',
        },
        emergencyGuidance: {
          type: Type.STRING,
          description:
            'Direct immediate emergency escalation guidance telling users to call emergency services immediately without waiting if life-threatening signs occur.',
        },
        generalSelfCare: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            'Conservative, low-risk, general self-care steps relevant to the entered symptoms, with no prescriptions or medication dosages.',
        },
        doctorRecommendation: {
          type: Type.STRING,
          description:
            'Practical guidance explaining when persistent, recurring, worsening, or concerning symptoms need professional evaluation and what details to prepare for the visit.',
        },
        disclaimer: {
          type: Type.STRING,
          description:
            'Clear disclaimer stating this is unverified AI-generated educational guidance only, not a confirmed cause, diagnosis, or substitute for professional medical care.',
        },
      },
      required: [
        'reportedSummary',
        'possibleExplanations',
        'emergencyWarningSigns',
        'promptMedicalSigns',
        'emergencyGuidance',
        'generalSelfCare',
        'doctorRecommendation',
        'disclaimer',
      ],
    },
  };

  const modelsToTry = [FAST_FALLBACK_MODEL, MODEL_NAME, FAST_FALLBACK_MODEL];
  const startedAt = Date.now();
  let response: GenerateContentResponse | undefined;
  let lastErr: unknown;

  for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
    const targetModel = modelsToTry[attempt];
    const elapsed = Date.now() - startedAt;
    const remaining = 38000 - elapsed;
    if (remaining < 5000) break;

    const budget = Math.min(13000, remaining);
    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: targetModel,
          contents: prompt,
          config: {
            ...schemaConfig,
            ...(targetModel === MODEL_NAME
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        }),
        budget
      );
      break;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
      const isTransient =
        isRateLimit ||
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('overloaded') ||
        msg.includes('504') ||
        msg.includes('DEADLINE_EXCEEDED') ||
        msg.includes('timed out');
      if (!isTransient || attempt === modelsToTry.length - 1) {
        throw err;
      }
      console.warn(
        `[Symptom Guidance Fallback] ${targetModel} failed (${msg}); trying ${modelsToTry[attempt + 1]}`
      );
      await new Promise((resolve) => setTimeout(resolve, isRateLimit ? 2000 : 600));
    }
  }

  if (!response) {
    throw lastErr ?? new Error('Unable to obtain a response from the AI service.');
  }

  const rawText = stripJsonCodeFences(response.text ?? '');
  if (!rawText) {
    throw new Error('Empty response received from Gemini AI.');
  }

  let parsed: Partial<SymptomAnalysisResult>;
  try {
    parsed = JSON.parse(rawText) as Partial<SymptomAnalysisResult>;
  } catch {
    throw new Error('Received an invalid response format from the AI service. Please try again.');
  }

  const stripUnsafeMedicalOrSourceClaims = (text: string): string =>
    text
      .replace(/https?:\/\/\S+/gi, '')
      .replace(
        /\b(?:according to|verified by|per|sourced from|from)\s+(?:the\s+)?(?:nhs|medlineplus|dailymed|cdc|who|mayo clinic|webmd|healthline|pubmed|fda|nice)\b[,:]?\s*/gi,
        ''
      )
      .replace(/\b\d+(?:\.\d+)?\s*%\s*(?:chance|probability|likelihood|risk)\b/gi, 'general possibility')
      .replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|ug|ml)\b/gi, 'appropriate professional guidance')
      .replace(/\s{2,}/g, ' ')
      .trim();

  const cleanList = (arr: unknown): string[] =>
    Array.isArray(arr)
      ? arr
          .map((item) => (typeof item === 'string' ? stripUnsafeMedicalOrSourceClaims(item.trim()) : ''))
          .filter(Boolean)
      : [];

  const reportedSummary =
    typeof parsed.reportedSummary === 'string'
      ? stripUnsafeMedicalOrSourceClaims(parsed.reportedSummary.trim())
          .replace(/\b(?:caused by|resulting from|due to)\b/gi, 'noted in the context of')
      : '';
  const rawPossibleExplanations = cleanList(parsed.possibleExplanations);
  const possibleExplanations = rawPossibleExplanations.map((item) => {
    const cleaned = item
      .replace(/\b(?:is|are) caused by\b/gi, 'may sometimes be associated with')
      .replace(/^Educational possibility:\s*/i, '');
    if (
      /\bnot a confirmed cause\b/i.test(cleaned) ||
      /ದೃಢೀಕೃತ ಕಾರಣವಲ್ಲ/.test(cleaned) ||
      /पुष्ट कारण नहीं/.test(cleaned)
    ) {
      return cleaned;
    }
    return `${localizedStrings.possibilityPrefix} ${cleaned}`;
  });
  let emergencyWarningSigns = cleanList(parsed.emergencyWarningSigns);
  const rawPromptMedicalSigns = cleanList(parsed.promptMedicalSigns);
  const fallbackWarningSigns = cleanList(parsed.warningSigns);
  let emergencyGuidance =
    typeof parsed.emergencyGuidance === 'string'
      ? stripUnsafeMedicalOrSourceClaims(parsed.emergencyGuidance.trim())
      : '';
  const generalSelfCare = cleanList(parsed.generalSelfCare);
  const doctorRecommendation =
    typeof parsed.doctorRecommendation === 'string'
      ? stripUnsafeMedicalOrSourceClaims(parsed.doctorRecommendation.trim())
      : '';
  const disclaimer =
    typeof parsed.disclaimer === 'string'
      ? stripUnsafeMedicalOrSourceClaims(parsed.disclaimer.trim())
      : '';

  if (emergencyWarningSigns.length === 0 && fallbackWarningSigns.length > 0) {
    emergencyWarningSigns = fallbackWarningSigns;
  }

  // Ensure any life-threatening/neurological signs accidentally returned in promptMedicalSigns stay strictly in emergencyWarningSigns
  const emergencySignRegex =
    /\b(?:thunderclap|sudden severe|neurological|disorientation|confusion|weakness|numbness|paralysis|difficulty speaking|slurred speech|seizure|loss of consciousness|unconscious|chest pain|trouble breathing|shortness of breath|severe bleeding|vision loss)\b|ಹಠಾತ್ ತೀವ್ರ|ದೌರ್ಬಲ್ಯ|ಮರಗಟ್ಟುವಿಕೆ|ಗೊಂದಲ|ಮಾತನಾಡುವಲ್ಲಿ|ಸೆಳೆತ|ಫಿಟ್ಸ್|ಪ್ರಜ್ಞೆ|ಎದೆ ನೋವು|ಉಸಿರಾಟ|रक्तस्राव|सीने में दर्द|सांस|अचानक तेज़|कमज़ोरी|सुन्नपन|भ्रम|बोलने में|दौरे|बेहोशी/i;
  const promptMedicalSigns: string[] = [];
  for (const sign of rawPromptMedicalSigns) {
    if (emergencySignRegex.test(sign)) {
      if (!emergencyWarningSigns.some((e) => e.toLowerCase() === sign.toLowerCase())) {
        emergencyWarningSigns.push(sign);
      }
    } else {
      promptMedicalSigns.push(sign);
    }
  }

  // Ensure neurological & critical emergency warning signs are clearly covered for acute / neurological inputs
  const combinedInput = `${input.symptoms} ${input.additionalInfo ?? ''}`.toLowerCase();
  const hasNeurologicalOrSevereContext =
    input.severity === 'Severe' ||
    /\b(?:headache|migraine|head pain|neck stiffness|stiff neck|dizzy|dizziness|vertigo|vision|blurr|weakness|numbness|confusion|speaking|speech|slurred|seizure|faint|unconscious|consciousness)\b|ತಲೆನೋವು|ತಲೆಸುತ್ತು|ದೌರ್ಬಲ್ಯ|ಗೊಂದಲ|ಸೆಳೆತ|ಪ್ರಜ್ಞೆ|ಸಿರದರ್ದ್|सिरदर्द|चक्कर|कमज़ोरी|भ्रम|दौरे|बेहोशी/i.test(
      combinedInput
    );

  if (hasNeurologicalOrSevereContext) {
    const emergencyCorpus = `${emergencyWarningSigns.join(' ')} ${emergencyGuidance}`.toLowerCase();
    for (const cue of localizedStrings.cues) {
      if (!cue.test.test(emergencyCorpus)) {
        emergencyWarningSigns.push(cue.item);
      }
    }

    const hasGuidanceCues =
      lang === 'en'
        ? /\b(?:confusion|difficulty speaking|seizures?|loss of consciousness|sudden severe headache|new weakness)\b/i.test(
            emergencyGuidance
          )
        : /ತುರ್ತು|ಸಹಾಯವಾಣಿ|ಆಸ್ಪತ್ರೆ|ತಕ್ಷಣ|आपातकालीन|तुरंत|अस्पताल|कॉल करें/i.test(
            emergencyGuidance
          );
    if (!hasGuidanceCues || emergencyGuidance.length < 25) {
      emergencyGuidance = localizedStrings.emergencyGuidance;
    }
  }

  const combinedWarningSigns = [...emergencyWarningSigns, ...promptMedicalSigns];

  if (
    !reportedSummary ||
    possibleExplanations.length === 0 ||
    combinedWarningSigns.length === 0 ||
    !emergencyGuidance ||
    generalSelfCare.length === 0 ||
    !doctorRecommendation
  ) {
    throw new Error('Incomplete symptom guidance received from Gemini AI. Please try again.');
  }

  return {
    reportedSummary,
    possibleExplanations,
    warningSigns: combinedWarningSigns,
    emergencyWarningSigns,
    promptMedicalSigns,
    emergencyGuidance,
    generalSelfCare,
    doctorRecommendation,
    disclaimer: disclaimer || localizedStrings.disclaimer,
  };
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

function stripJsonCodeFences(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
  return trimmed;
}

function normalizeLabStatus(status: unknown): ExtractedLabTest['status'] {
  if (
    status === 'Within Range' ||
    status === 'High' ||
    status === 'Low' ||
    status === 'Not Specified'
  ) {
    return status;
  }
  return 'Not Specified';
}

const REPORT_FALLBACKS: Record<
  SupportedLanguage,
  {
    summary: string;
    unnamedTest: string;
    notProvided: string;
    noExplanation: string;
    labVarianceNote: string;
    disclaimer: string;
  }
> = {
  en: {
    summary: 'The uploaded document was processed, though no overall summary could be generated.',
    unnamedTest: 'Unnamed Test',
    notProvided: 'Not provided',
    noExplanation: 'No plain-language explanation available for this marker.',
    labVarianceNote:
      'Laboratory reference ranges can vary between testing facilities and depend on individual clinical context.',
    disclaimer:
      'This breakdown is for educational awareness only and is not a medical diagnosis. Please review these results with a qualified healthcare professional.',
  },
  kn: {
    summary: 'ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ದಾಖಲೆಯನ್ನು ಪರಿಶೀಲಿಸಲಾಗಿದೆ, ಆದರೆ ಒಟ್ಟಾರೆ ಸಾರಾಂಶವನ್ನು ರಚಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.',
    unnamedTest: 'ಹೆಸರಿಸದ ಪರೀಕ್ಷೆ',
    notProvided: 'ನೀಡಲಾಗಿಲ್ಲ',
    noExplanation: 'ಈ ಪರೀಕ್ಷಾ ಮೌಲ್ಯಕ್ಕೆ ಸರಳ ವಿವರಣೆ ಲಭ್ಯವಿಲ್ಲ.',
    labVarianceNote:
      'ಪ್ರಯೋಗಾಲಯದ ಉಲ್ಲೇಖ ಶ್ರೇಣಿಗಳು (Reference ranges) ಪ್ರಯೋಗಾಲಯದಿಂದ ಪ್ರಯೋಗಾಲಯಕ್ಕೆ ಹಾಗೂ ವ್ಯಕ್ತಿಯ ಆರೋಗ್ಯ ಸ್ಥಿತಿಗೆ ಅನುಗುಣವಾಗಿ ಬದಲಾಗಬಹುದು.',
    disclaimer:
      'ಈ ವಿವರಣೆಯು ಕೇವಲ ಶೈಕ್ಷಣಿಕ ಅರಿವಿಗಾಗಿ ಮಾತ್ರ, ವೈದ್ಯಕೀಯ ರೋಗನಿರ್ಣಯವಲ್ಲ. ದಯವಿಟ್ಟು ಈ ಫಲಿತಾಂಶಗಳನ್ನು ಅರ್ಹ ವೈದ್ಯರೊಂದಿಗೆ ಪರಿಶೀಲಿಸಿ.',
  },
  hi: {
    summary: 'अपलोड किया गया दस्तावेज़ संसाधित किया गया, लेकिन समग्र सारांश तैयार नहीं हो सका।',
    unnamedTest: 'अनाम परीक्षण',
    notProvided: 'उपलब्ध नहीं',
    noExplanation: 'इस परीक्षण मान के लिए सरल व्याख्या उपलब्ध नहीं है।',
    labVarianceNote:
      'प्रयोगशाला संदर्भ सीमाएँ (Reference ranges) विभिन्न लैब और व्यक्तिगत चिकित्सीय स्थिति के अनुसार भिन्न हो सकती हैं।',
    disclaimer:
      'यह विवरण केवल शैक्षिक जागरूकता के लिए है, न कि चिकित्सकीय निदान। कृपया इन परिणामों की समीक्षा किसी योग्य डॉक्टर के साथ करें।',
  },
};

export async function explainMedicalReport(input: {
  base64Data: string;
  mimeType: string;
  fileName: string;
  language?: SupportedLanguage;
}): Promise<MedicalReportExplanation> {
  const ai = getAiClient();
  const lang = normalizeLanguage(input.language);
  const fallbacks = REPORT_FALLBACKS[lang];

  const filePart = {
    inlineData: {
      mimeType: input.mimeType,
      data: input.base64Data,
    },
  };

  const textPart = {
    text: [
      `Please examine the uploaded medical report (${input.fileName}) and explain its contents in simple, patient-friendly language.`,
      getLanguageDirective(lang),
      'STRICT RULES:',
      `1. Extract ONLY test names, values, units, and reference ranges explicitly visible in the document. NEVER invent or guess missing lab values or reference ranges; use "${fallbacks.notProvided}" when absent.`,
      '2. Preserve exact laboratory numbers (`reportedValue`), measurement units (`unit`), and reference ranges (`referenceRange`) verbatim as shown on the report, and preserve standard medical test names/acronyms accurately (e.g. "Hemoglobin (Hb)", "HbA1c", "TSH").',
      '3. For `status`, ALWAYS output one of the exact English enum values: "Within Range", "High", "Low", or "Not Specified" based strictly on the reference range shown on the report.',
      `4. Generate \`summary\`, each test's \`explanation\`, \`questionsForDoctor\`, \`labVarianceNote\`, and \`disclaimer\` in ${getLanguageDisplayName(lang)}.`,
      '5. NEVER diagnose diseases from laboratory results.',
      '6. Explicitly note that laboratory reference ranges vary between laboratories and depend on individual health context.',
      '7. Provide helpful, practical questions the user can ask their doctor.',
      '8. If the uploaded image or PDF is unreadable or does not appear to be a medical report, state that clearly in `summary` in the target language and return an empty tests array rather than fabricating data.',
    ].join('\n'),
  };

  const systemInstruction =
    `You are a meticulous medical report translator responding in ${getLanguageDisplayName(lang)}. Accuracy and honesty come first: never fabricate numbers, units, or reference ranges that are not present in the document.`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      summary: {
        type: Type.STRING,
        description:
          'Plain-language overview of what the report covers and key observations without diagnosing.',
      },
      tests: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            testName: { type: Type.STRING },
            reportedValue: { type: Type.STRING },
            unit: { type: Type.STRING },
            referenceRange: { type: Type.STRING },
            status: {
              type: Type.STRING,
              enum: ['Within Range', 'High', 'Low', 'Not Specified'],
            },
            explanation: {
              type: Type.STRING,
              description: 'Simple everyday explanation of what this test generally measures.',
            },
          },
          required: ['testName', 'reportedValue', 'unit', 'referenceRange', 'status', 'explanation'],
        },
      },
      questionsForDoctor: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      labVarianceNote: {
        type: Type.STRING,
        description:
          'Note explaining that reference ranges vary across laboratories and clinical context.',
      },
      disclaimer: {
        type: Type.STRING,
        description:
          'Reminder to discuss any abnormal or unclear results with a qualified healthcare professional.',
      },
    },
    required: ['summary', 'tests', 'questionsForDoctor', 'labVarianceNote', 'disclaimer'],
  };

  const contents = [
    {
      role: 'user' as const,
      parts: [filePart, textPart],
    },
  ];

  const modelsToTry = [FAST_FALLBACK_MODEL, MODEL_NAME, FAST_FALLBACK_MODEL];
  const startedAt = Date.now();
  let response: GenerateContentResponse | undefined;
  let lastErr: unknown;

  for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
    const targetModel = modelsToTry[attempt];
    const elapsed = Date.now() - startedAt;
    const remaining = 42000 - elapsed;
    if (remaining < 6000) break;

    const budget = Math.min(20000, remaining);
    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: targetModel,
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema,
            ...(targetModel === MODEL_NAME
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        }),
        budget
      );
      break;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
      const isTransient =
        isRateLimit ||
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('overloaded') ||
        msg.includes('504') ||
        msg.includes('DEADLINE_EXCEEDED') ||
        msg.includes('timed out');
      if (!isTransient || attempt === modelsToTry.length - 1) {
        throw err;
      }
      console.warn(
        `[Report Explainer Fallback] ${targetModel} failed (${msg}); trying ${modelsToTry[attempt + 1]}`
      );
      await new Promise((resolve) => setTimeout(resolve, isRateLimit ? 2000 : 800));
    }
  }

  if (!response) {
    throw lastErr ?? new Error('Could not parse medical report: unable to obtain AI response.');
  }

  const rawText = stripJsonCodeFences(response.text ?? '');
  if (!rawText) {
    throw new Error('Could not parse medical report: empty response returned by Gemini AI.');
  }

  let parsed: Record<string, unknown>;
  try {
    const json = JSON.parse(rawText) as unknown;
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new Error('Invalid root JSON type');
    }
    parsed = json as Record<string, unknown>;
  } catch {
    throw new Error('Could not parse medical report: invalid structured response from AI.');
  }

  const summary =
    typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : fallbacks.summary;

  const tests: ExtractedLabTest[] = Array.isArray(parsed.tests)
    ? (parsed.tests as unknown[])
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          testName:
            typeof item.testName === 'string' && item.testName.trim()
              ? item.testName.trim()
              : fallbacks.unnamedTest,
          reportedValue:
            typeof item.reportedValue === 'string' && item.reportedValue.trim()
              ? item.reportedValue.trim()
              : fallbacks.notProvided,
          unit:
            typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : fallbacks.notProvided,
          referenceRange:
            typeof item.referenceRange === 'string' && item.referenceRange.trim()
              ? item.referenceRange.trim()
              : fallbacks.notProvided,
          status: normalizeLabStatus(item.status),
          explanation:
            typeof item.explanation === 'string' && item.explanation.trim()
              ? item.explanation.trim()
              : fallbacks.noExplanation,
        }))
    : [];

  const questionsForDoctor = Array.isArray(parsed.questionsForDoctor)
    ? parsed.questionsForDoctor
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .map((q) => q.trim())
    : [];

  const labVarianceNote =
    typeof parsed.labVarianceNote === 'string' && parsed.labVarianceNote.trim()
      ? parsed.labVarianceNote.trim()
      : fallbacks.labVarianceNote;

  const disclaimer =
    typeof parsed.disclaimer === 'string' && parsed.disclaimer.trim()
      ? parsed.disclaimer.trim()
      : fallbacks.disclaimer;

  return {
    summary,
    tests,
    questionsForDoctor,
    labVarianceNote,
    disclaimer,
  };
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

export interface RetrievedMedicineDocument extends MedicineSource {
  extractedText: string;
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

export function inferOrganizationFromSource(uri: string, title = ''): string {
  const haystack = `${uri} ${title}`.toLowerCase();
  if (haystack.includes('nhs.uk')) return 'NHS (National Health Service)';
  if (haystack.includes('medlineplus.gov')) return 'MedlinePlus (U.S. National Library of Medicine)';
  if (haystack.includes('dailymed.nlm.nih.gov')) return 'DailyMed (U.S. National Library of Medicine)';
  if (haystack.includes('fda.gov')) return 'U.S. Food and Drug Administration (FDA)';
  if (haystack.includes('bnf.nice.org.uk') || haystack.includes('nice.org.uk')) {
    return 'NICE / British National Formulary (BNF)';
  }
  if (haystack.includes('medicines.org.uk')) return 'Electronic Medicines Compendium (eMC)';
  if (haystack.includes('mayoclinic.org')) return 'Mayo Clinic';
  if (haystack.includes('who.int')) return 'World Health Organization (WHO)';
  if (haystack.includes('nih.gov') || haystack.includes('ncbi.nlm.nih.gov')) {
    return 'National Institutes of Health (NIH)';
  }
  if (haystack.includes('drugs.com')) return 'Drugs.com';
  if (haystack.includes('webmd.com')) return 'WebMD';
  try {
    return new URL(uri).hostname.replace(/^www\./, '');
  } catch {
    return 'Medical Reference Source';
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

const INTERNATIONAL_SYNONYMS: Record<string, string[]> = {
  paracetamol: ['paracetamol', 'acetaminophen'],
  acetaminophen: ['acetaminophen', 'paracetamol'],
  salbutamol: ['salbutamol', 'albuterol'],
  albuterol: ['albuterol', 'salbutamol'],
  adrenaline: ['adrenaline', 'epinephrine'],
  epinephrine: ['epinephrine', 'adrenaline'],
  frusemide: ['frusemide', 'furosemide'],
  furosemide: ['furosemide', 'frusemide'],
  lignocaine: ['lignocaine', 'lidocaine'],
  lidocaine: ['lidocaine', 'lignocaine'],
  'glyceryl trinitrate': ['glyceryl trinitrate', 'nitroglycerin'],
  nitroglycerin: ['nitroglycerin', 'glyceryl trinitrate'],
};

function getMedicineSynonyms(medicineName: string): string[] {
  const normalized = medicineName.trim().toLowerCase();
  if (!normalized) return [];
  return INTERNATIONAL_SYNONYMS[normalized] ?? [normalized];
}

function extractCleanMainText(html: string, maxChars = 16000): string {
  const mainBlock =
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html.match(/<div[^>]+id=["']mplus-content["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
    html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    html;

  const cleaned = decodeHtmlEntities(
    mainBlock
      .replace(/<(script|style|noscript|nav|header|footer|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

  return cleaned.slice(0, maxChars);
}

function extractDailyMedClinicalText(xml: string, maxChars = 10500): string {
  const titleMatches = [...xml.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)];
  const clinicalTitleRegex =
    /warning|indication|contraindication|precaution|adverse reaction|side effect|drug interaction|interaction|pregnan|lactation|nursing|specific population|mechanism of action|clinical pharmacology|storage|handling|drug facts|overdosage|purpose|uses|directions|other information|allergy alert|stomach bleeding|heart attack|ask a doctor|stop use|do not use/i;

  if (titleMatches.length >= 3) {
    const priorityBuckets: Array<{ regex: RegExp; slices: string[] }> = [
      { regex: /indication|purpose|uses/i, slices: [] },
      { regex: /mechanism of action|clinical pharmacology/i, slices: [] },
      { regex: /adverse reaction|side effect/i, slices: [] },
      { regex: /pregnan|lactation|nursing|specific population/i, slices: [] },
      { regex: /drug interaction|interaction/i, slices: [] },
      { regex: /storage|handling|other information/i, slices: [] },
      { regex: /warning|precaution|contraindication|allergy alert|stomach bleeding|heart attack|ask a doctor|stop use|do not use|directions|overdosage|drug facts/i, slices: [] },
    ];

    for (let i = 0; i < titleMatches.length; i++) {
      const m = titleMatches[i];
      const titleText = decodeHtmlEntities(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      if (!titleText || !clinicalTitleRegex.test(titleText)) continue;

      const startIdx = m.index ?? 0;
      const endIdx = i + 1 < titleMatches.length ? (titleMatches[i + 1].index ?? xml.length) : xml.length;
      const rawSlice = xml.slice(startIdx, Math.min(endIdx, startIdx + 9000));
      const cleanSlice = decodeHtmlEntities(
        rawSlice.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      ).slice(0, 1250);

      if (cleanSlice.length < 40) continue;
      const bucket = priorityBuckets.find((b) => b.regex.test(titleText)) ?? priorityBuckets[priorityBuckets.length - 1];
      bucket.slices.push(cleanSlice);
    }

    const ordered: string[] = [];
    const seen = new Set<string>();
    let totalLen = 0;

    // Pass 1: take up to 1 slice from each clinical bucket so mechanism, pregnancy, interactions, and storage are never starved
    for (const bucket of priorityBuckets) {
      if (bucket.slices.length === 0) continue;
      const slice = bucket.slices[0];
      if (!seen.has(slice) && totalLen + slice.length + 3 <= maxChars) {
        seen.add(slice);
        ordered.push(slice);
        totalLen += slice.length + 3;
      }
    }

    // Pass 2: fill remaining budget with additional warning/detail slices
    for (const bucket of priorityBuckets) {
      for (const slice of bucket.slices.slice(1)) {
        if (seen.has(slice)) continue;
        if (totalLen + slice.length + 3 > maxChars) break;
        seen.add(slice);
        ordered.push(slice);
        totalLen += slice.length + 3;
      }
    }

    if (ordered.length >= 2) {
      return ordered.join(' | ').slice(0, maxChars);
    }
  }

  return decodeHtmlEntities(xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(
    0,
    maxChars
  );
}

function buildSupportingExcerpt(text: string, maxLen = 280): string {
  let normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  // For NHS hub pages that appended subpages with " | ", skip the short hub nav block
  if (normalized.includes(' | ')) {
    const parts = normalized.split(' | ').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1 && parts[0].length < 1100) {
      normalized = parts.slice(1).join(' | ');
    }
  }

  const markerMatches = [
    /Why is this medication prescribed\?\s+([^?]{40,})/i,
    /Notice:\s+(.+)/i,
    /Drug Facts\s+Active ingredient\s+(.+)/i,
    /1 INDICATIONS AND USAGE\s+([A-Z][\s\S]+)/,
    /INDICATIONS AND USAGE\s+([A-Z][\s\S]+)/,
    /WARNING:\s+([A-Z][\s\S]+)/,
    /What\s+[a-z0-9\s-]+\s+is for\s+([A-Z][\s\S]+)/,
    /About\s+[a-z0-9\s-]+\s+([A-Z][\s\S]+)/,
  ];
  for (const regex of markerMatches) {
    const m = normalized.match(regex);
    const extracted = m?.[1]?.trim() ?? m?.[0]?.trim();
    if (extracted && extracted.length >= 70) {
      return extracted.length > maxLen ? `${extracted.slice(0, maxLen).trimEnd()}...` : extracted;
    }
  }

  // Strip DailyMed "These highlights do not include..." preamble if present
  const withoutHighlights = normalized
    .replace(/^These highlights do not include all the information needed to use[^.]+\.\s*(?:See full prescribing information[^.]+\.\s*)?/i, '')
    .trim();
  const base = withoutHighlights.length >= 80 ? withoutHighlights : normalized;
  return base.length > maxLen ? `${base.slice(0, maxLen).trimEnd()}...` : base;
}

function htmlContainsMedicine(html: string, validTerms: string[]): boolean {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return validTerms.some((term) => plain.includes(term.toLowerCase()));
}

function isCombinationMedicineTitle(title: string, userSearchedCombination: boolean): boolean {
  if (userSearchedCombination) return false;
  const lower = title.toLowerCase();
  return (
    /\bcombination\b/.test(lower) ||
    /\s+(and|with)\s+/.test(lower) ||
    /[+/]/.test(lower)
  );
}

async function fetchDirectNhsPage(medicineName: string): Promise<RetrievedMedicineDocument | null> {
  const validTerms = getMedicineSynonyms(medicineName);
  const candidateSlugs = [
    ...new Set(
      validTerms
        .map((t) => t.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
        .filter(Boolean)
    ),
  ];
  if (candidateSlugs.length === 0) return null;

  const candidates: string[] = [];
  for (const s of candidateSlugs) {
    candidates.push(`https://www.nhs.uk/medicines/${s}/`);
    candidates.push(`https://www.nhs.uk/medicines/${s}-for-adults/`);
  }

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';
      if (!rawTitle || /page not found/i.test(rawTitle)) continue;

      const cleanTitle = rawTitle.replace(/\s*-\s*NHS\s*$/i, '').trim();
      const userSearchedCombination = /\s+(and|with)\s+|[+/]/i.test(medicineName);
      if (isCombinationMedicineTitle(cleanTitle.split(':')[0] || cleanTitle, userSearchedCombination)) {
        continue;
      }
      const titleLower = cleanTitle.toLowerCase();
      if (!validTerms.some((t) => titleLower.includes(t))) continue;
      if (!htmlContainsMedicine(html, validTerms)) continue;

      let combinedText = extractCleanMainText(html, 12500);
      const finalUrlSlug = (res.url || url).match(/\/medicines\/([^/]+)/i)?.[1] ?? candidateSlugs[0];

      // If NHS returned a short medicine hub page, fetch up to 5 linked official subpages
      if (combinedText.length < 2200) {
        const subLinks = [
          ...new Set(
            [
              ...html.matchAll(
                new RegExp(
                  `href=["']((?:https:\\/\\/www\\.nhs\\.uk)?\\/medicines\\/${finalUrlSlug}[^"']*\\/(?:about-|who-can-|how-and-when-|side-effects-|pregnancy-|taking-)[^"']+)["']`,
                  'gi'
                )
              ),
            ].map((m) => (m[1].startsWith('http') ? m[1] : `https://www.nhs.uk${m[1]}`))
          ),
        ].slice(0, 5);

        if (subLinks.length > 0) {
          const subResults = await Promise.allSettled(
            subLinks.map(async (subUrl) => {
              const sr = await fetch(subUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(3000),
              });
              if (!sr.ok) return '';
              const sHtml = await sr.text();
              return extractCleanMainText(sHtml, 2500);
            })
          );
          const extra = subResults
            .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && r.value.length > 0)
            .map((r) => r.value)
            .join(' | ');
          if (extra) {
            combinedText = `${combinedText} | ${extra}`.slice(0, 12500);
          }
        }
      }

      if (combinedText.length < 120) continue;

      const retrievedAt = new Date().toISOString();
      return {
        title: cleanTitle,
        organization: 'NHS (National Health Service)',
        uri: res.url || url,
        retrievedAndUsed: true,
        retrievedAt,
        excerpt: buildSupportingExcerpt(combinedText),
        sourceType: 'official_monograph',
        isProductSpecificLabel: false,
        extractedText: combinedText,
      };
    } catch {
      // ignore unreachable/timeout and try next candidate
    }
  }
  return null;
}

function scoreMedlinePlusIndexEntry(entryTitle: string, validTerms: string[], userSearchedCombination: boolean): number {
  const lower = entryTitle.trim().toLowerCase();
  if (isCombinationMedicineTitle(lower, userSearchedCombination)) return -1;
  if (lower.includes(',')) return -1;

  for (const term of validTerms) {
    if (lower === term) return 100;
    if (lower === `${term} oral` || lower === `${term} tablets` || lower === `${term} capsules`) {
      return 90;
    }
    if (lower.startsWith(`${term} `)) {
      if (/\b(ophthalmic|injection|rectal|topical|nasal|otic|vaginal)\b/.test(lower)) {
        return 40;
      }
      return 60;
    }
  }
  return -1;
}

async function fetchDirectMedlinePlusPage(medicineName: string): Promise<RetrievedMedicineDocument | null> {
  const normalized = medicineName.trim();
  const validTerms = getMedicineSynonyms(normalized);
  const userSearchedCombination = /\s+(and|with)\s+|[+/]/i.test(normalized);
  const termsToCheck = [
    ...new Set([
      ...(normalized.toLowerCase() === 'paracetamol' ? ['acetaminophen'] : []),
      ...validTerms.map((t) => t.toLowerCase()),
    ]),
  ];

  for (const term of termsToCheck) {
    const firstChar = term.charAt(0).toUpperCase();
    if (!/[A-Z]/.test(firstChar)) continue;

    try {
      const indexUrl = `https://medlineplus.gov/druginfo/drug_${firstChar}a.html`;
      const indexRes = await fetch(indexUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(3500),
      });
      if (!indexRes.ok) continue;
      const indexHtml = await indexRes.text();

      const entries = [
        ...indexHtml.matchAll(/<a href="\.\/(meds\/[a-z0-9]+\.html)">([^<]+)<\/a>/gi),
      ]
        .map((m) => ({
          url: `https://medlineplus.gov/druginfo/${m[1]}`,
          title: decodeHtmlEntities(m[2]),
          score: scoreMedlinePlusIndexEntry(
            decodeHtmlEntities(m[2]),
            validTerms,
            userSearchedCombination
          ),
        }))
        .filter((e) => e.score >= 0)
        .sort((a, b) => b.score - a.score);

      for (const match of entries.slice(0, 2)) {
        const pageRes = await fetch(match.url, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(3500),
        });
        if (!pageRes.ok) continue;
        const pageHtml = await pageRes.text();
        const titleMatch = pageHtml.match(/<title>([^<]+)<\/title>/i);
        const cleanTitle = titleMatch
          ? decodeHtmlEntities(titleMatch[1]).replace(/:\s*MedlinePlus Drug Information\s*$/i, '').trim()
          : match.title;

        if (isCombinationMedicineTitle(cleanTitle, userSearchedCombination)) continue;
        if (!validTerms.some((t) => cleanTitle.toLowerCase().includes(t))) continue;
        if (!htmlContainsMedicine(pageHtml, validTerms)) continue;

        const extractedText = extractCleanMainText(pageHtml, 13500);
        if (extractedText.length < 150) continue;

        const retrievedAt = new Date().toISOString();
        return {
          title: cleanTitle,
          organization: 'MedlinePlus (U.S. National Library of Medicine)',
          uri: pageRes.url || match.url,
          retrievedAndUsed: true,
          retrievedAt,
          excerpt: buildSupportingExcerpt(extractedText),
          sourceType: 'official_monograph',
          isProductSpecificLabel: false,
          extractedText,
        };
      }
    } catch {
      // ignore timeout/network error
    }
  }
  return null;
}

const SALT_WORDS_REGEX = /\b(sodium|hydrochloride|hcl|potassium|calcium|maleate|tartrate|mesylate|besylate|phosphate|sulfate|acetate|succinate|fumarate|citrate)\b/gi;

function stripPharmaceuticalSalts(phrase: string): string {
  return phrase
    .replace(SALT_WORDS_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function scoreDailyMedTitle(splTitle: string, validTerms: string[], userSearchedCombination: boolean): number {
  const upper = splTitle.trim();
  const withoutVendor = upper.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
  if (!withoutVendor) return -1;

  const parens = [...withoutVendor.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
  if (parens.length > 0) {
    const ingredientParen = parens[parens.length - 1];
    if (
      !userSearchedCombination &&
      (/,|\band\b|\bwith\b|[+/]/i.test(ingredientParen))
    ) {
      return -1;
    }
    const baseIngredient = stripPharmaceuticalSalts(ingredientParen);
    if (!validTerms.some((t) => baseIngredient === t)) {
      return -1;
    }
  } else {
    const ingredientPrefix = withoutVendor
      .split(/\b(tablet|capsule|caplet|solution|suspension|injection|powder|liquid|syrup|gelcap|chewable|orally|delayed|extended|film|coated|oral|cream|ointment|drops)\b/i)[0]
      .trim();

    if (
      !userSearchedCombination &&
      (/,|\band\b|\bwith\b|[+/]/i.test(ingredientPrefix))
    ) {
      return -1;
    }
    const baseIngredient = stripPharmaceuticalSalts(ingredientPrefix);
    if (!validTerms.some((t) => baseIngredient === t)) {
      return -1;
    }
  }

  let score = 50;
  if (/\b(tablet|capsule|caplet)\b/i.test(withoutVendor)) score += 25;
  else if (/\b(solution|suspension|syrup|liquid)\b/i.test(withoutVendor)) score += 10;
  if (/\b(injection|i\.v\.|intravenous|lyophilized|suppository)\b/i.test(withoutVendor)) score -= 25;
  if (validTerms.some((t) => withoutVendor.toLowerCase().startsWith(t))) score += 10;
  return score;
}

async function fetchDirectDailyMedPage(medicineName: string): Promise<RetrievedMedicineDocument | null> {
  const normalized = medicineName.trim();
  const validTerms = getMedicineSynonyms(normalized);
  const userSearchedCombination = /\s+(and|with)\s+|[+/]/i.test(normalized);
  const termsToQuery = [
    ...new Set([
      ...(normalized.toLowerCase() === 'paracetamol' ? ['acetaminophen'] : []),
      ...validTerms,
    ]),
  ];

  for (const term of termsToQuery) {
    try {
      const apiUrl = `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${encodeURIComponent(term)}&pagesize=50`;
      const res = await fetch(apiUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: Array<{ title?: string; setid?: string }> };
      const ranked = (json?.data ?? [])
        .filter((d): d is { title: string; setid: string } => Boolean(d.title && d.setid))
        .map((d) => ({
          title: d.title.trim(),
          setid: d.setid,
          score: scoreDailyMedTitle(d.title, validTerms, userSearchedCombination),
        }))
        .filter((d) => d.score >= 0)
        .sort((a, b) => b.score - a.score);

      for (const candidate of ranked.slice(0, 2)) {
        const pageUrl = `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(candidate.setid)}`;
        const xmlUrl = `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${encodeURIComponent(candidate.setid)}.xml`;

        const [pageRes, xmlRes] = await Promise.allSettled([
          fetch(pageUrl, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(3500) }),
          fetch(xmlUrl, { method: 'GET', signal: AbortSignal.timeout(4000) }),
        ]);

        if (pageRes.status !== 'fulfilled' || !pageRes.value.ok) continue;
        const pageHtml = await pageRes.value.text();
        if (!htmlContainsMedicine(pageHtml, validTerms)) continue;

        let extractedText = '';
        if (xmlRes.status === 'fulfilled' && xmlRes.value.ok) {
          const xmlText = await xmlRes.value.text();
          extractedText = extractDailyMedClinicalText(xmlText, 10500);
        } else {
          extractedText = extractCleanMainText(pageHtml, 10500);
        }
        if (extractedText.length < 120) continue;

        const retrievedAt = new Date().toISOString();
        return {
          title: candidate.title,
          organization: 'DailyMed (U.S. National Library of Medicine)',
          uri: pageUrl,
          retrievedAndUsed: true,
          retrievedAt,
          excerpt: buildSupportingExcerpt(extractedText),
          sourceType: 'product_label',
          isProductSpecificLabel: true,
          extractedText,
        };
      }
    } catch {
      // ignore timeout/network error
    }
  }
  return null;
}

export async function lookupTrustedMedicinePages(
  medicineName: string
): Promise<RetrievedMedicineDocument[]> {
  try {
    const results = await Promise.allSettled([
      withTimeout(fetchDirectNhsPage(medicineName), 8500).catch(() => null),
      withTimeout(fetchDirectMedlinePlusPage(medicineName), 8500).catch(() => null),
      withTimeout(fetchDirectDailyMedPage(medicineName), 8500).catch(() => null),
    ]);

    const seenUris = new Set<string>();
    const docs: RetrievedMedicineDocument[] = [];
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value && !seenUris.has(res.value.uri)) {
        seenUris.add(res.value.uri);
        docs.push(res.value);
      }
    }
    return docs;
  } catch {
    return [];
  }
}

export function normalizeTextForVerification(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function verifyQuoteInSourceText(quote: string, sourceText: string): boolean {
  const normQuote = normalizeTextForVerification(quote);
  const normSource = normalizeTextForVerification(sourceText);
  if (!normQuote || normQuote.length < 20 || !normSource) return false;
  if (normSource.includes(normQuote)) return true;

  const words = normQuote.split(' ').filter(Boolean);
  const windowSize = Math.min(words.length, 6);
  if (windowSize < 5) return false;

  // Require at least two matching 6-word anchors or one long 8-word anchor for minor punctuation/spacing variance
  if (words.length >= 8) {
    for (let i = 0; i <= words.length - 8; i++) {
      const phrase = words.slice(i, i + 8).join(' ');
      if (normSource.includes(phrase)) return true;
    }
  }

  let matchedWindows = 0;
  for (let i = 0; i <= words.length - windowSize; i += Math.max(1, Math.floor(windowSize / 2))) {
    const phrase = words.slice(i, i + windowSize).join(' ');
    if (normSource.includes(phrase)) {
      matchedWindows++;
      if (matchedWindows >= 1 && words.length <= 10) return true;
      if (matchedWindows >= 2) return true;
    }
  }
  return false;
}

export interface GroundingSupportItem {
  segment?: { text?: string };
  groundingChunkIndices?: number[];
}

export function extractGroundedMedicineSources(
  groundingChunks: Array<{ web?: { uri?: string; title?: string } }>,
  groundingSupports: GroundingSupportItem[] = [],
  retrievedAt = new Date().toISOString()
): MedicineSource[] {
  const chunkExcerpts = new Map<number, string>();
  for (const sup of groundingSupports) {
    const segText = sup.segment?.text?.trim();
    if (!segText) continue;
    for (const idx of sup.groundingChunkIndices ?? []) {
      if (!chunkExcerpts.has(idx)) {
        chunkExcerpts.set(idx, segText);
      }
    }
  }

  const seenUris = new Set<string>();
  const sources: MedicineSource[] = [];
  groundingChunks.forEach((chunk, index) => {
    const web = chunk.web;
    const excerpt = chunkExcerpts.get(index);
    if (web?.uri && excerpt && !seenUris.has(web.uri)) {
      seenUris.add(web.uri);
      const title = (web.title || web.uri).trim();
      const isDailyMed = web.uri.toLowerCase().includes('dailymed.nlm.nih.gov');
      sources.push({
        title,
        organization: inferOrganizationFromSource(web.uri, title),
        uri: web.uri,
        retrievedAndUsed: true,
        retrievedAt,
        excerpt: excerpt.length > 280 ? `${excerpt.slice(0, 280).trimEnd()}...` : excerpt,
        sourceType: isDailyMed ? 'product_label' : 'web_reference',
        isProductSpecificLabel: isDailyMed,
      });
    }
  });
  return sources;
}

export async function buildMedicineInfoResult(params: {
  medicineName: string;
  markdownContent: string;
  sections?: MedicineSection[];
  searchAttemptSucceeded: boolean;
  groundingChunks: Array<{ web?: { uri?: string; title?: string } }>;
  groundingSupports?: GroundingSupportItem[];
  retrievedOfficialDocs?: RetrievedMedicineDocument[];
  usedRetrievedContent?: boolean;
}): Promise<MedicineInfoResult> {
  const nowIso = new Date().toISOString();
  const groundedSources = params.searchAttemptSucceeded
    ? extractGroundedMedicineSources(params.groundingChunks, params.groundingSupports ?? [], nowIso)
    : [];

  if (params.searchAttemptSucceeded && groundedSources.length > 0) {
    return {
      medicineName: params.medicineName,
      markdownContent: params.markdownContent,
      sections: params.sections,
      groundingStatus: 'live_grounded',
      verificationNote:
        'Live web medical sources were retrieved via Google Search grounding and linked to supporting excerpts.',
      retrievedAt: nowIso,
      sources: groundedSources,
    };
  }

  const officialDocs = (params.retrievedOfficialDocs ?? []).filter(
    (doc) => doc.retrievedAndUsed && doc.extractedText.trim().length >= 120
  );
  if (params.usedRetrievedContent && officialDocs.length > 0) {
    const earliestRetrievedAt = officialDocs[0].retrievedAt || nowIso;
    return {
      medicineName: params.medicineName,
      markdownContent: params.markdownContent,
      sections: params.sections,
      groundingStatus: 'live_source_retrieved',
      verificationNote:
        'Live official source content from NHS, MedlinePlus, and/or DailyMed was fetched, matched to this medicine, and used with verified supporting excerpts.',
      retrievedAt: earliestRetrievedAt,
      sources: officialDocs.map(
        ({ title, organization, uri, retrievedAt, excerpt, sourceType, isProductSpecificLabel }) => ({
          title,
          organization,
          uri,
          retrievedAndUsed: true,
          retrievedAt: retrievedAt || earliestRetrievedAt,
          excerpt,
          sourceType,
          isProductSpecificLabel,
        })
      ),
    };
  }

  return {
    medicineName: params.medicineName,
    markdownContent: params.markdownContent,
    sections: params.sections?.map((s) => ({
      ...s,
      supportingExcerpts: [],
      verificationStatus: 'general_knowledge',
    })),
    groundingStatus: 'general_knowledge',
    verificationNote:
      'Live source content retrieval could not be confirmed, so this response was generated from general AI medical knowledge.',
    sources: [],
  };
}

interface RawStructuredMedicineSection {
  heading?: unknown;
  contentMarkdown?: unknown;
  supportingQuotes?: Array<{ sourceIndex?: unknown; quote?: unknown }>;
}

function isPronunciationOrVagueStubQuote(quote: string, heading: string): boolean {
  const normalized = quote.replace(/\s+/g, ' ').trim();
  if (!normalized) return true;

  // Reject pronunciation guides (e.g., "Amoxicillin — pronounced as (a mox i sil' in)")
  if (/\bpronounced\s+as\b|\bpronunciation\b/i.test(normalized)) {
    return true;
  }
  if (
    /generic name/i.test(heading) &&
    /\([^)]*['’][a-z]+/i.test(normalized) &&
    !/\b(?:class of medications|used to treat|active ingredient|medicine|painkiller|antibiotic|antihistamine|proton pump|biguanide|nsaid|analgesic)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  // Reject vague non-evidential lead-in sentences with no specific clinical details
  if (
    /^(?:[a-z0-9\s-]+\s+)?may cause side effects\.?\s*(?:tell your doctor if any of these symptoms are severe or do not go away:?)?$/i.test(
      normalized
    ) ||
    /^other side effects not listed may also occur\.?$/i.test(normalized) ||
    /^serious side effects (?:are rare|can happen)[^a-z0-9]*$/i.test(normalized) ||
    /^before taking [a-z0-9\s-]+,?\s*tell your doctor or pharmacist\.?$/i.test(normalized)
  ) {
    return true;
  }

  return false;
}

const SYMPTOM_SYNONYM_GROUPS: string[][] = [
  ['diarrhea', 'diarrhoea', 'loose stools', 'watery stools'],
  ['nausea', 'feeling sick', 'queasy'],
  ['vomiting', 'being sick', 'throw up', 'throwing up'],
  ['stomach pain', 'stomach ache', 'stomach aches', 'abdominal pain', 'tummy pain', 'abdominal discomfort'],
  ['indigestion', 'dyspepsia', 'heartburn', 'upset stomach'],
  ['arthralgia', 'joint pain', 'pain in the joints'],
  ['urticaria', 'hives', 'nettle rash', 'itchy raised rash', 'raised rash'],
  ['drowsiness', 'drowsy', 'sleepy', 'sleepiness', 'somnolence', 'tiredness', 'excessive tiredness', 'fatigue'],
  ['dizziness', 'dizzy', 'vertigo', 'lightheaded'],
  ['headache', 'headaches'],
  ['shortness of breath', 'difficulty breathing', 'trouble breathing', 'struggling to breathe', 'wheezy', 'wheezing', 'breathless'],
  ['anaphylaxis', 'anaphylactoid', 'severe allergic reaction', 'allergic reaction', 'allergy alert', 'hypersensitivity'],
  ['jaundice', 'yellowing of the skin', 'yellowing of the eyes', 'yellow skin', 'yellow eyes'],
  ['pruritus', 'itching', 'itchy'],
  ['oedema', 'edema'],
  ['black tarry stools', 'black stools', 'tarry stools', 'blood in the stool', 'blood in your poo', 'bloody stools'],
  ['vomiting blood', 'vomit blood', 'coffee grounds'],
  ['stomach ulcer', 'peptic ulcer', 'gastric ulcer', 'gastrointestinal ulcer'],
  ['stomach bleeding', 'gastrointestinal bleeding', 'gi bleeding', 'bleeding in the stomach', 'bleeding in your stomach'],
  ['skin blistering', 'blisters', 'blistering', 'peeling skin', 'peeling'],
  ['constipation'],
  ['flatulence', 'gas', 'bloating', 'wind'],
  ['dry mouth'],
  ['rash', 'skin reddening', 'red skin', 'skin reactions'],
  ['hearing', 'ringing in the ears', 'tinnitus'],
  ['blurred vision', 'changes in vision', 'vision problems'],
  ['tooth discoloration', 'discoloration of teeth', 'staining of teeth'],
  ['fever', 'high temperature'],
  ['chest pain'],
  ['slurred speech'],
  ['weakness in one part', 'weakness on one side', 'weakness in one side'],
  ['loss of consciousness', 'unconscious', 'faint', 'fainting', 'collapse', 'shock'],
  ['kidney', 'renal', 'nephritis', 'bloody urine', 'cloudy urine', 'difficult urination', 'painful urination', 'decreased urination'],
  ['liver', 'hepatic', 'dark urine', 'pale stools', 'upper right stomach'],
  ['heart failure', 'heart problems', 'fast heartbeat', 'palpitations', 'weight gain'],
  ['bone fracture', 'fractures', 'osteoporosis'],
  ['vitamin b12', 'b12 deficiency'],
  ['clostridium difficile', 'c. difficile', 'c diff'],
  ['lactic acidosis'],
  ['yeast infection', 'thrush', 'vaginal itching', 'oral thrush'],
  ['lupus', 'autoimmune'],
  ['low magnesium', 'hypomagnesemia'],
];

const GENERIC_SYMPTOM_STOPWORDS = new Set([
  'side', 'effect', 'effects', 'common', 'uncommon', 'rare', 'very', 'serious', 'severe',
  'emergency', 'warning', 'signs', 'sign', 'symptoms', 'symptom', 'problems', 'problem',
  'issues', 'issue', 'reactions', 'reaction', 'including', 'include', 'includes',
  'such', 'feeling', 'mild', 'moderate', 'persistent', 'sudden', 'new', 'other',
  'medical', 'advice', 'doctor', 'pharmacist', 'care', 'prompt', 'immediate',
  'seek', 'call', 'stop', 'taking', 'medicine', 'medication', 'area', 'part', 'body',
  'blood', 'pain', 'changes', 'temporary', 'potential', 'possible', 'risk',
]);

function normalizeClinicalText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\bdiarrhoea\b/g, 'diarrhea')
    .replace(/\boedema\b/g, 'edema')
    .replace(/\bswollen\b/g, 'swelling')
    .replace(/\banaemia\b/g, 'anemia')
    .replace(/\bhaemorrhage\b/g, 'hemorrhage')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLegSwellingPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\bleg\s+swelling\b/.test(lower) ||
    /\bswelling\s+of\s+(?:the\s+|your\s+)?(?:[a-z]+,\s*)*(?:lower\s+)?legs?\b/.test(lower) ||
    /\bswollen\s+(?:legs?|ankles?|feet)\b/.test(lower)
  );
}

function isSymptomSupportedByExcerpts(symptomPhrase: string, normExcerpts: string): boolean {
  const normPhrase = normalizeClinicalText(symptomPhrase);
  if (!normPhrase) return false;
  if (normExcerpts.includes(normPhrase)) return true;

  // Check synonym group match
  for (const group of SYMPTOM_SYNONYM_GROUPS) {
    const phraseMatchesGroup = group.some((syn) => normPhrase.includes(normalizeClinicalText(syn)));
    if (phraseMatchesGroup) {
      if (group.some((syn) => normExcerpts.includes(normalizeClinicalText(syn)))) {
        return true;
      }
    }
  }

  // Fallback: meaningful clinical content tokens (>=4 chars, non-stopword) must ALL appear as whole words in excerpts
  // so generic words like "skin" cannot validate unquoted terms like "skin rash" from "peeling skin"
  const tokens = normPhrase
    .split(' ')
    .filter(
      (t) =>
        t.length >= 4 &&
        !GENERIC_SYMPTOM_STOPWORDS.has(t) &&
        !['skin', 'mouth', 'throat', 'eyes', 'face', 'nose', 'lips', 'ears', 'urine', 'stools', 'stool', 'with', 'from', 'that', 'this', 'your', 'into', 'have', 'when', 'more', 'less', 'severe', 'mild', 'rare', 'very', 'difficulty', 'trouble'].includes(
          t
        )
    );
  if (tokens.length === 0) {
    // Use all >=4-char non-stopword tokens requiring all of them to match
    const strictTokens = normPhrase
      .split(' ')
      .filter((t) => t.length >= 4 && !GENERIC_SYMPTOM_STOPWORDS.has(t));
    if (strictTokens.length === 0) return true;
    return strictTokens.every((tok) => new RegExp(`\\b${tok}\\b`).test(normExcerpts));
  }
  return tokens.every((tok) => new RegExp(`\\b${tok}\\b`).test(normExcerpts));
}

function splitPreservingParens(listText: string): string[] {
  const items: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < listText.length; i++) {
    const ch = listText[i];
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;

    if (depth === 0 && (ch === ',' || ch === ';')) {
      const trimmed = current.trim();
      if (trimmed) items.push(trimmed);
      current = '';
    } else {
      current += ch;
    }
  }
  const tail = current.trim();
  if (tail) items.push(tail);

  const expanded: string[] = [];
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx].replace(/^(?:and|or)\s+/i, '').trim();
    if (!item) continue;
    if (
      idx === items.length - 1 &&
      !/\([^)]*(?:and|or)[^)]*\)/i.test(item) &&
      /\s+(?:and|or)\s+/i.test(item) &&
      !/\b(?:black and tarry|redness or swelling|part or side|skin or eyes|nose, mouth|face, lips|yellowing of the skin or eyes|swelling of (?:the )?[a-z]+ or [a-z]+|raised,?\s+and\s+itchy|achieving,?\s+and\s+maintaining|blistering,?\s+peeling,?\s+or\s+bleeding)\b/i.test(
        item
      )
    ) {
      const subParts = item.split(/\s+(?:and|or)\s+/i).map((p) => p.trim()).filter(Boolean);
      expanded.push(...subParts);
    } else {
      expanded.push(item);
    }
  }
  return expanded;
}

const COMPOUND_BODY_PARTS_RE =
  /^(?:the\s+|your\s+)?(?:face|lips|tongue|throat|mouth|nose|eyes|hands|arms|feet|ankles|legs|lower legs|abdomen|genitals)$/i;

function filterSymptomListItems(
  rawList: string,
  normExcerpts: string,
  excludeLegSwelling: boolean
): string[] {
  const rawItems = splitPreservingParens(rawList);
  const mergedItems: string[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    if (
      rawItems[i].toLowerCase() === 'black' &&
      i + 1 < rawItems.length &&
      /tarry stools/i.test(rawItems[i + 1])
    ) {
      mergedItems.push(`${rawItems[i]}, ${rawItems[i + 1]}`);
      i++;
    } else {
      mergedItems.push(rawItems[i]);
    }
  }

  let activePrefix = '';
  let headItemWasKept = false;
  const kept: string[] = [];

  for (const item of mergedItems) {
    const prefixMatch = item.match(
      /^((?:(?:sudden|severe|unexplained|new)\s+)?(?:swelling|yellowing|bleeding|blistering|peeling|redness)\s+(?:of|in|on)\s+(?:the\s+|your\s+)?)(.+)$/i
    );
    if (prefixMatch) {
      activePrefix = prefixMatch[1];
      headItemWasKept = false;
    } else if (!COMPOUND_BODY_PARTS_RE.test(item)) {
      activePrefix = '';
      headItemWasKept = false;
    }

    const isBareBodyPart = !prefixMatch && Boolean(activePrefix) && COMPOUND_BODY_PARTS_RE.test(item);
    const effectiveCheck = isBareBodyPart ? `${activePrefix}${item}` : item;

    if (excludeLegSwelling && isLegSwellingPhrase(effectiveCheck)) {
      continue;
    }
    if (!isSymptomSupportedByExcerpts(effectiveCheck, normExcerpts)) {
      continue;
    }

    if (prefixMatch) {
      headItemWasKept = true;
      kept.push(item);
    } else if (isBareBodyPart && !headItemWasKept) {
      headItemWasKept = true;
      kept.push(`${activePrefix}${item}`);
    } else {
      kept.push(item);
    }
  }

  return kept;
}

function joinGrammaticalList(items: string[], conjunction = 'and'): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`;
}

function sanitizeSideEffectsSentence(
  sentence: string,
  normExcerpts: string,
  inEmergencyContext: boolean
): string | null {
  let s = sentence.trim();
  if (!s) return null;

  const isHeartAttackOrStrokeSentence =
    /\b(?:heart attack|stroke|heart problems)\b/i.test(s);
  const excludeLegSwelling = inEmergencyContext || isHeartAttackOrStrokeSentence;

  const hasFrequencyInExcerpts =
    /\b(?:common side effects?|most common adverse|very common|uncommon|rare(?:ly)?|more than \d+|greater than \d+|>\s*\d+%|\d+ in \d+)\b/i.test(
      normExcerpts
    );

  if (hasFrequencyInExcerpts) {
    s = s.replace(
      /\bReported Side Effects\s*\(frequency not specified in retrieved sources\)/gi,
      'Common Side Effects'
    );
  } else {
    s = s.replace(/\bCommon side effects include\b/gi, 'Reported side effects include');
    s = s.replace(/\bCommonly reported (?:side )?effects\b/gi, 'Reported side effects');
    s = s.replace(/\bCommonly reported reactions\b/gi, 'Reported reactions');
  }

  // Filter inline symptom lists whether introduced via "include/such as/are" OR "if you experience/develop/notice/get"
  const listMatch = s.match(
    /^(.*?(?:\b(?:include|including|such as|are)\b:?|\bif you (?:experience|develop|notice|have|get)(?:\s+(?:symptoms(?:\s+of[^,]+?)?\s+such\s+as|signs(?:\s+or\s+symptoms)?\s+of[^,]+?\s+such\s+as|such\s+as))?\b:?))\s+([^.!?]+?)([.!?]?)$/i
  );
  if (listMatch && (listMatch[2].includes(',') || /\s+(?:and|or)\s+/i.test(listMatch[2]))) {
    let [, prefix, rawList, suffix] = listMatch;
    const extraSuchAs = rawList.match(/^((?:signs(?:\s+or\s+symptoms)?\s+of[^,]*?\s+|symptoms\s+)?such\s+as)\s+(.+)$/i);
    if (extraSuchAs) {
      if (/\b(?:experience|develop|notice|have|get)\s*$/i.test(prefix) && /^such\s+as$/i.test(extraSuchAs[1])) {
        rawList = extraSuchAs[2];
      } else {
        prefix = `${prefix} ${extraSuchAs[1]}`;
        rawList = extraSuchAs[2];
      }
    }
    // Skip non-symptom guidance clauses like "require immediate emergency care"
    if (
      !/\b(?:consulting|professional|healthcare|medical advice|emergency care|emergency help|prescription|pharmacist|doctor|physician)\b/i.test(
        rawList
      )
    ) {
      const kept = filterSymptomListItems(rawList, normExcerpts, excludeLegSwelling);
      if (kept.length === 0) return null;
      const conj = /\bor\b/i.test(rawList) && !/\band\b/i.test(rawList) ? 'or' : 'and';
      const cleanedSuffix = suffix.trim() || '.';
      s = `${prefix} ${joinGrammaticalList(kept, conj)}${cleanedSuffix}`
        .replace(/\b(if you (?:experience|develop|notice|have|get))\s+(?:such as|including)\b/gi, '$1')
        .replace(/\s+\./g, '.')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
  } else if (excludeLegSwelling && isLegSwellingPhrase(s)) {
    const withoutLeg = s
      .replace(/,?\s*\band\s+leg\s+swelling\b/gi, '')
      .replace(/\bleg\s+swelling\s*,?\s*/gi, '')
      .replace(/,?\s*\band\s+swelling\s+of\s+(?:the\s+|your\s+)?(?:[a-z]+,\s*)*(?:lower\s+)?legs?\b/gi, '')
      .replace(/\bswelling\s+of\s+(?:the\s+|your\s+)?(?:[a-z]+,\s*)*(?:lower\s+)?legs?\s*,?\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/,\s*\./g, '.')
      .trim();
    if (!withoutLeg || withoutLeg.length < 15) return null;
    s = withoutLeg;
  }

  return s;
}

const SPECIFIC_INTERACTION_EXAMPLES = [
  'warfarin', 'anticoagulants', 'aspirin', 'naproxen', 'ibuprofen', 'steroids', 'oral steroids',
  'ssris', 'snris', 'diuretics', 'methotrexate', 'probenecid', 'allopurinol', 'iron',
  'st john', "st. john's wort", 'rilpivirine', 'rifampicin', 'itraconazole', 'posaconazole',
  'voriconazole', 'cimetidine', 'furosemide', 'digoxin', 'lithium', 'cyclosporine',
  'metformin', 'insulin', 'oral contraceptives', 'hormonal contraceptives', 'alcohol',
];

function stripUnsupportedClaimsFromContent(
  heading: string,
  contentMarkdown: string,
  excerptsCorpus: string,
  combinedSourceText = ''
): string {
  const normExcerpts = normalizeClinicalText(excerptsCorpus);
  const normCombined = normalizeClinicalText(combinedSourceText);
  const isSideEffects = /side effects/i.test(heading);
  const isInteractions = /interaction/i.test(heading);
  const isPregnancy = /pregnan/i.test(heading);
  const isStorage = /storage/i.test(heading);

  const hasAcuteCardiacOrStrokeSymptomsInExcerpts =
    /\b(?:chest pain|slurred speech|weakness in one part|weakness on one side)\b/i.test(normExcerpts);
  const srcSupportsHeartAttack =
    /\b(?:heart attack|myocardial infarction|cardiovascular thrombotic)\b/i.test(normExcerpts) ||
    (hasAcuteCardiacOrStrokeSymptomsInExcerpts &&
      /\b(?:heart attack|myocardial infarction|cardiovascular thrombotic)\b/i.test(normCombined));
  const srcSupportsStroke =
    /\b(?:stroke|cerebrovascular)\b/i.test(normExcerpts) ||
    (hasAcuteCardiacOrStrokeSymptomsInExcerpts &&
      /\b(?:stroke|cerebrovascular)\b/i.test(normCombined));
  const srcSupportsStomachBleeding =
    /\b(?:stomach bleeding|gastrointestinal bleeding|gi bleeding|bleeding in the stomach|bleeding in your stomach|gastrointestinal ulcer|stomach ulcer|peptic ulcer|vomiting blood|vomit blood|black tarry|tarry stools|black stools|blood in the stool|blood in your poo)\b/i.test(
      normExcerpts
    );
  const srcSupportsAllergy =
    /\b(?:anaphylaxis|anaphylactoid|allergic reaction|allergy alert|hypersensitivity|swelling of (?:the |your )?(?:face|lips|tongue|mouth|throat)|swelling in and around the mouth|lips mouth throat or tongue|difficulty swallowing|difficulty breathing|trouble breathing)\b/i.test(
      normExcerpts
    ) || /\bdifficulty\b[^.]{0,35}\bbreathing\b/i.test(normExcerpts);
  const srcSupportsKidney =
    /\b(?:kidney|renal|interstitial nephritis|bloody urine|painful urination)\b/i.test(normExcerpts);
  const srcSupportsLiver =
    /\b(?:liver|hepatic|jaundice|yellowing of the skin|yellowing of the eyes|cirrhosis)\b/i.test(
      normExcerpts
    );
  const srcSupportsBoneFracture = /\b(?:fracture|osteoporosis)\b/i.test(normExcerpts);
  const srcSupportsB12 = /\b(?:vitamin b12|b12 deficiency)\b/i.test(normExcerpts);
  const srcSupportsCDiff = /\b(?:clostridium difficile|c difficile)\b/i.test(normExcerpts);
  const srcSupportsLossOfConsciousness =
    /\b(?:loss of consciousness|unconscious|faint|fainting|collapse|shock)\b/i.test(normExcerpts);
  const srcSupportsLacticAcidosis = /\blactic acidosis\b/i.test(normExcerpts);
  const srcSupportsStorage =
    /\b(?:store|storage|room temperature|keep out of reach|keep all medication out of sight|cool dry|tightly closed|protect from light|moisture|refrigerat|\d+\s*c|\d+\s*f)\b/i.test(
      normExcerpts
    );
  const srcSupportsDisposal =
    /\b(?:dispose|disposal|flush|take back|unused medicine|unused liquid|return them to a pharmac)\b/i.test(
      normExcerpts
    );
  const srcSupportsPregnancy =
    /\b(?:pregnan|unborn|fetus|trimester|gestation)\b/i.test(normExcerpts);
  const srcSupportsBreastfeeding =
    /\b(?:breastfeed|breast feed|breast milk|lactation|nursing)\b/i.test(normExcerpts);

  const lines = contentMarkdown.split('\n');
  const keptLines: string[] = [];
  let sideEffectContext: 'reported' | 'serious' | 'emergency' = 'reported';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      keptLines.push(line);
      continue;
    }

    if (isSideEffects) {
      if (/\b(?:emergency warning|immediate emergency|immediate action|999|911)\b/i.test(trimmed)) {
        sideEffectContext = 'emergency';
      } else if (/\b(?:serious adverse|serious side effects|prompt professional|prompt medical)\b/i.test(trimmed)) {
        sideEffectContext = 'serious';
      } else if (/\b(?:common|reported side effects|uncommon|rare)\b/i.test(trimmed)) {
        sideEffectContext = 'reported';
      }
    }

    const bulletPrefixMatch = trimmed.match(/^([-*•]|\d+\.)\s+(.*)$/);
    if (bulletPrefixMatch && isSideEffects) {
      const [, bulletMarker, bulletBody] = bulletPrefixMatch;
      const excludeLeg = sideEffectContext === 'emergency';

      // Handle labeled bullets like "**Reported symptoms:** nausea, headache"
      const boldPrefixMatch = bulletBody.match(/^(\*\*[^*]+:\*\*)\s*(.+)$/);
      if (boldPrefixMatch) {
        const [, boldLabel, restOfBullet] = boldPrefixMatch;
        if (restOfBullet.includes(',') || /\s+(?:and|or)\s+/i.test(restOfBullet)) {
          const keptItems = filterSymptomListItems(restOfBullet, normExcerpts, excludeLeg);
          if (keptItems.length === 0) continue;
          const conj = /\bor\b/i.test(restOfBullet) && !/\band\b/i.test(restOfBullet) ? 'or' : 'and';
          const leadingIndent = line.match(/^\s*/)?.[0] ?? '';
          keptLines.push(`${leadingIndent}${bulletMarker} ${boldLabel} ${joinGrammaticalList(keptItems, conj)}.`);
          continue;
        }
      }

      const isGuidanceOrHeader =
        /\*\*[^*]+:\*\*/.test(bulletBody) ||
        /\b(?:seek prompt|seek immediate|consult a doctor|do not stop|require immediate emergency|prompt medical advice)\b/i.test(
          bulletBody
        );
      if (!isGuidanceOrHeader) {
        if (bulletBody.includes(',') || /\s+(?:and|or)\s+/i.test(bulletBody)) {
          const keptItems = filterSymptomListItems(bulletBody, normExcerpts, excludeLeg);
          if (keptItems.length === 0) continue;
          const leadingIndent = line.match(/^\s*/)?.[0] ?? '';
          const conj = /\bor\b/i.test(bulletBody) && !/\band\b/i.test(bulletBody) ? 'or' : 'and';
          keptLines.push(`${leadingIndent}${bulletMarker} ${joinGrammaticalList(keptItems, conj)}`);
          continue;
        }
        if (excludeLeg && isLegSwellingPhrase(bulletBody)) {
          continue;
        }
        if (!isSymptomSupportedByExcerpts(bulletBody, normExcerpts)) {
          continue;
        }
      }
      // Also sanitize inside bullet body if it contains comma-separated symptoms
      const sanitizedBullet = sanitizeSideEffectsSentence(bulletBody, normExcerpts, excludeLeg);
      if (!sanitizedBullet) continue;
      const leadingIndent = line.match(/^\s*/)?.[0] ?? '';
      keptLines.push(`${leadingIndent}${bulletMarker} ${sanitizedBullet}`);
      continue;
    }

    const lineToSplit =
      isSideEffects && sideEffectContext === 'serious'
        ? trimmed.replace(
            /^stop taking [^,.;]+ and (?:contact|call|see|talk to) (?:a|your) (?:doctor|healthcare professional)/i,
            'Contact a doctor promptly'
          )
        : trimmed;

    const sentences = lineToSplit.split(/(?<=[.!?])\s+/);
    const keptSentences: string[] = [];

    for (const sentence of sentences) {
      let s = sentence.trim();
      if (!s) continue;

      if (!srcSupportsHeartAttack && /\b(?:heart attack|myocardial infarction)\b/i.test(s)) continue;
      if (!srcSupportsStroke && /\b(?:stroke|cerebrovascular)\b/i.test(s)) continue;
      if (
        !srcSupportsStomachBleeding &&
        /\b(?:stomach bleeding|gastrointestinal bleeding|gi bleeding|bleeding in (?:your|the) stomach|tarry stools|vomiting blood|stomach ulcer|peptic ulcer)\b/i.test(
          s
        )
      ) {
        continue;
      }
      if (!srcSupportsAllergy && /\b(?:anaphylaxis|anaphylactoid|severe allergic reaction)\b/i.test(s)) {
        continue;
      }
      if (!srcSupportsKidney && /\b(?:kidney problems|kidney disease|kidney failure|kidney impairment|interstitial nephritis|renal)\b/i.test(s)) {
        if (isPregnancy && /\bliver\b/i.test(s) && srcSupportsLiver) {
          s = s
            .replace(/\bkidney\s+(?:or|and)\s+liver\s+(problems|disease|issues|impairment|damage)\b/gi, 'liver $1')
            .replace(/\bkidney\s+(?:or|and)\s+(?=liver)/gi, '')
            .replace(/\s*(?:,|or|and)\s*\bkidney\s+(?:problems|disease|issues|impairment|failure)\b/gi, '');
        } else {
          continue;
        }
      }
      if (!srcSupportsLiver && /\b(?:liver problems|liver disease|liver damage|liver issues|liver impairment|hepatic|jaundice)\b/i.test(s)) {
        if (isPregnancy && /\bkidney\b/i.test(s) && srcSupportsKidney) {
          s = s
            .replace(/\bkidney\s+(?:or|and)\s+liver\s+(problems|disease|issues|impairment|damage)\b/gi, 'kidney $1')
            .replace(/\bliver\s+(?:or|and)\s+(?=kidney)/gi, '')
            .replace(/\s*(?:,|or|and)\s*\bliver\s+(?:problems|disease|issues|impairment|damage)\b/gi, '');
        } else {
          continue;
        }
      } else if (!srcSupportsLiver && isPregnancy && /\bkidney\s+(?:or|and)\s+liver\b/i.test(s)) {
        s = s.replace(/\bkidney\s+(?:or|and)\s+liver\b/gi, 'kidney');
      }
      if (!srcSupportsKidney && isPregnancy && /\bliver\s+(?:or|and)\s+kidney\b/i.test(s)) {
        s = s.replace(/\bliver\s+(?:or|and)\s+kidney\b/gi, 'liver');
      }
      if (!srcSupportsBoneFracture && /\b(?:bone fractures?|osteoporosis)\b/i.test(s)) continue;
      if (!srcSupportsB12 && /\bvitamin\s*b12\b/i.test(s)) continue;
      if (!srcSupportsCDiff && /\bclostridium\s+difficile\b/i.test(s)) continue;
      if (!srcSupportsLossOfConsciousness && /\bloss of consciousness\b/i.test(s)) continue;
      if (!srcSupportsLacticAcidosis && /\blactic acidosis\b/i.test(s)) continue;

      if (
        isStorage &&
        !srcSupportsStorage &&
        /\b(?:store at|room temperature|cool,?\s*dry place|tightly closed container|protect from light|moisture|refrigerat|\d+\s*°[cf])\b/i.test(
          s
        )
      ) {
        continue;
      }
      if (
        isStorage &&
        !srcSupportsDisposal &&
        /\b(?:dispos(?:e|al)|flush|take-back|down the toilet|unused medicine|unused liquid)\b/i.test(s)
      ) {
        continue;
      }
      if (
        isPregnancy &&
        !srcSupportsPregnancy &&
        /\b(?:pregnan|unborn|fetus|trimester|gestation)\b/i.test(s)
      ) {
        continue;
      }
      if (
        isPregnancy &&
        !srcSupportsBreastfeeding &&
        /\b(?:breastfeed|breast-feed|breast milk|lactation|nursing mother|nursing infant)\b/i.test(s)
      ) {
        continue;
      }

      if (isInteractions) {
        // Check if sentence introduces unquoted specific drug interaction examples
        const unquotedDrugs = SPECIFIC_INTERACTION_EXAMPLES.filter((drug) => {
          const re = new RegExp(`\\b${drug.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i');
          return re.test(s) && !normExcerpts.includes(normalizeClinicalText(drug));
        });
        if (unquotedDrugs.length > 0) {
          // If it's a single-drug interaction sentence (e.g., "Iron supplements may also interact..."), drop the sentence
          const listMatch = s.match(/^(.*?\b(?:including|such as|with)\b:?)\s+([^.!?]+)([.!?]?)$/i);
          if (listMatch) {
            const [, prefix, rawDrugs, suffix] = listMatch;
            const keptDrugs = splitPreservingParens(rawDrugs).filter((item) =>
              isSymptomSupportedByExcerpts(item, normExcerpts)
            );
            if (keptDrugs.length === 0) continue;
            s = `${prefix} ${joinGrammaticalList(keptDrugs, 'and')}${suffix || '.'}`;
          } else {
            continue;
          }
        }
      }

      if (isSideEffects) {
        const cleanedSideEffectSentence = sanitizeSideEffectsSentence(
          s,
          normExcerpts,
          sideEffectContext === 'emergency'
        );
        if (!cleanedSideEffectSentence) continue;
        s = cleanedSideEffectSentence;
      }

      keptSentences.push(s);
    }

    if (keptSentences.length > 0) {
      const leadingIndent = line.match(/^\s*/)?.[0] ?? '';
      keptLines.push(`${leadingIndent}${keptSentences.join(' ')}`);
    }
  }

  let resultText = keptLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (isSideEffects) {
    // Never leave an empty category subheading (including at EOF) with no content underneath it
    let prev = '';
    while (prev !== resultText) {
      prev = resultText;
      resultText = resultText
        .replace(/(?:^|\n)#{2,4}\s*[^\n]+(?:\n|$)(?=\s*(?:#{2,4}\s|$))/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
  }

  return resultText;
}

function parseStructuredMedicineSections(
  rawJsonText: string,
  docs: RetrievedMedicineDocument[]
): { sections: MedicineSection[]; markdownContent: string } | null {
  try {
    const cleaned = rawJsonText
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned) as { sections?: RawStructuredMedicineSection[] };
    if (!Array.isArray(parsed?.sections) || parsed.sections.length === 0) return null;

    const combinedSourceText = docs.map((d) => d.extractedText).join('\n');
    const sections: MedicineSection[] = [];
    for (const raw of parsed.sections) {
      const heading = typeof raw.heading === 'string' ? raw.heading.replace(/^#+\s*/, '').trim() : '';
      const rawContentMarkdown = typeof raw.contentMarkdown === 'string' ? raw.contentMarkdown.trim() : '';
      if (!heading || !rawContentMarkdown) continue;

      const verifiedExcerpts: MedicineSupportingExcerpt[] = [];
      const seenQuotes = new Set<string>();

      for (const item of raw.supportingQuotes ?? []) {
        const idx = typeof item.sourceIndex === 'number' ? Math.trunc(item.sourceIndex) - 1 : -1;
        const quote = typeof item.quote === 'string' ? item.quote.replace(/\s+/g, ' ').trim() : '';
        if (idx < 0 || idx >= docs.length || quote.length < 20) continue;
        if (isPronunciationOrVagueStubQuote(quote, heading)) continue;

        const doc = docs[idx];
        // Verify verbatim or contiguous phrase match against actual retrieved page content!
        const verified = verifyQuoteInSourceText(quote, doc.extractedText);
        if (!verified) continue;

        const dedupeKey = `${doc.uri}::${normalizeTextForVerification(quote).slice(0, 50)}`;
        if (seenQuotes.has(dedupeKey)) continue;
        seenQuotes.add(dedupeKey);

        verifiedExcerpts.push({
          sourceTitle: doc.title,
          organization: doc.organization,
          sourceUri: doc.uri,
          quote: quote.length > 280 ? `${quote.slice(0, 280).trimEnd()}...` : quote,
          retrievedAt: doc.retrievedAt,
          isProductSpecificLabel: doc.isProductSpecificLabel,
        });
      }

      const cappedExcerpts = verifiedExcerpts.slice(0, 8);
      const hasDocs = docs.length > 0;
      const sectionExcerptsCorpus = cappedExcerpts.map((e) => e.quote).join('\n');
      const sanitizedContent = hasDocs
        ? stripUnsupportedClaimsFromContent(
            heading,
            rawContentMarkdown,
            sectionExcerptsCorpus,
            combinedSourceText
          )
        : rawContentMarkdown;

      const finalContentMarkdown =
        !hasDocs || (cappedExcerpts.length > 0 && sanitizedContent.length > 0)
          ? sanitizedContent
          : 'Not specified in the retrieved official sources for this search.';

      sections.push({
        heading,
        contentMarkdown: finalContentMarkdown,
        supportingExcerpts: cappedExcerpts,
        verificationStatus:
          cappedExcerpts.length > 0 && sanitizedContent.length > 0
            ? 'verified_from_sources'
            : 'general_knowledge',
      });
    }

    if (sections.length === 0) return null;
    const markdownContent = sections
      .map((s) => `### ${s.heading}\n${s.contentMarkdown}`)
      .join('\n\n');
    return { sections, markdownContent };
  } catch {
    return null;
  }
}

const MEDICINE_LOCALIZED_NOTES: Record<
  SupportedLanguage,
  {
    notSpecified: string;
    verificationNote: Record<MedicineInfoResult['groundingStatus'], string>;
  }
> = {
  en: {
    notSpecified: 'Not specified in the retrieved official sources for this search.',
    verificationNote: {
      live_grounded:
        'Live web medical sources were retrieved via Google Search grounding and linked to supporting excerpts.',
      live_source_retrieved:
        'Live official source content from NHS, MedlinePlus, and/or DailyMed was fetched, matched to this medicine, and used with verified supporting excerpts.',
      general_knowledge:
        'Live source content retrieval could not be confirmed, so this response was generated from general AI medical knowledge.',
    },
  },
  kn: {
    notSpecified: 'ಈ ಹುಡುಕಾಟಕ್ಕಾಗಿ ಪಡೆಯಲಾದ ಅಧಿಕೃತ ಮೂಲಗಳಲ್ಲಿ ನಿರ್ದಿಷ್ಟಪಡಿಸಲಾಗಿಲ್ಲ.',
    verificationNote: {
      live_grounded:
        'Google Search grounding ಮೂಲಕ ಲೈವ್ ವೆಬ್ ವೈದ್ಯಕೀಯ ಮೂಲಗಳನ್ನು ಪಡೆಯಲಾಗಿದೆ ಮತ್ತು ಪೋಷಕ ಉಲ್ಲೇಖಗಳೊಂದಿಗೆ ಲಿಂಕ್ ಮಾಡಲಾಗಿದೆ.',
      live_source_retrieved:
        'NHS, MedlinePlus ಮತ್ತು/ಅಥವಾ DailyMed ನಿಂದ ಲೈವ್ ಅಧಿಕೃತ ಮೂಲ ಮಾಹಿತಿಯನ್ನು ಪಡೆದು, ಈ ಔಷಧಿಗೆ ಹೊಂದಿಸಿ, ಪರಿಶೀಲಿಸಿದ ಪೋಷಕ ಉಲ್ಲೇಖಗಳೊಂದಿಗೆ ಬಳಸಲಾಗಿದೆ.',
      general_knowledge:
        'ಲೈವ್ ಅಧಿಕೃತ ಮೂಲ ಮಾಹಿತಿಯನ್ನು ಖಚಿತಪಡಿಸಲು ಸಾಧ್ಯವಾಗದ ಕಾರಣ, ಈ ಸಾರಾಂಶವನ್ನು ಸಾಮಾನ್ಯ AI ವೈದ್ಯಕೀಯ ಜ್ಞಾನದಿಂದ ರಚಿಸಲಾಗಿದೆ.',
    },
  },
  hi: {
    notSpecified: 'इस खोज के लिए प्राप्त आधिकारिक स्रोतों में निर्दिष्ट नहीं किया गया है।',
    verificationNote: {
      live_grounded:
        'Google Search grounding के माध्यम से लाइव वेब चिकित्सा स्रोत प्राप्त किए गए हैं और सहायक उद्धरणों से जोड़े गए हैं।',
      live_source_retrieved:
        'NHS, MedlinePlus और/या DailyMed से लाइव आधिकारिक स्रोत सामग्री प्राप्त की गई, इस दवा से मिलान किया गया और सत्यापित सहायक उद्धरणों के साथ उपयोग किया गया।',
      general_knowledge:
        'लाइव आधिकारिक स्रोत सामग्री की पुष्टि न हो पाने के कारण, यह उत्तर सामान्य AI चिकित्सा ज्ञान से तैयार किया गया है।',
    },
  },
};

async function localizeMedicineInfoResult(
  ai: GoogleGenAI,
  result: MedicineInfoResult,
  language: SupportedLanguage
): Promise<MedicineInfoResult> {
  const lang = normalizeLanguage(language);
  if (lang === 'en') return result;

  const localizedNotes = MEDICINE_LOCALIZED_NOTES[lang];
  const localizedVerificationNote = localizedNotes.verificationNote[result.groundingStatus];
  const targetLangName = getLanguageDisplayName(lang);
  const notSpecifiedEnglish = 'Not specified in the retrieved official sources for this search.';

  const hasStructuredSections = Array.isArray(result.sections) && result.sections.length > 0;
  const payloadToTranslate = hasStructuredSections
    ? result.sections!.map((sec) => ({
        heading: sec.heading,
        contentMarkdown: sec.contentMarkdown,
      }))
    : [{ heading: result.medicineName, contentMarkdown: result.markdownContent }];

  const translationPrompt = [
    `Translate the following verified educational medicine summary into clear, natural, medically accurate ${targetLangName}.`,
    '',
    'CRITICAL PRESERVATION RULES:',
    '1. Translate EVERY section heading and ALL Markdown explanatory content faithfully into the target language.',
    '2. Preserve exact generic/brand medicine names accurately (e.g., keep standard English medicine names like "Paracetamol", "Ibuprofen", "Amoxicillin" and add the localized script in parentheses if helpful).',
    '3. Keep all safety boundaries strictly intact: do NOT add any numerical dosages/schedules, do NOT add new symptoms not present in the source text, keep Emergency Warning Signs strictly separate from Serious Adverse Effects requiring prompt medical advice, and preserve every warning and precaution faithfully.',
    '4. Preserve Markdown structure (bullet points `-`, bold `**...**`, subheadings `####`).',
    `5. For any section whose \`contentMarkdown\` equals "${notSpecifiedEnglish}", output "${localizedNotes.notSpecified}".`,
    '',
    'INPUT JSON TO TRANSLATE:',
    JSON.stringify({ sections: payloadToTranslate }),
  ].join('\n');

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      sections: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            heading: { type: Type.STRING },
            contentMarkdown: { type: Type.STRING },
          },
          required: ['heading', 'contentMarkdown'],
        },
      },
    },
    required: ['sections'],
  };

  let translatedResponse: GenerateContentResponse | undefined;
  const modelsToTry = [FAST_FALLBACK_MODEL, MODEL_NAME, FAST_FALLBACK_MODEL];
  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    try {
      translatedResponse = await withTimeout(
        ai.models.generateContent({
          model,
          contents: translationPrompt,
          config: {
            ...(model === MODEL_NAME ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            systemInstruction: `You are a clinical medical translator producing faithful, patient-safe ${targetLangName} translations without adding, omitting, or altering any verified clinical claims or safety warnings.`,
            responseMimeType: 'application/json',
            responseSchema,
          },
        }),
        20000
      );
      if (translatedResponse?.text) {
        break;
      }
    } catch (err) {
      console.warn(
        `[Medicine Translation Fallback] ${model} failed:`,
        err instanceof Error ? err.message : String(err)
      );
      if (i < modelsToTry.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
  }

  if (!translatedResponse?.text) {
    return {
      ...result,
      verificationNote: localizedVerificationNote,
    };
  }

  try {
    const cleaned = stripJsonCodeFences(translatedResponse.text);
    const parsed = JSON.parse(cleaned) as {
      sections?: Array<{ heading?: string; contentMarkdown?: string }>;
    };
    const translatedSections = Array.isArray(parsed?.sections) ? parsed.sections : [];

    if (hasStructuredSections && translatedSections.length === result.sections!.length) {
      const mergedSections: MedicineSection[] = result.sections!.map((orig, idx) => {
        const tr = translatedSections[idx];
        const isNotSpecified = orig.contentMarkdown.trim() === notSpecifiedEnglish;
        return {
          ...orig,
          heading: tr?.heading?.trim() || orig.heading,
          contentMarkdown: isNotSpecified
            ? localizedNotes.notSpecified
            : tr?.contentMarkdown?.trim() || orig.contentMarkdown,
        };
      });
      return {
        ...result,
        sections: mergedSections,
        markdownContent: mergedSections
          .map((s) => `### ${s.heading}\n${s.contentMarkdown}`)
          .join('\n\n'),
        verificationNote: localizedVerificationNote,
      };
    }

    if (!hasStructuredSections && translatedSections.length > 0) {
      const combinedMd = translatedSections
        .map((s) => s.contentMarkdown?.trim())
        .filter(Boolean)
        .join('\n\n');
      if (combinedMd) {
        return {
          ...result,
          markdownContent: combinedMd,
          verificationNote: localizedVerificationNote,
        };
      }
    }
  } catch {
    // Keep English verified sections if JSON translation parse fails rather than returning broken markup
  }

  return {
    ...result,
    verificationNote: localizedVerificationNote,
  };
}

export async function searchMedicineInfo(
  medicineName: string,
  language: SupportedLanguage = 'en'
): Promise<MedicineInfoResult> {
  const ai = getAiClient();
  const lang = normalizeLanguage(language);

  const sectionNames = [
    'Generic Name',
    'Common Uses',
    'General Mechanism of Action',
    'Side Effects: Common, Serious & Emergency Warning Signs',
    'Pregnancy, Breastfeeding & Special Precautions',
    'Dosage & Administration Safety',
    'Known Interaction Warnings',
    'Storage Instructions & Consultation Disclaimer',
  ];
  const baseHeadings = sectionNames.map((name) => `### ${name}`);

  const medicalAccuracyRules = [
    'MEDICAL ACCURACY & SAFETY RULES (MANDATORY FOR EVERY MEDICINE):',
    '1. GENERIC NAME & CLASSIFICATION:',
    '   - Confirm the generic/active ingredient name and therapeutic/drug classification using a substantive statement from the retrieved official sources.',
    '   - NEVER use a pronunciation guide (e.g., "pronounced as (...)") as a supporting excerpt.',
    '2. SIDE EFFECTS — STRICTLY EXCERPT-SUPPORTED SYMPTOMS & SEPARATED CATEGORIES:',
    '   - Include ONLY side effects and adverse reactions that are explicitly named in the retrieved official sources AND directly covered in that section\'s `supportingQuotes`. NEVER add symptoms from general AI knowledge or from unquoted parts of a source.',
    '   - Separate clearly into three distinct labeled subsections (NEVER merge serious doctor-advice symptoms and emergency symptoms into a single list):',
    '     a) **Common / Reported Side Effects**: Use a frequency heading (such as **Common Side Effects**, **Uncommon Side Effects**, or **Rare Side Effects**) ONLY when a `supportingQuote` explicitly states those frequency classifications (e.g., "Common side effects", "Most common adverse reactions", ">1%", ">2%"). Otherwise label as **Reported Side Effects (frequency not specified in retrieved sources)** and NEVER write "Common side effects include..." underneath it.',
    '     b) **Serious Adverse Effects (Seek Prompt Medical Advice)**: Include ONLY serious reactions explicitly backed by `supportingQuotes` that require **prompt professional medical advice** (including leg, ankle, or foot swelling if supported in the retrieved sources as a sign of fluid retention/heart or kidney issues).',
    '     c) **Emergency Warning Signs (Seek Immediate Emergency Care)**: Include ONLY acute urgent/life-threatening emergency symptoms explicitly backed by `supportingQuotes` that require **immediate emergency care**. NEVER place **leg swelling** (or swelling of the feet, ankles, or lower legs) in the heart attack or stroke emergency warning list.',
    '   - Include **heart attack**, **stroke**, **severe allergic reaction (anaphylaxis)**, or **stomach/gastrointestinal bleeding** warnings ONLY when directly supported by the retrieved official sources and quoted in `supportingQuotes`.',
    '3. CARE-SEEKING GUIDANCE & NO BLANKET STOP INSTRUCTIONS:',
    '   - NEVER give a blanket instruction to stop taking the medicine for every side effect.',
    '   - Distinguish mild/general effects (consult a doctor or pharmacist if persistent without abruptly stopping prescribed therapy), serious adverse effects (seek **prompt professional medical advice**), and emergency warning signs (seek **immediate emergency care** and do not take another dose while awaiting urgent medical evaluation).',
    '   - For prescribed medicines, NEVER instruct patients to stop, skip, or change doses without professional advice.',
    '4. PREGNANCY, BREASTFEEDING & TRIMESTER-SPECIFIC PRECAUTIONS:',
    '   - Include pregnancy, breastfeeding, and trimester-specific precautions ONLY when supported by the retrieved official sources and quoted in `supportingQuotes`; remove unsupported pregnancy or breastfeeding claims rather than filling them in from memory.',
    '   - Never present observational associations (e.g., prenatal paracetamol studies and ASD/ADHD) as established causation; explain differing regulatory views calmly and advise consulting a doctor, midwife, or pharmacist.',
    '5. DOSAGE & ADMINISTRATION SAFETY (NO NUMERICAL DOSAGES OR TYPICAL SCHEDULES):',
    '   - NEVER display numerical dosage instructions (no mg/mcg/mL amounts, tablet/capsule counts, or maximum daily mg numbers) and NEVER display typical dose schedules or durations (no "once daily", "twice a day", "3 times a day", "every 4 to 6 hours", or "for 7 days").',
    '   - Explain clearly that exact dosage, strength, schedule, and duration depend on the **individual prescription, specific product formulation/label, age, weight, organ function, and concurrent medicines**.',
    '6. CONTRACEPTIVE INTERACTION ACCURACY & VOMITING/DIARRHEA DISTINCTION:',
    '   - Review hormonal contraceptive interaction claims carefully: NEVER claim that all antibiotics (including **amoxicillin**) directly reduce hormonal contraceptive effectiveness without reliable supporting evidence.',
    '   - Where official sources differ or note oral contraceptive precautions, explain accurately and distinguish **severe vomiting or severe watery diarrhea pill-absorption concerns** from direct pharmacological interactions.',
    '7. REMOVE UNSUPPORTED CLAIMS (STORAGE, DISPOSAL & ALL OTHER SECTIONS):',
    '   - Remove unsupported storage, disposal, pregnancy, breastfeeding, mechanism, interaction, or other medical claims rather than generating or stretching evidence for them.',
    '   - Clearly distinguish general clinical guidance (NHS, MedlinePlus monographs) from product-specific FDA/OTC/Rx manufacturer label warnings (DailyMed SPLs).',
  ];

  const prompt = [
    `Provide reliable, factual, patient-friendly educational information about the medicine: "${medicineName}".`,
    'Structure your response using these exact Markdown headings:',
    ...baseHeadings,
    '',
    ...medicalAccuracyRules,
    '- If a specific detail is not reliably available or the query is not a recognized medicine, state that honestly.',
    '- Keep language simple, calm, balanced, and easy to understand.',
  ].join('\n');

  type StructuredParseResult = { sections: MedicineSection[]; markdownContent: string } | null;

  let response: GenerateContentResponse | undefined;
  let searchAttemptSucceeded = true;
  let retrievedOfficialDocs: RetrievedMedicineDocument[] = [];
  let usedRetrievedContent = false;
  let parsedStructuredResult: StructuredParseResult = null;

  const isRetryableSearchError = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('timed out') ||
      msg.includes('DEADLINE_EXCEEDED') ||
      msg.includes('504') ||
      msg.includes('503') ||
      msg.includes('UNAVAILABLE') ||
      msg.includes('429') ||
      msg.includes('RESOURCE_EXHAUSTED')
    );
  };

  // Prefetch official NHS/MedlinePlus/DailyMed pages concurrently with the Google Search probe so fallback adds zero lookup delay
  const prefetchOfficialDocsPromise = lookupTrustedMedicinePages(medicineName).catch(
    () => [] as RetrievedMedicineDocument[]
  );

  const generateWithOfficialSourceRetrieval = async (): Promise<{
    aiResponse: typeof response;
    structured: StructuredParseResult;
  }> => {
    searchAttemptSucceeded = false;
    retrievedOfficialDocs = await prefetchOfficialDocsPromise;

    if (retrievedOfficialDocs.length > 0) {
      usedRetrievedContent = true;
      const sourceContext = retrievedOfficialDocs
        .map((doc, idx) => {
          const kindLabel = doc.isProductSpecificLabel
            ? 'PRODUCT-SPECIFIC FDA/OTC/RX LABEL (applies to this specific manufacturer product/strength)'
            : 'GENERAL OFFICIAL CLINICAL MONOGRAPH';
          return `[SOURCE ${idx + 1}] ${doc.organization} — ${doc.title}\nTYPE: ${kindLabel}\nRETRIEVED_AT: ${doc.retrievedAt}\nURL: ${doc.uri}\nRETRIEVED CONTENT:\n${doc.extractedText}`;
        })
        .join('\n\n---\n\n');

      const groundedPrompt = [
        `Using ONLY the verified official medical source content retrieved below for "${medicineName}", produce a structured JSON object with the following 8 sections in order:`,
        ...sectionNames.map((n, i) => `${i + 1}. "${n}"`),
        '',
        ...medicalAccuracyRules,
        '8. DIRECT CLAIM-TO-EXCERPT VERIFICATION RULES (MANDATORY):',
        '   - EVERY medical claim, symptom, condition, interaction, or precaution in `contentMarkdown` MUST have a directly relevant verbatim `supportingQuote` in THAT section\'s `supportingQuotes` array. Do NOT display any symptom or claim unless one of that section\'s `supportingQuotes` directly names it.',
        '   - NEVER use a vague general warning lead-in sentence (such as "may cause side effects; tell your doctor...") as evidence for specific symptoms.',
        '   - Include 1 to 8 verbatim `supportingQuotes` (exact substring, 40–270 characters, no paraphrasing) per covered section so every symptom group (reported/common, serious, and emergency), interaction, precaution, pregnancy/breastfeeding claim, and storage/disposal instruction is directly backed.',
        '   - For "Generic Name", quote a substantive sentence confirming the medicine name and drug classification (NEVER a pronunciation excerpt).',
        '   - For "Dosage & Administration Safety", do NOT include numerical dosages or typical schedules anywhere in `contentMarkdown` or `supportingQuotes`; select non-numerical administration/safety quotes.',
        '   - If retrieved sources do NOT cover a topic (e.g., storage, disposal, breastfeeding, pregnancy, or mechanism), REMOVE those claims completely—do NOT invent or stretch evidence—and state "Not specified in the retrieved official sources for this search." with `supportingQuotes: []` if nothing in that section is covered.',
        '',
        'RETRIEVED OFFICIAL SOURCES:',
        sourceContext,
      ].join('\n');

      const runSynthesisWithRetry = async () => {
        const started = Date.now();
        const modelsToTry = [FAST_FALLBACK_MODEL, MODEL_NAME, FAST_FALLBACK_MODEL];
        let lastErr: unknown;

        for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
          const targetModel = modelsToTry[attempt];
          const elapsed = Date.now() - started;
          const remaining = 38000 - elapsed;
          if (remaining < 5000) break;

          const perAttemptBudget = Math.min(attempt === 0 ? 15000 : 14000, remaining);
          try {
            return await withTimeout(
              ai.models.generateContent({
                model: targetModel,
                contents: groundedPrompt,
                config: {
                  ...(targetModel === MODEL_NAME
                    ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                    : {}),
                  systemInstruction:
                    'You synthesize calm, patient-education medicine summaries grounded strictly in the provided official NHS, MedlinePlus, and DailyMed retrieved texts. Never add symptoms from general AI knowledge without source evidence. Ensure every displayed medical claim and side effect has a directly relevant verbatim supportingQuote in that section. Keep emergency symptoms strictly separate from serious symptoms requiring prompt medical advice, and NEVER put leg swelling in heart attack/stroke emergency warnings. Never use pronunciation excerpts for Generic Name or display numerical dosages/schedules.',
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      sections: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            heading: { type: Type.STRING },
                            contentMarkdown: { type: Type.STRING },
                            supportingQuotes: {
                              type: Type.ARRAY,
                              items: {
                                type: Type.OBJECT,
                                properties: {
                                  sourceIndex: {
                                    type: Type.INTEGER,
                                    description: '1-based index N matching [SOURCE N]',
                                  },
                                  quote: {
                                    type: Type.STRING,
                                    description:
                                      'Exact verbatim excerpt (50-240 characters) copied directly from RETRIEVED CONTENT of [SOURCE N].',
                                  },
                                },
                                required: ['sourceIndex', 'quote'],
                              },
                            },
                          },
                          required: ['heading', 'contentMarkdown', 'supportingQuotes'],
                        },
                      },
                    },
                    required: ['sections'],
                  },
                },
              }),
              perAttemptBudget
            );
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            const isTransient =
              msg.includes('503') ||
              msg.includes('504') ||
              msg.includes('DEADLINE_EXCEEDED') ||
              msg.includes('UNAVAILABLE') ||
              msg.includes('overloaded') ||
              msg.includes('timed out') ||
              msg.includes('429') ||
              msg.includes('RESOURCE_EXHAUSTED');
            if (!isTransient || attempt === modelsToTry.length - 1) {
              throw err;
            }
            console.warn(
              `[Gemini Synthesis Fallback] ${targetModel} failed (${msg}); trying ${modelsToTry[attempt + 1]}`
            );
            await new Promise((resolve) => setTimeout(resolve, 600));
          }
        }
        throw lastErr ?? new Error('AI synthesis failed after retries.');
      };

      const jsonResponse = await runSynthesisWithRetry();
      const parsed = parseStructuredMedicineSections(jsonResponse.text ?? '', retrievedOfficialDocs);
      return { aiResponse: jsonResponse, structured: parsed };
    }

    usedRetrievedContent = false;
    let unverifiedResponse: GenerateContentResponse | undefined;
    try {
      unverifiedResponse = await withTimeout(
        ai.models.generateContent({
          model: FAST_FALLBACK_MODEL,
          contents: prompt,
          config: {
            systemInstruction:
              'You provide accurate, accessible educational medicine reference summaries from general medical knowledge. Clearly state when details are uncertain or not a recognized medicine, follow all pregnancy, dosage safety, prescribed-medicine continuation, and side-effect classification rules, never invent facts, and never prescribe or recommend individual doses.',
          },
        }),
        12000
      );
    } catch {
      unverifiedResponse = await withTimeout(
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction:
              'You provide accurate, accessible educational medicine reference summaries from general medical knowledge. Clearly state when details are uncertain or not a recognized medicine, follow all pregnancy, dosage safety, prescribed-medicine continuation, and side-effect classification rules, never invent facts, and never prescribe or recommend individual doses.',
          },
        }),
        12000
      );
    }
    return { aiResponse: unverifiedResponse, structured: null };
  };

  try {
    response = await withTimeout(
      ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You provide accurate, calm, accessible educational medicine reference summaries grounded in verified medical sources. Follow all pregnancy, dosage safety, prescribed-medicine continuation, side-effect classification, and attribution rules strictly.',
          tools: [{ googleSearch: {} }],
        },
      }),
      4500
    );
  } catch (primaryErr) {
    if (!isRetryableSearchError(primaryErr)) {
      throw primaryErr;
    }
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    console.warn(
      `[Gemini Fallback] Google Search grounding unavailable (${primaryMsg}); retrieving live NHS/MedlinePlus/DailyMed sources`
    );
    const fallback = await generateWithOfficialSourceRetrieval();
    response = fallback.aiResponse;
    parsedStructuredResult = fallback.structured;
  }

  const rawText = response?.text?.trim();
  const markdownContent = parsedStructuredResult?.markdownContent || rawText;
  if (!markdownContent) {
    throw new Error('Empty response received from Gemini AI.');
  }

  const groundingMeta = response?.candidates?.[0]?.groundingMetadata as
    | {
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
        groundingSupports?: GroundingSupportItem[];
      }
    | undefined;
  const chunks = groundingMeta?.groundingChunks ?? [];
  const supports = groundingMeta?.groundingSupports ?? [];

  const confirmedGrounded =
    searchAttemptSucceeded &&
    extractGroundedMedicineSources(chunks, supports).length > 0;

  let baseResult: MedicineInfoResult;
  if (searchAttemptSucceeded && !confirmedGrounded) {
    console.warn(
      '[Gemini Fallback] Google Search grounding did not return confirmed content supports; retrieving live NHS/MedlinePlus/DailyMed sources'
    );
    const fallback = await generateWithOfficialSourceRetrieval();
    const fallbackMarkdown =
      fallback.structured?.markdownContent || fallback.aiResponse?.text?.trim() || markdownContent;
    baseResult = await buildMedicineInfoResult({
      medicineName,
      markdownContent: fallbackMarkdown,
      sections: fallback.structured?.sections,
      searchAttemptSucceeded: false,
      groundingChunks: [],
      groundingSupports: [],
      retrievedOfficialDocs,
      usedRetrievedContent,
    });
  } else {
    baseResult = await buildMedicineInfoResult({
      medicineName,
      markdownContent,
      sections: parsedStructuredResult?.sections,
      searchAttemptSucceeded,
      groundingChunks: chunks,
      groundingSupports: supports,
      retrievedOfficialDocs,
      usedRetrievedContent,
    });
  }

  if (lang !== 'en') {
    return localizeMedicineInfoResult(ai, baseResult, lang);
  }
  return baseResult;
}

export interface GeneratedTip {
  title: string;
  category: string;
  content: string;
  actionableSteps: string[];
}

export async function generatePreventiveTips(input: {
  category: string;
  goal?: string;
  age?: number | null;
  preferences?: string;
  language?: SupportedLanguage;
}): Promise<GeneratedTip[]> {
  const category = input.category?.trim();
  if (!category) {
    throw new Error('Please select a wellness category.');
  }

  const ai = getAiClient();
  const lang = normalizeLanguage(input.language);

  const prompt = [
    `Generate 3 practical, evidence-informed preventive wellness suggestions in the category: "${category}".`,
    input.goal ? `User wellness goal: ${input.goal}` : '',
    input.age ? `User age context (for general awareness only): ${input.age}` : '',
    input.preferences ? `General wellness preferences: ${input.preferences}` : '',
    '',
    getLanguageDirective(lang),
    '',
    'RULES:',
    '- Keep suggestions general, safe, realistic, and evidence-informed.',
    '- NEVER claim that any tip prevents, treats, or cures specific medical diseases.',
    '- Focus on everyday healthy habits aligned with UN SDG 3 wellness awareness.',
    `- Write \`title\`, \`content\`, and \`actionableSteps\` in ${getLanguageDisplayName(lang)}.`,
    `- Keep \`category\` exactly as "${category}" so saved categories stay consistent.`,
  ]
    .filter(Boolean)
    .join('\n');

  const schemaConfig = {
    systemInstruction:
      `You are a preventive health awareness educator responding in ${getLanguageDisplayName(lang)} and providing safe, practical, general wellness guidance.`,
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          category: { type: Type.STRING },
          content: {
            type: Type.STRING,
            description: '2-3 sentence explanation of why this habit supports general well-being.',
          },
          actionableSteps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2-3 simple, practical everyday steps.',
          },
        },
        required: ['title', 'category', 'content', 'actionableSteps'],
      },
    },
  };

  const modelsToTry = [FAST_FALLBACK_MODEL, MODEL_NAME, FAST_FALLBACK_MODEL];
  const startedAt = Date.now();
  let response: GenerateContentResponse | undefined;
  let lastErr: unknown;

  for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
    const targetModel = modelsToTry[attempt];
    const elapsed = Date.now() - startedAt;
    const remaining = 38000 - elapsed;
    if (remaining < 5000) break;

    const budget = Math.min(13000, remaining);
    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: targetModel,
          contents: prompt,
          config: {
            ...schemaConfig,
            ...(targetModel === MODEL_NAME
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        }),
        budget
      );
      break;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
      const isTransient =
        isRateLimit ||
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('overloaded') ||
        msg.includes('504') ||
        msg.includes('DEADLINE_EXCEEDED') ||
        msg.includes('timed out');
      if (!isTransient || attempt === modelsToTry.length - 1) {
        throw err;
      }
      console.warn(
        `[Preventive Tips Fallback] ${targetModel} failed (${msg}); trying ${modelsToTry[attempt + 1]}`
      );
      await new Promise((resolve) => setTimeout(resolve, isRateLimit ? 2000 : 600));
    }
  }

  if (!response) {
    throw lastErr ?? new Error('Unable to obtain wellness suggestions from the AI service.');
  }

  const rawText = stripJsonCodeFences(response.text ?? '');
  if (!rawText) {
    throw new Error('Empty response received from Gemini AI.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Received an invalid response format from the AI service. Please try again.');
  }

  const candidateList = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { tips?: unknown }).tips)
      ? (parsed as { tips: unknown[] }).tips
      : null;

  if (!candidateList) {
    throw new Error('Received an unexpected wellness suggestions format. Please try again.');
  }

  const normalizedTips: GeneratedTip[] = candidateList
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => {
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const tipCategory =
        typeof item.category === 'string' && item.category.trim() ? item.category.trim() : category;
      const content = typeof item.content === 'string' ? item.content.trim() : '';
      const actionableSteps = Array.isArray(item.actionableSteps)
        ? item.actionableSteps
            .map((step) => (typeof step === 'string' ? step.trim() : ''))
            .filter(Boolean)
        : [];
      return {
        title,
        category: tipCategory,
        content,
        actionableSteps,
      };
    })
    .filter((tip) => tip.title.length > 0 && tip.content.length > 0);

  if (normalizedTips.length === 0) {
    throw new Error('The AI service did not return usable wellness suggestions. Please try again.');
  }

  return normalizedTips;
}
