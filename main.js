/* ═══════════════════════════════════════════════════════════
   TRIONDA — Three Nations, One Wave
   WebGL centerpiece + cinematic scroll choreography
   ═══════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

gsap.registerPlugin(ScrollTrigger);

const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const mq = window.matchMedia("(max-width: 768px)");
let MOBILE = mq.matches;
/* the breakpoint is re-read once layout is stable (finishLoading); after that,
   crossing it rebuilds the whole choreography via a clean reload */
let breakpointLocked = false;
mq.addEventListener("change", () => { if (breakpointLocked) location.reload(); });

/* ───────────────────────── Scene ───────────────────────── */

const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  50
);
camera.position.set(0, 0, 6);

/* environment — bright studio room so the gold flake glints */
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

/* ── three-point stadium rig ── */
const rig = new THREE.Group();
scene.add(rig);

const keyLight = new THREE.DirectionalLight(0xfff1dd, 2.6); // warm key
keyLight.position.set(3.5, 3, 4);
rig.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x9cc7ff, 3.2); // cool floodlight rim
rimLight.position.set(-4, 2.5, -3.5);
rig.add(rimLight);

const bounceLight = new THREE.PointLight(0xc9a24b, 8, 12); // gold bounce
bounceLight.position.set(-2, -2.2, 3);
rig.add(bounceLight);

const accentLight = new THREE.PointLight(0xc9a24b, 0, 14); // chapter-keyed
accentLight.position.set(2.5, 0.5, 3.5);
rig.add(accentLight);

const rakeLight = new THREE.SpotLight(0xfff5e0, 0, 20, 0.5, 0.6); // deconstruct raking light
rakeLight.position.set(6, 0.5, 1.2);
rig.add(rakeLight);

/* ── ball group ── */
const ballGroup = new THREE.Group();   // scroll-driven position/scale
const ballSpin = new THREE.Group();    // scroll-driven rotation + idle spin
ballGroup.add(ballSpin);
scene.add(ballGroup);

let wire1 = null;
let wire2 = null;

/* ─────────────── Scroll-driven state (single source of truth) ─────────────── */

const S = {
  x: 1.35,
  y: -0.05,
  scale: 1,
  rx: 0.12,
  ry: 0,
  camZ: 6,
  explode: 0,
  rake: 0,
  idle: 1,          // how much the idle spin contributes
  accentI: 0,       // accent light intensity
};

const HERO_STATE = { ...S };
let idleTheta = 0;

function applyResponsiveState() {
  MOBILE = mq.matches;
  breakpointLocked = true;
  Object.assign(HERO_STATE, {
    x: MOBILE ? 0 : 1.35,
    y: MOBILE ? 0.85 : -0.05,
    scale: MOBILE ? 0.78 : 1.12,
  });
  Object.assign(S, HERO_STATE);
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

window.__S = S; // debug handle

/* ───────────────────────── Load the ball ───────────────────────── */

const draco = new DRACOLoader();
draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

const pctEl = document.getElementById("loadPct");
const waveFill = document.getElementById("waveFill");
const waveLen = waveFill.getTotalLength();
waveFill.style.strokeDasharray = waveLen;
waveFill.style.strokeDashoffset = waveLen;

loader.load(
  "assets/trionda_2026.glb",
  (gltf) => {
    const ball = gltf.scene;

    /* find the single ball mesh */
    let ballMesh = null;
    ball.traverse((o) => {
      if (o.isMesh) {
        ballMesh = o;
        o.material.envMapIntensity = 1.1;
      }
    });

    /* normalize against the MESH (scene box can include stray nodes): center it, radius = 1 */
    const box = new THREE.Box3().setFromObject(ballMesh || ball);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    ball.position.sub(sphere.center);
    ballSpin.scale.setScalar(1 / sphere.radius);
    ballSpin.add(ball);

    /* gold wireframe shells — the "deconstruction" ghosts */
    if (ballMesh) {
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0xc9a24b,
        wireframe: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      wire1 = ballMesh.clone();
      wire1.material = wireMat;
      wire2 = ballMesh.clone();
      wire2.material = wireMat.clone();
      wire1.userData.baseScale = ballMesh.scale.clone();
      wire2.userData.baseScale = ballMesh.scale.clone();
      ballMesh.parent.add(wire1, wire2);
    }

    finishLoading();
  },
  (e) => {
    if (e.total) {
      const p = Math.min(1, e.loaded / e.total);
      pctEl.textContent = Math.round(p * 100);
      waveFill.style.strokeDashoffset = waveLen * (1 - p);
    }
  },
  (err) => {
    console.error("GLB load failed:", err);
    pctEl.textContent = "!";
  }
);

/* ───────────────────────── Render loop ───────────────────────── */

const pointer = { tx: 0, ty: 0, cx: 0, cy: 0 };
window.addEventListener("pointermove", (e) => {
  if (RM || MOBILE) return;
  pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
});

const MAX_TILT = THREE.MathUtils.degToRad(6);
const clock = new THREE.Clock();
let running = true;

document.addEventListener("visibilitychange", () => {
  running = !document.hidden;
  if (running) clock.getDelta(), tick();
});

function tick() {
  if (!running) return;
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  /* idle rotation — ~20s per revolution, weighted by S.idle.
     Wrapped mod 2π and scaled by S.idle on application, so scripted
     chapter angles stay deterministic (idle term collapses to 0). */
  idleTheta = (idleTheta + dt * (Math.PI * 2 / 20) * S.idle) % (Math.PI * 2);

  /* damped cursor parallax */
  pointer.cx += (pointer.tx - pointer.cx) * 0.045;
  pointer.cy += (pointer.ty - pointer.cy) * 0.045;

  ballGroup.position.set(S.x, S.y + Math.sin(idleTheta * 2.2) * 0.035 * S.idle, 0);
  ballGroup.scale.setScalar(S.scale);
  ballSpin.rotation.set(
    S.rx + pointer.cy * MAX_TILT,
    S.ry + idleTheta * S.idle + pointer.cx * MAX_TILT,
    0
  );

  camera.position.z = S.camZ;
  camera.position.x = pointer.cx * 0.12;
  camera.position.y = -pointer.cy * 0.08;
  camera.lookAt(0, 0, 0);

  rig.rotation.y = pointer.cx * 0.05;

  /* deconstruction shells */
  if (wire1) {
    const e = S.explode;
    wire1.scale.copy(wire1.userData.baseScale).multiplyScalar(1 + e * 0.22);
    wire2.scale.copy(wire2.userData.baseScale).multiplyScalar(1 + e * 0.45);
    wire1.material.opacity = e * 0.45;
    wire2.material.opacity = e * 0.16;
  }

  rakeLight.intensity = S.rake * 260;
  rakeLight.target = ballGroup;
  accentLight.intensity = S.accentI;

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ───────────────────────── Smooth scroll ───────────────────────── */

let lenis = null;
if (!RM) {
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => { if (lenis) lenis.raf(t * 1000); });
  gsap.ticker.lagSmoothing(0);
  window.__lenis = lenis; // debug handle
}

/* ───────────────────────── Entrance ───────────────────────── */

function finishLoading() {
  const pre = document.getElementById("preloader");
  waveFill.style.strokeDashoffset = 0;
  pctEl.textContent = "100";

  applyResponsiveState(); // layout is stable now — lock the breakpoint
  tick(); // start render loop

  setTimeout(() => {
    pre.classList.add("done");
    playIntro();
  }, 350);
}

let introTl = null;

function playIntro() {
  /* verify-mode / deep-link: land instantly, no choreographed entrance */
  if (new URLSearchParams(location.search).get("jump")) {
    gsap.set("#gl", { opacity: 1 });
    gsap.set([".nav", ".cta-nav", ".hero-meta"], { opacity: 1, y: 0 });
    gsap.set(".hero-title .line-inner, .hero-sub .line-inner", { opacity: 1, y: 0, filter: "blur(0px)" });
    buildScroll();
    return;
  }

  if (RM) {
    gsap.set("#gl", { opacity: 1 });
    gsap.set([".nav", ".cta-nav", ".hero-meta"], { opacity: 1 });
    buildScroll();
    return;
  }

  introTl = gsap.timeline({ defaults: { ease: "power3.out" } });

  introTl
    .fromTo(
      "#gl",
      { opacity: 0 },
      { opacity: 1, duration: 1.0 }
    )
    .fromTo(
      S, { scale: S.scale * 0.55 },
      { scale: HERO_STATE.scale, duration: 1.2, ease: "power2.out" },
      "<"
    )
    .to(
      ".hero-title .line-inner, .hero-sub .line-inner",
      {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 0.85,
        stagger: 0.12,
      },
      "-=0.55"
    )
    .to(".nav", { opacity: 1, y: 0, duration: 0.6 }, "-=0.45")
    .to(".cta-nav", { opacity: 1, duration: 0.5 }, "-=0.35")
    .to(".hero-meta", { opacity: 1, duration: 0.6, onComplete: buildScroll }, "-=0.4");

  /* skippable */
  const skip = () => {
    if (introTl && introTl.progress() < 1) introTl.progress(1);
    window.removeEventListener("pointerdown", skip);
    window.removeEventListener("keydown", skip);
  };
  window.addEventListener("pointerdown", skip);
  window.addEventListener("keydown", skip);
}

/* ───────────────────────── Scroll choreography ───────────────────────── */

const ACCENTS = {
  hero: "#C9A24B",
  ball: "#C9A24B",
  canada: "#E03A4E",
  mexico: "#12A150",
  usa: "#3B6FE0",
  tournament: "#C9A24B",
  finale: "#C9A24B",
};

function setChapter(name) {
  document.body.dataset.chapter = name;
  gsap.to("html", { "--accent": ACCENTS[name], duration: 0.9, ease: "power2.out" });
  gsap.to(accentLight.color, {
    r: new THREE.Color(ACCENTS[name]).r,
    g: new THREE.Color(ACCENTS[name]).g,
    b: new THREE.Color(ACCENTS[name]).b,
    duration: 0.9,
  });
}

function buildScroll() {
  /* generic reveal for text blocks */
  gsap.utils.toArray("[data-reveal]").forEach((el) => {
    if (RM) { el.classList.add("in"); return; }
    gsap.fromTo(
      el,
      { opacity: 0, y: 24, filter: "blur(8px)" },
      {
        opacity: 1, y: 0, filter: "blur(0px)",
        duration: 0.9, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 82%" },
        onComplete: () => el.classList.add("in"),
      }
    );
  });

  /* progress rail */
  gsap.to("#progressLine", {
    scaleY: 1,
    ease: "none",
    scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.4 },
  });

  /* chapter watchers (accent color + light) */
  [["#hero", "hero"], ["#ball", "ball"], ["#canada", "canada"], ["#mexico", "mexico"],
   ["#usa", "usa"], ["#tournament", "tournament"], ["#finale", "finale"]].forEach(([sel, name]) => {
    ScrollTrigger.create({
      trigger: sel,
      start: "top 55%",
      end: "bottom 55%",
      onEnter: () => setChapter(name),
      onEnterBack: () => setChapter(name),
    });
  });

  /* counters */
  gsap.utils.toArray(".counter-num").forEach((el) => {
    const target = +el.dataset.count;
    gsap.fromTo(
      el, { innerText: 0 },
      {
        innerText: target,
        duration: RM ? 0 : 1.8,
        ease: "power2.out",
        snap: { innerText: 1 },
        scrollTrigger: { trigger: el, start: "top 85%" },
      }
    );
  });

  /* constellation draw */
  gsap.utils.toArray(".c-lines path").forEach((p, i) => {
    gsap.to(p, {
      strokeDashoffset: 0,
      duration: RM ? 0 : 1.4,
      delay: i * 0.12,
      ease: "power2.inOut",
      scrollTrigger: { trigger: "#constellation", start: "top 80%" },
    });
  });

  if (RM) return; // no scroll-scrub choreography under reduced motion

  const D = MOBILE ? 0.55 : 1; // movement damping factor on mobile

  /* ── 02 · deconstruction — pinned scrub, the signature interaction ── */
  const deconTl = gsap.timeline({
    scrollTrigger: {
      trigger: "#ball",
      start: "top top",
      end: "bottom bottom",
      pin: "#ballPin",
      scrub: 1.2,
    },
    defaults: { ease: "none" },
  });

  const CO = (id, at) => {
    deconTl.to(id, { autoAlpha: 1, y: 0, duration: 0.06 }, at);
    deconTl.to(id, { autoAlpha: 0, duration: 0.05 }, at + 0.17);
  };
  gsap.set(".callout", { y: 18 });

  deconTl
    .to(S, { x: 0, y: MOBILE ? 0.25 : -0.1, camZ: 3.6, idle: 0.15, rake: 1, duration: 0.22 }, 0)
    .to(S, { ry: `+=${Math.PI * 2.2}`, rx: 0.35, duration: 1, ease: "power1.inOut" }, 0)
    .to(S, { explode: 1, duration: 0.2, ease: "power2.inOut" }, 0.36)
    .to(S, { explode: 0, duration: 0.18, ease: "power2.inOut" }, 0.62)
    .to(S, { camZ: 4.6, rake: 0.25, duration: 0.2 }, 0.8);

  CO("#co1", 0.14);
  CO("#co2", 0.34);
  CO("#co3", 0.55);
  CO("#co4", 0.76);

  /* ── 03–05 · nations — ball presents each panel ── */
  const nation = (sel, vars) =>
    gsap.timeline({
      scrollTrigger: { trigger: sel, start: "top 85%", end: "top 15%", scrub: 1 },
      defaults: { ease: "power1.inOut" },
    }).to(S, { ...vars, duration: 1 });

  /* ball takes the half the copy leaves free: Canada text left → ball right, etc.
     ry targets are absolute and forward-winding; probed panel angles (mod 2π):
     red maple = π/2 · green = π/4 (high — needs rx tilt) · blue star/FIFA = 0 */
  nation("#canada", {
    x: MOBILE ? 0 : 1.25 * D, y: MOBILE ? 1.0 : -0.05, scale: MOBILE ? 0.6 : 0.92,
    ry: Math.PI * 2.5, rx: 0.1, camZ: 5.4, rake: 0, idle: 0, accentI: 26,
  });
  nation("#mexico", {
    x: MOBILE ? 0 : -1.25 * D, y: MOBILE ? 1.0 : -0.05,
    ry: Math.PI * 4.25, rx: 0.55, idle: 0,
  });
  nation("#usa", {
    x: MOBILE ? 0 : 1.25 * D, y: MOBILE ? 1.0 : -0.05,
    ry: Math.PI * 6, rx: 0.1, idle: 0,
  });

  /* ── 06 · tournament — ball recedes to a small witness ── */
  nation("#tournament", {
    x: 0, y: MOBILE ? 1.9 : 1.8, scale: 0.3, ry: Math.PI * 6.9, rx: 0.05,
    camZ: 6, idle: 0.6, accentI: 10,
  });

  /* ── 07 · finale — the drop; lands FIFA-badge forward ── */
  gsap.timeline({
    scrollTrigger: { trigger: "#finale", start: "top 90%", end: "center 55%", scrub: 1 },
  })
    .to(S, { y: MOBILE ? 0.4 : 0.35, x: 0, scale: MOBILE ? 0.7 : 0.9, ry: Math.PI * 8, rx: 0.1, idle: 1, accentI: 30, duration: 1, ease: "power2.in" })
    .to(S, { y: MOBILE ? 0.28 : 0.12, duration: 0.25, ease: "power1.out" });

  ScrollTrigger.refresh();

  /* verify-mode: ?jump=N lands N viewport-heights deep with all smoothing off */
  const jump = new URLSearchParams(location.search).get("jump");
  if (jump) {
    if (introTl) introTl.progress(1);
    if (lenis) { lenis.destroy(); lenis = null; }
    window.scrollTo(0, window.innerHeight * parseFloat(jump));
  }
}

/* ───────────────────────── Micro-interactions ───────────────────────── */

/* magnetic CTA */
document.querySelectorAll(".magnetic").forEach((btn) => {
  const strength = 10;
  btn.addEventListener("pointermove", (e) => {
    if (RM || MOBILE) return;
    const r = btn.getBoundingClientRect();
    const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
    const dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    gsap.to(btn, { x: dx * strength, y: dy * strength, duration: 0.35, ease: "power2.out" });
  });
  btn.addEventListener("pointerleave", () => {
    gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" });
  });
});

/* anchor links through Lenis */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView({ behavior: RM ? "auto" : "smooth" });
  });
});

/* decorative form — no backend */
document.querySelector(".finale-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const btn = e.target.querySelector(".cta");
  btn.textContent = "You're on the wave ✓";
  gsap.fromTo(btn, { scale: 0.96 }, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.45)" });
});
