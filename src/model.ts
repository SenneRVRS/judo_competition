export type Color = "white" | "red";
export type Score = { i: number; w: number; y: number; s: number };
export type Settings = {
  regular: number;
  golden: number;
  mode: "up" | "down";
  noGolden: boolean;
  title: string;
  mat: string;
  holdWaza: number;
  holdIppon: number;
};
export type Hold = {
  elapsed: number;
  startedAt: number | null;
  status: "idle" | "active" | "stopped";
  favor: Color | null;
  awarded: number;
  buzzed: boolean;
  pausedAt?: number | null;
};
export const emptyHold = (): Hold => ({
  elapsed: 0,
  startedAt: null,
  status: "idle",
  favor: null,
  awarded: 0,
  buzzed: false,
});
export type State = {
  scores: Record<Color, Score>;
  names: Record<Color, string>;
  settings: Settings;
  swapped: boolean;
  phase: "regular" | "golden";
  elapsed: number;
  startedAt: number | null;
  hold: Hold;
  pausedAt?: number | null;
};
export const emptyScore = (): Score => ({ i: 0, w: 0, y: 0, s: 0 });
export const initial = (): State => ({
  scores: { white: emptyScore(), red: emptyScore() },
  names: { white: "", red: "" },
  settings: {
    regular: 240,
    golden: 120,
    mode: "up",
    noGolden: false,
    title: "Judo competition",
    mat: "01",
    holdWaza: 10,
    holdIppon: 20,
  },
  swapped: false,
  phase: "regular",
  elapsed: 0,
  startedAt: null,
  hold: emptyHold(),
});
export const elapsedAt = (s: State, now: number) =>
  s.elapsed + (s.startedAt === null ? 0 : Math.max(0, now - s.startedAt));
export const duration = (s: State) =>
  s.phase === "regular"
    ? s.settings.regular * 1000
    : s.settings.mode === "down"
      ? s.settings.golden * 1000
      : Infinity;
export const snapshot = (s: State, now: number): State => ({
  ...s,
  elapsed: Math.min(elapsedAt(s, now), duration(s)),
  startedAt: s.startedAt === null ? null : now,
  hold: {
    ...s.hold,
    elapsed: holdElapsed(s, now),
    startedAt: s.hold.startedAt === null ? null : now,
  },
});
export const holdElapsed = (s: State, now: number) =>
  s.hold.elapsed +
  (s.hold.startedAt === null ? 0 : Math.max(0, now - s.hold.startedAt));

// Keep the current hold's contribution separate so reassignment removes only
// that contribution and preserves the other scores and penalties.
export function updateHold(s: State, now: number, favor = s.hold.favor): State {
  if (s.hold.status === "idle") return s;
  const scores = { white: { ...s.scores.white }, red: { ...s.scores.red } };
  const old = s.hold.favor;
  if (old) {
    const units = Math.max(
      0,
      scores[old].i * 2 + scores[old].w - s.hold.awarded,
    );
    scores[old].i = Math.floor(units / 2);
    scores[old].w = units % 2;
  }
  const elapsed = holdElapsed(s, now);
  const stage =
    elapsed >= s.settings.holdIppon * 1000
      ? 2
      : elapsed >= s.settings.holdWaza * 1000
        ? 1
        : 0;
  const awarded = favor ? (stage === 2 && scores[favor].w ? 1 : stage) : 0;
  const ippon = !!favor && awarded > 0 && scores[favor].w + awarded >= 2;
  if (favor) {
    const units = scores[favor].i * 2 + scores[favor].w + awarded;
    scores[favor].i = Math.floor(units / 2);
    scores[favor].w = units % 2;
  }
  // A corrected assignment starts a new buzzer decision. An early ippon
  // for the previous competitor must not silence the new competitor's alarm.
  const buzzed = (favor === old && s.hold.buzzed) || ippon || stage === 2;
  if (favor === old && awarded === s.hold.awarded && buzzed === s.hold.buzzed)
    return s;
  return { ...s, scores, hold: { ...s.hold, favor, awarded, buzzed } };
}
export const shouldBuzz = (previous: Hold, next: Hold) =>
  next.buzzed && (!previous.buzzed || previous.favor !== next.favor);
export function startHold(s: State, now: number): State {
  return { ...s, hold: { ...emptyHold(), status: "active", startedAt: now } };
}
export function pauseHold(s: State, now: number): State {
  const next = updateHold(s, now);
  return {
    ...next,
    hold: {
      ...next.hold,
      elapsed: holdElapsed(next, now),
      startedAt: next.hold.startedAt === null ? now : null,
      pausedAt: next.hold.startedAt === null ? null : now,
    },
  };
}
export function stopHold(s: State, now: number): State {
  const next = updateHold(s, now);
  return {
    ...next,
    hold: {
      ...next.hold,
      elapsed: holdElapsed(next, now),
      startedAt: null,
      status: "stopped",
      pausedAt: null,
    },
  };
}
export function toggleClock(s: State, now: number): State {
  const next = snapshot(s, now);
  const resuming = next.startedAt === null && next.elapsed < duration(next);
  return { ...next, startedAt: resuming ? now : null,
    pausedAt: resuming ? null : next.startedAt !== null ? now : next.pausedAt };
}
export function resetPausedHold(s: State, now: number): State {
  if (s.hold.status === 'idle') return s;
  const mainPaused = s.startedAt === null && s.pausedAt != null && now - s.pausedAt > 5000;
  const holdPaused = s.hold.status === 'active' && s.hold.startedAt === null && s.hold.pausedAt != null && now - s.hold.pausedAt > 5000;
  return mainPaused || holdPaused ? { ...s, hold: emptyHold() } : s;
}
export function winner(
  s: State,
  now: number,
): { color?: Color; reason: string } {
  const a = s.scores.white,
    b = s.scores.red;
  const whiteWins = a.i > 0 || b.s >= 3,
    redWins = b.i > 0 || a.s >= 3;
  if (whiteWins && redWins)
    return { reason: "Conflicting results · check scores" };
  if (whiteWins || redWins)
    return {
      color: whiteWins ? "white" : "red",
      reason: (whiteWins ? b.s : a.s) >= 3 ? "Opponent has 3 shidos" : "Ippon",
    };
  if (s.phase === "golden" || elapsedAt(s, now) >= duration(s)) {
    if (a.w !== b.w)
      return {
        color: a.w > b.w ? "white" : "red",
        reason: "Waza’ari advantage",
      };
    if (a.w === 0 && b.w === 0 && a.y !== b.y)
      return { color: a.y > b.y ? "white" : "red", reason: "Yuko advantage" };
  }
  return { reason: elapsedAt(s, now) >= duration(s) ? "Draw" : "" };
}
export function point(
  s: State,
  color: Color,
  key: keyof Score,
  delta: number,
): State {
  const score = { ...s.scores[color] };
  score[key] = Math.max(0, score[key] + delta);
  if (key === "s") score.s = Math.min(3, score.s);
  if (score.w >= 2) {
    score.i += Math.floor(score.w / 2);
    score.w %= 2;
  }
  return { ...s, scores: { ...s.scores, [color]: score } };
}
export const golden = (s: State, now: number): State => ({
  ...s,
  phase: "golden",
  pausedAt: null,
  elapsed: 0,
  startedAt: now,
});
export function expire(s: State, now: number): State {
  if (s.startedAt === null || elapsedAt(s, now) < duration(s)) return s;
  if (
    s.phase === "regular" &&
    !s.settings.noGolden &&
    !winner(s, now).color &&
    !s.scores.white.i &&
    !s.scores.red.i &&
    s.scores.white.s < 3 &&
    s.scores.red.s < 3
  )
    return golden(s, now);
  return { ...s, elapsed: duration(s), startedAt: null };
}
export const formatTime = (ms: number, up = false) => {
  const sec = Math.max(0, up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)
    .toString()
    .padStart(2, "0")}:${(sec % 60).toString().padStart(2, "0")}`;
};
