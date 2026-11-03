import type { GameControl } from '../control';
import type { GuestMemory } from '../../vm86/win32';
import { readU32, writeU32 } from '../shared/guestMemoryIO';
import type { NativeControlProfile } from '../shared/nativeControl';
import { createMobileInput } from './mobileInput';
import { createMobileTrainer } from './mobileTrainer';

/** Enabled only after the full RA2 native-control instruction signatures validate. */
export function withRa2MobileControl(
  base: GameControl,
  memory: GuestMemory,
  profile: NativeControlProfile,
  reserve?: (size: number) => number,
): GameControl {
  const read = (address: number) => readU32(memory, address);
  const byte = (address: number) => memory.read_memory(address, 1)[0]!;
  const double = (address: number, value?: number) => {
    const data = memory.read_memory(address, 8);
    const view = new DataView(data.buffer, data.byteOffset, 8);
    if (value !== undefined) {
      view.setFloat64(0, value, true);
      memory.write_memory(data, address);
    }
    return view.getFloat64(0, true);
  };
  const evidence = [
    [0x6c0d3e, [0x8d, 0x8e, 0x18, 0x01, 0, 0]], // Techno veterancy constructor argument, DOUBLE in RA2.
    [0x713420, [0xdd, 0x01, 0xdc, 0x1d, 0xf8, 0xa6, 0x79, 0]], // IsElite compares the double with 2.0.
    [0x5d7a21, [0x89, 0x83, 0xa0, 0, 0, 0]], // ObjectType Strength INI destination.
    [0x4ebc17, [0x89, 0x83, 0x1c, 0x01, 0, 0]], // House TechLevel INI destination.
    [0x4b9354, [0x8b, 0x4e, 0x34, 0x85, 0xc9]], // Factory step duration.
    [0x4b9373, [0x89, 0x07, 0x89, 0x57, 0x04, 0x89, 0x4f, 0x08]], // Native timer restart uses that duration.
  ] as const;
  const verified = evidence.every(([address, bytes]) => bytes.every((value, i) => byte(address + i) === value));
  const trainer = reserve && verified ? createMobileTrainer(memory, reserve) : null;
  const input = reserve && verified ? createMobileInput(memory, reserve) : null;
  let speed = 1;
  let previousHouse = 0;
  let previousFrame = 0;
  const factoryDurations = new Map<number, { object: number; id: number; duration: number; applied: number }>();
  const vector = (address: number) => {
    const count = read(address + 16),
      data = read(address + 4);
    if (count > 8192 || (count && (data < 0x100000 || data > 0x0ffff000))) throw new Error('原版对象列表无效');
    return Array.from({ length: count }, (_, i) => read(data + i * 4));
  };
  const owned = (house: number) =>
    profile.arrays.flatMap((array) =>
      vector(array.address)
        .filter(
          (object) =>
            object > 0x100000 &&
            object < 0x0ffff000 &&
            read(object + profile.owner) === house &&
            byte(object + profile.alive) &&
            !byte(object + profile.limbo) &&
            (read(object + profile.health) | 0) > 0,
        )
        .map((object) => ({ object, kind: array.kind, type: read(object + array.typeOffset) })),
    );
  return {
    ...base,
    request(method, params) {
      if (!method.startsWith('mobile.')) return base.request(method, params);
      const house = read(profile.localHouse);
      if (
        !house ||
        house < 0x100000 ||
        house > 0x0ffff000 ||
        !read(profile.frame) ||
        read(house + profile.houseIndex) > 31
      )
        throw new Error('战场尚未就绪');
      const selected = read(profile.playerControl.selectionCount);
      if (selected > 8192) throw new Error('选择列表无效');
      const frame = read(profile.frame);
      if (house !== previousHouse || frame < previousFrame) {
        factoryDurations.clear();
        speed = 1;
      }
      previousHouse = house;
      previousFrame = frame;
      if (method === 'mobile.observe') {
        const groupUnits = input ? owned(house) : [];
        return {
          ready: true,
          selected,
          placing: !!read(profile.sidebar.instance + profile.playerControl.placementObject),
          cash: read(house + profile.cash),
          techLevel: read(house + 0x11c),
          speed: trainer?.settings().speed ?? speed,
          allTech: trainer?.settings().allTech ?? false,
          autoElite: trainer?.settings().autoElite ?? false,
          trainerSupported: !!trainer,
          inputSupported: !!input,
          groupPending: input?.pending() ?? false,
          groups: input
            ? [1, 2, 3, 4, 5].map((id) => {
                const units = groupUnits.filter(({ object }) => read(object + 0x1ac) === id - 1);
                return {
                  id,
                  count: units.length,
                  selected:
                    units.length > 0 && units.every(({ object }) => !!byte(object + 0x77)) && units.length === selected,
                };
              })
            : [],
        };
      }
      if (method === 'mobile.selection') {
        const selections = new Set(
          Array.from({ length: selected }, (_, i) => read(read(profile.playerControl.selectionVector) + i * 4)),
        );
        return owned(house)
          .filter(({ object }) => selections.has(object))
          .map(({ object, kind }) => ({
            id: read(object + profile.uniqueId),
            kind,
            health: read(object + profile.health),
            veterancy: double(object + 0x118),
            group: (read(object + 0x1ac) | 0) + 1,
          }));
      }
      // RA2 SessionClass mode: 0 campaign, 5 skirmish. LAN/Internet modes never accept modifications.
      const session = read(0xa3d298);
      if (session !== 0 && session !== 5) throw new Error('修改器仅限单人战役和遭遇战');
      if (!verified) throw new Error('当前游戏版本的修改器指令签名不匹配');
      if (method === 'mobile.pan') {
        if (!input) throw new Error('地图控制不可用');
        const p = params as { dx: number; dy: number };
        input.pan(p?.dx, p?.dy);
        return { accepted: true };
      }
      if (method === 'mobile.group') {
        if (!input) throw new Error('编组控制不可用');
        const p = params as { id: number; save: boolean };
        if (p?.save && !selected) throw new Error('先选中部队');
        input.group(p?.id, !!p?.save);
        return { accepted: true };
      }
      if (method === 'mobile.trainer') {
        if (!trainer) throw new Error('当前版本不支持增强修改器');
        const next = params as { speed?: number; allTech?: boolean; autoElite?: boolean };
        if (
          !next ||
          (next.allTech !== undefined && typeof next.allTech !== 'boolean') ||
          (next.autoElite !== undefined && typeof next.autoElite !== 'boolean')
        )
          throw new Error('无效修改器设置');
        return trainer.configure(next);
      }
      if (method === 'mobile.money') {
        const amount = Number((params as { amount?: number })?.amount);
        if (!Number.isInteger(amount) || amount < 0 || amount > 10000000) throw new Error('金钱范围：0–10000000');
        writeU32(memory, house + profile.cash, amount);
        return { cash: read(house + profile.cash) };
      }
      if (method === 'mobile.tech') {
        const level = Number((params as { level?: number })?.level);
        if (!Number.isInteger(level) || level < 1 || level > 10) throw new Error('科技等级范围：1–10');
        writeU32(memory, house + 0x11c, level);
        return { techLevel: read(house + 0x11c) };
      }
      if (method === 'mobile.speed' || method === 'mobile.tick') {
        if (trainer)
          return method === 'mobile.tick'
            ? trainer.settings()
            : trainer.configure({ speed: Number((params as { factor?: number })?.factor) });
        if (method === 'mobile.speed') {
          const factor = Number((params as { factor?: number })?.factor);
          if (![1, 2, 4, 8].includes(factor)) throw new Error('生产倍率无效');
          speed = factor;
        }
        const live = new Set<number>();
        for (const factory of vector(profile.factory.array)) {
          if (
            read(factory + profile.factory.owner) !== house ||
            !read(factory + profile.factory.object) ||
            byte(factory + profile.factory.suspended)
          )
            continue;
          const object = read(factory + profile.factory.object),
            id = read(object + profile.uniqueId);
          const duration = read(factory + 0x34);
          if (!duration || duration > 100000) continue;
          live.add(factory);
          let saved = factoryDurations.get(factory);
          if (!saved || saved.object !== object || saved.id !== id || saved.applied !== duration)
            factoryDurations.set(factory, (saved = { object, id, duration, applied: duration }));
          const next = Math.max(1, Math.ceil(saved.duration / speed));
          writeU32(memory, factory + 0x34, next);
          // Only shorten remaining duration; retain native costs, progress steps, suspension, and completion.
          if (read(factory + 0x30) > next) writeU32(memory, factory + 0x30, next);
          saved.applied = next;
        }
        for (const factory of factoryDurations.keys()) if (!live.has(factory)) factoryDurations.delete(factory);
        return { speed };
      }
      if (['mobile.promote', 'mobile.heal', 'mobile.building'].includes(method)) {
        const selections = new Set(
          Array.from({ length: selected }, (_, i) => read(read(profile.playerControl.selectionVector) + i * 4)),
        );
        const level = Number((params as { level?: number })?.level ?? 1);
        if (method === 'mobile.building' && ![1, 2, 3].includes(level)) throw new Error('建筑耐久档位无效');
        let changed = 0;
        for (const { object, type, kind } of owned(house)) {
          if (!selections.has(object)) continue;
          if (method === 'mobile.promote') {
            if (kind === 'building' || !byte(type + 0xa9a)) continue;
            double(object + 0x118, 2);
            changed++;
          } else {
            if (method === 'mobile.building' && kind !== 'building') continue;
            const maximum = read(type + 0xa0);
            if (!maximum || maximum > 1000000) throw new Error('单位最大生命值无效');
            writeU32(memory, object + profile.health, maximum * (method === 'mobile.building' ? level : 1));
            changed++;
          }
        }
        if (!changed) throw new Error(method === 'mobile.building' ? '先选中己方建筑' : '先选中可修改的己方单位');
        return { changed };
      }
      throw new Error('不支持的修改操作');
    },
  };
}
