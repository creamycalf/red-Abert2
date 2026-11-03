import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../../shared/state/useStore';
import { mobileBattle, mobileShell, mobileVm } from '../mobileState';

const countries = ['随机', '美国', '韩国', '法国', '德国', '英国', '利比亚', '伊拉克', '古巴', '苏联'];
interface Combo {
  id: number;
  className: string;
  selection: number;
  items: string[];
  rect: { x: number; y: number; width: number; height: number };
}
/** Mobile choices notify the original menu; original country rules remain authoritative. */
export function MobileCountryPicker() {
  const vm = useStore(mobileVm),
    shell = useStore(mobileShell),
    battle = useStore(mobileBattle);
  const [resolution, setResolution] = useState([800, 600]);
  const [controls, setControls] = useState<Combo[]>([]),
    [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const generation = useRef(0);
  const visible = !battle.ready && shell.toLowerCase().includes('skirmishgame');
  useEffect(() => {
    generation.current++;
    setBusy(false);
    setOpen(null);
    setControls([]);
    if (!visible || !vm) return;
    let disposed = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const list = (await vm.gameControl('ui.layout')) as Combo[];
        if (!disposed) {
          const root = list.find((c) => c.id === 0 && c.rect.width > 0 && c.rect.height > 0);
          if (root) setResolution([root.rect.width, root.rect.height]);
          setControls(list.filter((c) => c.items.length === 10 && (c.id === 1697 || c.id === 1296)));
        }
      } catch {}
      if (!disposed) timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => {
      generation.current++;
      disposed = true;
      clearTimeout(timer);
    };
  }, [visible, vm]);
  if (!visible || !vm) return null;
  const canvas = document.querySelector<HTMLCanvasElement>('#screen'),
    box = canvas?.getBoundingClientRect();
  const choose = async (index: number) => {
    const current = generation.current;
    setBusy(true);
    setError('');
    try {
      await vm.gameControl('ui.select', { id: open, index });
      if (current === generation.current) setOpen(null);
    } catch (e) {
      if (current === generation.current) setError(String(e));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  return (
    <>
      {box &&
        controls.map((c) => (
          <button
            className="mobile-country-hit"
            aria-label={c.id === 1697 ? '打开我方国家选择' : '打开电脑国家选择'}
            key={c.id}
            style={{
              left: box.left + (c.rect.x * box.width) / resolution[0]!,
              top: box.top + (c.rect.y * box.height) / resolution[1]!,
              width: (c.rect.width * box.width) / resolution[0]!,
              height: (c.rect.height * box.height) / resolution[1]!,
            }}
            onPointerDown={(e) => {
              if (e.pointerType === 'touch') {
                e.preventDefault();
                setError('');
                setOpen(c.id);
              }
            }}
            onClick={() => {
              setError('');
              setOpen(c.id);
            }}
          />
        ))}
      <div className="mobile-countries-launchers">
        {(controls.length
          ? controls
          : [
              { id: 1697, selection: 0 },
              { id: 1296, selection: 0 },
            ]
        ).map((c) => (
          <button
            key={c.id}
            onPointerDown={(e) => {
              if (e.pointerType === 'touch') {
                e.preventDefault();
                setError('');
                setOpen(c.id);
              }
            }}
            onClick={() => {
              setError('');
              setOpen(c.id);
            }}
          >
            {c.id === 1697 ? '我方' : '电脑'}国家 · {countries[c.selection] ?? '选择'}
          </button>
        ))}
      </div>
      {open !== null && (
        <section className="mobile-country-shade">
          <div className="mobile-country-picker" role="dialog" aria-label="选择国家">
            <header>
              {open === 1697 ? '我方国家' : '电脑国家'}
              <button disabled={busy} onClick={() => setOpen(null)}>
                关闭
              </button>
            </header>
            <div>
              {countries.map((name, index) => (
                <button
                  disabled={busy || !controls.some((c) => c.id === open)}
                  key={name}
                  onClick={() => void choose(index)}
                >
                  {name}
                </button>
              ))}
            </div>
            {!controls.some((c) => c.id === open) && <p role="status">正在准备国家选项…</p>}
            {error && <p role="alert">{error}</p>}
          </div>
        </section>
      )}
    </>
  );
}
