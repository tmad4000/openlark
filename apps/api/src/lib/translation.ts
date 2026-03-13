/**
 * Translation service with pluggable backend support.
 * Defaults to LibreTranslate (self-hosted, free).
 * Optional backends: DeepL, Google Translate.
 */

export interface TranslationResult {
  translatedText: string;
  detectedLanguage?: string;
}

interface TranslationBackend {
  translate(
    text: string,
    targetLang: string,
    sourceLang?: string
  ): Promise<TranslationResult>;
}

// =====================================================
// LibreTranslate Backend (default)
// =====================================================

class LibreTranslateBackend implements TranslationBackend {
  private baseUrl: string;
  private apiKey?: string;

  constructor() {
    this.baseUrl =
      process.env.LIBRETRANSLATE_URL || "http://localhost:5000";
    this.apiKey = process.env.LIBRETRANSLATE_API_KEY;
  }

  async translate(
    text: string,
    targetLang: string,
    sourceLang?: string
  ): Promise<TranslationResult> {
    const body: Record<string, string> = {
      q: text,
      target: targetLang,
      source: sourceLang || "auto",
      format: "text",
    };
    if (this.apiKey) {
      body.api_key = this.apiKey;
    }

    const res = await fetch(`${this.baseUrl}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`LibreTranslate error (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as {
      translatedText: string;
      detectedLanguage?: { language: string };
    };

    return {
      translatedText: data.translatedText,
      detectedLanguage: data.detectedLanguage?.language,
    };
  }
}

// =====================================================
// DeepL Backend
// =====================================================

class DeepLBackend implements TranslationBackend {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.DEEPL_API_KEY || "";
    // Free API uses a different base URL
    this.baseUrl = process.env.DEEPL_API_URL || "https://api-free.deepl.com/v2";
  }

  async translate(
    text: string,
    targetLang: string,
    sourceLang?: string
  ): Promise<TranslationResult> {
    const params = new URLSearchParams({
      text,
      target_lang: targetLang.toUpperCase(),
    });
    if (sourceLang) {
      params.set("source_lang", sourceLang.toUpperCase());
    }

    const res = await fetch(`${this.baseUrl}/translate`, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`DeepL error (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as {
      translations: Array<{
        text: string;
        detected_source_language?: string;
      }>;
    };

    const translation = data.translations[0];
    return {
      translatedText: translation.text,
      detectedLanguage: translation.detected_source_language?.toLowerCase(),
    };
  }
}

// =====================================================
// Google Translate Backend
// =====================================================

class GoogleTranslateBackend implements TranslationBackend {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_TRANSLATE_API_KEY || "";
  }

  async translate(
    text: string,
    targetLang: string,
    sourceLang?: string
  ): Promise<TranslationResult> {
    const params = new URLSearchParams({
      q: text,
      target: targetLang,
      key: this.apiKey,
      format: "text",
    });
    if (sourceLang) {
      params.set("source", sourceLang);
    }

    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?${params.toString()}`,
      { method: "POST" }
    );

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Google Translate error (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as {
      data: {
        translations: Array<{
          translatedText: string;
          detectedSourceLanguage?: string;
        }>;
      };
    };

    const translation = data.data.translations[0];
    return {
      translatedText: translation.translatedText,
      detectedLanguage: translation.detectedSourceLanguage,
    };
  }
}

// =====================================================
// Factory
// =====================================================

type BackendName = "libretranslate" | "deepl" | "google";

function createBackend(name: BackendName): TranslationBackend {
  switch (name) {
    case "deepl":
      return new DeepLBackend();
    case "google":
      return new GoogleTranslateBackend();
    case "libretranslate":
    default:
      return new LibreTranslateBackend();
  }
}

const backendName = (process.env.TRANSLATION_BACKEND || "libretranslate") as BackendName;
const backend = createBackend(backendName);

export async function translateText(
  text: string,
  targetLang: string,
  sourceLang?: string
): Promise<TranslationResult> {
  return backend.translate(text, targetLang, sourceLang);
}
