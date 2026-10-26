// Pan and zoom for an SVG inside a container: drag, pinch, wheel, and +/−/fit buttons.
// Calls onTap(target) for a press that did not move, so machines can show their details.
export function panZoom(box, svg, { onTap } = {}) {
  const W = Number(svg.dataset.w), H = Number(svg.dataset.h);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('preserveAspectRatio', 'none');
  let vb = { x: 0, y: 0, w: W, h: H };
  const rect = () => box.getBoundingClientRect();
  const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  // Keep the view's aspect equal to the box so the mapping stays linear.
  const aspect = () => { const r = rect(); return r.height / Math.max(1, r.width); };
  function fit() {
    const a = aspect();
    if (H / W > a) { vb.h = H * 1.04; vb.w = vb.h / a; } else { vb.w = W * 1.04; vb.h = vb.w * a; }
    vb.x = (W - vb.w) / 2;
    vb.y = (H - vb.h) / 2;
    apply();
  }
  function zoomAt(cx, cy, factor) {
    const r = rect();
    const px = vb.x + ((cx - r.left) / r.width) * vb.w;
    const py = vb.y + ((cy - r.top) / r.height) * vb.h;
    const w = Math.min(Math.max(vb.w / factor, 120), Math.max(W, H) * 4);
    const k = w / vb.w;
    vb = { x: px - (px - vb.x) * k, y: py - (py - vb.y) * k, w, h: vb.h * k };
    apply();
  }
  const zoomCenter = (factor) => { const r = rect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor); };

  const pts = new Map();
  let moved = 0;
  let pinch = null;
  box.addEventListener('pointerdown', (e) => {
    box.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, target: e.target });
    moved = 0;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  });
  box.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const r = rect();
    if (pts.size === 1) {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      moved += Math.abs(dx) + Math.abs(dy);
      vb.x -= (dx / r.width) * vb.w;
      vb.y -= (dy / r.height) * vb.h;
      apply();
    }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d);
      pinch.d = d;
      moved += 10;
    }
  });
  const end = (e) => {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (p && moved < 6 && e.type === 'pointerup') onTap?.(p.target);
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  box.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  new ResizeObserver(() => {
    const a = aspect();
    const cy = vb.y + vb.h / 2;
    vb.h = vb.w * a;
    vb.y = cy - vb.h / 2;
    apply();
  }).observe(box);
  // Start at full width with the top in view; on a phone a whole tall plan would be too small to read.
  function fitWidth() {
    const a = aspect();
    vb.w = W * 1.04;
    vb.h = vb.w * a;
    vb.x = (W - vb.w) / 2;
    vb.y = vb.h >= H ? (H - vb.h) / 2 : -W * 0.02;
    apply();
  }
  fitWidth();
  return { fit, zoomIn: () => zoomCenter(1.4), zoomOut: () => zoomCenter(1 / 1.4) };
}
