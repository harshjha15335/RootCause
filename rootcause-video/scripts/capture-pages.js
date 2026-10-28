// Scenes 2 and 6 plus supporting stills: home, matches, match page, Explore panels,
// Simple/Expert, language switch and the Tactics Lab layers.
// Usage: node capture-pages.js <outDir> [part]
const { open, shot, record, settle, DEMO } = require('./lib');
const OUT = process.argv[2] || '../captures/pages';
const PART = process.argv[3] || 'all';
const fs = require('fs'); fs.mkdirSync(OUT, { recursive: true });
const G2 = '&goal=wlb-msb-2023-11-12-g2';
const want = (k) => PART === 'all' || PART === k;
(async () => {
  if (want('home')) {
    const env = await open('#/');
    await shot(env.cdp, `${OUT}/home.jpg`);
    await record(env, `${OUT}/home-clip`, 4, 15);
    await env.browser.close();
  }
  if (want('match')) {
    const env = await open(DEMO + '#/matches', { dsf: 2 });
    await shot(env.cdp, `${OUT}/matches@2x.jpg`);
    await env.page.goto(env.page.url().replace('#/matches', '#/match'));
    await settle(env, 1500);
    await shot(env.cdp, `${OUT}/match-top@2x.jpg`);
    // smooth scroll down to the "Every goal, judged." cards, one frame at a time
    await record(env, `${OUT}/match-scroll`, 4, 30, async (i, n) => {
      const e = 0.5 - Math.cos(Math.PI * i / (n - 1)) / 2;
      await env.page.evaluate((y) => window.scrollTo(0, y), Math.round(e * 760));
    });
    await shot(env.cdp, `${OUT}/match-cards@2x.jpg`);
    await env.browser.close();
  }
  if (want('explore')) {
    const env = await open(DEMO + G2 + '#/explore');
    const p = env.page;
    await shot(env.cdp, `${OUT}/explore-verdict-simple.jpg`);
    for (const t of ['How it happened', 'What if?']) {
      await p.getByRole('tab', { name: t }).click(); await settle(env, 1200);
      await shot(env.cdp, `${OUT}/explore-${t.replace(/\W+/g, '').toLowerCase()}.jpg`);
    }
    // toggle to "Mistake fixed" in What if? when present
    const fixed = p.getByRole('button', { name: /Mistake fixed/i }).first();
    if (await fixed.count()) { await fixed.click(); await settle(env, 1500); await shot(env.cdp, `${OUT}/explore-whatif-fixed.jpg`); }
    await p.getByRole('tab', { name: 'The verdict' }).click(); await settle(env, 800);
    await env.browser.close();
  }
  if (want('modes')) {
    const env = await open(DEMO + G2 + '#/match');
    const p = env.page;
    await p.evaluate(() => window.scrollTo(0, 760)); await settle(env, 800);
    await shot(env.cdp, `${OUT}/match-simple.jpg`);
    await p.getByText('Expert', { exact: true }).first().click(); await settle(env, 1200);
    await shot(env.cdp, `${OUT}/match-expert.jpg`);
    await env.browser.close();
    const e2 = await open(DEMO + G2 + '&depth=expert#/explore');
    await shot(e2.cdp, `${OUT}/explore-expert.jpg`);
    for (const [label, code] of [['हिन्दी', 'hi'], ['Español', 'es']]) {
      await e2.page.locator('header button').filter({ hasText: /^\s*(EN|HI|ES)\s*$/ }).first().click(); await settle(e2, 400);
      await e2.page.getByText(label, { exact: false }).first().click(); await settle(e2, 1500);
      await shot(e2.cdp, `${OUT}/explore-${code}.jpg`);
    }
    await e2.browser.close();
  }
  if (want('lang')) {
    const e2 = await open(DEMO + G2 + '#/explore');
    for (const [label, code] of [['हिन्दी', 'hi'], ['Español', 'es']]) {
      await e2.page.locator('header button').filter({ hasText: /^\s*(EN|HI|ES)\s*$/ }).first().click(); await settle(e2, 400);
      await e2.page.getByText(label, { exact: false }).first().click(); await settle(e2, 1500);
      await shot(e2.cdp, `${OUT}/explore-${code}.jpg`);
    }
    await e2.browser.close();
  }
  if (want('lab')) {
    const env = await open(DEMO + '#/lab');
    const p = env.page;
    await p.evaluate(() => window.scrollTo(0, 300)); await settle(env, 500);
    for (const layer of ['Space', 'Options', 'Pressure', 'Runs']) {
      await p.getByText(layer, { exact: true }).first().click();
      await record(env, `${OUT}/lab-${layer.toLowerCase()}`, layer === 'Space' ? 3 : 1, 15);
    }
    await env.browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
