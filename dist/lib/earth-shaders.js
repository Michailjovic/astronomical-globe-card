/**
 * earth-shaders.js
 * GLSL shadery pro realistický glóbus: den/noc terminátor s texturami,
 * soumrakový okraj, mraky a atmosférická záře (Fresnel rim glow).
 *
 * v0.3.5 - DŮLEŽITÁ OPRAVA (proč předchozí "sytější barvy" ladění nebylo
 * vidět): noční textura Země (`earth-night.jpg`, NASA Black Marble) má
 * OCEÁN jako čistě černé pixely rgb(0,0,0). Noční jas se dřív počítal jako
 * `nightRaw * nightBrightness * exposure` - násobení nuly je pořád nula,
 * takže žádné zesílení jasu/sytosti oceán vůbec nezměnilo (funguje jen na
 * světlech měst, kde textura nenulová je). Tmavá noční polokoule proto
 * i po ladění vypadala identicky. Teď se navíc přičítá výrazně silnější
 * konstantní `nightAmbient` (modré "earthshine" podsvícení nezávislé na
 * textuře), takže je oceán v noci vidět jako tmavě modrý, ne černý.
 *
 * Druhá změna: hvězdné pozadí už nevychází z `stars.jpg` (ta textura je
 * extrémně tmavá/nekontrastní - i silný gamma boost z ní vytáhl jen slabé
 * tečky, viz stejný problém s násobením blízko nuly). Místo textury se teď
 * hvězdné nebe i mlhovina (nebula) generují procedurálně přímo v shaderu
 * (hash/value-noise), takže barevnost a jas jsou plně pod kontrolou a nejsou
 * limitované kvalitou zdrojového obrázku.
 */

export const earthVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    // POZOR: záměrně NEpoužíváme normalMatrix (ten transformuje do view/eye
    // prostoru vzhledem ke kameře). Směr Slunce je počítán ve world-space
    // (reálná geografická pozice), a glóbus se nikdy sám neotáčí/nescaluje,
    // takže object-space normála == world-space normála. Kdyby se mesh
    // v budoucnu otáčel, je nutné směr Slunce před předáním do shaderu
    // přetransformovat do stejného (mesh-local) prostoru.
    vNormal = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const earthFragmentShader = /* glsl */ `
  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform vec3 sunDirection;
  uniform float nightBrightness;
  uniform float twilightStrength;
  uniform float exposure;

  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec3 normal = normalize(vNormal);
    float sunDot = dot(normal, normalize(sunDirection));

    // plynulý terminátor - úzké přechodové pásmo kolem sunDot = 0
    float dayMix = smoothstep(-0.12, 0.12, sunDot);

    vec3 dayColor = texture2D(dayTexture, vUv).rgb;
    // NASA Black Marble - OCEÁN je v této textuře čistě černý (0,0,0),
    // pevnina/města jsou nenulové. Viz poznámka v hlavičce souboru: proto
    // se násobící "jas" dole neuplatní na oceánu vůbec - to řeší až
    // `nightAmbient` níž.
    vec3 nightRaw = texture2D(nightTexture, vUv).rgb;

    // "Jas" (exposure) cíleně zesiluje hlavně SVĚTLA MĚST. Měkká komprese
    // (Reinhard-styl) místo tvrdého ořezu do bíla - jasná centra měst
    // zůstanou sytě zlatavá/oranžová místo vybělení do bezbarvého bílého
    // fleku, což byl další důvod, proč noční strana působila "mrtvě".
    vec3 nightLights = nightRaw * nightBrightness * exposure;
    nightLights = nightLights / (1.0 + nightLights * 0.55);

    // Výrazné modré "earthshine" podsvícení nezávislé na textuře - tohle
    // (ne násobení) je to, co dělá noční oceán viditelně tmavě modrým
    // místo černé díry, podobně jako na hezkých kompozitních "Night Earth"
    // fotkách.
    vec3 nightAmbient = vec3(0.05, 0.085, 0.17);

    vec3 nightColor = nightLights + nightAmbient;
    vec3 color = mix(nightColor, dayColor, dayMix);

    // Teplá soumraková záře podél terminátoru - pevný příspěvek nezávislý
    // na exposure, ať při vysokém jasu nepřebije barvy do hněda. Sytější
    // a o něco širší než dřív pro dramatičtější "golden hour" okraj.
    float twilight = 1.0 - smoothstep(0.0, 0.2, abs(sunDot));
    vec3 twilightColor = vec3(1.0, 0.42, 0.12);
    color += twilightColor * twilight * twilightStrength;

    // Výraznější zvýšení sytosti barev pro živější, "sexy" vzhled (sytější
    // modré oceány, zelenější/zlatější kontinenty) - bez posunu jasu.
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma), color, 1.4);

    // Velmi jemné "S-křivkové" zesílení kontrastu, ať den nepůsobí ploše.
    color = clamp(color, 0.0, 1.0);
    color = color * color * (3.0 - 2.0 * color) * 0.15 + color * 0.85;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

export const cloudsVertexShader = earthVertexShader;

export const cloudsFragmentShader = /* glsl */ `
  uniform sampler2D cloudsTexture;
  uniform vec3 sunDirection;
  uniform float opacity;

  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec3 normal = normalize(vNormal);
    float sunDot = dot(normal, normalize(sunDirection));
    float lightFactor = smoothstep(-0.3, 0.2, sunDot);

    float cloudLum = texture2D(cloudsTexture, vUv).r;
    // V noci teď mraky výrazně čitelnější (dřív mix(0.55, 1.0, ...), tedy
    // skoro neviditelné) - jemně "měsíčním svitem" nasvícené, mírně
    // chladnější (namodralý) tón oproti dennímu bílému.
    float alpha = cloudLum * opacity * mix(0.7, 1.0, lightFactor);
    vec3 cloudColor = mix(vec3(0.8, 0.87, 1.0), vec3(1.0), lightFactor);

    gl_FragColor = vec4(cloudColor, alpha);
  }
`;

export const skyVertexShader = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Procedurální hvězdné nebe + barevná mlhovina (nahrazuje dřívější statickou
// texturu `stars.jpg`, která byla příliš tmavá/nekontrastní na to, aby z ní
// šlo cokoliv vytáhnout - viz poznámka v hlavičce souboru). Čistě GLSL hash
// šum, žádné textury, žádné závislosti na síti.
export const skyFragmentShader = /* glsl */ `
  varying vec3 vPos;

  float hash13(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);
    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);
    return mix(nxy0, nxy1, f.z);
  }

  float fbm(vec3 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += amp * vnoise(p);
      p *= 2.02;
      amp *= 0.5;
    }
    return sum;
  }

  // Jedna vrstva "bodových" hvězd na mřížce ve směrovém prostoru - ostré
  // jádro s náhodnou velikostí/jasem/lehkým barevným nádechem (teplý vs.
  // chladný bílý), aby hvězdy nepůsobily jednotvárně.
  vec3 starLayer(vec3 dir, float density, float sharpness, float weight) {
    vec3 p = dir * density;
    vec3 ip = floor(p);
    vec3 fp = fract(p) - 0.5;
    float h = hash13(ip);
    vec3 jitter = vec3(
      hash13(ip + vec3(1.7, 9.2, 4.1)),
      hash13(ip + vec3(8.3, 2.8, 5.5)),
      hash13(ip + vec3(3.1, 7.4, 6.6))
    ) - 0.5;
    float d = length(fp - jitter * 0.8);
    float starRadius = mix(0.035, 0.2, fract(h * 41.0));
    float core = smoothstep(starRadius, 0.0, d);
    float tw = fract(h * 77.7);
    float brightness = pow(tw, sharpness) * weight;
    vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.93, 0.82), fract(h * 13.0));
    return core * brightness * tint;
  }

  void main() {
    vec3 dir = normalize(vPos);

    // Hluboký vesmírný podklad - ne úplně černý, jemný modrý nádech.
    vec3 color = vec3(0.008, 0.012, 0.026);

    // Barevná mlhovina (nebula) - velké měkké obláčky, jen v části oblohy
    // (maska), sytější modrá <-> purpurová, jemně "svítící" nad černým
    // pozadím. Posunuté offsety ať se vzory neopakují nudně v obou osách.
    float presence = fbm(dir * 0.85 + vec3(0.0, 11.3, 0.0));
    float mask = smoothstep(0.32, 0.72, presence);
    float n1 = fbm(dir * 1.6 + vec3(3.1, 1.7, 9.4));
    float n2 = fbm(dir * 2.6 + vec3(7.2, 4.4, 1.1));
    vec3 nebulaColorA = vec3(0.09, 0.14, 0.4);   // hluboká modrá
    vec3 nebulaColorB = vec3(0.34, 0.13, 0.42);  // purpurová/magenta
    vec3 nebulaColor = mix(nebulaColorA, nebulaColorB, clamp(n2, 0.0, 1.0));
    float nebulaIntensity = mask * clamp(n1, 0.0, 1.0) * 0.6;
    color += nebulaColor * nebulaIntensity;

    // Tři vrstvy hvězd - řídké velké/jasné, střední, husté drobné.
    color += starLayer(dir, 42.0, 5.5, 1.0);
    color += starLayer(dir + 31.4, 95.0, 9.0, 0.65);
    color += starLayer(dir + 77.1, 220.0, 15.0, 0.4);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

export const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 glowColor;
  uniform float glowPower;
  uniform float glowIntensity;

  varying vec3 vNormal;

  void main() {
    float intensity = pow(0.68 - dot(vNormal, vec3(0.0, 0.0, 1.0)), glowPower);
    gl_FragColor = vec4(glowColor, 1.0) * intensity * glowIntensity;
  }
`;

// Poznámka: atmosférická záře je záměrně vizuálně "levná" a stabilní
// (glowIntensity se nastavuje z JS podle configu, viz astronomical-globe-card.js),
// aby modrý okraj zůstal viditelný a konzistentní bez ohledu na hodnotu jasu.
