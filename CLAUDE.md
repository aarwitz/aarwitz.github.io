# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal portfolio/blog site (aarwitz.github.io) served directly by GitHub Pages from the repo root. There is no build system, framework, linter, or test suite — every page is a self-contained static HTML file in a flat root directory, styled with the Tailwind CDN plus inline `<style>` blocks (dark theme, `#0d1117`/`#0b1220` backgrounds, Optima/Inter fonts). Deploying = pushing to `main`.

## Local preview

Pages must be served over HTTP, not opened as `file://`, because the shared header and card previews are loaded with `fetch()`:

```bash
python3 -m http.server   # then open http://localhost:8000
```

## Architecture

- **Shared header**: pages contain `<div id="site-header"></div>` and load `include_header.js` (defer), which fetches `header.html` at runtime and injects it. `header.html` holds the site nav (Projects/Essays/Blog/Notes/About) and its own styles so it stays self-contained. Edit it once to change nav everywhere.
- **Listing pages** (`projects.html`, `essays.html`, `Notes.html`, `blog.html`, `index.html`) contain hand-written card `<a>` blocks linking to article pages. Cards that include an empty `<div id="*-preview">` are auto-filled by `preview.js`: it fetches the linked page, extracts the first paragraph longer than 100 characters and the first `<img>`/`<video>`, and renders them as the preview. Consequences when writing an article page: give it a substantial early paragraph, and for videos either set a `poster` attribute or provide a `<basename>-poster.jpg` next to the `.webm`.
- **Adding a new article** = create a standalone HTML page (copy an existing one for the head/header boilerplate) and add a card for it on the relevant listing page.
- **`link_preview.js` / `link_preview.css`** is a separate, gwern-style click-to-preview system used only by the demo/test pages (`LinkPreviewDemo.html`, `test_preview.html`, `test_external_preview.html`) — not by the real listing pages, which use `preview.js`.
- Math-heavy pages load MathJax 3 from CDN.

## Git LFS gotcha (important)

`.gitattributes` routes `*.gif`, `*.mp4`, `*.webm`, `*.pdf` through Git LFS, but GitHub Pages serves LFS pointer files as-is — the media silently breaks. Every media file actually referenced by a page is therefore exempted in `.gitattributes` with `-filter -diff -merge -text`. When adding a new video/PDF that a page references, add an exemption line for it **before** committing, and verify the committed blob is real bytes, not a ~130-byte LFS pointer (`git show HEAD:file.webm | head -c 100`).
