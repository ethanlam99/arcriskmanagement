import { useEffect, useRef } from 'react';

// Single persistent ARC scene navigated by a scroll-driven camera. The arc (the
// brand glyph / risk-edit pipeline) stays fixed in world space; scrolling pans
// and zooms a virtual camera across it, focusing successive stages — so each
// section is the SAME arc seen closer, not a new graphic. At each focus stop a
// richer mini-scene GROWS OUT OF the focused node (code-lines assembling, checks
// passing green, data racing) rather than appearing as a separate panel.
// Keyframes correspond 1:1 to the LoginPage sections (hero + 3 pillars).
//
// The arc lives inside a "stage" region that excludes the right login rail, and
// the camera centres on that region (not the full screen), so the whole arc —
// including its emphasised end node — stays clear of the panel at every stop.

interface Pt {
  x: number;
  y: number;
}

const NODE_COUNT = 6;
const RAIL_W = 460; // desktop login rail width to keep the arc clear of

function quad(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function smoothstep(x: number) {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
}

export function HeroFlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointer = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const context = node.getContext('2d');
    if (!context) return;
    const el: HTMLCanvasElement = node;
    const ctx: CanvasRenderingContext2D = context;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    function resize() {
      width = el.clientWidth;
      height = el.clientHeight;
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 16 }, (_, i) => i / 16);
    const ghost = Array.from({ length: 5 }, (_, i) => i / 5); // slow "old system" lane

    const smooth = { x: 0.5, y: 0.5 };
    let scrollP = 0;
    let t = 0;
    let raf = 0;

    function targetScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    }

    // Rounded horizontal bar path (used by the per-stage scenes).
    function bar(x: number, y: number, w: number, h: number) {
      const ww = Math.max(w, h);
      const r = h / 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + ww, y, x + ww, y + h, r);
      ctx.arcTo(x + ww, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + ww, y, r);
      ctx.closePath();
    }

    // ── Per-stage scenes: drawn in world space, anchored AT the node, scaled
    //    from 0→1 by the stage alpha so they appear to grow out of the node. ──
    function drawAuthorScene(base: Pt, alpha: number) {
      const e = smoothstep(alpha);
      if (e < 0.01) return;
      ctx.save();
      ctx.translate(base.x, base.y);
      ctx.scale(e, e);
      const ox = 12;
      const oy = -32;
      const w = 82;
      const rows = [0.92, 0.6, 0.78, 0.46, 0.66];
      rows.forEach((rw, i) => {
        const reveal = 0.5 + 0.5 * Math.sin(t * 0.07 - i * 0.7);
        bar(ox, oy + i * 9, w * rw * (0.5 + 0.5 * reveal), 3.6);
        ctx.fillStyle = `rgba(${i === 0 ? '120,200,160' : '210,225,218'},${0.35 + reveal * 0.3})`;
        ctx.fill();
      });
      // blinking caret on the last line
      const blink = Math.sin(t * 0.25) > 0 ? 0.9 : 0.15;
      ctx.fillStyle = `rgba(120,200,160,${blink})`;
      ctx.fillRect(ox + w * 0.3, oy + (rows.length - 1) * 9 - 1, 2.4, 7);
      // fragments drifting from the node into the assembling block
      for (let k = 0; k < 6; k++) {
        const u = (t * 0.02 + k / 6) % 1;
        const fx = -10 + (ox + 10) * u;
        const fy = 6 + (oy + (k % rows.length) * 9 - 6) * u;
        ctx.beginPath();
        ctx.arc(fx, fy, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(150,190,170,${0.6 * (1 - u)})`;
        ctx.fill();
      }
      ctx.restore();
    }

    function drawProofScene(base: Pt, alpha: number) {
      const e = smoothstep(alpha);
      if (e < 0.01) return;
      ctx.save();
      ctx.translate(base.x, base.y);
      ctx.scale(e, e);
      const ox = 14;
      const oy = -24;
      const gap = 13;
      const rows = 4;
      const cycle = rows + 1.5;
      const prog = (t * 0.03) % cycle;
      for (let i = 0; i < rows; i++) {
        const y = oy + i * gap;
        const passed = prog > i + 1;
        const justNow = passed && prog < i + 1.7;
        const ring = justNow ? (i + 1.7 - prog) / 0.7 : 0; // 1→0 pulse
        // connector bar
        bar(ox + 9, y - 2.5, 30, 3.5);
        ctx.fillStyle = passed ? 'rgba(93,138,114,0.55)' : 'rgba(210,225,218,0.12)';
        ctx.fill();
        // status dot
        ctx.beginPath();
        ctx.arc(ox, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = passed ? '#5C8A72' : 'rgba(255,255,255,0.14)';
        ctx.fill();
        if (passed) {
          ctx.strokeStyle = 'rgba(255,255,255,0.92)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(ox - 2.6, y);
          ctx.lineTo(ox - 0.6, y + 2.2);
          ctx.lineTo(ox + 3, y - 2.4);
          ctx.stroke();
        }
        if (ring > 0) {
          ctx.beginPath();
          ctx.arc(ox, y, 6 + (1 - ring) * 14, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(93,138,114,${ring * 0.6})`;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    function draw() {
      t += reduce ? 0 : 1;
      smooth.x += (pointer.current.x - smooth.x) * 0.06;
      smooth.y += (pointer.current.y - smooth.y) * 0.06;
      scrollP += (targetScroll() - scrollP) * 0.09;

      ctx.clearRect(0, 0, width, height);

      // Stage region: the visible area left of the login rail (desktop). The arc
      // is built inside it so it never slides under the panel.
      const railW = width >= 768 ? RAIL_W : 0;
      const stageW = Math.max(width * 0.5, width - railW);

      // Static arc (camera focus must not jitter with the cursor).
      const p0: Pt = { x: stageW * 0.12, y: height * 0.76 };
      const p1: Pt = { x: stageW * 0.52, y: height * 0.1 };
      const p2: Pt = { x: stageW * 0.9, y: height * 0.56 };
      const nodes = Array.from({ length: NODE_COUNT }, (_, i) =>
        quad(p0, p1, p2, i / (NODE_COUNT - 1))
      );
      const mid = quad(p0, p1, p2, 0.5);

      // Camera keyframes (fx,fy in viewport fractions; zoom). 1:1 with sections:
      // hero (whole arc) → author → proof → speed (racing finale) → CTA (destination).
      const dest = nodes[NODE_COUNT - 1];
      const KF = [
        { fx: mid.x / width, fy: mid.y / height, zoom: 1.0 },
        { fx: nodes[1].x / width, fy: nodes[1].y / height, zoom: 2.6 },
        { fx: nodes[3].x / width, fy: nodes[3].y / height, zoom: 2.6 },
        { fx: mid.x / width, fy: mid.y / height, zoom: 1.05 },
        { fx: dest.x / width, fy: dest.y / height, zoom: 2.3 },
      ];
      const SEG = KF.length - 1;
      const sp = scrollP * SEG;
      const i = Math.min(SEG - 1, Math.floor(sp));
      const f = smoothstep(sp - i);
      const cam = {
        fx: lerp(KF[i].fx, KF[i + 1].fx, f) + (smooth.x - 0.5) * 0.03,
        fy: lerp(KF[i].fy, KF[i + 1].fy, f) + (smooth.y - 0.5) * 0.03,
        zoom: lerp(KF[i].zoom, KF[i + 1].zoom, f),
      };

      // Per-stage embellishment alphas (1 at their keyframe, fading either side).
      const stageAlpha = (idx: number) => Math.max(0, 1 - Math.abs(sp - idx));
      const aAuthor = stageAlpha(1);
      const aProof = stageAlpha(2);
      const aSpeed = stageAlpha(3);
      const speedBoost = 1 + aSpeed * 4; // data races in the finale

      ctx.save();
      // Centre on the visible stage region (not the full screen), so the arc end
      // stays clear of the login rail at every zoom level.
      ctx.translate(stageW / 2, height / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.fx * width, -cam.fy * height);

      // Arc line.
      ctx.beginPath();
      for (let s = 0; s <= 80; s++) {
        const pt = quad(p0, p1, p2, s / 80);
        if (s === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      const arcGrad = ctx.createLinearGradient(p0.x, 0, p2.x, 0);
      arcGrad.addColorStop(0, 'rgba(255,255,255,0.38)');
      arcGrad.addColorStop(1, 'rgba(93,138,114,0.9)');
      ctx.strokeStyle = arcGrad;
      ctx.lineWidth = 2 / cam.zoom;
      ctx.stroke();

      // Slow "old system" ghost lane (only meaningful in the speed finale).
      if (aSpeed > 0.01) {
        for (let k = 0; k < ghost.length; k++) {
          if (!reduce) ghost[k] = (ghost[k] + 0.0008) % 1;
          const pt = quad(p0, p1, p2, ghost[k]);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y + 7, 1.6 / cam.zoom, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(150,160,155,${0.25 * aSpeed})`;
          ctx.fill();
        }
      }

      // Fast data particles riding the arc — bright from the very start (u≈0) so
      // the flow reads as originating at the arc's start, not mid-way.
      for (let k = 0; k < particles.length; k++) {
        if (!reduce) particles[k] = (particles[k] + 0.0026 * speedBoost) % 1;
        const u = particles[k];
        const pt = quad(p0, p1, p2, u);
        const tw = 0.5 + 0.5 * Math.sin(t * 0.08 + k * 1.7);
        // trailing streak in the speed finale
        if (aSpeed > 0.01) {
          const back = quad(p0, p1, p2, Math.max(0, u - 0.04));
          const g = ctx.createLinearGradient(back.x, back.y, pt.x, pt.y);
          g.addColorStop(0, 'rgba(170,210,190,0)');
          g.addColorStop(1, `rgba(170,210,190,${0.5 * aSpeed})`);
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.4 / cam.zoom;
          ctx.beginPath();
          ctx.moveTo(back.x, back.y);
          ctx.lineTo(pt.x, pt.y);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, (1.5 + 0.7 * tw) / cam.zoom, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(175,210,190,${0.45 + 0.4 * tw})`;
        ctx.fill();
      }

      // Nodes — brighten as the camera reaches them; focused stage glows most.
      // Node 0 is the "source" (green emitter) and the last node the destination.
      const focusU = lerp(i / SEG, (i + 1) / SEG, f); // approx arc position in view
      for (let n = 0; n < NODE_COUNT; n++) {
        const u = n / (NODE_COUNT - 1);
        const pt = nodes[n];
        const last = n === NODE_COUNT - 1;
        const first = n === 0;
        const lit = smoothstep((scrollP - u) * 6 + 0.5);
        const focusGlow = Math.max(0, 1 - Math.abs(u - focusU) * 4);
        const glow = Math.max(lit * 0.7, focusGlow);
        const pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.04 + n);

        // Expanding emission rings at the source node so the flow has an origin.
        if (first && !reduce) {
          const er = (t * 0.018) % 1;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, (5 + er * 18) / cam.zoom, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(150,200,170,${0.4 * (1 - er)})`;
          ctx.lineWidth = 1.2 / cam.zoom;
          ctx.stroke();
        }

        const r = ((last ? 8 : first ? 6 : 4.5) + glow * 4 + (last ? pulse * 3 : pulse)) / cam.zoom;

        const haloR = r * (last ? 5 : first ? 4.4 : 3.8);
        const halo = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, haloR);
        const hc = last || first ? '61,102,80' : '150,190,170';
        halo.addColorStop(0, `rgba(${hc},${(last || first ? 0.45 : 0.25) + glow * 0.4})`);
        halo.addColorStop(1, `rgba(${hc},0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, haloR, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fillStyle = last || first ? '#5C8A72' : `rgba(255,255,255,${0.55 + glow * 0.45})`;
        ctx.fill();
      }

      // ── Per-stage scenes growing out of the focused node ──
      drawAuthorScene(nodes[1], aAuthor); // author → code-lines assembling
      drawProofScene(nodes[3], aProof); // proof → checks passing green

      ctx.restore();
      raf = requestAnimationFrame(draw);
    }
    draw();

    function onMove(e: PointerEvent) {
      const rect = el.getBoundingClientRect();
      pointer.current.x = (e.clientX - rect.left) / rect.width;
      pointer.current.y = (e.clientY - rect.top) / rect.height;
    }
    window.addEventListener('pointermove', onMove);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
