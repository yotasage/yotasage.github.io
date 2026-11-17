# Notes of step M5.1 – the 3D view

Done 2026-11-17. The Via section has a "3D view" switch under the field controls: the via in three.js, turned by
mouse and touch, with the field maps on cut planes and a PNG of the view.

## The scene (`lib/emsim/scene3d.ts`)

- Plain geometry, no three.js, checked in Node (group "Scene 3D (M5.1)", 2 838 checks on 69 scenes). Board frame in mm,
  z up as `stackZ`. Every solid is a **prism**: a polygon with holes (outer CCW, holes CW, flat x, y) extruded from z0
  to z1, so the renderer has one kind of geometry.
- The **square** of board drawn holds both 2D drawings' boxes (`topGeom`, `sideGeom`); feeds run to its edge (or their
  length), the planes, laminate and mask fill it.
- **Barrels** and **return vias** are tubes (drill radius, the plating as wall; without plating 15 µm so it shows),
  **pads** annuli, **planes** slabs with the antipads as holes: one outline per pair when the circles overlap, a
  bridge joins them or the slot is oblong (`antipadHoles`: all one outline with a waist half-width w; w = r is the
  oblong slot), and a hole per return via. **Laminate and mask** slabs have holes where the barrels and return vias
  pass; a slab is split at a backdrill's depth, the drilled part with the backdrill's radius. The backdrilled section
  is `drilled` (a ghost); pads in it are cut to the drill's radius or gone.
- Solids do not overlap, except copper of one conductor: a return via that an antipad cuts into (the default via's:
  return at 0.8 mm, antipad Ø1.8) keeps the plane whole there and gets its pad on that plane (`return-pad`); a feed is
  drawn where the via puts it, even over a return via (every preset pair: BL142).
- A **pair's feed** that points into the other via leaves mirrored across the line between the vias (the 2D top view
  draws it through the other via: BL143).
- **`topZ`**: the top map's height, the middle of the most laminate between two planes the barrel passes (the cut's
  field holds there, notes-M3.2b.md); the side map's plane is the vertical plane through the origin along `u`
  (`sectionDir`), as the side view.

## The renderer and its loading

- `Via3D.tsx` (in the Via chunk) is only the switch; `Via3DView.tsx` comes by `lazy(import())` when it is opened and
  imports `via3dRender.ts`, which imports three statically, so three is in that chunk only. OrbitControls is an ES
  module of three's add-ons: `await import` in `createVia3D`.
- Prisms by `ExtrudeGeometry`; copper `MeshStandardMaterial` opaque, double-sided (the cut shows inside); laminate and
  mask translucent (0.26 and 0.42), no depth writes, sorted by their centres (meshes are placed at their centres), and
  a **polygon offset** towards the camera: a laminate face lies on a plane's copper face and fought it for depth (radial
  streaks along the triangulation before). Hemisphere light and a headlight on the camera.
- One rAF loop draws only when the camera moved (damping included) or something changed; a new scene is built at once
  the first time, then at most every 3 frames (a drag in the 2D views). Colours from the page's tokens, followed on
  `data-theme` and the system scheme. The cut-away is a clipping plane through the barrels along `u`, removing the half
  towards the first camera (on the side the 2D side view looks from). Reset drops what damping still had to apply.
- PNG: the canvas rendered at 1× or 2× its CSS size and `toBlob` in the same task (no `preserveDrawingBuffer`).
- Closing unmounts the view: geometries, materials, textures and controls disposed, `forceContextLoss`, canvas removed.

## The field planes

- No new solve: with "Show the fields" on, the Export feed's `viaSide` and `viaTop` (`Painted`, finished maps of the
  2D views, M8.1b) become `CanvasTexture`s. The side map stands on the vertical plane along `u` (its x is along the
  section line, as the side view's grid), the top map lies at `topZ` (its z is board y). Both are cropped to the square
  (texture offset and repeat): the 2D views' maps cover what they show, which can reach far beyond. The top map is cut
  with the board when the cut is on; the side map is on the cut. Their scale bars (`FieldScaleBar`, now exported) are
  under the view.

## Measured (production build, Edge, ui-via3d.mjs)

- First load 185.2 kB gzip (185.0 before: the six short lines). Opening loads 5 chunks, 175.2 kB gzip (three's two
  chunks 82.3 and 71.8 kB).
- Open: first frame 417–425 ms after the click with the chunk cold (the harness's clock 0.46–1.1 s, with its polling),
  about 50 ms when opened again.
- Orbit (scripted 2 s, rAF): median frame 16.70 ms at 1× (60 fps, the display's rate; a render call 0.3–0.4 ms), the
  same with the pair's field planes and at 4× (the pixel ratio is capped at 2). Headless Edge had the GPU (ANGLE
  D3D11, AMD RX 7900 XTX); the launch also passes `--enable-unsafe-swiftshader` for a machine without one.
- PNG 743 × 557 px 67 kB at 1×, 1486 × 1114 px 168 kB at 2× (single via, 1440 px page).

## For M7 (waves on the page)

- Full-wave snapshots go on the same planes: `Via3D.setFields(side, top)` takes any `{ image, x0, x1, z0, z1 }`;
  a snapshot of the FDTD grid's vertical plane along `u` and a horizontal plane at `topZ` (or any z) needs only its
  canvas and its extent. For an animation, update the texture in place (`texture.needsUpdate = true` on the same
  canvas) rather than building a new plane per frame; `placeFields` disposes and rebuilds, fine at map rate only.
- The trace in 3D (BL141): the cross-section extruded along the line is a prism per conductor in the same model.
- Left: BL141 (export figure, trace alone), BL142 (feeds over return vias), BL143 (the 2D top view's pair feeds),
  BL144 (labels, measuring, movable planes).
