/**
 * Mock mode: walk the whole flow with no contracts deployed, so design work is not blocked on a
 * broadcast that has not happened.
 *
 * The rule it obeys is the same one the data badge obeys — the page never claims to be something
 * it is not. Mock mode says "mock" on screen, every time, and it can only be turned on by an
 * explicit env var, so a production build cannot fall into it by accident.
 */
export const mocked = import.meta.env.VITE_CHAIN_SOURCE === 'mock';

/** Obviously fake on sight. A plausible-looking address is how a mock ends up in a screenshot. */
export const MOCK_ADDRESS = '0x0000000000000000000000000000000000000M0CK'.slice(0, 42) as `0x${string}`;
