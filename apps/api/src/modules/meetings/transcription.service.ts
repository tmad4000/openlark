import { config } from "../../config.js";

// ============ TYPES ============

export interface TranscriptSegment {
  speaker: string;
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface MeetingSummary {
  title: string;
  overview: string;
  keyPoints: string[];
  decisions: string[];
}

export interface Chapter {
  title: string;
  start: number;
  end: number;
  summary: string;
}

export interface ActionItem {
  description: string;
  assignee?: string;
  dueDate?: string;
}

export interface TranscriptionResult {
  transcript: TranscriptSegment[];
  summary: MeetingSummary;
  chapters: Chapter[];
  actionItems: ActionItem[];
}

// ============ WHISPER ASR ============

async function downloadAudio(storageUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(storageUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download audio: ${response.status} ${response.statusText}`
    );
  }
  return response.arrayBuffer();
}

async function runWhisperASR(
  audioBuffer: ArrayBuffer
): Promise<TranscriptSegment[]> {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([audioBuffer], { type: "audio/webm" }),
    "recording.webm"
  );
  formData.append("model", config.WHISPER_MODEL);
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");

  const response = await fetch(config.WHISPER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Whisper ASR failed: ${response.status} ${errText}`);
  }

  const result = (await response.json()) as {
    segments?: Array<{
      text: string;
      start: number;
      end: number;
      speaker?: string;
    }>;
    text?: string;
  };

  if (result.segments && result.segments.length > 0) {
    return result.segments.map((seg, i) => ({
      speaker: seg.speaker ?? `Speaker ${(i % 4) + 1}`,
      text: seg.text.trim(),
      start: seg.start,
      end: seg.end,
    }));
  }

  // Fallback: single segment from full text
  return [
    {
      speaker: "Speaker 1",
      text: result.text ?? "",
      start: 0,
      end: 0,
    },
  ];
}

// ============ LLM SUMMARIZATION ============

const SUMMARIZATION_PROMPT = `You are a meeting assistant. Given a meeting transcript, produce a JSON response with exactly this structure:

{
  "summary": {
    "title": "Brief meeting title",
    "overview": "2-3 sentence overview of the meeting",
    "keyPoints": ["key point 1", "key point 2", ...],
    "decisions": ["decision 1", "decision 2", ...]
  },
  "chapters": [
    { "title": "Chapter title", "start": 0, "end": 120, "summary": "What was discussed" }
  ],
  "actionItems": [
    { "description": "What needs to be done", "assignee": "Person name or null", "dueDate": "Date or null" }
  ]
}

Return ONLY valid JSON, no markdown fences or extra text.`;

function formatTranscriptForLLM(segments: TranscriptSegment[]): string {
  return segments
    .map(
      (s) =>
        `[${formatTime(s.start)} - ${formatTime(s.end)}] ${s.speaker}: ${s.text}`
    )
    .join("\n");
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function callOpenAI(
  transcript: string
): Promise<{ summary: MeetingSummary; chapters: Chapter[]; actionItems: ActionItem[] }> {
  const response = await fetch(`${config.OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.AI_SUMMARY_MODEL,
      messages: [
        { role: "system", content: SUMMARIZATION_PROMPT },
        { role: "user", content: transcript },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API failed: ${response.status} ${errText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return JSON.parse(data.choices[0]!.message.content);
}

async function callAnthropic(
  transcript: string
): Promise<{ summary: MeetingSummary; chapters: Chapter[]; actionItems: ActionItem[] }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SUMMARIZATION_PROMPT,
      messages: [{ role: "user", content: transcript }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API failed: ${response.status} ${errText}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const textBlock = data.content.find((c) => c.type === "text");
  return JSON.parse(textBlock!.text);
}

async function callOllama(
  transcript: string
): Promise<{ summary: MeetingSummary; chapters: Chapter[]; actionItems: ActionItem[] }> {
  const response = await fetch(`${config.OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.AI_SUMMARY_MODEL,
      messages: [
        { role: "system", content: SUMMARIZATION_PROMPT },
        { role: "user", content: transcript },
      ],
      stream: false,
      format: "json",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama API failed: ${response.status} ${errText}`);
  }

  const data = (await response.json()) as {
    message: { content: string };
  };
  return JSON.parse(data.message.content);
}

async function generateSummary(
  segments: TranscriptSegment[]
): Promise<{ summary: MeetingSummary; chapters: Chapter[]; actionItems: ActionItem[] }> {
  const transcriptText = formatTranscriptForLLM(segments);

  switch (config.AI_PROVIDER) {
    case "openai":
      return callOpenAI(transcriptText);
    case "anthropic":
      return callAnthropic(transcriptText);
    case "ollama":
      return callOllama(transcriptText);
    default:
      throw new Error(`Unsupported AI provider: ${config.AI_PROVIDER}`);
  }
}

// ============ PUBLIC API ============

export async function transcribeAndSummarize(
  storageUrl: string
): Promise<TranscriptionResult> {
  // Step 1: Download audio
  const audioBuffer = await downloadAudio(storageUrl);

  // Step 2: Run Whisper ASR to get transcript with speaker labels and timestamps
  const transcript = await runWhisperASR(audioBuffer);

  // Step 3: Run LLM to generate summary, action items, and chapters
  const { summary, chapters, actionItems } =
    await generateSummary(transcript);

  return { transcript, summary, chapters, actionItems };
}
