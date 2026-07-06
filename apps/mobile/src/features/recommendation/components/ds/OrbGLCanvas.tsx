// AURADIN — GL orb canvas: the squishy iridescent blob (DS web original,
// "AppScreen copy copy" entry) rendered with three r128 on expo-gl.
// Simplex-noise displacement + fresnel iridescence; transparent clear color so
// the SVG halos + AuradinGround show through.
//
// Contract (unchanged):
// · glowTarget is a TARGET — the loop lerps uGlow toward it every frame
//   (ORB_ANIM.GLOW_LERP); paused mode snaps it.
// · paused=true (reduced motion / host pause) cancels the RAF loop and leaves
//   ONE stable rendered frame — never a blank canvas.
// · Any GL/three failure calls onFail() exactly once → PersistentOrb swaps to
//   the layered-SVG fallback artwork.
//
// The ripple/drag uniforms exist in the shader (web parity) but stay at rest —
// the persistent orb is pointerEvents="none".
import * as React from 'react';
import { Animated } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { GLView } from 'expo-gl';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { BLOB_FRAG, BLOB_VERT, NOISE, ORB_ANIM as A } from './orbShaders';

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
  uniforms: UniformMap;
  geometries: THREE.BufferGeometry[];
  materials: THREE.ShaderMaterial[];
  raf: number | null;
  t: number; // accumulated animation time (freezes while paused)
  last: number; // wall-clock of previous frame (s)
  glow: number; // current lerped uGlow
};

export function OrbGLCanvas({ glowTarget, paused, onFail, style }: OrbGLCanvasProps): React.JSX.Element {
  const frameCountRef = React.useRef(0);
  const liveRef = React.useRef(false);
  const liveOpacity = React.useRef(new Animated.Value(0)).current;
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

    // glow: uniform lerp toward target; paused snaps
    if (advance) {
      h.glow += (glowRef.current - h.glow) * A.GLOW_LERP;
    } else {
      h.glow = glowRef.current;
    }
    h.uniforms.uTime.value = t;
    h.uniforms.uGlow.value = h.glow;

    // jelly boing (volume-preserving squash) + slow float + spin — web parity
    const boing = Math.sin(t * A.BOING_A.freq) * A.BOING_A.amp + Math.sin(t * A.BOING_B.freq) * A.BOING_B.amp;
    h.blob.scale.set(1 - boing * 0.6, 1 + boing, 1 - boing * 0.6);
    h.blob.position.y = Math.sin(t * A.FLOAT_FREQ) * A.FLOAT_AMP;
    h.blob.rotation.y = t * A.ROTATE_SPEED;

    h.renderer.render(h.scene, h.camera);
    frameCountRef.current += 1;
    if (!liveRef.current && frameCountRef.current >= 2) {
      // 두 번째 프레임까지 화면 도달(동기 플러시) 확인 → 부드럽게 페이드인.
      // 앱 시작 직후 JS 스레드 혼잡으로 첫 표시가 수 초 늦을 수 있어, 팝 대신 페이드.
      liveRef.current = true;
      Animated.timing(liveOpacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }
    // 동기 GL 호출로 커맨드 큐 강제 플러시 — 이것 없이는 EXGL이 three의 프레임을
    // 화면 버퍼로 옮기지 못하는 레이스가 있다 (probe7 성공/실패 전수 대조로 특정).
    h.gl.getError();
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
      } catch (e) {
        console.warn('[OrbGL:step]', e);
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
        // three r128 reads gl.canvas.width inside WebGLState — expo-gl contexts
        // have no canvas, so attach the stub to the CONTEXT too (what expo-three
        // does); passing it to the renderer alone is not enough.
        const glWithCanvas = gl as unknown as { canvas?: HTMLCanvasElement };
        if (!glWithCanvas.canvas) {
          glWithCanvas.canvas = canvasStub;
        }
        // Force three's WebGL1 path. r128 detects WebGL2 via
        // `gl instanceof WebGL2RenderingContext` (three.module.js:14495) — the
        // WebGL1Renderer class does NOT override it — and expo-gl registers that
        // global, so three takes its WebGL2 path, which EXGL half-supports →
        // GL_INVALID_OPERATION → empty frames. Hiding the global for the
        // constructor call flips the check; the DS orb test rig (_orbtest.html)
        // forces WebGL1 for the same reason.
        const g = globalThis as { WebGL2RenderingContext?: unknown };
        const savedWebGL2 = g.WebGL2RenderingContext;
        delete g.WebGL2RenderingContext;
        let renderer: THREE.WebGLRenderer;
        try {
          renderer = new THREE.WebGL1Renderer({
            canvas: canvasStub,
            context: gl as unknown as WebGLRenderingContext,
            antialias: true,
            alpha: true,
          });
        } finally {
          if (savedWebGL2 !== undefined) {
            g.WebGL2RenderingContext = savedWebGL2;
          }
        }
        renderer.setPixelRatio(1);
        renderer.setSize(w, hpx, false);
        renderer.setClearColor(0x000000, 0); // transparent — halos/ground show through

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(A.CAMERA_FOV, w / hpx, 0.1, 40);
        camera.position.set(0, 0, A.CAMERA_Z);
        camera.lookAt(0, 0, 0);

        const uniforms: UniformMap = {
          uTime: { value: 0 },
          uGlow: { value: 0 },
          uPointer: { value: new THREE.Vector2(0, 0) },
          uStrength: { value: 0 },
          uDrag: { value: new THREE.Vector2(0, 0) },
          uRipples: { value: [0, 0, 0, 0].map(() => new THREE.Vector4(0, 0, 0, -10)) },
          uGrab: { value: new THREE.Vector3(0, 0, 1) },
          uDragL: { value: new THREE.Vector3(0, 0, 0) },
        };
        const blobGeo = new THREE.IcosahedronGeometry(A.BLOB_RADIUS, A.BLOB_DETAIL);
        const blobMat = new THREE.ShaderMaterial({
          vertexShader: NOISE + BLOB_VERT,
          fragmentShader: NOISE + BLOB_FRAG,
          uniforms,
          transparent: true,
        });
        const blob = new THREE.Mesh(blobGeo, blobMat);
        scene.add(blob);

        handleRef.current = {
          gl,
          renderer,
          scene,
          camera,
          blob,
          uniforms,
          geometries: [blobGeo],
          materials: [blobMat],
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
      } catch (e) {
        console.warn('[OrbGL:create]', e, (e as Error)?.stack?.split('\n').slice(0, 6).join(' | '));
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

  return (
    <Animated.View style={[style, { opacity: liveOpacity }]}>
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
    </Animated.View>
  );
}
