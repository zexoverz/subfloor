import { useEffect, useState } from 'react';
import { copy } from '../copy.ts';

/**
 * The way to the agent sheet, floating bottom-right.
 *
 * A dock rather than a nav item, because it is not a place in the app — it is a thing you consult
 * and dismiss, like the panic control is a thing you reach for and never seek out. And it is the
 * agent itself rather than a label: the sheet is about who may trade your vault, and a small robot
 * hovering in the corner says that faster than the word "agents" in a menu ever would.
 *
 * Two states of motion, and the difference is the point. Idle it drifts — barely, on a long slow
 * loop, the way something weightless sits in water rather than on a shelf. Hovered it shakes, once
 * and quickly, which is the thing answering rather than the page reacting.
 */

/** Once it has been opened, it never speaks again. Remembered, so that survives a reload. */
const SPOKEN_TO = 'subfloor.agent-dock';

/**
 * How many times it offers before giving up.
 *
 * Three. A bubble that reappears every few seconds forever is not an invitation, it is a thing to
 * learn to ignore — and the second time somebody ignores it, it has already failed. Three is enough
 * to catch an eye that was elsewhere and few enough to be over before it grates.
 */
const OFFERS = 3;
const FIRST_AT = 5000;
const VISIBLE_FOR = 5000;
const BETWEEN = 5000;

export function AgentDock({ onOpen }: { onOpen: () => void }) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    let done = true;
    try {
      done = globalThis.localStorage?.getItem(SPOKEN_TO) === '1';
    } catch {
      done = false;
    }
    if (done) return;

    /*
     * One chain of timers rather than an interval, because the two halves are different lengths and
     * an interval would have to encode both. Every handle is collected so a navigation away does
     * not leave a bubble opening over a screen that has gone.
     */
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < OFFERS; i++) {
      const at = FIRST_AT + i * (VISIBLE_FOR + BETWEEN);
      timers.push(setTimeout(() => setSpeaking(true), at));
      timers.push(setTimeout(() => setSpeaking(false), at + VISIBLE_FOR));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  const open = () => {
    setSpeaking(false);
    try {
      globalThis.localStorage?.setItem(SPOKEN_TO, '1');
    } catch {
      // Private browsing. It offers again next visit, which is a smaller harm than crashing.
    }
    onOpen();
  };

  return (
    <div className="fixed right-5 bottom-5 z-40 flex items-end max-[560px]:right-3 max-[560px]:bottom-3">
      {/*
        * The offer, in the drawing's own speech bubble rather than a tooltip.
        *
        * It is the agent talking, and a grey rounded rectangle would be the interface talking about
        * the agent. Left of the figure and bottom-aligned so the tail points back at whoever is
        * speaking. Hidden rather than unmounted, so it fades instead of appearing and vanishing.
        */}
      <span
        aria-hidden={!speaking}
        className={`agent-bubble relative grid place-items-center px-[9%] pt-4 pb-5 text-center text-[11.5px] leading-tight text-ink transition-opacity duration-500 max-[720px]:hidden ${
          speaking ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {/* Above the mirrored art, which is a positioned pseudo-element and would otherwise
            paint over the words. */}
        <span className="relative">{copy.agents.offer}</span>
      </span>

      <button
        onClick={open}
        aria-label={copy.agents.dock}
        title={copy.agents.dock}
        className="agent-dock cursor-pointer select-none"
      >
        <img
          src="/agent-bot.webp"
          alt=""
          aria-hidden
          draggable={false}
          className="agent-dock-bot w-[76px] max-[560px]:w-[58px]"
        />
      </button>
    </div>
  );
}
