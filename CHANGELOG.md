# Changelog

All notable changes to this project will be documented in this file.

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
