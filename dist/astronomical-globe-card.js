/**
 * Astronomical Globe Card
 * Realistický 3D glóbus Země pro Home Assistant Lovelace, inspirovaný
 * ciferníkem "Astronomie" na Apple Watch.
 *
 * - three.js 3D scéna: reálné NASA/Solar System Scope textury (den/noc/mraky),
 *   fyzikálně korektní terminátor počítaný z reálné polohy Slunce,
 *   atmosférická záře, Měsíc jako samostatné těleso se skutečnou fází a polohou.
 * - Poloha "doma" buď z konfigurace Home Assistanta, nebo z libovolné
 *   entity (person / device_tracker / zone).
 * - Kompletně bez build kroku - čisté ES moduly, three.js vendorováno lokálně.
 *
 * @version 0.3.0
 *
 * POZOR (cache): vnořené importy (lib/*.js) i textury se natvrdo verzují
 * query parametrem `?v=CARD_VERSION` (viz níže). Prohlížeče a HA service
 * worker cachují každý modul/soubor nezávisle podle URL - samotný refresh
 * hlavního souboru nutně nezajistí čerstvé načtení vnořených souborů, pokud
 * jejich URL zůstane stejná. Díky verzované URL se při každém bumpu verze
 * vynutí čerstvé stažení úplně všeho.
 */

const CARD_VERSION = '0.3.0';
const CARD_DIR = new URL('.', import.meta.url).href;
const V = `?v=${CARD_VERSION}`;

const THREE = await import(`${CARD_DIR}lib/three.module.min.js${V}`);
const { getSunPosition, getMoonPosition, getSunTimes } = await import(
  `${CARD_DIR}lib/astro.js${V}`
);
const {
  earthVertexShader,
  earthFragmentShader,
  cloudsVertexShader,
  cloudsFragmentShader,
  atmosphereVertexShader,
  atmosphereFragmentShader,
  skyVertexShader,
  skyFragmentShader,
} = await import(`${CARD_DIR}lib/earth-shaders.js${V}`);
const EARTH_RADIUS = 1;
const CAMERA_DISTANCE = 2.55;
const MOON_ORBIT_RADIUS = 2.5;
const MOON_RADIUS = 0.16;

const QUALITY_TIERS = {
  low: { label: 'Nízká (rychlá)', earth: 1024, folder: 'low' },
  medium: { label: 'Střední (doporučeno)', earth: 2048, folder: 'medium' },
  high: { label: 'Vysoká', earth: 4096, folder: 'high' },
};

const DEFAULT_CONFIG = {
  type: 'custom:astronomical-globe-card',
  title: '',
  location_source: 'home', // 'home' | 'entity'
  entity: '',
  quality: 'medium',
  show_clouds: true,
  show_moon: true,
  show_sun_marker: true,
  show_stars: true,
  show_countdown: true,
  show_day_length: true,
  rotation_wobble: true,
  accent_color: '',
  brightness: 1.35,
};

// ---------------------------------------------------------------------------
// Pomocné funkce
// ---------------------------------------------------------------------------

function degToRad(d) {
  return (d * Math.PI) / 180;
}

/**
 * Převod geografických souřadnic na 3D vektor odpovídající standardnímu
 * UV mapování THREE.SphereGeometry s equirektangulární texturou
 * (u=0 na lon=-180°, u=1 na lon=+180°, v=0 na severním pólu).
 */
function geoToVector3(lat, lon, radius = 1) {
  const latR = degToRad(lat);
  const lonR = degToRad(lon);
  const x = radius * Math.cos(latR) * Math.cos(lonR);
  const y = radius * Math.sin(latR);
  const z = -radius * Math.cos(latR) * Math.sin(lonR);
  return new THREE.Vector3(x, y, z);
}

function formatDuration(hoursFloat) {
  const totalMinutes = Math.round(hoursFloat * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} min`;
  return `${h} h ${m} min`;
}

function getLocale(hass) {
  return (hass && hass.locale && hass.locale.language) || navigator.language || 'cs';
}

function uses24h(hass) {
  const fmt = hass && hass.locale && hass.locale.time_format;
  if (fmt === '12') return false;
  if (fmt === '24') return true;
  return true; // rozumný default pro CZ prostředí
}

function makeGlowSpriteTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255, 244, 214, 0.9)');
  gradient.addColorStop(0.18, 'rgba(255, 220, 150, 0.55)');
  gradient.addColorStop(0.5, 'rgba(255, 180, 90, 0.16)');
  gradient.addColorStop(1, 'rgba(255, 180, 90, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

/** Malé, ostré, téměř bílé jádro slunečního záblesku (pro sunSprite). */
function makeSunCoreTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255, 255, 250, 1)');
  gradient.addColorStop(0.12, 'rgba(255, 250, 230, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 235, 180, 0.6)');
  gradient.addColorStop(1, 'rgba(255, 220, 150, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function makeMarkerTexture(color) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();
  return new THREE.CanvasTexture(canvas);
}

// ---------------------------------------------------------------------------
// Hlavní karta
// ---------------------------------------------------------------------------

class AstronomicalGlobeCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement('astronomical-globe-card-editor');
  }

  static getStubConfig() {
    return { ...DEFAULT_CONFIG };
  }

  setConfig(config) {
    if (!config) {
      throw new Error('Neplatná konfigurace karty.');
    }
    if (config.location_source === 'entity' && !config.entity) {
      throw new Error('Při location_source: entity je nutné nastavit entity.');
    }
    const prevQuality = this._config ? this._config.quality : null;
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._configError = null;

    if (this._built && prevQuality !== this._config.quality) {
      this._reloadTextures();
    }
    this._renderStaticParts();
  }

  getCardSize() {
    return 6;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) {
      this._build();
    }
    this._updateFromHass();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    if (this._disposed) {
      // karta byla odpojena z DOM a uvolněna, ale element je znovu použit
      // (např. reorganizace masonry layoutu) - postavit scénu znovu od nuly
      this._built = false;
      this._disposed = false;
      if (this._hass) this._build();
      return;
    }
    if (this._built) {
      this._startLoop();
    }
  }

  disconnectedCallback() {
    this._stopLoop();
    this._dispose();
  }

  /** Uvolní three.js zdroje (geometrie/materiály/textury/renderer/WebGL kontext). */
  _dispose() {
    if (this._disposed || !this._scene) return;
    this._disposed = true;

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    this._scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((mat) => {
        if (!mat) return;
        Object.values(mat).forEach((val) => {
          if (val && val.isTexture) val.dispose();
        });
        mat.dispose();
      });
    });

    if (this._renderer) {
      this._renderer.dispose();
      this._renderer.forceContextLoss();
      this._renderer = null;
    }
  }

  // -- Stavba DOM + three.js scény ------------------------------------------

  _build() {
    this._built = true;

    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>${this._css()}</style>
      <ha-card>
        <div class="agc-root">
          <div class="agc-title"></div>
          <div class="agc-stage">
            <canvas class="agc-canvas"></canvas>
            <div class="agc-overlay-top">
              <div class="agc-date"></div>
              <div class="agc-time"></div>
            </div>
            <div class="agc-corner agc-corner-bl" title="Fáze Měsíce">
              <canvas class="agc-moon-icon" width="44" height="44"></canvas>
            </div>
            <div class="agc-corner agc-corner-br" title="Poloha na oběžné dráze">
              <svg class="agc-orbit-icon" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
                <circle class="agc-orbit-sun" cx="22" cy="22" r="3.4" fill="#ffcf6b"/>
                <circle class="agc-orbit-earth" cx="22" cy="4" r="2.6" fill="#5aa9ff"/>
              </svg>
            </div>
            <div class="agc-overlay-bottom">
              <div class="agc-row agc-countdown"></div>
              <div class="agc-row agc-daylength"></div>
            </div>
            <div class="agc-error" hidden></div>
          </div>
        </div>
      </ha-card>
    `;

    this._els = {
      title: this.shadowRoot.querySelector('.agc-title'),
      stage: this.shadowRoot.querySelector('.agc-stage'),
      canvas: this.shadowRoot.querySelector('.agc-canvas'),
      date: this.shadowRoot.querySelector('.agc-date'),
      time: this.shadowRoot.querySelector('.agc-time'),
      countdown: this.shadowRoot.querySelector('.agc-countdown'),
      daylength: this.shadowRoot.querySelector('.agc-daylength'),
      moonIcon: this.shadowRoot.querySelector('.agc-moon-icon'),
      orbitEarth: this.shadowRoot.querySelector('.agc-orbit-earth'),
      error: this.shadowRoot.querySelector('.agc-error'),
    };

    this._clock = new THREE.Clock();
    this._wobbleSeed = Math.random() * 1000;

    this._initThree();
    this._renderStaticParts();
    this._loadTextures();

    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(this._els.stage);
    this._onResize();

    this._startLoop();
  }

  _css() {
    return `
      :host { display: block; }
      ha-card { overflow: hidden; background: var(--agc-bg, #000); padding: 0; }
      .agc-root { display: flex; flex-direction: column; }
      .agc-title {
        font-size: 14px; font-weight: 500; padding: 10px 16px 0 16px;
        color: var(--primary-text-color, #fff); opacity: 0.7;
      }
      .agc-title:empty { display: none; }
      .agc-stage {
        position: relative; width: 100%; aspect-ratio: 1 / 1;
        background: radial-gradient(circle at 50% 45%, #05070d 0%, #000 75%);
        overflow: hidden;
      }
      .agc-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

      .agc-overlay-top {
        position: absolute; top: 14px; left: 18px; right: 18px;
        pointer-events: none; text-shadow: 0 1px 6px rgba(0,0,0,0.6);
      }
      .agc-date {
        font-size: 15px; letter-spacing: 1.5px; font-weight: 600;
        color: rgba(255,255,255,0.92); text-transform: uppercase;
      }
      .agc-time {
        font-size: clamp(30px, 11vw, 52px); font-weight: 300; line-height: 1.05;
        color: #fff; font-variant-numeric: tabular-nums; margin-top: 2px;
      }

      .agc-overlay-bottom {
        position: absolute; left: 62px; right: 62px; bottom: 20px;
        pointer-events: none; text-shadow: 0 1px 6px rgba(0,0,0,0.6);
        text-align: center;
      }
      .agc-row {
        font-size: 13px; color: rgba(255,255,255,0.85); line-height: 1.5;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .agc-row:empty { display: none; }

      .agc-corner {
        position: absolute; width: 44px; height: 44px;
        display: flex; align-items: center; justify-content: center;
        opacity: 0.9; z-index: 2;
      }
      .agc-corner-bl { left: 14px; bottom: 14px; }
      .agc-corner-br { right: 14px; bottom: 14px; }
      .agc-orbit-icon { width: 100%; height: 100%; }

      .agc-error {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        color: #ff8a80; background: rgba(0,0,0,0.75); font-size: 13px; text-align: center; padding: 16px;
      }
    `;
  }

  _renderStaticParts() {
    if (!this._els) return;
    this._els.title.textContent = this._config.title || '';
    if (this._config.accent_color) {
      this.style.setProperty('--agc-accent', this._config.accent_color);
    }
    const brightness = this._config.brightness || DEFAULT_CONFIG.brightness;
    if (this._earthUniforms) {
      this._earthUniforms.exposure.value = brightness;
    }
    if (this._atmosphereUniforms) {
      // mírně provázané s jasem, ať modrý okraj nezůstává "utopený" při
      // vysokých hodnotách jasu, ale zůstává jemné a stabilní
      this._atmosphereUniforms.glowIntensity.value = 1.1 * (1 + (brightness - 1) * 0.25);
    }
    if (this._skyMesh) {
      this._skyMesh.visible = !!this._config.show_stars;
    }
  }

  // -- three.js inicializace -------------------------------------------------

  _initThree() {
    const renderer = new THREE.WebGLRenderer({
      canvas: this._els.canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._renderer = renderer;

    const scene = new THREE.Scene();
    this._scene = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this._camera = camera;

    // -- Hvězdné pozadí (skybox) ----------------------------------------------
    const skyGeometry = new THREE.SphereGeometry(50, 48, 48);
    this._skyUniforms = { starsTexture: { value: null } };
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: this._skyUniforms,
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(skyMesh);
    this._skyMesh = skyMesh;

    // -- Země ---------------------------------------------------------------
    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 96, 96);

    this._earthUniforms = {
      dayTexture: { value: null },
      nightTexture: { value: null },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      nightBrightness: { value: 2.2 },
      twilightStrength: { value: 0.28 },
      exposure: { value: this._config.brightness || DEFAULT_CONFIG.brightness },
    };
    const earthMaterial = new THREE.ShaderMaterial({
      uniforms: this._earthUniforms,
      vertexShader: earthVertexShader,
      fragmentShader: earthFragmentShader,
    });
    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earthMesh);
    this._earthMesh = earthMesh;

    // -- Mraky ----------------------------------------------------------------
    const cloudsGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.006, 96, 96);
    this._cloudsUniforms = {
      cloudsTexture: { value: null },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      opacity: { value: 0.4 },
    };
    const cloudsMaterial = new THREE.ShaderMaterial({
      uniforms: this._cloudsUniforms,
      vertexShader: cloudsVertexShader,
      fragmentShader: cloudsFragmentShader,
      transparent: true,
      depthWrite: false,
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
    scene.add(cloudsMesh);
    this._cloudsMesh = cloudsMesh;

    // -- Atmosféra (Fresnel záře) ---------------------------------------------
    const atmosphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.045, 64, 64);
    this._atmosphereUniforms = {
      glowColor: { value: new THREE.Color(0x4da6ff) },
      glowPower: { value: 2.6 },
      glowIntensity: { value: 1.1 },
    };
    const atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: this._atmosphereUniforms,
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphereMesh);
    this._atmosphereMesh = atmosphereMesh;

    // -- GPS značka -------------------------------------------------------
    const markerTexture = makeMarkerTexture('#33e6b0');
    const markerMaterial = new THREE.SpriteMaterial({
      map: markerTexture,
      depthTest: true,
      transparent: true,
    });
    const markerSprite = new THREE.Sprite(markerMaterial);
    markerSprite.scale.set(0.09, 0.09, 1);
    earthMesh.add(markerSprite);
    this._markerSprite = markerSprite;

    // -- Slunce (světelný zdroj + vizuální značka) ----------------------------
    const sunLight = new THREE.DirectionalLight(0xfff2d9, 1.4);
    scene.add(sunLight);
    this._sunLight = sunLight;
    scene.add(new THREE.AmbientLight(0x1c2b45, 0.4));

    // Dvouvrstvá záře - velký měkký halo + malé ostré jasné jádro, ať to
    // připomíná sluneční záblesk na okraji glóbu místo ploché tečky.
    const sunHaloMaterial = new THREE.SpriteMaterial({
      map: makeGlowSpriteTexture(),
      transparent: true,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const sunHalo = new THREE.Sprite(sunHaloMaterial);
    sunHalo.scale.set(0.85, 0.85, 1);
    scene.add(sunHalo);
    this._sunHalo = sunHalo;

    const sunCoreMaterial = new THREE.SpriteMaterial({
      map: makeSunCoreTexture(),
      transparent: true,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const sunSprite = new THREE.Sprite(sunCoreMaterial);
    sunSprite.scale.set(0.22, 0.22, 1);
    scene.add(sunSprite);
    this._sunSprite = sunSprite;

    // -- Měsíc ---------------------------------------------------------------
    const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 48, 48);
    const moonMaterial = new THREE.MeshStandardMaterial({
      map: null,
      roughness: 1,
      metalness: 0,
    });
    const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    scene.add(moonMesh);
    this._moonMesh = moonMesh;

    this._camWobble = { az: 0, el: 0 };
  }

  _reloadTextures() {
    this._loadTextures();
  }

  _loadTextures() {
    const tier = QUALITY_TIERS[this._config.quality] || QUALITY_TIERS.medium;
    const folder = tier.folder;
    const loader = new THREE.TextureLoader();
    const base = `${CARD_DIR}assets/textures/${folder}/`;

    const setTex = (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    };

    loader.load(`${base}earth-day.jpg${V}`, (tex) => {
      this._earthUniforms.dayTexture.value = setTex(tex);
    });
    loader.load(`${base}earth-night.jpg${V}`, (tex) => {
      this._earthUniforms.nightTexture.value = setTex(tex);
    });
    loader.load(`${base}earth-clouds.jpg${V}`, (tex) => {
      this._cloudsUniforms.cloudsTexture.value = tex;
    });
    loader.load(`${base}moon.jpg${V}`, (tex) => {
      this._moonMesh.material.map = setTex(tex);
      this._moonMesh.material.needsUpdate = true;
    });

    // hvězdné pozadí - sdílené pro všechny kvality, načte se jen jednou
    if (!this._starsLoaded) {
      this._starsLoaded = true;
      loader.load(`${CARD_DIR}assets/textures/stars.jpg${V}`, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        this._skyUniforms.starsTexture.value = tex;
      });
    }
  }

  // -- Aktualizace dat z Home Assistanta -------------------------------------

  _resolveLocation() {
    const cfg = this._config;
    const hass = this._hass;
    if (cfg.location_source === 'entity' && cfg.entity && hass) {
      const st = hass.states[cfg.entity];
      if (st && st.attributes && typeof st.attributes.latitude === 'number') {
        return {
          lat: st.attributes.latitude,
          lon: st.attributes.longitude,
          label: st.attributes.friendly_name || cfg.entity,
          ok: true,
        };
      }
      return { lat: null, lon: null, label: cfg.entity, ok: false };
    }
    if (hass && hass.config) {
      return {
        lat: hass.config.latitude,
        lon: hass.config.longitude,
        label: hass.config.location_name || 'Domov',
        ok: true,
      };
    }
    return { lat: null, lon: null, label: '', ok: false };
  }

  _updateFromHass() {
    if (!this._built) return;
    const loc = this._resolveLocation();

    if (!loc.ok || typeof loc.lat !== 'number' || typeof loc.lon !== 'number') {
      this._els.error.hidden = false;
      this._els.error.textContent =
        this._config.location_source === 'entity'
          ? `Entita "${this._config.entity}" nemá k dispozici polohu (latitude/longitude).`
          : 'Home Assistant nemá nastavenou domovskou polohu.';
      this._location = null;
      return;
    }
    this._els.error.hidden = true;
    this._location = loc;
  }

  // -- Render smyčka ---------------------------------------------------------

  _startLoop() {
    if (this._rafId) return;
    const tick = () => {
      this._rafId = requestAnimationFrame(tick);
      this._frame();
    };
    this._rafId = requestAnimationFrame(tick);

    if (!this._uiInterval) {
      this._uiInterval = setInterval(() => this._updateUiText(), 1000);
    }
  }

  _stopLoop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._uiInterval) {
      clearInterval(this._uiInterval);
      this._uiInterval = null;
    }
  }

  _frame() {
    if (!this._renderer || !this._location) return;
    const now = new Date();
    const t = this._clock.getElapsedTime();

    const sun = getSunPosition(now);
    const sunDirWorld = geoToVector3(sun.lat, sun.lon, 1);
    this._earthUniforms.sunDirection.value.copy(sunDirWorld);
    this._cloudsUniforms.sunDirection.value.copy(sunDirWorld);
    this._sunLight.position.copy(sunDirWorld).multiplyScalar(10);
    const sunPos = sunDirWorld.clone().multiplyScalar(EARTH_RADIUS * 4.2);
    this._sunSprite.position.copy(sunPos);
    this._sunHalo.position.copy(sunPos);
    this._sunSprite.visible = !!this._config.show_sun_marker;
    this._sunHalo.visible = !!this._config.show_sun_marker;

    if (this._config.show_moon) {
      const moon = getMoonPosition(now);
      const moonDir = geoToVector3(moon.lat, moon.lon, 1);
      this._moonMesh.position.copy(moonDir).multiplyScalar(MOON_ORBIT_RADIUS);
      this._moonMesh.visible = true;
    } else {
      this._moonMesh.visible = false;
    }

    this._cloudsMesh.visible = !!this._config.show_clouds;
    // jemný nezávislý drift mraků - čistě dekorativní, neovlivňuje přesnost terminátoru
    if (this._config.show_clouds) {
      this._cloudsMesh.rotation.y = t * 0.006;
    }

    // GPS značka + kamera sledující domovskou/sledovanou polohu
    const homeDir = geoToVector3(this._location.lat, this._location.lon, 1);
    this._markerSprite.position.copy(homeDir).multiplyScalar(1.01);

    let camDir = homeDir.clone();
    if (this._config.rotation_wobble) {
      const wob = this._wobbleSeed;
      const az = Math.sin(t * (2 * Math.PI / 300) + wob) * degToRad(5);
      const el = Math.sin(t * (2 * Math.PI / 420) + wob * 1.7) * degToRad(3);
      camDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), az);
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), camDir).normalize();
      camDir.applyAxisAngle(right, el);
    }
    this._camera.position.copy(camDir).multiplyScalar(CAMERA_DISTANCE);
    this._camera.up.set(0, 1, 0);
    this._camera.lookAt(0, 0, 0);

    this._renderer.render(this._scene, this._camera);
  }

  _updateUiText() {
    if (!this._els) return;
    const now = new Date();
    const hass = this._hass;
    const locale = getLocale(hass);
    const hour24 = uses24h(hass);

    this._els.date.textContent = now
      .toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })
      .toUpperCase();
    this._els.time.textContent = now.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: !hour24,
    });

    if (!this._location) {
      this._els.countdown.textContent = '';
      this._els.daylength.textContent = '';
      this._updateMoonIcon(now);
      this._updateOrbitIcon(now);
      return;
    }

    const times = getSunTimes(now, this._location.lat, this._location.lon);

    if (this._config.show_countdown) {
      if (times.polar === 'day') {
        this._els.countdown.textContent = '☀️ Polární den';
      } else if (times.polar === 'night') {
        this._els.countdown.textContent = '🌑 Polární noc';
      } else if (now < times.sunrise) {
        const h = (times.sunrise - now) / 3600000;
        this._els.countdown.textContent = `🌅 do východu: ${formatDuration(h)}`;
      } else if (now < times.sunset) {
        const h = (times.sunset - now) / 3600000;
        this._els.countdown.textContent = `🌇 do západu: ${formatDuration(h)}`;
      } else {
        const tomorrow = new Date(now.getTime() + 86400000);
        const tTimes = getSunTimes(tomorrow, this._location.lat, this._location.lon);
        if (tTimes.sunrise) {
          const h = (tTimes.sunrise - now) / 3600000;
          this._els.countdown.textContent = `🌅 do východu: ${formatDuration(h)}`;
        } else {
          this._els.countdown.textContent = '';
        }
      }
    } else {
      this._els.countdown.textContent = '';
    }

    if (this._config.show_day_length && times.dayLengthHours != null) {
      this._els.daylength.textContent = `Délka dne: ${formatDuration(times.dayLengthHours)}`;
    } else {
      this._els.daylength.textContent = '';
    }

    this._updateMoonIcon(now);
    this._updateOrbitIcon(now);
  }

  _updateMoonIcon(now) {
    const canvas = this._els.moonIcon;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const moon = getMoonPosition(now);
    this._paintMoonPhase(ctx, w, h, moon.illuminatedFraction, moon.waxing);
  }

  /**
   * Vykreslí fyzikálně korektní fázi Měsíce jako pohled na osvětlenou
   * polokouli (per-pixel osvětlení, ne aproximace elipsou). k = osvětlená
   * frakce 0..1 (0 = nov, 1 = úplněk), waxing = dorůstající/couvající.
   */
  _paintMoonPhase(ctx, w, h, k, waxing) {
    const r = w / 2 - 3;
    const cx = w / 2, cy = h / 2;
    const img = ctx.createImageData(w, h);
    const theta = Math.acos(Math.max(-1, Math.min(1, 2 * k - 1)));
    const s = waxing ? 1 : -1;
    const Lx = Math.sin(theta) * s;
    const Lz = Math.cos(theta);
    const light = [242, 236, 216];
    const dark = [23, 29, 41];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const nx = (x + 0.5 - cx) / r;
        const ny = (y + 0.5 - cy) / r;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1) {
          img.data[idx + 3] = 0;
          continue;
        }
        const nz = Math.sqrt(Math.max(0, 1 - d2));
        const illum = nx * Lx + nz * Lz;
        const t = Math.max(0, Math.min(1, (illum + 0.06) / 0.12));
        img.data[idx] = dark[0] + (light[0] - dark[0]) * t;
        img.data[idx + 1] = dark[1] + (light[1] - dark[1]) * t;
        img.data[idx + 2] = dark[2] + (light[2] - dark[2]) * t;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _updateOrbitIcon(now) {
    const el = this._els.orbitEarth;
    if (!el) return;
    const start = Date.UTC(now.getUTCFullYear(), 0, 1);
    const dayOfYear = (now.getTime() - start) / 86400000;
    const angle = (dayOfYear / 365.25) * Math.PI * 2 - Math.PI / 2;
    const cx = 22, cy = 22, r = 18;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    el.setAttribute('cx', x.toFixed(2));
    el.setAttribute('cy', y.toFixed(2));
  }

  _onResize() {
    if (!this._renderer || !this._els.stage) return;
    const rect = this._els.stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------------------
// Vizuální editor karty
// ---------------------------------------------------------------------------

const EDITOR_SCHEMA = [
  {
    name: 'title',
    selector: { text: {} },
  },
  {
    name: 'location_source',
    selector: {
      select: {
        mode: 'dropdown',
        options: [
          { value: 'home', label: 'Domovská poloha Home Assistanta' },
          { value: 'entity', label: 'Sledovaná entita (person / device_tracker / zone)' },
        ],
      },
    },
  },
  {
    name: 'entity',
    selector: { entity: { domain: ['person', 'device_tracker', 'zone'] } },
  },
  {
    name: 'quality',
    selector: {
      select: {
        mode: 'dropdown',
        options: Object.entries(QUALITY_TIERS).map(([value, t]) => ({ value, label: t.label })),
      },
    },
  },
  { name: 'show_clouds', selector: { boolean: {} } },
  { name: 'show_moon', selector: { boolean: {} } },
  { name: 'show_sun_marker', selector: { boolean: {} } },
  { name: 'show_stars', selector: { boolean: {} } },
  { name: 'show_countdown', selector: { boolean: {} } },
  { name: 'show_day_length', selector: { boolean: {} } },
  { name: 'rotation_wobble', selector: { boolean: {} } },
  {
    name: 'brightness',
    selector: { number: { min: 0.5, max: 5, step: 0.1, mode: 'slider' } },
  },
  { name: 'accent_color', selector: { text: {} } },
];

const EDITOR_LABELS = {
  title: 'Titulek (volitelné)',
  location_source: 'Zdroj polohy',
  entity: 'Entita polohy',
  quality: 'Kvalita textur',
  show_clouds: 'Zobrazit mraky',
  show_moon: 'Zobrazit Měsíc',
  show_sun_marker: 'Zobrazit značku Slunce',
  show_stars: 'Zobrazit hvězdné pozadí',
  show_countdown: 'Zobrazit odpočet do východu/západu',
  show_day_length: 'Zobrazit délku dne',
  rotation_wobble: 'Jemná animovaná rotace',
  brightness: 'Jas glóbu',
  accent_color: 'Barva zvýraznění (CSS, volitelné)',
};

class AstronomicalGlobeCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        ha-form { display: block; padding: 8px 0; }
        .agc-editor-version {
          display: flex; justify-content: flex-end; align-items: center;
          gap: 6px; padding: 0 2px 6px 2px; font-size: 11px;
          color: var(--secondary-text-color, #888); opacity: 0.8;
          font-family: var(--code-font-family, monospace);
        }
      </style>
      <div class="agc-editor-version">Astronomical Globe Card v${CARD_VERSION}</div>
    `;
    const form = document.createElement('ha-form');
    form.hass = this._hass;
    form.data = this._config;
    form.schema = EDITOR_SCHEMA;
    form.computeLabel = (item) => EDITOR_LABELS[item.name] || item.name;
    form.addEventListener('value-changed', (ev) => {
      ev.stopPropagation();
      const newConfig = ev.detail.value;
      this._config = newConfig;
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: newConfig } }));
    });
    this._form = form;
    this.shadowRoot.appendChild(form);
  }
}

// ---------------------------------------------------------------------------
// Registrace
// ---------------------------------------------------------------------------

customElements.define('astronomical-globe-card', AstronomicalGlobeCard);
customElements.define('astronomical-globe-card-editor', AstronomicalGlobeCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'astronomical-globe-card',
  name: 'Astronomical Globe Card',
  description: 'Realistický 3D glóbus Země s reálným terminátorem, Měsícem a polohou GPS (styl Apple Watch Astronomie).',
  preview: false,
});

// eslint-disable-next-line no-console
console.info(
  `%c ASTRONOMICAL-GLOBE-CARD %c v${CARD_VERSION} `,
  'color: white; background: #1c2b45; font-weight: 700;',
  'color: #1c2b45; background: white; font-weight: 700;'
);
