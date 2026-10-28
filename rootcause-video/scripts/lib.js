// Shared Playwright helpers for frame-stepped capture of the RootCause preview.
// The page clock is paused and advanced one video frame at a time, so the
// software-rendered three.js scenes come out smooth no matter how slowly they render.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.RC_BASE || 'http://localhost:8080/RootCause/';
const DEMO = '?demo=wlb-msb-2023-11-12';
async function open(route, { w = 1920, h = 1080, dsf = 1 } = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  await page.clock.install();
  await page.goto(BASE + route);
  await page.waitForLoadState('load');
  await page.waitForTimeout(5000);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
  await page.clock.fastForward(1500);
  for (let t = 0; t < 1200; t += 40) await page.clock.fastForward(40);
  const cdp = await ctx.newCDPSession(page);
  // hide the mouse-free UI bits that only add noise
  await page.addStyleTag({ content: '*{caret-color:transparent!important} ::-webkit-scrollbar{display:none}' });
  return { browser, ctx, page, cdp };
}
async function shot(cdp, file) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93 });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
}
// capture `seconds` of footage at `fps` into dir/prefix_NNNN.jpg, optionally running hook(i) before each frame
async function record(env, dir, seconds, fps, hook) {
  fs.mkdirSync(dir, { recursive: true });
  const n = Math.round(seconds * fps);
  for (let i = 0; i < n; i++) {
    if (hook) await hook(i, n);
    await env.page.clock.fastForward(1000 / fps);
    await shot(env.cdp, `${dir}/${String(i).padStart(4, '0')}.jpg`);
  }
}
module.exports = { open, shot, record, BASE, DEMO };
// framer-motion clamps each frame's delta to ~40 ms, so let UI transitions finish
// by stepping the clock in small increments rather than one big jump
async function settle(env, ms) {
  for (let t = 0; t < ms; t += 40) await env.page.clock.fastForward(40);
}
module.exports.settle = settle;
