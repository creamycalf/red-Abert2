import { useEffect, useState } from 'react';
import type { VmShell } from '../../../../adapter/vmShell';
type Control = {
  id: number;
  text: string;
  displayText?: string;
  className: string;
  items: string[];
  selection: number;
  itemHeight: number;
  trackbar?: { min: number; max: number; pos: number };
  rect: { x: number; y: number; width: number; height: number };
};
const labels: Record<string, string> = {
  ResumeMission: '继续作战',
  GameControls: '游戏设置',
  LoadGame: '读取存档',
  SaveGame: '保存进度',
  DeleteGame: '删除存档',
  AbortMission: '放弃任务',
  AskAbortMission: '确定放弃当前任务吗？',
  AskDeleteGame: '确定删除选中的存档吗？',
  GameOptions: '游戏选项',
  Options: '选项',
  Sound: '声音',
  Audio: '音频',
  Display: '显示',
  Keyboard: '快捷键',
  Back: '返回',
  Cancel: '取消',
  OK: '确定',
  Load: '读取',
  Save: '保存',
  Delete: '删除',
  Restart: '重新开始',
  Quit: '退出',
  Briefing: '任务简报',
  Diplomacy: '外交',
  Difficulty: '难度',
  GameSpeed: '游戏速度',
  ScrollRate: '滚屏速度',
  MusicVolume: '音乐音量',
  SoundVolume: '音效音量',
  VoiceVolume: '语音音量',
  Return: '返回战场',
  TargetLines: '显示目标连线',
  Tooltips: '显示操作提示',
  ShowHidden: '显示遮挡物下的单位',
  Faster: '较快',
  Slower: '较慢',
  Music: '音乐',
  SoundOptions: '声音选项',
  SoundControls: '声音设置',
  Stereo: '立体声',
  Random: '随机播放',
  Repeat: '循环播放',
  Diplomatic: '外交',
  Allies: '盟友',
  Kills: '击毁数',
  Players: '玩家',
  ChatWith: '允许通讯',
  Ally: '结盟',
  Play: '播放音乐',
  Stop: '停止播放',
  Shuffle: '随机播放',
  Yes: '是',
  No: '否',
};
const caption = (c: Control) =>
  c.displayText?.trim() || labels[c.text.replace(/^GUI:/i, '')] || c.text.replace(/^GUI:/i, '');
function click(vm: VmShell, x: number, y: number) {
  x = Math.round(x);
  y = Math.round(y);
  const pos = (y << 16) | x;
  vm.setCursorPosition(x, y);
  vm.postMessage(0x200, 0, pos);
  vm.setKeyState(1, true);
  vm.postMessage(0x201, 1, pos);
  vm.setKeyState(1, false);
  vm.postMessage(0x202, 0, pos);
}
export type NativeEntry = 'mission' | 'options' | 'SaveGame' | 'LoadGame' | 'AbortMission' | 'DeleteGame';
export function MobileNativeMenus({ vm, entry, onBack }: { vm: VmShell; entry: NativeEntry; onBack: () => void }) {
  const [controls, setControls] = useState<Control[]>([]),
    [note, setNote] = useState('正在打开…');
  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    let opened = false;
    let target = entry === 'mission' || entry === 'options' ? null : `GUI:${entry}`;
    const poll = async () => {
      try {
        const layout = (await vm.gameControl('ui.layout')) as Control[];
        if (closed) return;
        const shown = layout.filter((c) => c.id !== 0 && c.rect.width > 0 && c.rect.height > 0);
        if (shown.length) {
          opened = true;
          const jump = target && shown.find((c) => c.text === target && c.className.toLowerCase() === 'button');
          if (jump) {
            target = null;
            click(vm, jump.rect.x + jump.rect.width / 2, jump.rect.y + jump.rect.height / 2);
          }
          setControls(shown);
          setNote('');
        } else if (opened) {
          onBack();
          return;
        } else setNote('正在等待原版菜单。若本场没有此功能，可返回作战。');
      } catch (e) {
        if (!closed) setNote(String(e));
      }
      if (!closed) timer = setTimeout(poll, 300);
    };
    void (async () => {
      const layout = (await vm.gameControl('ui.layout')) as Control[];
      if (closed) return;
      const root = layout.find((c) => c.id === 0);
      if (!root) {
        setNote('游戏窗口尚未就绪');
        return;
      }
      click(vm, root.rect.width - (entry === 'mission' ? 122 : 42), 25);
      await poll();
    })().catch((e) => {
      if (!closed) setNote(String(e));
    });
    return () => {
      closed = true;
      clearTimeout(timer);
    };
  }, [vm, entry]);
  return (
    <div className="native-menu-list">
      <strong>{entry === 'mission' ? '任务与外交' : '任务菜单'}</strong>
      {note}
      {controls.map((c, i) => {
        const { x, y, width, height } = c.rect;
        const abortPrompt = controls.some((item) => item.text === 'GUI:AskAbortMission');
        const abortChoices: Record<number, string> = { 1737: '确认放弃任务', 1810: '重新开始本关' };
        const name = abortPrompt && c.text === 'GUI:Blank' ? (abortChoices[c.id] ?? '') : caption(c);
        const token = c.className.toLowerCase();
        const sliderName: Record<number, string> = {
          1321: '游戏速度',
          1322: '滚屏速度',
          1327: '音乐音量',
          1330: '音效音量',
          1334: '语音音量',
        };
        if (token === 'button' && name)
          return (
            <button key={i} onClick={() => click(vm, x + width / 2, y + height / 2)}>
              {name}
            </button>
          );
        if (token === 'static' && name && name !== 'Blank') return <span key={i}>{name}</span>;
        if (token === 'combobox' && c.items.length)
          return (
            <select
              key={i}
              aria-label={name || '选择项目'}
              value={c.selection}
              onChange={(e) =>
                void vm
                  .gameControl('ui.select', { id: c.id, index: Number(e.target.value) })
                  .catch((e) => setNote(String(e)))
              }
            >
              {c.items.map((v, j) => (
                <option key={j} value={j}>
                  {v}
                </option>
              ))}
            </select>
          );
        if (token === 'listbox')
          return (
            <div key={i}>
              {c.items.slice(0, Math.max(1, Math.floor(height / Math.max(1, c.itemHeight)))).map((v, j) => (
                <button key={j} onClick={() => click(vm, x + 12, y + (j + 0.5) * c.itemHeight)}>
                  {v && !Array.from(v).some((char) => char.charCodeAt(0) < 32) ? v : `存档 ${j + 1}`}
                </button>
              ))}
            </div>
          );
        if (token.includes('trackbar'))
          return (
            <label key={i}>
              {sliderName[c.id] || '调节'}
              <input
                aria-label={sliderName[c.id] || '调节'}
                key={c.id + '-' + c.trackbar?.pos}
                defaultValue={
                  c.trackbar && c.trackbar.max > c.trackbar.min
                    ? Math.round((100 * (c.trackbar.pos - c.trackbar.min)) / (c.trackbar.max - c.trackbar.min))
                    : 50
                }
                type="range"
                onPointerUp={(e) =>
                  click(vm, x + 8 + (Number(e.currentTarget.value) / 100) * (width - 16), y + height / 2)
                }
              />
            </label>
          );
        return null;
      })}
    </div>
  );
}
