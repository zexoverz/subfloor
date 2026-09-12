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
export function AgentDock({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      aria-label={copy.agents.dock}
      title={copy.agents.dock}
      className="agent-dock fixed right-5 bottom-5 z-40 cursor-pointer select-none max-[560px]:right-3 max-[560px]:bottom-3"
    >
      <img
        src="/agent-bot.webp"
        alt=""
        aria-hidden
        draggable={false}
        className="agent-dock-bot w-[76px] max-[560px]:w-[58px]"
      />
    </button>
  );
}
