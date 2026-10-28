// v2 shots (Harsh's review): only the current Autopsy, match page and Lab; no Explore screen.
// Usage: node capture-v2.js <outDir> <part>
const { open, shot, record, settle, DEMO } = require('./lib');
const OUT = process.argv[2] || '../captures/v2';
const PART = process.argv[3];
require('fs').mkdirSync(OUT, { recursive: true });
const G2 = '&goal=wlb-msb-2023-11-12-g2';
(async () => {
  if (PART === 'autopsy') {
    const env = await open(DEMO + G2 + '#/autopsy');
    const chapter = async (n) => { await env.page.getByRole('button', { name: new RegExp('^' + n + '$', 'i') }).first().click(); await env.page.clock.fastForward(100); };
    await chapter('the engine'); await settle(env, 2500); await shot(env.cdp, `${OUT}/autopsy-engine.jpg`);
    await chapter('two plans'); await record(env, `${OUT}/two-plans`, 4, 15);
    await env.browser.close();
  }
  if (PART === 'cards') {
    const env = await open(DEMO + '#/match');
    const p = env.page;
    const toCards = async () => { await p.evaluate(() => window.scrollTo(0, 760)); await settle(env, 800); };
    await toCards(); await shot(env.cdp, `${OUT}/cards-simple.jpg`);
    await p.getByText('Expert', { exact: true }).first().click(); await settle(env, 1200);
    await toCards(); await shot(env.cdp, `${OUT}/cards-expert.jpg`);
    await p.getByText('Simple', { exact: true }).first().click(); await settle(env, 800);
    for (const [label, code] of [['हिन्दी', 'hi'], ['Español', 'es']]) {
      await p.locator('header button').filter({ hasText: /^\s*(EN|HI|ES)\s*$/ }).first().click(); await settle(env, 400);
      await p.getByText(label, { exact: false }).first().click(); await settle(env, 1500);
      await toCards(); await shot(env.cdp, `${OUT}/cards-${code}.jpg`);
    }
    await env.browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
