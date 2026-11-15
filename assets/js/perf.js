// Speed on phones, with every effect kept: looping animations only run while they can be seen.
// Hidden banner slides and sections scrolled out of view are paused (nobody sees them); they run again the moment they come back.
const OFF = 'is-off';
const SEL = '.promo, .dshop, .panel, .cat-grid, .home-stack > *';
let io = null;
try {
  io = new IntersectionObserver(es => { for (const e of es) e.target.classList.toggle(OFF, !e.isIntersecting); }, { rootMargin: '150px 0px' });
} catch { io = null; }

function watch(root) {
  if (!root || !root.querySelectorAll) return;
  if (io) {
    if (root.matches && root.matches(SEL) && !root.__pw) { root.__pw = 1; io.observe(root); }
    root.querySelectorAll(SEL).forEach(el => { if (!el.__pw) { el.__pw = 1; io.observe(el); } });
  }
  // pictures are drawn off the main thread so scrolling stays smooth
  root.querySelectorAll('img:not([decoding])').forEach(im => { im.decoding = 'async'; });
}

let queued = new Set(), raf = 0;
function flush() { raf = 0; const q = queued; queued = new Set(); q.forEach(n => { if (n.isConnected) watch(n); }); }
export function initPerf() {
  watch(document);
  new MutationObserver(ms => {
    for (const m of ms) m.addedNodes.forEach(n => { if (n.nodeType === 1) queued.add(n); });
    if (!raf && queued.size) raf = requestAnimationFrame(flush);
  }).observe(document.body, { childList: true, subtree: true });
}
