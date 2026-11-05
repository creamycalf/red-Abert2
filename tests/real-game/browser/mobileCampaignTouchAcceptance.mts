import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const output = resolve('../../.toolchain/mobile-0816-acceptance');
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
  const p = await page.evaluate(
    async ({ x, y, w, h, aspect }) => {
      const path = '/src/ui/pages/game/mobileViewport.ts';
      return (await import(path)).mobilePoint(x, y, w, h, aspect, true);
    },
    { x, y, w: resolution[0]!, h: resolution[1]!, aspect: box.width / box.height },
  );
  await page.touchscreen.tap(box.x + (p.x * box.width) / resolution[0]!, box.y + (p.y * box.height) / resolution[1]!);
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
try {
  await page.goto('http://127.0.0.1:15175/?mobile=1&bundled=1&debug=1&mouse-lock=0');
  await button('GUI:SinglePlayer');
  const scenario = process.env.MOBILE_SCENARIO ?? 'allied';
  if (scenario === 'skirmish') {
    await button('GUI:Skirmish');
    await wait('skirmish setup', async () =>
      (await control('ui.status'))?.controls?.some((e: any) => e.text === 'GUI:StartGame'),
    );
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(output, 'skirmish-menu.png') });
    await button('GUI:StartGame');
  } else {
    await button('GUI:NewCampaign');
    await wait('campaign menu', async () => (await control('ui.status'))?.page?.toLowerCase().includes('campaign'));
    console.log('CAMPAIGN', JSON.stringify(await control('ui.status')));
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(output, 'campaign-menu.png') });
    const campaign = await control('ui.status');
    const badge = campaign.controls.find((e: any) => e.id === (scenario === 'soviet' ? 1772 : 1770));
    if (!badge) throw new Error('Campaign badge missing');
    await point(badge.rect.x + badge.rect.width / 2, badge.rect.y + badge.rect.height / 2);
  }
  await wait('battlefield ready', async () => (await control('ui.status'))?.battlefield?.ready, 240000);

  await page.waitForTimeout(2000);
  await wait(
    'campaign hero appears',
    async () => (await control('observe')).entities.some((e: any) => e.type === 'TANY'),
    90000,
  );
  const cdp = await context.newCDPSession(page);
  async function offset() {
    return page.evaluate(async () => {
      const path = '/src/ui/pages/game/mobileState.ts';
      return (await import(path)).mobileViewOffset.getSnapshot();
    });
  }
  async function drag(dx: number, dy: number, two = true) {
    const points = (n: number) => [
      { x: 450 + dx * n, y: 190 + dy * n, id: 1 },
      ...(two ? [{ x: 550 + dx * n, y: 190 + dy * n, id: 2 }] : []),
    ];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(0) });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(i / 10) });
      await page.waitForTimeout(30);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: '移图', exact: true }).tap();
  await drag(300, 0, false);
  await page.getByRole('button', { name: '移图', exact: true }).tap();
  const before = await control('observe');
  console.log(
    'OWNED',
    JSON.stringify(
      before.entities
        .filter((e: any) => e.owner === before.player)
        .map((e: any) => ({ id: e.id, type: e.type, screen: e.screen })),
    ),
  );
  const hero = before.entities.find((e: any) => e.type === 'TANY');
  assert(hero, 'Campaign player unit exists');
  const bounds = await page.evaluate(async ({ x, y }) => {
    const path = '/src/ui/pages/game/mobileViewport.ts';
    const { mobilePoint } = await import(path);
    const canvas = document.querySelector('#screen')!,
      rect = canvas.getBoundingClientRect();
    const [w, h] = canvas.getAttribute('data-vm-resolution')!.split('x').map(Number);
    const p = mobilePoint(x, y, w!, h!, rect.width / rect.height, true);
    const sx = rect.x + (p.x * rect.width) / w!,
      sy = rect.y + (p.y * rect.height) / h!;
    return [-1, 1].map((d) => ({
      x: Math.max(rect.x + 3, Math.min(rect.right - 3, sx + d * 55)),
      y: Math.max(rect.y + 3, Math.min(rect.bottom - 3, sy + d * 45)),
      id: 1,
    }));
  }, hero.screen);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [bounds[0]!] });
  for (let i = 1; i <= 12; i++) {
    const a = bounds[0]!,
      b = bounds[1]!;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x: a.x + ((b.x - a.x) * i) / 12, y: a.y + ((b.y - a.y) * i) / 12 }],
    });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait('select campaign unit', async () =>
    (await control('mobile.selection')).some((e: any) => String(e.id) === hero.id),
  );
  await page.getByRole('button', { name: '设置编组', exact: true }).tap();
  await page.getByRole('button', { name: '设为第1编组', exact: true }).tap();
  await wait(
    'save collapses group popup',
    async () =>
      (await page.locator('.mobile-groups').count()) === 0 && (await control('mobile.observe')).groups[0].count > 0,
  );
  assert.equal(await page.locator('.mobile-groups').count(), 0);
  await page.getByRole('button', { name: '第1队', exact: true }).tap();
  await wait(
    'recall completes and recenters',
    async () =>
      (await page.getByRole('button', { name: '第1队', exact: true }).isEnabled()) &&
      (await control('mobile.observe')).groups[0].selected,
  );
  await page.waitForTimeout(400);
  const selection = (await control('mobile.selection')).map((e: any) => e.id);
  const start = await offset();
  await drag(-80, 40);
  const end = await offset();
  assert(end.x > start.x && end.y < start.y, 'Campaign displayed crop follows two fingers');
  assert.equal(await page.locator('.mobile-groups').count(), 0, 'Map touch dismisses groups without blocking drag');
  assert.deepEqual(
    (await control('mobile.selection')).map((e: any) => e.id),
    selection,
  );
  await page.screenshot({ path: join(output, 'campaign-pan.png') });
  await page.getByRole('button', { name: '移图', exact: true }).tap();
  const singleBefore = await offset();
  await drag(-70, -30, false);
  const singleAfter = await offset();
  assert(singleAfter.x > singleBefore.x && singleAfter.y > singleBefore.y, 'Campaign one-finger pan works');
  await page.getByRole('button', { name: '移图', exact: true }).tap();
  for (const viewport of [
    { width: 842, height: 430 },
    { width: 800, height: 360 },
    { width: 1000, height: 450 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.mobile-actions button').count(), 12);
    const screen = (await page.locator('#screen').boundingBox())!;
    const dock = (await page.locator('.mobile-actions').boundingBox())!;
    assert(screen.y + screen.height <= dock.y + 1, 'Dock never covers campaign map');
    for (const b of await page.locator('.mobile-actions button').all()) {
      const r = (await b.boundingBox())!;
      assert(r.y + r.height <= viewport.height && r.x + r.width <= viewport.width, 'Controls fit visible screen');
    }
  }
  await page.screenshot({ path: join(output, 'compact-controls.png') });
  await page.getByRole('button', { name: '手机菜单' }).tap();
  await page.getByRole('button', { name: '任务简报', exact: true }).tap();
  await wait('native mission dialog opens', async () => !!(await control('ui.status')).page);
  await page.locator('.native-menu-list').getByRole('button', { name: '返回战场' }).waitFor();
  console.log('MISSION-DIALOG', JSON.stringify(await control('ui.layout')));
  await page.screenshot({ path: join(output, 'command-briefing.png') });
  const touchPanel = page.locator('.native-menu-list');
  await touchPanel.getByRole('button', { name: '返回战场', exact: true }).tap();
  await touchPanel.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '手机菜单', exact: true }).tap();
  await page.getByRole('button', { name: '放弃任务', exact: true }).tap();
  await wait('campaign abort confirmation', async () =>
    (await control('ui.layout')).some((c: any) => c.text === 'GUI:AskAbortMission' || c.text === 'GUI:RestartMission'),
  );
  console.log('CAMPAIGN-ABORT', JSON.stringify(await control('ui.layout')));
  await touchPanel.getByRole('button', { name: '继续作战', exact: true }).tap();
  await touchPanel.waitFor({ state: 'hidden' });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(
    'PASS original campaign selection, save/recall and close groups, canvas dismissal, one/two-finger crop panning, compact controls at three phone sizes',
  );
} finally {
  await browser.close();
}
