# Changelog

All notable changes to Astronomical Globe Card are documented here. Format
loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/);
versioning follows [SemVer](https://semver.org/) (`vMAJOR.MINOR.PATCH`).

## [0.5.1] - 2026-08-13

### Fixed
- Inverted vertical drag axis from 0.5.0 - dragging up/down tilted the
  camera the opposite way from what felt natural (direct-manipulation
  convention: dragging up should reveal more of the view from below, like
  dragging a map). The horizontal axis was correct; only the vertical sign
  was flipped.

## [0.5.0] - 2026-08-13

### Added
- Manual globe rotation by dragging the canvas with mouse or touch
  (`manual_rotation` config option, on by default). Implemented as an
  accumulated azimuth/elevation offset on top of the existing camera-direction
  math (same approach as `rotation_wobble`), so it coexists cleanly with
  home-location tracking and the wobble animation — wobble is suppressed
  during an active drag so it doesn't fight the gesture. The canvas uses
  `touch-action: none` so mobile browsers treat the drag as rotation instead
  of a page scroll (same trade-off as the HA map card: touching the globe
  itself no longer scrolls the dashboard through the card, but the rest of
  the page scrolls normally). After ~5s of inactivity the view eases back to
  the tracked home location on its own (frame-rate independent exponential
  return, not a snap).

## [0.4.0] - 2026-08-13

### Added
- New `marker_size` config option (slider in the visual editor) to control
  the size of the home/tracked-location GPS marker on the globe surface.
  Previously hardcoded to `0.1`; default value is unchanged, so existing
  configs render identically to before.

## [0.3.11] - 2026-08-13

### Fixed
- **Globe stopped rendering after entering dashboard edit mode.** Home
  Assistant commonly reuses the *same* card DOM element (disconnect +
  reconnect) when it reorganizes a masonry/sections layout — which
  routinely happens when switching a dashboard into edit mode. `attachShadow()`
  can only ever be called once per element; the card's rebuild path called
  it unconditionally, so the second build threw before the 3D scene/textures
  were (re)initialized, leaving a dead, disposed canvas with no image. Now
  `attachShadow()` is only called if the element doesn't already have a
  shadow root.

## [0.3.10] - 2026-08-09

### Fixed
- **Real root cause of the "translucent black glass over the whole card"**
  that v0.3.9 did not actually fix: the `.agc-error` CSS rule
  (`display: flex`) had the same specificity as the browser's default
  `[hidden] { display: none }` rule, so the author rule won the cascade —
  toggling the `hidden` attribute in JS had no visual effect, and the
  semi-transparent black error overlay (`rgba(0,0,0,0.75)`) sat permanently
  over the whole canvas regardless of brightness/saturation/contrast
  settings. Fixed by adding a higher-specificity
  `.agc-error[hidden] { display: none; }` rule. Verified pixel-for-pixel
  against source textures via a headless render, not just visual guessing.

## [0.3.9] - 2026-08-09

### Fixed
- **Real root cause of the systemic darkening/washed-out look.** three.js
  r152+ enables automatic color management by default: textures tagged
  `SRGBColorSpace` are silently decoded sRGB→linear when sampled, and
  `new THREE.Color(hex)` does the same. That's correct for built-in
  materials (which re-encode on output), but the card's custom
  `ShaderMaterial`s (earth/clouds/atmosphere) did no such re-encode, making
  everything systematically darker/less saturated than the source values
  implied. Earth/night/cloud textures now use `NoColorSpace` and the
  atmosphere color is read via `setHex(hex, NoColorSpace)`. The sun glow and
  GPS marker had the opposite problem (built-in `SpriteMaterial` + texture
  with no `colorSpace` = an unwanted double conversion on output = washed-out
  look) — fixed by tagging their canvas textures `SRGBColorSpace`.

## [0.3.8.1] - 2026-08-09

### Fixed
- Minor follow-up fix to the v0.3.8 configurable visual parameters.

## [0.3.8] - 2026-08-09

### Added
- Every parameter that affects the rendered look (night ocean glow
  strength, saturation, contrast, twilight strength, cloud opacity,
  atmosphere glow intensity, star/nebula brightness) is now a separate
  config field with a slider in the visual editor, instead of being
  hardcoded as shader constants.

## [0.3.7] - 2026-08-09

### Fixed
- Addressed feedback that colors still looked washed out and the
  brightness slider barely did anything: narrower twilight band, stronger
  contrast/saturation.

## [0.3.6] - 2026-08-09

### Fixed
- Regression from v0.3.5: a stray backtick inside a GLSL comment in a
  template literal (`earth-shaders.js`) prematurely closed a JS string and
  broke the whole file's syntax, crashing the card on module load
  ("Custom element doesn't exist").

## [0.3.5] - 2026-08-09

### Fixed
- Real reason v0.3.4 barely changed anything visually: the night-side earth
  texture stores ocean as pure black pixels, so multiplying by brightness
  had no effect there — night ocean now gets a constant blue ambient glow
  added instead. Starfield is now generated procedurally instead of from
  the (very dark) `stars.jpg` texture.

## [0.3.4] - 2026-08-09

### Changed
- Visual tuning: camera pulled back from the globe (a bit of starfield is
  now visible around the planet), richer colors, brighter starfield,
  stronger atmospheric glow.

## [0.3.3] - 2026-08-09

### Fixed
- Real regression from v0.3.1/v0.3.2: static imports of `lib/*.js` without
  a cache-busting query string could keep serving a stale/broken cached
  copy indefinitely, breaking the whole card's registration ("Custom
  element doesn't exist").

## [0.3.2] - 2026-08-09

### Fixed
- Silent texture-load failures — textures now retry once automatically on
  failure, and show a visible error message instead of leaving a blank
  card. WebGL initialization failures (`_initThree`) are no longer silent
  either.

## [0.3.0] - 2026-08-09

### Added
- NASA Black Marble night texture, procedural starfield background,
  improved sun (two-layer glow), 8K cloud texture, moonlit clouds at night,
  proper three.js resource disposal on disconnect.

## [0.2.3] - 2026-08-09

### Changed
- Reworked brightness handling to mainly boost city lights instead of
  flatly muddying everything toward brown; added saturation control and
  widened the brightness slider range to 0.5–5.

## [0.2.2] - 2026-08-09

### Fixed
- Cache-busting for nested modules and textures (`?v=version`), fixing
  stuck stale caches after updates.

## [0.2.1] - 2026-08-08

### Fixed
- Brightness bug: multiplicative exposure applied to pure black night
  pixels had no effect — switched to additive ambient night-side lighting.

## [0.2.0] - 2026-08-08

### Added
- Card version number shown in the visual editor.

## [0.1.1] - 2026-08-08

### Fixed
- Moon phase icon overlapping the time/date text.

### Changed
- Increased overall globe brightness; added `brightness` config option.

## [0.1.0] - 2026-08-08

### Added
- Initial release: realistic 3D Earth globe for Home Assistant Lovelace
  (three.js), real NASA/Solar System Scope day/night/cloud textures,
  physically-based terminator from actual sun position, atmospheric glow,
  Moon with real phase/position, home location from HA config or a
  person/device_tracker/zone entity, visual config editor.
