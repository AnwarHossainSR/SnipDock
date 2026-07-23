# SnipDock GitHub Pages Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a responsive SnipDock product page whose primary action downloads the latest GitHub release.

**Architecture:** Keep the marketing site isolated in `site/` as dependency-free HTML and CSS. A GitHub Actions workflow uploads that directory unchanged and deploys it through GitHub Pages; repository metadata then points to the deployed project URL.

**Tech Stack:** HTML5, CSS, Bun tests, GitHub Actions, GitHub Pages

## Global Constraints

- Public URL: `https://anwarhossainsr.github.io/SnipDock/`
- Latest-release URL: `https://github.com/AnwarHossainSR/SnipDock/releases/latest`
- Reuse SnipDock’s Plus Jakarta Sans, Inter, JetBrains Mono, warm-neutral palette, and teal accent.
- Add no package or runtime dependency.
- Preserve light/dark system themes, visible keyboard focus, reduced motion, and mobile layout.
- Keep the desktop Vite/Tauri application unchanged.

## File Map

- Create `site/index.html`: semantic landing-page content and links.
- Create `site/styles.css`: responsive visual system and clipboard-stack illustration.
- Create `site/icon.png`: copied existing SnipDock icon used by page and favicon.
- Create `site/fonts/*.woff2`: copied existing SnipDock font files.
- Create `src/test/github-pages.test.ts`: runnable structural checks for the static site.
- Create `.github/workflows/pages.yml`: buildless GitHub Pages deployment.
- Modify repository metadata remotely: enable workflow-based Pages and set homepage URL.

---

### Task 1: Static Product Page

**Files:**
- Create: `site/index.html`
- Create: `site/styles.css`
- Create: `site/icon.png`
- Create: `site/fonts/PlusJakartaSans-Variable.woff2`
- Create: `site/fonts/Inter-Variable.woff2`
- Create: `site/fonts/JetBrainsMono-Variable.woff2`
- Test: `src/test/github-pages.test.ts`

**Interfaces:**
- Consumes: existing `public/favicon.png` as the product icon source.
- Produces: a self-contained static directory deployable at the `/SnipDock/` subpath.

- [ ] **Step 1: Write the failing structural test**

Create `src/test/github-pages.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

const root = new URL("../../site/", import.meta.url);

describe("GitHub Pages site", () => {
  test("contains semantic product content and canonical actions", async () => {
    const html = await Bun.file(new URL("index.html", root)).text();

    expect(html).toContain("<main");
    expect(html).toContain("Clipboard, organized. Locally.");
    expect(html).toContain(
      'href="https://github.com/AnwarHossainSR/SnipDock/releases/latest"',
    );
    expect(html).toContain(
      'href="https://github.com/AnwarHossainSR/SnipDock"',
    );
    expect(html).toContain('href="styles.css"');
    expect(html).toContain('src="icon.png"');
    expect(html).not.toMatch(/(?:href|src)="\/(?!\/)/);
  });

  test("keeps accessibility and responsive safeguards", async () => {
    const css = await Bun.file(new URL("styles.css", root)).text();

    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("@media (max-width:");
    expect(await Bun.file(new URL("icon.png", root)).exists()).toBe(true);
    for (const font of [
      "PlusJakartaSans-Variable.woff2",
      "Inter-Variable.woff2",
      "JetBrainsMono-Variable.woff2",
    ]) {
      expect(await Bun.file(new URL(`fonts/${font}`, root)).exists()).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
bun test src/test/github-pages.test.ts
```

Expected: FAIL because `site/index.html`, `site/styles.css`, and `site/icon.png`
do not exist.

- [ ] **Step 3: Add semantic page content**

Create `site/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="SnipDock is a cross-platform, offline clipboard and snippet manager."
    />
    <meta name="theme-color" content="#f6f7f6" />
    <title>SnipDock — Clipboard, organized locally</title>
    <link rel="icon" href="icon.png" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="./" aria-label="SnipDock home">
        <img src="icon.png" alt="" width="36" height="36" />
        <span>SnipDock</span>
      </a>
      <nav aria-label="Primary navigation">
        <a href="#features">Features</a>
        <a href="#privacy">Privacy</a>
        <a
          class="button button-small"
          href="https://github.com/AnwarHossainSR/SnipDock/releases/latest"
        >Download</a>
      </nav>
    </header>

    <main>
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Offline clipboard workspace</p>
          <h1>Clipboard,<br /><span>organized. Locally.</span></h1>
          <p class="lede">
            Capture clipboard history, keep reusable snippets, fill templates,
            and reach developer tools without sending your content away.
          </p>
          <div class="actions">
            <a
              class="button"
              href="https://github.com/AnwarHossainSR/SnipDock/releases/latest"
            >Download latest release</a>
            <a
              class="text-link"
              href="https://github.com/AnwarHossainSR/SnipDock"
            >View source <span aria-hidden="true">↗</span></a>
          </div>
          <p class="platforms">Windows · macOS · Linux</p>
        </div>

        <div class="clip-stack" aria-label="A preview of organized clipboard items">
          <div class="clip clip-back">
            <span class="clip-type">COMMAND</span>
            <code>bun run tauri dev</code>
          </div>
          <div class="clip clip-middle">
            <span class="clip-type">COLOR</span>
            <strong><i></i>#0F9488</strong>
          </div>
          <div class="clip clip-front">
            <span class="clip-type">SNIPPET</span>
            <p>Ship the useful thing.<br />Keep the rest local.</p>
            <small>Copied just now</small>
          </div>
        </div>
      </section>

      <section class="feature-section" id="features">
        <div class="section-heading">
          <p class="eyebrow">One dock. Less hunting.</p>
          <h2>Everything you copy, ready when needed.</h2>
        </div>
        <div class="feature-grid">
          <article><span>⌘C</span><h3>Clipboard history</h3><p>Capture, filter, retain, clear, and undo with private-item safeguards.</p></article>
          <article><span>{ }</span><h3>Snippets & templates</h3><p>Keep commands, notes, and fillable templates organized by project and tag.</p></article>
          <article><span>⌕</span><h3>Fast retrieval</h3><p>Search across clipboard and library content from one focused workspace.</p></article>
          <article><span>↔</span><h3>Developer tools</h3><p>Encode, format, diff, test regex, inspect cron expressions, and more offline.</p></article>
        </div>
      </section>

      <section class="privacy" id="privacy">
        <p class="eyebrow">Private by default</p>
        <h2>Your clipboard stays on your machine.</h2>
        <p>
          Core data remains local. Production builds contact GitHub Releases
          only to check for and download signed updates.
        </p>
        <a href="https://github.com/AnwarHossainSR/SnipDock/blob/main/docs/privacy.md">Read the privacy model <span aria-hidden="true">→</span></a>
      </section>
    </main>

    <footer>
      <div class="brand"><img src="icon.png" alt="" width="30" height="30" /><span>SnipDock</span></div>
      <p>Open source under the MIT License.</p>
      <nav aria-label="Footer navigation">
        <a href="https://github.com/AnwarHossainSR/SnipDock/releases">Releases</a>
        <a href="https://github.com/AnwarHossainSR/SnipDock#documentation">Docs</a>
        <a href="https://github.com/AnwarHossainSR/SnipDock/blob/main/LICENSE">License</a>
      </nav>
    </footer>
  </body>
</html>
```

- [ ] **Step 4: Add the visual system**

Create `site/styles.css`:

```css
@font-face {
  font-family: "Plus Jakarta Sans";
  src: url("fonts/PlusJakartaSans-Variable.woff2") format("woff2");
  font-weight: 200 800;
  font-display: swap;
}

@font-face {
  font-family: "Inter";
  src: url("fonts/Inter-Variable.woff2") format("woff2");
  font-weight: 100 900;
  font-display: swap;
}

@font-face {
  font-family: "JetBrains Mono";
  src: url("fonts/JetBrainsMono-Variable.woff2") format("woff2");
  font-weight: 100 800;
  font-display: swap;
}

:root {
  color-scheme: light dark;
  --canvas: #f6f7f6;
  --surface: #ffffff;
  --surface-muted: #f0f1ef;
  --text: #16191c;
  --muted: #5b6169;
  --border: #dfe2de;
  --accent: #0f9488;
  --accent-strong: #0c7d73;
  --accent-soft: #dcf1ee;
  --shadow: 0 24px 70px rgb(20 24 28 / 12%);
  font-family: Inter, "Segoe UI", sans-serif;
  font-synthesis: none;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--canvas); color: var(--text); }
a { color: inherit; }
img { display: block; }

.site-header,
main,
footer {
  width: min(1120px, calc(100% - 40px));
  margin-inline: auto;
}

.site-header {
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
}

.brand { display: flex; align-items: center; gap: 10px; font: 700 1rem "Plus Jakarta Sans", "Segoe UI", sans-serif; text-decoration: none; }
.site-header nav, footer nav { display: flex; align-items: center; gap: 24px; }
.site-header nav > a:not(.button), footer a { color: var(--muted); text-decoration: none; }

.hero {
  min-height: 690px;
  display: grid;
  grid-template-columns: 1.02fr .98fr;
  align-items: center;
  gap: 80px;
  padding: 90px 0;
}

.eyebrow { margin: 0 0 18px; color: var(--accent-strong); font: 700 .72rem "JetBrains Mono", monospace; letter-spacing: .12em; text-transform: uppercase; }
h1, h2, h3 { font-family: "Plus Jakarta Sans", "Segoe UI", sans-serif; }
h1 { margin: 0; font-size: clamp(3.4rem, 7vw, 6.6rem); line-height: .92; letter-spacing: -.075em; }
h1 span { color: var(--muted); }
.lede { max-width: 590px; margin: 30px 0 0; color: var(--muted); font-size: 1.13rem; line-height: 1.7; }
.actions { display: flex; align-items: center; gap: 26px; margin-top: 34px; }
.button { display: inline-flex; min-height: 48px; align-items: center; justify-content: center; padding: 0 20px; border-radius: 7px; background: var(--accent); color: white; font-weight: 750; text-decoration: none; }
.button:hover { background: var(--accent-strong); }
.button-small { min-height: 38px; padding-inline: 15px; }
.text-link, .privacy a { color: var(--accent-strong); font-weight: 700; text-decoration: none; }
.platforms { margin-top: 24px; color: var(--muted); font: 600 .78rem "JetBrains Mono", monospace; }

.clip-stack { position: relative; min-height: 440px; }
.clip { position: absolute; width: min(390px, 88%); min-height: 180px; padding: 26px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); box-shadow: var(--shadow); }
.clip-back { top: 8px; right: 0; transform: rotate(5deg); }
.clip-middle { top: 125px; left: 0; transform: rotate(-4deg); }
.clip-front { right: 20px; bottom: 0; min-height: 215px; }
.clip-type { display: block; margin-bottom: 28px; color: var(--muted); font: 700 .68rem "JetBrains Mono", monospace; letter-spacing: .11em; }
.clip code, .clip strong, .clip p { font-size: 1.08rem; }
.clip strong { display: flex; align-items: center; gap: 10px; }
.clip i { width: 22px; height: 22px; border-radius: 50%; background: var(--accent); }
.clip p { line-height: 1.55; }
.clip small { color: var(--muted); }

.feature-section { padding: 110px 0; border-top: 1px solid var(--border); }
.section-heading { display: grid; grid-template-columns: .7fr 1.3fr; gap: 60px; align-items: start; }
h2 { max-width: 740px; margin: 0; font-size: clamp(2.2rem, 4.5vw, 4.2rem); line-height: 1.05; letter-spacing: -.055em; }
.feature-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; margin-top: 70px; background: var(--border); border: 1px solid var(--border); }
.feature-grid article { min-height: 270px; padding: 26px; background: var(--surface); }
.feature-grid article > span { color: var(--accent); font: 700 .8rem "JetBrains Mono", monospace; }
.feature-grid h3 { margin-top: 54px; font-size: 1.05rem; }
.feature-grid p, .privacy > p:not(.eyebrow), footer p { color: var(--muted); line-height: 1.65; }

.privacy { margin: 50px auto 120px; padding: 64px; border-radius: 12px; background: var(--accent-soft); }
.privacy p { max-width: 650px; }
footer { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 36px; min-height: 130px; border-top: 1px solid var(--border); font-size: .88rem; }

a:focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; border-radius: 3px; }

@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #0b0c0d;
    --surface: #141517;
    --surface-muted: #1a1c1e;
    --text: #eceded;
    --muted: #9ca0a4;
    --border: #2a2d30;
    --accent: #2dd4bf;
    --accent-strong: #55dfce;
    --accent-soft: #113330;
    --shadow: 0 24px 70px rgb(0 0 0 / 36%);
  }
}

@media (max-width: 820px) {
  .site-header nav > a:not(.button) { display: none; }
  .hero { grid-template-columns: 1fr; gap: 30px; padding: 72px 0; }
  .clip-stack { min-height: 390px; }
  .section-heading { grid-template-columns: 1fr; gap: 10px; }
  .feature-grid { grid-template-columns: 1fr 1fr; }
  footer { grid-template-columns: 1fr; padding: 30px 0; gap: 12px; }
}

@media (max-width: 520px) {
  .site-header, main, footer { width: min(100% - 28px, 1120px); }
  h1 { font-size: clamp(3.1rem, 16vw, 4.5rem); }
  .actions { align-items: flex-start; flex-direction: column; }
  .clip-stack { min-height: 340px; }
  .clip { padding: 20px; min-height: 150px; }
  .clip-middle { top: 95px; }
  .clip-front { min-height: 180px; }
  .feature-grid { grid-template-columns: 1fr; }
  .privacy { padding: 34px 24px; }
  footer nav { flex-wrap: wrap; gap: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
```

- [ ] **Step 5: Copy existing icon and fonts**

Run:

```powershell
Copy-Item -LiteralPath public/favicon.png -Destination site/icon.png
New-Item -ItemType Directory -Path site/fonts -Force | Out-Null
Copy-Item -LiteralPath src/assets/fonts/PlusJakartaSans-Variable.woff2 -Destination site/fonts/
Copy-Item -LiteralPath src/assets/fonts/Inter-Variable.woff2 -Destination site/fonts/
Copy-Item -LiteralPath src/assets/fonts/JetBrainsMono-Variable.woff2 -Destination site/fonts/
```

- [ ] **Step 6: Run focused and existing checks**

Run:

```powershell
bun test src/test/github-pages.test.ts
bun test
bun run build
```

Expected: focused test passes, full test suite passes, production build exits
successfully.

- [ ] **Step 7: Inspect responsive rendering**

Run:

```powershell
bun --bun vite site --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173/`. Inspect desktop and mobile widths, light and
dark schemes, visible keyboard focus, link targets, and no horizontal overflow.
Expected: no missing assets or browser-console errors.

- [ ] **Step 8: Commit the page**

```powershell
git add -- site/index.html site/styles.css site/icon.png site/fonts src/test/github-pages.test.ts
git commit -m "Add SnipDock product landing page"
```

---

### Task 2: GitHub Pages Workflow

**Files:**
- Create: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: static artifact directory `site/`.
- Produces: GitHub Pages deployment on `main` pushes or manual dispatch.

- [ ] **Step 1: Add the buildless deployment workflow**

Create `.github/workflows/pages.yml`:

```yaml
name: Pages

on:
  push:
    branches: [main]
    paths:
      - "site/**"
      - ".github/workflows/pages.yml"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload site
        uses: actions/upload-pages-artifact@v4
        with:
          path: site

      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Verify workflow shape**

Run:

```powershell
rg -n "branches: \\[main\\]|path: site|configure-pages@v5|upload-pages-artifact@v4|deploy-pages@v4" .github/workflows/pages.yml
git diff --check
```

Expected: all five deployment details appear; `git diff --check` exits zero.

- [ ] **Step 3: Commit workflow**

```powershell
git add -- .github/workflows/pages.yml
git commit -m "Deploy landing page with GitHub Pages"
```

---

### Task 3: Publish and Connect Repository URL

**Files:**
- No local files.
- Remote changes: `dev` branch, pull request, Pages settings, repository homepage.

**Interfaces:**
- Consumes: committed page and deployment workflow.
- Produces: public Pages URL and populated GitHub About website field.

- [ ] **Step 1: Confirm clean intentional history**

Run:

```powershell
git status --short
git log --oneline origin/main..HEAD
```

Expected: clean worktree and only the approved design, plan, page, test, and
workflow commits ahead of `origin/main`.

- [ ] **Step 2: Push and open the review pull request**

Run:

```powershell
git push origin dev
gh pr create --base main --head dev --title "Add SnipDock GitHub Pages site" --body "Adds a static product landing page, deployment workflow, and structural checks. The primary action downloads the latest release."
```

Expected: GitHub returns the new pull-request URL.

- [ ] **Step 3: Merge after user review**

After explicit user approval of the pull request, merge using the repository’s
selected merge strategy. Do not merge before approval.

- [ ] **Step 4: Enable workflow-based Pages**

Run once after the workflow reaches `main`:

```powershell
gh api --method POST repos/AnwarHossainSR/SnipDock/pages -f build_type=workflow
```

Expected: HTTP 201 response containing
`"html_url":"https://anwarhossainsr.github.io/SnipDock/"`. If Pages was already
created, use:

```powershell
gh api --method PUT repos/AnwarHossainSR/SnipDock/pages -f build_type=workflow
```

Expected: HTTP 204.

- [ ] **Step 5: Run and monitor deployment**

Run:

```powershell
gh workflow run Pages --repo AnwarHossainSR/SnipDock --ref main
gh run list --repo AnwarHossainSR/SnipDock --workflow Pages --limit 1
```

Wait for the newest run to complete, then inspect failures with:

```powershell
gh run view --repo AnwarHossainSR/SnipDock --log-failed
```

Expected: Pages workflow concludes `success`.

- [ ] **Step 6: Verify public response and page content**

Run:

```powershell
$response = Invoke-WebRequest -Uri 'https://anwarhossainsr.github.io/SnipDock/'
$response.StatusCode
$response.Content -match 'Clipboard, organized\\. Locally\\.'
```

Expected:

```text
200
True
```

- [ ] **Step 7: Add the Pages URL to GitHub About**

Run:

```powershell
gh repo edit AnwarHossainSR/SnipDock --homepage "https://anwarhossainsr.github.io/SnipDock/"
gh repo view AnwarHossainSR/SnipDock --json homepageUrl
```

Expected:

```json
{"homepageUrl":"https://anwarhossainsr.github.io/SnipDock/"}
```
