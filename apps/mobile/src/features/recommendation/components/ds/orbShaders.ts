// AURADIN — THE ORB, GLSL edition (three r128 / expo-gl · GLSL ES 1.00).
// Soap-bubble membrane: thin-film interference rim, liquid sheen, curved
// environment reflections, caustic ring below, two floating satellite bubbles.
//
// This module is framework-free on purpose (plain strings + numbers) so the
// shaders can be unit-snapshotted and reused. OrbGLCanvas.tsx builds the
// THREE.ShaderMaterial uniforms from ORB_UNIFORM notes below and drives the
// JS-side phases (uTime / uBoingT / uRimT / uSheenT) from ORB_ANIM.
//
// WebGL1 rules honored (expo-gl through three r128 runs the GLSL ES 1.00 path):
// no `#version`, no `in/out`, `gl_FragColor`, attributes/matrices come from
// three's injected prefix (position, normal, uv, modelMatrix, viewMatrix,
// projectionMatrix, cameraPosition) — never redeclare them.

/* ─ Shared noise chunk — Ashima simplex 3D (public domain). Prepended to both
     vertex and fragment sources. ─ */
export const NOISE = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

/* ─ Blob vertex — lumpy membrane displacement + jelly "boing" squash.
     Uniforms: uTime uFlow uAmp uFreq uSeed uBoingT uBoingAmp.
     Also used by the two satellite bubbles (smaller uAmp, higher uFreq). ─ */
export const BLOB_VERT = /* glsl */ `
uniform float uTime;
uniform float uFlow;     // noise drift speed
uniform float uAmp;      // displacement amplitude (blob 0.16 / bubbles ~0.05)
uniform float uFreq;     // noise frequency
uniform float uSeed;
uniform float uBoingT;   // JS-driven: t * 2PI / BOING_PERIOD_S
uniform float uBoingAmp;
varying vec3 vN;         // world-space displaced normal
varying vec3 vWp;        // world-space position
varying vec3 vOn;        // object-space unit normal (film patches stick to surface)
varying float vDisp;

float dispAmt(vec3 p){
  float t = uTime * uFlow;
  vec3 q = p * uFreq + vec3(uSeed);
  float n = snoise(q + vec3(0.0, t, t * 0.7));
  n += 0.32 * snoise(q * 2.1 - vec3(t * 0.9, 0.0, t * 0.5));
  return n * uAmp;
}

vec3 squashed(vec3 p){
  float s = sin(uBoingT);
  // y compress <-> xz bulge (volume-ish preserving jelly boing)
  return p * vec3(1.0 + uBoingAmp * s, 1.0 - uBoingAmp * 1.4 * s, 1.0 + uBoingAmp * 0.6 * s);
}

void main(){
  float r0 = length(position); // geometry radius (blob 1.0 / bubbles 0.1–0.16)
  vec3 n0 = normalize(position); // sphere: normal == direction
  float d0 = dispAmt(n0);
  vec3 pos = squashed(n0 * r0 * (1.0 + d0));
  // numeric normal from two tangent-space neighbors (smooth, no derivatives ext)
  vec3 t1 = normalize(abs(n0.y) < 0.99 ? cross(n0, vec3(0.0, 1.0, 0.0)) : vec3(1.0, 0.0, 0.0));
  vec3 b1 = normalize(cross(n0, t1));
  float e = 0.06;
  vec3 pa = normalize(n0 + t1 * e);
  vec3 pb = normalize(n0 + b1 * e);
  vec3 qa = squashed(pa * r0 * (1.0 + dispAmt(pa)));
  vec3 qb = squashed(pb * r0 * (1.0 + dispAmt(pb)));
  vec3 nrm = normalize(cross(qa - pos, qb - pos));
  if (dot(nrm, n0) < 0.0) nrm = -nrm;
  vN = normalize((modelMatrix * vec4(nrm, 0.0)).xyz);
  vOn = n0;
  vDisp = d0;
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/* ─ Blob fragment — the soap-bubble membrane.
     Uniforms: uTime uRimT uSheenT uGlow uGlowColor uAlphaBase uAlphaRim uOpacity.
     · thin-film interference: hue = film thickness (marble swirl) + grazing
       angle + slow JS rim rotation (uRimT) → brand pastel wheel orbTint()
     · liquid sheen: orbiting specular streak (uSheenT) + fixed under-spec
     · curved reflections: skylight band + bent window stripes via reflect()
     · uGlow: magenta thinking tint pooled at the rim (lerped JS-side) ─ */
export const BLOB_FRAG = /* glsl */ `
uniform float uTime;
uniform float uRimT;      // JS-driven: t * 2PI / RIM_HUE_PERIOD_S
uniform float uSheenT;    // JS-driven: t * 2PI / SHEEN_PERIOD_S
uniform float uGlow;      // 0..1, lerped toward ORB_BY_PHASE glow
uniform vec3  uGlowColor; // color.magenta
uniform float uAlphaBase; // membrane center opacity (blob .66 / bubbles .10)
uniform float uAlphaRim;  // extra opacity at grazing angle
uniform float uOpacity;   // master fade
varying vec3 vN;
varying vec3 vWp;
varying vec3 vOn;
varying float vDisp;

// AURADIN orb pastel wheel: lavender → pink → gold → teal → cyan → lavender
vec3 orbTint(float h){
  vec3 c0 = vec3(0.780, 0.722, 0.980); // #C7B8FA
  vec3 c1 = vec3(0.949, 0.451, 0.800); // #F273CC
  vec3 c2 = vec3(0.980, 0.851, 0.580); // #FAD994
  vec3 c3 = vec3(0.451, 0.922, 0.820); // #73EBD1
  vec3 c4 = vec3(0.451, 0.800, 0.980); // #73CCFA
  float x = fract(h) * 5.0;
  vec3 col = mix(c0, c1, clamp(x, 0.0, 1.0));
  col = mix(col, c2, clamp(x - 1.0, 0.0, 1.0));
  col = mix(col, c3, clamp(x - 2.0, 0.0, 1.0));
  col = mix(col, c4, clamp(x - 3.0, 0.0, 1.0));
  col = mix(col, c0, clamp(x - 4.0, 0.0, 1.0));
  return col;
}

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWp);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.4);

  // film thickness — liquid marble swirl, anchored to the surface (vOn)
  float th = snoise(vOn * 1.9 + vec3(uTime * 0.05, uTime * 0.035, 0.0));
  th += 0.5 * snoise(vOn * 4.2 - vec3(0.0, uTime * 0.06, uTime * 0.04));
  float hue = th * 0.3 + (1.0 - ndv) * 0.3 + uRimT / 6.2831853;
  vec3 tint = orbTint(hue);

  // milky membrane base with pastel pools where the film thickens
  float patch = smoothstep(-0.15, 0.75, th);
  vec3 col = mix(vec3(0.975, 0.982, 1.0), tint, 0.22 + 0.30 * patch);

  // thin-film rim — interference brightest at grazing angle, second-order hue,
  // finished with a whiter soap-film glint at the very edge
  col = mix(col, orbTint(hue + 0.13), fres * 0.7);
  col += tint * fres * 0.25;
  col += vec3(1.0) * pow(fres, 3.0) * 0.25;

  // curved environment reflections
  vec3 R = reflect(-V, N);
  float sky = smoothstep(0.25, 0.9, R.y);
  float stripe = smoothstep(0.75, 0.98, 0.5 + 0.5 * sin((R.x + R.z * 0.6) * 6.0 + uTime * 0.3));
  col += vec3(0.75, 0.85, 1.0) * sky * 0.12;
  col += stripe * 0.10 * (0.3 + 0.7 * fres);

  // liquid sheen — one orbiting streak + one fixed under-light
  vec3 L1 = normalize(vec3(cos(uSheenT), 0.85, sin(uSheenT)));
  float sp1 = pow(max(dot(R, L1), 0.0), 42.0);
  float sp2 = pow(max(dot(R, normalize(vec3(-0.5, -0.4, 0.8))), 0.0), 90.0);
  col += vec3(1.0) * (sp1 * 0.9 + sp2 * 0.5);

  // gentle top-lit shading so the underside reads dusty (never flat) —
  // lumps (vDisp>0) catch a touch more light
  col *= 0.94 + 0.08 * clamp(dot(N, normalize(vec3(0.25, 0.9, 0.35))), 0.0, 1.0);
  col *= 1.0 + vDisp * 0.35;

  // magenta thinking glow — pooled at the rim, faint overall lift
  col = mix(col, uGlowColor, uGlow * fres * 0.55);
  col += uGlowColor * uGlow * 0.10;

  float alpha = uAlphaBase + uAlphaRim * fres + 0.14 * patch * uAlphaBase + sp1 * 0.4;
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * uOpacity);
}
`;

/* ─ Caustic ring — light focused through the membrane onto the "floor" plane
     below the blob. Chromatic triple-ring (cyan fringe / white core / pink
     fringe) with noise filaments + a soft center pool. Additive blending.
     Uniforms: uTime uGlow uGlowColor uOpacity. ─ */
export const CAUSTIC_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const CAUSTIC_FRAG = /* glsl */ `
uniform float uTime;
uniform float uGlow;
uniform vec3  uGlowColor;
uniform float uOpacity;
varying vec2 vUv;

void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float wob = 0.06 * snoise(vec3(cos(ang), sin(ang), uTime * 0.25));
  float r0 = 0.52 + 0.05 * sin(uTime * 0.7) + wob;
  float w = 0.085;
  float ring  = exp(-pow((r - r0) / w, 2.0));
  float ringC = exp(-pow((r - r0 + 0.05) / (w * 1.2), 2.0)); // cyan inner fringe
  float ringP = exp(-pow((r - r0 - 0.05) / (w * 1.2), 2.0)); // pink outer fringe
  // shimmering filaments along the ring
  ring *= 0.65 + 0.55 * (0.5 + 0.5 * snoise(vec3(p * 3.0, uTime * 0.5)));
  float pool = exp(-pow(r / 0.32, 2.0)) * 0.18; // soft center pool
  vec3 col = vec3(1.0) * ring
           + vec3(0.55, 0.85, 1.0) * ringC * 0.6
           + vec3(1.0, 0.62, 0.85) * ringP * 0.6
           + vec3(1.0) * pool;
  col = mix(col, uGlowColor, uGlow * 0.4);
  float alpha = (ring * 0.55 + ringC * 0.22 + ringP * 0.22 + pool) * uOpacity;
  gl_FragColor = vec4(col, alpha * smoothstep(1.0, 0.85, r));
}
`;

/* ─ JS animation constants — every period/amplitude the loop needs.
     OrbGLCanvas derives per-frame uniforms:
       uTime   = t
       uBoingT = t * TAU / BOING_PERIOD_S
       uRimT   = t * TAU / RIM_HUE_PERIOD_S
       uSheenT = t * TAU / SHEEN_PERIOD_S
       mesh.rotation.y = t * TAU / ROTATE_PERIOD_S (+ tilt sway)
       uGlow  += (target − uGlow) * GLOW_LERP  · per frame (paused: snap) ─ */
export type OrbBubbleSpec = {
  radius: number;       // sphere radius (blob = 1)
  orbitR: number;       // orbit radius around the blob
  orbitPeriodS: number; // full revolution
  orbitTiltZ: number;   // orbit plane flattening (z multiplier)
  bobPeriodS: number;   // vertical bob
  bobAmp: number;
  yOffset: number;
  phase: number;        // orbit phase offset (radians)
  seed: number;         // noise seed (uSeed)
  amp: number;          // uAmp
  freq: number;         // uFreq
};

export const ORB_ANIM = {
  TAU: Math.PI * 2,
  /* rotation */
  ROTATE_PERIOD_S: 26, // full Y revolution
  TILT_PERIOD_S: 41,   // slow X/Z sway
  TILT_AMP_RAD: 0.16,
  /* boing (jelly squash) */
  BOING_PERIOD_S: 3.6,
  BOING_AMP: 0.05,
  /* membrane */
  BLOB_AMP: 0.14,       // uAmp — lumpy soap-blob silhouette (soft, never spiky)
  BLOB_FREQ: 1.55,      // uFreq
  NOISE_FLOW: 0.3,      // uFlow — surface swirl drift
  RIM_HUE_PERIOD_S: 12, // iridescent rim rotation
  SHEEN_PERIOD_S: 7.5,  // orbiting liquid-sheen streak
  /* glow (searching) */
  GLOW_LERP: 0.055,          // per-frame uniform lerp toward ORB_BY_PHASE glow
  GLOW_PULSE_PERIOD_S: 2.8,  // breathing of the active glow
  GLOW_PULSE_AMP: 0.14,
  /* layers */
  CAUSTIC_OPACITY: 0.5,
  CAUSTIC_Y: -1.5,     // floor plane below the blob
  CAUSTIC_SIZE: 3.6,
  /* scene — proportioned so the blob fills the same 196/430 footprint as the
     SVG fallback artwork (phase morphs stay pixel-compatible) */
  CAMERA_FOV: 32,
  CAMERA_POS: [0, 0.85, 9.0] as const,
  BLOB_DETAIL: 5,   // IcosahedronGeometry subdivisions (10242 verts)
  BUBBLE_DETAIL: 3,
  /* two floating satellite bubbles */
  BUBBLES: [
    { radius: 0.16, orbitR: 1.5, orbitPeriodS: 19, orbitTiltZ: 0.6, bobPeriodS: 5.2, bobAmp: 0.16, yOffset: 0.55, phase: 0.0, seed: 7.3, amp: 0.05, freq: 2.6 },
    { radius: 0.1, orbitR: 1.34, orbitPeriodS: 27, orbitTiltZ: 0.55, bobPeriodS: 6.8, bobAmp: 0.2, yOffset: -0.38, phase: 3.6, seed: 2.9, amp: 0.06, freq: 3.1 },
  ] as readonly OrbBubbleSpec[],
  /* membrane alpha (uAlphaBase / uAlphaRim) */
  BLOB_ALPHA: { base: 0.78, rim: 0.22 },
  BUBBLE_ALPHA: { base: 0.1, rim: 0.85 },
} as const;
