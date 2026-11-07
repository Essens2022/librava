// Scroll performance on phones: while the page is being scrolled, the purely decorative endless animations
// (shelf marquee, floating covers, shine/pulse on buttons, banners) are paused, so iOS Safari only has to scroll.
// One passive listener toggles one class on <html>; it reads nothing from the layout. They resume 150 ms after the scroll stops.
const root = document.documentElement;
let on = false, timer = 0;
const stop = () => { on = false; root.classList.remove('is-scrolling'); };
export function scrollPerf() {
  addEventListener('scroll', () => {
    if (!on) { on = true; root.classList.add('is-scrolling'); }
    clearTimeout(timer); timer = setTimeout(stop, 150);
  }, { passive: true });
}
