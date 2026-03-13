/**
 * AI service for meeting transcription (Whisper ASR) and summarization (LLM).
 *
 * Whisper backend: WHISPER_BACKEND env var
 *   - "openai" (default): OpenAI Whisper API
 *   - "local": Local faster-whisper HTTP endpoint
 *
 * LLM backend: LLM_BACKEND env var
 *   - "openai" (default): OpenAI Chat Completions API
 *   - "anthropic": Anthropic Messages API
 *   - "ollama": Local Ollama API
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface TranscriptParagraph {
  speaker: string;
  speakerId?: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface TranscriptResult {
  paragraphs: TranscriptParagraph[];
}

export interface MeetingSummary {
  overview: string;
  keyPoints: string[];
  decisions: string[];
}

export interface MeetingChapter {
  title: string;
  startTime: number;
  endTime: number;
  summary: string;
}

export interface MeetingActionItem {
  text: string;
  assignee?: string;
  assigneeId?: string;
  dueDate?: string;
}

export interface MinutesResult {
  summary: MeetingSummary;
  chapters: MeetingChapter[];
  actionItems: MeetingActionItem[];
}

// ── Configuration ──────────────────────────────────────────────────────────

const WHISPER_BACKEND = process.env.WHISPER_BACKEND || "openai";
const LLM_BACKEND = process.env.LLM_BACKEND || "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const LOCAL_WHISPER_URL = process.env.LOCAL_WHISPER_URL || "http://localhost:8080";
const LLM_MODEL = process.env.LLM_MODEL || "";

// ── Whisper ASR ────────────────────────────────────────────────────────────

/**
 * Download audio from storage URL and run Whisper ASR to produce a transcript.
 */
export async function transcribeAudio(audioUrl: string): Promise<TranscriptResult> {
  // Download the audio file
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio from ${audioUrl}: ${audioResponse.status}`);
  }
  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

  if (WHISPER_BACKEND === "local") {
    return transcribeWithLocalWhisper(audioBuffer);
  }
  return transcribeWithOpenAIWhisper(audioBuffer);
}

async function transcribeWithOpenAIWhisper(audioBuffer: Buffer): Promise<TranscriptResult> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for OpenAI Whisper transcription");
  }

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/webm" });
  formData.append("file", blob, "recording.webm");
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Whisper API error: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    segments?: Array<{
      id: number;
      start: number;
      end: number;
      text: string;
    }>;
    text?: string;
  };

  // Convert segments to paragraphs with speaker labels
  const paragraphs: TranscriptParagraph[] = (data.segments || []).map((segment, index) => ({
    speaker: `Speaker ${Math.floor(index / 3) + 1}`, // Basic speaker assignment
    text: segment.text.trim(),
    startTime: segment.start,
    endTime: segment.end,
  }));

  // If no segments, create a single paragraph from the full text
  if (paragraphs.length === 0 && data.text) {
    paragraphs.push({
      speaker: "Speaker 1",
      text: data.text.trim(),
      startTime: 0,
      endTime: 0,
    });
  }

  return { paragraphs };
}

async function transcribeWithLocalWhisper(audioBuffer: Buffer): Promise<TranscriptResult> {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/webm" });
  formData.append("file", blob, "recording.webm");
  formData.append("response_format", "verbose_json");
  formData.append("diarize", "true");

  const response = await fetch(`${LOCAL_WHISPER_URL}/v1/audio/transcriptions`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Local Whisper API error: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    segments?: Array<{
      start: number;
      end: number;
      text: string;
      speaker?: string;
    }>;
  };

  const paragraphs: TranscriptParagraph[] = (data.segments || []).map((segment) => ({
    speaker: segment.speaker || "Speaker 1",
    text: segment.text.trim(),
    startTime: segment.start,
    endTime: segment.end,
  }));

  return { paragraphs };
}

// ── LLM Summarization ─────────────────────────────────────────────────────

const SUMMARIZATION_PROMPT = `You are a meeting assistant. Analyze the following meeting transcript and produce a structured JSON response with exactly these fields:

{
  "summary": {
    "overview": "A 2-3 sentence overview of the meeting",
    "keyPoints": ["key point 1", "key point 2", ...],
    "decisions": ["decision 1", "decision 2", ...]
  },
  "chapters": [
    {
      "title": "Chapter title",
      "startTime": 0,
      "endTime": 120,
      "summary": "Brief chapter summary"
    }
  ],
  "actionItems": [
    {
      "text": "Action item description",
      "assignee": "Person name if mentioned"
    }
  ]
}

Rules:
- Extract ALL action items mentioned in the meeting
- Create logical chapters based on topic changes
- Keep the overview concise but comprehensive
- Include all decisions made during the meeting
- Use the speaker names and timestamps from the transcript for chapter boundaries
- Return ONLY valid JSON, no markdown or extra text`;

/**
 * Run LLM on transcript to generate summary, chapters, and action items.
 */
export async function generateMinutes(transcript: TranscriptResult): Promise<MinutesResult> {
  const transcriptText = transcript.paragraphs
    .map((p) => `[${formatTime(p.startTime)} - ${formatTime(p.endTime)}] ${p.speaker}: ${p.text}`)
    .join("\n");

  const userMessage = `Here is the meeting transcript:\n\n${transcriptText}`;

  let responseText: string;

  switch (LLM_BACKEND) {
    case "anthropic":
      responseText = await callAnthropic(userMessage);
      break;
    case "ollama":
      responseText = await callOllama(userMessage);
      break;
    case "openai":
    default:
      responseText = await callOpenAI(userMessage);
      break;
  }

  // Parse the JSON response, stripping any markdown code fences
  const jsonStr = responseText.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  const result = JSON.parse(jsonStr) as MinutesResult;

  return {
    summary: result.summary || { overview: "", keyPoints: [], decisions: [] },
    chapters: result.chapters || [],
    actionItems: result.actionItems || [],
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function callOpenAI(userMessage: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for OpenAI LLM summarization");
  }

  const model = LLM_MODEL || "gpt-4o";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SUMMARIZATION_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0].message.content;
}

async function callAnthropic(userMessage: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required for Anthropic LLM summarization");
  }

  const model = LLM_MODEL || "claude-sonnet-4-20250514";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SUMMARIZATION_PROMPT,
      messages: [
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };
  const textBlock = data.content.find((b) => b.type === "text");
  return textBlock?.text || "";
}

async function callOllama(userMessage: string): Promise<string> {
  const model = LLM_MODEL || "llama3";

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SUMMARIZATION_PROMPT },
        { role: "user", content: userMessage },
      ],
      stream: false,
      options: { temperature: 0.3 },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    message: { content: string };
  };
  return data.message.content;
}
