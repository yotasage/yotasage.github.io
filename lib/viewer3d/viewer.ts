// The 3D view: renderer, cameras, orbit controls, lights, grid, display styles, section plane, picking and measuring.
// It draws only when something changes (or while an animation plays), so an open model costs nothing while idle.
import {
  AnimationMixer,
  Box3,
  Box3Helper,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  BackSide,
  Float32BufferAttribute,
  FrontSide,
  GridHelper,
  HemisphereLight,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineSegments,
  Material,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  PMREMGenerator,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  Scene,
  Side,
  SkinnedMesh,
  Sphere,
  Texture,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
// The add-ons of three.js are ES modules only, so they are imported when the viewer is made (see createViewer).
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js' with { 'resolution-mode': 'import' };
import type { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js' with { 'resolution-mode': 'import' };

import { DEFAULT_COLOR, LoadedModel, standardMaterial } from './load';
import { markHelper, modelBox, modelObjects, withoutOffsets } from './stats';
import { topology } from './topology';

export type ViewName = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso';
export type Shading = 'shaded' | 'edges' | 'wireframe';
export type Projection = 'perspective' | 'orthographic';
export type Axis = 'x' | 'y' | 'z';
export type Theme = 'dark' | 'light';
export type Tool = 'select' | 'measure';
// How far a file is moved in the view, along X, Y and Z.
export type Offset = [number, number, number];

export interface Display {
  shading: Shading;
  // One colour for every part instead of the colours of the file.
  singleColor: string | null;
  grid: boolean;
  theme: Theme;
}

export interface Section {
  axis: Axis | null;
  // Where the plane cuts, from 0 (the low end of the model along the axis) to 1 (the high end).
  position: number;
  // Keep the part above the plane instead of the part below it.
  flip: boolean;
}

export interface AxisMark {
  axis: Axis;
  positive: boolean;
  // Direction on screen (x right, y down) and towards the viewer (z), each from -1 to 1.
  x: number;
  y: number;
  z: number;
}

export const THEMES: Record<Theme, { background: [string, string]; grid: [number, number]; edges: string }> = {
  dark: { background: ['#3b4048', '#1b1d21'], grid: [0x6a7380, 0x3d434c], edges: '#15181c' },
  light: { background: ['#ffffff', '#d5dae0'], grid: [0x8d96a1, 0xc3c9d0], edges: '#20252b' },
};

// Directions from the model towards the camera. With Z up, the front looks along +Y (the convention of most CAD
// programs); with Y up, along -Z (the convention of glTF and most animation programs).
const VIEWS: Record<'z' | 'y', Record<ViewName, [number, number, number]>> = {
  z: { front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 0, 1], bottom: [0, 0, -1], iso: [1, -1, 1] },
  y: { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0], iso: [1, 1, 1] },
};

const AXES: { axis: Axis; v: Vector3 }[] = [
  { axis: 'x', v: new Vector3(1, 0, 0) },
  { axis: 'y', v: new Vector3(0, 1, 0) },
  { axis: 'z', v: new Vector3(0, 0, 1) },
];

interface CameraState {
  target: Vector3;
  dir: Vector3;
  dist: number;
  zoom: number;
}

const materialsOf = (o: Mesh | Line | Points): Material[] => (Array.isArray(o.material) ? o.material : [o.material]);

// 1, 2 or 5 times a power of ten, at least `x`.
// A round dot with a dark rim, for the measured points.
function dotTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1b1d21';
  ctx.stroke();
  return new CanvasTexture(canvas);
}

function niceStep(x: number): number {
  const p = 10 ** Math.floor(Math.log10(x));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= x);
}

export function disposeObject(root: Object3D) {
  const materials = new Set<Material>();
  root.traverse((o) => {
    const { geometry, material } = o as Mesh;
    if (geometry instanceof BufferGeometry) geometry.dispose();
    if (material) (Array.isArray(material) ? material : [material]).forEach((m) => materials.add(m));
  });
  for (const m of materials) {
    for (const value of Object.values(m)) if (value instanceof Texture) value.dispose();
    m.dispose();
  }
}

interface Addons {
  OrbitControls: typeof OrbitControls;
  RoomEnvironment: typeof RoomEnvironment;
}

export async function createViewer(container: HTMLElement): Promise<Viewer> {
  const [{ OrbitControls }, { RoomEnvironment }] = await Promise.all([
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('three/examples/jsm/environments/RoomEnvironment.js'),
  ]);
  return new Viewer(container, { OrbitControls, RoomEnvironment });
}

export class Viewer {
  readonly renderer: WebGLRenderer;
  onSelect: ((object: Object3D | null) => void) | null = null;
  onMeasure: ((points: Vector3[]) => void) | null = null;

  private container: HTMLElement;
  private addons: Addons;
  private scene = new Scene();
  private perspective = new PerspectiveCamera(40, 1, 0.1, 1000);
  private ortho = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private camera: PerspectiveCamera | OrthographicCamera = this.perspective;
  private controls: OrbitControls;
  private hemisphere = new HemisphereLight('#ffffff', '#40454c', 0.6);
  private headlight = new DirectionalLight('#ffffff', 1.5);
  private resizeObserver: ResizeObserver;
  private raf = 0;
  private disposed = false;
  private interacting = false;
  private tween: { from: CameraState; to: CameraState; start: number; duration: number } | null = null;
  private orthoHeight = 2;

  private model: LoadedModel | null = null;
  private objects: (Mesh | Line | Points)[] = [];
  private originals = new Map<Mesh | Line | Points, Material | Material[]>();
  private sides = new WeakMap<Material, Side>();
  private bounds = new Sphere(new Vector3(), 1);
  private zUp = true;
  private display: Display = { shading: 'shaded', singleColor: null, grid: true, theme: 'dark' };
  private section: Section = { axis: null, position: 0.5, flip: false };
  private plane = new Plane();
  private grid: GridHelper | null = null;
  gridCell: number | null = null;

  private single = standardMaterial(DEFAULT_COLOR);
  private edgeMaterial = new LineBasicMaterial({ color: THEMES.dark.edges });
  private capMaterial = new MeshBasicMaterial({ color: '#e07a3f', side: BackSide });
  private edgeLines = new Map<Mesh, LineSegments>();
  private edgeGeometries = new Map<BufferGeometry, BufferGeometry | null>();
  private caps = new Map<Mesh, Mesh>();

  private tool: Tool = 'select';
  private selected: Object3D | null = null;
  private selectionBox: Box3Helper | null = null;
  private measured: Vector3[] = [];
  private measureGroup = markHelper(new Object3D());
  private dot = dotTexture();
  private raycaster = new Raycaster();
  private down: { x: number; y: number } | null = null;

  private mixer: AnimationMixer | null = null;
  private timer = new Timer();
  private playing = false;
  private frameListeners = new Set<() => void>();

  constructor(container: HTMLElement, addons: Addons) {
    this.container = container;
    this.addons = addons;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.localClippingEnabled = true;
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    // Soft light from every side for the materials of glTF and other PBR files, and a light from the camera, so the
    // side you look at is always lit.
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new addons.RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();
    this.scene.add(this.hemisphere);
    for (const camera of [this.perspective, this.ortho]) this.scene.add(camera);
    this.perspective.add(this.headlight, this.headlight.target);
    this.headlight.position.set(-0.6, 1, 1.2);
    this.headlight.target.position.set(0, 0, -1);
    this.scene.add(this.measureGroup);

    this.setZUp(true, false);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('dblclick', this.onDoubleClick);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.setModel(null);
    // After the model, which asks for a frame when it is removed.
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('dblclick', this.onDoubleClick);
    (this.scene.environment as Texture)?.dispose();
    [this.single, this.edgeMaterial, this.capMaterial].forEach((m) => m.dispose());
    this.dot.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }

  // --- Model ---

  // `offsets` places the files of a model with several files (see setOffsets) before the view is fitted to it.
  setModel(model: LoadedModel | null, offsets: Offset[] = []) {
    if (this.model) {
      this.mixer?.stopAllAction();
      this.mixer = null;
      this.playing = false;
      this.select(null);
      this.clearMeasure();
      for (const line of this.edgeLines.values()) line.removeFromParent();
      for (const g of this.edgeGeometries.values()) g?.dispose();
      for (const cap of this.caps.values()) cap.removeFromParent();
      this.edgeLines.clear();
      this.edgeGeometries.clear();
      this.caps.clear();
      // Materials that were replaced by the single colour are disposed with the rest.
      for (const [o, m] of this.originals) o.material = m;
      this.scene.remove(this.model.root);
      disposeObject(this.model.root);
      this.model.dispose();
    }
    this.model = model;
    this.objects = model ? modelObjects(model.root) : [];
    this.originals = new Map(this.objects.map((o) => [o, o.material]));
    if (!model) {
      this.updateGrid();
      this.requestRender();
      return;
    }
    this.scene.add(model.root);
    this.placeFiles(offsets);
    const box = modelBox(model.root, false);
    box.getBoundingSphere(this.bounds);
    const r = this.bounds.radius || 1;
    this.raycaster.params.Points.threshold = r * 0.01;
    this.raycaster.params.Line.threshold = r * 0.005;
    this.controls.minDistance = r * 1e-3;
    this.controls.maxDistance = r * 50;
    this.orthoHeight = r * 2.4;
    this.setZUp(model.zUp, false);
    this.applyMaterials();
    this.view('iso', false);
  }

  get root(): Object3D | null {
    return this.model?.root ?? null;
  }

  private placeFiles(offsets: Offset[]) {
    this.model.fileGroups.forEach(({ group }, i) => group.position.fromArray(offsets[i] ?? [0, 0, 0]));
    this.model.root.updateMatrixWorld(true);
  }

  // Moves the files of a model with several files apart, so they can be compared side by side. This is for the view
  // only: statistics and saved files keep the positions the files give (see withoutOffsets and exportModel).
  setOffsets(offsets: Offset[]) {
    if (!this.model) return;
    this.placeFiles(offsets);
    this.updateGrid();
    // The section plane follows the model.
    this.applyMaterials();
    this.updateSelectionBox();
    this.requestRender();
  }

  // Offsets that put the files in a row along X in the order they were opened, with a gap between them. The first
  // file stays where it is, and the offsets are round numbers.
  sideBySide(): Offset[] {
    if (!this.model) return [];
    const boxes = withoutOffsets(this.model.root, () => this.model.fileGroups.map(({ group }) => modelBox(group, false)));
    const sizes = boxes.filter((b) => !b.isEmpty()).map((b) => b.getSize(new Vector3()));
    const largest = Math.max(...sizes.map((s) => Math.max(s.x, s.y, s.z)), 0) || 1;
    const step = niceStep(largest / 10);
    const gap = largest * 0.25;
    let next: number | null = null;
    return boxes.map((box): Offset => {
      if (box.isEmpty()) return [0, 0, 0];
      const x = next === null ? 0 : Number((Math.ceil((next - box.min.x) / step) * step).toPrecision(12));
      next = box.max.x + x + gap;
      return [x, 0, 0];
    });
  }

  // Call after showing or hiding parts.
  refresh() {
    this.updateSelectionBox();
    this.requestRender();
  }

  // --- Camera ---

  private makeControls(): OrbitControls {
    const target = this.controls?.target.clone() ?? new Vector3();
    this.controls?.dispose();
    const controls = new this.addons.OrbitControls(this.camera, this.renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.15;
    controls.zoomToCursor = true;
    controls.target.copy(target);
    controls.minDistance = this.controls?.minDistance ?? 0;
    controls.maxDistance = this.controls?.maxDistance ?? Infinity;
    controls.addEventListener('change', () => this.requestRender());
    controls.addEventListener('start', () => {
      this.interacting = true;
      this.tween = null;
      this.requestRender();
    });
    controls.addEventListener('end', () => {
      this.interacting = false;
    });
    return controls;
  }

  setZUp(zUp: boolean, refit = true) {
    this.zUp = zUp;
    const up = zUp ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
    this.perspective.up.copy(up);
    this.ortho.up.copy(up);
    this.hemisphere.position.copy(up);
    // OrbitControls takes the up direction from the camera when it is made.
    this.controls = this.makeControls();
    this.updateGrid();
    if (refit) this.view('iso');
  }

  setProjection(projection: Projection) {
    const next = projection === 'orthographic' ? this.ortho : this.perspective;
    if (next === this.camera) return;
    const state = this.state();
    const halfFov = MathUtils.degToRad(this.perspective.fov / 2);
    if (next === this.ortho) {
      // Same size on screen: the height seen at the target becomes the height of the orthographic view. The camera
      // moves back so that nothing of the model is behind it.
      const height = 2 * state.dist * Math.tan(halfFov);
      state.zoom = this.orthoHeight / height;
      state.dist = Math.max(state.dist, this.bounds.radius * 4);
    } else {
      state.dist = this.orthoHeight / this.ortho.zoom / (2 * Math.tan(halfFov));
      state.zoom = 1;
    }
    this.camera = next;
    if (next === this.ortho) this.ortho.add(this.headlight, this.headlight.target);
    else this.perspective.add(this.headlight, this.headlight.target);
    this.controls = this.makeControls();
    this.apply(state);
    this.resize();
  }

  private state(): CameraState {
    const target = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(target);
    return { target, dir: offset.clone().normalize(), dist: offset.length(), zoom: this.camera.zoom };
  }

  private apply(s: CameraState) {
    this.controls.target.copy(s.target);
    this.camera.position.copy(s.target).addScaledVector(s.dir, s.dist);
    this.camera.zoom = s.zoom;
    this.camera.lookAt(s.target);
    this.camera.updateProjectionMatrix();
  }

  private animateTo(to: CameraState, animate = true) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Stops what is left of the last drag.
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
    if (!animate || reduced) {
      this.tween = null;
      this.apply(to);
      this.requestRender();
      return;
    }
    this.tween = { from: this.state(), to, start: performance.now(), duration: 350 };
    this.requestRender();
  }

  // A camera state that shows all of `box` from direction `dir`.
  private framing(box: Box3, dir: Vector3): CameraState {
    const sphere = box.getBoundingSphere(new Sphere());
    const r = Math.max(sphere.radius, 1e-9);
    const aspect = this.perspective.aspect;
    const vFov = MathUtils.degToRad(this.perspective.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const dist = (r / Math.sin(Math.min(vFov, hFov) / 2)) * 1.02;
    const zoom = this.orthoHeight / (2 * r * 1.08 * Math.max(1, 1 / aspect));
    return {
      target: sphere.center.clone(),
      dir: dir.clone().normalize(),
      dist: this.camera === this.ortho ? Math.max(dist, this.bounds.radius * 4) : dist,
      zoom: this.camera === this.ortho ? zoom : 1,
    };
  }

  // Looks at the model from a direction. Straight from above or below, the front of the model faces down the screen.
  viewAlong(direction: Vector3, animate = true) {
    if (!this.model) return;
    const dir = direction.clone().normalize();
    const up = this.camera.up;
    if (Math.abs(dir.dot(up)) > 0.999) dir.addScaledVector(new Vector3(...VIEWS[this.zUp ? 'z' : 'y'].front), 1e-4).normalize();
    const box = modelBox(this.model.root);
    if (box.isEmpty()) return;
    this.animateTo(this.framing(box, dir), animate);
  }

  view(name: ViewName, animate = true) {
    this.viewAlong(new Vector3(...VIEWS[this.zUp ? 'z' : 'y'][name]), animate);
  }

  // Fits the shown parts (or one object) in the view, from the current direction.
  fit(object: Object3D | null = null) {
    if (!this.model) return;
    const box = modelBox(object ?? this.model.root);
    if (box.isEmpty()) return;
    this.animateTo(this.framing(box, this.state().dir));
  }

  // Called after every frame, for what follows the camera on the page (the axis gizmo, the measured distance).
  addFrameListener(listener: () => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  // The axes as they appear on screen, for the axis gizmo.
  axes(): AxisMark[] {
    const inverse = this.camera.quaternion.clone().invert();
    return AXES.flatMap(({ axis, v }) => [true, false].map((positive) => {
      const d = v.clone().multiplyScalar(positive ? 1 : -1).applyQuaternion(inverse);
      return { axis, positive, x: d.x, y: -d.y, z: d.z };
    }));
  }

  // Position of a point on the canvas in CSS pixels, and whether it is in front of the camera.
  project(point: Vector3): { x: number; y: number; visible: boolean } {
    const p = point.clone().project(this.camera);
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement;
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h, visible: p.z > -1 && p.z < 1 };
  }

  // --- Drawing ---

  requestRender = () => {
    if (!this.raf && !this.disposed) this.raf = requestAnimationFrame(this.frame);
  };

  private frame = (now: number) => {
    this.raf = 0;
    let busy = this.interacting || this.playing;
    if (this.tween) {
      const { from, to, start, duration } = this.tween;
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const turn = new Quaternion().slerp(new Quaternion().setFromUnitVectors(from.dir, to.dir), e);
      this.apply({
        target: from.target.clone().lerp(to.target, e),
        dir: from.dir.clone().applyQuaternion(turn),
        dist: MathUtils.lerp(from.dist, to.dist, e),
        zoom: MathUtils.lerp(from.zoom, to.zoom, e),
      });
      if (t >= 1) this.tween = null;
      else busy = true;
    } else if (this.controls.update()) {
      busy = true;
    }
    if (this.playing && this.mixer) {
      this.mixer.update(this.timer.update(now).getDelta());
      this.updateSelectionBox();
    }
    this.render();
    if (busy) this.requestRender();
  };

  private render() {
    // Near and far planes that fit the model and the grid, for the best depth precision.
    const d = this.camera.position.distanceTo(this.bounds.center);
    const r = this.bounds.radius * 1.5;
    if (this.camera === this.perspective) {
      this.camera.near = Math.max(r * 2e-4, (d - r) * 0.8);
      this.camera.far = (d + r) * 1.2;
    } else {
      this.camera.near = d - r * 2;
      this.camera.far = d + r * 2;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    for (const listener of this.frameListeners) listener();
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.perspective.aspect = w / h;
    this.perspective.updateProjectionMatrix();
    const halfH = this.orthoHeight / 2;
    Object.assign(this.ortho, { left: -halfH * (w / h), right: halfH * (w / h), top: halfH, bottom: -halfH });
    this.ortho.updateProjectionMatrix();
    // Draws at once, so the canvas is not blank (or stretched) until the next frame.
    this.render();
  }

  // --- Display ---

  setDisplay(display: Display) {
    const gridChanged = display.grid !== this.display.grid || display.theme !== this.display.theme;
    this.display = display;
    this.edgeMaterial.color.set(THEMES[display.theme].edges);
    if (gridChanged) this.updateGrid();
    this.applyMaterials();
  }

  setSection(section: Section) {
    this.section = section;
    this.applyMaterials();
  }

  // The grid under the model, and the sphere around the model and the grid, which the near and far planes must fit.
  private updateGrid() {
    if (this.grid) {
      this.grid.removeFromParent();
      this.grid.geometry.dispose();
      (this.grid.material as Material).dispose();
      this.grid = null;
      this.gridCell = null;
    }
    this.requestRender();
    if (!this.model) return;
    const box = modelBox(this.model.root, false);
    if (box.isEmpty()) return;
    box.getBoundingSphere(this.bounds);
    if (!this.display.grid) return;
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const extent = Math.max(this.zUp ? Math.max(size.x, size.y) : Math.max(size.x, size.z), size.length() * 0.2, 1e-9);
    const cell = niceStep(extent / 8);
    const divisions = 2 * Math.max(5, Math.ceil((extent * 0.8) / cell));
    const [center1, lines] = THEMES[this.display.theme].grid;
    const grid = markHelper(new GridHelper(cell * divisions, divisions, center1, lines));
    const material = grid.material as Material;
    material.transparent = true;
    material.opacity = 0.7;
    material.depthWrite = false;
    const snap = (v: number) => Math.round(v / cell) * cell;
    if (this.zUp) {
      grid.rotation.x = Math.PI / 2;
      grid.position.set(snap(center.x), snap(center.y), box.min.z);
    } else {
      grid.position.set(snap(center.x), box.min.y, snap(center.z));
    }
    this.scene.add(grid);
    this.grid = grid;
    this.gridCell = cell;
    new Box3().setFromObject(grid).union(box).getBoundingSphere(this.bounds);
  }

  private applyMaterials() {
    if (!this.model) return;
    const { shading, singleColor } = this.display;
    const sectioned = this.section.axis !== null;
    const planes = sectioned ? [this.sectionPlane()] : null;
    if (singleColor) this.single.color.set(singleColor);

    const meshMaterials = new Set<Material>();
    const otherMaterials = new Set<Material>();
    for (const o of this.objects) {
      if (o instanceof Mesh) {
        o.material = singleColor ? this.single : this.originals.get(o);
        materialsOf(o).forEach((m) => meshMaterials.add(m));
      } else {
        materialsOf(o).forEach((m) => otherMaterials.add(m));
      }
    }
    for (const m of meshMaterials) {
      if (!this.sides.has(m)) this.sides.set(m, m.side);
      // While cut, the back faces seen through the cut are drawn by the caps.
      const side = sectioned ? FrontSide : this.sides.get(m);
      if (m.side !== side) {
        m.side = side;
        m.needsUpdate = true;
      }
      if ('wireframe' in m) m.wireframe = shading === 'wireframe';
      // Pushes the surfaces back a little, so the edge lines on them are not hidden.
      m.polygonOffset = shading === 'edges';
      m.polygonOffsetFactor = 1;
      m.polygonOffsetUnits = 1;
      m.clippingPlanes = planes;
    }
    for (const m of [...otherMaterials, this.edgeMaterial, this.capMaterial]) m.clippingPlanes = planes;

    if (shading === 'edges') this.ensureEdges();
    for (const line of this.edgeLines.values()) line.visible = shading === 'edges';
    if (sectioned) this.ensureCaps();
    for (const cap of this.caps.values()) cap.visible = sectioned && shading !== 'wireframe';
    this.requestRender();
  }

  private ensureEdges() {
    for (const o of this.objects) {
      // Lines would not follow the deformation of skinned or instanced meshes.
      if (!(o instanceof Mesh) || o instanceof SkinnedMesh || o instanceof InstancedMesh || this.edgeLines.has(o)) continue;
      if (!this.edgeGeometries.has(o.geometry)) {
        const topo = topology(o.geometry);
        let geometry: BufferGeometry | null = null;
        if (topo?.edges.length) {
          geometry = new BufferGeometry();
          geometry.setAttribute('position', new Float32BufferAttribute(topo.edges, 3));
        }
        this.edgeGeometries.set(o.geometry, geometry);
      }
      const geometry = this.edgeGeometries.get(o.geometry);
      if (!geometry) continue;
      const line = markHelper(new LineSegments(geometry, this.edgeMaterial));
      o.add(line);
      this.edgeLines.set(o, line);
    }
  }

  private ensureCaps() {
    for (const o of this.objects) {
      if (!(o instanceof Mesh) || o instanceof SkinnedMesh || o instanceof InstancedMesh || this.caps.has(o)) continue;
      const cap = markHelper(new Mesh(o.geometry, this.capMaterial));
      o.add(cap);
      this.caps.set(o, cap);
    }
  }

  private sectionPlane(): Plane {
    const { axis, position, flip } = this.section;
    const box = modelBox(this.model.root, false);
    const min = box.min[axis];
    const max = box.max[axis];
    // A little beyond the ends, so that 0 and 1 cut away all or nothing.
    const at = min - (max - min) * 0.001 + position * (max - min) * 1.002;
    const normal = new Vector3();
    normal[axis] = flip ? 1 : -1;
    // Points where normal · p + constant < 0 are cut away.
    return this.plane.set(normal, flip ? -at : at);
  }

  // --- Picking, selection and measuring ---

  setTool(tool: Tool) {
    this.tool = tool;
    this.renderer.domElement.style.cursor = tool === 'measure' ? 'crosshair' : '';
  }

  private onPointerDown = (e: PointerEvent) => {
    this.down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  };

  // A click is a press and release without dragging; dragging turns the view.
  private onPointerUp = (e: PointerEvent) => {
    const down = this.down;
    this.down = null;
    if (!down || e.button !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    const hit = this.pick(e);
    if (this.tool === 'measure') {
      if (!hit) return;
      this.measured = this.measured.length >= 2 ? [hit.point] : [...this.measured, hit.point];
      this.drawMeasure();
      this.onMeasure?.(this.measured);
    } else {
      this.select(hit?.object ?? null);
      this.onSelect?.(this.selected);
    }
  };

  // Double-click: the clicked point becomes the centre of the view, which the view turns around.
  private onDoubleClick = (e: MouseEvent) => {
    const hit = this.pick(e);
    if (!hit) return;
    const offset = this.camera.position.clone().sub(hit.point);
    this.animateTo({ target: hit.point.clone(), dir: offset.clone().normalize(), dist: offset.length(), zoom: this.camera.zoom });
  };

  private pick(e: MouseEvent): { point: Vector3; object: Object3D } | null {
    if (!this.model) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(modelObjects(this.model.root, true), false);
    const plane = this.section.axis ? this.plane : null;
    const hit = hits.find((h) => !plane || plane.distanceToPoint(h.point) >= 0);
    return hit ? { point: hit.point.clone(), object: hit.object } : null;
  }

  select(object: Object3D | null) {
    this.selected = object;
    this.updateSelectionBox();
    this.requestRender();
  }

  private updateSelectionBox() {
    if (this.selectionBox) {
      this.selectionBox.removeFromParent();
      this.selectionBox.dispose();
      this.selectionBox = null;
    }
    if (!this.selected) return;
    const box = modelBox(this.selected);
    if (box.isEmpty()) return;
    this.selectionBox = markHelper(new Box3Helper(box, new Color('#3d9bff')));
    const material = this.selectionBox.material as Material;
    material.depthTest = false;
    material.transparent = true;
    this.selectionBox.renderOrder = 998;
    this.scene.add(this.selectionBox);
  }

  clearMeasure() {
    this.measured = [];
    this.drawMeasure();
  }

  private drawMeasure() {
    for (const child of [...this.measureGroup.children]) {
      child.removeFromParent();
      (child as Points).geometry.dispose();
      ((child as Points).material as Material).dispose();
    }
    if (this.measured.length) {
      const flat = this.measured.flatMap((p) => p.toArray());
      const points = new Points(new BufferGeometry(), new PointsMaterial({ map: this.dot, size: 14, sizeAttenuation: false, depthTest: false, transparent: true, alphaTest: 0.5 }));
      points.geometry.setAttribute('position', new Float32BufferAttribute(flat, 3));
      points.renderOrder = 1000;
      this.measureGroup.add(points);
      if (this.measured.length === 2) {
        const line = new Line(new BufferGeometry(), new LineBasicMaterial({ color: '#ffd23f', depthTest: false }));
        line.geometry.setAttribute('position', new Float32BufferAttribute(flat, 3));
        line.renderOrder = 999;
        this.measureGroup.add(line);
      }
    }
    this.requestRender();
  }

  // --- Animation ---

  playAnimation(index: number | null) {
    if (!this.model) return;
    this.mixer?.stopAllAction();
    this.playing = index !== null;
    if (index === null) {
      this.mixer = null;
      this.requestRender();
      return;
    }
    this.mixer ??= new AnimationMixer(this.model.root);
    this.mixer.clipAction(this.model.animations[index]).play();
    this.timer.reset();
    this.requestRender();
  }

  setPaused(paused: boolean) {
    if (!this.mixer) return;
    this.playing = !paused;
    // The time while paused does not count.
    if (!paused) this.timer.reset();
    this.requestRender();
  }

  // --- Images ---

  // A PNG of the view at the size of the canvas, on the background of the theme or transparent.
  screenshot(transparent: boolean): Promise<Blob> {
    this.render();
    const source = this.renderer.domElement;
    let canvas = source;
    if (!transparent) {
      // Painted in the same task as the render, before the browser clears the WebGL canvas.
      canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext('2d');
      const [inner, outer] = THEMES[this.display.theme].background;
      const gradient = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.4, 0, canvas.width / 2, canvas.height * 0.4, Math.hypot(canvas.width, canvas.height) * 0.6);
      gradient.addColorStop(0, inner);
      gradient.addColorStop(1, outer);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0);
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The browser could not make the image.'))), 'image/png');
    });
  }
}
