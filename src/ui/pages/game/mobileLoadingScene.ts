export type MobileLoadingScene = 'startup' | 'campaign' | 'skirmish' | 'save';
export const mobileLoadingArtwork: Record<MobileLoadingScene, { image: string; title: string }> = {
  startup: { image: '/images/mobile-loading-background.png', title: '正在加载游戏…' },
  campaign: { image: '/images/mobile-loading-campaign.png', title: '正在加载战役…' },
  skirmish: { image: '/images/mobile-loading-skirmish.png', title: '正在部署遭遇战…' },
  save: { image: '/images/mobile-loading-save.png', title: '正在恢复存档…' },
};
/** Retain the last native destination while its windows disappear during loading. */
export function loadingSceneForPage(page: string, previous: MobileLoadingScene): MobileLoadingScene {
  const value = page.toLowerCase();
  if (/load.*game|load.*saved/.test(value)) return 'save';
  if (/campaign/.test(value)) return 'campaign';
  if (/skirmish/.test(value)) return 'skirmish';
  if (/mainmenu|singleplayer/.test(value)) return 'startup';
  return previous;
}
