import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const output = resolve('../../.toolchain/mobile-082-acceptance');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  locale: 'zh-CN',
  hasTouch: true,
  viewport: { width: 1000, height: 450 },
});
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => {
  errors.push(String(e));
  console.log('PAGEERROR', String(e));
});
page.on('console', (e) => {
  if (e.type() === 'error') console.log('CONSOLE', e.text());
});
async function control(method: string, params?: unknown): Promise<any> {
  return page.evaluate(
    async ({ method, params }) => {
      const modulePath = '/src/ui/pages/game/mobileState.ts';
      const { mobileVm } = await import(modulePath);
      const vm = mobileVm.getSnapshot();
      const result = await vm?.gameControl(method, params);
      return method === 'ui.status' && result ? { ...result, controls: await vm.gameControl('ui.layout') } : result;
    },
    { method, params },
  );
}
async function wait(label: string, check: () => Promise<boolean>, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) {
      console.log('PASS', label, Date.now() - start);
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Timeout ${label}: ${JSON.stringify(await control('ui.status'))}`);
}
async function point(x: number, y: number) {
  const box = (await page.locator('#screen').boundingBox())!;
  const resolution = ((await page.locator('#screen').getAttribute('data-vm-resolution')) ?? '800x600')
    .split('x')
    .map(Number);
  await page.touchscreen.tap(box.x + (x * box.width) / resolution[0]!, box.y + (y * box.height) / resolution[1]!);
}
async function button(text: string) {
  await wait(text, async () => (await control('ui.status'))?.controls?.some((e: any) => e.text === text));
  await page.waitForTimeout(2500);
  const mobileChoice = page.locator(`[data-native-action="${text}"]`);
  if (await mobileChoice.isVisible()) {
    await mobileChoice.tap();
    return;
  }
  const c = (await control('ui.status')).controls.find((e: any) => e.text === text);
  assert(c.rect, 'Native control rect is required');
  await point(c.rect.x + c.rect.width / 2, c.rect.y + c.rect.height / 2);
}
const soviet = process.env.MOBILE_FACTION === 'soviet';
let sequence = 0;
async function order(action: string, extra: any = {}) {
  const state = await control('observe');
  const commandId = `trainer-${++sequence}`;
  await control('command', { sessionId: state.sessionId, observedFrame: state.frame, commandId, action, ...extra });
  let result: any;
  await wait(
    `native ${action} ${extra.type ?? ''}`,
    async () => {
      result = await control('commandStatus', { sessionId: state.sessionId, commandId });
      return result.state !== 'pending';
    },
    15000,
  );
  if (action !== 'place') assert.equal(result.state, 'submitted', JSON.stringify(result));
}
async function build(type: string) {
  await wait(`cameo ${type}`, async () => (await control('catalog')).some((e: any) => e.type === type));
  await order('produce', { type });
  await wait(`ready ${type}`, async () =>
    (await control('observe')).production.some((e: any) => e.type === type && e.progress === 54),
  );
  const state = await control('observe');
  const yard = state.entities.find((e: any) => e.owner === state.player && /CNST$/.test(e.type));
  const candidates: number[][] = [];
  for (let x = -8; x <= 9; x++) for (let y = -8; y <= 9; y++) candidates.push([x, y]);
  candidates.sort((a, b) => Math.abs(a[0]!) + Math.abs(a[1]!) - Math.abs(b[0]!) - Math.abs(b[1]!));
  for (const [dx, dy] of candidates) {
    if (Math.abs(dx!) < 2 && Math.abs(dy!) < 2) continue;
    await order('place', { type, cell: { x: yard.cell.x + dx!, y: yard.cell.y + dy! } });
    await page.waitForTimeout(150);
    if ((await control('observe')).entities.some((e: any) => e.owner === state.player && e.type === type)) {
      console.log('PASS BUILT', type);
      return;
    }
  }
  throw new Error(`Could not place ${type}`);
}
try {
  await page.goto('http://127.0.0.1:15175/?mobile=1&bundled=1&debug=1&mouse-lock=0');
  await button('GUI:SinglePlayer');
  await button('GUI:Skirmish');
  await wait('setup', async () => (await control('ui.status'))?.controls?.some((e: any) => e.text === 'GUI:StartGame'));
  await page.waitForTimeout(2000);
  console.log('SETUP', JSON.stringify(await control('ui.status')));
  if (soviet) {
    const combo = (await control('ui.status')).controls.find((e: any) => e.id === 1697);
    await point(combo.rect.x + combo.rect.width - 10, combo.rect.y + 10);
    await page.waitForTimeout(400);
    // The visible native list has Random, USA, Korea, France, Germany, Britain, Libya.
    await point(combo.rect.x + 40, combo.rect.y + 23 + 12 + 6 * 23);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(output, 'soviet-skirmish-menu.png') });
  }
  await button('GUI:StartGame');
  await wait('battle ready', async () => !!(await control('ui.status'))?.battlefield?.ready, 240000);
  await page.waitForTimeout(1500);
  const state = await control('observe');
  const mcv = state.entities.find((e: any) => e.owner === state.player && /MCV$/.test(e.type));
  assert.equal(mcv.type, soviet ? 'SMCV' : 'AMCV', 'Country selection must choose the intended faction');
  await order('deploy', { unit: mcv.id });
  await wait('yard', async () =>
    (await control('observe')).entities.some((e: any) => e.owner === state.player && /CNST$/.test(e.type)),
  );
  await page.waitForTimeout(1500);
  const deployed = await control('observe');
  const yard = deployed.entities.find((e: any) => /CNST$/.test(e.type) && e.owner === deployed.player);
  await order('move', {
    units: deployed.entities
      .filter((e: any) => e.owner === deployed.player && e.kind !== 'building')
      .map((e: any) => e.id),
    cell: { x: yard.cell.x + 9, y: yard.cell.y + 9 },
  });
  await page.waitForTimeout(3500);
  await control('mobile.money', { amount: 100000 });
  await control('mobile.trainer', { allTech: true, autoElite: true, speed: 100 });
  await build(soviet ? 'GAPOWR' : 'NAPOWR');
  await build(soviet ? 'GAPILE' : 'NAHAND');
  await build(soviet ? 'GAWEAP' : 'NAWEAP');
  await build('GAAIRC');
  for (const type of soviet ? ['E1', 'MTNK', 'ORCA'] : ['E2', 'HTNK', 'ORCA']) {
    await wait(`native cross faction cameo ${type}`, async () =>
      (await control('catalog')).some((e: any) => e.type === type),
    );
    const before = await control('observe');
    await order('produce', { type });
    let unit: any;
    await wait(
      `new unit ${type}`,
      async () => {
        const current = await control('observe');
        unit = current.entities.find(
          (e: any) => e.owner === current.player && e.type === type && !before.entities.some((b: any) => b.id === e.id),
        );
        return !!unit;
      },
      60000,
    );
    await point(unit.screen.x, unit.screen.y);
    await wait(`new ${type} elite`, async () =>
      (await control('mobile.selection')).some((e: any) => String(e.id) === unit.id && e.veterancy === 2),
    );
    await page.screenshot({ path: join(output, `${soviet ? 'soviet' : 'allied'}-new-elite-${type}.png`) });
    console.log('PASS NEW ELITE', type, unit.id);
  }
  const cash = (await control('observe')).cash;
  assert(cash < 100000, 'Cross faction production must charge original prices');
  // Measure the same native product before and after enabling acceleration, using actual simulation frames.
  const sampleType = soviet ? 'MTNK' : 'HTNK';
  await control('mobile.trainer', { speed: 1, autoElite: false });
  await order('produce', { type: sampleType });
  const normalStart = await control('observe');
  await wait('normal production sample', async () => (await control('observe')).frame >= normalStart.frame + 75);
  const normal = await control('observe');
  const normalProgress = normal.production.find((e: any) => e.type === sampleType)?.progress ?? 54;
  assert(normalProgress < 54, 'Normal production must still be in progress');
  await control('mobile.trainer', { speed: 10 });
  await wait('accelerated production sample', async () => (await control('observe')).frame >= normal.frame + 75);
  const fast = await control('observe');
  const fastProgress = fast.production.find((e: any) => e.type === sampleType)?.progress ?? 54;
  assert(fastProgress - normalProgress > normalProgress * 2, JSON.stringify({ normalProgress, fastProgress }));
  console.log(
    'PASS ACTUAL ACCELERATION',
    JSON.stringify({
      normalProgress,
      fastProgress,
      normalFrames: normal.frame - normalStart.frame,
      fastFrames: fast.frame - normal.frame,
    }),
  );
  await control('mobile.trainer', { allTech: false, autoElite: false, speed: 1 });
  await wait(
    'native tech restrictions restored',
    async () => !(await control('catalog')).some((e: any) => e.type === (soviet ? 'GATECH' : 'NATECH')),
  );
  assert.deepEqual(errors, []);
  console.log('TRAINER ACCEPTANCE PASSED', soviet ? 'soviet' : 'allied', cash);
} catch (error) {
  console.log('ERROR', String(error));
  console.log('STATE', JSON.stringify(await control('observe').catch(String)));
  await page.screenshot({ path: join(output, 'trainer-failure.png') });
  throw error;
} finally {
  await browser.close();
}
