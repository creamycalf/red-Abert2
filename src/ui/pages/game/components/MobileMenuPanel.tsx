import { MobileCampaignGuide } from './MobileCampaignGuide';
import { useEffect, useState } from 'react';
import type { VmShell } from '../../../../adapter/vmShell';
import { mobileBattle, mobileModifiers } from '../mobileState';

export function MobileMenuPanel({
  vm,
  battle,
  onClose,
  onKey,
}: {
  vm: VmShell;
  battle: ReturnType<typeof mobileBattle.getSnapshot>;
  onClose(): void;
  onKey(code: string): void;
}) {
  const [tab, setTab] = useState('作战');
  const [money, setMoney] = useState(100000);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // Close without consuming the gesture: the same touch must still reach the native map/sidebar.
    const closeOnGameTouch = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.id === 'screen') onClose();
    };
    document.addEventListener('pointerdown', closeOnGameTouch, true);
    return () => document.removeEventListener('pointerdown', closeOnGameTouch, true);
  }, [onClose]);
  const invoke = async (method: string, params: unknown, success: string) => {
    setBusy(true);
    try {
      await vm.gameControl(method, params);
      mobileBattle.set((await vm.gameControl('mobile.observe')) as typeof battle);
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const order = (code: string) => {
    onClose();
    onKey(code);
  };
  const mode = (value: 'force' | 'attack-move' | 'add') => {
    onClose();
    mobileModifiers.set(value);
  };
  return (
    <div className="mobile-panel-shade">
      <section className="mobile-panel" role="dialog" aria-label="手机菜单面板">
        <header>
          <strong>指挥菜单</strong>
          <span>{battle.ready ? '单人战场' : '游戏菜单'}</span>
        </header>
        <nav className="mobile-panel-tabs" aria-label="菜单分类">
          {['作战', '攻略', '修改器', '设置'].map((name) => (
            <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>
              {name}
            </button>
          ))}
        </nav>
        <div className="mobile-panel-content">
          {tab === '作战' && (
            <>
              <button className="mobile-menu-wide" onClick={() => order('Escape')}>
                原版菜单 / 保存 / 读取
              </button>
              <div className="mobile-command-grid">
                <button onClick={() => order('KeyH')}>回到基地</button>
                <button onClick={() => order('Space')}>最近事件</button>
                <button onClick={() => mode('attack-move')}>移动攻击</button>
                <button onClick={() => mode('force')}>强制攻击</button>
                <button onClick={() => order('KeyK')}>维修模式</button>
                <button onClick={() => order('KeyL')}>出售模式</button>
              </div>
              <details>
                <summary>更多部队命令</summary>
                <div className="mobile-command-grid">
                  <button onClick={() => mode('add')}>增选单位</button>
                  <button onClick={() => order('KeyP')}>选择全部</button>
                  <button onClick={() => order('KeyG')}>警戒</button>
                  <button onClick={() => order('KeyX')}>散开</button>
                </div>
              </details>
            </>
          )}
          {tab === '修改器' && (
            <fieldset disabled={!battle.ready || busy}>
              {!battle.ready && <p>进入战役或遭遇战后可使用。</p>}
              <div className="mobile-money-row">
                <label>
                  金钱
                  <input
                    aria-label="金钱"
                    type="number"
                    min="0"
                    max="10000000"
                    value={money}
                    onChange={(e) => setMoney(Number(e.target.value))}
                  />
                </label>
                <button onClick={() => void invoke('mobile.money', { amount: money }, `金钱已改为 ${money}`)}>
                  设置金钱
                </button>
              </div>
              <div className="mobile-cheat-card">
                <strong>生产速度</strong>
                <small>正常扣费，建筑完成后仍需选址</small>
                <div className="mobile-speed-options">
                  {[
                    [1, '正常'],
                    [10, '10 倍'],
                    [100, '瞬间建造'],
                  ].map(([speed, label]) => (
                    <button
                      key={speed}
                      aria-pressed={battle.speed === speed}
                      onClick={() => void invoke('mobile.trainer', { speed }, `生产速度：${label}`)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="mobile-cheat-card mobile-toggle">
                <span>
                  <strong>全科技 / 跨阵营</strong>
                  <small>盟军和苏军科技互通；仍需兵营、工厂或机场</small>
                </span>
                <input
                  type="checkbox"
                  checked={battle.allTech ?? false}
                  disabled={!battle.trainerSupported}
                  onChange={(e) =>
                    void invoke(
                      'mobile.trainer',
                      { allTech: e.target.checked },
                      e.target.checked ? '已开放科技，原版建造栏正在刷新' : '已恢复原版科技限制',
                    )
                  }
                />
              </label>
              <label className="mobile-cheat-card mobile-toggle">
                <span>
                  <strong>我军自动满级</strong>
                  <small>步兵、坦克、飞机；新生产单位同样生效</small>
                </span>
                <input
                  type="checkbox"
                  checked={battle.autoElite ?? false}
                  disabled={!battle.trainerSupported}
                  onChange={(e) =>
                    void invoke(
                      'mobile.trainer',
                      { autoElite: e.target.checked },
                      e.target.checked ? '自动满级已开启' : '自动满级已关闭，已有精英等级保留',
                    )
                  }
                />
              </label>
              {!battle.trainerSupported && battle.ready && <p>当前程序的增强修改器验证失败，暂不可用。</p>}
              <details>
                <summary>所选单位与建筑</summary>
                <div className="mobile-command-grid">
                  <button onClick={() => void invoke('mobile.heal', {}, '所选单位/建筑已恢复满血')}>
                    所选恢复满血
                  </button>
                  <button
                    onClick={() => void invoke('mobile.building', { level: 3 }, '所选己方建筑当前耐久已设为 3 倍')}
                  >
                    建筑耐久 3×
                  </button>
                </div>
              </details>
            </fieldset>
          )}
          {tab === '攻略' && <MobileCampaignGuide active={battle.ready} onPause={() => onKey('Escape')} />}
          {tab === '设置' && (
            <>
              <label className="mobile-volume">
                音量
                <input
                  type="range"
                  min="0"
                  max="100"
                  defaultValue="75"
                  onChange={(e) => vm.setMasterVolume(Number(e.target.value) / 100)}
                />
              </label>
              <button
                className="mobile-menu-wide"
                onClick={() =>
                  void import('../page')
                    .then((page) => page.exportMobileSaves())
                    .then(
                      () => setMessage('存档备份已导出'),
                      (error) => setMessage(String(error)),
                    )
                }
              >
                备份全部存档
              </button>
              <label className="mobile-import">
                恢复存档备份
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file)
                      void import('../page')
                        .then((page) => page.importMobileSaves(file))
                        .catch((error) => setMessage(String(error)));
                  }}
                />
              </label>
              <details>
                <summary>触屏操作说明</summary>
                <p>
                  点选与下令；直接单指拖框选兵，双指拖图、捏合缩放；第二指及时跟上会优先判定为移图。开启“移图”可用单指拖图，关闭恢复直接框选；轻点下令。双指轻点取消。建筑就绪后点绿色地块放置，按住滑动可预览。先点保存编组再点数字保存，普通轻点数字选队并定位；数字下方显示人数。
                </p>
              </details>
              <p className="mobile-muted">卸载会删除内部存档。覆盖更新前建议先备份。</p>
            </>
          )}
        </div>
        <footer>
          <p className="mobile-message" role="status">
            {message}
          </p>
          <button className="mobile-return" onClick={onClose}>
            返回游戏
          </button>
        </footer>
      </section>
    </div>
  );
}
