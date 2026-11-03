import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../../shared/state/useStore';
import { mobileBattle, mobileShell, mobileVm, mobileLoadingScene } from '../mobileState';
import { loadingSceneForPage } from '../mobileLoadingScene';
import './MobileStartMenu.css';

interface NativeControl {
  text: string;
  rect: { x: number; y: number; width: number; height: number };
}

/** Mobile presentation of existing native menu choices; navigation still executes in the original game. */
export function MobileStartMenu({ onOpenControls }: { onOpenControls(): void }) {
  const vm = useStore(mobileVm);
  const shell = useStore(mobileShell);
  const battle = useStore(mobileBattle);
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const busy = useRef(false);
  const single = shell.toLowerCase().includes('singleplayer');
  const visible = !battle.ready && (single || shell.toLowerCase().includes('mainmenu'));
  useEffect(() => {
    generation.current++;
    busy.current = false;
    setPending(false);
    setDismissed(false);
    setError('');
    return () => {
      generation.current++;
    };
  }, [vm, shell]);

  const choose = async (text: string) => {
    if (!vm || busy.current) return;
    const current = generation.current;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const layout = (await vm.gameControl('ui.layout')) as NativeControl[];
      if (current !== generation.current) return;
      const control = layout.find(
        (control) => control.text === text && control.rect.width > 0 && control.rect.height > 0,
      );
      if (!control) throw new Error('菜单仍在载入，请稍后再点');
      mobileLoadingScene.set(loadingSceneForPage(text, mobileLoadingScene.getSnapshot()));
      const x = Math.round(control.rect.x + control.rect.width / 2);
      const y = Math.round(control.rect.y + control.rect.height / 2);
      const position = ((y & 0xffff) << 16) | (x & 0xffff);
      vm.setCursorPosition(x, y);
      vm.postMessage(0x200, 0, position);
      vm.setKeyState(1, true);
      vm.postMessage(0x201, 1, position);
      vm.setKeyState(1, false);
      vm.postMessage(0x202, 0, position);
    } catch (error) {
      if (current === generation.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (current === generation.current) {
        busy.current = false;
        setPending(false);
      }
    }
  };

  if (!vm || !visible || dismissed) return null;
  const choices = single
    ? [
        ['GUI:NewCampaign', '开始战役', '盟军 / 苏军 · 原版剧情'],
        ['GUI:Skirmish', '遭遇战', '选择地图，自由对战'],
        ['GUI:LoadSavedGame', '读取存档', '继续之前的战斗'],
      ]
    : [['GUI:SinglePlayer', '单人游戏', '战役 · 遭遇战 · 读取存档']];

  return (
    <section
      className="mobile-start"
      aria-label={single ? '单人游戏开始菜单' : '全屏开始菜单'}
      style={single ? { backgroundImage: 'url("/images/mobile-loading-campaign.png")' } : undefined}
    >
      <div className="mobile-start-shade" />
      <header className="mobile-start-brand">
        <span className="mobile-start-kicker">COMMAND & CONQUER</span>
        <h1>
          红色警戒 <b>2</b>
        </h1>
        <span className="mobile-start-english">RED ALERT 2</span>
      </header>
      <nav className="mobile-start-choices" aria-label="开始游戏">
        <span className="mobile-start-section">{single ? '选择你的战场' : '准备就绪，指挥官'}</span>
        {choices.map(([action, label, detail], i) => (
          <button
            key={action}
            data-native-action={action}
            className={i === 0 ? 'primary' : ''}
            disabled={pending}
            onClick={() => void choose(action!)}
          >
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <span className="mobile-start-arrow" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
        {!single && (
          <button onClick={onOpenControls}>
            <span>
              <strong>操作与存档</strong>
              <small>触屏说明 · 存档备份</small>
            </span>
            <span className="mobile-start-arrow" aria-hidden="true">
              ›
            </span>
          </button>
        )}
        {single && (
          <button
            className="mobile-start-back"
            data-native-action="GUI:MainMenu"
            disabled={pending}
            onClick={() => void choose('GUI:MainMenu')}
          >
            ‹ 返回主菜单
          </button>
        )}
        {error && (
          <p className="mobile-start-error" role="alert">
            {error}
          </p>
        )}
      </nav>
      <footer className="mobile-start-footer">
        <span>原版战役 · 横屏触控</span>
        <button onClick={() => setDismissed(true)}>原版界面</button>
      </footer>
    </section>
  );
}
