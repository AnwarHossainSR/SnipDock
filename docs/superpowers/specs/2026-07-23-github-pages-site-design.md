# SnipDock GitHub Pages Site Design

## Goal

Publish a compact product page at `https://anwarhossainsr.github.io/SnipDock/`
that explains SnipDock and sends visitors to the latest GitHub release.

## Structure

Create a standalone static site under `site/` and deploy it with a dedicated
GitHub Pages Actions workflow. The desktop Vite application remains unchanged;
the landing page uses plain HTML and CSS with no runtime dependencies.

## Page

The single responsive page contains:

- Header with SnipDock icon, repository link, and download action
- Hero headed “Clipboard, organized. Locally.”
- Primary link to `https://github.com/AnwarHossainSR/SnipDock/releases/latest`
- Secondary link to the GitHub repository
- Compact feature grid covering clipboard history, reusable snippets and
  templates, search and organization, and developer tools
- Privacy statement explaining local-first storage and release-only network use
- Platform support note for Windows, macOS, and Linux
- Footer links to releases, documentation, license, and source

## Visual Direction

Reuse SnipDock’s existing Plus Jakarta Sans, Inter, and JetBrains Mono fonts
and its warm-neutral palette with teal accent. Sharper corners and restrained
panels preserve the desktop-tool identity. The signature element is a
clipboard-stack product illustration built from HTML and CSS, avoiding generic
stock imagery and additional assets.

Support light and dark system themes. Layout collapses cleanly on narrow
screens. Interactive elements retain visible keyboard focus, adequate contrast,
and reduced-motion behavior.

## Deployment

Add a workflow that uploads `site/` as the Pages artifact and deploys on pushes
to `main`, with manual dispatch available. Configure the repository’s Pages
build source for GitHub Actions.

After successful deployment, set the GitHub repository homepage URL to
`https://anwarhossainsr.github.io/SnipDock/`.

## Verification

- Validate all relative asset paths under the `/SnipDock/` project subpath.
- Check semantic headings, link destinations, keyboard focus, light/dark
  themes, reduced motion, and mobile layout.
- Confirm the Pages workflow succeeds and the public URL returns the site.
- Confirm the GitHub About section displays the public URL.
