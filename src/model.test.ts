import { describe, expect, it } from "vitest";
import {
  initial,
  point,
  winner,
  expire,
  golden,
  snapshot,
  elapsedAt,
  formatTime,
} from "./model";
describe("scoring", () => {
  it("converts two waza’aris to one ippon", () => {
    const s = point(point(initial(), "white", "w", 1), "white", "w", 1);
    expect(s.scores.white).toEqual({ i: 1, w: 0, y: 0, s: 0 });
    expect(winner(s, 0).color).toBe("white");
  });
  it("allows unlimited yuko and prevents negatives", () => {
    let s = initial();
    for (let i = 0; i < 100; i++) s = point(s, "red", "y", 1);
    expect(s.scores.red.y).toBe(100);
    expect(point(s, "white", "y", -1).scores.white.y).toBe(0);
  });
  it("three shidos lose; correcting the penalty removes the result", () => {
    let s = initial();
    for (let i = 0; i < 3; i++) s = point(s, "white", "s", 1);
    expect(winner(s, 0).color).toBe("red");
    expect(winner(point(s, "white", "s", -1), 0).color).toBeUndefined();
  });
  it("uses yuko at expiry only when neither has waza’ari", () => {
    let s = point(initial(), "red", "y", 5);
    expect(winner(s, 0).color).toBeUndefined();
    s.elapsed = 240000;
    expect(winner(s, 0).color).toBe("red");
    s = point(s, "white", "w", 1);
    expect(winner(s, 0).color).toBe("white");
    s = point(s, "red", "w", 1);
    expect(winner(s, 0).color).toBeUndefined();
  });
  it("does not stop the clock when an ippon is awarded", () => {
    const s = point({ ...initial(), startedAt: 100 }, "white", "i", 1);
    expect(s.startedAt).toBe(100);
    expect(winner(s, 200).color).toBe("white");
  });
  it("flags conflicting winners", () => {
    expect(
      winner(point(point(initial(), "red", "i", 1), "white", "i", 1), 0).reason,
    ).toContain("Conflicting");
  });
});
describe("clock and snapshots", () => {
  it("automatically enters golden score on a tied expiry", () => {
    const s = expire({ ...initial(), startedAt: 100 }, 240100);
    expect(s.phase).toBe("golden");
    expect(s.startedAt).toBe(240100);
    expect(s.elapsed).toBe(0);
  });
  it("respects disabling golden score", () => {
    const s = initial();
    s.settings.noGolden = true;
    s.startedAt = 100;
    const end = expire(s, 240100);
    expect(end.phase).toBe("regular");
    expect(end.startedAt).toBeNull();
  });
  it("does not enter golden score with a winner", () => {
    const s = point({ ...initial(), startedAt: 100 }, "white", "y", 1);
    expect(expire(s, 240100).phase).toBe("regular");
  });
  it("counts up indefinitely, or expires a configured golden countdown", () => {
    let s = golden(initial(), 100);
    expect(expire(s, 900000).startedAt).toBe(100);
    s.settings.mode = "down";
    s.settings.golden = 60;
    expect(expire(s, 60100).startedAt).toBeNull();
  });
  it("snapshots elapsed time for undo without counting the intervening delay", () => {
    const s = snapshot({ ...initial(), startedAt: 100 }, 5100);
    const restored = { ...s, startedAt: 10100 };
    expect(elapsedAt(restored, 11100)).toBe(6000);
  });
  it("formats countdowns up and countdowns down accurately", () => {
    expect(formatTime(1001)).toBe("00:02");
    expect(formatTime(1001, true)).toBe("00:01");
    expect(formatTime(-1)).toBe("00:00");
  });
});
import {
  emptyHold,
  startHold,
  updateHold,
  stopHold,
  pauseHold,
  holdElapsed,
} from "./model";
describe("osaekomi", () => {
  it("awards waza at 10, upgrades to ippon at 20 without double awarding", () => {
    let s = startHold(initial(), 0);
    s = updateHold(s, 10000, "white");
    expect(s.scores.white.w).toBe(1);
    expect(s.hold.buzzed).toBe(false);
    s = updateHold(s, 20000);
    expect(s.scores.white).toEqual({ i: 1, w: 0, y: 0, s: 0 });
    expect(s.hold.buzzed).toBe(true);
    expect(updateHold(s, 30000)).toBe(s);
  });
  it("buzzes at 10 when the favored competitor already has a waza", () => {
    let s = startHold(point(initial(), "white", "w", 1), 0);
    s = updateHold(s, 10000, "white");
    expect(s.hold.buzzed).toBe(true);
    expect(s.scores.white.i).toBe(1);
    s = updateHold(s, 20000);
    expect(s.scores.white).toEqual({ i: 1, w: 0, y: 0, s: 0 });
  });
  it("transfers only the hold award, restoring a preexisting waza", () => {
    let s = startHold(point(initial(), "white", "w", 1), 0);
    s = updateHold(s, 10000, "white");
    s = updateHold(s, 12000, "red");
    expect(s.scores.white.w).toBe(1);
    expect(s.scores.white.i).toBe(0);
    expect(s.scores.red.w).toBe(1);
    s = updateHold(s, 20000);
    s = updateHold(s, 21000, "white");
    expect(s.scores.white.i).toBe(1);
    expect(s.scores.red.i).toBe(0);
  });
  it("can start unassigned, stop, then assign and reassign", () => {
    let s = stopHold(startHold(initial(), 0), 15000);
    expect(s.hold.status).toBe("stopped");
    s = updateHold(s, 20000, "red");
    expect(s.scores.red.w).toBe(1);
    s = updateHold(s, 30000, "white");
    expect(s.scores.white.w).toBe(1);
    expect(s.scores.red.w).toBe(0);
  });
  it("pauses independently and resumes without counting paused time", () => {
    let s = pauseHold(startHold(initial(), 0), 5000);
    expect(holdElapsed(s, 9000)).toBe(5000);
    s = pauseHold(s, 10000);
    expect(holdElapsed(s, 12000)).toBe(7000);
  });
  it("keeps a completed hold score when starting another hold", () => {
    let s = updateHold(startHold(initial(), 0), 10000, "red");
    s = stopHold(s, 11000);
    s = startHold(s, 12000);
    expect(s.scores.red.w).toBe(1);
    expect(s.hold.awarded).toBe(0);
  });
  it("uses custom thresholds and includes hold time in undo snapshots", () => {
    let s = initial();
    s.settings.holdWaza = 3;
    s.settings.holdIppon = 6;
    s = startHold(s, 0);
    s = updateHold(s, 3000, "white");
    expect(s.scores.white.w).toBe(1);
    const copy = snapshot(s, 4000);
    expect(copy.hold.elapsed).toBe(4000);
    expect(copy.hold.startedAt).toBe(4000);
    s = updateHold(s, 6000);
    expect(s.scores.white.i).toBe(1);
  });
});

import { shouldBuzz } from './model';
describe('buzzer after correcting the favored competitor', () => {
  it('re-arms after an incorrect early ippon and buzzes at 20 seconds', () => {
    let s = startHold(point(initial(), 'white', 'w', 1), 0);
    s = updateHold(s, 10000, 'white');
    expect(s.hold.buzzed).toBe(true);
    const corrected = updateHold(s, 12000, 'red');
    expect(corrected.scores.white).toEqual({i:0,w:1,y:0,s:0});
    expect(corrected.scores.red).toEqual({i:0,w:1,y:0,s:0});
    expect(corrected.hold.buzzed).toBe(false);
    expect(shouldBuzz(s.hold, corrected.hold)).toBe(false);
    expect(updateHold(corrected, 19999).hold.buzzed).toBe(false);
    const ended = updateHold(corrected, 20000);
    expect(shouldBuzz(corrected.hold, ended.hold)).toBe(true);
    expect(ended.scores.red.i).toBe(1);
    expect(shouldBuzz(ended.hold, updateHold(ended, 21000).hold)).toBe(false);
  });
  it('buzzes immediately on reassignment if the new player also had a waza', () => {
    let s = point(point(initial(), 'white', 'w', 1), 'red', 'w', 1);
    s = updateHold(startHold(s,0),10000,'white');
    const corrected = updateHold(s,12000,'red');
    expect(corrected.scores.white.w).toBe(1);
    expect(corrected.scores.red.i).toBe(1);
    expect(shouldBuzz(s.hold,corrected.hold)).toBe(true);
    expect(shouldBuzz(corrected.hold,updateHold(corrected,20000).hold)).toBe(false);
  });
  it('uses custom thresholds after reassignment', () => {
    let s = point(initial(),'white','w',1);
    s.settings.holdWaza=5; s.settings.holdIppon=15;
    s=updateHold(startHold(s,0),5000,'white');
    s=updateHold(s,6000,'red');
    expect(s.hold.buzzed).toBe(false);
    expect(shouldBuzz(s.hold,updateHold(s,15000).hold)).toBe(true);
  });
});

import { toggleClock, resetPausedHold } from './model';
describe('reset osaekomi after prolonged pauses', () => {
  it('resets only after more than five seconds and preserves awarded scores', () => {
    let s=updateHold(startHold(initial(),0),10000,'white');
    s=pauseHold(s,11000);
    expect(resetPausedHold(s,16000)).toBe(s);
    const reset=resetPausedHold(s,16001);
    expect(reset.hold.status).toBe('idle');
    expect(reset.hold.favor).toBeNull();
    expect(reset.hold.elapsed).toBe(0);
    expect(reset.scores).toEqual(s.scores);
  });
  it('resets even a running hold after the match clock is paused', () => {
    let s=toggleClock(initial(),0);
    s=startHold(s,1000); s=toggleClock(s,2000);
    expect(resetPausedHold(s,7000)).toBe(s);
    expect(resetPausedHold(s,7001).hold.status).toBe('idle');
  });
  it('cancels the hold pause reset when resumed', () => {
    let s=pauseHold(startHold(initial(),0),1000);
    s=pauseHold(s,5000);
    expect(resetPausedHold(s,10000)).toBe(s);
  });
  it('cancels the regular pause reset when resumed', () => {
    let s=startHold(toggleClock(initial(),0),0);
    s=toggleClock(s,1000); s=toggleClock(s,5000);
    expect(resetPausedHold(s,10000)).toBe(s);
  });
  it('does not reset a stopped hold or a hold with an unstarted match clock', () => {
    const s=stopHold(startHold(initial(),0),3000);
    expect(resetPausedHold(s,20000)).toBe(s);
    const active=startHold(initial(),0);
    expect(resetPausedHold(active,20000)).toBe(active);
  });
});
