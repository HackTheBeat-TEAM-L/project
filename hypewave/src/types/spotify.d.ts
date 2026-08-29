export {};

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: typeof Spotify;
  }

  namespace Spotify {
    interface Artist {
      name: string;
      uri: string;
    }
    interface Track {
      id: string;
      uri: string;
      name: string;
      artists: Artist[];
    }
    interface TrackWindow {
      current_track: Track;
    }
    interface PlaybackState {
      paused: boolean;
      position: number;
      duration: number;
      track_window: TrackWindow;
    }
    interface PlayerInit {
      name: string;
      getOAuthToken: (cb: (token: string) => void) => void;
      volume?: number;
    }
    class Player {
      constructor(init: PlayerInit);
      connect(): Promise<boolean>;
      disconnect(): void;
      addListener(event: "ready" | "not_ready", cb: (d: { device_id: string }) => void): void;
      addListener(event: "player_state_changed", cb: (s: PlaybackState | null) => void): void;
      addListener(
        event: "initialization_error" | "authentication_error" | "account_error" | "playback_error",
        cb: (d: { message: string }) => void
      ): void;
      removeListener(event: string): void;
      getCurrentState(): Promise<PlaybackState | null>;
    }
  }
}
