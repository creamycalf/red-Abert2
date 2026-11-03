import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

// Serve the actual APK assets over loopback; this test never imports development modules.
const browser = await chromium.launch();
const page = await browser.newPage({ hasTouch: true, viewport: { width: 1000, height: 450 }, locale: 'zh-CN' });
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(String(error)));
const failures: string[] = [];
page.on('response', (response) => {
  if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
});
async function tap(x: number, y: number) {
  const canvas = page.locator('#screen');
  const box = (await canvas.boundingBox())!;
  // Menu coordinates come from the centered 800x600 original template.
  const [width, height] = [1776, 800];
  await page.touchscreen.tap(box.x + (x * box.width) / width!, box.y + (y * box.height) / height!);
}
async function shell(name: string) {
  console.log('Waiting for native page', name);
  await page.waitForFunction(
    (name) => document.querySelector('#screen')?.getAttribute('data-shell-page')?.toLowerCase().includes(name),
    name,
    { timeout: 60000 },
  );
  await page.waitForTimeout(2500);
}
try {
  await page.goto(
    `${process.env.MOBILE_BASE_URL ?? 'http://127.0.0.1:15176'}/?mobile=1&bundled=1&mouse-lock=0&network=0`,
  );
  await page.locator('.mobile-loading').waitFor({ timeout: 20000 });
  await page.screenshot({ path: resolve('../../.toolchain/mobile-084-acceptance/apk-startup-cover.png') });
  await shell('mainmenu');
  await page.screenshot({ path: resolve('../../.toolchain/mobile-084-acceptance/apk-main-menu.png') });
  await page.locator('.mobile-start').waitFor();
  for (const viewport of [
    { width: 1000, height: 450 },
    { width: 1280, height: 720 },
    { width: 800, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    const menu = await page.locator('.mobile-start').boundingBox();
    assert.deepEqual(menu, { x: 0, y: 0, ...viewport });
    const button = (await page.locator('[data-native-action="GUI:SinglePlayer"]').boundingBox())!;
    assert(button.height >= 44 && button.x >= 0 && button.x + button.width <= viewport.width);
    await page.screenshot({
      path: resolve(`../../.toolchain/mobile-084-acceptance/fullscreen-menu-${viewport.width}x${viewport.height}.png`),
    });
  }
  await page.setViewportSize({ width: 1000, height: 450 });
  await page.locator('[data-native-action="GUI:SinglePlayer"]').tap();
  await shell('singleplayer');
  await page.screenshot({ path: resolve('../../.toolchain/mobile-084-acceptance/fullscreen-singleplayer.png') });
  await page.locator('[data-native-action="GUI:MainMenu"]').tap();
  await shell('mainmenu');
  await page.locator('[data-native-action="GUI:SinglePlayer"]').tap();
  await shell('singleplayer');
  await page.locator('[data-native-action="GUI:Skirmish"]').tap();
  await shell('skirmishgame');
  const countryHit = page.getByRole('button', { name: '打开我方国家选择', exact: true });
  const countryBox = (await countryHit.boundingBox())!;
  assert(
    countryBox.x >= 0 &&
      countryBox.x + countryBox.width <= 1000 &&
      countryBox.y >= 0 &&
      countryBox.y + countryBox.height <= 450,
    'Production country overlay must use native frame dimensions without debug data',
  );
  await countryHit.tap();
  await page.getByRole('button', { name: '伊拉克', exact: true }).tap();
  await page.getByRole('button', { name: '我方国家 · 伊拉克', exact: true }).waitFor();
  await page.screenshot({ path: resolve('../../.toolchain/mobile-084-acceptance/apk-country-selection.png') });
  await tap(1210, 656);
  await shell('singleplayer');
  await page.locator('[data-native-action="GUI:NewCampaign"]').tap();
  await shell('campaign');
  await page.screenshot({ path: resolve('../../.toolchain/mobile-084-acceptance/apk-campaign-fullscreen.png') });
  await tap(803, 194);
  await page.locator('.mobile-loading').waitFor({ timeout: 20000 });
  await page.screenshot({ path: resolve('../../.toolchain/mobile-084-acceptance/apk-loading-fullscreen.png') });
  await page.locator('.mobile-actions').waitFor({ timeout: 240000 });
  const before = await page.locator('#screen').screenshot();
  await page.waitForTimeout(4000);
  assert(
    !before.equals(await page.locator('#screen').screenshot()),
    'The original battlefield must render changing frames',
  );
  await page.screenshot({ path: resolve('../../.toolchain/mobile-084-acceptance/apk-production-allied.png') });
  await page.getByRole('button', { name: '手机菜单', exact: true }).tap();
  await page.getByRole('button', { name: '修改器', exact: true }).tap();
  await page.getByRole('button', { name: '设置金钱', exact: true }).tap();
  await page.getByRole('status').filter({ hasText: '金钱已改为' }).waitFor();
  await page.screenshot({ path: resolve('../../.toolchain/mobile-084-acceptance/apk-production-controls.png') });
  for (const viewport of [
    { width: 1000, height: 450 },
    { width: 800, height: 360 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.locator('.mobile-panel-content').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const panel = (await page.locator('.mobile-panel').boundingBox())!;
    assert(panel.x < 50 && panel.x + panel.width < viewport.width - 150, 'Menu must leave the sidebar exposed');
    const hit = await page.evaluate(
      ({ width, height }) => document.elementFromPoint(width - 30, height / 2)?.id,
      viewport,
    );
    assert.equal(hit, 'screen', 'Sidebar must remain interactive');
    const footer = (await page.getByRole('button', { name: '返回游戏', exact: true }).boundingBox())!;
    assert(
      footer.y + footer.height <= viewport.height && footer.height >= 44,
      'Return button stays visible after scrolling',
    );
  }
  await page.setViewportSize({ width: 1000, height: 450 });
  await page.getByRole('button', { name: '作战', exact: true }).tap();
  await page.screenshot({ path: resolve('../../.toolchain/mobile-084-acceptance/apk-menu-orders.png') });
  await page.getByRole('button', { name: '返回游戏', exact: true }).tap();
  assert.equal(await page.locator('.mobile-panel').count(), 0);
  await page.getByRole('button', { name: '手机菜单', exact: true }).tap();
  await page.touchscreen.tap(960, 225);
  await page.locator('.mobile-panel').waitFor({ state: 'detached' });
  console.log('PASS sidebar tap reaches game and dismisses left menu');
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log(
    'PASS production assets extracted directly from the APK: campaign startup, advancing rendering, touch menu and money trainer; no development imports, page errors or failed HTTP responses.',
  );
} catch (error) {
  console.log(
    'FAILED',
    await page.locator('#screen').getAttribute('data-shell-page'),
    await page.locator('body').innerText(),
  );
  await page.screenshot({ path: resolve('../../.toolchain/mobile-084-acceptance/fullscreen-failure.png') });
  throw error;
} finally {
  await browser.close();
}
