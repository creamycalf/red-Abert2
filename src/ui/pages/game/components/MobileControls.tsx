import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../../shared/state/useStore';
import {
  mobileBattle,
  mobileVm,
  mobileModifiers,
  mobileMenuWidth,
  mobileZoom,
  mobileViewOffset,
  mobilePanMode,
  mobileZoomSupported,
} from '../mobileState';
import { syntheticKeyStroke } from '../input';
import './MobileControls.css';
import { MobileCountryPicker } from './MobileCountryPicker';
import { MobileStartMenu } from './MobileStartMenu';
import { MobileMenuPanel } from './MobileMenuPanel';
import { MobileSidebar } from './MobileSidebar';

export function MobileControls() {
  const vm = useStore(mobileVm);
  const battle = useStore(mobileBattle);
  const modifier = useStore(mobileModifiers);
  const zoomSupported = useStore(mobileZoomSupported);
  const zoom = useStore(mobileZoom);
  const panMode = useStore(mobilePanMode);
  const [groupBusy, setGroupBusy] = useState(false);
  const [saveGroup, setSaveGroup] = useState(false);
  const [panel, setPanel] = useState(false);
  const [groups, setGroups] = useState(false);
  const [actions, setActions] = useState(false);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if ((event.target as Element)?.id === 'screen') {
        setGroups(false);
        setSaveGroup(false);
        setActions(false);
      }
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const fit = () =>
      document.documentElement.style.setProperty(
        '--mobile-bottom-lift',
        `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`,
      );
    fit();
    viewport?.addEventListener('resize', fit);
    viewport?.addEventListener('scroll', fit);
    window.addEventListener('resize', fit);
    return () => {
      viewport?.removeEventListener('resize', fit);
      viewport?.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
      document.documentElement.style.removeProperty('--mobile-bottom-lift');
    };
  }, []);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!vm) return;
    const foreground = () => vm.configureAudio?.({ active: true });
    const background = () => vm.configureAudio?.({ active: false });
    const visibility = () => vm.configureAudio?.({ active: document.visibilityState !== 'hidden' });
    vm.configureAudio?.({ streamUnderrunSeconds: 0.75, active: document.visibilityState !== 'hidden' });
    document.addEventListener('mobile-foreground', foreground);
    document.addEventListener('mobile-background', background);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('mobile-foreground', foreground);
      document.removeEventListener('mobile-background', background);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [vm]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 2400);
    return () => clearTimeout(timer);
  }, [message]);

  const groupGeneration = useRef(0);
  useEffect(() => {
    groupGeneration.current++;
    setGroupBusy(false);
    setSaveGroup(false);
    mobilePanMode.set(false);
    mobileViewOffset.set({ x: 0, y: 0 });
    setGroups(false);
    setActions(false);
    return () => {
      groupGeneration.current++;
    };
  }, [vm]);

  useEffect(() => {
    if (!vm) mobileModifiers.set('none');
  }, [vm]);
  useEffect(() => {
    if (!vm || modifier === 'none') return;
    const keys =
      modifier === 'force' ? ['ControlLeft'] : modifier === 'add' ? ['ShiftLeft'] : ['ControlLeft', 'ShiftLeft'];
    keys.forEach((code) => syntheticKeyStroke(vm, code, true));
    let timer: ReturnType<typeof setTimeout>;
    const finish = (event: PointerEvent) => {
      if ((event.target as Element)?.id === 'screen') {
        clearTimeout(timer);
        timer = setTimeout(() => mobileModifiers.set('none'), 200);
      }
    };
    const cancelMode = () => mobileModifiers.set('none');
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', cancelMode);
    window.addEventListener('blur', cancelMode);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', cancelMode);
      window.removeEventListener('blur', cancelMode);
      keys.reverse().forEach((code) => syntheticKeyStroke(vm, code, false));
    };
  }, [vm, modifier]);
  useEffect(() => {
    if (!vm) return;
    let stopped = false;
    let lastPage = '';
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const ui = (await vm.gameControl('ui.status')) as { page?: string; battlefield?: { ready: boolean } };
        if (ui.page !== lastPage) {
          const layout = (await vm.gameControl('ui.layout')) as Array<{
            id: number;
            rect: { x: number; width: number };
          }>;
          const frameWidth = layout.find((item) => item.id === 0)?.rect.width ?? 800;
          const margin = Math.max(0, (frameWidth - 800) / 2);
          const controls = layout.filter((item) => item.id !== 0 && item.rect.width > 0);
          const centered =
            controls.length > 0 &&
            controls.every((item) => item.rect.x >= margin && item.rect.x + item.rect.width <= frameWidth - margin);
          if (!stopped) mobileMenuWidth.set(centered ? 800 : null);
          lastPage = ui.page ?? '';
        }
        const next = ui.battlefield?.ready
          ? ((await vm.gameControl('mobile.observe')) as ReturnType<typeof mobileBattle.getSnapshot>)
          : { ready: false, selected: 0, placing: false, cash: 0 };
        next.ready = !!ui.battlefield?.ready;
        if (!stopped) mobileBattle.set(next);
      } catch {
        if (!stopped) mobileBattle.set({ ready: false, selected: 0, placing: false, cash: 0 });
      }
      if (!stopped) timer = setTimeout(poll, 250);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      mobileMenuWidth.set(null);
      mobileBattle.set({ ready: false, selected: 0, placing: false, cash: 0 });
    };
  }, [vm]);
  useEffect(() => {
    const back = () => {
      if (panel) setPanel(false);
      else key('Escape');
    };
    const background = () => {
      if (mobileBattle.getSnapshot().ready) key('Escape');
      void vm?.flushFiles().catch((error) => setMessage(`存档写入失败：${String(error)}`));
    };
    document.addEventListener('mobile-back', back);
    document.addEventListener('mobile-background', background);
    return () => {
      document.removeEventListener('mobile-back', back);
      document.removeEventListener('mobile-background', background);
    };
  });
  useEffect(() => {
    if (battle.placing || !battle.ready) {
      setGroups(false);
      setSaveGroup(false);
    }
  }, [battle.placing, battle.ready]);
  const key = (code: string, modifier?: string) => {
    setActions(false);
    if (!vm) return;
    if (modifier) syntheticKeyStroke(vm, modifier, true);
    syntheticKeyStroke(vm, code, true);
    syntheticKeyStroke(vm, code, false);
    if (modifier) syntheticKeyStroke(vm, modifier, false);
  };
  const cancel = () => {
    mobileModifiers.set('none');
    if (!vm) return;
    vm.postMessage(0x204, 2, 0);
    vm.postMessage(0x205, 0, 0);
  };
  const assign = async (id: number, save: boolean) => {
    if (!vm || groupBusy) return;
    if (save && !battle.selected) {
      setMessage('先在地图直接拖框选兵');
      return;
    }
    if (!save && !battle.groups?.some((g) => g.id === id && g.count)) {
      setMessage(`第 ${id} 队为空，选兵后点保存编组`);
      return;
    }
    const generation = groupGeneration.current;
    setGroupBusy(true);
    try {
      await vm.gameControl('mobile.group', { id, save });
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline) {
        const next = (await vm.gameControl('mobile.observe')) as typeof battle;
        if (generation !== groupGeneration.current) return;
        if (!next.groupPending) {
          mobileBattle.set(next);
          const group = next.groups?.find((g) => g.id === id);
          if (!group?.count || (!save && !group.selected)) throw new Error('编组未生效，请重新选择部队');
          setMessage(save ? `第 ${id} 队已保存 · ${group.count} 个单位` : `已选择第 ${id} 队 · 点地图下令`);
          setGroups(false);
          if (!save) {
            const selection = (await vm.gameControl('mobile.selection')) as Array<{ id: number }>;
            const view = (await vm.gameControl('observe')) as {
              viewport: { width: number; height: number };
              entities: Array<{ id: string; screen: { x: number; y: number } }>;
            };
            if (generation !== groupGeneration.current) return;
            const ids = new Set(selection.map((unit) => String(unit.id)));
            const units = view.entities.filter((unit) => ids.has(unit.id) && unit.screen);
            if (units.length)
              mobileViewOffset.set({
                x: units.reduce((sum, u) => sum + u.screen.x, 0) / units.length - view.viewport.width / 2,
                y: units.reduce((sum, u) => sum + u.screen.y, 0) / units.length - view.viewport.height / 2,
              });
          }
          setSaveGroup(false);
          return;
        }
        await new Promise((done) => setTimeout(done, 40));
      }
      throw new Error('编组响应超时');
    } catch (error) {
      if (generation === groupGeneration.current) setMessage(String(error));
    } finally {
      if (generation === groupGeneration.current) setGroupBusy(false);
    }
  };
  if (!vm) return null;
  return (
    <>
      <MobileCountryPicker />
      <MobileSidebar />
      <MobileStartMenu onOpenControls={() => setPanel(true)} />
      {message && (
        <div className="mobile-toast" role="status">
          {message}
        </div>
      )}
      <button className="mobile-menu" aria-label="手机菜单" onClick={() => setPanel(!panel)}>
        ☰
      </button>
      {battle.placing && (
        <button className="mobile-cancel" onClick={cancel}>
          取消建造
        </button>
      )}
      {!battle.placing && modifier !== 'none' && (
        <button className="mobile-cancel" onClick={cancel}>
          {modifier === 'force' ? '强制攻击：点目标' : modifier === 'add' ? '增选：点单位' : '移动攻击：点目的地'} ×
        </button>
      )}
      {battle.ready && !battle.placing && (
        <div className="mobile-actions">
          <button aria-pressed={panMode} onClick={() => mobilePanMode.set(!panMode)}>
            移图
          </button>
          <button
            aria-expanded={groups}
            onClick={() => {
              setGroups(!groups);
              setSaveGroup(false);
              setActions(false);
            }}
          >
            编组
          </button>
          <button
            aria-expanded={actions}
            onClick={() => {
              setActions(!actions);
              setGroups(false);
            }}
          >
            操作
          </button>
        </div>
      )}
      {battle.ready && !battle.placing && actions && (
        <div className="mobile-action-popup">
          {battle.selected > 0 && (
            <>
              <button onClick={() => key('KeyD')}>部署</button>
              <button onClick={() => key('KeyS')}>停止</button>
              <button onClick={() => key('KeyT')}>同类</button>
              <button onClick={cancel}>取消</button>
            </>
          )}
          <button
            disabled={!zoomSupported}
            aria-label="缩小地图"
            onClick={() => mobileZoom.set(Math.max(0.75, zoom - 0.25))}
          >
            −
          </button>
          <button
            disabled={!zoomSupported}
            aria-label="恢复地图缩放"
            onClick={() => {
              mobileZoom.set(1);
              mobileViewOffset.set({ x: 0, y: 0 });
            }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            disabled={!zoomSupported}
            aria-label="放大地图"
            onClick={() => mobileZoom.set(Math.min(2, zoom + 0.25))}
          >
            ＋
          </button>
          <button onClick={() => setActions(false)}>收起操作</button>
        </div>
      )}
      {battle.ready && !battle.placing && groups && (
        <div className="mobile-groups" onContextMenu={(e) => e.preventDefault()}>
          <button
            aria-label="收起编组"
            onClick={() => {
              setGroups(false);
              setSaveGroup(false);
            }}
          >
            收起 ×
          </button>
          <span>{saveGroup ? '点队号保存当前选中的部队' : '点队号选队并定位'}</span>
          <button
            aria-pressed={saveGroup}
            disabled={groupBusy || !battle.selected}
            onClick={() => setSaveGroup(!saveGroup)}
          >
            {saveGroup ? '取消保存' : '保存编组'}
          </button>
          {[1, 2, 3, 4, 5].map((id) => (
            <button
              key={id}
              data-assigned={!!battle.groups?.find((g) => g.id === id)?.count}
              aria-pressed={!!battle.groups?.find((g) => g.id === id)?.selected}
              aria-label={`第${id}队`}
              disabled={groupBusy}
              onClick={() => void assign(id, saveGroup)}
            >
              {id}队 <small>{battle.groups?.find((g) => g.id === id)?.count || '空'}</small>
            </button>
          ))}
        </div>
      )}
      {panel && <MobileMenuPanel vm={vm} battle={battle} onClose={() => setPanel(false)} onKey={key} />}
    </>
  );
}
