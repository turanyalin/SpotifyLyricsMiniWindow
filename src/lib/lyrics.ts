import { LyricLine, parseLrc } from "./lrc";
import type { SpotifyTrack } from "./spotify";

type LrclibResponse = {
  syncedLyrics: string | null;
  instrumental: boolean;
};

export async function fetchSyncedLyrics(track: SpotifyTrack): Promise<LyricLine[]> {
  const params = new URLSearchParams({
    track_name: track.name,
    artist_name: track.artist,
    album_name: track.album,
    duration: String(Math.round(track.durationMs / 1000)),
  });

  const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "Lrclib-Client": "spotify-lyrics-overlay/0.1.0",
    },
  });

  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`LRCLIB returned ${response.status}`);
  }

  const data = (await response.json()) as LrclibResponse;
  if (data.instrumental || !data.syncedLyrics) return [];

  return parseLrc(data.syncedLyrics);
}
