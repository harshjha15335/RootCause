const { open, shot, DEMO } = require('./lib');
(async () => {
  const env = await open(DEMO + '&goal=wlb-msb-2023-11-12-g2#/autopsy');
  const out = '/tmp/claude-0/explore/survey'; require('fs').mkdirSync(out, { recursive: true });
  const chapters = ['the goal','two plans','the move','mistakes','the test','200 replays','verdict','the fix','the engine'];
  for (const [i, c] of chapters.entries()) {
    await env.page.getByRole('button', { name: new RegExp('^' + c + '$', 'i') }).first().click();
    for (let k=0;k<3;k++){ await env.page.clock.fastForward(1500); await shot(env.cdp, `${out}/ch${i}_${k}.jpg`); }
    const t = await env.page.innerText('body');
    console.log('=====', c, t.replace(/\n+/g, ' | ').split('Pause').slice(-1)[0].slice(0, 600));
  }
  await env.browser.close();
})();
