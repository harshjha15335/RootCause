// Scenes 1, 3, 4, 5: the Goal Autopsy tour for the 28:24 goal (g2, fully traced: Akendo 84%).
// Usage: node capture-autopsy.js <outDir> [clip-name ...]
const { open, record, DEMO } = require('./lib');
const OUT = process.argv[2] || '../captures/autopsy';
const FPS = 15;
const CLIPS = [
  ['the goal', 7], ['the move', 6], ['mistakes', 5], ['the test', 5],
  ['200 replays', 6], ['verdict', 4], ['the fix', 5],
];
const ONLY = process.argv.slice(3);
(async () => {
  const env = await open(DEMO + '&goal=wlb-msb-2023-11-12-g2#/autopsy');
  for (const [name, secs] of CLIPS) {
    if (ONLY.length && !ONLY.includes(name.replace(/\s+/g, '-'))) continue;
    const t0 = Date.now();
    await env.page.getByRole('button', { name: new RegExp('^' + name + '$', 'i') }).first().click();
    await env.page.clock.fastForward(100);
    await record(env, `${OUT}/${name.replace(/\s+/g, '-')}`, secs, FPS);
    console.log(name, 'done in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  }
  await env.browser.close();
})();
