import { describe, expect, it } from 'vitest';
import { createGuestMemory, writeU32, readU32 } from '../helpers/guestMemory';
import { RA2_CONTROL_PROFILE as profile } from '../../src/games/ra2/control';
import { withRa2MobileControl } from '../../src/games/ra2/mobileControl';

function fixture(corrupt = false) {
  const memory = createGuestMemory();
  const house = 0x200000,
    other = 0x201000,
    unit = 0x210000,
    enemy = 0x212000,
    type = 0x220000,
    factory = 0x230000;
  for (const [address, bytes] of [
    [0x6c0d3e, [0x8d, 0x8e, 0x18, 1, 0, 0]],
    [0x713420, [0xdd, 1, 0xdc, 0x1d, 0xf8, 0xa6, 0x79, 0]],
    [0x5d7a21, [0x89, 0x83, 0xa0, 0, 0, 0]],
    [0x4ebc17, [0x89, 0x83, 0x1c, 1, 0, 0]],
    [0x4b9354, [0x8b, 0x4e, 0x34, 0x85, 0xc9]],
    [0x4b9373, [0x89, 7, 0x89, 0x57, 4, 0x89, 0x4f, 8]],
  ] as const)
    memory.write_memory([...bytes], address);
  if (corrupt) memory.write_memory([0], 0x713420);
  const put = (address: number, value: number) => writeU32(memory, address, value);
  put(profile.localHouse, house);
  put(profile.frame, 100);
  put(0xa3d298, 5);
  put(house + profile.cash, 1000);
  put(other + profile.cash, 9000);
  for (const [object, owner] of [
    [unit, house],
    [enemy, other],
  ]) {
    put(object! + profile.owner, owner!);
    put(object! + profile.health, 80);
    memory.write_memory([1], object! + profile.alive);
    put(object! + 0x5ac, type);
    put(object! + profile.uniqueId, object!);
  }
  put(type + 0xa0, 300);
  memory.write_memory([1], type + 0xa9a);
  put(profile.arrays[0]!.address + 4, 0x240000);
  put(profile.arrays[0]!.address + 16, 2);
  put(0x240000, unit);
  put(0x240004, enemy);
  put(profile.playerControl.selectionVector, 0x250000);
  put(profile.playerControl.selectionCount, 2);
  put(0x250000, unit);
  put(0x250004, enemy);
  put(profile.factory.array + 4, 0x260000);
  put(profile.factory.array + 16, 1);
  put(0x260000, factory);
  put(factory + profile.factory.owner, house);
  put(factory + profile.factory.object, unit);
  put(factory + 0x34, 40);
  put(factory + 0x30, 40);
  put(factory + 0x24, 12);
  put(factory + 0x5c, 700);
  const control = withRa2MobileControl({ request: () => null, dispose() {} }, memory, profile);
  return { memory, house, other, unit, enemy, factory, put, control };
}

describe('RA2 mobile single-player trainer', () => {
  it('refuses network sessions, unsupported signatures, and out-of-range money', () => {
    const f = fixture();
    f.put(0xa3d298, 3);
    expect(() => f.control.request('mobile.money', { amount: 2000 })).toThrow('单人');
    expect(readU32(f.memory, f.house + profile.cash)).toBe(1000);
    expect(() => fixture(true).control.request('mobile.money', { amount: 2000 })).toThrow('签名');
    f.put(0xa3d298, 5);
    expect(() => f.control.request('mobile.money', { amount: -1 })).toThrow('范围');
    expect(f.control.request('mobile.money', { amount: 2000 })).toEqual({ cash: 2000 });
    expect(readU32(f.memory, f.other + profile.cash)).toBe(9000);
  });
  it('promotes and heals only live, selected, owned units using RA2 double veterancy', () => {
    const f = fixture();
    expect(f.control.request('mobile.promote', {})).toEqual({ changed: 1 });
    expect(new DataView(f.memory.bytes.buffer).getFloat64(f.unit + 0x118, true)).toBe(2);
    expect(new DataView(f.memory.bytes.buffer).getFloat64(f.enemy + 0x118, true)).toBe(0);
    f.control.request('mobile.heal', {});
    expect(readU32(f.memory, f.unit + profile.health)).toBe(300);
    expect(readU32(f.memory, f.enemy + profile.health)).toBe(80);
  });
  it('speeds the factory timer without manufacturing progress, free costs, or completion; restores duration', () => {
    const f = fixture();
    f.control.request('mobile.speed', { factor: 4 });
    expect(readU32(f.memory, f.factory + 0x34)).toBe(10);
    expect(readU32(f.memory, f.factory + 0x24)).toBe(12);
    expect(readU32(f.memory, f.factory + 0x5c)).toBe(700);
    f.control.request('mobile.speed', { factor: 1 });
    expect(readU32(f.memory, f.factory + 0x34)).toBe(40);
  });
});
