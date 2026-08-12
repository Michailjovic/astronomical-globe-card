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
 * @version 0.5.0
 *
 * POZOR (cache): vnořené JS moduly (lib/*.js) se importují staticky
 * (standardní `import` nahoře souboru - spolehlivější než dynamický
 * `await import()`, který se v praxi ukázal křehčí a jeho selhání shazovalo
 * celou kartu do prázdna bez chybové hlášky), ALE se stejně verzují
 * natvrdo napsaným `?v=X.Y.Z` v samotném specifikátoru importu (musí se
 * ručně bumpnout na 3 místech při každé verzi: @version výše, CARD_VERSION
 * konstanta, a query string ve 3 static importech - viz paměť "verzování").
 * Bez téhle cache-busting query je reálné riziko, že prohlížeč/HA servuje
 * starou/rozbitou cache vnořeného souboru napořád, což shodí registraci
 * celé karty ("Custom element doesn't exist") bez jakékoli viditelné chyby.
 * Textury (obrázky přes TextureLoader) se verzují stejně, přes proměnnou V.
 *
 * SPOLEHLIVOST NAČÍTÁNÍ: každá textura se při selhání HTTP požadavku
 * jednou automaticky zopakuje (dočasný výpadek sítě) a pokud selže i
 * opakování, zobrazí se viditelná chybová hláška místo tichého prázdného
 * plátna. Stejně tak selhání WebGL inicializace (_initThree) už není tiché.
 *
 * v0.3.4: vizuální ladění - kamera odsazená dál od glóbu (kolem planety je
 * vidět kus hvězdného nebe), sytější barvy, jasnější hvězdné pozadí,
 * výraznější atmosférická záře.
 *
 * v0.3.5: oprava reálného důvodu, proč v0.3.4 vizuálně skoro nic
 * nezměnila - noční textura Země má oceán jako čistě černé pixely, takže
 * násobení jasem na něj nemělo žádný efekt; teď se přičítá konstantní
 * modré podsvícení. Hvězdné pozadí se navíc generuje procedurálně místo
 * z (velmi tmavé) textury stars.jpg.
 *
 * v0.3.6: oprava regrese z v0.3.5 - v earth-shaders.js byl v GLSL
 * komentáři uvnitř template literalu omylem párový znak backtick, což
 * v JS předčasně ukončilo string a rozbilo syntaxi celého souboru → karta
 * spadla už při načtení modulu ("Custom element doesn't exist").
 *
 * v0.3.7: řešilo zpětnou vazbu "barvy jsou pořád vybledlé, posuvník jasu
 * skoro nic nedělá" - užší soumrakový pás, silnější kontrast/sytost.
 *
 * v0.3.8: VŠECHNY parametry, které ovlivňují vzhled obrazu (síla nočního
 * podsvícení oceánu, sytost, kontrast, síla soumraku, krytí mraků, síla
 * atmosférické záře, jas hvězd/mlhoviny), jsou teď samostatné položky
 * v konfiguraci a posuvníky ve vizuálním editoru - místo aby byly
 * zadrátované jako konstanty v shaderu a měnily se jen přes zásah do kódu.
 * Viz earth-shaders.js pro detaily jednotlivých uniforem.
 *
 * v0.3.9 - SKUTEČNÁ PŘÍČINA "ztmavovacího filtru přes celou kartu": three.js
 * od r152 defaultně zapíná automatickou barevnou správu (ColorManagement) -
 * textury označené jako SRGBColorSpace se při čtení v shaderu tiše dekódují
 * sRGB->lineární a `new THREE.Color(hex)` dělá totéž. To je v pořádku pro
 * built-in materiály (ty mají vestavěný zpětný převod na výstupu), ale naše
 * VLASTNÍ ShaderMaterial (Země/mraky/atmosféra, viz earth-shaders.js) žádný
 * zpětný převod nedělaly - výsledek byl systematicky tmavší/míň sytý, než
 * hodnoty v kódu/texturách napovídají (ověřeno: hex 0x57c8ff vycházel jako
 * [0.10, 0.58, 1.00] místo [0.34, 0.78, 1.00]). Opraveno: den/noc/mraky
 * textury teď mají NoColorSpace (syrové hodnoty 1:1) a atmosférická barva
 * se čte přes setHex(hex, NoColorSpace). Sluneční záře a GPS značka měly
 * naopak opačný problém (built-in SpriteMaterial + textura bez colorSpace
 * = zbytečný DVOJITÝ převod na výstupu = vymytý/mlhavý vzhled) - opraveno
 * přidáním SRGBColorSpace na jejich canvas textury.
 *
 * v0.3.10 - SKUTEČNÁ (a tentokrát opravdu poslední) příčina "průsvitného
 * černého skla přes celou kartu", které v0.3.9 nevyřešila: CSS pravidlo
 * ".agc-error" (nastavuje "display: flex") má STEJNOU specificitu jako
 * výchozí prohlížečové pravidlo "[hidden] { display: none }" - a autorské
 * pravidlo v cascade vyhrává nad UA výchozím, takže atribut `hidden`
 * (přepínaný v JS) neměl žádný vizuální efekt. Poloprůhledná černá vrstva
 * chybové hlášky (rgba(0,0,0,0.75)) tak ležela nastálé přes celým plátnem
 * úplně nezávisle na jasu/sytosti/kontrastu - proto žádné z ladění barev
 * v0.3.1-0.3.9 vizuálně nic nezměnilo. Ověřeno pixel-přesně headless
 * renderem (barva pixelu Austrálie/oceánu teď 1:1 odpovídá zdrojové
 * textuře, dřív byla systematicky ~4x tmavší = přesně 1-0.75). Oprava:
 * přidáno ".agc-error[hidden] { display: none; }" s vyšší specificitou.
 *
 * v0.3.11 - oprava "obrázek se nenačte po vstupu do edit módu dashboardu":
 * `attachShadow()` lze na DOM elementu zavolat jen jednou za celý jeho
 * život. HA při reorganizaci masonry/sections layoutu (typicky právě při
 * přepnutí dashboardu do edit módu) běžně znovu použije TENTÝŽ element
 * (odpojí ho a znovu připojí), a `connectedCallback()` v tom případě volá
 * `_build()` podruhé na elementu, který už shadow root má - `attachShadow()`
 * pak vyhodí výjimku ještě PŘED `_initThree()`/`_loadTextures()`, takže se
 * 3D scéna a textury už nikdy znovu nepostaví a zůstane viset stará,
 * mezitím `_dispose()`-em uvolněná (mrtvá) shadow DOM bez obrázku. Oprava:
 * `attachShadow()` volat jen když `this.shadowRoot` ještě neexistuje.
 *
 * v0.4.0 - nová konfigurační volba `marker_size` (posuvník v editoru):
 * velikost GPS značky domovské/sledované polohy na povrchu glóbu dřív byla
 * napevno 0.1 (natvrdo v kódu), teď je nastavitelná (výchozí hodnota
 * beze změny, takže stávající konfigurace vypadají stejně jako dřív).
 *
 * v0.5.0 - ruční otáčení glóbem tažením myší/prstem po canvasu (config
 * `manual_rotation`, výchozí zapnuto). Implementováno jako akumulovaný
 * azimut/elevace navrch stávajícího výpočtu směru kamery (stejný princip
 * jako `rotation_wobble`), ne jako přepis kamery/OrbitControls - proto se
 * to dobře snáší se sledováním domovské polohy i s wobble efektem (wobble
 * se během aktivního tažení potlačí, ať se s gestem nepere). `.agc-canvas`
 * má `touch-action: none`, jinak by mobilní prohlížeč tažení interpretoval
 * jako scroll stránky místo rotace (stejný kompromis jako HA mapová karta -
 * dotykem přímo na glóbu už nejde scrollovat skrz kartu, mimo kartu ano).
 * Po ~5 s nečinnosti se natočení plynule (frame-rate nezávislý exp. doběh)
 * vrátí zpět na sledovanou polohu.
 */

// POZOR: verze v query stringu níže (?v=0.3.10) je záměrně napsaná natvrdo,
// NE přes proměnnou/template literal - specifikátor static importu musí být
// syntaktický string literál, jinak by to nebyl platný static import. Musí
// se ale ručně držet synchronně s CARD_VERSION (viz paměť "verzování") -
// jinak nedojde k cache-bustu vnořených lib/*.js souborů při bumpu verze.
import * as THREE from './lib/three.module.min.js?v=0.5.0';
import { getSunPosition, getMoonPosition, getSunTimes } from './lib/astro.js?v=0.5.0';
import {
  earthVertexShader,
  earthFragmentShader,
  cloudsVertexShader,
  cloudsFragmentShader,
  atmosphereVertexShader,
  atmosphereFragmentShader,
  skyVertexShader,
  skyFragmentShader,
} from './lib/earth-shaders.js?v=0.5.0';

const CARD_VERSION = '0.5.0';
const CARD_DIR = new URL('.', import.meta.url).href;
const V = `?v=${CARD_VERSION}`;
const EARTH_RADIUS = 1;
// Odsazeno dál (dřív 2.55) - glóbus zabírá cca 70 % výšky rámečku místo
// skoro 100 %, takže je kolem něj vidět kus hvězdného vesmíru.
const CAMERA_DISTANCE = 3.2;
const MOON_ORBIT_RADIUS = 2.5;
const MOON_RADIUS = 0.16;
// Ruční otáčení tažením (config `manual_rotation`) - po tolika sekundách
// nečinnosti od posledního pohybu prstem/myší se karta začne plynule vracet
// zpět na sledovanou domovskou polohu (časová konstanta exp. doběhu v _frame()).
const MANUAL_IDLE_TIMEOUT = 5;
const MANUAL_RETURN_TIME_CONSTANT = 1.1;
// Základní (referenční) hodnota atmosférické záře - config `atmosphere_
// intensity` ji násobí (1.0 = tato hodnota).
const ATMOSPHERE_BASE_INTENSITY = 1.55;

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
  manual_rotation: true,
  accent_color: '',
  // -- vzhled/barevnost - všechno níž má svůj posuvník ve vizuálním editoru
  brightness: 1.35, // jas/exposure - hlavně světla měst v noci
  night_ambient: 1.0, // síla modrého "earthshine" podsvícení nočního oceánu
  saturation: 1.6, // celková sytost barev
  contrast: 0.28, // síla S-křivkového kontrastu (0 = beze změny)
  twilight_strength: 0.34, // síla teplé soumrakové záře podél terminátoru
  cloud_opacity: 0.4, // krytí mraků
  atmosphere_intensity: 1.0, // síla modré atmosférické záře na okraji
  sky_intensity: 1.0, // jas hvězd a mlhoviny v pozadí
  marker_size: 0.1, // velikost GPS značky domovské/sledované polohy
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
  // Canvas 2D barvy jsou sRGB - použité v built-in SpriteMaterial, který
  // (na rozdíl od našich vlastních ShaderMaterial) automaticky dělá
  // sRGB<->lineární zpětný převod na výstupu. Bez tohoto štítku by ta
  // automatika dostala nesprávný vstup a záře by vycházela vymytá/mlhavá.
  tex.colorSpace = THREE.SRGBColorSpace;
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
  tex.colorSpace = THREE.SRGBColorSpace; // viz poznámka u makeGlowSpriteTexture
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
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; // viz poznámka u makeGlowSpriteTexture
  return tex;
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

    // POZOR: attachShadow() lze na elementu zavolat jen JEDNOU za celý jeho
    // život (DOM spec) - podruhé vyhodí "already hosts a shadow tree" a
    // volání skončí ještě PŘED _initThree()/_loadTextures(), takže se
    // glóbus už nikdy nepostaví. Home Assistant přitom stejnou instanci
    // elementu běžně znovu použije (disconnect+reconnect) při reorganizaci
    // masonry/sections layoutu - typicky právě při přepnutí do edit módu
    // dashboardu. connectedCallback() proto po dispose() volá _build()
    // znovu na TÉMŽ elementu, který už shadow root má → bez téhle
    // podmínky by druhá stavba tiše/neviditelně selhala a karta by zůstala
    // se starým, už uvolněným (disposed) plátnem bez obrázku. Řešení: shadow
    // root vytvořit jen když ještě neexistuje, jinak jen přepsat jeho obsah.
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
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
    this._bindDragRotation();

    try {
      this._initThree();
    } catch (err) {
      // Selhání WebGL inicializace (chybí podpora, vyčerpaný kontext apod.)
      // dřív skončilo tichou prázdnou kartou - teď je vidět proč.
      console.error('[astronomical-globe-card] Inicializace 3D vykreslování selhala:', err);
      this._els.error.hidden = false;
      this._els.error.textContent =
        'Nepodařilo se inicializovat 3D vykreslování (WebGL). Zkus obnovit stránku (Ctrl+Shift+R).';
      return;
    }
    this._renderStaticParts();
    this._loadTextures();

    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(this._els.stage);
    this._onResize();

    this._startLoop();
  }

  /**
   * Ruční otáčení glóbem tažením myší/prstem (config `manual_rotation`).
   * Nemění samotnou geometrii/kameru přímo - jen akumuluje `_manualAz`/
   * `_manualEl` (radiány), které `_frame()` přičte k výpočtu směru kamery.
   * Po puštění se karta po chvíli nečinnosti sama plynule vrátí zpátky na
   * sledovanou domovskou polohu (viz `_frame()`).
   */
  _bindDragRotation() {
    const el = this._els.canvas;
    this._manualAz = 0;
    this._manualEl = 0;
    this._dragging = false;
    this._dragLastX = 0;
    this._dragLastY = 0;
    this._lastInteractionT = 0;

    // rad/px - horizontální tažení citlivější než vertikální (odpovídá tomu,
    // že otáčení kolem svislé osy působí přirozeněji než naklápění pólů).
    const SENS_AZ = 0.012;
    const SENS_EL = 0.008;
    const MAX_EL = degToRad(85); // těsně pod pólem, ať kamera "nepřeskočí" na druhou stranu

    const onPointerDown = (ev) => {
      if (!this._config.manual_rotation) return;
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      this._dragging = true;
      this._dragLastX = ev.clientX;
      this._dragLastY = ev.clientY;
      el.classList.add('agc-dragging');
      try { el.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    };
    const onPointerMove = (ev) => {
      if (!this._dragging) return;
      const dx = ev.clientX - this._dragLastX;
      const dy = ev.clientY - this._dragLastY;
      this._dragLastX = ev.clientX;
      this._dragLastY = ev.clientY;
      this._manualAz -= dx * SENS_AZ;
      this._manualEl = Math.max(-MAX_EL, Math.min(MAX_EL, this._manualEl + dy * SENS_EL));
      this._lastInteractionT = this._clock.getElapsedTime();
    };
    const endDrag = (ev) => {
      if (!this._dragging) return;
      this._dragging = false;
      this._lastInteractionT = this._clock.getElapsedTime();
      el.classList.remove('agc-dragging');
      try { el.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    // POZOR: element (canvas) se při _build() vždy vytváří znovu (nový
    // `shadowRoot.innerHTML`), takže staré listenery zaniknou spolu s ním -
    // explicitní cleanup tu není nutný, ale referenci schováme pro pořádek.
    this._dragUnbind = () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
    };
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
        background: radial-gradient(circle at 50% 45%, #0a0f1e 0%, #000 80%);
        overflow: hidden;
      }
      .agc-canvas {
        position: absolute; inset: 0; width: 100%; height: 100%; display: block;
        /* touch-action: none - bez tohohle by mobilní prohlížeč bral tažení
           přes canvas jako pokus o scroll stránky a rotaci by "ukradl" pro
           sebe (rvačka o gesto - žádná rotace by se nezobrazila, jen se
           odscrolovala stránka). Cena: dotykem přímo na glóbu už nejde
           scrollovat dashboard skrz kartu (stejný kompromis jako u
           HA mapové karty) - nad/pod kartou to jde normálně dál. */
        touch-action: none; -webkit-user-select: none; user-select: none;
        cursor: grab;
      }
      .agc-canvas.agc-dragging { cursor: grabbing; }

      .agc-overlay-top {
        position: absolute; top: 14px; left: 18px; right: 18px;
        pointer-events: none; text-shadow: 0 1px 8px rgba(0,0,0,0.85), 0 0 20px rgba(0,0,0,0.5);
      }
      .agc-date {
        font-size: 15px; letter-spacing: 1.5px; font-weight: 700;
        color: #fff; text-transform: uppercase;
      }
      .agc-time {
        font-size: clamp(30px, 11vw, 52px); font-weight: 400; line-height: 1.05;
        color: #fff; font-variant-numeric: tabular-nums; margin-top: 2px;
      }

      .agc-overlay-bottom {
        position: absolute; left: 62px; right: 62px; bottom: 20px;
        pointer-events: none; text-shadow: 0 1px 8px rgba(0,0,0,0.85), 0 0 20px rgba(0,0,0,0.5);
        text-align: center;
      }
      .agc-row {
        font-size: 13px; font-weight: 600; color: #fff;
        line-height: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
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
      /* SKUTEČNÁ PŘÍČINA "tmavého skla přes celou kartu": autorské pravidlo
         ".agc-error" s "display: flex" má stejnou specificitu jako výchozí
         UA pravidlo prohlížeče "[hidden]" s "display: none", a autorské
         pravidlo v cascade vyhrává - takže atribut hidden (přepínaný v JS
         přes this._els.error.hidden = true/false) neměl ŽÁDNÝ vizuální
         efekt a tahle poloprůhledná černá vrstva (rgba(0,0,0,0.75), proto
         ten "průsvitný černý filtr") ležela NASTÁLE přes celým plátnem,
         nezávisle na jakémkoli nastavení jasu/sytosti/kontrastu. Tohle
         pravidlo má vyšší specificitu (class+atribut > class) a vrací
         hidden atributu jeho normální chování. Ověřeno headless renderem:
         bez téhle opravy byl každý pixel plátna násoben ~0.25 (= 1 - 0.75
         alpha černého překryvu), rovnoměrně napříč celým obrazem. */
      .agc-error[hidden] { display: none; }
    `;
  }

  _renderStaticParts() {
    if (!this._els) return;
    this._els.title.textContent = this._config.title || '';
    if (this._config.accent_color) {
      this.style.setProperty('--agc-accent', this._config.accent_color);
    }
    const cfg = this._config;

    if (this._earthUniforms) {
      this._earthUniforms.exposure.value = cfg.brightness ?? DEFAULT_CONFIG.brightness;
      this._earthUniforms.nightAmbientStrength.value = cfg.night_ambient ?? DEFAULT_CONFIG.night_ambient;
      this._earthUniforms.colorSaturation.value = cfg.saturation ?? DEFAULT_CONFIG.saturation;
      this._earthUniforms.colorContrast.value = cfg.contrast ?? DEFAULT_CONFIG.contrast;
      this._earthUniforms.twilightStrength.value = cfg.twilight_strength ?? DEFAULT_CONFIG.twilight_strength;
    }
    if (this._cloudsUniforms) {
      this._cloudsUniforms.opacity.value = cfg.cloud_opacity ?? DEFAULT_CONFIG.cloud_opacity;
    }
    if (this._atmosphereUniforms) {
      const atmoIntensity = cfg.atmosphere_intensity ?? DEFAULT_CONFIG.atmosphere_intensity;
      this._atmosphereUniforms.glowIntensity.value = ATMOSPHERE_BASE_INTENSITY * atmoIntensity;
    }
    if (this._skyUniforms) {
      this._skyUniforms.skyIntensity.value = cfg.sky_intensity ?? DEFAULT_CONFIG.sky_intensity;
    }
    if (this._skyMesh) {
      this._skyMesh.visible = !!cfg.show_stars;
    }
    if (this._markerSprite) {
      const markerSize = cfg.marker_size ?? DEFAULT_CONFIG.marker_size;
      this._markerSprite.scale.set(markerSize, markerSize, 1);
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

    const cfg = this._config || DEFAULT_CONFIG;

    // -- Hvězdné pozadí (skybox) ------------------------------------------
    // Procedurální hvězdy + mlhovina přímo v shaderu (viz earth-shaders.js).
    const skyGeometry = new THREE.SphereGeometry(50, 48, 48);
    this._skyUniforms = {
      skyIntensity: { value: cfg.sky_intensity ?? DEFAULT_CONFIG.sky_intensity },
    };
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
      nightBrightness: { value: 2.6 },
      twilightStrength: { value: cfg.twilight_strength ?? DEFAULT_CONFIG.twilight_strength },
      exposure: { value: cfg.brightness ?? DEFAULT_CONFIG.brightness },
      nightAmbientStrength: { value: cfg.night_ambient ?? DEFAULT_CONFIG.night_ambient },
      colorSaturation: { value: cfg.saturation ?? DEFAULT_CONFIG.saturation },
      colorContrast: { value: cfg.contrast ?? DEFAULT_CONFIG.contrast },
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
      opacity: { value: cfg.cloud_opacity ?? DEFAULT_CONFIG.cloud_opacity },
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
      // POZOR: `new THREE.Color(hex)` by tady tiše aplikovalo three.js
      // automatickou sRGB->lineární konverzi (od r152 defaultní chování
      // ColorManagement) - výsledek by byl citelně tmavší/míň sytý, než
      // hex hodnota napovídá (0x57c8ff by vyšlo jako [0.10, 0.58, 1.00]
      // místo [0.34, 0.78, 1.00]), protože náš vlastní atmosphereFragment
      // shader žádný zpětný převod na výstupu nedělá. `setHex(hex,
      // NoColorSpace)` dá barvu 1:1 podle hex hodnoty.
      glowColor: { value: new THREE.Color().setHex(0x57c8ff, THREE.NoColorSpace) },
      glowPower: { value: 2.15 },
      glowIntensity: {
        value: ATMOSPHERE_BASE_INTENSITY * (cfg.atmosphere_intensity ?? DEFAULT_CONFIG.atmosphere_intensity),
      },
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
    // Počáteční hodnota - hned po _initThree() ji přepíše _renderStaticParts()
    // podle cfg.marker_size (posuvník "Velikost GPS značky" v editoru).
    const initialMarkerSize = cfg.marker_size ?? DEFAULT_CONFIG.marker_size;
    markerSprite.scale.set(initialMarkerSize, initialMarkerSize, 1);
    earthMesh.add(markerSprite);
    this._markerSprite = markerSprite;

    // -- Slunce (světelný zdroj + vizuální značka) ----------------------------
    const sunLight = new THREE.DirectionalLight(0xfff2d9, 1.55);
    scene.add(sunLight);
    this._sunLight = sunLight;
    scene.add(new THREE.AmbientLight(0x1c2b45, 0.5));

    // Dvouvrstvá záře - velký měkký halo + malé ostré jasné jádro, ať to
    // připomíná sluneční záblesk na okraji glóbu místo ploché tečky.
    // Měřítka o něco větší než dřív kvůli odsazenější kameře.
    const sunHaloMaterial = new THREE.SpriteMaterial({
      map: makeGlowSpriteTexture(),
      transparent: true,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const sunHalo = new THREE.Sprite(sunHaloMaterial);
    sunHalo.scale.set(1.0, 1.0, 1);
    scene.add(sunHalo);
    this._sunHalo = sunHalo;

    const sunCoreMaterial = new THREE.SpriteMaterial({
      map: makeSunCoreTexture(),
      transparent: true,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const sunSprite = new THREE.Sprite(sunCoreMaterial);
    sunSprite.scale.set(0.26, 0.26, 1);
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

  /**
   * Načte texturu s jedním automatickým opakováním při selhání (výpadek sítě
   * / dočasná chyba HTTP se u statických assetů běžně vyřeší druhým pokusem)
   * a s viditelnou chybovou hláškou, pokud selže i opakování - místo
   * dosavadního tichého "nenačte se to a karta zůstane prázdná".
   */
  _loadTextureWithRetry(loader, url, onLoad, label) {
    const attempt = (isRetry) => {
      loader.load(
        isRetry ? `${url}&retry=1` : url,
        onLoad,
        undefined,
        (err) => {
          if (!isRetry) {
            setTimeout(() => attempt(true), 800);
            return;
          }
          console.error(`[astronomical-globe-card] Nepodařilo se načíst texturu "${label}":`, url, err);
          this._pendingTextureErrors = (this._pendingTextureErrors || 0) + 1;
          if (this._els && this._els.error) {
            this._els.error.hidden = false;
            this._els.error.textContent = `Nepodařilo se načíst texturu (${label}). Zkontroluj připojení a zkus obnovit stránku.`;
          }
        }
      );
    };
    attempt(false);
  }

  _loadTextures() {
    const tier = QUALITY_TIERS[this._config.quality] || QUALITY_TIERS.medium;
    const folder = tier.folder;
    const loader = new THREE.TextureLoader();
    const base = `${CARD_DIR}assets/textures/${folder}/`;

    // Den/noc/mraky jedou v NAŠICH VLASTNÍCH ShaderMaterial (earth-shaders.js),
    // které nemají žádný vestavěný zpětný sRGB<->lineární převod na výstupu.
    // Kdyby se jim texturám nastavilo SRGBColorSpace (jako se to dřív dělalo
    // přes stejný `setTex` pro všechno), GPU by je při čtení v shaderu tiše
    // dekódoval na lineární hodnoty - ale bez odpovídajícího zpětného
    // překódování na výstupu by byl výsledek citelně tmavší, což byla reálná
    // příčina dojmu "ztmavovacího filtru přes celou kartu". Proto tu chceme
    // NoColorSpace - texture2D() v shaderu pak vrací syrové 0-1 hodnoty
    // přesně podle bajtů v JPG, přesně to, s čím naše barevné ladění počítá.
    const setRawTex = (tex) => {
      tex.colorSpace = THREE.NoColorSpace;
      tex.anisotropy = 4;
      return tex;
    };
    // Měsíc naopak jede v built-in MeshStandardMaterial, který sRGB<->lineární
    // převod na výstupu DĚLÁ automaticky - tam SRGBColorSpace zůstává správně
    // (dekódování na vstupu + zakódování na výstupu se navzájem vyruší).
    const setColorTex = (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    };

    this._loadTextureWithRetry(loader, `${base}earth-day.jpg${V}`, (tex) => {
      this._earthUniforms.dayTexture.value = setRawTex(tex);
    }, 'den');
    this._loadTextureWithRetry(loader, `${base}earth-night.jpg${V}`, (tex) => {
      this._earthUniforms.nightTexture.value = setRawTex(tex);
    }, 'noc');
    this._loadTextureWithRetry(loader, `${base}earth-clouds.jpg${V}`, (tex) => {
      this._cloudsUniforms.cloudsTexture.value = setRawTex(tex);
    }, 'mraky');
    this._loadTextureWithRetry(loader, `${base}moon.jpg${V}`, (tex) => {
      this._moonMesh.material.map = setColorTex(tex);
      this._moonMesh.material.needsUpdate = true;
    }, 'Měsíc');
    // Hvězdné pozadí se negeneruje z textury (viz earth-shaders.js), takže
    // tu není co dohrávat.
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
    const dt = t - (this._lastFrameT ?? t);
    this._lastFrameT = t;

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
    let az = 0;
    let el = 0;
    // Automatická jemná animace - potlačená během aktivního tažení, ať se
    // nepere s gestem uživatele (5°/3° výchylka je jinak nenápadná, ale
    // společně s ručním otáčením by to rušilo 1:1 odezvu na prst/myš).
    if (this._config.rotation_wobble && !this._dragging) {
      const wob = this._wobbleSeed;
      az += Math.sin(t * (2 * Math.PI / 300) + wob) * degToRad(5);
      el += Math.sin(t * (2 * Math.PI / 420) + wob * 1.7) * degToRad(3);
    }
    if (this._config.manual_rotation) {
      // Po MANUAL_IDLE_TIMEOUT sekundách nečinnosti se ruční natočení plynule
      // (exponenciální doběh, nezávislý na FPS) vrátí zpět na 0 - ať karta po
      // odložení telefonu/myši nezůstane natočená mimo domovskou polohu.
      if (!this._dragging && (this._manualAz !== 0 || this._manualEl !== 0)) {
        const idleFor = t - this._lastInteractionT;
        if (idleFor > MANUAL_IDLE_TIMEOUT) {
          const k = 1 - Math.exp(-dt / MANUAL_RETURN_TIME_CONSTANT);
          this._manualAz -= this._manualAz * k;
          this._manualEl -= this._manualEl * k;
          if (Math.abs(this._manualAz) < 0.001) this._manualAz = 0;
          if (Math.abs(this._manualEl) < 0.001) this._manualEl = 0;
        }
      }
      az += this._manualAz;
      el += this._manualEl;
    }
    if (az || el) {
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
  { name: 'manual_rotation', selector: { boolean: {} } },
  {
    name: 'brightness',
    selector: { number: { min: 0.5, max: 5, step: 0.1, mode: 'slider' } },
  },
  {
    name: 'night_ambient',
    selector: { number: { min: 0.2, max: 3, step: 0.1, mode: 'slider' } },
  },
  {
    name: 'saturation',
    selector: { number: { min: 0.6, max: 2.5, step: 0.05, mode: 'slider' } },
  },
  {
    name: 'contrast',
    selector: { number: { min: 0, max: 0.6, step: 0.02, mode: 'slider' } },
  },
  {
    name: 'twilight_strength',
    selector: { number: { min: 0, max: 1, step: 0.02, mode: 'slider' } },
  },
  {
    name: 'cloud_opacity',
    selector: { number: { min: 0, max: 1, step: 0.05, mode: 'slider' } },
  },
  {
    name: 'atmosphere_intensity',
    selector: { number: { min: 0.2, max: 3, step: 0.1, mode: 'slider' } },
  },
  {
    name: 'sky_intensity',
    selector: { number: { min: 0.2, max: 3, step: 0.1, mode: 'slider' } },
  },
  {
    name: 'marker_size',
    selector: { number: { min: 0.02, max: 0.3, step: 0.01, mode: 'slider' } },
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
  manual_rotation: 'Ruční otáčení tažením (myš/prst)',
  brightness: 'Jas (světla měst v noci)',
  night_ambient: 'Podsvícení nočního oceánu',
  saturation: 'Sytost barev',
  contrast: 'Kontrast',
  twilight_strength: 'Síla soumrakové záře',
  cloud_opacity: 'Krytí mraků',
  atmosphere_intensity: 'Síla atmosférické záře',
  sky_intensity: 'Jas hvězd a mlhoviny',
  marker_size: 'Velikost GPS značky',
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
