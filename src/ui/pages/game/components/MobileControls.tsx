import { mobileProductName } from '../../../../games/ra2/mobileProductNames';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../../shared/state/useStore';
import {
  mobileBattle,
  mobileBuildCancel,
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
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const groupRequestBusy = useRef(false);
  const members = useRef<number[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [orderBusy, setOrderBusy] = useState(false);
  const queueSnapshot = async () =>
    (await vm!.gameControl('observe')) as {
      sessionId: string;
      frame: number;
      production: Array<{ type: string; suspended: boolean }>;
    };
  const order = async (type: string, action: 'cancel' | 'suspend') => {
    if (!vm || orderBusy) return;
    setOrderBusy(true);
    try {
      const state = await queueSnapshot();
      const commandId = crypto.randomUUID();
      await vm.gameControl('command', {
        sessionId: state.sessionId,
        observedFrame: state.frame,
        commandId,
        action,
        type,
      });
      for (let i = 0; i < 50; i++) {
        const next = await queueSnapshot();
        const item = next.production.find((p) => p.type === type);
        if (action === 'cancel' ? !item : item?.suspended) {
          setMessage(action === 'cancel' ? '生产已撤回' : '生产已暂停');
          setProducts((current) => (current.length ? [] : current));
          return;
        }
        await new Promise((done) => setTimeout(done, 100));
      }
      setMessage('未确认生产状态，请重新查看队列');
    } catch (e) {
      setMessage(String(e));
    } finally {
      setOrderBusy(false);
    }
  };
  const queuedRecall = useRef<number | null>(null);
  useEffect(() => {
    document.documentElement.classList.toggle(
      'mobile-group-picker-open',
      (groupPickerOpen || products.length > 0) && battle.ready && !battle.placing,
    );
    return () => document.documentElement.classList.remove('mobile-group-picker-open');
  }, [groupPickerOpen, products, battle.ready, battle.placing]);
  const [panel, setPanel] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('mobile-battle-dock', battle.ready);
    if (!battle.ready || battle.placing) mobileBuildCancel.set(false);
    return () => document.documentElement.classList.remove('mobile-battle-dock');
  }, [battle.ready, battle.placing]);
  const [actions, setActions] = useState(false);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if ((event.target as Element)?.id === 'screen') {
        setPanel(false);
        setGroupPickerOpen(false);
        setProducts((current) => (current.length ? [] : current));
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
    queuedRecall.current = null;
    setGroupBusy(false);
    groupRequestBusy.current = false;
    setGroupPickerOpen(false);
    mobilePanMode.set(false);
    mobileBuildCancel.set(false);
    mobileViewOffset.set({ x: 0, y: 0 });
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
      setProducts((current) => (current.length ? [] : current));
      setGroupPickerOpen(false);
    }
  }, [battle.placing, battle.ready]);
  const key = (code: string, modifier?: string) => {
    setActions(false);
    setGroupPickerOpen(false);
    if (!vm) return;
    if (modifier) syntheticKeyStroke(vm, modifier, true);
    syntheticKeyStroke(vm, code, true);
    syntheticKeyStroke(vm, code, false);
    if (modifier) syntheticKeyStroke(vm, modifier, false);
  };
  const cancel = () => {
    setActions(false);
    setProducts((current) => (current.length ? [] : current));
    setGroupPickerOpen(false);
    mobileBuildCancel.set(false);
    mobileModifiers.set('none');
    if (!vm) return;
    const point = (100 << 16) | 100;
    vm.postMessage(0x200, 0, point);
    vm.setKeyState(2, true);
    vm.postMessage(0x204, 2, point);
    vm.setKeyState(2, false);
    vm.postMessage(0x205, 0, point);
  };
  const assign = async (id: number, save: boolean) => {
    if (!vm || !mobileBattle.getSnapshot().ready || mobileBattle.getSnapshot().placing) return;
    if (groupRequestBusy.current) {
      if (!save) {
        queuedRecall.current = id;
        setMessage(`即将选择第 ${id} 队`);
      }
      return;
    }
    if (save && !members.current.length) {
      setMessage('先在地图直接拖框选兵');
      return;
    }
    const generation = groupGeneration.current;
    groupRequestBusy.current = true;
    setGroupBusy(true);
    setGroupPickerOpen(false);
    try {
      if (!save) {
        setMessage(`正在选择第 ${id} 队`);
        const current = (await vm.gameControl('mobile.observe')) as typeof battle;
        if (generation !== groupGeneration.current) return;
        if (!current.groups?.some((g) => g.id === id && g.count)) {
          setMessage(`第 ${id} 队为空，请先设置编组`);
          return;
        }
      }
      await vm.gameControl('mobile.group', { id, save, members: save ? members.current : undefined });
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline) {
        const next = (await vm.gameControl('mobile.observe')) as typeof battle;
        if (generation !== groupGeneration.current) return;
        if (!next.groupPending) {
          mobileBattle.set(next);
          const group = next.groups?.find((g) => g.id === id);
          if (!group?.count || (!save && !group.selected)) throw new Error('编组未生效，请重新选择部队');
          setMessage(save ? `第 ${id} 队已保存 · ${group.count} 个单位` : `已选择第 ${id} 队 · 点地图下令`);
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
          setGroupPickerOpen(false);
          return;
        }
        await new Promise((done) => setTimeout(done, 40));
      }
      throw new Error('编组响应超时');
    } catch (error) {
      if (generation === groupGeneration.current) setMessage(String(error));
    } finally {
      if (generation === groupGeneration.current) {
        groupRequestBusy.current = false;
        setGroupBusy(false);
        const nextId = queuedRecall.current;
        queuedRecall.current = null;
        if (nextId !== null) void assign(nextId, false);
      }
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
      {battle.ready && (
        <nav className="mobile-actions" aria-label="战场快捷栏">
          <button onClick={cancel}>{battle.placing ? '取消放置' : '取消'}</button>
          <button
            aria-label="撤回建造"
            aria-expanded={products.length > 0}
            disabled={battle.placing}
            onClick={async () => {
              setGroupPickerOpen(false);
              if (products.length) {
                setProducts((current) => (current.length ? [] : current));
                return;
              }
              try {
                const state = await queueSnapshot();
                setProducts([...new Set(state.production.map((p) => p.type))]);
                if (!state.production.length) setMessage('当前没有生产项目');
              } catch (e) {
                setMessage(String(e));
              }
            }}
          >
            暂停/撤回
          </button>
          <button disabled={!battle.selected || battle.placing} onClick={() => key('KeyD')}>
            部署
          </button>
          <button disabled={!battle.selected || battle.placing} onClick={() => key('KeyS')}>
            停止
          </button>
          <button aria-pressed={panMode} onClick={() => mobilePanMode.set(!panMode)}>
            移图
          </button>
          <button
            aria-expanded={groupPickerOpen}
            aria-controls="mobile-group-picker"
            disabled={!battle.selected || battle.placing || groupBusy}
            onClick={async () => {
              setProducts((current) => (current.length ? [] : current));
              setActions(false);
              if (groupPickerOpen) {
                setGroupPickerOpen(false);
                return;
              }
              try {
                const selected = (await vm.gameControl('mobile.selection')) as Array<{ id: number; kind: string }>;
                members.current = selected.filter((u) => u.kind !== 'building').map((u) => u.id);
                if (!members.current.length) {
                  setMessage('请先框选己方存活的部队');
                  return;
                }
                setGroupPickerOpen(true);
              } catch (e) {
                setMessage(String(e));
              }
            }}
          >
            设置编组
          </button>
          {[1, 2, 3, 4, 5].map((id) => (
            <button
              key={id}
              aria-label={`第${id}队`}
              aria-pressed={!!battle.groups?.find((g) => g.id === id)?.selected}
              disabled={battle.placing}
              onClick={() => {
                mobileBuildCancel.set(false);
                void assign(id, false);
              }}
            >
              {id}编组
              <small>{battle.groups?.find((g) => g.id === id)?.count || '空'}</small>
            </button>
          ))}
          <button
            aria-expanded={actions}
            onClick={() => {
              setGroupPickerOpen(false);
              setActions(!actions);
            }}
          >
            操作
          </button>
        </nav>
      )}
      {battle.ready && !battle.placing && products.length > 0 && (
        <div className="mobile-group-picker production-list" aria-label="生产队列">
          {products.map((type) => (
            <span key={type} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <strong>{mobileProductName(type)}</strong>
              <button disabled={orderBusy} onClick={() => void order(type, 'suspend')}>
                暂停
              </button>
              <button
                aria-label={`撤回 ${mobileProductName(type)}`}
                disabled={orderBusy}
                onClick={() => void order(type, 'cancel')}
              >
                撤回
              </button>
            </span>
          ))}
          <button onClick={() => setProducts([])}>返回</button>
        </div>
      )}
      {battle.ready && !battle.placing && groupPickerOpen && (
        <div id="mobile-group-picker" className="mobile-group-picker" role="group" aria-label="设置编组选号">
          <span>将所选部队设为</span>
          {[1, 2, 3, 4, 5].map((id) => (
            <button key={id} aria-label={`设为第${id}编组`} disabled={groupBusy} onClick={() => void assign(id, true)}>
              {id}编组
            </button>
          ))}
          <button onClick={() => setGroupPickerOpen(false)}>返回</button>
        </div>
      )}
      {battle.ready && !battle.placing && actions && (
        <div className="mobile-action-popup">
          {battle.selected > 0 && (
            <>
              <button onClick={() => key('KeyT')}>同类</button>
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
      {panel && <MobileMenuPanel vm={vm} battle={battle} onClose={() => setPanel(false)} onKey={key} />}
    </>
  );
}
