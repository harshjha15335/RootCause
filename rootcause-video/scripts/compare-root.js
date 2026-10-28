// Spot-check: grab the same Autopsy frames from the root build to compare with the ui-fixes capture.
const { open, shot, DEMO } = require('./lib');
(async () => {
  const env = await open(DEMO + '&goal=wlb-msb-2023-11-12-g2#/autopsy');
  await env.page.getByRole('button', { name: /^mistakes$/i }).first().click();
  await env.page.clock.fastForward(100);
  for (let i = 0; i < 41; i++) await env.page.clock.fastForward(1000 / 15);
  await shot(env.cdp, '/tmp/claude-0/explore/root-mistakes-40.jpg');
  console.log((await env.page.innerText('body')).replace(/\n+/g, ' | ').slice(0, 600));
  await env.browser.close();
})();
