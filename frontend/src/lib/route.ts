import { useCallback, useEffect, useState } from 'react';
import type { Screen } from '../types.ts';

/**
 * Routing on the History API, without a router.
 *
 * Three screens and no nested layouts do not need a routing library — they need the address bar to
 * mean something. Holding the screen in component state meant a reload always returned to the
 * landing page, a link to the board could not be sent to anyone, and the back button left the app
 * entirely.
 *
 * The server falls every unknown path back to index.html, so deep links resolve on a hard load
 * rather than 404ing. Checked against the deployment rather than assumed: `/app`, `/app/device` and
 * a path that matches no screen all return the shell with a 200.
 */
const PATHS: Record<Screen, string> = {
  landing: '/',
  live: '/app',
  ceremony: '/app/device',
  agents: '/agents',
};

export function screenFromPath(pathname: string): Screen {
  const match = (Object.entries(PATHS) as [Screen, string][]).find(([, path]) => path === pathname);
  // An unknown path is the landing page rather than a blank screen.
  return match?.[0] ?? 'landing';
}

export function useRoute(): [Screen, (next: Screen) => void] {
  const [screen, setScreen] = useState<Screen>(() =>
    typeof window === 'undefined' ? 'landing' : screenFromPath(window.location.pathname),
  );

  // The back button is a navigation the app has to honour, not an exit.
  useEffect(() => {
    const onPop = () => setScreen(screenFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: Screen) => {
    setScreen(next);
    if (window.location.pathname !== PATHS[next]) window.history.pushState({}, '', PATHS[next]);
  }, []);

  return [screen, navigate];
}
