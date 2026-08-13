# Changelog

All notable changes to Astronomical Globe Card are documented here. Format
loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/);
versioning follows [SemVer](https://semver.org/) (`vMAJOR.MINOR.PATCH`).

## [0.20.0] - 2026-08-13

### Added
- Globe view: time animation. A new control bar next to the view buttons
  lets you play/pause a sped-up clock (1 min/s, 10 min/s, 1 h/s, 1 day/s
  presets, plus a custom numeric speed with min/hour/day units) to watch
  the day/night terminator and Moon phase move in fast motion. The header
  date/time stays real-time, same as the Solar System view's time
  animation only affecting its own scene.
- Globe view: a new "north-up lock" toggle button constrains dragging to
  sideways-only rotation, so north always stays at the top of the screen
  instead of the globe being freely tiltable.

## [0.19.0] - 2026-08-13

### Added
- Solar System view: planets now get a more realistic surface once you
  click/zoom in, instead of a flat-colored sphere. Rocky bodies (Mercury,
  Venus, Mars, Pluto, the mini-Moon) get a mottled, cratered look; gas
  giants (Jupiter, Saturn, Uranus, Neptune) get horizontal banding - all
  generated procedurally on a canvas at runtime, no new downloaded assets.
  Earth and the mini-Moon are additionally upgraded to the real NASA
  textures already used for the globe view once they finish loading (the
  Moon reuses the same downloaded file; Earth's texture is fetched from
  the same cached URL as the globe's day texture).

## [0.18.0] - 2026-08-13

### Changed
- All user-facing UI text (buttons, titles, ARIA labels, config editor
  fields, error messages, Solar System info panel, sunrise/sunset
  countdown) is now in English. Code comments are unaffected.

## [0.17.0] - 2026-08-13

### Added
- Solar System view: the date shown in the time-animation bar can now be
  set directly via a native date picker, instead of only being reachable
  by playing/fast-forwarding through time. Picking a date jumps straight
  to it (keeping the current time-of-day) and immediately recalculates
  planet positions, whether the animation is playing or paused. The "Today"
  button still returns to live tracking.

## [0.16.0] - 2026-08-13

### Fixed
- Solar System view: the camera kept slowly orbiting the scene even while
  the time-animation was paused, which read to users as "the planets are
  still rotating". Root cause: the decorative ambient camera orbit was
  driven by the card's absolute wall-clock elapsed time regardless of the
  play/pause state of the time controls. It's now driven by an accumulator
  that only advances while the time animation is actually playing, so
  pressing pause now stops all visible motion in the scene (manual drag
  still works as before, independent of play/pause).

## [0.15.0] - 2026-08-13

### Added
- Sixth and final batch of the original brainstorm roadmap: **asteroid
  belt + Pluto**. The belt is a purely decorative static `THREE.Points`
  cloud between the orbits of Mars and Jupiter - not a simulation of
  individual bodies, which would be pointless at this visual scale. Pluto
  is added as a 9th body with its own Keplerian orbital elements, kept
  deliberately outside `PLANET_ORDER` (it's a dwarf planet since the 2006
  IAU reclassification, not one of the 8 "major" planets), but otherwise
  behaves exactly like the others - clickable, zoomable, shows up in the
  conjunction/opposition info panel - because all the relevant code
  already keys off the planet name generically rather than hardcoding
  `PLANET_ORDER`. Pluto's orbital elements were verified via web search
  (JPL's public Standish table used to include Pluto before NASA removed
  it after the IAU reclassification) plus cross-checking against an
  independently-derived table (agreement to 3-4 significant figures) and
  Kepler's second and third laws - the same confidence bar as the other 8
  planets.

## [0.14.0] - 2026-08-13

### Added
- Fifth batch of the Solar System view roadmap: **the Moon as a mini-model
  next to Earth**. The Moon's real orbital distance would be sub-pixel at
  this diagram's scale, so its distance from Earth is stylized - but its
  direction is real: the Moon's current phase (already computed elsewhere
  in the card for the phase icon) is, by definition, the angle between the
  Moon and the Sun as seen from Earth, so that same number places the Moon
  correctly around Earth with no new astronomy needed. It's parented to
  the Earth mesh, so it automatically travels along with Earth's orbit.
  As a nice side effect, the Moon needs no special phase shader or
  texture at all - it uses the same lit-sphere material as the planets,
  under the same Sun light, so a correctly-shaped crescent or gibbous
  shape just falls out of the 3D lighting once the geometry is right.

## [0.13.0] - 2026-08-13

### Added
- Fourth batch of the Solar System view roadmap: **"what's visible from
  Earth tonight"**. A new `getPlanetHorizontalPositions()` in
  `lib/planets.js` converts each naked-eye planet's position (Mercury
  through Saturn - Uranus and Neptune aren't naked-eye visible, so they're
  excluded) into altitude and azimuth for your configured home location,
  via the standard ecliptic → equatorial → horizontal coordinate chain.
  The selected planet's info panel now shows whether it's currently above
  the horizon, roughly where in the sky (compass direction), and whether
  it's dark enough at home to actually see it. During time animation
  (v0.11.0) this is computed for the simulated moment, not live "now", so
  it stays consistent with whatever the scene is showing. The underlying
  math was validated independently: at the planet's "sub-point" (the spot
  on Earth directly underneath it) the computed altitude comes out to
  90.00° to within a hundredth of a degree, and -90.00° at the antipode.

## [0.12.0] - 2026-08-13

### Added
- Third batch of the Solar System view roadmap: **conjunction/opposition
  text**. The planet info panel (v0.10.0) now shows a line describing its
  current alignment relative to the Sun and Earth - computed from the same
  raw heliocentric coordinates already used for the Earth-distance figure,
  no extra astronomy needed. Mercury and Venus (orbiting closer to the Sun
  than Earth) get inferior/superior conjunction; the other five planets get
  conjunction (behind the Sun) and opposition (Earth between Sun and
  planet - the best time to observe it, up all night). Outside those
  threshold states, it shows the current elongation in degrees plus
  whether the planet is currently an "evening" or "morning" object, based
  on which side of the Sun it appears on in the sky.

## [0.11.0] - 2026-08-13

### Added
- Second batch of the Solar System view roadmap: **time animation**. A
  compact control bar at the bottom of the Solar System view lets you
  play/pause and cycle through speed presets (1 day/week/month/year of
  simulated time per real second, always forward), plus a "Today" button
  to jump back to live tracking. While paused (the default), the view
  behaves exactly as before - live real-world positions, refreshed once a
  second. Once animation is running, planet positions are recomputed every
  rendered frame instead, so movement at higher speeds doesn't stutter. If
  a planet is currently focused (v0.10.0's click-to-zoom), the camera
  keeps following it smoothly as it orbits during the animation, with no
  extra code needed - the focus point just tracks the planet's live
  position.

## [0.10.0] - 2026-08-13

### Added
- First batch of the Solar System view roadmap:
  - **Drag rotation** in the Solar System view. Unlike the globe's
    quaternion trackball, this is a classic orbit camera always looking at
    a fixed point (the Sun, or a focused planet), so there's no gimbal
    lock/pole to work around - drag just adds a simple azimuth/elevation
    offset on top of the existing slow auto-orbit. Elevation is clamped so
    the camera can't fly so far above/below the ecliptic that the orbits
    degenerate into a line.
  - **Click a planet** to smoothly zoom the camera in on it (frame-rate
    independent easing, not a jump) and show an info panel with its name
    and distance from both the Sun and Earth, in AU and millions of km.
    Distance-from-Earth is computed from the real (unscaled) heliocentric
    coordinates, not the square-root display scale used for drawing.
    Clicking the same planet again, clicking empty space, or the panel's
    close button returns to the full system overview. A short tap/click
    (under 6px of movement) is distinguished from a drag using the same
    pointer-tracking approach already used for the globe.
  - **Earth highlight**: a soft glow around Earth in the overview, so it's
    immediately recognizable as "home" among the other seven planets.

## [0.9.1] - 2026-08-13

### Fixed
- Solar system toggle button (new in 0.9.0) visually overlapped the date
  text - it lived in its own top-left cluster, directly on top of where
  `.agc-overlay-top` renders the date. Moved into the existing top-right
  `.agc-view-controls` cluster alongside the reset/lock buttons, which had
  free space. That container no longer hides itself as a whole based on
  `manual_rotation`/view mode (which would have hidden the solar button
  too) - the reset/lock buttons now show/hide individually instead. Also
  fixed a stale cache-busting query string on the `earth-shaders.js` import
  that had drifted out of sync with `CARD_VERSION` since a previous release.

## [0.9.0] - 2026-08-13

### Added
- New "Solar System" view, toggled by a button in the top-left corner: the
  Sun, all 8 planets at today's actual position, and their orbits, replacing
  the globe in place (same button toggles back). Planet positions come from
  a new `lib/planets.js` module (simplified J2000 mean Keplerian elements +
  Newton-Raphson solution of Kepler's equation - accuracy on the order of
  arcminutes, plenty for this visualization). Distances from the Sun
  (0.39-30 AU) are compressed with a square-root scale so all eight orbits
  fit legibly in frame - not an astronomically accurate scale (that would
  shrink the inner planets to invisible dots next to the Sun), just a
  readable diagram that preserves the correct order and a plausible sense
  of relative spacing. Shares the same renderer/canvas/WebGL context as the
  globe (no second GPU context) - only which Scene/camera pair gets
  rendered is switched. No manual rotation yet in this view (unlike the
  globe) - just a slow decorative orbit of the camera around the Sun.

## [0.8.0] - 2026-08-13

### Added
- New `celestial_reveal` option (on by default): the resting camera now
  leans gently (up to ~14°) toward the Sun or Moon when it's "their time" -
  Sun near the horizon (sunrise/sunset), or Moon above the horizon at
  night. Both bodies were already positioned correctly in the 3D scene, but
  a camera that only ever tracks the home location almost never happened to
  show them in frame - you'd only catch a glimpse by manually rotating.
  The lean strength fades in/out smoothly with elevation (a triangular
  weight centered just above the horizon for the Sun, a linear ramp for the
  Moon), so it never appears or disappears abruptly.

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
