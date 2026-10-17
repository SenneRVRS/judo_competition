import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Menu,
  X,
  Play,
  Pause,
  RotateCcw,
  Undo2,
  ArrowLeftRight,
  Monitor,
  Maximize,
  Settings2,
  Plus,
  Minus,
  ChevronRight,
  Flag,
} from "lucide-react";
import {
  initial,
  shouldBuzz,
  toggleClock,
  resetPausedHold,
  emptyHold,
  holdElapsed,
  updateHold,
  startHold,
  pauseHold,
  stopHold,
  elapsedAt,
  duration,
  snapshot,
  winner,
  point,
  golden,
  expire,
  formatTime,
  type State,
  type Color,
  type Settings,
} from "./model";
import "./style.css";

const session =
  new URLSearchParams(location.search).get("session") || "default";
const isMirror = new URLSearchParams(location.search).has("mirror");
const storageKey = `hajime-v1-${session}`;
function restore(): State {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved?.settings && saved?.scores)
      return {
        ...initial(),
        ...saved,
        settings: { ...initial().settings, ...saved.settings },
        hold: saved.hold || emptyHold(),
      };
  } catch {
    /* New board if storage is unavailable. */
  }
  return initial();
}
function DurationInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="duration-input">
      <legend>{label}</legend>
      <label>
        Minutes
        <input
          aria-label={label + " minutes"}
          type="number"
          min="0"
          max="1440"
          required
          value={Math.floor(value / 60)}
          onChange={(e) => onChange(Number(e.target.value) * 60 + (value % 60))}
        />
      </label>
      <label>
        Seconds
        <input
          aria-label={label + " seconds"}
          type="number"
          min="0"
          max="59"
          required
          value={value % 60}
          onChange={(e) =>
            onChange(Math.floor(value / 60) * 60 + Number(e.target.value))
          }
        />
      </label>
    </fieldset>
  );
}
function App() {
  const [state, setState] = useState<State>(restore),
    [now, setNow] = useState(Date.now());
  const audio = useRef<AudioContext | null>(null);
  const [presentation, setPresentation] = useState(false);
  function unlockAudio() {
    try {
      audio.current ||= new AudioContext();
      void audio.current
        .resume()
        .catch(() => setNotice("Enable browser audio for the buzzer."));
    } catch {
      setNotice("Audio unavailable.");
    }
  }
  function buzzer() {
    if (isMirror) return;
    const ctx = audio.current;
    if (!ctx || ctx.state !== "running") {
      setNotice("IPPON — buzzer audio blocked by browser.");
      return;
    }
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  const current = useRef(state),
    history = useRef<State[]>([]),
    channel = useRef<BroadcastChannel | null>(null);
  const [menu, setMenu] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [context, setContext] = useState<{ x: number; y: number } | null>(null),
    [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Settings>(state.settings),
    [names, setNames] = useState(state.names);
  function publish(next: State) {
    if (shouldBuzz(current.current.hold, next.hold)) buzzer();
    current.current = next;
    setState(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      setNotice("Browser storage unavailable. Keep this window open.");
    }
    channel.current?.postMessage(next);
  }
  function act(transform: (s: State) => State) {
    if (isMirror) return;
    unlockAudio();
    const t = Date.now();
    history.current.push(snapshot(current.current, t));
    publish(transform(snapshot(current.current, t)));
  }
  function undo() {
    if (isMirror) return;
    const previous = history.current.pop();
    if (previous)
      publish({
        ...previous,
        startedAt: previous.startedAt === null ? null : Date.now(),
        pausedAt: previous.pausedAt == null ? null : Date.now(),
        hold: {
          ...previous.hold,
          startedAt: previous.hold.startedAt === null ? null : Date.now(),
          pausedAt: previous.hold.pausedAt == null ? null : Date.now(),
        },
      });
  }
  function toggle() {
    act((s) => toggleClock(s, Date.now()));
    setContext(null);
  }
  function restart() {
    act((s) => ({ ...s, elapsed: 0, startedAt: null, pausedAt: null }));
    setContext(null);
  }
  function openSettings() {
    setDraft(current.current.settings);
    setNames(current.current.names);
    setSettingsOpen(true);
    setMenu(false);
    setContext(null);
  }
  useEffect(() => {
    const bc = new BroadcastChannel(storageKey);
    channel.current = bc;
    bc.onmessage = (e) => {
      if (e.data === "request") {
        if (!isMirror) bc.postMessage(current.current);
      } else if (isMirror) {
        current.current = e.data;
        setState(e.data);
      }
    };
    if (isMirror) bc.postMessage("request");
    const sync = (e: StorageEvent) => {
      if (isMirror && e.key === storageKey && e.newValue) {
        const s = JSON.parse(e.newValue);
        current.current = s;
        setState(s);
      }
    };
    window.addEventListener("storage", sync);
    const interval = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (!isMirror) {
        const next = expire(updateHold(resetPausedHold(current.current, t), t), t);
        if (next !== current.current) {
          const before = snapshot(current.current, t);
          if (
            next.hold.status !== 'idle' && (next.hold.awarded !== before.hold.awarded ||
            next.hold.buzzed !== before.hold.buzzed)
          ) {
            const threshold =
              before.hold.awarded === 0 && next.hold.awarded > 0
                ? before.settings.holdWaza
                : before.settings.holdIppon;
            before.hold = {
              ...before.hold,
              elapsed: Math.min(before.hold.elapsed, threshold * 1000 - 1),
              startedAt: null,
            };
          }
          history.current.push({
            ...before,
            startedAt:
              next.phase !== current.current.phase || next.startedAt === null
                ? null
                : t,
          });
          publish(next);
        }
      }
    }, 100);
    return () => {
      bc.close();
      clearInterval(interval);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        setSettingsOpen(false);
        setContext(null);
      }
      if ((e.target as HTMLElement).closest("input,select,textarea")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
      if (e.code === "Space" && !isMirror && !settingsOpen) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [settingsOpen]);
  const running = state.startedAt !== null,
    up = state.phase === "golden" && state.settings.mode === "up";
  const time = formatTime(
    up ? elapsedAt(state, now) : duration(state) - elapsedAt(state, now),
    up,
  );
  const result = winner(state, now);
  const left: Color = state.swapped !== isMirror ? "red" : "white";
  async function fullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setPresentation(false);
      return;
    }
    if (presentation) {
      setPresentation(false);
      return;
    }
    setPresentation(true);
    try {
      if (!document.fullscreenEnabled) throw new Error("Unavailable");
      await document.documentElement.requestFullscreen();
    } catch {
      setNotice(
        "Presentation view enabled. This browser blocks native fullscreen; open the mirror in Chrome or Edge and press F11 for screen-wide display.",
      );
    }
  }
  useEffect(() => {
    const change = () => setPresentation(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  function mirror() {
    const url = new URL(location.href);
    url.searchParams.set("mirror", "1");
    url.searchParams.set("session", session);
    if (!window.open(url, `hajime-mirror-${session}`))
      setNotice("Allow pop-ups for this site to open the mirror screen.");
    setMenu(false);
  }
  function competitor(color: Color) {
    const score = state.scores[color];
    return (
      <section
        className={`competitor ${color}`}
        key={color}
        aria-label={`${color} competitor`}
      >
        <div className="competitor-heading">
          <span className="color-mark" />
          <span>
            {color === "white" ? "SHIRO" : "AKA"} / {color.toUpperCase()}
          </span>
        </div>
        {state.names[color] && <h2>{state.names[color]}</h2>}
        <div className="scoreboard">
          <div className="scores">
            {(["i", "w", "y"] as const).map((k) => (
              <div className="score" key={k}>
                <span className="score-label">
                  {k.toUpperCase()}
                  <small>{{ i: "IPPON", w: "WAZA’ARI", y: "YUKO" }[k]}</small>
                </span>
                <button
                  className="score-value"
                  disabled={isMirror}
                  aria-label={`Add ${k} for ${color}`}
                  onClick={() => act((s) => point(s, color, k, 1))}
                >
                  {score[k]}
                </button>
                {!isMirror && (
                  <div className="stepper">
                    <button
                      aria-label={`Subtract ${k} for ${color}`}
                      disabled={score[k] === 0}
                      onClick={() => act((s) => point(s, color, k, -1))}
                    >
                      <Minus size={15} />
                    </button>
                    <button
                      aria-label={`Increase ${k} for ${color}`}
                      onClick={() => act((s) => point(s, color, k, 1))}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="shido">
            <span>SHIDO</span>
            <div className="shido-dots" aria-label={`${score.s} shidos`}>
              {[1, 2, 3].map((n) => (
                <span key={n} className={n <= score.s ? "filled" : ""} />
              ))}
            </div>
            <strong>{score.s}</strong>
            {!isMirror && (
              <div className="stepper">
                <button
                  aria-label={`Subtract shido for ${color}`}
                  disabled={!score.s}
                  onClick={() => act((s) => point(s, color, "s", -1))}
                >
                  <Minus size={15} />
                </button>
                <button
                  aria-label={`Add shido for ${color}`}
                  disabled={score.s >= 3}
                  onClick={() => act((s) => point(s, color, "s", 1))}
                >
                  <Plus size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }
  return (
    <main
      className={[
        isMirror ? "mirror" : "",
        presentation ? "presentation" : "",
        left === "red" ? "red-left" : "",
      ].join(" ")}
    >
      <div className="halves">
        {competitor(left)}
        {competitor(left === "white" ? "red" : "white")}
      </div>
      <header>
        {!isMirror && <button className="reset-match" onClick={() => {
          act(s => ({ ...initial(), settings: s.settings, names: s.names, swapped: s.swapped }));
        }}><RotateCcw size={17}/> Reset match</button>}
        <div className="header-right">
          <span className="mat">TATAMI {state.settings.mat}</span>
          <button
            className="icon-button"
            aria-label={isMirror ? "Fullscreen" : "Open menu"}
            onClick={() => (isMirror ? fullscreen() : setMenu(!menu))}
          >
            {isMirror ? (
              <Maximize size={19} />
            ) : menu ? (
              <X size={19} />
            ) : (
              <Menu size={19} />
            )}
          </button>
        </div>
      </header>
      <div className="center">
        <div className={`phase ${state.phase === "golden" ? "gold" : ""}`}>
          <span />
          {state.phase === "golden" ? "GOLDEN SCORE" : "REGULAR TIME"}
        </div>
        <button
          className="timer"
          aria-label="Countdown; click to pause or resume"
          onClick={toggle}
          onContextMenu={(e) => {
            if (!isMirror) {
              e.preventDefault();
              setContext({
                x: Math.min(e.clientX, window.innerWidth - 270),
                y: Math.min(e.clientY, window.innerHeight - 260),
              });
            }
          }}
        >
          {time}
        </button>
        <div className="timer-status">
          {running
            ? up
              ? "COUNTING UP"
              : "MATCH IN PROGRESS"
            : elapsedAt(state, now) >= duration(state)
              ? "TIME EXPIRED"
              : state.elapsed
                ? "PAUSED"
                : "READY TO BEGIN"}
        </div>
        {!isMirror && (
          <div className="timer-controls">
            <button className="primary" onClick={toggle}>
              {running ? <Pause size={17} /> : <Play size={17} />}{" "}
              {running ? "Pause" : "Start"}
            </button>
            <button
              className="round-control"
              aria-label="Restart countdown"
              onClick={restart}
            >
              <RotateCcw size={18} />
            </button>
          </div>
        )}
        {!isMirror && result.reason && (
          <div className="result" role="status">
            {result.color && (
              <strong>
                {state.names[result.color] ||
                  `${result.color === "white" ? "White" : "Red"} competitor`}{" "}
                wins ·{" "}
              </strong>
            )}
            {result.reason}
            <small>Scores remain editable</small>
          </div>
        )}
      </div>
      <aside
        className={"hold-panel " + (state.hold.favor || "unassigned") + (state.hold.status === 'idle' ? ' hold-idle' : '')}
        aria-label="Osae Komi"
      >
        {(state.hold.status !== "idle" || !isMirror) && (
          <>
            <span className="hold-label">OSAE KOMI</span>
            <strong className="hold-time">
              {formatTime(holdElapsed(state, now), true)}
            </strong>
            {!isMirror && (
              <div className="hold-controls">
                {state.hold.status !== "active" ? (
                  <button onClick={() => act((s) => startHold(s, Date.now()))}>
                    {state.hold.status === 'idle' && <Play size={14}/>}
                    {state.hold.status === "stopped"
                      ? "New hold"
                      : "Start hold"}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => act((s) => pauseHold(s, Date.now()))}
                    >
                      {state.hold.startedAt === null
                        ? "Resume hold"
                        : "Pause hold"}
                    </button>
                    <button onClick={() => act((s) => stopHold(s, Date.now()))}>
                      Stop hold
                    </button>
                  </>
                )}
                {state.hold.status !== "idle" && (
                  <div className="favor">
                    <button
                      className="favor-white"
                      aria-pressed={state.hold.favor === "white"}
                      onClick={() =>
                        act((s) => updateHold(s, Date.now(), "white"))
                      }
                    >
                      White
                    </button>
                    <button
                      className="favor-red"
                      aria-pressed={state.hold.favor === "red"}
                      onClick={() =>
                        act((s) => updateHold(s, Date.now(), "red"))
                      }
                    >
                      Red
                    </button>
                  </div>
                )}
              </div>
            )}
            {state.hold.status !== "idle" && (
              <small>
                {state.hold.favor
                  ? state.hold.favor.toUpperCase()
                  : "UNASSIGNED"}{" "}
                ·{" "}
                {state.hold.status === "stopped"
                  ? "STOPPED"
                  : state.hold.startedAt === null
                    ? "PAUSED"
                    : "HOLDING"}
              </small>
            )}
          </>
        )}
      </aside>
      <footer>
        <span>
          {isMirror
            ? "MIRROR DISPLAY · SIDES REVERSED"
            : "CLICK A SCORE TO ADD A POINT"}
        </span>
        {!isMirror && (
          <>
            <button onClick={undo} disabled={!history.current.length}>
              <Undo2 size={14} /> Undo <kbd>Ctrl Z</kbd>
            </button>
            <span>
              <kbd>SPACE</kbd> Start / pause
            </span>
          </>
        )}
      </footer>
      {menu && (
        <>
          <div className="dismiss" onClick={() => setMenu(false)} />
          <nav className="popover menu">
            <div className="popover-title">MATCH CONTROLS</div>
            <button onClick={openSettings}>
              <Settings2 /> Match & time settings <ChevronRight />
            </button>
            <button
              onClick={() => {
                act((s) => ({ ...s, swapped: !s.swapped }));
                setMenu(false);
              }}
            >
              <ArrowLeftRight /> Swap red & white
            </button>
            <button onClick={mirror}>
              <Monitor /> Open mirror screen
            </button>
            <button onClick={fullscreen}>
              <Maximize /> Fullscreen
            </button>
            <button
              onClick={() => {
                act((s) => golden(s, Date.now()));
                setMenu(false);
              }}
            >
              <Flag /> {state.phase === "golden" ? "Restart" : "Start"} golden
              score
            </button>
            <button
              onClick={() => {
                act((s) => ({
                  ...initial(),
                  settings: s.settings,
                  names: s.names,
                  swapped: s.swapped,
                }));
                setMenu(false);
              }}
            >
              <RotateCcw /> Reset match
            </button>
            <p>All match changes can be undone.</p>
          </nav>
        </>
      )}
      {context && (
        <>
          <div className="dismiss" onClick={() => setContext(null)} />
          <div
            className="popover context"
            style={{ left: context.x, top: context.y }}
          >
            <button onClick={toggle}>
              {running ? <Pause /> : <Play />}
              {running ? "Pause" : "Resume"} countdown
            </button>
            <button onClick={restart}>
              <RotateCcw />
              Restart {state.phase === "golden" ? "golden score" : "countdown"}
            </button>
            <button
              onClick={() => {
                act((s) => golden(s, Date.now()));
                setContext(null);
              }}
            >
              <Flag />
              {state.phase === "golden" ? "Restart" : "Start"} golden score
            </button>
            <button onClick={openSettings}>
              <Settings2 />
              Time settings
            </button>
          </div>
        </>
      )}
      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <form
            className="settings"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (
                draft.regular <= 0 ||
                draft.golden <= 0 ||
                draft.holdWaza <= 0 ||
                draft.holdIppon <= draft.holdWaza
              ) {
                setNotice(
                  "Times must be positive; ippon must be later than waza’ari.",
                );
                return;
              }
              act((s) => ({
                ...stopHold(s, Date.now()),
                hold: emptyHold(),
                settings: draft,
                names,
                elapsed: 0,
                startedAt: null,
              }));
              setSettingsOpen(false);
            }}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">MAKE IT YOUR MATCH</span>
                <h2>Match settings</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
              >
                <X />
              </button>
            </div>
            <label>
              Competition name
              <input
                value={draft.title}
                maxLength={70}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <div className="form-row">
              <label>
                White competitor
                <input
                  value={names.white}
                  maxLength={45}
                  onChange={(e) =>
                    setNames({ ...names, white: e.target.value })
                  }
                />
              </label>
              <label>
                Red competitor
                <input
                  value={names.red}
                  maxLength={45}
                  onChange={(e) => setNames({ ...names, red: e.target.value })}
                />
              </label>
            </div>
            <div className="form-row">
              <DurationInput
                label="Regular time"
                value={draft.regular}
                onChange={(regular) => setDraft({ ...draft, regular })}
              />
              <label>
                Tatami
                <input
                  value={draft.mat}
                  maxLength={8}
                  onChange={(e) => setDraft({ ...draft, mat: e.target.value })}
                />
              </label>
            </div>
            <div className="settings-section">
              <h3>Golden score</h3>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={draft.noGolden}
                  onChange={(e) =>
                    setDraft({ ...draft, noGolden: e.target.checked })
                  }
                />{" "}
                Don’t use automatic golden score
              </label>
              <label>
                Timer mode
                <select
                  value={draft.mode}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      mode: e.target.value as Settings["mode"],
                    })
                  }
                >
                  <option value="up">Infinite count up</option>
                  <option value="down">Golden countdown</option>
                </select>
              </label>
              {draft.mode === "down" && (
                <DurationInput
                  label="Golden time"
                  value={draft.golden}
                  onChange={(golden) => setDraft({ ...draft, golden })}
                />
              )}
            </div>
            <div className="settings-section">
              <h3>Osae Komi</h3>
              <div className="form-row">
                <DurationInput
                  label="Waza’ari threshold"
                  value={draft.holdWaza}
                  onChange={(holdWaza) => setDraft({ ...draft, holdWaza })}
                />
                <DurationInput
                  label="Ippon threshold"
                  value={draft.holdIppon}
                  onChange={(holdIppon) => setDraft({ ...draft, holdIppon })}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  unlockAudio();
                  buzzer();
                }}
              >
                Test buzzer
              </button>
            </div>
            <p className="help">
              Saving resets and pauses the match timer and closes the current
              hold. Points are kept. Ties enter golden score automatically;
              winner indicators never stop scoring or the clock.
            </p>
            <button className="primary save" type="submit">
              Save settings
            </button>
          </form>
        </div>
      )}
      {notice && (
        <div className="toast" role="alert">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
