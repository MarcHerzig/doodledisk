import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createPreview(canvas, { onDrag }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14171c);
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 3000);
  camera.up.set(0, 0, 1);
  const home = () => {
    camera.position.set(0, -110, 190);
    controls.target.set(0, 0, 0);
    controls.update();
  };
  const controls = new OrbitControls(camera, canvas);
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  home();

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(80, -120, 200);
  scene.add(sun);
  const grid = new THREE.GridHelper(300, 30, 0x2a3038, 0x20252b);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  const ringPts = Array.from({ length: 128 }, (_, i) => new THREE.Vector3(Math.cos((i / 128) * 2 * Math.PI), Math.sin((i / 128) * 2 * Math.PI), 0));
  const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: 0xff4d4d }));
  rim.visible = false;
  scene.add(rim);

  const draft = new THREE.Group();
  scene.add(draft);

  let mesh = null;
  let thickness = 3;
  let radius = 60;

  let queued = false;
  const render = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      renderer.render(scene, camera);
    });
  };
  controls.addEventListener('change', render);

  const holder = canvas.parentElement;
  new ResizeObserver(() => {
    const w = holder.clientWidth;
    const h = holder.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }).observe(holder);

  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const pt = new THREE.Vector3();
  const hit = (ev) => {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    plane.constant = -thickness;
    return ray.ray.intersectPlane(plane, pt) ? pt.clone() : null;
  };
  let last = null;
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || ev.pointerType !== 'mouse') return;
    const p = hit(ev);
    if (p && Math.hypot(p.x, p.y) <= radius) {
      last = p;
      canvas.setPointerCapture(ev.pointerId);
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!last) return;
    const p = hit(ev);
    if (!p) return;
    onDrag(p.x - last.x, p.y - last.y, 'move');
    last = p;
  });
  const end = () => {
    if (last) {
      last = null;
      onDrag(0, 0, 'end');
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  function clearDraft() {
    for (const c of [...draft.children]) {
      c.geometry.dispose();
      draft.remove(c);
    }
    if (mesh) mesh.visible = true;
    render();
  }

  return {
    setMesh(positions, indices) {
      clearDraft();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setIndex(new THREE.BufferAttribute(indices, 1));
      const flat = g.toNonIndexed();
      flat.computeVertexNormals();
      g.dispose();
      if (mesh) {
        mesh.geometry.dispose();
        mesh.geometry = flat;
      } else {
        mesh = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.6 }));
        scene.add(mesh);
      }
      render();
    },
    setDisk(durchmesser, dicke, rimRadius) {
      radius = durchmesser / 2;
      thickness = dicke;
      const rr = Number.isFinite(rimRadius) ? rimRadius : radius;
      rim.scale.set(rr, rr, 1);
      rim.position.z = dicke + 0.05;
      render();
    },
    setRim(bad) {
      rim.visible = bad;
      render();
    },
    showDraft(polylines, gaps) {
      clearDraft();
      if (mesh) mesh.visible = false;
      const all = polylines.flatMap((p) => p.points);
      for (const pl of polylines) {
        const g = new THREE.BufferGeometry().setFromPoints(pl.points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
        draft.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xcfd6df })));
      }
      if (gaps.length) {
        const g = new THREE.BufferGeometry().setFromPoints(gaps.map((p) => new THREE.Vector3(p.x, p.y, 0.1)));
        draft.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xff4d4d, size: 8, sizeAttenuation: false })));
      }
      const xs = all.map((p) => p[0]);
      const ys = all.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 10);
      camera.position.set(cx, cy - 0.001, size * 1.6);
      controls.target.set(cx, cy, 0);
      controls.update();
      render();
    },
    hideMesh() {
      if (mesh) mesh.visible = false;
      render();
    },
    clearDraft() {
      clearDraft();
      home();
    },
  };
}
