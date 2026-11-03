import type { GuestMemory } from '../../vm86/win32';
import { controlCode } from '../shared/nativeSidebarControl';
import { le32 } from '../shared/bytes';
import { readU32, writeU32 } from '../shared/guestMemoryIO';

const hex = (text: string) => text.split(' ').map((value) => parseInt(value, 16));
/** RA2 1.006 instructions independently checked against the supplied game.exe. */
export const mobileTrainerSites = [
  { address: 0x4b9342, bytes: hex('8d 7e 28 8b cf e8 64 ab f9 ff') },
  { address: 0x4e372a, bytes: hex('8b b7 1c 01 00 00 89 6c 24 14') },
  { address: 0x4e38fc, bytes: hex('8b 44 24 24 89 6c 24 54') },
  { address: 0x5d6078, bytes: hex('8b 4c 24 10 85 c1') },
  { address: 0x6c74c0, bytes: hex('83 ec 68 53 55 56') },
] as const;

export interface MobileTrainerSettings {
  speed: number;
  allTech: boolean;
  autoElite: boolean;
}

/** Install once before native execution; toggles only update data, never live JIT instructions. */
export function createMobileTrainer(memory: GuestMemory, reserve: (size: number) => number) {
  if (
    !mobileTrainerSites.every((site) =>
      site.bytes.every((value, i) => memory.read_memory(site.address + i, 1)[0] === value),
    )
  )
    return null;
  const storage = reserve(4096);
  memory.write_memory(new Uint8Array(4096), storage);
  writeU32(memory, storage, 1);
  const settings = (): MobileTrainerSettings => ({
    speed: readU32(memory, storage),
    allTech: !!readU32(memory, storage + 4),
    autoElite: !!readU32(memory, storage + 8),
  });

  mobileTrainerSites.forEach((site, index) => {
    const at = storage + 256 + index * 640;
    const a = controlCode(at);
    const emit = (text: string) => a.emit(...hex(text));
    // Emit absolute transfers without resolving forward labels prematurely.
    const transfers: Array<{ label: string; target: number }> = [];
    const go = (target: number) => {
      const label = `out${transfers.length}`;
      transfers.push({ label, target });
      a.jump(label);
    };
    const singlePlayer = () => {
      emit('83 3d');
      a.emit(...le32(0xa3d298), 0);
      a.jump('single', 0x84);
      emit('83 3d');
      a.emit(...le32(0xa3d298), 5);
      a.jump('original', 0x85);
      a.label('single');
    };
    if (index === 0) {
      // Obtain the native timer result first. Preserve all non-result state across our calculation.
      emit('8d 7e 28 8b cf');
      a.call(0x453eb0);
      emit('9c 51 52');
      singlePlayer();
      emit('8b 0d');
      a.emit(...le32(0xa35db4));
      emit('39 4e 68');
      a.jump('original', 0x85);
      emit('83 7e 28 ff');
      a.jump('original', 0x84);
      emit('8b 0d');
      a.emit(...le32(storage));
      emit('83 f9 01');
      a.jump('original', 0x86);
      emit('83 f9 64');
      a.jump('instant', 0x84);
      emit('8b 46 30 85 c0');
      a.jump('original', 0x8e);
      emit('31 d2 f7 f1 85 c0');
      a.jump('delay', 0x85);
      emit('40');
      a.label('delay');
      emit('8b 15');
      a.emit(...le32(0xa40d2c));
      emit('2b 56 28 29 d0');
      a.jump('original', 0x8f);
      emit('31 c0');
      a.jump('original');
      a.label('instant');
      emit('b8 36 00 00 00 2b 46 38 89 46 24 31 c0');
      a.label('original');
      emit('5a 59 9d');
      go(0x4b934c);
    } else if (index < 4) {
      emit('9c 50');
      singlePlayer();
      emit('83 3d');
      a.emit(...le32(storage + 4), 0);
      a.jump('original', 0x84);
      emit('a1');
      a.emit(...le32(0xa35db4));
      emit('85 c0');
      a.jump('original', 0x84);
      if (index === 1) emit('39 c7');
      else emit(index === 2 ? '3b 44 24 18' : '3b 44 24 30');
      a.jump('original', 0x85);
      if (index === 1) {
        // Keep disabled/civilian types out. Both factions still need an actual category factory.
        emit('81 bb 5c 05 00 00 ff 00 00 00');
        a.jump('reject', 0x84);
        emit('58 9d be ff ff ff 7f 89 6c 24 14');
        go(0x4e3832);
        a.label('reject');
        emit('58 9d');
        go(0x4e3740);
      } else {
        emit('58 9d');
        go(index === 2 ? 0x4e3c0c : 0x5d6084);
      }
      a.label('original');
      emit('58 9d');
      a.emit(...site.bytes);
      go(site.address + site.bytes.length);
    } else {
      emit('9c 50');
      singlePlayer();
      emit('83 3d');
      a.emit(...le32(storage + 8), 0);
      a.jump('original', 0x84);
      emit('a1');
      a.emit(...le32(0xa35db4));
      emit('85 c0');
      a.jump('original', 0x84);
      emit('39 81 b4 01 00 00');
      a.jump('original', 0x85);
      emit('83 79 6c 00');
      a.jump('original', 0x8e);
      emit('8b 01');
      for (const vt of [0x7addf8, 0x7a3540]) {
        a.emit(0x3d, ...le32(vt));
        a.jump('elite', 0x84);
      }
      a.emit(0x3d, ...le32(0x79b12c));
      a.jump('original', 0x85);
      a.label('elite');
      emit('c7 81 18 01 00 00 00 00 00 00 c7 81 1c 01 00 00 00 00 00 40');
      a.label('original');
      emit('58 9d');
      a.emit(...site.bytes);
      go(0x6c74c6);
    }
    // Resolve local branch labels first, then encode terminal native transfers.
    const terminalOffsets: Array<{ offset: number; target: number }> = [];
    for (const transfer of transfers) {
      a.label(transfer.label);
      a.emit(0xe9, 0, 0, 0, 0);
    }
    const code = a.finish();
    transfers.forEach((transfer, i) =>
      terminalOffsets.push({ offset: code.length - (transfers.length - i) * 5, target: transfer.target }),
    );
    for (const transfer of terminalOffsets)
      code.set(le32(transfer.target - at - transfer.offset - 5), transfer.offset + 1);
    if (code.length > 640) throw new Error('Mobile trainer code exceeds its reserved block');
    memory.write_memory(code, at);
    memory.write_memory(
      [0xe9, ...le32(at - site.address - 5), ...Array(site.bytes.length - 5).fill(0x90)],
      site.address,
    );
  });
  return {
    settings,
    configure(next: Partial<MobileTrainerSettings>) {
      if (next.speed !== undefined) {
        if (![1, 2, 4, 8, 10, 100].includes(next.speed)) throw new Error('无效生产速度');
        writeU32(memory, storage, next.speed);
      }
      if (next.allTech !== undefined) {
        writeU32(memory, storage + 4, Number(next.allTech));
        const house = readU32(memory, 0xa35db4);
        if (house >= 0x100000 && house < 0x0fff0000) memory.write_memory([1], house + 0x144);
      }
      if (next.autoElite !== undefined) writeU32(memory, storage + 8, Number(next.autoElite));
      return settings();
    },
  };
}
