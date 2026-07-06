// AURADIN — GL orb canvas: the soap-bubble membrane rendered with three r128
// on expo-gl. Layers INSIDE the GL scene: caustic ring (floor plane) → main
// blob → two floating satellite bubbles. Transparent clear color — the SVG
// halos + AuradinGround show through.
//
// Contract (kept from the SVG orb):
// · glowTarget is a TARGET — the loop lerps uGlow toward it every frame
//   (ORB_ANIM.GLOW_LERP); paused mode snaps it.
// · paused=true (reduced motion / host pause) cancels the RAF loop and leaves
//   ONE stable rendered frame — never a blank canvas.
// · Any GL/three failure calls onFail() exactly once → PersistentOrb swaps to
//   the layered-SVG fallback artwork.
//
// No DOM, no window, no CDN: the only web-shaped object is the inert canvas
// stub three's constructor wants for size bookkeeping.
import * as React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { GLView } from 'expo-gl';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { color } from '../../theme/auradinTokens';
import {
  BLOB_FRAG,
  BLOB_VERT,
  CAUSTIC_FRAG,
  CAUSTIC_VERT,
  NOISE,
  ORB_ANIM as A,
} from './orbShaders';

export type OrbGLCanvasProps = {
  /** ORB_BY_PHASE glow for the current phase — lerped, never snapped (unless paused) */
  glowTarget: number;
  /** reduced motion or host pause — RAF loop stops on true */
  paused: boolean;
  /** GL context/three failure → mount the SVG fallback instead */
  onFail: () => void;
  style?: StyleProp<ViewStyle>;
};

type UniformMap = Record<string, THREE.IUniform>;

type Handle = {
  gl: ExpoWebGLRenderingContext;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  blob: THREE.Mesh;
  bubbles: THREE.Mesh[];
  membraneUniforms: UniformMap[]; // blob + bubbles (share the shader pair)
  causticUniforms: UniformMap;
  geometries: THREE.BufferGeometry[];
  materials: THREE.ShaderMaterial[];
  raf: number | null;
  t: number; // accumulated animation time (freezes while paused)
  last: number; // wall-clock of previous frame (s)
  glow: number; // current lerped uGlow
};

function membraneUniforms(seed: number, amp: number, freq: number, alphaBase: number, alphaRim: number): UniformMap {
  return {
    uTime: { value: 0 },
    uFlow: { value: A.NOISE_FLOW },
    uAmp: { value: amp },
    uFreq: { value: freq },
    uSeed: { value: seed },
    uBoingT: { value: 0 },
    uBoingAmp: { value: A.BOING_AMP },
    uRimT: { value: 0 },
    uSheenT: { value: 0 },
    uGlow: { value: 0 },
    uGlowColor: { value: new THREE.Color(color.magenta) },
    uAlphaBase: { value: alphaBase },
    uAlphaRim: { value: alphaRim },
    uOpacity: { value: 1 },
  };
}

export function OrbGLCanvas({ glowTarget, paused, onFail, style }: OrbGLCanvasProps): React.JSX.Element {
  const handleRef = React.useRef<Handle | null>(null);
  const glowRef = React.useRef(glowTarget);
  const pausedRef = React.useRef(paused);
  const failedRef = React.useRef(false);

  const fail = React.useCallback((): void => {
    if (failedRef.current) return;
    failedRef.current = true;
    onFail();
  }, [onFail]);

  /** One simulation + render step. dt is clamped so backgrounding never jumps. */
  const step = React.useCallback((h: Handle, advance: boolean): void => {
    const now = Date.now() / 1000;
    if (advance) {
      h.t += Math.min(0.1, Math.max(0, now - h.last));
    }
    h.last = now;
    const t = h.t;
    const boingT = (t * A.TAU) / A.BOING_PERIOD_S;
    const rimT = (t * A.TAU) / A.RIM_HUE_PERIOD_S;
    const sheenT = (t * A.TAU) / A.SHEEN_PERIOD_S;

    // glow: uniform lerp toward target (+ soft pulse while lit); paused snaps
    if (advance) {
      h.glow += (glowRef.current - h.glow) * A.GLOW_LERP;
    } else {
      h.glow = glowRef.current;
    }
    const pulse = 1 - A.GLOW_PULSE_AMP * (0.5 + 0.5 * Math.sin((t * A.TAU) / A.GLOW_PULSE_PERIOD_S));
    const glow = h.glow * pulse;

    h.membraneUniforms.forEach((u, i) => {
      u.uTime.value = t;
      u.uBoingT.value = boingT;
      u.uRimT.value = rimT;
      u.uSheenT.value = sheenT;
      u.uGlow.value = i === 0 ? glow : glow * 0.6; // satellites glow softer
    });
    h.causticUniforms.uTime.value = t;
    h.causticUniforms.uGlow.value = glow;

    h.blob.rotation.y = (t * A.TAU) / A.ROTATE_PERIOD_S;
    h.blob.rotation.x = Math.sin((t * A.TAU) / A.TILT_PERIOD_S) * A.TILT_AMP_RAD;
    h.blob.rotation.z = Math.cos(((t * A.TAU) / A.TILT_PERIOD_S) * 0.8) * A.TILT_AMP_RAD * 0.6;

    A.BUBBLES.forEach((b, i) => {
      const m = h.bubbles[i];
      if (!m) return;
      const oa = (t * A.TAU) / b.orbitPeriodS + b.phase;
      m.position.set(
        Math.cos(oa) * b.orbitR,
        b.yOffset + Math.sin((t * A.TAU) / b.bobPeriodS + b.phase) * b.bobAmp,
        Math.sin(oa) * b.orbitR * b.orbitTiltZ
      );
      m.rotation.y = -t * 0.5;
    });

    h.renderer.render(h.scene, h.camera);
    h.gl.endFrameEXP();
  }, []);

  const stopLoop = React.useCallback((): void => {
    const h = handleRef.current;
    if (h && h.raf !== null) {
      cancelAnimationFrame(h.raf);
      h.raf = null;
    }
  }, []);

  const startLoop = React.useCallback((): void => {
    const h = handleRef.current;
    if (!h || h.raf !== null || failedRef.current) return;
    h.last = Date.now() / 1000;
    const frame = (): void => {
      const hh = handleRef.current;
      if (!hh || pausedRef.current || failedRef.current) return;
      try {
        step(hh, true);
        hh.raf = requestAnimationFrame(frame);
      } catch {
        stopLoop();
        fail();
      }
    };
    h.raf = requestAnimationFrame(frame);
  }, [fail, step, stopLoop]);

  const onContextCreate = React.useCallback(
    (gl: ExpoWebGLRenderingContext): void => {
      try {
        const w = gl.drawingBufferWidth;
        const hpx = gl.drawingBufferHeight;
        // three wants a canvas-shaped object for size bookkeeping only
        const canvasStub = {
          width: w,
          height: hpx,
          clientWidth: w,
          clientHeight: hpx,
          style: {},
          addEventListener: (): void => {},
          removeEventListener: (): void => {},
          getContext: (): ExpoWebGLRenderingContext => gl,
        } as unknown as HTMLCanvasElement;
        const renderer = new THREE.WebGLRenderer({
          canvas: canvasStub,
          context: gl as unknown as WebGLRenderingContext,
          antialias: true,
          alpha: true,
        });
        renderer.setPixelRatio(1);
        renderer.setSize(w, hpx, false);
        renderer.setClearColor(0x000000, 0); // transparent — halos/ground show through

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(A.CAMERA_FOV, w / hpx, 0.1, 40);
        camera.position.set(A.CAMERA_POS[0], A.CAMERA_POS[1], A.CAMERA_POS[2]);
        camera.lookAt(0, 0, 0);

        const geometries: THREE.BufferGeometry[] = [];
        const materials: THREE.ShaderMaterial[] = [];
        const membranes: UniformMap[] = [];

        // caustic ring — floor plane under the blob, additive
        const causticUniforms: UniformMap = {
          uTime: { value: 0 },
          uGlow: { value: 0 },
          uGlowColor: { value: new THREE.Color(color.magenta) },
          uOpacity: { value: A.CAUSTIC_OPACITY },
        };
        const causticGeo = new THREE.PlaneGeometry(A.CAUSTIC_SIZE, A.CAUSTIC_SIZE);
        const causticMat = new THREE.ShaderMaterial({
          vertexShader: CAUSTIC_VERT,
          fragmentShader: NOISE + CAUSTIC_FRAG,
          uniforms: causticUniforms,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const caustic = new THREE.Mesh(causticGeo, causticMat);
        caustic.rotation.x = -Math.PI / 2;
        caustic.position.y = A.CAUSTIC_Y;
        caustic.renderOrder = 0;
        scene.add(caustic);
        geometries.push(causticGeo);
        materials.push(causticMat);

        // main blob membrane
        const blobUniforms = membraneUniforms(0, A.BLOB_AMP, A.BLOB_FREQ, A.BLOB_ALPHA.base, A.BLOB_ALPHA.rim);
        const blobGeo = new THREE.IcosahedronGeometry(1, A.BLOB_DETAIL);
        const blobMat = new THREE.ShaderMaterial({
          vertexShader: NOISE + BLOB_VERT,
          fragmentShader: NOISE + BLOB_FRAG,
          uniforms: blobUniforms,
          transparent: true,
          depthWrite: true, // mostly-opaque membrane occludes passing bubbles
        });
        const blob = new THREE.Mesh(blobGeo, blobMat);
        blob.renderOrder = 1;
        scene.add(blob);
        geometries.push(blobGeo);
        materials.push(blobMat);
        membranes.push(blobUniforms);

        // two floating satellite bubbles — same membrane shader, thinner film
        const bubbles: THREE.Mesh[] = A.BUBBLES.map((b, i) => {
          const u = membraneUniforms(b.seed, b.amp, b.freq, A.BUBBLE_ALPHA.base, A.BUBBLE_ALPHA.rim);
          u.uBoingAmp.value = A.BOING_AMP * 0.4;
          const geo = new THREE.IcosahedronGeometry(b.radius, A.BUBBLE_DETAIL);
          const mat = new THREE.ShaderMaterial({
            vertexShader: NOISE + BLOB_VERT,
            fragmentShader: NOISE + BLOB_FRAG,
            uniforms: u,
            transparent: true,
            depthWrite: false,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.renderOrder = 2 + i;
          scene.add(mesh);
          geometries.push(geo);
          materials.push(mat);
          membranes.push(u);
          return mesh;
        });

        handleRef.current = {
          gl,
          renderer,
          scene,
          camera,
          blob,
          bubbles,
          membraneUniforms: membranes,
          causticUniforms,
          geometries,
          materials,
          raf: null,
          t: 0,
          last: Date.now() / 1000,
          glow: glowRef.current,
        };

        if (pausedRef.current) {
          step(handleRef.current, false); // one stable frame, no loop
        } else {
          startLoop();
        }
      } catch {
        fail();
      }
    },
    [fail, startLoop, step]
  );

  // prop → ref sync + pause/resume; paused renders one snapped frame
  React.useEffect(() => {
    glowRef.current = glowTarget;
    const h = handleRef.current;
    if (h && pausedRef.current && !failedRef.current) {
      try {
        step(h, false);
      } catch {
        fail();
      }
    }
  }, [fail, glowTarget, step]);

  React.useEffect(() => {
    pausedRef.current = paused;
    const h = handleRef.current;
    if (!h || failedRef.current) return;
    if (paused) {
      stopLoop();
      try {
        step(h, false);
      } catch {
        fail();
      }
    } else {
      startLoop();
    }
  }, [fail, paused, startLoop, step, stopLoop]);

  // unmount cleanup (PersistentOrb mounts once per app — this runs at app teardown)
  React.useEffect(() => {
    return () => {
      stopLoop();
      const h = handleRef.current;
      if (!h) return;
      h.geometries.forEach((g) => g.dispose());
      h.materials.forEach((m) => m.dispose());
      h.renderer.dispose();
      handleRef.current = null;
    };
  }, [stopLoop]);

  return <GLView style={style} msaaSamples={4} onContextCreate={onContextCreate} />;
}
