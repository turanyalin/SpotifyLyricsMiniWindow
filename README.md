# Spotify Lyrics Overlay

A Tauri + React starter app that shows the previous, current, and next synced lyric lines for the Spotify track currently playing.

## Setup

1. Create a Spotify app at the Spotify Developer Dashboard.
2. Add this redirect URI while developing:

   ```text
   http://127.0.0.1:1420/callback
   ```

3. Copy `.env.example` to `.env` and set `VITE_SPOTIFY_CLIENT_ID`.
4. Install dependencies and run:

   ```sh
   npm install
   npm run tauri dev
   ```

The app requests `user-read-playback-state`, polls Spotify every 2 seconds, fetches synced lyrics from LRCLIB when the track changes, and uses a local animation-frame clock between Spotify sync pulses.

## Notes

- Spotify must be actively playing on one of your devices.
- LRCLIB does not have synced lyrics for every song. The overlay will show a small status message when synced lyrics are unavailable.
- For production builds, register the production redirect URI you intend to use and set `VITE_SPOTIFY_REDIRECT_URI` accordingly.
