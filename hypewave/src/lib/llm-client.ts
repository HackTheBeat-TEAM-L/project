import type { SongSuggestion } from "./types";

export async function requestRecommendations(params: {
  title?: string;
  artist?: string;
  genre?: string;
  count?: number;
}): Promise<SongSuggestion[]> {
  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `LLM request failed: ${res.status}`);
  }
  const data = await res.json();
  return (data.suggestions ?? []) as SongSuggestion[];
}
