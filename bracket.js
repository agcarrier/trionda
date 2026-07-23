/* ═══════════════════════════════════════════════════════════
   TRIONDA — The Road (bracket page)
   Renders live tournament data + the gold winners' path.
   ═══════════════════════════════════════════════════════════ */

gsap.registerPlugin(ScrollTrigger);

const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const WC = window.WC;
const KO = WC.ko;

/* ───────────────────────── helpers ───────────────────────── */

const CODE = (name) => WC.codes[name] || null;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};
const todayISO = new Date().toISOString().slice(0, 10);
const isTBD = (t) => !t || /Match \d+/.test(t);
const tbdLabel = (t) => {
  const m = /(Winner|Loser) Match (\d+)/.exec(t || "");
  return m ? `${m[1]} M${m[2]}` : (t || "TBD");
};

const ROUND_NAMES = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-finals", SF: "Semi-finals", F: "Final", "3P": "Bronze" };
const ROUND_ACCENT = { R32: "var(--red-hot)", R16: "var(--green-hot)", QF: "var(--blue-sky)", SF: "var(--gold)", F: "var(--gold-bright)" };

/* ───────────────────────── bracket render ───────────────────────── */

/* winner-by-side, computed from score/pens directly — doesn't rely on the
   data model's m.w (which is only assigned for matches that feed the
   bracket forward; the third-place match deliberately has none) */
function sideWins(m, side) {
  if (m.hs === null) return false;
  const forSide = side === "home" ? m.hs : m.aws;
  const against = side === "home" ? m.aws : m.hs;
  if (forSide !== against) return forSide > against;
  if (m.pens) return side === "home" ? m.pens[0] > m.pens[1] : m.pens[1] > m.pens[0];
  return false;
}

function matchCard(n, opts = {}) {
  const m = KO[n];
  const played = m.hs !== null;
  const today = m.date === todayISO && !played;
  const rows = ["home", "away"].map((side) => {
    const team = m[side];
    const tbd = isTBD(team);
    const score = played ? (side === "home" ? m.hs : m.aws) : "";
    const win = played && sideWins(m, side);
    const code = tbd ? "·" : (CODE(team) || team.slice(0, 3).toUpperCase());
    const name = tbd ? tbdLabel(team) : team;
    const place = opts.third && played
      ? `<span class="bk-place-tag">${win ? "3rd" : "4th"}</span>` : "";
    return `<div class="bk-row${win ? " bk-win" : ""}${tbd ? " bk-tbd" : ""}">
      <span class="bk-code">${code}</span>
      <span class="bk-team">${name}</span>
      <span class="bk-score">${score}</span>
      ${place}
    </div>`;
  }).join("");
  const notes = [];
  if (m.aet) notes.push("a.e.t.");
  if (m.pens) notes.push(`pens ${m.pens[0]}–${m.pens[1]}`);
  const championRibbon = opts.final && played
    ? `<span class="bk-champion-ribbon">🏆 ${sideWins(m, "home") ? m.home : m.away} — Champions 2026</span>` : "";
  return `<div class="bk-match${opts.final ? " bk-final" : ""}${opts.third ? " bk-third" : ""}" data-n="${n}" data-reveal-bk>
    ${today ? '<span class="bk-today">Today</span>' : ""}
    ${opts.final ? `<span class="bk-trophy">★ Final · July 19 ★</span>` : ""}
    <span class="bk-meta">${opts.third ? "Bronze · " : ""}${fmtDate(m.date)} · ${m.city || m.venue || ""}</span>
    ${rows}
    ${notes.length ? `<span class="bk-note">${notes.join(" · ")}</span>` : ""}
    ${championRibbon}
  </div>`;
}

function renderBracket() {
  const stage = document.getElementById("bracketStage");
  const B = WC.bracket;
  const cols = [
    { round: "R32", ns: B.left.R32, side: "L" },
    { round: "R16", ns: B.left.R16, side: "L" },
    { round: "QF",  ns: B.left.QF,  side: "L" },
    { round: "SF",  ns: B.left.SF,  side: "L" },
    { round: "F",   ns: [B.final],  side: "C" },
    { round: "SF",  ns: B.right.SF, side: "R" },
    { round: "QF",  ns: B.right.QF, side: "R" },
    { round: "R16", ns: B.right.R16, side: "R" },
    { round: "R32", ns: B.right.R32, side: "R" },
  ];
  let html = "";
  cols.forEach((c) => {
    const label = c.round === "F"
      ? `<span class="bk-round-label"><em style="--accent-round:${ROUND_ACCENT.F}">${ROUND_NAMES.F}</em></span>`
      : `<span class="bk-round-label" style="--accent-round:${ROUND_ACCENT[c.round]}"><em>${ROUND_NAMES[c.round]}</em></span>`;
    const cards = c.round === "F"
      ? matchCard(B.final, { final: true }) + matchCard(B.thirdPlace, { third: true })
      : c.ns.map((n) => matchCard(n)).join("");
    html += `<div class="bk-col${c.round === "F" ? " bk-col-final" : ""}" data-side="${c.side}">${label}${cards}</div>`;
  });
  stage.insertAdjacentHTML("beforeend", html);
}

/* winners' path — measured SVG connectors */
let linkSpecs = [];

function buildLinks() {
  const svg = document.getElementById("bracketLines");
  const stage = document.getElementById("bracketStage");
  svg.innerHTML = "";
  linkSpecs = [];
  const sref = stage.getBoundingClientRect();
  const cardEl = (n) => stage.querySelector(`.bk-match[data-n="${n}"]`);

  Object.values(KO).forEach((m) => {
    if (!m.feeds) return;
    const parent = cardEl(m.n);
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    const pSide = parent.closest(".bk-col").dataset.side;
    m.feeds.forEach((fn) => {
      const feed = cardEl(fn);
      if (!feed) return;
      const fr = feed.getBoundingClientRect();
      const fSide = feed.closest(".bk-col").dataset.side;
      /* feed exits toward center; parent receives on its outer edge */
      const x1 = (fSide === "R" ? fr.left : fr.right) - sref.left;
      const y1 = fr.top + fr.height / 2 - sref.top;
      const x2 = (pSide === "R" || (pSide === "C" && fSide === "R")) ? pr.right - sref.left : pr.left - sref.left;
      const y2 = pr.top + pr.height / 2 - sref.top;
      const mx = (x1 + x2) / 2;
      const dPath = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
      const won = KO[fn].w != null; /* the wave has passed through this line */
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", dPath);
      p.setAttribute("class", won ? "bk-link-win" : "bk-link");
      p.setAttribute("pathLength", "1");
      svg.appendChild(p);
      linkSpecs.push({ el: p, won });
    });
  });
}

function animateLinks() {
  if (RM) return;
  linkSpecs.forEach((l) => {
    l.el.style.strokeDasharray = "1";
    l.el.style.strokeDashoffset = "1";
  });
  ScrollTrigger.create({
    trigger: "#bracket",
    start: "top 60%",
    once: true,
    onEnter: () => {
      gsap.to(linkSpecs.filter((l) => !l.won).map((l) => l.el),
        { strokeDashoffset: 0, duration: 0.9, ease: "power2.out", stagger: 0.015 });
      gsap.to(linkSpecs.filter((l) => l.won).map((l) => l.el),
        { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut", stagger: 0.045, delay: 0.35 });
    },
  });
}

/* drag-to-pan the bracket */
function bracketDrag() {
  const sc = document.getElementById("bracketScroll");
  let down = false, startX = 0, startL = 0;
  sc.addEventListener("pointerdown", (e) => { down = true; startX = e.clientX; startL = sc.scrollLeft; sc.setPointerCapture(e.pointerId); });
  sc.addEventListener("pointermove", (e) => { if (down) sc.scrollLeft = startL - (e.clientX - startX); });
  ["pointerup", "pointercancel"].forEach((ev) => sc.addEventListener(ev, () => { down = false; }));
  /* start centered on the final */
  requestAnimationFrame(() => { sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2; });
}

/* ───────────────────────── groups render ───────────────────────── */

function renderGroups() {
  /* who reached the R32 (covers best-third qualifiers) */
  const r32Teams = new Set();
  Object.values(KO).forEach((m) => {
    if (m.round === "R32") { r32Teams.add(m.home); r32Teams.add(m.away); }
  });

  const grid = document.getElementById("groupsGrid");
  let html = "";
  Object.keys(WC.groups).forEach((g) => {
    const grp = WC.groups[g];
    const rows = grp.standings.map((r, i) => {
      const third = i === 2 && r32Teams.has(r.team);
      const cls = i < 2 ? "adv" : third ? "third" : "out";
      return `<div class="grp-row ${cls}">
        <span class="r-code">${CODE(r.team) || "·"}</span>
        <span class="r-team">${r.team}${r.host ? " <small>(H)</small>" : ""}</span>
        <span class="r-num">${r.w}-${r.d}-${r.l}</span>
        <span class="r-num">${r.gd > 0 ? "+" : ""}${r.gd}</span>
        <span class="r-pts">${r.pts}</span>
      </div>`;
    }).join("");
    html += `<div class="grp-card" data-reveal>
      <div class="grp-head">
        <span class="grp-name">Group <em>${g}</em></span>
        <span class="grp-winner-tag">${CODE(grp.standings[0].team)} top</span>
      </div>
      <div class="grp-cols"><span></span><span>Team</span><span>W-D-L</span><span>GD</span><span>Pts</span></div>
      ${rows}
    </div>`;
  });
  grid.innerHTML = html;
}

/* ───────────────────────── fixtures render ───────────────────────── */

function renderFixtures() {
  const pills = document.getElementById("fixturePills");
  const list = document.getElementById("fixtureList");

  const groupsOf = ["All", ...Object.keys(WC.groups)];
  pills.innerHTML = groupsOf.map((g, i) =>
    `<button class="fx-pill${i === 0 ? " on" : ""}" role="tab" aria-selected="${i === 0}" data-g="${g}">${g === "All" ? "All groups" : "Group " + g}</button>`
  ).join("");

  /* flatten fixtures with their group, sort chronologically */
  const all = [];
  Object.keys(WC.groups).forEach((g) => WC.groups[g].fixtures.forEach((f) => all.push({ ...f, g })));
  all.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  let html = "", lastDate = "";
  all.forEach((f) => {
    if (f.date !== lastDate) {
      lastDate = f.date;
      html += `<p class="fx-date" data-g-row="hdr" data-date="${f.date}">${fmtDate(f.date)} — Matchday</p>`;
    }
    const hw = f.hs > f.aws, aw = f.aws > f.hs;
    html += `<div class="fx-row" data-g-row="${f.g}" data-date="${f.date}">
      <span class="fx-grp">${f.g}</span>
      <span class="fx-team fx-home${hw ? " fx-w" : ""}">${f.home}</span>
      <span class="fx-score">${f.hs}–${f.aws}</span>
      <span class="fx-team${aw ? " fx-w" : ""}">${f.away}</span>
      <span class="fx-grp fx-code-away">${CODE(f.away) || ""}</span>
      <span class="fx-venue">${f.venue || ""}${f.city ? " · " + f.city : ""}</span>
    </div>`;
  });
  list.innerHTML = html;

  pills.addEventListener("click", (e) => {
    const btn = e.target.closest(".fx-pill");
    if (!btn) return;
    pills.querySelectorAll(".fx-pill").forEach((p) => { p.classList.toggle("on", p === btn); p.setAttribute("aria-selected", p === btn); });
    const g = btn.dataset.g;
    const rows = [...list.querySelectorAll(".fx-row")];
    const visibleDates = new Set();
    rows.forEach((r) => {
      const show = g === "All" || r.dataset.gRow === g;
      r.classList.toggle("fx-hidden", !show);
      if (show) visibleDates.add(r.dataset.date);
    });
    list.querySelectorAll(".fx-date").forEach((h) => h.classList.toggle("fx-hidden", !visibleDates.has(h.dataset.date)));
    if (!RM) gsap.fromTo(list, { opacity: 0.35 }, { opacity: 1, duration: 0.45, ease: "power2.out" });
    ScrollTrigger.refresh();
  });
}

/* ───────────────────────── motion & chrome ───────────────────────── */

const ACCENTS = { hero: "#C9A24B", bracket: "#E03A4E", groups: "#12A150", fixtures: "#3B6FE0", end: "#C9A24B" };
function setChapter(name) {
  document.body.dataset.chapter = name;
  gsap.to("html", { "--accent": ACCENTS[name], duration: 0.9, ease: "power2.out" });
}

/* hero chip + subtitle reflect actual tournament state — computed from
   the data, not hardcoded, so a mid-tournament re-run of this page never
   goes stale and a finished tournament never claims to still be "live" */
function updateHeroState() {
  const F = KO[WC.bracket.final];
  const chip = document.getElementById("liveChip");
  const sub = document.getElementById("roadSub");
  const note = document.getElementById("footerNote");
  if (F && F.hs !== null) {
    chip.classList.add("chip-final");
    chip.innerHTML = `<span class="live-dot live-dot-static" aria-hidden="true"></span>Full time · ${F.w} are Champions`;
    sub.textContent = `Every result of the FIFA World Cup 2026™ — twelve groups, one bracket, one champion: ${F.w}.`;
    if (note) note.innerHTML = `A concept showcase. Not affiliated with FIFA or adidas.<br />Final results — the tournament concluded ${fmtDate(F.date)}, 2026.`;
    return;
  }
  /* tournament still in progress — name the furthest round with an unplayed match */
  const order = ["R32", "R16", "QF", "SF", "3P", "F"];
  let current = "Group Stage";
  order.forEach((r) => {
    if (Object.values(KO).some((m) => m.round === r && m.hs === null)) current = ROUND_NAMES[r] || r;
  });
  chip.innerHTML = `<span class="live-dot" aria-hidden="true"></span>Live · ${current}`;
}

let lenis = null;

function boot() {
  updateHeroState();
  renderBracket();
  renderGroups();
  renderFixtures();
  buildLinks();
  bracketDrag();

  if (!RM) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => { if (lenis) lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  /* hero entrance */
  const wave = document.getElementById("roadWave");
  const wl = wave.getTotalLength();
  wave.style.strokeDasharray = wl;
  wave.style.strokeDashoffset = RM ? 0 : wl;

  if (!RM) {
    gsap.timeline({ defaults: { ease: "power3.out" } })
      .to(".road-title .line-inner", { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.85, stagger: 0.12 }, 0.1)
      .to(wave, { strokeDashoffset: 0, duration: 1.3, ease: "power2.inOut" }, 0.5);
  } else {
    gsap.set(".road-title .line-inner", { opacity: 1, y: 0, filter: "blur(0px)" });
  }

  /* generic reveals */
  gsap.utils.toArray("[data-reveal]").forEach((el) => {
    if (RM) { el.classList.add("in"); return; }
    gsap.fromTo(el, { opacity: 0, y: 24, filter: "blur(8px)" },
      { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.9, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 85%" },
        onComplete: () => el.classList.add("in") });
  });

  /* bracket cards cascade — center-out, like the wave */
  if (!RM) {
    const cards = gsap.utils.toArray("#bracketStage .bk-match");
    gsap.fromTo(cards, { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.7, ease: "power2.out", stagger: { each: 0.02, from: "center" },
        scrollTrigger: { trigger: "#bracket", start: "top 65%", once: true } });
  } else {
    gsap.set("#bracketStage .bk-match", { opacity: 1 });
  }
  animateLinks();

  /* progress rail */
  gsap.to("#progressLine", {
    scaleY: 1, ease: "none",
    scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.4 },
  });

  /* chapter accents */
  [["#top", "hero"], ["#bracket", "bracket"], ["#groups", "groups"], ["#fixtures", "fixtures"], [".road-end", "end"]]
    .forEach(([sel, name]) => {
      ScrollTrigger.create({ trigger: sel, start: "top 55%", end: "bottom 55%", onEnter: () => setChapter(name), onEnterBack: () => setChapter(name) });
    });

  /* magnetic CTA */
  document.querySelectorAll(".magnetic").forEach((btn) => {
    btn.addEventListener("pointermove", (e) => {
      if (RM) return;
      const r = btn.getBoundingClientRect();
      gsap.to(btn, { x: ((e.clientX - r.left) / r.width - 0.5) * 20, y: ((e.clientY - r.top) / r.height - 0.5) * 20, duration: 0.35, ease: "power2.out" });
    });
    btn.addEventListener("pointerleave", () => gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" }));
  });

  /* smooth anchors */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const target = document.querySelector(a.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { duration: 1.4 });
      else target.scrollIntoView({ behavior: RM ? "auto" : "smooth" });
    });
  });

  /* keep connectors honest on resize */
  let rto;
  window.addEventListener("resize", () => {
    clearTimeout(rto);
    rto = setTimeout(() => { buildLinks(); if (RM) return; linkSpecs.forEach((l) => { l.el.style.strokeDasharray = "none"; l.el.style.strokeDashoffset = "0"; }); }, 200);
  });

  /* verify-mode deep link */
  const jump = new URLSearchParams(location.search).get("jump");
  if (jump) {
    if (lenis) { lenis.destroy(); lenis = null; }
    gsap.set("[data-reveal], #bracketStage .bk-match", { opacity: 1, y: 0, clearProps: "filter" });
    linkSpecs.forEach((l) => { l.el.style.strokeDasharray = "none"; l.el.style.strokeDashoffset = "0"; });
    window.scrollTo(0, window.innerHeight * parseFloat(jump));
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
