# Changelog

All notable changes to this project will be documented in this file.

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
