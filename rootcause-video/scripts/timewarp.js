// Injected before page scripts: runs the page's clock SLOW times slower than real time,
// so a software-rendered WebGL scene that only reaches ~7 fps in real time yields
// smooth footage once the recording is played back SLOW times faster.
(() => {
  const SLOW = window.__RC_SLOW || 1;
  const pn = performance.now.bind(performance), dn = Date.now;
  const p0 = pn(), d0 = dn();
  performance.now = () => p0 + (pn() - p0) / SLOW;
  Date.now = () => d0 + (dn() - d0) / SLOW;
  const RD = Date;
  // eslint-disable-next-line no-global-assign
  Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(Date.now()); } static now() { return Date_now(); } };
  const Date_now = window.Date.now = () => d0 + (dn() - d0) / SLOW;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf(() => cb(performance.now()));
  const st = window.setTimeout.bind(window), si = window.setInterval.bind(window);
  window.setTimeout = (f, ms = 0, ...a) => st(f, ms * SLOW, ...a);
  window.setInterval = (f, ms = 0, ...a) => si(f, ms * SLOW, ...a);
  // CSS transitions/animations are slowed through the Animation API in capture.js
})();
