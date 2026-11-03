import { SessionGameFileProvider } from './sessionFiles';
import { normalizeGuestPath } from '../../../vm86/paths';

/** Read the private APK installation lazily; mutable saves always use the committed IndexedDB overlay. */
export class BundledGameFiles extends SessionGameFileProvider {
  private entries: Map<string, { name: string; size: number }>;
  constructor(entries: Array<{ name: string; size: number }>) {
    super('手机内置安装', new Map());
    this.entries = new Map(entries.map((entry) => [normalizeGuestPath(entry.name), entry]));
  }
  override hasKnownFile(path: string): boolean | null {
    return this.entries.has(normalizeGuestPath(path)) || super.hasKnownFile(path);
  }
  private async asset(path: string, offset?: number, length?: number): Promise<Uint8Array | null> {
    const entry = this.entries.get(normalizeGuestPath(path));
    if (!entry) return null;
    if (entry.size === 0 || length === 0 || (offset !== undefined && offset >= entry.size)) return new Uint8Array();
    const response = await fetch(`/installation/${encodeURIComponent(entry.name)}`, {
      headers: offset === undefined ? {} : { Range: `bytes=${offset}-${offset + (length ?? entry.size) - 1}` },
    });
    if (!response.ok) throw new Error(`无法读取内置资源 ${entry.name}: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (offset !== undefined && response.status !== 206) return bytes.slice(offset, offset + length!);
    return bytes;
  }
  override async read(path: string) {
    return (await super.read(path)) ?? this.asset(path);
  }
  override async readPrefix(path: string, maxBytes: number) {
    const saved = await super.read(path);
    if (saved) return { bytes: saved.slice(0, maxBytes), totalSize: saved.length };
    const entry = this.entries.get(normalizeGuestPath(path));
    if (!entry) return null;
    return { bytes: (await this.asset(path, 0, Math.min(maxBytes, entry.size)))!, totalSize: entry.size };
  }
  override async readRange(path: string, offset: number, length: number) {
    const saved = await super.read(path);
    return saved ? saved.slice(offset, offset + length) : this.asset(path, offset, length);
  }
  override async list(directory: string) {
    const saved = (await super.list(directory)) ?? [];
    return normalizeGuestPath(directory) ? saved : [...new Set([...saved, ...this.entries.keys()])];
  }
}
