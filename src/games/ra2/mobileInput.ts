import type { GuestMemory } from '../../vm86/win32';
import { readU32, writeU32 } from '../shared/guestMemoryIO';
import { controlCode } from '../shared/nativeSidebarControl';
import { le32 } from '../shared/bytes';

const hex = (s: string) => s.split(' ').map((v) => parseInt(v, 16));
/** RA2 1.006 native team commands and pixel camera updates, traced in the original executable. */
export const mobileInputEvidence = [
  { address: 0x6f5d90, bytes: hex('53 8b 1d 30 0c a4 00 55 57 33 ff 8b e9') },
  { address: 0x6f5f00, bytes: hex('83 ec 10 56 8b f1 57 6a 00 b9 e0 24 83 00') },
  { address: 0x6f60d0, bytes: hex('51 55 8b e9 57 6a 00 b9 e0 24 83 00') },
  { address: 0x6f5dc4, bytes: hex('8a 81 35 01 00 00') },
  { address: 0x6f5dec, bytes: hex('8a 4e 77') },
  { address: 0x6f5dd5, bytes: hex('8b 8e ac 01 00 00 8d 45 ff 3b c8') },
  { address: 0x6a8c80, bytes: hex('a1 d8 25 83 00 8b 0d d0 25 83 00 03 c0') },
  { address: 0x6a9170, bytes: hex('83 ec 18 56 8b f1 57 c7 44 24 1c 00 00 00 00') },
  { address: 0x6a677f, bytes: hex('89 b7 64 0d 00 00 89 b7 74 0d 00 00 8b cf 89 9f 68 0d 00 00 89 9f 78 0d 00 00') },
] as const;

export function createMobileInput(memory: GuestMemory, reserve: (size: number) => number) {
  if (!mobileInputEvidence.every((s) => s.bytes.every((v, i) => memory.read_memory(s.address + i, 1)[0] === v)))
    return null;
  // Chain the already-validated native-control tick before guest execution; never patch translated live code.
  const site = 0x5406ac;
  if (memory.read_memory(site, 1)[0] !== 0xe9) return null;
  const previous = (site + 5 + readU32(memory, site + 1)) >>> 0;
  const box = reserve(2048),
    at = box + 128;
  memory.write_memory(new Uint8Array(2048), box);
  const a = controlCode(at),
    emit = (s: string) => a.emit(...hex(s));
  emit('9c 60');
  emit('83 3d');
  a.emit(...le32(0xa35db4), 0);
  a.jump('done', 0x84);
  emit('83 3d');
  a.emit(...le32(box), 0);
  a.jump('pan', 0x84);
  emit('8b 0d');
  a.emit(...le32(box + 4));
  emit('83 3d');
  a.emit(...le32(box), 1);
  a.jump('recall', 0x85);
  a.call(0x6f5d90);
  a.jump('groupDone');
  a.label('recall');
  a.call(0x6f5f00);
  emit('8b 0d');
  a.emit(...le32(box + 4));
  a.call(0x6f60d0);
  a.label('groupDone');
  emit('c7 05');
  a.emit(...le32(box), ...le32(0));
  a.label('pan');
  emit('83 3d');
  a.emit(...le32(box + 8), 0);
  a.jump('done', 0x84);
  emit('8b 3d');
  a.emit(...le32(0x83996c));
  emit('85 ff');
  a.jump('done', 0x84);
  // Camera centers are in projected pixels. Native clamp and redraw preserve map bounds and visibility.
  emit('8b 87 64 0d 00 00 03 05');
  a.emit(...le32(box + 12));
  emit('a3');
  a.emit(...le32(box + 24));
  emit('8b 87 68 0d 00 00 03 05');
  a.emit(...le32(box + 16));
  emit('a3');
  a.emit(...le32(box + 28));
  for (const offset of [8, 12, 16]) {
    emit('c7 05');
    a.emit(...le32(box + offset), ...le32(0));
  }
  a.emit(0x68, ...le32(box + 24));
  emit('8b cf');
  a.call(0x6a8c80);
  emit('a1');
  a.emit(...le32(box + 24));
  emit('89 87 64 0d 00 00 89 87 74 0d 00 00');
  emit('a1');
  a.emit(...le32(box + 28));
  emit('89 87 68 0d 00 00 89 87 78 0d 00 00 8b cf');
  a.call(0x6a9170);
  emit('c6 87 7d 0d 00 00 01');
  a.label('done');
  emit('61 9d');
  const code = a.finish();
  memory.write_memory([...code, 0xe9, ...le32(previous - (at + code.length + 5))], at);
  memory.write_memory([0xe9, ...le32(at - site - 5)], site);
  return {
    pending: () => !!readU32(memory, box),
    group(id: number, save: boolean) {
      if (!Number.isInteger(id) || id < 1 || id > 5) throw new Error('无效编组');
      if (readU32(memory, box)) throw new Error('上一条编组命令仍在执行');
      writeU32(memory, box + 4, id);
      writeU32(memory, box, save ? 1 : 2);
    },
    pan(dx: number, dy: number) {
      if (![dx, dy].every((v) => Number.isFinite(v) && Math.abs(v) <= 4096)) throw new Error('无效地图位移');
      writeU32(memory, box + 12, (readU32(memory, box + 12) | 0) + Math.round(dx));
      writeU32(memory, box + 16, (readU32(memory, box + 16) | 0) + Math.round(dy));
      writeU32(memory, box + 8, 1);
    },
  };
}
