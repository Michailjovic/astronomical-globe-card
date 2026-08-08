/**
 * earth-shaders.js
 * GLSL shadery pro realistický glóbus: den/noc terminátor s texturami,
 * soumrakový okraj, mraky a atmosférická záře (Fresnel rim glow).
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
    // NASA Black Marble - na rozdíl od čistě černé "jen města" textury už
    // přirozeně obsahuje jemný modrý "měsíční" nádech oceánu/pevniny, není
    // proto potřeba uměle přimíchávat ztmavenou denní texturu.
    vec3 nightRaw = texture2D(nightTexture, vUv).rgb;

    // "Jas" (exposure) cíleně zesiluje hlavně SVĚTLA MĚST (nejjasnější
    // pixely textury), takže tmavý oceán/pevninu to nezabahní do hněda -
    // naopak čím vyšší jas, tím sytější a výraznější světla, podobně jako
    // na reálných nočních satelitních snímcích.
    vec3 nightLights = nightRaw * nightBrightness * exposure;

    // Nepatrné, na exposure nezávislé dodatečné podsvícení - textura už má
    // svůj vlastní modrý nádech, tohle je jen jemný extra "polish".
    vec3 nightAmbient = vec3(0.004, 0.007, 0.014);

    vec3 nightColor = nightLights + nightAmbient;
    vec3 color = mix(nightColor, dayColor, dayMix);

    // Teplá soumraková záře podél terminátoru - pevný příspěvek nezávislý
    // na exposure, ať při vysokém jasu nepřebije barvy do hněda.
    float twilight = 1.0 - smoothstep(0.0, 0.16, abs(sunDot));
    vec3 twilightColor = vec3(1.0, 0.45, 0.15);
    color += twilightColor * twilight * twilightStrength;

    // jemné zvýšení sytosti barev pro živější, "atraktivnější" vzhled
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma), color, 1.18);

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
    // v noci jemně viditelné "měsíčním svitem" nasvícené mraky, ne skoro
    // neviditelné - a mírně chladnější (namodralý) tón oproti dennímu bílému
    float alpha = cloudLum * opacity * mix(0.55, 1.0, lightFactor);
    vec3 cloudColor = mix(vec3(0.78, 0.85, 0.98), vec3(1.0), lightFactor);

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

export const skyFragmentShader = /* glsl */ `
  uniform sampler2D starsTexture;
  varying vec3 vPos;

  void main() {
    vec3 dir = normalize(vPos);
    // stejná equirektangulární konvence jako geoToVector3() v JS
    float lat = asin(clamp(dir.y, -1.0, 1.0));
    float lon = atan(-dir.z, dir.x);
    float u = (lon + 3.14159265) / (2.0 * 3.14159265);
    float v = 0.5 - lat / 3.14159265;
    gl_FragColor = vec4(texture2D(starsTexture, vec2(u, v)).rgb, 1.0);
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
