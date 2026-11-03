import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const output = resolve('../../.toolchain/mobile-088-acceptance');
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

const soviet = process.env.MOBILE_FACTION === 'soviet';
const cdp = await context.newCDPSession(page);
async function saveGroup(label: string) {
  await page.getByRole('button', { name: '保存编组', exact: true }).tap();
  await page.getByRole('button', { name: label, exact: true }).tap();
}

try {
  await page.goto('http://127.0.0.1:15175/?mobile=1&bundled=1&debug=1&mouse-lock=0');
  await button('GUI:SinglePlayer');
  await button('GUI:Skirmish');
  await wait('setup', async () => !!(await control('ui.status'))?.controls?.find((c: any) => c.id === 1697));
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: '打开我方国家选择', exact: true }).tap();
  await page.screenshot({ path: join(output, 'country-picker.png') });
  await page.getByRole('button', { name: soviet ? '伊拉克' : '美国', exact: true }).tap();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(output, 'country-selected.png') });
  console.log(
    'COUNTRY',
    (await control('ui.layout')).filter((e: any) => e.id === 1697).map((e: any) => e.selection),
  );
  await wait(
    'country selection readback',
    async () => (await control('ui.layout')).find((c: any) => c.id === 1697)?.selection === (soviet ? 7 : 1),
  );
  await button('GUI:StartGame');
  await wait('battle ready', async () => !!(await control('ui.status'))?.battlefield?.ready, 240000);
  await page.waitForTimeout(2000);
  console.log('MOBILE', JSON.stringify(await control('mobile.observe')));
  let state = await control('observe');
  console.log(
    'BATTLE',
    state.frame,
    state.entities.map((e: any) => e.type),
  );
  await page.screenshot({ path: join(output, 'battle-default.png') });
  const tanks = state.entities.filter((e: any) => e.owner === state.player && e.type === (soviet ? 'HTNK' : 'MTNK'));
  assert(tanks.length >= 2, 'Two tanks matching the chosen faction are required');
  assert(
    state.entities.some((e: any) => e.owner === state.player && e.type === (soviet ? 'SMCV' : 'AMCV')),
    'Native faction must match the selected country',
  );
  assert((await control('mobile.observe')).inputSupported, 'Native input signatures accepted');
  const mcv = state.entities.find((e: any) => e.owner === state.player && /MCV$/.test(e.type));
  await point(mcv.screen.x, mcv.screen.y);
  await wait('select MCV', async () => (await control('mobile.selection')).some((e: any) => String(e.id) === mcv.id));
  await page.getByRole('button', { name: '部署', exact: true }).tap();
  await wait('deploy MCV', async () =>
    (await control('observe')).entities.some((e: any) => e.owner === state.player && /CNST$/.test(e.type)),
  );
  await page.waitForTimeout(1000);
  for (let i = 0; i < 2; i++) {
    state = await control('observe');
    const tank = state.entities.find((e: any) => e.id === tanks[i].id);
    await point(tank.screen.x, tank.screen.y);
    await wait(`select tank ${i + 1}`, async () =>
      (await control('mobile.selection')).some((e: any) => String(e.id) === tank.id),
    );
    if (i === 0) await page.getByRole('button', { name: '编组', exact: true }).tap();
    await saveGroup(`第${i + 1}队`);
    await wait(
      `save group ${i + 1}`,
      async () => (await control('mobile.selection')).some((e: any) => String(e.id) === tank.id && e.group === i + 1),
      15000,
    );
  }
  for (const i of [1, 2, 1]) {
    await page.getByRole('button', { name: `第${i}队`, exact: true }).tap();
    await wait(
      `recall group ${i}`,
      async () => {
        const s = await control('mobile.selection');
        return s.length === 1 && String(s[0].id) === tanks[i - 1].id;
      },
      15000,
    );
  }
  await page.screenshot({ path: join(output, 'two-groups.png') });
  state = await control('observe');
  const before = state.entities.find((e: any) => e.id === tanks[0].id);
  await point(before.screen.x + 180, before.screen.y + 90);
  await wait(
    'group one follows movement order',
    async () => {
      const s = (await control('observe')).entities.find((e: any) => e.id === before.id);
      return s.cell.x !== before.cell.x || s.cell.y !== before.cell.y;
    },
    15000,
  );
  const selection = (await control('mobile.selection')).map((e: any) => e.id);
  const cameraBefore = (await control('observe')).viewport;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 330, y: 150, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 350, y: 150, id: 1 }] });
  await page.waitForTimeout(180);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 350, y: 150, id: 1 },
      { x: 450, y: 150, id: 2 },
    ],
  });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 350 + i * 8, y: 150 + i * 3, id: 1 },
        { x: 450 + i * 8, y: 150 + i * 3, id: 2 },
      ],
    });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(700);
  const cameraAfter = (await control('observe')).viewport;
  assert(cameraAfter.x < cameraBefore.x && cameraAfter.y < cameraBefore.y, 'Map follows finger direction');
  console.log('PASS pan follows fingers', cameraBefore, cameraAfter);
  assert.deepEqual(
    (await control('mobile.selection')).map((e: any) => e.id),
    selection,
    'Two-finger map drag preserves selected group',
  );
  await page.getByRole('button', { name: '第1队', exact: true }).tap();
  await page.waitForTimeout(700);
  assert.equal(
    await page.evaluate(async () => {
      const p = '/src/ui/pages/game/mobileState.ts';
      return (await import(p)).mobileZoom.getSnapshot();
    }),
    1,
    'Parallel finger translation must not leave a zoom change',
  );
  await page.getByRole('button', { name: '放大地图', exact: true }).tap();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(output, 'map-zoom-in.png') });
  state = await control('observe');
  const second = state.entities.find((e: any) => e.id === tanks[1].id);
  await point(second.screen.x, second.screen.y);
  await wait(
    'zoomed touch selects matching native tank',
    async () => (await control('mobile.selection')).some((e: any) => String(e.id) === second.id),
    15000,
  );
  await page.getByRole('button', { name: '缩小地图', exact: true }).tap();
  await page.getByRole('button', { name: '缩小地图', exact: true }).tap();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(output, 'map-zoom-out.png') });

  const zoomBefore = await page.evaluate(async () => {
    const p = '/src/ui/pages/game/mobileState.ts';
    return (await import(p)).mobileZoom.getSnapshot();
  });
  const keep = (await control('mobile.selection')).map((e: any) => e.id);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 370, y: 160, id: 1 },
      { x: 470, y: 160, id: 2 },
    ],
  });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 370 - i * 6, y: 160, id: 1 },
        { x: 470 + i * 6, y: 160, id: 2 },
      ],
    });
    await page.waitForTimeout(40);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  const zoomAfter = await page.evaluate(async () => {
    const p = '/src/ui/pages/game/mobileState.ts';
    return (await import(p)).mobileZoom.getSnapshot();
  });
  assert(zoomAfter > zoomBefore, 'Pinch must change map zoom');
  assert.deepEqual(
    (await control('mobile.selection')).map((e: any) => e.id),
    keep,
    'Pinch preserves selection',
  );
  await page.getByRole('button', { name: '恢复地图缩放', exact: true }).tap();
  await page.getByRole('button', { name: '移图', exact: true }).tap();
  const panBefore = (await control('observe')).viewport;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 390, y: 160, id: 1 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 390 + i * 7, y: 160, id: 1 }] });
    await page.waitForTimeout(35);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  assert((await control('observe')).viewport.x < panBefore.x, 'One-finger pan moves native camera');
  assert.deepEqual(
    (await control('mobile.selection')).map((e: any) => e.id),
    keep,
    'One-finger pan preserves selection',
  );
  await page.getByRole('button', { name: '移图', exact: true }).tap();
  console.log('PASS pinch and one-finger navigation preserve selected troops');
  await page.getByRole('button', { name: '第1队', exact: true }).tap();
  await page.waitForTimeout(500);
  state = await control('observe');
  await page.waitForTimeout(1500);
  assert.equal(await page.getByRole('button', { name: '框选', exact: true }).count(), 0, 'No box-select mode button');
  const boxTank = (await control('observe')).entities.find((e: any) => e.id === tanks[0].id);
  const bounds = await page.evaluate(async ({ x, y }) => {
    const path = '/src/ui/pages/game/mobileViewport.ts';
    const { mobilePoint } = await import(path);
    const canvas = document.querySelector('#screen')!;
    const box = canvas.getBoundingClientRect();
    const [w, h] = canvas.getAttribute('data-vm-resolution')!.split('x').map(Number);
    return [-45, 45].map((d) => {
      const p = mobilePoint(x + d, y + d, w!, h!, box.width / box.height, true);
      return { x: box.x + (p.x * box.width) / w!, y: box.y + (p.y * box.height) / h! };
    });
  }, boxTank.screen);
  const beforeCancel = (await control('mobile.selection')).map((e: any) => e.id);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...bounds[0], id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...bounds[1], id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForTimeout(300);
  assert.deepEqual(
    (await control('mobile.selection')).map((e: any) => e.id),
    beforeCancel,
    'Cancelled pending rectangle must not issue a click or change selection',
  );
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...bounds[0], id: 1 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: bounds[0]!.x + ((bounds[1]!.x - bounds[0]!.x) * i) / 10,
          y: bounds[0]!.y + ((bounds[1]!.y - bounds[0]!.y) * i) / 10,
          id: 1,
        },
      ],
    });
    await page.waitForTimeout(process.env.MOBILE_QUICK_BOX === '1' ? 5 : 35);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(
    'direct single-finger box select includes tank without switching modes',
    async () =>
      (await control('mobile.selection')).some((e: any) => String(e.id) === boxTank.id) &&
      (await page.getByRole('button', { name: '移图', exact: true }).getAttribute('aria-pressed')) === 'false',
  );
  await page.getByRole('button', { name: '第1队', exact: true }).tap();
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: '放大建造', exact: true }).tap();
  const sidebarMapBefore = (await control('observe')).viewport;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 820, y: 200, id: 1 },
      { x: 920, y: 200, id: 2 },
    ],
  });
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 820 - i * 4, y: 200, id: 1 },
        { x: 920 + i * 4, y: 200, id: 2 },
      ],
    });
    await page.waitForTimeout(40);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
  const sidebarZoom = await page.evaluate(async () => {
    const p = '/src/ui/pages/game/mobileState.ts';
    return (await import(p)).mobileSidebarZoom.getSnapshot();
  });
  assert(sidebarZoom > 1.5, 'Pinch enlarges the sidebar');
  assert.deepEqual((await control('observe')).viewport, sidebarMapBefore, 'Sidebar pinch must not move map');
  await page.getByRole('button', { name: '恢复建造栏缩放', exact: true }).tap();
  console.log('PASS independent sidebar pinch without map movement');

  await page.getByRole('button', { name: '放大建造栏', exact: true }).tap();
  await page.getByRole('button', { name: '缩小建造栏', exact: true }).tap();
  await page.getByRole('button', { name: '手机菜单', exact: true }).tap();
  await page.screenshot({ path: join(output, 'menu-sidebar-accessible.png') });
  const resolution = (await page.locator('#screen').getAttribute('data-vm-resolution'))!.split('x').map(Number);
  await point(resolution[0]! - 102, 250);
  await wait(
    'sidebar touch starts power plant and dismisses menu',
    async () =>
      (await page.locator('.mobile-panel').count()) === 0 &&
      (await control('observe')).production.some((e: any) => /POWR$/.test(e.type)),
  );
  await control('mobile.trainer', { speed: 100 });
  await wait('power ready', async () =>
    (await control('observe')).production.some((e: any) => /POWR$/.test(e.type) && e.progress === 54),
  );
  await page.getByRole('button', { name: '放大地图', exact: true }).tap();
  await point(resolution[0]! - 102, 250);
  await wait('placing', async () => (await control('mobile.observe')).placing);
  await wait(
    'expanded sidebar closes for placement',
    async () => (await page.locator('.mobile-sidebar-tools').count()) === 0,
  );
  const yard = (await control('observe')).entities.find((e: any) => e.owner === state.player && /CNST$/.test(e.type));
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
    await page.waitForTimeout(600);
    if ((await control('observe')).entities.some((e: any) => e.owner === state.player && /POWR$/.test(e.type))) {
      placed = true;
      break;
    }
  }
  assert(placed, 'Touch placement at zoom must create a real power plant');
  await page.screenshot({ path: join(output, 'zoomed-construction.png') });
  for (const id of [1, 2])
    assert(
      (await control('mobile.observe')).groups.find((g: any) => g.id === id).count === 1,
      'Construction preserves native group',
    );
  console.log('PASS zoomed production and placement, persistent groups');
  await page.getByRole('button', { name: '手机菜单', exact: true }).tap();
  await page.getByRole('button', { name: '原版菜单 / 保存 / 读取' }).tap();
  await button('GUI:SaveGame');
  await button('GUI:Save');
  await button('GUI:OK');
  await button('GUI:ResumeMission');
  await wait('saved', async () => !!(await control('ui.status'))?.battlefield?.ready);
  await page.evaluate(async () => {
    const p = '/src/ui/pages/game/mobileState.ts';
    await (await import(p)).mobileVm.getSnapshot().flushFiles();
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
  await wait('cold load', async () => !!(await control('ui.status'))?.battlefield?.ready, 240000);
  await page.waitForTimeout(1500);
  for (const id of [1, 2]) {
    await page.getByRole('button', { name: `第${id}队`, exact: true }).tap();
    await wait(
      `restored group ${id}`,
      async () => {
        const s = await control('mobile.selection');
        return s.length === 1 && s[0].group === id;
      },
      15000,
    );
  }
  console.log('PASS native save restores both groups after destroying VM');
  assert.deepEqual(errors, []);
  console.log('PASS mobile native groups, orders, panning and zoomed selection');
} catch (error) {
  await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
