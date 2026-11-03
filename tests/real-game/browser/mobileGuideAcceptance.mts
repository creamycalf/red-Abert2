import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const out = '../../.toolchain/mobile-085-acceptance';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ hasTouch: true, locale: 'zh-CN', viewport: { width: 1000, height: 450 } });
await context.route('**/*', (route) =>
  new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
);
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
try {
  await page.goto('http://127.0.0.1:15176/?mobile=1&bundled=1&network=0&mouse-lock=0');
  await page.locator('.mobile-start').waitFor({ timeout: 90000 });
  await page.getByRole('button', { name: /操作与存档/ }).tap();
  await page.getByRole('button', { name: '攻略', exact: true }).tap();
  for (const [side, label] of [
    ['allied', '盟军 12 关'],
    ['soviet', '苏军 12 关'],
  ]) {
    await page.getByRole('button', { name: label!, exact: true }).tap();
    await expect(page.locator('.mobile-guide option')).toHaveCount(12);
    for (let n = 1; n <= 12; n++) {
      await page.getByLabel('攻略关卡').selectOption(`${side}-${n}`);
      await expect(page.locator('.mobile-guide h3')).toContainText(`${n}.`);
      await expect(page.locator('.mobile-guide article p')).toHaveCount(3);
    }
  }
  await expect(page.locator('.mobile-guide')).toContainText('Polar Storm');
  for (const viewport of [
    { width: 1000, height: 450 },
    { width: 800, height: 360 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.locator('.mobile-panel-content').evaluate((el) => (el.scrollTop = el.scrollHeight));
    const footer = (await page.getByRole('button', { name: '返回游戏', exact: true }).boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(viewport.height);
    expect(footer.height).toBeGreaterThanOrEqual(44);
    const panel = (await page.locator('.mobile-panel').boundingBox())!;
    expect(panel.x + panel.width).toBeLessThan(viewport.width - 150);
  }
  await page.setViewportSize({ width: 1000, height: 450 });
  await page.locator('.mobile-panel-content').evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: `${out}/guide-soviet.png` });
  await page.getByRole('button', { name: '返回游戏', exact: true }).tap();
  await page.getByRole('button', { name: /操作与存档/ }).tap();
  await page.getByRole('button', { name: '攻略', exact: true }).tap();
  await expect(page.locator('.mobile-guide')).toContainText('Polar Storm');
  await page.reload();
  await page.locator('.mobile-start').waitFor({ timeout: 90000 });
  await page.getByRole('button', { name: /操作与存档/ }).tap();
  await page.getByRole('button', { name: '攻略', exact: true }).tap();
  await expect(page.locator('.mobile-guide')).toContainText('Polar Storm');
  await page.getByRole('button', { name: '盟军 12 关', exact: true }).tap();
  await page.screenshot({ path: `${out}/guide-allied.png` });
  expect(errors).toEqual([]);
  console.log(
    'PASS final APK offline guide: 24 chapters, faction switch, text, fixed return/sidebar bounds at 3 sizes, saved chapter after close and reload, no page errors',
  );
} finally {
  await browser.close();
}
