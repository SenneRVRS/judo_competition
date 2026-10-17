# Hajime · Judo scoreboard

A React + TypeScript + Vite scoreboard with a white/red split, editable scores, penalties, configurable match clocks, and a synchronized reversed display.

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` creates the production website in `dist`; `npm run preview` previews it. `npm test` runs the scoring and clock tests. Serve the built files through a web server rather than opening index.html directly.

## Controls

- Click a score or its + button to increment; use − to correct it.
- Two waza’aris become one ippon and zero waza’aris. Use Undo to reverse that conversion, or the ippon − button to remove the resulting ippon.
- Space or the clock toggles start/pause. Right-click the clock for timer controls and settings.
- Ctrl+Z (Cmd+Z on macOS) undoes match changes, including scores, penalties, clock controls, settings, side swaps, resets, and automatic expiry. Undo restores the clock value at the action; running clocks resume from that value. Text fields retain their normal text undo. History lasts until the controller is refreshed.
- The compact upper-right menu opens settings, swaps sides, starts golden score, resets the match, and opens the mirror screen.
- Move the mirror window to the second monitor and press its fullscreen button. It reverses both competitors and colors, follows the main controller, and has no scoring controls. Keep the controller open. Browser pop-ups must be allowed.

## Rules and assumptions

This implements the requested scoring rules, rather than claiming compliance with a particular federation's ruleset.

- Regular time defaults to 4 minutes. Golden score defaults to infinite count up; a configurable countdown defaults to 2 minutes.
- An ippon or the opponent's third shido indicates a winner immediately. Both competitors meeting victory conditions produces a correction notice.
- At regular expiry, waza’ari advantage wins. Yuko only decides a winner when neither competitor has a waza’ari. Yuko is unlimited; shidos are limited to three.
- Any unresolved tie enters golden score unless disabled, including equal nonzero scores. Fewer shidos alone does not break a tie.
- In golden score the same score comparison is evaluated immediately. Existing points and penalties carry over. If a timed golden score expires tied, it stays at zero; manually restart golden score as needed.
- Winner indications never stop a running clock or disable corrections. A finite clock still stops at zero.
- Restart resets only the current phase's timer and pauses it. Start/restart golden score switches to that phase and starts its clock immediately. Reset match clears scores and returns to regular time while keeping names/settings/sides.
- Saving settings resets and pauses the current phase timer, retaining scores. Every match modification can be undone. Opening menus/windows and fullscreen are display actions, not match history.

## Persistence and mirror

The controller saves state in localStorage and uses wall-clock timestamps so background-tab throttling does not slow the clock. BroadcastChannel sends changes to the mirror, with storage events as a synchronization fallback. Both windows must share the same browser and origin. Mirrors display elapsed time locally between updates. Refresh restores the saved match; a running timer includes time while the page was closed. This is a single-controller app: avoid opening multiple editable tabs for the same match. Use `?session=mat-2` for a separate scoreboard on another tatami.

Fonts use Google Fonts with local fallbacks. No backend or account is required.

## Osae Komi

Start hold begins an independent count-up without choosing a competitor. Select White or Red at any time, including after Stop hold. The current hold's award follows that selection, restoring any preexisting waza’ari when a converted ippon moves away. Pause hold freezes the same hold; Stop hold ends it. New hold keeps completed scores and starts a fresh, unassigned hold. Undo can restore the previous hold.

Defaults: waza’ari at 10 seconds and ippon at 20. At the ippon threshold the hold award is upgraded, not stacked. If the favored competitor already had a waza’ari, the 10-second award yields ippon and buzzes early. Changing the favored competitor re-arms the buzzer for that competitor: it sounds at their ippon threshold, or immediately if already reached. It does not repeat while the assignment stays unchanged. Reaching 20 seconds unassigned also buzzes, with the score assigned later. The timer keeps counting until paused/stopped. The main match clock operates independently. Time fields accept minutes plus seconds, including both hold thresholds. Saving settings closes the hold and retains awarded scores.

The buzzer plays only on the controller. Use Test buzzer in settings to check browser audio. Winner messages are controller-only; the mirror shows scores and the hold timer. Native fullscreen depends on browser support: the button falls back to a viewport presentation layout when blocked by an embedded host. For true monitor fullscreen, open the app and its mirror in a regular browser and use the fullscreen button or F11.

## Pause timeout

Pausing either the match clock or the active osaekomi for more than five seconds clears the current hold timer and assignment, preserving all awarded scores. Resuming the paused timer before the deadline cancels its timeout. An unstarted match clock does not count as paused. Stop hold remains distinct from Pause hold and does not itself start a timeout. Automatic hold resets can be undone; undo gives paused timers a fresh five-second grace period.
