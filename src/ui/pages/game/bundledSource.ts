import { BundledGameFiles } from '../../../platform/browser/files/bundledGame';
import { SUPPORTED_GAMES } from '../../../games/catalog';
import type { GameSource } from '../../../games/source';

/** Private offline distribution entry. Standard web builds still use the resource picker. */
export async function loadBundledGame(): Promise<GameSource> {
  const response = await fetch('/installation/manifest.json');
  if (!response.ok) throw new Error('内置游戏资源缺失，请重新安装完整 APK');
  const files = new BundledGameFiles(await response.json());
  await files.list('');
  const executableBytes = await files.read('game.exe');
  if (!executableBytes) throw new Error('内置 game.exe 缺失');
  return { game: SUPPORTED_GAMES.find((game) => game.id === 'ra2')!, files, executableBytes };
}
