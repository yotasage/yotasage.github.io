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

import {
  CanvasTexture, Color, CylinderGeometry, DirectionalLight, DoubleSide, ExtrudeGeometry, Group, HemisphereLight, LinearFilter,
  Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Path, PerspectiveCamera, Plane, PlaneGeometry, Scene, Shape,
  SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js' with { 'resolution-mode': 'import' };

import type { Prism, PrismKind, Scene3D } from '../../lib/emsim/scene3d';

export interface Via3DColors { bg: string; copper: string; core: string; prepreg: string; mask: string; ghost: string }
/** A field map on a plane: the image (row 0 at z1) over x0 … x1 (along the plane) and z0 … z1 (up, or board y). */
export interface FieldPlane { image: HTMLCanvasElement; x0: number; x1: number; z0: number; z1: number }

const BUILD_FRAMES = 3;
const FOV = 35;

type Ctor = typeof OrbitControls;

export async function createVia3D(host: HTMLElement): Promise<Via3D> {
  const { OrbitControls: OC } = await import('three/examples/jsm/controls/OrbitControls.js');
  return new Via3D(host, OC);
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
  readonly stats = { meshes: {} as Record<string, number>, renders: 0, builds: 0, frameMs: [] as number[], fieldPlanes: 0, disposed: false };
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

  constructor(host: HTMLElement, OC: Ctor) {
    this.host = host;
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
    this.scene.add(this.camera, this.model, this.fields);
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
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.sinceBuild++;
      if (this.pending && this.colors && this.sinceBuild >= BUILD_FRAMES) this.build();
      const moved = this.controls.update();
      if (moved || this.dirty) this.render();
    };
    this.raf = requestAnimationFrame(tick);
  }

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
    this.cutPlane.constant = 0;
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
    const dist = (rho / Math.sin(Math.min(vf, hf) / 2)) * 0.92;
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
    this.ro.disconnect();
    this.controls.dispose();
    disposeTree(this.fields);
    disposeTree(this.model);
    for (const m of Object.values(this.mats)) m.dispose();
    this.mats = {};
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
