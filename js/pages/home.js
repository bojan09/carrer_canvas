import { icon } from "../utils/dom.js";
import { TEMPLATES } from "../templates/registry.js";
import { createTemplateCard } from "../components/template-card.js";
import { SAMPLE_PHOTO } from "../models/sample-photo.js";
import { mountInstallCard } from "../components/install-card.js";

const FEATURES = [
  ["shield-check", "Free", "No account needed"],
  ["lock", "Private", "Stays on your device"],
  ["file-text", "Professional", "Clean, modern layouts"],
  ["wifi-off", "Works offline", "After your first visit"],
];

export default function home(root) {
  const features = FEATURES.map(
    ([i, title, sub], n) => `<li class="feature rise" style-i="${n}">
      <span class="feature__icon">${icon(i)}</span>
      <span><span class="feature__title">${title}</span><span class="feature__sub">${sub}</span></span></li>`,
  ).join("");

  root.innerHTML = `
  <section class="hero" aria-labelledby="hero-title">
    <div class="container hero__grid">
      <div class="hero__copy">
        <p class="pill rise"><span class="pill__dot" aria-hidden="true"></span>Free · Private · Offline</p>
        <h1 class="hero__title rise" id="hero-title" tabindex="-1">Create a resume that <span class="grad-text">makes your work stand out</span></h1>
        <p class="hero__lead rise">Modern, professional resumes and cover letters. Live preview. Private by default. Free forever.</p>
        <div class="hero__cta rise">
          <a class="btn btn--primary btn--lg" href="#/resume">Create Resume</a>
          <a class="btn btn--outline btn--lg" href="#/templates">View Templates</a>
        </div>
        <ul class="feature-row">${features}</ul>
      </div>
      <div class="hero__visual">
        <div class="hero__stage" aria-hidden="true">
          <div class="mock mock--summit">
            <img class="mock__photo" data-sample-photo alt="" width="40" height="40" />
            <div class="mock__name">Alex Johnson</div>
            <div class="mock__bars"><i></i><i></i><i></i></div>
            <div class="mock__h">Experience</div>
            <div class="mock__bars"><i></i><i></i><i></i><i></i><i></i></div>
            <div class="mock__h">Education</div>
            <div class="mock__bars"><i></i><i></i><i></i></div>
          </div>
          <div class="mock mock--bloom">
            <img class="mock__photo" data-sample-photo alt="" width="40" height="40" />
            <div class="mock__name">Alex Johnson</div>
            <div class="mock__bars"><i></i><i></i></div>
            <div class="mock__h">Profile</div>
            <div class="mock__bars"><i></i><i></i><i></i><i></i></div>
            <div class="mock__h">Skills</div>
            <div class="mock__bars"><i></i><i></i></div>
          </div>
          <div class="mock mock--aurora">
            <div class="mock__rail"><i></i><i></i><i></i><i></i><i></i></div>
            <div class="mock__main">
              <div class="mock__head">
                <img class="mock__avatar" data-sample-photo alt="" width="64" height="64" />
                <div><div class="mock__name">Alex Johnson</div><div class="mock__role">Product Designer</div></div>
              </div>
              <div class="mock__h">About</div>
              <div class="mock__bars"><i></i><i></i><i></i></div>
              <div class="mock__chips"><span>Research</span><span>Prototyping</span><span>Systems</span></div>
              <div class="mock__h">Experience</div>
              <div class="mock__entry"><b>Role title</b><small>Company · 2022 – Present</small></div>
              <div class="mock__bars"><i></i><i></i><i></i></div>
              <div class="mock__entry"><b>Role title</b><small>Company · 2019 – 2022</small></div>
              <div class="mock__bars"><i></i><i></i></div>
              <span class="mock__sample-tag">Sample</span>
            </div>
          </div>
        </div>
        <p class="hero__caption">Illustrative layouts with fictional placeholder content and an illustrated sample avatar.</p>
      </div>
    </div>
  </section>

  <section class="section" aria-labelledby="templates-title">
    <div class="container">
      <div class="section__head">
        <p class="eyebrow">Templates</p>
        <h2 class="section__title" id="templates-title">Ten templates, built to be different</h2>
        <p class="section__lead">From a plain, ATS-conscious single column to expressive creative layouts. Pick the one that fits the role, not just the colour.</p>
      </div>
      <div class="teaser-strip" id="home-teaser" role="list"></div>
    </div>
  </section>

  <section class="section section--alt" aria-labelledby="how-title">
    <div class="container">
      <div class="section__head">
        <p class="eyebrow">How it works</p>
        <h2 class="section__title" id="how-title">From blank page to PDF in minutes</h2>
      </div>
      <ol class="steps-grid">
        <li class="step-card"><span class="step-card__num">1</span><h3>Write your content</h3><p>Fill in structured sections. Guidance prompts help you describe what you did, how, and what changed. Nothing is invented for you.</p></li>
        <li class="step-card"><span class="step-card__num">2</span><h3>Choose a design</h3><p>Switch templates and adjust colours, fonts and spacing while the preview updates. Your content stays exactly as written.</p></li>
        <li class="step-card"><span class="step-card__num">3</span><h3>Save as PDF</h3><p>Use your browser's Print dialog and choose Save as PDF. Text stays selectable. Print guidance is built in.</p></li>
      </ol>
    </div>
  </section>

  <section class="section" aria-labelledby="privacy-title">
    <div class="container">
      <div class="section__head">
        <p class="eyebrow">Private by design</p>
        <h2 class="section__title" id="privacy-title">Your resume never leaves your device</h2>
        <p class="section__lead">No accounts, no ads, no trackers and no uploads. Documents are stored only in this browser and are shared only when you download or print them.</p>
      </div>
      <div class="trust-grid">
        <article class="trust-card"><span class="trust-card__icon">${icon("lock")}</span><h3>Stays on your device</h3><p>Everything is kept in your browser's local storage. You decide when to export a file.</p></article>
        <article class="trust-card"><span class="trust-card__icon">${icon("wifi-off")}</span><h3>Works offline</h3><p>After your first successful visit the app is saved on your device and opens without a connection.</p></article>
        <article class="trust-card"><span class="trust-card__icon">${icon("file-text")}</span><h3>Honest about PDFs</h3><p>PDFs come from your browser's Print dialog, so results can vary slightly between browsers. We tell you what to check.</p></article>
      </div>
    </div>
  </section>

  <section class="section section--alt" aria-labelledby="install-title">
    <div class="container">
      <div class="install-band">
        <h3 id="install-title">Install on your phone or computer</h3>
        <p>CareerCanvas is a Progressive Web App. Install it for a full-screen experience and offline access on Android, iPhone, iPad and desktop.</p>
        <div id="home-install"></div>
      </div>
    </div>
  </section>

  <section class="section" aria-label="Project status">
    <div class="container">
      <div class="status-strip">${icon("info")}<p><strong>Early build.</strong> The offline app, resume editor, ten templates, design controls, print-to-PDF and backup are live. Cover letters are still being built.</p></div>
    </div>
  </section>

  <section class="container" aria-labelledby="cta-title">
    <div class="cta-band">
      <h2 id="cta-title">Ready to build something you're proud of?</h2>
      <p>Free, private and offline-ready. No sign-up required.</p>
      <a class="btn btn--primary btn--lg" href="#/resume">Create Resume</a>
    </div>
  </section>
  <div class="section"></div>`;

  // The hero rise-in stagger uses a CSS variable set via CSSOM (CSP-safe).
  root.querySelectorAll("[style-i]").forEach((el) => {
    el.style.setProperty("--i", el.getAttribute("style-i"));
    el.removeAttribute("style-i");
  });

  root.querySelectorAll("[data-sample-photo]").forEach((img) => {
    img.src = SAMPLE_PHOTO.data;
    img.removeAttribute("data-sample-photo");
  });

  const disposers = [];
  const strip = root.querySelector("#home-teaser");
  for (const t of TEMPLATES) {
    const card = createTemplateCard(t, { mode: "link" });
    disposers.push(card.destroy);
    strip.append(Object.assign(document.createElement("div"), { role: "listitem" }));
    strip.lastElementChild.append(card.el);
  }
  const stopInstall = mountInstallCard(root.querySelector("#home-install"));
  return () => {
    disposers.forEach((d) => d());
    stopInstall?.();
  };
}
