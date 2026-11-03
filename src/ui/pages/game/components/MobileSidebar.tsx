import { useEffect } from 'react';
import { useStore } from '../../../shared/state/useStore';
import {
  mobileBattle,
  mobileSidebarExpanded,
  mobileSidebarScroll,
  mobileZoomSupported,
  mobileSidebarZoom,
} from '../mobileState';

export function MobileSidebar() {
  const battle = useStore(mobileBattle),
    expanded = useStore(mobileSidebarExpanded),
    supported = useStore(mobileZoomSupported);
  const zoom = useStore(mobileSidebarZoom);
  useEffect(() => {
    if (!battle.ready || battle.placing) mobileSidebarExpanded.set(false);
  }, [battle.ready, battle.placing]);
  useEffect(
    () => () => {
      mobileSidebarExpanded.set(false);
      mobileSidebarScroll.set(0);
    },
    [],
  );
  if (!battle.ready || battle.placing || !supported) return null;
  return expanded ? (
    <nav className="mobile-sidebar-tools" aria-label="放大建造栏" style={{ width: `min(${168 * zoom}px, 38vw)` }}>
      <button onClick={() => mobileSidebarExpanded.set(false)}>收起</button>
      <button onClick={() => mobileSidebarScroll.set(mobileSidebarScroll.getSnapshot() > 0 ? 0 : 194)}>雷达</button>
      <button
        aria-label="缩小建造栏"
        disabled={zoom <= 1}
        onClick={() => mobileSidebarZoom.set(Math.max(1, zoom - 0.25))}
      >
        −
      </button>
      <button aria-label="恢复建造栏缩放" onClick={() => mobileSidebarZoom.set(1.5)}>
        {Math.round(zoom * 100)}%
      </button>
      <button
        aria-label="放大建造栏"
        disabled={zoom >= 2}
        onClick={() => mobileSidebarZoom.set(Math.min(2, zoom + 0.25))}
      >
        ＋
      </button>
    </nav>
  ) : (
    <button
      className="mobile-sidebar-expand"
      onClick={() => {
        mobileSidebarScroll.set(194);
        mobileSidebarExpanded.set(true);
      }}
    >
      放大建造
    </button>
  );
}
