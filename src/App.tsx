import { LogIn, Music2, Pause, Play, RefreshCw, SkipBack, SkipForward } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { useSpotifyLyrics } from "./hooks/useSpotifyLyrics";
import { completeSpotifyLogin, getSpotifyClientId, skipToNext, skipToPrevious, startSpotifyLogin, togglePlayback } from "./lib/spotify";

export function App() {
  const { accessToken, playback, visibleLines, status, message, refreshTokenFromStorage } =
    useSpotifyLyrics();
  const [authError, setAuthError] = useState("");
  const [controlError, setControlError] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      setAuthError(error);
      window.history.replaceState({}, "", "/");
      return;
    }

    if (!code) return;

    completeSpotifyLogin(code)
      .then(() => {
        window.history.replaceState({}, "", "/");
        refreshTokenFromStorage();
      })
      .catch((loginError) => {
        setAuthError(loginError instanceof Error ? loginError.message : "Spotify login failed");
      });
  }, [refreshTokenFromStorage]);

  const track = playback?.track;
  const shouldShowLogin = !accessToken || !getSpotifyClientId();

  function handleDragStart() {
    void getCurrentWindow().startDragging();
  }

  async function handlePlaybackControl(action: "previous" | "toggle" | "next") {
    if (!accessToken) return;

    try {
      setControlError("");
      if (action === "previous") await skipToPrevious(accessToken);
      if (action === "toggle") await togglePlayback(accessToken, Boolean(playback?.isPlaying));
      if (action === "next") await skipToNext(accessToken);
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "Spotify control failed");
    }
  }

  async function handleWindowControl(action: "close" | "minimize" | "maximize") {
    const window = getCurrentWindow();
    if (action === "close") await window.close();
    if (action === "minimize") await window.minimize();
    if (action === "maximize") await window.toggleMaximize();
  }

  return (
    <main className="overlay-shell">
      <section className="lyric-panel" aria-live="polite">
        <div className="window-titlebar drag-handle" onPointerDown={handleDragStart} title="Drag to move overlay">
          <div className="traffic-lights" onPointerDown={(event) => event.stopPropagation()}>
            <button className="traffic-light close" type="button" onClick={() => void handleWindowControl("close")} aria-label="Close" title="Close" />
            <button className="traffic-light minimize" type="button" onClick={() => void handleWindowControl("minimize")} aria-label="Minimize" title="Minimize" />
            <button className="traffic-light maximize" type="button" onClick={() => void handleWindowControl("maximize")} aria-label="Maximize" title="Maximize" />
          </div>
        </div>

        <div className="track-row drag-handle" onPointerDown={handleDragStart} title="Drag to move overlay">
          <div className="cover-art" aria-hidden="true">
            {track?.albumArtUrl ? <img src={track.albumArtUrl} alt="" /> : <Music2 size={16} />}
          </div>
          <div className="track-copy">
            <span className="track-title">{track?.name ?? "Spotify Lyrics"}</span>
            <span className="track-artist">{track?.artist ?? "Waiting for playback"}</span>
          </div>
          {accessToken && (
            <div className="transport-controls" onPointerDown={(event) => event.stopPropagation()}>
              <button className="control-button" type="button" onClick={() => void handlePlaybackControl("previous")} title="Previous song">
                <SkipBack size={14} aria-hidden="true" />
              </button>
              <button className="control-button primary" type="button" onClick={() => void handlePlaybackControl("toggle")} title={playback?.isPlaying ? "Pause" : "Play"}>
                {playback?.isPlaying ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
              </button>
              <button className="control-button" type="button" onClick={() => void handlePlaybackControl("next")} title="Next song">
                <SkipForward size={14} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {shouldShowLogin ? (
          <div className="empty-state">
            <p>{getSpotifyClientId() ? "Connect Spotify to start syncing." : "Add a Spotify client ID."}</p>
            <button className="icon-button" onClick={() => void startSpotifyLogin()} disabled={!getSpotifyClientId()}>
              <LogIn size={17} aria-hidden="true" />
              <span>Connect</span>
            </button>
          </div>
        ) : (
          <div className="lyrics-stack" key={track?.id ?? "no-track"}>
            <LyricLine
              key={`previous-${visibleLines.previous?.timeMs ?? "blank"}`}
              kind="previous"
              text={visibleLines.previous?.text}
            />
            <LyricLine
              key={`current-${visibleLines.current?.timeMs ?? message}`}
              kind="current"
              text={visibleLines.current?.text || message || "Listening..."}
            />
            <LyricLine
              key={`next-${visibleLines.next?.timeMs ?? "blank"}`}
              kind="next"
              text={visibleLines.next?.text}
            />
          </div>
        )}

        {(authError || controlError || status === "error") && (
          <button className="status-button" onClick={refreshTokenFromStorage}>
            <RefreshCw size={14} aria-hidden="true" />
            <span>{authError || controlError || message}</span>
          </button>
        )}
      </section>
    </main>
  );
}

function LyricLine({ kind, text }: { kind: "previous" | "current" | "next"; text?: string | null }) {
  return (
    <p className={`lyric-line ${kind} ${text ? "has-text" : ""}`}>
      {text ?? ""}
    </p>
  );
}
