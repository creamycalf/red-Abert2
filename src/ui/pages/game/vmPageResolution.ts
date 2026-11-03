/**
 * Local game-resolution preference persistence, extracted from page.ts.
 * Reuse storage keys/parsing from games/resolution, shared by page and toolbar actions.
 */
import { gameResolutionValue, parseGameResolution, type GameResolution } from '../../../games/resolution';
import type { SupportedGameId } from '../../../games/catalog';

const STORED_RESOLUTION_PREFIX = 'vm-resolution-';

export function loadStoredResolution(gameId: SupportedGameId): GameResolution | null {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mobile') === '1') {
    const aspect = Math.max(innerWidth, innerHeight) / Math.max(1, Math.min(innerWidth, innerHeight));
    return { width: Math.min(1920, Math.max(800, Math.round((800 * aspect) / 8) * 8)), height: 800 };
  }
  try {
    return parseGameResolution(window.localStorage.getItem(`${STORED_RESOLUTION_PREFIX}${gameId}`));
  } catch {
    return null;
  }
}

export function storeResolution(gameId: SupportedGameId, resolution: GameResolution | null): void {
  try {
    const key = `${STORED_RESOLUTION_PREFIX}${gameId}`;
    if (resolution) window.localStorage.setItem(key, gameResolutionValue(resolution));
    else window.localStorage.removeItem(key);
  } catch {
    // Persistence may be unavailable in private mode; safely fall back to the original INI after this restart.
  }
}
