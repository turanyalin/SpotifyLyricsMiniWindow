export type SpotifyTrack = {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArtUrl: string | null;
  durationMs: number;
};

export type PlaybackState = {
  isPlaying: boolean;
  progressMs: number;
  fetchedAt: number;
  track: SpotifyTrack | null;
};

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

const spotifyAccountsUrl = "https://accounts.spotify.com";
const spotifyApiUrl = "https://api.spotify.com/v1";
const verifierStorageKey = "spotify_pkce_verifier";
const tokenStorageKey = "spotify_token";
const spotifyScopes = ["user-read-playback-state", "user-modify-playback-state"];

export function getSpotifyClientId() {
  return import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
}

export function getRedirectUri() {
  return (
    (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined) ||
    `${window.location.origin}/callback`
  );
}

export function getStoredToken() {
  const raw = localStorage.getItem(tokenStorageKey);
  if (!raw) return null;

  const token = JSON.parse(raw) as {
    accessToken: string;
    expiresAt: number;
    refreshToken?: string;
    scopes?: string[];
  };
  if (Date.now() > token.expiresAt - 30_000) return null;
  if (!spotifyScopes.every((scope) => token.scopes?.includes(scope))) return null;

  return token.accessToken;
}

export function clearStoredToken() {
  localStorage.removeItem(tokenStorageKey);
}

export async function startSpotifyLogin() {
  const clientId = getSpotifyClientId();
  if (!clientId) {
    throw new Error("Missing VITE_SPOTIFY_CLIENT_ID");
  }

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  localStorage.setItem(verifierStorageKey, verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    scope: spotifyScopes.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  window.location.assign(`${spotifyAccountsUrl}/authorize?${params.toString()}`);
}

export async function completeSpotifyLogin(code: string) {
  const clientId = getSpotifyClientId();
  const verifier = localStorage.getItem(verifierStorageKey);
  if (!clientId || !verifier) {
    throw new Error("Spotify login state is missing");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: verifier,
  });

  const response = await fetch(`${spotifyAccountsUrl}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Spotify token exchange failed with ${response.status}`);
  }

  const token = (await response.json()) as TokenResponse;
  storeToken(token);
  localStorage.removeItem(verifierStorageKey);
}

export async function getPlaybackState(accessToken: string): Promise<PlaybackState> {
  const requestStartedAt = performance.now();
  const response = await fetch(`${spotifyApiUrl}/me/player`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const responseReceivedAt = performance.now();
  const estimatedServerProgressAt = requestStartedAt + (responseReceivedAt - requestStartedAt) / 2;

  if (response.status === 204) {
    return {
      isPlaying: false,
      progressMs: 0,
      fetchedAt: estimatedServerProgressAt,
      track: null,
    };
  }

  if (response.status === 401) {
    clearStoredToken();
    throw new Error("Spotify session expired");
  }

  if (!response.ok) {
    throw new Error(`Spotify playback request failed with ${response.status}`);
  }

  const data = await response.json();
  const item = data.item;

  return {
    isPlaying: Boolean(data.is_playing),
    progressMs: Number(data.progress_ms ?? 0),
    fetchedAt: estimatedServerProgressAt,
    track:
      item?.type === "track"
        ? {
            id: item.id,
            name: item.name,
            artist: item.artists?.map((artist: { name: string }) => artist.name).join(", ") ?? "",
            album: item.album?.name ?? "",
            albumArtUrl: getAlbumArtUrl(item.album?.images),
            durationMs: Number(item.duration_ms ?? 0),
          }
        : null,
  };
}

export async function togglePlayback(accessToken: string, isPlaying: boolean) {
  await spotifyCommand(accessToken, isPlaying ? "pause" : "play", "PUT");
}

export async function skipToNext(accessToken: string) {
  await spotifyCommand(accessToken, "next", "POST");
}

export async function skipToPrevious(accessToken: string) {
  await spotifyCommand(accessToken, "previous", "POST");
}

async function spotifyCommand(
  accessToken: string,
  command: "pause" | "play" | "next" | "previous",
  method: "PUT" | "POST",
) {
  const response = await fetch(`${spotifyApiUrl}/me/player/${command}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    clearStoredToken();
    throw new Error("Reconnect Spotify to control playback");
  }

  if (response.status === 404) {
    throw new Error("No active Spotify device");
  }

  if (!response.ok && response.status !== 204) {
    throw new Error(`Spotify ${command} failed with ${response.status}`);
  }
}

function getAlbumArtUrl(images?: Array<{ url: string; width?: number; height?: number }>) {
  if (!images || images.length === 0) return null;
  return [...images].sort(
    (a, b) => Math.abs((a.width ?? 300) - 128) - Math.abs((b.width ?? 300) - 128),
  )[0].url;
}

function storeToken(token: TokenResponse) {
  localStorage.setItem(
    tokenStorageKey,
    JSON.stringify({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      scopes: token.scope?.split(" ") ?? spotifyScopes,
      expiresAt: Date.now() + token.expires_in * 1000,
    }),
  );
}

function generateCodeVerifier() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function generateCodeChallenge(verifier: string) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
