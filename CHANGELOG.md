# Changelog

All notable changes to this project will be documented in this file.

## [0.5.12]

### Fixed

- `readAloudCaptions: false` suppresses all story `.fc-captions` (including embedded SYLT); instruction VO still shows line CC

## [0.5.11]

### Added

- Embedded MP3 ID3 SYLT closed captions (descriptor `captions`, Platypus-style via `@probityrules/jsmediatags`)
- Dual cue streams: word/phrase sidecar VTT drives in-page `.fc-cue` highlight; line CC prefers embedded `captionCues` on audio load

### Changed

- Instruction VO CC prefers embedded SYLT (sidecar fallback); story caption mirroring remains gated by `readAloudCaptions` / SpringRoll `captionsMuted`

## [0.5.10]

### Fixed

- Instruction VO plays captions-only (no in-book `.fc-cue` highlight); story text highlight stays tied to story VO
- Instruction CC uses `.fc-captions` gated by SpringRoll `captionsMuted`, even when `readAloudCaptions: false` (story in-page only)
- `.fc-attention` outline wins over hotspot `:focus-visible { outline: none }`

## [0.5.9]

### Added

- Page `triggers` for post-story / page-enter attention highlights and optional instruction VO (`when: afterReadAloud | pageEnter`, `whenAutoPlay`, `highlight`, `readAloud`)
- `.fc-attention` pulsing bordered rectangle (highlight `mode: 'art'` reserved; same rect treatment for now)
- `voend` event with `{ phase: 'story' | 'instruction' }`; book auto-advance waits for instruction VO when present

## [0.5.8]

### Added

- Text-block `readAloud` / `voOrder` (preferred over page-level VO); page `readAloud` kept as fallback
- `StorybookOptions.readAloudAutoPlay`: `'off' | 'page' | 'book'` (replaces boolean `autoPlayReadAloud`; `true` still maps to `'page'`)
- `StorybookOptions.textTapReadAloud` — tap a VO textbox to start/stop that clip
- Hotspot tap action `toggleReadAloudAutoPlay` to cycle modes; mirrors `is-autoplay-off` on the hotspot

## [0.5.7]

### Added

- `StorybookOptions.cueReadHighlight` (default `true`) — soft trail on already-spoken in-page cues (`.is-read`); set `false` for active-word-only highlight
- Cue highlight side bleed via `box-shadow` (no layout shift)

### Fixed

- Apply VO cue wraps when the page mounts (not when read-aloud starts) so text layout stays stationary; cue highlight CSS no longer changes box metrics

## [0.5.6]

### Added

- Story `cueHighlightColor` (and host `StorybookOptions.cueHighlightColor` / `setCueHighlightColor`) for in-page VO cue highlight; host option overrides book data

## [0.5.5]

### Added

- `StorybookOptions.readAloudCaptions` (default `true`) — set `false` to skip the bottom caption line during page read-aloud when cues already highlight in-page text (`.fc-captions` stays available for other VO/CC)

## [0.5.4]

### Added

- `applyCueSpans`: while read-aloud plays, VTT cue `text` (word or phrase) is wrapped into `[data-cue-id]` spans so in-page highlight works without hand-authored markup

### Changed

- Text blocks also treat `[data-cue-id]` as cue targets (alongside `[id]`)

## [0.5.3]

### Fixed

- One-page layouts no longer use solo-cover collapse (first/last pages were offset offscreen with hardback)
- Fixed-side prev swings the incoming page in over the current page instead of peeling the current page away

## [0.5.2]

### Fixed

- Fixed-side flips (`single-right` / `single-left`) stage the destination page under the peeling leaf so the next/prev page is revealed

## [0.5.1]

### Fixed

- One-page hardback boards use a solid inside-cover color instead of cover artwork, so fixed-side flips no longer flash the back cover

## [0.5.0]

### Added

- Reader layouts `single-right` and `single-left`: one page per turn fixed on that side with a blank mate offscreen
- Default flip peels the content leaf for both next and prev in fixed-side modes (`FlipContext.contentSide`)

### Changed

- Classic `single` remains alternate left/right; `responsive` / `auto` still resolve to classic `single` or `two-page`

## [0.4.1]

### Changed

- Chrome buttons mount directly under `.fc-chrome` (no `fc-nav-peapod` wrapper; peapod grouping stays in the editor)
- Default package CSS is structure-first: solid `--fc-bg` and inherited font instead of a decorative gradient / Georgia stack

## [0.4.0]

### Added

- `area` story blocks for host-registered minigames (`registerPageGame`, `StorybookOptions.pageGames`)
- Area lifecycle: mount/destroy on spread change, `areacomplete` event, `requireComplete` nav gate
- Hotspot `requiredTaps` / `onComplete`, plus `addClass` / `removeClass` / `replayClass` tap actions
- Fabric-like interop for area descriptors

## [0.3.1]

### Changed

- Story `guides` keep only margin/gutter rails; show/snap toggles are editor prefs, not story fields

### Fixed

- Ignore `deploy/` build staging in git

## [0.3.0]

### Added

- Reader layout on the host: `StorybookOptions.layoutMode` / `singleBreakpoint`, `setLayoutMode`, and `layoutPreference` (default `auto`)
- Authoring fields: `coverSize`, `guides`, cover `innerColor`, and text `fontWeight` / `fontStyle`
- Fabric-like page and spread interop, plus layout helpers (`boxToPixels`, `scaleBlocksToPageSize`)
- Package and page APIs: `packFanci`, `downloadFanci`, `addPage`, cover/hardback setters, and `setStageZoom`

### Changed

- Single vs two-page presentation is a reader setting. Stories store pages only; a legacy `layout` object in story JSON is ignored.
- The Maker UI and demo app left this package. Fabric is no longer a dependency.
- Chrome buttons use Iconify icons.

### Removed

- In-repo editor and demo (`src/editor`, `vite.demo.config.ts`)

## [0.2.0]

### Added

- Story `hardback` flag: larger front/back cover boards with a visible cover rim when interior pages are open
- Chrome theming: CSS vars for captions/buttons, image-button hooks (`--fc-btn-*-image` + `.fc-chrome--images`)
- `StorybookOptions.chrome` for labels, aria-labels, className, and hidden chrome
- Prev/next disable at first/last spread
- Layout modes: dedicated one-page spreads, `responsive` (orientation), remapping across mode flips
- `frontCover` / `backCover` story flags: closed centered covers; open/close via page-flip to interior (covers excluded from open spreads)
- Extensible `FlipStyle` API: `StorybookOptions.flipStyle` / `flipSpeed`, `registerFlipStyle`, built-in `DefaultFlipStyle`
- Optional `editor: true` host mode (Fabric page editing, cover toggles, `.fanci` download)

### Changed

- Flip style/speed are host-only (`StorybookOptions` / `setFlipStyle` / `setFlipSpeed`); removed from story JSON
- `single` builds one spread per story page (blank mate); `two-page` keeps facing pairs
- `auto` remains the width-breakpoint resolver; prefer `responsive` for device orientation

## [0.1.0]

### Added

- Initial `@makefully/fancifully` release: DOM storybook engine with JSON / `.fanci` / EPUB loading
- Unified two-leaf spread paging (single viewport uses blank offscreen mate)
- SpringRoll volume/pause/captions binding and load `progress` / `loading` / delayed `loaded`
- VO↔text sync via WebVTT or inline cues; text, image, and hotspot blocks
