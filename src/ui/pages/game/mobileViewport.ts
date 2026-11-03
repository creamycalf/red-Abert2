import { mapRegionPoint, type PresentationRegion } from '../../../graphics/regionPresentation';
import {
  mobileBattle,
  mobileEnabled,
  mobileZoom,
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
/** Keep native sidebar and footer fixed; only the battlefield uses a movable camera and zoom. */
export function mobileRegions(width: number, height: number, aspect: number): PresentationRegion[] {
  if (!mobileEnabled || !mobileZoomSupported.getSnapshot() || !mobileBattle.getSnapshot().ready) return [];
  const zoom = mobileZoom.getSnapshot(),
    baseWidth = 600 * aspect;
  const mapWidth = width - 168,
    mapHeight = height - 32;
  const expanded = mobileSidebarExpanded.getSnapshot();
  const displayHeight = window.innerHeight;
  const sidebar = sidebarViewport(height, displayHeight * aspect, displayHeight, mobileSidebarScroll.getSnapshot());
  const sidebarWidth = expanded ? sidebar.width / (displayHeight * aspect) : 168 / baseWidth;
  const visibleWidth = Math.min(mapWidth, (baseWidth * (1 - sidebarWidth)) / zoom),
    visibleHeight = Math.min(mapHeight, 568 / zoom);
  return [
    {
      source: {
        x: (mapWidth - visibleWidth) / 2 / width,
        y: (mapHeight - visibleHeight) / 2 / height,
        width: visibleWidth / width,
        height: visibleHeight / height,
      },
      target: { x: 0, y: 0, width: 1 - sidebarWidth, height: 568 / 600 },
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
    {
      source: { x: 0, y: mapHeight / height, width: mapWidth / width, height: 32 / height },
      target: { x: 0, y: 568 / 600, width: 1 - sidebarWidth, height: 32 / 600 },
    },
  ];
}
export function mobilePoint(x: number, y: number, width: number, height: number, aspect: number, reverse = false) {
  const p = mapRegionPoint(x / width, y / height, mobileRegions(width, height, aspect), reverse);
  return { x: p.x * width, y: p.y * height };
}
