import { expect, it } from 'vitest';
import { mapRegionPoint, type PresentationRegion } from '../../src/graphics/regionPresentation';
import { createMobileInput, mobileInputEvidence } from '../../src/games/ra2/mobileInput';
import { createGuestMemory } from '../helpers/guestMemory';
it('maps split-screen input through the matching region and reverses the transform', () => {
  const regions: PresentationRegion[] = [
    { source: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 }, target: { x: 0, y: 0, width: 0.85, height: 1 } },
    { source: { x: 0.9, y: 0, width: 0.1, height: 1 }, target: { x: 0.85, y: 0, width: 0.15, height: 1 } },
  ];
  for (const [x, y] of [
    [0.1, 0.1],
    [0.5, 0.5],
    [0.84, 0.99],
    [0.9, 0.2],
    [1, 1],
  ]) {
    const p = mapRegionPoint(x!, y!, regions),
      r = mapRegionPoint(p.x, p.y, regions, true);
    expect(r.x).toBeCloseTo(x!);
    expect(r.y).toBeCloseTo(y!);
  }
  expect(mapRegionPoint(0.4, 0.6, [])).toEqual({ x: 0.4, y: 0.6 });
});
it('rejects unsupported native input signatures without allocating or patching', () => {
  const memory = createGuestMemory();
  for (const s of mobileInputEvidence) memory.write_memory([...s.bytes], s.address);
  memory.write_memory([0], mobileInputEvidence[3].address);
  expect(
    createMobileInput(memory, () => {
      throw new Error('must not allocate');
    }),
  ).toBeNull();
});
