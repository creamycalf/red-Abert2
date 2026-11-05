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

const soviet = process.env.MOBILE_FACTION === 'soviet';
async function tapUi(name: string) {
  const target = page.getByRole('button', { name, exact: true });
  if (!(await target.isVisible())) {
    if (/^第[1-5]队$/.test(name) || name === '设置编组')
      await page.getByRole('button', { name: '编组', exact: true }).tap();
    else if (['部署', '停止', '同类', '取消', '放大地图', '缩小地图', '恢复地图缩放'].includes(name))
      await page.getByRole('button', { name: '操作', exact: true }).tap();
  }
  await target.tap();
  if (/^第[1-5]队$/.test(name)) await page.locator('.mobile-groups').waitFor({ state: 'hidden', timeout: 5000 });
}
try {
  await page.goto('http://127.0.0.1:15175/?mobile=1&bundled=1&debug=1&mouse-lock=0');
  await button('GUI:SinglePlayer');
  await button('GUI:Skirmish');
  await wait('setup', async () => !!(await control('ui.status'))?.controls?.find((c: any) => c.id === 1697));
  await page.waitForTimeout(2000);
  await tapUi('打开我方国家选择');
  await page.screenshot({ path: join(output, 'country-picker.png') });
  await tapUi(soviet ? '伊拉克' : '美国');
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
  await tapUi('部署');
  await wait('deploy MCV', async () =>
    (await control('observe')).entities.some((e: any) => e.owner === state.player && /CNST$/.test(e.type)),
  );
  await page.waitForTimeout(1000);
  const snapshot = await control('observe');
  await control('command', {
    sessionId: snapshot.sessionId,
    observedFrame: snapshot.frame,
    commandId: 'start-power-test',
    action: 'produce',
    type: 'GAPOWR',
  });
  await wait('active power plant', async () =>
    (await control('observe')).production.some((p: any) => p.type === 'GAPOWR'),
  );
  await tapUi('撤回建造');
  await page.screenshot({ path: join(output, 'production-queue.png') });
  await page.getByRole('button', { name: '撤回 盟军发电厂', exact: true }).tap();
  await wait(
    'power plant removed from native queue',
    async () => !(await control('observe')).production.some((p: any) => p.type === 'GAPOWR'),
    15000,
  );
  await tapUi('手机菜单');
  const panel = page.locator('.native-menu-list');
  const large = (name: string) => panel.getByRole('button', { name, exact: true }).tap();
  const has = (text: string) => wait(text, async () => (await control('ui.layout')).some((c: any) => c.text === text));
  await page.screenshot({ path: join(output, 'mission-shortcuts.png') });
  await tapUi('保存进度');
  await has('GUI:Save');
  await large('保存');
  await has('GUI:OK');
  await large('确定');
  await has('GUI:ResumeMission');
  await large('继续作战');
  await wait('battle resumes after save', async () => (await control('ui.status')).battlefield?.ready);
  await tapUi('手机菜单');
  await tapUi('读取存档');
  await has('GUI:Load');
  console.log(
    'LOAD-LIST',
    JSON.stringify((await control('ui.layout')).filter((c: any) => c.className === 'ListBox').map((c: any) => c.items)),
  );
  const backToBattle = async () => {
    await large('返回');
    await has('GUI:ResumeMission');
    await large('继续作战');
    await wait('battle resumed', async () => (await control('ui.status')).battlefield?.ready);
    await panel.waitFor({ state: 'hidden' });
  };
  await backToBattle();
  await tapUi('手机菜单');
  await tapUi('删除存档');
  await has('GUI:Delete');
  await backToBattle();
  await tapUi('手机菜单');
  await tapUi('放弃任务');
  await wait('native abort submenu', async () => {
    const cs = await control('ui.layout');
    return cs.some((c: any) => c.id !== 0) && !cs.some((c: any) => c.text === 'GUI:SaveGame');
  });
  console.log('ABORT-DIALOG', JSON.stringify(await control('ui.layout')));
  await page.waitForTimeout(400);
  await panel.getByRole('button', { name: '确认放弃任务' }).waitFor();
  await page.screenshot({ path: join(output, 'abort-dialog.png') });
  await large('继续作战');
  await wait(
    'abort cancelled safely',
    async () =>
      (await control('ui.status')).battlefield?.ready &&
      !(await control('ui.layout')).some((c: any) => c.text === 'GUI:AskAbortMission'),
  );
} catch (error) {
  await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
