import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findCurrentLyricIndex, LyricLine } from "../lib/lrc";
import { fetchSyncedLyrics } from "../lib/lyrics";
import { getPlaybackState, getStoredToken, PlaybackState } from "../lib/spotify";

const spotifyPollMs = 1_000;

type Status = "needs-login" | "connecting" | "idle" | "playing" | "no-lyrics" | "error";

export function useSpotifyLyrics() {
  const [accessToken, setAccessToken] = useState(() => getStoredToken());
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [status, setStatus] = useState<Status>(accessToken ? "connecting" : "needs-login");
  const [message, setMessage] = useState("");
  const localClockRef = useRef({ progressMs: 0, syncedAt: performance.now(), isPlaying: false });
  const currentIndexRef = useRef(-1);
  const lyricTrackIdRef = useRef<string | null>(null);

  const refreshTokenFromStorage = useCallback(() => {
    const token = getStoredToken();
    setAccessToken(token);
    setStatus(token ? "connecting" : "needs-login");
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    let canceled = false;
    const token = accessToken;

    let timeoutId = 0;

    async function pollPlayback() {
      try {
        const nextPlayback = await getPlaybackState(token);
        if (canceled) return;

        setPlayback(nextPlayback);
        localClockRef.current = {
          progressMs: nextPlayback.progressMs,
          syncedAt: nextPlayback.fetchedAt,
          isPlaying: nextPlayback.isPlaying,
        };

        if (!nextPlayback.track) {
          setStatus("idle");
          setMessage("Spotify is quiet");
          setLyrics([]);
          lyricTrackIdRef.current = null;
          return;
        }

        setStatus(nextPlayback.isPlaying ? "playing" : "idle");
        setMessage(nextPlayback.isPlaying ? "" : "Paused");

        if (nextPlayback.track.id !== lyricTrackIdRef.current) {
          lyricTrackIdRef.current = nextPlayback.track.id;
          setLyrics([]);
          currentIndexRef.current = -1;
          setCurrentIndex(-1);

          const syncedLyrics = await fetchSyncedLyrics(nextPlayback.track);
          if (canceled) return;

          setLyrics(syncedLyrics);
          if (syncedLyrics.length === 0) {
            setStatus("no-lyrics");
            setMessage("No synced lyrics found");
          }
        }
      } catch (error) {
        if (canceled) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Something went wrong");
      } finally {
        if (!canceled) {
          timeoutId = window.setTimeout(pollPlayback, spotifyPollMs);
        }
      }
    }

    pollPlayback();

    return () => {
      canceled = true;
      window.clearTimeout(timeoutId);
    };
  }, [accessToken]);

  useEffect(() => {
    let frameId = 0;

    function tick(now: number) {
      const clock = localClockRef.current;
      const progressMs = clock.isPlaying ? clock.progressMs + now - clock.syncedAt : clock.progressMs;
      const nextIndex = findCurrentLyricIndex(lyrics, progressMs);
      if (nextIndex !== currentIndexRef.current) {
        currentIndexRef.current = nextIndex;
        setCurrentIndex(nextIndex);
      }
      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [lyrics]);

  const visibleLines = useMemo(
    () => ({
      previous: currentIndex > 0 ? lyrics[currentIndex - 1] : null,
      current: currentIndex >= 0 ? lyrics[currentIndex] : null,
      next: currentIndex >= 0 && currentIndex + 1 < lyrics.length ? lyrics[currentIndex + 1] : null,
    }),
    [currentIndex, lyrics],
  );

  return {
    accessToken,
    playback,
    visibleLines,
    status,
    message,
    refreshTokenFromStorage,
  };
}
