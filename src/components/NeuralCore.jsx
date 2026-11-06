import { useEffect, useRef, useState } from 'react';

const TAU = Math.PI * 2;
const RINGS = [
  { radius: 0.72, tilt: 0.47, speed: 0.13, color: [91, 228, 247] },
  { radius: 0.92, tilt: 1.02, speed: -0.085, color: [142, 112, 255] },
  { radius: 1.08, tilt: 0.15, speed: 0.055, color: [94, 139, 255] },
];

function makeShell(count) {
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const angle = goldenAngle * i;
    points.push({ x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius, phase: i * 0.37 });
  }

  // Build a spatial hash once so drawing links stays bounded per frame.
  const cellSize = 0.31;
  const buckets = new Map();
  const cell = (p) => [Math.floor((p.x + 1) / cellSize), Math.floor((p.y + 1) / cellSize), Math.floor((p.z + 1) / cellSize)];
  points.forEach((point, index) => {
    const key = cell(point).join(':');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(index);
  });
  const links = [];
  const seen = new Set();
  points.forEach((point, index) => {
    const [cx, cy, cz] = cell(point);
    for (let x = -1; x <= 1; x += 1) for (let y = -1; y <= 1; y += 1) for (let z = -1; z <= 1; z += 1) {
      for (const other of buckets.get(`${cx + x}:${cy + y}:${cz + z}`) || []) {
        if (other <= index) continue;
        const candidate = points[other];
        const dx = point.x - candidate.x; const dy = point.y - candidate.y; const dz = point.z - candidate.z;
        const distance = dx * dx + dy * dy + dz * dz;
        if (distance < 0.075 && links.length < 1600) {
          const id = `${index}:${other}`;
          if (!seen.has(id)) { seen.add(id); links.push([index, other, distance]); }
        }
      }
    }
  });
  return { points, links };
}

function createGlowSprite() {
  const sprite = document.createElement('canvas');
  sprite.width = 128; sprite.height = 128;
  const context = sprite.getContext('2d');
  if (!context) return sprite;
  const gradient = context.createRadialGradient(64, 64, 1, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(174,245,255,0.9)');
  gradient.addColorStop(0.12, 'rgba(91,228,247,0.5)');
  gradient.addColorStop(0.4, 'rgba(107,112,255,0.14)');
  gradient.addColorStop(1, 'rgba(60,92,255,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
  return sprite;
}

function CssOrbFallback() {
  return <div className="ai-orb css-orb-fallback" aria-hidden="true"><div className="orb-grid"/><div className="orb-core"/><span className="orb-ring ring-one"/><span className="orb-ring ring-two"/><span className="orb-ring ring-three"/><i className="orb-particle particle-one"/><i className="orb-particle particle-two"/><i className="orb-particle particle-three"/><span className="orb-caption">CHETANVERSE INTELLIGENCE</span></div>;
}

export default function NeuralCore({ projects = [], completionRatio, openCount = 0, overdueCount = 0, dueToday = 0 }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const pulseRef = useRef(0);
  const reducedRef = useRef(false);
  const drawRef = useRef(null);
  const dataRef = useRef({ projects, completionRatio, openCount, overdueCount, dueToday });
  const [canvasReady, setCanvasReady] = useState(false);
  dataRef.current = { projects, completionRatio, openCount, overdueCount, dueToday };
useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !wrapper || !context) return undefined;

    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = reducedQuery.matches;
    const shell = makeShell(520);
    const glow = createGlowSprite();
    const dust = Array.from({ length: 38 }, (_, i) => ({
      x: Math.sin(i * 91.17) * 0.5 + 0.5,
      y: Math.sin(i * 17.31 + 3) * 0.5 + 0.5,
      depth: 0.3 + ((i * 37) % 70) / 100,
      phase: i * 2.4,
    }));
    const target = { x: 0, y: 0 };
    const rotation = { x: 0, y: 0 };
    let frame = 0; let visible = true; let pageVisible = !document.hidden; let disposed = false;
    let width = 0; let height = 0; let dpr = 1; let last = 0; let started = 0; let frameTotal = 0; let frameCount = 0; let quality = 1;
    let hover = 0;
    const pointCount = () => Math.round((window.innerWidth < 600 ? 210 : window.innerWidth < 1000 ? 340 : 520) * (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4 ? 0.72 : 1));
    let activePointCount = pointCount();

    function resize() {
      const bounds = wrapper.getBoundingClientRect();
      width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
      dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 600 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ? 1.5 : 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      activePointCount = pointCount();
      draw(performance.now(), true);
    }

    function project(x, y, z, scale, centerX, centerY) {
      const perspective = 3.2 / (3.2 - z * 0.58);
      return { x: centerX + x * scale * perspective, y: centerY + y * scale * perspective, depth: (z + 1) / 2, perspective };
    }

    function draw(now, staticFrame = false) {
      if (disposed || !width || !height) return;
      const elapsed = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      if (!staticFrame && !reducedRef.current) {
        rotation.x += (target.x - rotation.x) * Math.min(1, elapsed * 3.2);
        rotation.y += (target.y - rotation.y) * Math.min(1, elapsed * 3.2);
        hover += ((wrapRef.current?.matches(':hover') ? 1 : 0) - hover) * Math.min(1, elapsed * 4);
        pulseRef.current = Math.max(0, pulseRef.current - elapsed * 0.8);
      }

      const w = width; const h = height; const cx = w * 0.5; const cy = h * 0.49;
      const data = dataRef.current;
      const satellites = data.projects.filter((project) => project.status === 'Active').slice(0, 6);
const base = Math.min(w, h) * 0.285;
      const time = reducedRef.current ? 0 : now / 1000;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, w, h);
      context.globalCompositeOperation = 'lighter';

      const energy = Math.min(data.openCount / 16, 1);
      const pulse = pulseRef.current;
      context.globalAlpha = 0.42 + energy * 0.14 + hover * 0.12;
      context.drawImage(glow, cx - base * 1.55, cy - base * 1.55, base * 3.1, base * 3.1);
      context.globalAlpha = 1;

      // Orbit ellipses use the same perspective projection as the shell.
      RINGS.forEach((ring, ringIndex) => {
        const angle = ring.speed * time * (1 + hover * 0.35) + rotation.y * 0.35;
        const points = [];
        for (let step = 0; step <= 112; step += 1) {
          const theta = (step / 112) * TAU;
          let x = Math.cos(theta) * ring.radius; let z = Math.sin(theta) * ring.radius;
          const tiltY = ring.tilt + rotation.x * 0.38;
          const y = z * Math.sin(tiltY); z *= Math.cos(tiltY);
          const rx = x * Math.cos(angle) - z * Math.sin(angle);
          const rz = x * Math.sin(angle) + z * Math.cos(angle);
          points.push(project(rx, y, rz, base, cx, cy));
        }
        for (let i = 1; i < points.length; i += 1) {
          const p = points[i]; const previous = points[i - 1];
          context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(p.x, p.y);
          const warmth = data.overdueCount ? `rgba(255,143,161,${0.12 + p.depth * 0.2})` : `rgba(${ring.color.join(',')},${0.1 + p.depth * 0.25})`;
          context.strokeStyle = warmth; context.lineWidth = 0.7 + p.depth * 0.55; context.stroke();
        }
        satellites.forEach((satellite, satelliteIndex) => {
          if (satelliteIndex % RINGS.length !== ringIndex) return;
          const theta = time * (0.24 + satelliteIndex * 0.018) * (1 + hover * 0.4) + satelliteIndex * 1.7;
          const sx = Math.cos(theta) * ring.radius; const sz = Math.sin(theta) * ring.radius;
          const sy = sz * Math.sin(ring.tilt); const projected = project(sx, sy, sz * Math.cos(ring.tilt), base, cx, cy);
          const color = satellite.color || '#5be4f7';
          context.beginPath(); context.arc(projected.x, projected.y, 2.4 + projected.depth * 1.5, 0, TAU);
          context.fillStyle = color; context.shadowBlur = 11; context.shadowColor = color; context.fill(); context.shadowBlur = 0;
        });
      });

      const cosine = Math.cos(time * 0.13 + rotation.y); const sine = Math.sin(time * 0.13 + rotation.y);
      const tiltCos = Math.cos(rotation.x); const tiltSin = Math.sin(rotation.x);
      const projected = shell.points.slice(0, Math.floor(activePointCount * quality)).map((point) => {
        const x = point.x * cosine - point.z * sine;
        const z = point.x * sine + point.z * cosine;
        const y = point.y * tiltCos - z * tiltSin;
        const rz = point.y * tiltSin + z * tiltCos;
        return project(x, y, rz, base * 0.78, cx, cy);
      });
      context.globalAlpha = 0.14 + hover * 0.1;
      for (let i = 0; i < shell.links.length * quality && i < 1150; i += 1) {
        const [a, b, distance] = shell.links[i];
        if (!projected[a] || !projected[b] || distance > 0.06) continue;
        const p = projected[a]; const q = projected[b];
        context.beginPath(); context.moveTo(p.x, p.y); context.lineTo(q.x, q.y);
        context.strokeStyle = p.depth > 0.4 ? 'rgba(93,206,255,0.38)' : 'rgba(130,119,255,0.16)';
        context.lineWidth = 0.45 + p.depth * 0.35; context.stroke();
      }
      const ordered = projected.map((point, index) => ({ ...point, index })).sort((a, b) => a.depth - b.depth);
      ordered.forEach((point) => {
        const radius = (0.7 + point.depth * 1.15) * point.perspective;
        context.globalAlpha = 0.18 + point.depth * 0.65;
        context.beginPath(); context.arc(point.x, point.y, radius, 0, TAU);
        context.fillStyle = point.depth > 0.65 ? '#9aefff' : point.depth > 0.35 ? '#8ca4ff' : '#a783ff'; context.fill();
      });

      // The nucleus reflects saved completion and open-task counts, not generated activity.
      const completion = Math.max(0, Math.min(1, data.completionRatio === null ? 0 : (data.completionRatio ?? 0) / 100));
      const coreRadius = base * (0.22 + energy * 0.035 + Math.sin(time * 1.1) * (reducedRef.current ? 0 : 0.008));
      context.globalAlpha = 0.76 + energy * 0.15 + pulse * 0.18;
      context.drawImage(glow, cx - coreRadius * 2.25, cy - coreRadius * 2.25, coreRadius * 4.5, coreRadius * 4.5);
      const coreGradient = context.createRadialGradient(cx - coreRadius * 0.28, cy - coreRadius * 0.3, 1, cx, cy, coreRadius);
      coreGradient.addColorStop(0, '#e4ffff'); coreGradient.addColorStop(0.16, '#77f0ff'); coreGradient.addColorStop(0.52, data.overdueCount ? '#a48bff' : '#697eff'); coreGradient.addColorStop(0.82, '#1b318e'); coreGradient.addColorStop(1, 'rgba(20,35,105,0)');
      context.globalAlpha = 1; context.beginPath(); context.arc(cx, cy, coreRadius, 0, TAU); context.fillStyle = coreGradient; context.fill();
      context.beginPath(); context.arc(cx, cy, coreRadius * 0.88, -Math.PI / 2, -Math.PI / 2 + TAU * completion);
      context.strokeStyle = '#b9faff'; context.lineWidth = 1.4; context.shadowBlur = 9; context.shadowColor = '#59e4ff'; context.stroke(); context.shadowBlur = 0;
      if (pulse > 0) { context.globalAlpha = pulse * 0.5; context.beginPath(); context.arc(cx, cy, coreRadius + (1 - pulse) * base * 0.68, 0, TAU); context.strokeStyle = '#81eaff'; context.lineWidth = 1.4; context.stroke(); }

      dust.forEach((star) => {
        const drift = reducedRef.current ? 0 : time * (0.002 + star.depth * 0.004);
        const x = ((star.x + drift + 1) % 1) * w; const y = ((star.y + Math.sin(time * 0.15 + star.phase) * 0.012 + 1) % 1) * h;
        context.globalAlpha = 0.12 + star.depth * 0.25; context.fillStyle = '#9daaff'; context.fillRect(x, y, 1, 1);
      });
      context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';

      if (!reducedRef.current && !staticFrame) {
        if (!started) started = now;
        frameTotal += elapsed * 1000; frameCount += 1;
        if (now - started > 1000 && frameCount > 0 && frameTotal / frameCount > 22) quality = 0.58;
        frame = requestAnimationFrame(draw);
      }
    }
    drawRef.current = draw;

    function schedule() { if (!disposed && visible && pageVisible && !reducedRef.current && !frame) frame = requestAnimationFrame((now) => { frame = 0; draw(now); }); }
    function onMotionChange(event) {
      reducedRef.current = event.matches;
      if (frame) cancelAnimationFrame(frame); frame = 0;
      if (event.matches) { target.x = 0; target.y = 0; rotation.x = 0; rotation.y = 0; draw(performance.now(), true); }
      else schedule();
    }
    function onVisibility() { pageVisible = !document.hidden; if (!pageVisible && frame) cancelAnimationFrame(frame); frame = 0; if (pageVisible) schedule(); }
    function onPointer(event) {
      if (reducedRef.current) return;
      const rect = wrapper.getBoundingClientRect();
      target.x = ((event.clientY - rect.top) / rect.height - 0.5) * 0.34;
      target.y = ((event.clientX - rect.left) / rect.width - 0.5) * 0.42;
    }
    function onLeave() { target.x = 0; target.y = 0; }
    function onPulse() { pulseRef.current = 1; if (reducedRef.current) draw(performance.now(), true); }

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    if (resizeObserver) resizeObserver.observe(wrapper); else window.addEventListener('resize', resize);
    const intersectionObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (!visible && frame) cancelAnimationFrame(frame); frame = 0; if (visible) schedule(); }, { threshold: 0.05 })
      : null;
    intersectionObserver?.observe(wrapper);
    document.addEventListener('visibilitychange', onVisibility);
    reducedQuery.addEventListener?.('change', onMotionChange);
    wrapper.addEventListener('pointermove', onPointer);
    wrapper.addEventListener('pointerleave', onLeave);
    wrapper.addEventListener('pointerdown', onPulse);
    resize();
    setCanvasReady(true);
    if (!reducedRef.current) schedule();

    return () => {
      disposed = true; if (frame) cancelAnimationFrame(frame);
      drawRef.current = null;
      resizeObserver?.disconnect(); intersectionObserver?.disconnect(); window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      reducedQuery.removeEventListener?.('change', onMotionChange);
      wrapper.removeEventListener('pointermove', onPointer); wrapper.removeEventListener('pointerleave', onLeave); wrapper.removeEventListener('pointerdown', onPulse);
    };
  }, []);

  useEffect(() => {
    if (reducedRef.current) drawRef.current?.(performance.now(), true);
  }, [projects, completionRatio, openCount, overdueCount, dueToday]);

  function pulseCore() {
    pulseRef.current = 1;
    if (reducedRef.current) drawRef.current?.(performance.now(), true);
  }

  return (
    <div
      ref={wrapRef}
      className={`neural-core ${canvasReady ? 'canvas-ready' : ''} ${overdueCount ? 'has-overdue' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Neural Core visualization of your workspace: ${projects.filter((project) => project.status === 'Active').length} active projects, ${completionRatio === null ? 'no tasks' : `${completionRatio}%`} complete, ${dueToday} due today${overdueCount ? `, ${overdueCount} overdue` : ''}. Activate to pulse.`}
      onClick={pulseCore}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pulseCore(); } }}
    >
      <canvas ref={canvasRef} className="neural-canvas" aria-hidden="true" />
      <CssOrbFallback />
      <span className="neural-chip chip-projects">{projects.filter((project) => project.status === 'Active').length} active projects</span>
      <span className="neural-chip chip-complete">{completionRatio === null ? '—' : `${completionRatio}%`} complete</span>
      <span className="neural-chip chip-due">{dueToday} due today</span>
      <span className="neural-caption">CHETANVERSE INTELLIGENCE</span>
    </div>
  );
}

