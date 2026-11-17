// The Via section's 3D view (step M5.1): three.js, in the chunk of Via3DView.tsx, which the page loads with import()
// only when "3D view" is opened. The scene is lib/emsim/scene3d.ts's prisms, each a polygon with holes extruded
// (ExtrudeGeometry); copper opaque, the laminate and the mask translucent (no depth writes, sorted back to front by
// their centres), the backdrilled section a ghost. OrbitControls (an ES module of three's add-ons, so `await import`)
// orbit, zoom and pan by mouse and touch. Frames are drawn on demand from one rAF loop: when the camera moves (damping
// included), a scene, the colours, the cut or the fields change. A new scene is built at most every BUILD_FRAMES
// frames, so a drag in the 2D views does not rebuild every frame. The cut-away is a clipping plane through the
// barrels along the side view's line, removing the half towards the default camera. The field maps are textures on a
// vertical plane on that line (side map, on the cut) and a horizontal one at the scene's topZ (top map, cut with the
// board), both cropped to the square of board drawn.
// M7.2b: the Waves section's 3D view uses the same renderer with its copper see-through (`copper` < 1) and the run's
// snapshot slices as wave planes (`setWaves`): a DataTexture each over the caller's pixel buffer (wavesPlayer.ts
// framePixels), re-uploaded in place (texSubImage2D) and drawn at once by `drawWaves(frame)`, which the 2D player's clock
// calls. The idle loop rests while the view is off screen.

import {
  CanvasTexture, Color, CylinderGeometry, DataTexture, DirectionalLight, DoubleSide, ExtrudeGeometry, Group, HemisphereLight, LinearFilter,
  Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Path, PerspectiveCamera, Plane, PlaneGeometry, Raycaster, RGBAFormat, Scene, Shape,
  SRGBColorSpace, UnsignedByteType, Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js' with { 'resolution-mode': 'import' };

import type { Prism, PrismKind, Scene3D } from '../../lib/emsim/scene3d';

export interface Via3DColors { bg: string; copper: string; core: string; prepreg: string; mask: string; ghost: string }
/** A field map on a plane: the image (row 0 at z1) over x0 … x1 (along the plane) and z0 … z1 (up, or board y). */
export interface FieldPlane { image: HTMLCanvasElement; x0: number; x1: number; z0: number; z1: number }

/** A wave plane (M7.2b): its corner `o` (mm), the unit vectors along its width and height, its size (mm), and the
 *  texture's texels `tw` x `th` in `px` (RGBA words, row 0 at the top as framePixels writes them), which the caller
 *  rewrites before `drawWaves`. */
export interface WavePlane { key: string; o: [number, number, number]; U: [number, number, number]; V: [number, number, number]; w: number; h: number; tw: number; th: number; px: Uint32Array }
/** `copper`: the copper's opacity (1: opaque, as the Via section); `fit`: the first view's distance as a share of
 *  the one that holds the scene's bounding sphere (0.92 as the Via section). */
export interface Via3DOptions { copper?: number; fit?: number }

const BUILD_FRAMES = 3;
const FOV = 35;

type Ctor = typeof OrbitControls;

export async function createVia3D(host: HTMLElement, opts: Via3DOptions = {}): Promise<Via3D> {
  const { OrbitControls: OC } = await import('three/examples/jsm/controls/OrbitControls.js');
  return new Via3D(host, OC, opts);
}

/** The scene's colours from the page's tokens on `el`. */
export function colorsOf(el: HTMLElement): Via3DColors {
  const st = getComputedStyle(el);
  const g = (k: string, d: string) => st.getPropertyValue(k).trim() || d;
  return { bg: g('--air', '#e8eff4'), copper: g('--copper', '#c8773a'), core: g('--core', '#d6c688'), prepreg: g('--prepreg', '#e9dfb2'), mask: g('--mask', '#2f7d4f'), ghost: g('--ink-3', '#6c6861') };
}

/** Follows the theme (the page root's data-theme, the system's scheme) with the view's colours; returns the undo. */
export function followTheme(el: HTMLElement, view: Via3D): () => void {
  const again = () => view.setColors(colorsOf(el));
  const root = el.closest('[data-whys]') ?? document.documentElement;
  const mo = new MutationObserver(again);
  mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', again);
  return () => { mo.disconnect(); mq.removeEventListener('change', again); };
}

function prismGeometry(p: Prism, cx: number, cy: number, cz: number): BufferGeometry {
  const pts = (a: number[]) => { const out: Vector2[] = []; for (let k = 0; k < a.length; k += 2) out.push(new Vector2(a[k] - cx, a[k + 1] - cy)); return out; };
  const shape = new Shape(pts(p.outer));
  for (const h of p.holes) shape.holes.push(new Path(pts(h)));
  const g = new ExtrudeGeometry(shape, { depth: p.z1 - p.z0, bevelEnabled: false, curveSegments: 1, steps: 1 });
  g.translate(0, 0, p.z0 - cz);
  return g;
}

function disposeTree(root: Object3D) {
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const x of mats as Material[]) { const map = (x as MeshBasicMaterial).map; if (map) map.dispose(); x.dispose(); }
  });
}

export class Via3D {
  readonly renderer: WebGLRenderer;
  /** For the harness: meshes per prism kind, frames drawn, the last frames' times (ms), scenes built. */
  readonly stats = {
    meshes: {} as Record<string, number>, renders: 0, builds: 0, frameMs: [] as number[], fieldPlanes: 0, disposed: false,
    // M7.2b: wave planes, the frame drawn last, draws, wave textures made and disposed, the renderer's memory when
    // disposed (its geometries and textures left: three.js keeps one of its own, the 16 × 16 DFG table of the
    // standard materials, which goes with the context)
    wavePlanes: 0, waveFrame: -1, waveDraws: 0, texMade: 0, texFreed: 0, memory: null as { geometries: number; textures: number } | null,
  };
  onFrame: (() => void) | null = null;

  private host: HTMLElement;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.01, 1000);
  private controls: OrbitControls;
  private model = new Group();
  private fields = new Group();
  private cutPlane = new Plane(new Vector3(1, 0, 0), 0);
  private cut = false;
  private laminate = true;
  private colors: Via3DColors | null = null;
  private pending: Scene3D | null = null;
  private current: Scene3D | null = null;
  private sinceBuild = BUILD_FRAMES;
  private dirty = true;
  private raf = 0;
  private ro: ResizeObserver;
  private mats: Partial<Record<PrismKind | 'ghost' | 'core' | 'prepreg', Material>> = {};
  private homed = false;
  private fieldIn: { side: FieldPlane | null; top: FieldPlane | null } = { side: null, top: null };
  private copperOpacity: number;
  private fit: number;
  private cutAt = 0; // the cut's place along its normal (M7.2b: through the side plane)
  private waveCutKeep: string | null = null; // the wave plane the cut leaves whole (the one on it)
  private waves = new Group();
  private waveTex: DataTexture[] = [];
  private seen = true;
  private io: IntersectionObserver | null = null;
  private tick: () => void;

  constructor(host: HTMLElement, OC: Ctor, opts: Via3DOptions = {}) {
    this.host = host;
    this.copperOpacity = opts.copper ?? 1;
    this.fit = opts.fit ?? 0.92;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.localClippingEnabled = true;
    const c = this.renderer.domElement;
    c.style.display = 'block';
    c.style.width = '100%';
    c.style.height = '100%';
    c.setAttribute('data-via3d-canvas', '');
    host.appendChild(c);
    this.camera.up.set(0, 0, 1);
    this.scene.add(this.camera, this.model, this.fields, this.waves);
    this.scene.add(new HemisphereLight('#ffffff', '#5a5040', 1.6));
    const head = new DirectionalLight('#ffffff', 1.6);
    head.position.set(0.3, 0.6, 1);
    this.camera.add(head);
    this.controls = new OC(this.camera, c);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.15;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.tick = () => {
      // off screen: rest until it shows again, once nothing is left to build or draw (so the first frame, which
      // reports the time to open, is drawn even off screen)
      if (!this.seen && !this.dirty && !this.pending) { this.raf = 0; return; }
      this.raf = requestAnimationFrame(this.tick);
      this.sinceBuild++;
      if (this.pending && this.colors && this.sinceBuild >= BUILD_FRAMES) this.build();
      const moved = this.controls.update();
      if (moved || this.dirty) this.render();
    };
    this.raf = requestAnimationFrame(this.tick);
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((es) => {
        this.seen = es[es.length - 1].isIntersecting;
        if (this.seen && !this.raf && !this.stats.disposed) this.raf = requestAnimationFrame(this.tick);
      });
      this.io.observe(host);
    }
  }

  /** Whether the idle loop runs (it rests off screen). */
  get looping(): boolean { return this.raf !== 0; }

  private resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private render() {
    const t = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
    this.stats.renders++;
    this.stats.frameMs.push(performance.now() - t);
    if (this.stats.frameMs.length > 600) this.stats.frameMs.shift();
    if (this.onFrame && this.current) { const f = this.onFrame; this.onFrame = null; f(); }
  }

  setScene(sc: Scene3D) {
    this.pending = sc;
    if (!this.current && this.colors) this.build(); // the first at once
  }

  setColors(c: Via3DColors) {
    const same = this.colors && Object.keys(c).every((k) => this.colors[k as keyof Via3DColors] === c[k as keyof Via3DColors]);
    if (same) return;
    this.colors = c;
    this.scene.background = new Color(c.bg);
    for (const m of Object.values(this.mats)) m.dispose();
    this.mats = {};
    if (this.current && !this.pending) this.pending = this.current;
    if (this.pending) this.build();
    this.dirty = true;
  }

  private material(kind: PrismKind | 'ghost' | 'core' | 'prepreg'): Material {
    const have = this.mats[kind];
    if (have) return have;
    const c = this.colors;
    let m: Material;
    if (kind === 'core' || kind === 'prepreg' || kind === 'mask') {
      // Pulled towards the camera: a laminate face lies on a plane's copper face, and would fight it for depth.
      m = new MeshStandardMaterial({ color: kind === 'mask' ? c.mask : c[kind], roughness: 0.9, metalness: 0, transparent: true, opacity: kind === 'mask' ? 0.42 : 0.26, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    } else if (kind === 'ghost') {
      m = new MeshBasicMaterial({ color: c.ghost, transparent: true, opacity: 0.18, depthWrite: false });
    } else if (this.copperOpacity < 1) {
      // see-through, so the wave planes show inside it (drawn after the opaque planes, no depth writes)
      m = new MeshStandardMaterial({ color: c.copper, roughness: 0.42, metalness: 0.35, side: DoubleSide, transparent: true, opacity: this.copperOpacity, depthWrite: false });
    } else {
      m = new MeshStandardMaterial({ color: c.copper, roughness: 0.42, metalness: 0.35, side: DoubleSide });
    }
    m.clippingPlanes = this.cut ? [this.cutPlane] : [];
    this.mats[kind] = m;
    return m;
  }

  private build() {
    const sc = this.pending;
    this.pending = null;
    this.sinceBuild = 0;
    if (!sc) return;
    for (const o of [...this.model.children]) { this.model.remove(o); const m = o as Mesh; m.geometry?.dispose(); }
    this.current = sc;
    this.stats.builds++;
    const counts: Record<string, number> = {};
    for (const p of sc.prisms) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k < p.outer.length; k += 2) { x0 = Math.min(x0, p.outer[k]); x1 = Math.max(x1, p.outer[k]); y0 = Math.min(y0, p.outer[k + 1]); y1 = Math.max(y1, p.outer[k + 1]); }
      const cx = 0.5 * (x0 + x1), cy = 0.5 * (y0 + y1), cz = 0.5 * (p.z0 + p.z1);
      const glass = p.kind === 'dielectric' || p.kind === 'mask';
      const mesh = new Mesh(prismGeometry(p, cx, cy, cz), this.material(p.kind === 'dielectric' ? (p.role === 'core' ? 'core' : 'prepreg') : p.kind));
      mesh.position.set(cx, cy, cz);
      mesh.userData.kind = p.kind;
      mesh.visible = !glass || this.laminate;
      if (glass) mesh.renderOrder = 1;
      this.model.add(mesh);
      counts[p.kind] = (counts[p.kind] ?? 0) + 1;
    }
    for (const d of sc.drilled) {
      const g = new CylinderGeometry(d.r, d.r, d.z1 - d.z0, 48, 1, true);
      g.rotateX(Math.PI / 2);
      const mesh = new Mesh(g, this.material('ghost'));
      mesh.position.set(d.x, d.y, 0.5 * (d.z0 + d.z1));
      mesh.userData.kind = 'drilled';
      mesh.renderOrder = 2;
      this.model.add(mesh);
      counts.drilled = (counts.drilled ?? 0) + 1;
    }
    this.stats.meshes = counts;
    this.cutPlane.normal.set(-sc.u.y, sc.u.x, 0);
    this.cutPlane.constant = -this.cutAt;
    if (!this.homed) { this.homed = true; this.reset(); }
    this.placeFields();
    this.dirty = true;
  }

  /** The camera as it starts: from the side the 2D side view looks from, raised, the whole square in view. */
  reset() {
    const sc = this.current;
    if (!sc) return;
    const { u, box, thick } = sc;
    const H = 0.5 * Math.max(box.x1 - box.x0, box.y1 - box.y0);
    const target = new Vector3(sc.centre.x, sc.centre.y, thick / 2);
    const dir = new Vector3(0.78 * u.y + 0.42 * u.x, -0.78 * u.x + 0.42 * u.y, 0.62).normalize();
    const rho = Math.sqrt(2 * H * H + thick * thick / 4);
    const vf = (FOV * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * this.camera.aspect);
    const dist = (rho / Math.sin(Math.min(vf, hf) / 2)) * this.fit;
    // Drop what damping still has to apply of the last gesture, or it moves the camera after the reset.
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.near = dist / 200;
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(target);
    this.controls.minDistance = dist / 30;
    this.controls.maxDistance = dist * 6;
    this.controls.update();
    this.dirty = true;
  }

  setCut(on: boolean) {
    if (this.cut === on) return;
    this.cut = on;
    for (const m of Object.values(this.mats)) { m.clippingPlanes = on ? [this.cutPlane] : []; m.needsUpdate = true; }
    this.placeFields();
    this.cutWaves();
  }

  /** M7.2b: the cut through n·p = c (n the cut's normal, across the side view's line) instead of through the origin,
   *  and the wave plane it leaves whole (the one lying on it; the others lose their near half with the structure). */
  setCutAt(c: number, keep: string | null): void {
    this.cutAt = c;
    this.cutPlane.constant = -c;
    this.waveCutKeep = keep;
    this.cutWaves();
  }

  private cutWaves(): void {
    for (const o of this.waves.children) {
      const m = (o as Mesh).material as Material;
      m.clippingPlanes = this.cut && o.userData.key !== this.waveCutKeep ? [this.cutPlane] : [];
      m.needsUpdate = true;
    }
    this.dirty = true;
  }

  setLaminate(on: boolean) {
    this.laminate = on;
    for (const o of this.model.children) if (o.userData.kind === 'dielectric' || o.userData.kind === 'mask') o.visible = on;
    this.dirty = true;
  }

  setFields(side: FieldPlane | null, top: FieldPlane | null) {
    if (this.fieldIn.side === side && this.fieldIn.top === top) return;
    this.fieldIn = { side, top };
    this.placeFields();
  }

  private placeFields() {
    disposeTree(this.fields);
    this.fields.clear();
    const sc = this.current;
    let n = 0;
    if (sc) {
      // A map is cropped to the square of board drawn (a's extent along the plane, b's up it): the 2D views' maps
      // cover what they show, which can reach far beyond.
      const plane = (f: FieldPlane, which: string, a0: number, a1: number, b0: number, b1: number) => {
        const tex = new CanvasTexture(f.image);
        tex.colorSpace = SRGBColorSpace;
        tex.minFilter = LinearFilter;
        tex.generateMipmaps = false;
        const W = f.x1 - f.x0, Hh = f.z1 - f.z0;
        tex.offset.set((a0 - f.x0) / W, (b0 - f.z0) / Hh);
        tex.repeat.set((a1 - a0) / W, (b1 - b0) / Hh);
        const m = new Mesh(new PlaneGeometry(a1 - a0, b1 - b0), new MeshBasicMaterial({ map: tex, side: DoubleSide, transparent: true, opacity: 0.94, depthWrite: false }));
        m.userData.kind = which;
        m.renderOrder = 0;
        this.fields.add(m);
        n++;
        return m;
      };
      const { side, top } = this.fieldIn;
      const { u, box } = sc;
      if (side) {
        // The section line's stretch inside the square (it passes through the origin).
        let lo = -Infinity, hi = Infinity;
        for (const [d, a, b] of [[u.x, box.x0, box.x1], [u.y, box.y0, box.y1]]) {
          if (Math.abs(d) < 1e-12) continue;
          const t0 = a / d, t1 = b / d;
          lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
        }
        const a0 = Math.max(side.x0, lo), a1 = Math.min(side.x1, hi);
        if (a1 > a0) {
          const m = plane(side, 'field-side', a0, a1, side.z0, side.z1);
          const sm = 0.5 * (a0 + a1);
          m.matrixAutoUpdate = false;
          m.matrix.copy(new Matrix4().makeBasis(new Vector3(u.x, u.y, 0), new Vector3(0, 0, 1), new Vector3(u.y, -u.x, 0)).setPosition(sm * u.x, sm * u.y, 0.5 * (side.z0 + side.z1)));
        }
      }
      if (top) {
        const a0 = Math.max(top.x0, box.x0), a1 = Math.min(top.x1, box.x1), b0 = Math.max(top.z0, box.y0), b1 = Math.min(top.z1, box.y1);
        if (a1 > a0 && b1 > b0) {
          const m = plane(top, 'field-top', a0, a1, b0, b1);
          m.position.set(0.5 * (a0 + a1), 0.5 * (b0 + b1), sc.topZ);
          if (this.cut) (m.material as Material).clippingPlanes = [this.cutPlane]; // the side map stands on the cut
        }
      }
    }
    this.stats.fieldPlanes = n;
    this.dirty = true;
  }

  /** The harness's scripted orbit: turn the camera about the target's vertical axis. */
  orbitBy(rad: number) {
    const t = this.controls.target;
    const p = this.camera.position.clone().sub(t).applyAxisAngle(new Vector3(0, 0, 1), rad);
    this.camera.position.copy(t).add(p);
    this.camera.lookAt(t);
    this.dirty = true;
  }

  cameraState() { return { p: this.camera.position.toArray(), t: this.controls.target.toArray() }; }

  /** Keys (M7.2b): turn about the target (azimuth, elevation in rad, the elevation kept off the poles) and zoom. */
  turn(dAz: number, dEl: number): void {
    const t = this.controls.target;
    const p = this.camera.position.clone().sub(t);
    const r = p.length(), az = Math.atan2(p.y, p.x) + dAz;
    const el = Math.max(-1.45, Math.min(1.45, Math.asin(Math.max(-1, Math.min(1, p.z / r))) + dEl));
    this.camera.position.set(t.x + r * Math.cos(el) * Math.cos(az), t.y + r * Math.cos(el) * Math.sin(az), t.z + r * Math.sin(el));
    this.camera.lookAt(t);
    this.dirty = true;
  }
  zoomBy(f: number): void {
    const t = this.controls.target;
    const p = this.camera.position.clone().sub(t);
    const r = Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, p.length() * f));
    this.camera.position.copy(t).addScaledVector(p.normalize(), r);
    this.dirty = true;
  }

  // ---------------------------------------------------------------- wave planes (M7.2b)

  /** The wave planes (replacing any before): one opaque, unlit, double-sided mesh each with a DataTexture over its
   *  pixel buffer (no copy), shown until `showWave` hides it. */
  setWaves(planes: readonly WavePlane[]): void {
    disposeTree(this.waves);
    this.waves.clear();
    this.waveTex = [];
    for (const p of planes) {
      const tex = new DataTexture(new Uint8Array(p.px.buffer, p.px.byteOffset, p.px.byteLength), p.tw, p.th, RGBAFormat, UnsignedByteType);
      tex.colorSpace = SRGBColorSpace;
      tex.minFilter = LinearFilter; tex.magFilter = LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      tex.addEventListener('dispose', () => { this.stats.texFreed++; });
      this.stats.texMade++;
      const g = new PlaneGeometry(p.w, p.h);
      // framePixels writes row 0 at the top; a DataTexture's row 0 is at v = 0: turn the plane's v round
      const uv = g.getAttribute('uv');
      for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - uv.getY(k));
      const m = new Mesh(g, new MeshBasicMaterial({ map: tex, side: DoubleSide, toneMapped: false }));
      const [U, V] = [new Vector3(...p.U), new Vector3(...p.V)];
      const N = new Vector3().crossVectors(U, V);
      const c = new Vector3(...p.o).addScaledVector(U, p.w / 2).addScaledVector(V, p.h / 2);
      m.matrixAutoUpdate = false;
      m.matrix.copy(new Matrix4().makeBasis(U, V, N).setPosition(c));
      m.userData.kind = 'wave';
      m.userData.key = p.key;
      this.waves.add(m);
      this.waveTex.push(tex);
    }
    this.stats.wavePlanes = planes.length;
    this.cutWaves();
  }

  showWave(key: string, on: boolean): void {
    for (const o of this.waves.children) if (o.userData.key === key) o.visible = on;
    this.dirty = true;
  }

  /** The planes' buffers hold frame `frame`: upload them (in place) and draw now, in the caller's animation frame. */
  drawWaves(frame: number): void {
    for (let k = 0; k < this.waveTex.length; k++) if (this.waves.children[k].visible) this.waveTex[k].needsUpdate = true;
    this.stats.waveFrame = frame;
    this.stats.waveDraws++;
    if (this.current && !this.stats.disposed) this.render();
  }

  /** The screen point (client px) of a point of the model (mm). */
  project(p: [number, number, number]): [number, number] {
    const v = new Vector3(...p).project(this.camera), r = this.renderer.domElement.getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  }

  /** The visible wave plane under a screen point: its key and the point's place on it (fractions of its width from
   *  the corner `o`, and of its height from the top edge). */
  probe(x: number, y: number): { key: string; s: number; t: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const rc = new Raycaster();
    rc.setFromCamera(new Vector2(((x - r.left) / r.width) * 2 - 1, 1 - ((y - r.top) / r.height) * 2), this.camera);
    this.waves.updateMatrixWorld(true);
    // the first hit the cut leaves (the raycaster does not clip)
    const hit = rc.intersectObjects(this.waves.children.filter((o) => o.visible), false)
      .find((h) => !(((h.object as Mesh).material as Material).clippingPlanes ?? []).some((pl) => pl.distanceToPoint(h.point) < 0));
    if (!hit || !hit.uv) return null;
    return { key: hit.object.userData.key, s: hit.uv.x, t: hit.uv.y };
  }

  /** The view as a PNG at `scale` × the canvas's CSS size. */
  async png(scale: number): Promise<Blob> {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    const pr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(w, h, false);
    this.renderer.render(this.scene, this.camera);
    const blob = await new Promise<Blob | null>((res) => this.renderer.domElement.toBlob(res, 'image/png'));
    this.renderer.setPixelRatio(pr);
    this.resize();
    this.render();
    if (!blob) throw new Error('The browser made no PNG.');
    return blob;
  }

  dispose() {
    if (this.stats.disposed) return;
    this.stats.disposed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro.disconnect();
    this.io?.disconnect();
    this.controls.dispose();
    disposeTree(this.fields);
    disposeTree(this.model);
    disposeTree(this.waves);
    this.waveTex = [];
    for (const m of Object.values(this.mats)) m.dispose();
    this.mats = {};
    this.stats.memory = { ...this.renderer.info.memory };
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
