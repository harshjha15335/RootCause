// QA: every route used in the video, in every language shown, must not print a real club,
// stadium, player or league name. Prints any hits.
const { open, settle, DEMO } = require('./lib');
const BAD = /chelsea|stamford|haaland|cucurella|manchester city|man city|premier league|thiago silva|akanji|r[uú]ben dias|palmer|sterling|jackson|rodri|alvarez|foden|gvardiol|doku|ederson|sánchez/gi;
const G2 = '&goal=wlb-msb-2023-11-12-g2';
const ROUTES = ['#/', '#/matches', DEMO + '#/match', DEMO + G2 + '#/autopsy', DEMO + G2 + '#/explore', DEMO + G2 + '&depth=expert#/explore', DEMO + '#/lab', '#/story'];
(async () => {
  let hits = 0;
  for (const r of ROUTES) {
    const env = await open(r);
    const p = env.page;
    const texts = [await p.innerText('body')];
    for (const tab of await p.$$eval('[role=tab]', (els) => els.map((e) => e.innerText.trim()))) {
      await p.getByRole('tab', { name: tab }).click(); await settle(env, 600); texts.push(await p.innerText('body'));
    }
    const found = [...new Set(texts.join('\n').match(BAD) || [])];
    console.log(found.length ? 'HIT ' : 'ok  ', r, found.join(', '));
    hits += found.length;
    await env.browser.close();
  }
  console.log(hits ? `FAIL: ${hits} real names` : 'PASS: no real names on any captured route');
})();
