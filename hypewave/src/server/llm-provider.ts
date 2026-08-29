import { z } from "zod";
import { getEnv } from "./env";
import type { SongSuggestion } from "@/lib/types";

// Model is overridable via LLM_MODEL; falls back to a sensible per-provider default.
// gemini-2.5-flash is blocked for new API keys -> gemini-3.6-flash.
const GEMINI_MODEL = process.env.LLM_MODEL?.trim() || "gemini-3.6-flash";
const GROQ_MODEL = process.env.LLM_MODEL?.trim() || "openai/gpt-oss-20b";

const SuggestionSchema = z.object({
  title: z.string().min(1),
  artist: z.string().min(1),
});
const SuggestionsSchema = z.array(SuggestionSchema);

export interface RecommendArgs {
  title?: string;
  artist?: string;
  genre?: string;
  count: number;
}

function buildPrompt(args: RecommendArgs): string {
  const { title, artist, genre, count } = args;
  const shape = `Respond with ONLY a JSON object of this exact shape: {"suggestions":[{"title":"...","artist":"..."}]} containing exactly ${count} items. No prose, no markdown, no explanation.`;
  if (title && artist) {
    return `You are a party DJ. The current track is "${title}" by ${artist}. Pick ${count} different real songs that mix well next with similar energy and genre. ${shape}`;
  }
  return `You are a party DJ. Pick ${count} well-known real songs in the "${genre ?? "pop"}" genre for a hyped crowd. ${shape}`;
}

// Robustly extract suggestions from an LLM response: accepts a bare array, a
// {suggestions|songs|tracks|recommendations: [...]} object, code-fenced JSON, or
// JSON embedded in surrounding text.
function parseSuggestions(text: string): SongSuggestion[] {
  if (!text || !text.trim()) throw new Error("empty LLM response");
  const cleaned = text.replace(/```[a-zA-Z]*/g, "").replace(/```/g, "").trim();

  const candidates: string[] = [cleaned];
  const oStart = cleaned.indexOf("{");
  const oEnd = cleaned.lastIndexOf("}");
  if (oStart !== -1 && oEnd > oStart) candidates.push(cleaned.slice(oStart, oEnd + 1));
  const aStart = cleaned.indexOf("[");
  const aEnd = cleaned.lastIndexOf("]");
  if (aStart !== -1 && aEnd > aStart) candidates.push(cleaned.slice(aStart, aEnd + 1));

  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    const arr = Array.isArray(parsed)
      ? parsed
      : (parsed as Record<string, unknown>)?.suggestions ??
        (parsed as Record<string, unknown>)?.songs ??
        (parsed as Record<string, unknown>)?.tracks ??
        (parsed as Record<string, unknown>)?.recommendations;
    const valid = SuggestionsSchema.safeParse(arr);
    if (valid.success && valid.data.length) return valid.data;
  }
  throw new Error(`Unparseable LLM response: ${text.slice(0, 160)}`);
}

async function callGroq(prompt: string): Promise<string> {
  const env = getEnv();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You output only valid minified JSON. Never include prose, reasoning, or markdown.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callGemini(prompt: string): Promise<string> {
  const env = getEnv();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.LLM_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: { text?: string }) => p.text ?? "").join("");
}

export async function recommend(args: RecommendArgs): Promise<SongSuggestion[]> {
  const env = getEnv();
  const prompt = buildPrompt(args);
  const raw =
    env.LLM_PROVIDER === "groq" ? await callGroq(prompt) : await callGemini(prompt);
  return parseSuggestions(raw).slice(0, args.count);
}
