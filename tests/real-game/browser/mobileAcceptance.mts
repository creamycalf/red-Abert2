if (process.env.MOBILE_SCENARIO === 'skirmish') {
  await import('./mobileInteractionAcceptance.mjs');
  process.exit(0);
}
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const output = resolve('../../.toolchain/mobile-084-acceptance');
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
  const before = await control('observe');
  console.log('BATTLE', JSON.stringify(before));
  await page.waitForTimeout(3000);
  assert((await control('observe')).frame > before.frame, 'Simulation must advance');
  await page.screenshot({ path: join(output, `${scenario}-battle.png`) });
  if (scenario === 'skirmish') {
    const observation = await control('observe');
    const mcv = observation.entities.find((e: any) => e.owner === observation.player && /MCV$/.test(e.type));
    assert(mcv, 'Starting MCV exists');
    await point(mcv.screen.x, mcv.screen.y);
    await wait('touch selects MCV', async () => (await control('mobile.observe')).selected > 0);
    await page.getByRole('button', { name: '部署', exact: true }).tap();
    await wait('touch deploys construction yard', async () =>
      (await control('observe')).entities.some((e: any) => e.owner === observation.player && /CNST$/.test(e.type)),
    );
    await page.waitForTimeout(2000);
    console.log('DEPLOYED', JSON.stringify(await control('observe')));
    await page.screenshot({ path: join(output, 'skirmish-deployed.png') });
    await page.getByRole('button', { name: '手机菜单', exact: true }).tap();
    const menu = (await page.locator('.mobile-panel').boundingBox())!;
    const menuCanvas = (await page.locator('#screen').boundingBox())!;
    assert(
      menu.x < 50 && menu.x + menu.width < menuCanvas.x + (menuCanvas.width * 1168) / 1336,
      'Left menu must not overlap the right sidebar',
    );
    const sidebarHit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, {
      x: menuCanvas.x + (1234 * menuCanvas.width) / 1336,
      y: menuCanvas.y + (250 * menuCanvas.height) / 600,
    });
    assert.equal(sidebarHit, 'screen', 'The uncovered sidebar must receive touch instead of an invisible backdrop');
    await page.screenshot({ path: join(output, 'left-menu-sidebar-visible.png') });
    await point(1234, 250);
    await wait('same sidebar tap closes phone menu', async () => (await page.locator('.mobile-panel').count()) === 0);
    await wait('native sidebar starts power plant', async () =>
      (await control('observe')).production.some((e: any) => /POWR$/.test(e.type)),
    );
    await page.getByRole('button', { name: '手机菜单', exact: true }).tap();
    await page.getByRole('button', { name: '修改器', exact: true }).tap();
    await page.getByRole('button', { name: '瞬间建造', exact: true }).tap();
    await page.getByRole('button', { name: '返回游戏', exact: true }).tap();
    await wait('accelerated native production completes', async () =>
      (await control('observe')).production.some((e: any) => /POWR$/.test(e.type) && e.progress === 54),
    );
    const ready = await control('observe');
    assert(ready.cash < 10000, 'Native production still deducts its real price');
    const yard = ready.entities.find((e: any) => e.owner === ready.player && /CNST$/.test(e.type));
    await point(1234, 250);
    await wait('ready cameo enters placement', async () => (await control('mobile.observe')).placing);
    await wait('placement hides selection actions', async () => (await page.locator('.mobile-actions').count()) === 0);
    await point(yard.screen.x, yard.screen.y);
    await page.waitForTimeout(700);
    assert(
      !(await control('observe')).entities.some((e: any) => /POWR$/.test(e.type) && e.owner === ready.player),
      'Occupied foundation must reject touch placement',
    );
    let placed = false;
    for (const [dx, dy] of [
      [150, 75],
      [-150, 75],
      [0, 120],
      [150, 0],
      [-150, 0],
      [90, 45],
      [-90, -45],
    ]) {
      await point(yard.screen.x + dx!, yard.screen.y + dy!);
      await page.waitForTimeout(1000);
      if ((await control('observe')).entities.some((e: any) => /POWR$/.test(e.type) && e.owner === ready.player)) {
        placed = true;
        break;
      }
    }
    assert(placed, 'A real touch on an available foundation must place the power plant');
    console.log('PASS touch placement rejects occupied ground and builds power plant');
    const built = await control('observe');
    const power = built.entities.find((e: any) => /POWR$/.test(e.type) && e.owner === built.player);
    await point(power.screen.x, power.screen.y);
    await wait('select built power plant', async () =>
      (await control('mobile.selection')).some((e: any) => e.kind === 'building'),
    );
    await page.getByRole('button', { name: '手机菜单', exact: true }).tap();
    await page.getByRole('button', { name: '修改器', exact: true }).tap();
    await page.getByText('所选单位与建筑', { exact: true }).tap();
    await page.getByRole('button', { name: '建筑耐久 3×', exact: true }).tap();
    await wait('building durability changed', async () =>
      (await control('mobile.selection')).some((e: any) => e.health === power.health * 3),
    );
    await page.getByRole('checkbox', { name: /全科技/ }).tap();
    await wait('cross faction tech enabled', async () => !!(await control('mobile.observe')).allTech);
    await wait('Soviet buildings in Allied sidebar', async () =>
      (await control('observe')).sidebar.some((e: any) => e.type === 'NAWEAP'),
    );
    console.log('TECH', JSON.stringify(await control('observe')));
    await page.getByRole('button', { name: '返回游戏', exact: true }).tap();
    const tank = (await control('observe')).entities.find((e: any) => e.type === 'MTNK' && e.owner === built.player);
    await point(tank.screen.x, tank.screen.y);
    await wait('select tank', async () => (await control('mobile.selection')).some((e: any) => e.kind === 'vehicle'));
    await page.getByRole('button', { name: '手机菜单', exact: true }).tap();
    await page.getByRole('button', { name: '修改器', exact: true }).tap();
    await page.getByRole('checkbox', { name: /我军自动满级/ }).tap();
    await wait('native RA2 double veterancy becomes elite', async () =>
      (await control('mobile.selection')).some((e: any) => e.veterancy === 2),
    );
    await page.getByRole('button', { name: '返回游戏', exact: true }).tap();
    await page.getByRole('button', { name: '同类', exact: true }).tap();
    await wait('select same type', async () => (await control('mobile.observe')).selected >= 2);
    const count = (await control('mobile.observe')).selected;
    await page.getByRole('button', { name: '编组', exact: true }).tap();
    const group = (await page.locator('.mobile-groups button').first().boundingBox())!;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: group.x + group.width / 2, y: group.y + group.height / 2, id: 1 }],
    });
    await page.waitForTimeout(650);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.getByRole('button', { name: '取消', exact: true }).tap();
    await wait('clear selection', async () => (await control('mobile.observe')).selected === 0);
    await page.getByRole('button', { name: '编组', exact: true }).tap();
    await page.locator('.mobile-groups button').first().tap();
    await wait('touch recalls saved native group', async () => (await control('mobile.observe')).selected === count);
    await page.getByRole('button', { name: '取消', exact: true }).tap();
    const canvas = (await page.locator('#screen').boundingBox())!;
    const touch = (x: number, y: number, id = 1) => ({
      x: canvas.x + (x * canvas.width) / 1336,
      y: canvas.y + (y * canvas.height) / 600,
      id,
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(300, 50)] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [touch(300 + 50 * i, 50 + 27 * i)],
      });
      await page.waitForTimeout(40);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait('single finger box selects troops', async () => (await control('mobile.observe')).selected >= 2);
    await page.getByRole('button', { name: '手机菜单', exact: true }).tap();
    await page.getByRole('button', { name: '移动攻击', exact: true }).tap();
    await wait('attack move touch mode active', async () =>
      (await page.locator('.mobile-cancel').innerText()).includes('移动攻击'),
    );
    await point(850, 400);
    await wait(
      'attack move mode releases after destination',
      async () => (await page.locator('.mobile-cancel').count()) === 0,
    );
    const viewport = (await control('observe')).viewport;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touch(500, 300), touch(600, 300, 2)],
    });
    for (let i = 1; i <= 15; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [touch(500 + i * 12, 300 + i * 4), touch(600 + i * 12, 300 + i * 4, 2)],
      });
      await page.waitForTimeout(50);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait('two finger drag moves native map', async () => {
      const next = (await control('observe')).viewport;
      console.log('PAN', JSON.stringify({ before: viewport, after: next }));
      return next.x < viewport.x && next.y < viewport.y;
    });
    await page.getByRole('button', { name: '手机菜单', exact: true }).tap();
    await page.getByRole('button', { name: '回到基地', exact: true }).tap();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(output, 'skirmish-building.png') });
  }
  await page.getByRole('button', { name: '手机菜单', exact: true }).tap();
  await page.getByRole('button', { name: '修改器', exact: true }).tap();
  await page.getByRole('button', { name: '设置金钱', exact: true }).tap();
  await page.screenshot({ path: join(output, `${scenario}-trainer.png`) });
  await wait('money applied', async () => (await control('mobile.observe')).cash === 100000);
  await page.getByRole('button', { name: '作战', exact: true }).tap();
  await page.getByRole('button', { name: '原版菜单 / 保存 / 读取' }).tap();
  await button('GUI:SaveGame');
  await button('GUI:Save');
  await button('GUI:OK');
  console.log('SAVE UI', JSON.stringify(await control('ui.status')));
  await button('GUI:ResumeMission');
  await wait('save dialog closes', async () => (await control('ui.status'))?.battlefield?.ready);
  const saved = await control('observe');
  await page.evaluate(async () => {
    const modulePath = '/src/ui/pages/game/mobileState.ts';
    const { mobileVm } = await import(modulePath);
    await mobileVm.getSnapshot()!.flushFiles();
  });
  await page.reload();
  await button('GUI:SinglePlayer');
  await button('GUI:LoadSavedGame');
  await wait('save list', async () =>
    (await control('ui.status'))?.controls?.some((e: any) => e.className === 'ListBox' && e.items.length),
  );
  const list = (await control('ui.status')).controls.find((e: any) => e.className === 'ListBox' && e.items.length);
  await point(list.rect.x + 20, list.rect.y + 10);
  await button('GUI:Load');
  await wait('cold browser load', async () => (await control('ui.status'))?.battlefield?.ready, 240000);
  const restored = await control('observe');
  assert(
    restored.cash >= saved.cash - 500 && restored.cash <= saved.cash + 500,
    'Saved money must survive page/VM destruction, allowing native production costs between samples',
  );
  assert(restored.frame <= saved.frame + 200, 'Load must restore saved simulation');
  const loadedFrame = restored.frame;
  await wait('loaded simulation advances', async () => (await control('observe')).frame > loadedFrame + 30);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('MOBILE ACCEPTANCE PASSED', scenario);
} catch (error) {
  console.log('ERROR', String(error));
  console.log('FAIL STATUS', await control('ui.status').catch(String));
  console.log('BODY', await page.locator('body').innerText());
  await page.screenshot({ path: join(output, 'failure.png') });
  throw error;
} finally {
  await browser.close();
}
