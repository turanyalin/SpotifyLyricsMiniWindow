export type LyricLine = {
  timeMs: number;
  text: string;
};

const timestampPattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

export function parseLrc(lrc: string): LyricLine[] {
  return lrc
    .split(/\r?\n/)
    .flatMap((line) => {
      const matches = [...line.matchAll(timestampPattern)];
      if (matches.length === 0) return [];

      const text = line.replace(timestampPattern, "").trim();
      return matches.map((match) => ({
        timeMs: toTimeMs(match[1], match[2], match[3]),
        text,
      }));
    })
    .filter((line) => line.text.length > 0)
    .sort((a, b) => a.timeMs - b.timeMs);
}

export function findCurrentLyricIndex(lines: LyricLine[], progressMs: number) {
  if (lines.length === 0 || progressMs < lines[0].timeMs) return -1;

  let low = 0;
  let high = lines.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = lines[mid];
    const next = lines[mid + 1];

    if (progressMs >= current.timeMs && (!next || progressMs < next.timeMs)) {
      return mid;
    }

    if (progressMs < current.timeMs) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return -1;
}

function toTimeMs(minutes: string, seconds: string, fraction = "0") {
  const normalizedFraction = fraction.padEnd(3, "0").slice(0, 3);
  return Number(minutes) * 60_000 + Number(seconds) * 1_000 + Number(normalizedFraction);
}
