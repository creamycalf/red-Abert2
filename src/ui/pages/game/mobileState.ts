import { createStore } from '../../shared/state/store';
import type { VmShell } from '../../../adapter/vmShell';
import type { MobileLoadingScene } from './mobileLoadingScene';

export const mobileEnabled =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mobile') === '1';
export const mobileVm = createStore<VmShell | null>(null);
export const mobileShell = createStore('');
export const mobileLoadingScene = createStore<MobileLoadingScene>('startup');
export const mobileSidebarExpanded = createStore(false);
export const mobileSidebarScroll = createStore(0);
export const mobileSidebarZoom = createStore(1.5);
export const mobileMenuWidth = createStore<number | null>(null);
export const mobileZoomSupported = createStore(false);
export const mobileZoom = createStore(1);
export const mobilePanMode = createStore(false);
export const mobileModifiers = createStore<'none' | 'force' | 'attack-move' | 'add'>('none');
export const mobileBattle = createStore<{
  ready: boolean;
  selected: number;
  placing: boolean;
  cash: number;
  speed?: number;
  techLevel?: number;
  allTech?: boolean;
  autoElite?: boolean;
  trainerSupported?: boolean;
  inputSupported?: boolean;
  groupPending?: boolean;
  groups?: Array<{ id: number; count: number; selected: boolean }>;
}>({
  ready: false,
  selected: 0,
  placing: false,
  cash: 0,
});
