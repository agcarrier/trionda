# TRIONDA — Three Nations, One Wave

Single-page showcase for the FIFA World Cup 2026 built around the adidas Trionda
official match ball (`assets/trionda_2026.glb`, textures embedded).

## Run

Any static server from this folder, e.g.:

```sh
python3 -m http.server 8890
# → http://127.0.0.1:8890
```

CDN dependencies (Three.js 0.170, GSAP 3.12 + ScrollTrigger, Lenis 1.1, Google Fonts)
load at runtime, so you need to be online.

## Structure

- `index.html` — semantic sections: hero · deconstruction · Canada · México · USA · tournament · finale/footer
- `styles.css` — ball-derived palette (red/green/blue/gold on stadium night), glass UI, reveal machinery
- `main.js` — Three.js scene (three-point rig + RoomEnvironment, ACES), GSAP ScrollTrigger choreography, Lenis smooth scroll

## Choreography notes

- One state object `S` drives ball position/rotation/camera; scrubbed timelines tween it per section, the rAF loop applies it (damped cursor parallax on top).
- Panel angles were probed from the texture: red maple = 90°, green = 45° (+rx tilt), FIFA/blue star = 0°. Nation targets wind forward (2.5π → 4.25π → 6π) so the ball always rotates onward.
- Idle spin is wrapped mod 2π and scaled by `S.idle`, so chapter angles stay deterministic no matter how long the user idles.
- The deconstruction section pins for 420vh: camera push-in, +2.2 revolutions, additive gold wireframe shells expand/contract, four callouts keyed to scrub position.
- `?jump=N` deep-links N viewport-heights in with intro + smoothing disabled (used by the headless verify scripts).
- `prefers-reduced-motion`: no scrub/parallax/smooth-scroll, instant text, recessed static ball.

## Verify

Headless capture scripts live in the session scratchpad (`verify.mjs`, `probe.mjs`) —
they shoot every chapter at desktop/mobile widths via puppeteer-core + installed Chrome.
