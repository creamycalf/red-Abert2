import { describe, expect, it } from 'vitest';
import { createMobileTrainer, mobileTrainerSites } from '../../src/games/ra2/mobileTrainer';
import { createGuestMemory } from '../helpers/guestMemory';
import { withGuestMachine, PROGRAM, finish, le32, store32, call32 } from '../helpers/guestMachine';

describe('RA2 executable trainer hooks', () => {
  it('validates every instruction before making any change', () => {
    const memory = createGuestMemory();
    for (const site of mobileTrainerSites) memory.write_memory([...site.bytes], site.address);
    memory.write_memory([0], mobileTrainerSites[4].address);
    expect(
      createMobileTrainer(memory, () => {
        throw new Error('must not allocate');
      }),
    ).toBeNull();
    expect([...memory.read_memory(mobileTrainerSites[0].address, 10)]).toEqual(mobileTrainerSites[0].bytes);
  });
  it('executes production hooks with real x86: own-only, paused/off/network bypass and native payment state', async () => {
    await withGuestMachine(async (m) => {
      for (const site of mobileTrainerSites) m.code(site.address, [...site.bytes]);
      const storage = 0x90000,
        factory = 0x210000,
        house = 0x220000,
        result = 0x310000;
      expect(createMobileTrainer(m.memory, () => storage)).not.toBeNull();
      m.write(0xa35db4, house);
      m.write(0xa40d2c, 950);
      m.write(factory + 0x30, 100);
      m.write(factory + 0x38, 1);
      m.write(factory + 0x5c, 700);
      m.code(0x453eb0, [0xb8, ...le32(50), 0xc3]);
      m.code(0x4b934c, [0xc3]);
      const code: number[] = [];
      const cases = [
        { speed: 1, owner: house, start: 900, session: 5, remaining: 50, progress: 7 },
        { speed: 10, owner: house, start: 900, session: 5, remaining: 0, progress: 7 },
        { speed: 100, owner: house, start: 900, session: 0, remaining: 0, progress: 53 },
        { speed: 100, owner: house + 4096, start: 900, session: 5, remaining: 50, progress: 7 },
        { speed: 100, owner: house, start: 0xffffffff, session: 5, remaining: 50, progress: 7 },
        { speed: 100, owner: house, start: 900, session: 3, remaining: 50, progress: 7 },
      ];
      cases.forEach((c, i) => {
        code.push(
          ...store32(storage, c.speed),
          ...store32(0xa3d298, c.session),
          ...store32(factory + 0x68, c.owner),
          ...store32(factory + 0x28, c.start),
          ...store32(factory + 0x24, 7),
        );
        code.push(
          0xbe,
          ...le32(factory),
          ...call32(0x4b9342),
          0xa3,
          ...le32(result + i * 8),
          0xa1,
          ...le32(factory + 0x24),
          0xa3,
          ...le32(result + i * 8 + 4),
        );
      });
      m.code(PROGRAM, [...code, ...finish]);
      await m.run();
      cases.forEach((c, i) => {
        expect(m.read(result + i * 8)).toBe(c.remaining);
        expect(m.read(result + i * 8 + 4)).toBe(c.progress);
      });
      expect(m.read(factory + 0x5c)).toBe(700);
    });
  });
  it('executes automatic elite hook: infantry, vehicles, aircraft only, own living units, single player', async () => {
    await withGuestMachine(async (m) => {
      for (const site of mobileTrainerSites) m.code(site.address, [...site.bytes]);
      const storage = 0x90000,
        house = 0x220000,
        object = 0x210000,
        result = 0x310000;
      createMobileTrainer(m.memory, () => storage);
      m.write(0xa35db4, house);
      // Reverse the original function prologue at the continuation, then return normally.
      m.code(0x6c74c6, [0x5e, 0x5d, 0x5b, 0x83, 0xc4, 0x68, 0xc3]);
      const cases = [
        [0x7addf8, house, 100, 5, 1, true],
        [0x7a3540, house, 100, 0, 1, true],
        [0x79b12c, house, 100, 5, 1, true],
        [0x79cbbc, house, 100, 5, 1, false],
        [0x7addf8, house + 4096, 100, 5, 1, false],
        [0x7addf8, house, 0, 5, 1, false],
        [0x7addf8, house, 100, 3, 1, false],
        [0x7addf8, house, 100, 5, 0, false],
      ] as const;
      const code: number[] = [];
      cases.forEach(([vt, owner, health, session, on], i) => {
        code.push(
          ...store32(object, vt),
          ...store32(object + 0x1b4, owner),
          ...store32(object + 0x6c, health),
          ...store32(0xa3d298, session),
          ...store32(storage + 8, on),
          ...store32(object + 0x118, 0),
          ...store32(object + 0x11c, 0),
        );
        code.push(
          0xb9,
          ...le32(object),
          ...call32(0x6c74c0),
          0xa1,
          ...le32(object + 0x11c),
          0xa3,
          ...le32(result + i * 4),
        );
      });
      m.code(PROGRAM, [...code, ...finish]);
      await m.run();
      cases.forEach((c, i) => expect(m.read(result + i * 4)).toBe(c[5] ? 0x40000000 : 0));
    });
  });
});
