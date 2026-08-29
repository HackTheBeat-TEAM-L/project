export interface TrackRef {
  uri: string; // spotify:track:...
  id: string;
  title: string;
  artist: string;
}

export interface SongSuggestion {
  title: string;
  artist: string;
}

export type EventKind =
  | "info"
  | "trigger"
  | "llm"
  | "search"
  | "queue"
  | "play"
  | "error";

export interface EventLogEntry {
  ts: number;
  kind: EventKind;
  message: string;
}

export interface TokenResponse {
  access_token: string;
  expires_at: number; // epoch ms
}
