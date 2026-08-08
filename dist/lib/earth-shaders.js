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
    vec3 nightColor = texture2D(nightTexture, vUv).rgb * nightBrightness;

    vec3 color = mix(nightColor, dayColor, dayMix);

    // teplá soumraková záře podél terminátoru
    float twilight = 1.0 - smoothstep(0.0, 0.22, abs(sunDot));
    vec3 twilightColor = vec3(1.0, 0.45, 0.15);
    color += twilightColor * twilight * twilightStrength;

    // celkové zesvětlení pro lepší čitelnost na dashboardu (nastavitelné)
    color *= exposure;

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
    float alpha = cloudLum * opacity * mix(0.35, 1.0, lightFactor);

    gl_FragColor = vec4(vec3(1.0), alpha);
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
