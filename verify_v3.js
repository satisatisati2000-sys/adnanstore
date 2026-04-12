const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 375, height: 812 });

  // Check Home
  await page.goto('file://' + process.cwd() + '/adnan-store/index.html');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'v3_home.png' });

  // Open Drawer
  await page.click('[data-open-drawer]');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'v3_drawer.png' });

  // Check Admin (Gate)
  await page.goto('file://' + process.cwd() + '/adnan-store/pages/admin.html');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'v3_admin_gate.png' });

  await browser.close();
})();
