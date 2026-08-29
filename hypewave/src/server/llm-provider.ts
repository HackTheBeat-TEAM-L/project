import { z } from "zod";
import { getEnv } from "./env";
import type { SongSuggestion } from "@/lib/types";

// gemini-2.5-flash is blocked for new API keys -> must use gemini-3.6-flash (verified working).
const GEMINI_MODEL = "gemini-3.6-flash";
const GROQ_MODEL = "openai/gpt-oss-20b";

const SuggestionsSchema = z.array(
  z.object({ title: z.string().min(1), artist: z.string().min(1) })
);

export interface RecommendArgs {
  title?: string;
  artist?: string;
  genre?: string;
  count: number;
}

function buildPrompt(args: RecommendArgs): string {
  const { title, artist, genre, count } = args;
  const shape = `Return ONLY a JSON array of exactly ${count} items like [{"title":"...","artist":"..."}]. No prose, no code fences.`;
  if (title && artist) {
    return `You are a party DJ. The current track is "${title}" by ${artist}. Suggest ${count} different songs that mix well next with similar energy and genre. ${shape}`;
  }
  return `You are a party DJ. Suggest ${count} well-known songs in the "${genre ?? "pop"}" genre for a hyped crowd. ${shape}`;
}

function extractJsonArray(text: string): unknown {
  const cleaned = text.replace(/```[a-zA-Z]*/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON array found in LLM response: ${text.slice(0, 200)}`);
  }
  return JSON.parse(cleaned.slice(start, end + 1));
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
      temperature: 0.8,
      messages: [{ role: "user", content: prompt }],
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
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
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
  const parsed = SuggestionsSchema.parse(extractJsonArray(raw));
  return parsed.slice(0, args.count);
}
