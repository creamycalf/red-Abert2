import { mapRegionPoint, type PresentationRegion } from '../../../graphics/regionPresentation';
import {
  mobileBattle,
  mobileEnabled,
  mobileZoom,
  mobileViewOffset,
  mobileZoomSupported,
  mobileSidebarExpanded,
  mobileSidebarScroll,
  mobileSidebarZoom,
} from './mobileState';
/** Enlargement preserves square pixels; scrolling exposes every native row, including the bottom arrows. */
export function sidebarViewport(
  nativeHeight: number,
  displayWidth: number,
  displayHeight: number,
  scroll: number,
  zoom = mobileSidebarZoom.getSnapshot(),
) {
  const width = Math.min(168 * zoom, displayWidth * 0.38);
  const scale = width / 168;
  const visible = Math.min(nativeHeight, Math.max(1, displayHeight - 44) / scale);
  return {
    width,
    scale,
    visible,
    offset: Math.max(0, Math.min(nativeHeight - visible, scroll)),
    max: nativeHeight - visible,
  };
}
/** Replace the native footer with the touch dock; keep the full construction sidebar accessible. */
export function mobileRegions(width: number, height: number, aspect: number): PresentationRegion[] {
  if (!mobileEnabled || !mobileZoomSupported.getSnapshot() || !mobileBattle.getSnapshot().ready) return [];
  const zoom = mobileZoom.getSnapshot(),
    baseWidth = 600 * aspect;
  const mapWidth = width - 168,
    mapHeight = height - 32;
  const expanded = mobileSidebarExpanded.getSnapshot();
  const displayHeight = document.getElementById('screen')?.getBoundingClientRect().height || window.innerHeight;
  const sidebar = sidebarViewport(height, displayHeight * aspect, displayHeight, mobileSidebarScroll.getSnapshot());
  const sidebarWidth = expanded ? sidebar.width / (displayHeight * aspect) : 168 / baseWidth;
  const visibleWidth = Math.min(mapWidth, (baseWidth * (1 - sidebarWidth)) / zoom),
    visibleHeight = Math.min(mapHeight, 600 / zoom);
  const offset = mobileViewOffset.getSnapshot();
  const maxX = (mapWidth - visibleWidth) / 2,
    maxY = (mapHeight - visibleHeight) / 2;
  return [
    {
      source: {
        x: (maxX + Math.max(-maxX, Math.min(maxX, offset.x))) / width,
        y: (maxY + Math.max(-maxY, Math.min(maxY, offset.y))) / height,
        width: visibleWidth / width,
        height: visibleHeight / height,
      },
      target: { x: 0, y: 0, width: 1 - sidebarWidth, height: 1 },
    },
    {
      source: {
        x: mapWidth / width,
        y: expanded ? sidebar.offset / height : 0,
        width: 168 / width,
        height: expanded ? sidebar.visible / height : 1,
      },
      target: {
        x: 1 - sidebarWidth,
        y: expanded ? 44 / displayHeight : 0,
        width: sidebarWidth,
        height: expanded ? 1 - 44 / displayHeight : 1,
      },
    },
  ];
}
export function mobilePoint(x: number, y: number, width: number, height: number, aspect: number, reverse = false) {
  const p = mapRegionPoint(x / width, y / height, mobileRegions(width, height, aspect), reverse);
  return { x: p.x * width, y: p.y * height };
}

/** Pan the displayed crop first, passing only overflow to the original camera. Small campaign maps
 * can clamp the native camera while substantial parts of its rendered frame remain outside this crop. */
export function panMobileViewport(dx: number, dy: number, width: number, height: number, aspect: number) {
  const region = mobileRegions(width, height, aspect)[0];
  if (!region) return { dx, dy };
  const maxX = (width - 168 - region.source.width * width) / 2;
  const maxY = (height - 32 - region.source.height * height) / 2;
  const currentX = region.source.x * width - maxX,
    currentY = region.source.y * height - maxY;
  const x = Math.max(-maxX, Math.min(maxX, currentX + dx));
  const y = Math.max(-maxY, Math.min(maxY, currentY + dy));
  mobileViewOffset.set({ x, y });
  return { dx: dx - (x - currentX), dy: dy - (y - currentY) };
}
