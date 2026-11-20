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
book.setLayoutMode('responsive'); // reader setting: single* | two-page | responsive | auto
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

### Reader layout

Single page vs facing spread is a **host setting**, like flip style. Stories store a list of pages. The reader decides how to pair them. Legacy `layout` objects in story JSON are ignored.

| API | Role |
|-----|------|
| `StorybookOptions.layoutMode` | `single`, `single-right`, `single-left`, `two-page`, `responsive`, or `auto` (default) |
| `StorybookOptions.singleBreakpoint` | Width where `auto` switches to two-page (default `900`) |
| `book.setLayoutMode` | Change at runtime |
| `book.layoutPreference` | The host mode, before it resolves |
| `book.layoutMode` | Resolved one-page mode or `two-page` |

- **`two-page`**: facing pairs. With a front cover, open spreads start after the cover.
- **`single`**: one story page per turn; content alternates left/right with a blank mate offscreen (classic verso/recto).
- **`single-right`**: one page per turn, always on the right; blank left offscreen. Next peels the right leaf; prev swings the incoming page in over it.
- **`single-left`**: one page per turn, always on the left; blank right offscreen. Next peels the left leaf; prev swings the incoming page in over it.
- **`responsive`**: landscape (width ≥ height) → two-page; portrait → classic `single`.
- **`auto`**: two-page when the stage is at least `singleBreakpoint` wide; else classic `single`.

When the resolved mode changes, spreads rebuild and the view jumps to the spread that contains the current page.

## Chrome theming

The package CSS is **structure-first**: layout for stage, spreads, chrome, and cues, plus neutral defaults. Decorative look-and-feel belongs in the host (or the editor). Built-in Prev / Read / Next live directly under `.fc-chrome` — no editor chrome wrappers. Customize via CSS variables on `.fc-root` (or a host class) and optional `chrome` options:

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

## Authoring / editor

This package is the **player + story API** (load/render/playback, programmatic page mutations, `packFanci`, fabric-like JSON ingest). The Maker UI (Fabric overlays, page list, themes) lives in sibling [`@makefully/fancifully-editor`](../fancifully-editor):

```ts
import { Storybook } from '@makefully/fancifully';
import { attachEditor } from '@makefully/fancifully-editor';
import '@makefully/fancifully/fancifully.css';
import '@makefully/fancifully-editor/editor.css';

const book = await Storybook.create(el, { story });
attachEditor(book, { enter: true });
```

Write helpers on `Storybook` include `addPage`, `removePage`, `reorderPages`, `setFrontCover` / `setBackCover` / `setHardback`, `updatePage`, `replaceStory`, `downloadFanci`, plus leaf-host APIs for overlays (`getEditableLeaves`, `setPageViewsHidden`, `setNavLocked`).

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
| `cueHighlightColor` | CSS color for in-page VO cue highlight (host option can override) |
| `frontCover` | If true, first page is a closed cover (centered); opens with a tween; no blank to its left |
| `backCover` | If true, last page is a back cover (no blank to its right); can close centered at the end |
| `hardback` | If true (with a cover flag), cover boards are larger than interior pages so open spreads show a cover rim |
| `assets` | Map of image / audio / vtt / html |
| `pages[].blocks` | `text`, `image`, `hotspot`, `area` with `layout` boxes |
| `pages[].blocks[]` (text) `readAloud` / `voOrder` | Preferred per-textbox VO; clips play in `voOrder` then block order |
| `pages[].readAloud` | Legacy page VO `{ audio, cues }` when no text block has `readAloud` |

`pages` is always a flat list. Facing pages are a reader presentation, not a stored spread.

### Hotspots

`hotspot` blocks are invisible hit targets. Each tap runs `onTap` actions:

| Action | Effect |
|--------|--------|
| `{ play: assetId }` | Play an audio asset on the SFX bus |
| `{ toggleClass: { target, className } }` | Toggle a class on `[data-block-id=target]` |
| `{ addClass: { target, className } }` | Add a class (one-way reveal) |
| `{ removeClass: { target, className } }` | Remove a class |
| `{ replayClass: { target, className } }` | Remove then re-add next frame (CSS bursts every tap) |
| `{ toggleReadAloudAutoPlay: ['page','off'] }` | Cycle host `readAloudAutoPlay` through the listed modes; hotspot gets `is-autoplay-off` when mode is `off` |

Optional `requiredTaps` counts taps; after N taps, `onComplete` runs **once** (each tap still runs `onTap`). Optional `className` is applied on the hotspot element.

### Area blocks (host minigames)

`area` marks a rectangle for a host-provided game. Fancifully mounts an empty `.fc-block-area` host; the host registers the game:

```ts
import { Storybook, registerPageGame } from '@makefully/fancifully';

registerPageGame('my.toys-sort', (ctx) => {
  // ctx.el is the mount host; call ctx.onComplete() when finished
  ctx.el.textContent = 'Play here';
  const done = document.createElement('button');
  done.textContent = 'Done';
  done.onclick = () => ctx.onComplete();
  ctx.el.append(done);
  return { destroy() { ctx.el.replaceChildren(); } };
});

await Storybook.create(el, {
  story: './story.json',
  pageGames: {
    // optional per-instance override of the global registry
    'my.toys-sort': (ctx) => ({ destroy() {} }),
  },
});
```

| Field | Purpose |
|-------|---------|
| `game` | Registry id (`registerPageGame` / `pageGames`) |
| `params` | Opaque JSON for the host game |
| `requireComplete` | When true, prev/next/swipe stay locked until `onComplete` |
| `ariaLabel` | Accessibility label on the host |

Listen for `areacomplete: { pageId, blockId, game }` for analytics. On page leave / `replaceStory` / destroy, each area’s `destroy()` runs and its `signal` aborts.

### Covers (`frontCover` / `backCover` / `hardback`)

- **Unset (default):** book starts open with a blank mate beside the first page (`[blank, p0]`) and a trailing blank after an orphan last page.
- **`frontCover: true`:** starts closed (cover centered). Next **page-flips** to the first interior spread (cover is not kept on screen). Open spreads omit the cover page.
- **`backCover: true`:** last page is omitted from open spreads; Next from the last interior spread **page-flips** to a centered back cover.
- **`hardback: true`:** cover boards are slightly larger than `pageSize` (~3.5% per edge). Closed covers use that larger board; when open, cover art stays behind the interior spread so a rim remains visible.

### VO ↔ text

When a page mounts, Fancifully wraps matching cue payloads into `<span data-cue-id class="fc-cue">` (word- or phrase-level VTT both work) so line breaks stay fixed before read-aloud starts. Prefer `readAloud` on text blocks (`voOrder` optional); page-level `readAloud` remains as a fallback. Host `readAloudAutoPlay` is `'off'` (default), `'page'` (play VO when the page becomes active), or `'book'` (same, then auto-`next()` when clips finish). Set `textTapReadAloud: true` so tapping a VO textbox starts/stops that clip. During playback, matching spans get `is-active`; already-spoken cues also get `is-read` by default (`cueReadHighlight`, or `book.setCueReadHighlight(false)` for active-word-only). Highlight color comes from story `cueHighlightColor`, overridable by `cueHighlightColor` / `setCueHighlightColor` (or CSS `--fc-cue-active-bg` / `--fc-cue-read-bg`).

**Dual captions path:** in-page highlight always comes from sidecar word/phrase VTT. The bottom `.fc-captions` line prefers **embedded MP3 ID3 SYLT** tracks (descriptor `captions`, ~line length) when present; otherwise it can mirror highlight cues. Story VO captions are on by default (`readAloudCaptions: true`); set `false` when in-page highlight is enough. Instruction VO still uses `.fc-captions` (embedded SYLT or sidecar fallback), gated by SpringRoll `captionsMuted`.

### Page triggers (attention + instruction VO)

Pages may declare `triggers` that fire after story read-aloud or on page enter:

| Field | Role |
|--------|------|
| `when` | `afterReadAloud` (story VO finished / empty) or `pageEnter` |
| `delayMs` | Pause before firing (e.g. `600` after VO, `5000` when autoplay is off) |
| `whenAutoPlay` | Optional filter: only run when host mode is one of these (`off` / `page` / `book`) |
| `highlight` | Add `fc-attention` (or custom `className`) to `targets` (default: hotspots + areas). `mode: 'rect' \| 'art'` — rect pulse for now |
| `readAloud` | Optional instruction clip (separate from story text VO) |

Attention clears on navigate, hotspot tap, or area complete. `voend` emits `{ phase: 'story' \| 'instruction' }`. In `book` autoplay, advance waits for instruction VO when present. Instruction VO does **not** highlight in-page story text; its closed captions prefer embedded SYLT, with optional sidecar `-ix.vtt` as fallback, gated by SpringRoll `captionsMuted`.

## Scripts

```bash
npm install
npm test
npm run dev    # demo app (Vite)
npm run build  # dist library + types
```

## License

MIT
