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
book.setLayoutMode('auto'); // 'single' | 'two-page' | 'auto'
```

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
npm run pack:fanci
# or: node scripts/pack-fanci.mjs path/to/story-dir out.fanci
```

## Story JSON

Stories are JSON packages (not a single HTML document). Text may embed HTML; images/audio/vtt are asset references.

| Field | Purpose |
|-------|---------|
| `pageSize` | Authoring pixel size per leaf |
| `layout.mode` | `single` \| `two-page` \| `auto` |
| `layout.singleBreakpoint` | Width where `auto` switches to two-page |
| `assets` | Map of image / audio / vtt / html |
| `pages[].blocks` | `text`, `image`, `hotspot` with `layout` boxes |
| `pages[].readAloud` | `{ audio, cues }` — cues are a VTT asset id or inline `{id,start,end}[]` |

### Layout modes

- **Always** a left+right spread under the hood.
- **`two-page`**: both leaves visible.
- **`single`**: leading blank leaf stays offscreen; same flip animation.
- **`auto`**: picks by container width.

Cover is blank+cover; interior pages pair; a final orphan gets a blank mate.

### VO ↔ text

Put stable `id`s on spans in text HTML. WebVTT cue identifiers should match those ids. While VO plays, matching spans get `is-active` / `is-read`. A separate captions line respects SpringRoll `captionsMuted`.

## Scripts

```bash
npm install
npm test
npm run dev    # demo (Vite; default port 5174, or next free port)
npm run build  # dist library + types
```

## License

MIT
