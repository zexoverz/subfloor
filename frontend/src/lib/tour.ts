import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { copy } from '../copy.ts';

/**
 * The first minute, for someone who arrived from a link with nobody beside them.
 *
 * The board answers a question a visitor has not been asked yet. Every number on it is honest and
 * none of it says what the thing *is* — a stranger reads "worst fill vs floor +3 bps" and has no
 * way to know that is the whole argument rather than a statistic. §10's test is that a screen must
 * not make them think about anything except the worst price they will accept; a first-run tour is
 * how that question gets put to them at all.
 *
 * Five steps and no more. Each points at something already on screen and says what it is; none of
 * them asks for anything. The last one is the only one that offers an action, and it is still a
 * sentence about price rather than an instruction.
 *
 * Deliberately not a modal. A dialog explaining a dashboard is read once and remembered by nobody,
 * because the words are not next to the thing they describe.
 */
const SEEN = 'subfloor.tour';

/** Steps in the order a stranger meets the argument, not the order the page is laid out. */
const STEPS = [
  { el: 'strip', ...copy.tour.strip },
  { el: 'chart', ...copy.tour.chart },
  { el: 'refused', ...copy.tour.refused },
  { el: 'proof', ...copy.tour.proof },
  { el: 'start', ...copy.tour.start },
] as const;

function build() {
  return driver({
    showProgress: true,
    progressText: copy.tour.progress,
    nextBtnText: copy.tour.next,
    prevBtnText: copy.tour.back,
    doneBtnText: copy.tour.done,
    /*
     * Dark, and darker than driver's default. The board sits on artwork bright enough that the
     * standard half-black scrim left the un-highlighted panels perfectly readable, so nothing was
     * actually being pointed at.
     */
    overlayColor: '#000a1c',
    overlayOpacity: 0.78,
    stagePadding: 6,
    stageRadius: 12,
    popoverClass: 'subfloor-tour',
    smoothScroll: true,
    steps: STEPS.filter((s) => document.querySelector(`[data-tour="${s.el}"]`)).map((s) => ({
      element: `[data-tour="${s.el}"]`,
      popover: { title: s.title, description: s.body },
    })),
    // Taken once, however it ends. Someone who closes it at step two has decided, and asking again
    // on the next visit is the behaviour of a thing that does not believe them.
    onDestroyed: () => {
      try {
        globalThis.localStorage?.setItem(SEEN, '1');
      } catch {
        // Private browsing. The tour runs again next time, which is a smaller harm than crashing.
      }
    },
  });
}

/** Run it, whether or not it has been seen — the control in the header. */
export function runTour(): void {
  build().drive();
}

/**
 * Run it once, for a visitor who has not seen it.
 *
 * Waits a beat: the steps point at panels, and a panel that has not measured itself yet gets a
 * highlight drawn around nothing. Returns a cleanup so a navigation away cancels the pending start
 * rather than opening a tour over a screen that is no longer there.
 */
export function runTourOnce(): () => void {
  let seen = true;
  try {
    seen = globalThis.localStorage?.getItem(SEEN) === '1';
  } catch {
    seen = false;
  }
  if (seen) return () => {};
  const t = setTimeout(() => runTour(), 900);
  return () => clearTimeout(t);
}
