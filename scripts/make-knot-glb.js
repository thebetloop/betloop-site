// Build the exact Bet Loop knot as a 3D GLB: a round tube swept along the
// brand path (s=5.5, r=9.25 on the 64 grid), lime->green gradient, PBR.
const { Document, NodeIO } = require('@gltf-transform/core');

// ---- path definition in SVG coords (y down), center 32 ----
const s = 5.5, r = 9.25, c = s + r; // 14.75
const C = 32;
const TAU = Math.PI * 2;

// segments: [type, data]; arcs turn -3*PI/2 (sweep 0 in SVG y-down coords)
const segs = [
  { t: 'line', a: [C + s, C - c], b: [C + s, C + c] },
  { t: 'arc', o: [C + c, C + c], start: Math.PI },
  { t: 'line', a: [C + c, C + s], b: [C - c, C + s] },
  { t: 'arc', o: [C - c, C + c], start: -Math.PI / 2 },
  { t: 'line', a: [C - s, C + c], b: [C - s, C - c] },
  { t: 'arc', o: [C - c, C - c], start: 0 },
  { t: 'line', a: [C - c, C - s], b: [C + c, C - s] },
  { t: 'arc', o: [C + c, C - c], start: Math.PI / 2 },
];
const ARC_SWEEP = -3 * Math.PI / 2;
const lineLen = 2 * c;
const arcLen = Math.abs(ARC_SWEEP) * r;
const totalLen = segs.reduce((acc, sg) => acc + (sg.t === 'line' ? lineLen : arcLen), 0);

// point at arc-length u along the whole closed path (2D, SVG coords)
function sample2d(u) {
  u = ((u % totalLen) + totalLen) % totalLen;
  for (const sg of segs) {
    const L = sg.t === 'line' ? lineLen : arcLen;
    if (u <= L + 1e-9) {
      if (sg.t === 'line') {
        const dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1];
        const inv = 1 / lineLen;
        return { p: [sg.a[0] + dx * (u * inv), sg.a[1] + dy * (u * inv)], line: true, lu: u };
      }
      const ang = sg.start + ARC_SWEEP * (u / arcLen);
      return { p: [sg.o[0] + r * Math.cos(ang), sg.o[1] + r * Math.sin(ang)], line: false, lu: u };
    }
    u -= L;
  }
  throw new Error('unreachable');
}

// Alternating over/under weave: each straight segment passes two crossings,
// at r (=9.25) and 2c-r (=20.25) into the segment — first over, then under.
const WEAVE_A = 0.5, WEAVE_W = 5.5;
const bump = d => (Math.abs(d) < WEAVE_W ? Math.cos(Math.PI * d / (2 * WEAVE_W)) ** 2 : 0);
function zAt(hit) {
  if (!hit.line) return 0;
  return WEAVE_A * (bump(hit.lu - r) - bump(hit.lu - (2 * c - r)));
}

// 3D point: map SVG (x, y-down) -> (x-32, 32-y, z)
function p3(u) {
  const hit = sample2d(u);
  return [hit.p[0] - C, C - hit.p[1], zAt(hit)];
}

// ---- sweep the tube ----
const RINGS = 720, SIDES = 28, R = 3.55;
const srgb2lin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const hex2lin = h => [1, 3, 5].map(i => srgb2lin(parseInt(h.slice(i, i + 2), 16) / 255));
const cLime = hex2lin('#9ADB4F'), cGreen = hex2lin('#2FA857');

const positions = new Float32Array(RINGS * SIDES * 3);
const normals = new Float32Array(RINGS * SIDES * 3);
const colors = new Float32Array(RINGS * SIDES * 3);
const indices = new Uint32Array(RINGS * SIDES * 6);

const span = c + r; // half-extent of mark
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const EPS = totalLen / (RINGS * 4);
for (let i = 0; i < RINGS; i++) {
  const u = (i / RINGS) * totalLen;
  const P = p3(u);
  const Pa = p3(u + EPS), Pb = p3(u - EPS);
  const T = norm3([Pa[0] - Pb[0], Pa[1] - Pb[1], Pa[2] - Pb[2]]);
  // frame: in-plane-ish normal + true binormal (T never parallel to Z)
  const N = norm3(cross3([0, 0, 1], T));
  const B = cross3(T, N);
  // gradient along the sheet diagonal: top-left lime -> bottom-right green
  let t = ((P[0] - P[1]) / (2 * span * 0.9) + 0.5);
  t = Math.min(1, Math.max(0, t));
  const col = [0, 1, 2].map(k => cLime[k] + (cGreen[k] - cLime[k]) * t);
  for (let j = 0; j < SIDES; j++) {
    const a = (j / SIDES) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    const ox = N[0] * ca + B[0] * sa, oy = N[1] * ca + B[1] * sa, oz = N[2] * ca + B[2] * sa;
    const vi = (i * SIDES + j) * 3;
    positions[vi] = P[0] + ox * R;
    positions[vi + 1] = P[1] + oy * R;
    positions[vi + 2] = P[2] + oz * R;
    normals[vi] = ox; normals[vi + 1] = oy; normals[vi + 2] = oz;
    colors[vi] = col[0]; colors[vi + 1] = col[1]; colors[vi + 2] = col[2];
  }
}
let ii = 0;
for (let i = 0; i < RINGS; i++) {
  const i2 = (i + 1) % RINGS;
  for (let j = 0; j < SIDES; j++) {
    const j2 = (j + 1) % SIDES;
    const a = i * SIDES + j, b = i2 * SIDES + j, d = i * SIDES + j2, e = i2 * SIDES + j2;
    indices[ii++] = a; indices[ii++] = b; indices[ii++] = e;
    indices[ii++] = a; indices[ii++] = e; indices[ii++] = d;
  }
}

// ---- write GLB ----
(async () => {
  const doc = new Document();
  const buf = doc.createBuffer();
  const posAcc = doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buf);
  const nrmAcc = doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buf);
  const colAcc = doc.createAccessor().setType('VEC3').setArray(colors).setBuffer(buf);
  const idxAcc = doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buf);
  const mat = doc.createMaterial('betloop-green')
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0.05)
    .setRoughnessFactor(0.4);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', posAcc)
    .setAttribute('NORMAL', nrmAcc)
    .setAttribute('COLOR_0', colAcc)
    .setIndices(idxAcc)
    .setMaterial(mat);
  const mesh = doc.createMesh('knot').addPrimitive(prim);
  const node = doc.createNode('betloop-knot').setMesh(mesh);
  doc.createScene('scene').addChild(node);
  await new NodeIO().write(process.argv[2] || 'betloop-knot.glb', doc);
  console.log('wrote', RINGS * SIDES, 'verts');
})();
