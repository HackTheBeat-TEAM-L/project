import type { TrackRef } from "./types";

// Browser-side Spotify Web API. Uses the short-lived user access token from /api/token.
export async function fetchAccessToken(): Promise<string | null> {
  const res = await fetch("/api/token", { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return typeof data.access_token === "string" ? data.access_token : null;
}

export async function searchTrack(query: string, token: string): Promise<TrackRef | null> {
  const url = `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  const item = data?.tracks?.items?.[0];
  if (!item) return null;
  return {
    uri: item.uri,
    id: item.id,
    title: item.name,
    artist: (item.artists ?? []).map((a: { name: string }) => a.name).join(", "),
  };
}

export async function transferPlayback(deviceId: string, token: string): Promise<void> {
  await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
}

export async function playTrackUri(
  deviceId: string,
  uri: string,
  token: string
): Promise<void> {
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [uri] }),
    }
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(`play failed: ${res.status} ${await res.text()}`);
  }
}
