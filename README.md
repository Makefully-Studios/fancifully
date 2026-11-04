# @makefully/fancifully

DOM-based interactive storybook engine with SpringRoll-friendly audio buses, VO↔text cue sync, hotspots, and a unified two-leaf page flip (single-page mode keeps a blank leaf offscreen so turns animate the same way).

## Install

```bash
npm install @makefully/fancifully
# optional peer for host mute/volume/captions
npm install springroll
```

## Publishing (maintainers)

Releases match other Makefully packages (`@makefully/platypus`, `@makefully/notefully`):

1. Bump `version` in `package.json` and add a `## [x.y.z]` section in `CHANGELOG.md`.
2. Merge to `main` (or run the **Release** workflow manually).
3. GitHub Actions tests, builds, publishes to npm via **OIDC trusted publisher**, and creates a GitHub release.

One-time npm setup (org owner): on [npmjs.com](https://www.npmjs.com) → `@makefully` → **Trusted Publishers** → add GitHub Actions for repo `Makefully-Studios/fancifully`, workflow `release.yml`, environment blank / as configured.

Local dry-run: `npm run pack:check`

## Quick start (standalone)

```ts
import { Storybook } from '@makefully/fancifully';
import '@makefully/fancifully/fancifully.css';

const book = await Storybook.create(document.getElementById('app')!, {
  story: './stories/demo/story.json', // or './book.fanci' / './book.epub' / File
  baseUrl: './stories/demo/',         // used for loose JSON + relative assets
});

book.next();
book.prev();
book.playReadAloud();
book.setLayoutMode('responsive'); // 'single' | 'two-page' | 'responsive' | 'auto'
book.setFlipSpeed(300);
book.setFlipStyle('default');
```

### Flip style & speed

Page turns go through a `FlipStyle` implementation. Flip style and speed are **host settings** on `Storybook.create` / the instance — not fields in story JSON.

| API | Role |
|-----|------|
| `StorybookOptions.flipStyle` | Id (`"default"`), `FlipStyle` subclass, or instance |
| `StorybookOptions.flipSpeed` | Duration in ms (default `400`) |
| `registerFlipStyle(id, Ctor)` | Expose a custom class for string lookup |
| `book.setFlipStyle` / `setFlipSpeed` | Change at runtime |

```ts
import { Storybook, FlipStyle, registerFlipStyle, type FlipContext } from '@makefully/fancifully';

class InstantFlipStyle extends FlipStyle {
  static id = 'instant';
  play(_ctx: FlipContext) {
    return Promise.resolve(); // no animation
  }
}

registerFlipStyle('instant', InstantFlipStyle);

await Storybook.create(el, {
  story: './story.json',
  flipStyle: InstantFlipStyle, // or 'instant' or new InstantFlipStyle()
  flipSpeed: 200,
});
```

Built-in: `DefaultFlipStyle` (`"default"`) — CSS 3D leaf turn. The engine uses the same `FlipStyle` base class for built-ins so new styles stay consistent.

## Chrome theming

Built-in Prev / Read / Next live under `.fc-chrome`. Customize via CSS variables on `.fc-root` (or a host class) and optional `chrome` options:

```ts
await Storybook.create(el, {
  story: './stories/demo/story.json',
  baseUrl: './stories/demo/',
  chrome: {
    className: 'my-theme fc-chrome--images', // image mode hides button text
    labels: { prev: 'Prev', read: 'Read', next: 'Next' },
    ariaLabels: { prev: 'Previous page', read: 'Read aloud', next: 'Next page' },
    // hidden: true, // host-owned nav calling book.prev() / next() / playReadAloud()
  },
});
```

| Variable | Role |
|----------|------|
| `--fc-chrome-bg` / `--fc-chrome-fg` | Chrome bar colors |
| `--fc-captions-bg` / `--fc-captions-fg` / `--fc-captions-bottom` | Caption line |
| `--fc-btn-border` / `--fc-btn-hover-bg` | Text button chrome |
| `--fc-btn-read-bg` / `--fc-btn-read-fg` | Read button fill |
| `--fc-btn-prev-image` / `--fc-btn-next-image` / `--fc-btn-read-image` | `url("…")` for image buttons |
| `--fc-btn-image-size` | Hit target when using `.fc-chrome--images` |

Prev/next disable at the first/last spread (`disabled` + `.is-disabled`).

## Editor mode

Pass `editor: true` to mount the corner **Edit** / **Preview** toggle. While editing, visible page leaves become [Fabric.js](http://fabricjs.com/) canvases (text/image blocks). Toolbar actions: add/remove page, front/back cover flags, hardback, and **Download book** (packs a `.fanci` ZIP via `packFanci`). Hotspots are preserved but not Fabric-editable. Hosts should gate the flag so production builds stay reader-only:

```ts
await Storybook.create(el, {
  story,
  baseUrl: './stories/demo/',
  editor: import.meta.env.DEV, // Vite: never true in `vite build`
});

// Or programmatically:
await book.enterEditor();
await book.downloadFanci(); // `{story.id}.fanci`
await book.exitEditor();
```

`fabric` is a dependency of `@makefully/fancifully` and loads via dynamic `import('fabric')` only when edit mode is entered.

### Drag & drop (edit mode)

| Drop | Result |
|------|--------|
| Font (`.woff2` / `.woff` / `.ttf` / `.otf`) on empty page | Sets the default text font and applies it to all textboxes; registered in `story.fonts` for `.fanci` export |
| Font on a textbox | Changes only that textbox’s `fontFamily` (still packed into `.fanci`) |
| Image (png/jpeg/gif/webp/svg/…) | Places a new image block on the canvas at the drop point |
| Text (`text/plain`, `text/html`, or `.txt`) | Creates a new textbox with that content |

Dropped fonts/images are stored as zip-relative paths under `fonts/` / `assets/` and included when you **Download book**.

## Embed with SpringRoll (Platypus-like)

```ts
import { Application } from 'springroll';
import { Storybook } from '@makefully/fancifully';
import '@makefully/fancifully/fancifully.css';

const app = new Application({
  features: {
    sound: true,
    soundVolume: true,
    vo: true,
    voVolume: true,
    sfx: true,
    captions: true,
  },
});

const book = await Storybook.create(container, {
  story: myStoryObject, // or URL
  baseUrl: '/books/hill/',
  springroll: app,
});

book.on('pagechange', ({ pageIds, index, layoutMode }) => {
  console.log(pageIds, index, layoutMode);
});
```

If `springroll` is omitted, Fancifully creates an `Application` (when the peer is available) and **holds SpringRoll `loaded` / `state.ready` until the story package is unpacked and assets are loaded** — same idea as Platypus waiting on preload before the container hides its loading UI.

While loading, Fancifully reports:

| Bellhop event | Payload |
|---------------|---------|
| `progress` | `number` 0–1 (classic Container loading bar) |
| `loading` | `{ stage, progress, count?, total?, detail? }` |

```ts
await Storybook.create(el, {
  story: './book.fanci',
  onProgress: ({ stage, progress }) => console.log(stage, progress),
});
```

## Story formats

| Input | Extension | Notes |
|-------|-----------|--------|
| Fancifully JSON | `.json` | Full fidelity; `baseUrl` resolves relative assets |
| Fancifully package | **`.fanci`** | ZIP of `story.json` + images/audio/vtt/fonts (relative paths). (`.fan` is already used by other software.) |
| EPUB | `.epub` | Import subset: spine pages, images, fonts/audio when present, Media Overlays → cues. No hotspots. |

```ts
// Packaged book
await Storybook.create(el, { story: './tales/hill.fanci' });

// EPUB (read-aloud if Media Overlays exist)
await Storybook.create(el, { story: fileInput.files[0], storyName: fileInput.files[0].name });
```

Pack a folder into `.fanci`:

```bash
npm run pack:fanci -- path/to/story-dir [out.fanci]
# or: node scripts/pack-fanci.mjs path/to/story-dir out.fanci
```

## Story JSON

Stories are JSON packages (not a single HTML document). Text may embed HTML; images/audio/vtt are asset references.

| Field | Purpose |
|-------|---------|
| `pageSize` | Authoring pixel size per leaf |
| `frontCover` | If true, first page is a closed cover (centered); opens with a tween; no blank to its left |
| `backCover` | If true, last page is a back cover (no blank to its right); can close centered at the end |
| `hardback` | If true (with a cover flag), cover boards are larger than interior pages so open spreads show a cover rim |
| `layout.mode` | `single` (one-page) \| `two-page` \| `responsive` (orientation) \| `auto` (width breakpoint) |
| `layout.singleBreakpoint` | Width where `auto` switches to two-page |
| `assets` | Map of image / audio / vtt / html |
| `pages[].blocks` | `text`, `image`, `hotspot` with `layout` boxes |
| `pages[].readAloud` | `{ audio, cues }` — cues are a VTT asset id or inline `{id,start,end}[]` |

### Layout modes

- **Always** a left+right spread under the hood (blank mates keep flip geometry).
- **`two-page`**: facing pairs — cover `[blank, p0]`, then `[p1, p2]`, …
- **`single` (one-page)**: one story page per spread with a blank mate (about 2× as many spreads). Blank leaf stays offscreen; same flip animation.
- **`responsive`**: landscape (width ≥ height) → two-page; portrait → single. Remaps to the same content page instantly when orientation changes.
- **`auto`**: legacy width breakpoint (`singleBreakpoint`).

When the resolved mode flips, Fancifully rebuilds spreads and jumps to the spread that contains the current page (no page-turn animation).

### Covers (`frontCover` / `backCover` / `hardback`)

- **Unset (default):** book starts open with a blank mate beside the first page (`[blank, p0]`) and a trailing blank after an orphan last page.
- **`frontCover: true`:** starts closed (cover centered). Next **page-flips** to the first interior spread (cover is not kept on screen). Open spreads omit the cover page.
- **`backCover: true`:** last page is omitted from open spreads; Next from the last interior spread **page-flips** to a centered back cover.
- **`hardback: true`:** cover boards are slightly larger than `pageSize` (~3.5% per edge). Closed covers use that larger board; when open, cover art stays behind the interior spread so a rim remains visible.

### VO ↔ text

Put stable `id`s on spans in text HTML. WebVTT cue identifiers should match those ids. While VO plays, matching spans get `is-active` / `is-read`. A separate captions line respects SpringRoll `captionsMuted`.

## Scripts

```bash
npm install
npm test
npm run dev    # demo app (Vite)
npm run build  # dist library + types
```

## License

MIT
