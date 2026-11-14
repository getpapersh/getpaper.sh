(() => {
  const frame = document.querySelector('[data-hero-film]');
  if (!frame) return;
  const promo = frame.querySelector('.promo'), cast = frame.querySelector('.screencast');
  const pause = frame.querySelector('[data-film-pause]'), replay = frame.querySelector('[data-film-replay]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), phone = matchMedia('(max-width: 700px)');
  const promoSource = frame.dataset.promoSrc;
  cast.src = frame.dataset.screencastSrc;
  cast.poster = frame.dataset.screencastSrc.replace(/\.mp4$/, '.jpg');
  let current = cast, visible = true, paused = reduced.matches, finished = false;
  const label = () => { pause.textContent = current.paused ? 'Play' : 'Pause'; };
  const play = () => { if (visible && !paused) current.play().catch(label); };
  function showCast() {
    finished = true;
    promo.classList.add('fading'); promo.pause(); current = cast;
    frame.dataset.phase = 'screencast'; cast.controls = false; play(); label();
  }
  function showPromo() {
    finished = false; promo.hidden = false; promo.classList.remove('fading');
    cast.pause(); promo.currentTime = 0; current = promo; frame.dataset.phase = 'promo';
    play(); label();
  }
  pause.hidden = false;
  replay.hidden = !promoSource;
  if (promoSource) { promo.src = promoSource; promo.poster = promoSource.replace(/\.mp4$/, '.jpg'); }
  promo.addEventListener('ended', showCast);
  promo.addEventListener('error', showCast);
  for (const video of [promo, cast]) {
    video.addEventListener('play', label); video.addEventListener('pause', label);
  }
  pause.addEventListener('click', () => { paused = !current.paused; if (paused) current.pause(); else play(); label(); });
  replay.addEventListener('click', () => { paused = false; showPromo(); });
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) {
      if (current === promo) showCast();
      current.pause();
    } else play();
  }).observe(frame);
  document.addEventListener('visibilitychange', () => { if (document.hidden) current.pause(); else play(); });
  reduced.addEventListener('change', () => { paused = reduced.matches; if (paused) { showCast(); cast.pause(); } else play(); label(); });
  phone.addEventListener('change', () => { if (phone.matches && !finished) showCast(); });
  if (promoSource && !phone.matches && !reduced.matches) showPromo(); else showCast();
})();
