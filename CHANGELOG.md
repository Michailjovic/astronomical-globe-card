# Changelog

All notable changes to Astronomical Globe Card are documented here. Format
loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/);
versioning follows [SemVer](https://semver.org/) (`vMAJOR.MINOR.PATCH`).

## [0.7.1] - 2026-08-13

### Fixed
- Erratic/chaotic rotation when a second finger touched the card (e.g.
  attempting a pinch gesture). The Pointer Events API sends a separate
  pointerdown for each finger (distinct pointerId); the code didn't
  distinguish between them, so a second touch would silently take over the
  in-progress drag's tracked coordinates, and subsequent moves from either
  finger got interpreted as deltas from whichever finger last reported -
  hence the nonsensical jumps (not an actual zoom attempt gone wrong). Now
  a drag is "owned" by whichever pointerId started it; any other pointer is
  ignored entirely until the first one is released. Side effect: this also
  fully neutralizes pinch-to-zoom on the globe (the second finger has no
  effect at all) - there's no real camera zoom yet, so that's the only
  sensible response to a second touch point for now.

## [0.7.0] - 2026-08-13

### Changed
- Manual rotation rewritten from azimuth/elevation around a fixed vertical
  axis to a proper quaternion-based trackball/arcball. The previous approach
  had a hard geometric limit: near a pole the reference axis and the view
  direction converge (gimbal lock), so an artificial tilt clamp was
  required, or a long enough vertical drag would suddenly jump the camera
  to the opposite side of the globe. A quaternion has no fixed reference
  axis - each drag step rotates around axes derived from the *current*
  accumulated orientation rather than a fixed world axis, so there is no
  pole and rotation is genuinely unlimited in every direction, just like
  spinning a physical globe in your hands. Trade-off: after enough free
  rotation, north may no longer be "up" on screen (the old system always
  kept it up). The idle/reset return-to-home animation now uses
  `Quaternion.slerp()` toward identity instead of decaying two separate
  numbers.

## [0.6.0] - 2026-08-13

### Added
- Two small buttons above the globe (visible only when `manual_rotation` is
  on): a "return to home" button that immediately triggers the same smooth
  return animation the 5s idle timeout uses, and a lock button that
  turns that automatic 5s return off/on. With the lock engaged you can
  leave the globe rotated indefinitely and bring it back manually whenever
  you like via the reset button. Both buttons render above the canvas
  (higher stacking order) so clicking them doesn't also trigger the
  drag-rotation underneath.

## [0.5.2] - 2026-08-13

### Fixed
- Camera "flipping" to the opposite side of the globe during a long vertical
  drag. Root cause: the vertical-drag clamp only limited the *increment*
  (`manualEl`), not the resulting angle from the pole - which is that
  increment plus the tracked location's own latitude (colatitude). For
  locations far from the equator (e.g. Prague, ~40° from the north pole),
  dragging up far enough could rotate the camera past the pole itself onto
  the opposite hemisphere - a sudden, disorienting jump. The clamp is now
  computed dynamically from the actual tracked latitude so the resulting
  angle from the pole always stays within a safe range (8°-172°): the
  camera can lean right up to the pole but never crosses it. The horizontal
  (azimuth) drag is unaffected and remains unlimited - orbiting around the
  vertical axis doesn't change the angle from the pole, so a full/continuous
  spin is safe there.

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
