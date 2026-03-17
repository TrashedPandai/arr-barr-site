// crew-network.ts — Canvas particle network for the crew visualization.
// Draws breathing bezier curves between service nodes with organic data
// streams that flow like blood through veins of a neural network.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

interface Connection {
  from: string;
  to: string;
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
  length: number;
  color: string;
  // Per-connection animation phase offset for organic feel
  phase: number;
}

interface StreamParticle {
  conn: Connection;
  t: number;
  speed: number;
  size: number;
  opacity: number;
  trail: Point[];
}

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  decay: number;
  color: string;
}

interface TraceParticle {
  conn: Connection;
  t: number;
  speed: number;
  size: number;
  brightness: number;
  color: string;
}

interface NodeRect {
  id: string;
  cx: number;
  cy: number;
  width: number;
  height: number;
  color: string;
}

type TraceCallback = (stepIndex: number) => void;

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

const STAGE_COLORS: Record<string, string> = {
  request: '#c084fc',
  automation: '#22d3ee',
  search: '#fbbf24',
  downloads: '#4ade80',
  library: '#fb923c',
  streaming: '#818cf8',
};

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbString(r: number, g: number, b: number, a = 1): string {
  return `rgba(${r},${g},${b},${a})`;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function bezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const uu = u * u;
  const uuu = uu * u;
  const tt = t * t;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

function bezierLength(p0: Point, p1: Point, p2: Point, p3: Point, samples = 40): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= samples; i++) {
    const pt = bezierPoint(p0, p1, p2, p3, i / samples);
    const dx = pt.x - prev.x;
    const dy = pt.y - prev.y;
    len += Math.sqrt(dx * dx + dy * dy);
    prev = pt;
  }
  return len;
}

// ---------------------------------------------------------------------------
// Connection topology
// ---------------------------------------------------------------------------

// Flow: Downloads → Media Library (organized folders) → Consumption apps
// Arr apps no longer link directly to streaming — files go through the library.
const SERVICE_CONNECTIONS: Array<{ from: string; to: string }> = [
  { from: 'jellyseerr', to: 'radarr' },
  { from: 'jellyseerr', to: 'sonarr' },
  { from: 'paperseerr', to: 'lazylibrarian' },
  { from: 'radarr', to: 'prowlarr' },
  { from: 'sonarr', to: 'prowlarr' },
  { from: 'lidarr', to: 'prowlarr' },
  { from: 'lazylibrarian', to: 'prowlarr' },
  { from: 'radarr', to: 'gluetun' },
  { from: 'sonarr', to: 'gluetun' },
  { from: 'lidarr', to: 'gluetun' },
  { from: 'lazylibrarian', to: 'gluetun' },
  { from: 'prowlarr', to: 'gluetun' },
  { from: 'gluetun', to: 'transmission' },
  { from: 'gluetun', to: 'sabnzbd' },
  { from: 'gluetun', to: 'media-library' },
  { from: 'media-library', to: 'jellyfin' },
  { from: 'media-library', to: 'kavita' },
  { from: 'media-library', to: 'audiobookshelf' },
  { from: 'bazarr', to: 'radarr' },
  { from: 'bazarr', to: 'sonarr' },
];

const SERVICE_STAGE: Record<string, string> = {
  jellyseerr: 'request',
  paperseerr: 'request',
  radarr: 'automation',
  sonarr: 'automation',
  lidarr: 'automation',
  lazylibrarian: 'automation',
  bazarr: 'automation',
  prowlarr: 'search',
  transmission: 'downloads',
  sabnzbd: 'downloads',
  gluetun: 'downloads',
  'media-library': 'library',
  jellyfin: 'streaming',
  kavita: 'streaming',
  audiobookshelf: 'streaming',
};

// ---------------------------------------------------------------------------
// CrewNetwork
// ---------------------------------------------------------------------------

export class CrewNetwork {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private width = 0;
  private height = 0;
  private dpr = 1;
  private isMobile = false;
  private reducedMotion = false;

  private nodeRects: Map<string, NodeRect> = new Map();
  private connections: Connection[] = [];

  private streamParticles: StreamParticle[] = [];
  private burstParticles: BurstParticle[] = [];
  private traceParticles: TraceParticle[] = [];

  private animFrame = 0;
  private running = false;
  private traceActive = false;
  private traceCallback: TraceCallback | null = null;
  private highlightedNode: string | null = null;
  private time = 0;
  private resizeObserver: ResizeObserver | null = null;
  private ready = false;
  private onReadyCallback: (() => void) | null = null;

  constructor(container: HTMLElement, onReady?: () => void) {
    this.container = container;
    this.onReadyCallback = onReady || null;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '2';
    this.container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;

    this.measure();
    this.computeConnections();
    this.seedAmbientParticles();

    if (!this.reducedMotion) {
      this.running = true;
      this.tick();
    } else {
      this.renderStatic();
      this.signalReady();
    }

    let resizeTimer = 0;
    this.resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        this.measure();
        this.computeConnections();
        // Clear ALL particles — old ones reference stale connection objects
        this.streamParticles.length = 0;
        this.burstParticles.length = 0;
        this.traceParticles.length = 0;
        this.seedAmbientParticles();
      }, 150);
    });
    this.resizeObserver.observe(this.container);
  }

  destroy(): void {
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.canvas.remove();
    this.streamParticles.length = 0;
    this.burstParticles.length = 0;
    this.traceParticles.length = 0;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  highlightNode(nodeId: string | null): void {
    this.highlightedNode = nodeId;
    if (nodeId) this.burstFrom(nodeId);
  }

  burstFrom(nodeId: string): void {
    const node = this.nodeRects.get(nodeId);
    if (!node) return;
    const stage = SERVICE_STAGE[nodeId] || 'automation';
    const color = STAGE_COLORS[stage] || '#818cf8';
    const [r, g, b] = hexToRgb(color);

    // Fewer, more deliberate burst particles (was 18, now 10)
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10 + (Math.random() - 0.5) * 0.4;
      const speed = 1 + Math.random() * 2;
      this.burstParticles.push({
        x: node.cx,
        y: node.cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.5 + Math.random() * 2,
        opacity: 0.7 + Math.random() * 0.3,
        decay: 0.018 + Math.random() * 0.012,
        color: rgbString(r, g, b),
      });
    }

    // Send 1 particle along each outgoing connection (was 3)
    const outgoing = this.connections.filter((c) => c.from === nodeId);
    for (const conn of outgoing) {
      this.spawnStreamParticle(conn, 0.006 + Math.random() * 0.003);
    }
  }

  traceRequest(steps: string[], onStep?: TraceCallback): Promise<void> {
    return new Promise((resolve) => {
      if (this.traceActive) { resolve(); return; }
      this.traceActive = true;
      this.traceCallback = onStep || null;

      const traceConns: Connection[] = [];
      for (let i = 0; i < steps.length - 1; i++) {
        const conn = this.connections.find(
          (c) => c.from === steps[i] && c.to === steps[i + 1]
        );
        if (conn) traceConns.push(conn);
      }

      if (traceConns.length === 0) {
        this.traceActive = false;
        resolve();
        return;
      }

      this.burstFrom(steps[0]);
      if (this.traceCallback) this.traceCallback(0);

      let currentIdx = 0;
      const advanceTrace = () => {
        if (currentIdx >= traceConns.length) {
          this.burstFrom(steps[steps.length - 1]);
          this.traceActive = false;
          resolve();
          return;
        }

        const conn = traceConns[currentIdx];
        const stage = SERVICE_STAGE[conn.from] || 'automation';
        const color = STAGE_COLORS[stage] || '#818cf8';

        // 3 trace particles (was 5) — more deliberate
        for (let i = 0; i < 3; i++) {
          this.traceParticles.push({
            conn,
            t: -i * 0.08,
            speed: 0.010 + Math.random() * 0.002,
            size: 4 + Math.random() * 2,
            brightness: 1,
            color,
          });
        }

        const checkInterval = setInterval(() => {
          const remaining = this.traceParticles.filter((tp) => tp.conn === conn);
          if (remaining.length === 0) {
            clearInterval(checkInterval);
            currentIdx++;
            this.burstFrom(conn.to);
            if (this.traceCallback) this.traceCallback(currentIdx);
            setTimeout(advanceTrace, 300);
          }
        }, 50);
      };

      advanceTrace();
    });
  }

  recompute(): void {
    this.measure();
    this.computeConnections();
    this.streamParticles.length = 0;
    this.burstParticles.length = 0;
    this.seedAmbientParticles();
  }

  /** Flash a node briefly — burst + un-dim, then re-dim after duration */
  flashNode(nodeId: string, durationMs = 800): void {
    this.burstFrom(nodeId);
    // The visual flash is handled by CSS classes in the component;
    // canvas just fires the burst particles.
  }

  /** Trace a SINGLE connection — returns promise that resolves on arrival */
  traceConnection(fromId: string, toId: string): Promise<void> {
    return new Promise((resolve) => {
      const conn = this.connections.find(
        (c) => c.from === fromId && c.to === toId
      );
      if (!conn) { resolve(); return; }

      const stage = SERVICE_STAGE[fromId] || 'automation';
      const color = STAGE_COLORS[stage] || '#818cf8';

      // Controlled speed — consistent, not too fast, not sluggish
      for (let i = 0; i < 3; i++) {
        this.traceParticles.push({
          conn,
          t: -i * 0.06,
          speed: 0.008,
          size: 3.5 + Math.random() * 1.5,
          brightness: 1,
          color,
        });
      }

      const checkInterval = setInterval(() => {
        const remaining = this.traceParticles.filter((tp) => tp.conn === conn);
        if (remaining.length === 0) {
          clearInterval(checkInterval);
          this.burstFrom(toId);
          resolve();
        }
      }, 50);
    });
  }

  // -----------------------------------------------------------------------
  // Canvas Sizing
  // -----------------------------------------------------------------------

  private measure(): void {
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.isMobile = window.innerWidth < 768;

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.nodeRects.clear();
    const containerRect = this.container.getBoundingClientRect();
    const nodes = this.container.querySelectorAll<HTMLElement>('[data-node-id]');
    nodes.forEach((el) => {
      const id = el.dataset.nodeId!;
      const r = el.getBoundingClientRect();
      const stage = SERVICE_STAGE[id] || 'automation';
      this.nodeRects.set(id, {
        id,
        cx: r.left - containerRect.left + r.width / 2,
        cy: r.top - containerRect.top + r.height / 2,
        width: r.width,
        height: r.height,
        color: STAGE_COLORS[stage] || '#818cf8',
      });
    });
  }

  // -----------------------------------------------------------------------
  // Connection Computation
  // -----------------------------------------------------------------------

  // Force specific connections to curve a certain direction:
  //  1 = default normal direction, -1 = flipped
  // 'paperseerr→lazylibrarian' must bow RIGHT to avoid crossing over Sonarr
  private static CURVE_OVERRIDES: Record<string, number> = {
    'paperseerr→lazylibrarian': -1,
  };

  private computeConnections(): void {
    this.connections = [];
    let idx = 0;

    for (const { from, to } of SERVICE_CONNECTIONS) {
      const fromNode = this.nodeRects.get(from);
      const toNode = this.nodeRects.get(to);
      if (!fromNode || !toNode) continue;

      const p0: Point = { x: fromNode.cx, y: fromNode.cy };
      const p3: Point = { x: toNode.cx, y: toNode.cy };

      const dx = p3.x - p0.x;
      const dy = p3.y - p0.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const curvature = Math.min(d * 0.35, 120);

      const overrideKey = `${from}→${to}`;
      const hash = overrideKey in CrewNetwork.CURVE_OVERRIDES
        ? CrewNetwork.CURVE_OVERRIDES[overrideKey]
        : (from.charCodeAt(0) + to.charCodeAt(0)) % 2 === 0 ? 1 : -1;
      const nx = -dy / (d || 1);
      const ny = dx / (d || 1);

      const p1: Point = {
        x: lerp(p0.x, p3.x, 0.3) + nx * curvature * hash * 0.5,
        y: lerp(p0.y, p3.y, 0.3) + ny * curvature * hash * 0.5,
      };
      const p2: Point = {
        x: lerp(p0.x, p3.x, 0.7) - nx * curvature * hash * 0.3,
        y: lerp(p0.y, p3.y, 0.7) - ny * curvature * hash * 0.3,
      };

      const stage = SERVICE_STAGE[from] || 'automation';
      const color = STAGE_COLORS[stage] || '#818cf8';
      const length = bezierLength(p0, p1, p2, p3);

      // Each connection gets a unique phase offset for breathing
      const phase = (idx * 1.7) + from.charCodeAt(2) * 0.3;
      idx++;

      this.connections.push({ from, to, p0, p1, p2, p3, length, color, phase });
    }
  }

  // -----------------------------------------------------------------------
  // Particle Management
  // -----------------------------------------------------------------------

  private seedAmbientParticles(): void {
    // Only 1 ambient particle per connection — calm, purposeful
    for (const conn of this.connections) {
      this.spawnStreamParticle(conn, 0.0015 + Math.random() * 0.001);
    }
  }

  private spawnStreamParticle(conn: Connection, speed: number): void {
    this.streamParticles.push({
      conn,
      t: Math.random(),
      speed,
      size: 1.2 + Math.random() * 1,
      opacity: 0.25 + Math.random() * 0.3,
      trail: [],
    });
  }

  // -----------------------------------------------------------------------
  // Animation Loop
  // -----------------------------------------------------------------------

  private signalReady(): void {
    if (!this.ready) {
      this.ready = true;
      if (this.onReadyCallback) this.onReadyCallback();
    }
  }

  private tick = (): void => {
    if (!this.running) return;
    this.time += 0.016;
    this.update();
    this.render();
    this.signalReady();
    this.animFrame = requestAnimationFrame(this.tick);
  };

  private update(): void {
    // Update stream particles — slower, calmer
    for (let i = this.streamParticles.length - 1; i >= 0; i--) {
      const p = this.streamParticles[i];
      p.t += p.speed;

      if (p.t >= 0 && p.t <= 1) {
        const pos = bezierPoint(p.conn.p0, p.conn.p1, p.conn.p2, p.conn.p3, p.t);
        p.trail.push(pos);
        if (p.trail.length > 6) p.trail.shift();
      }

      if (p.t > 1) {
        p.t -= 1;
        p.trail = [];
      }
    }

    // Update burst particles
    for (let i = this.burstParticles.length - 1; i >= 0; i--) {
      const p = this.burstParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.opacity -= p.decay;
      p.size *= 0.97;
      if (p.opacity <= 0) this.burstParticles.splice(i, 1);
    }

    // Update trace particles
    for (let i = this.traceParticles.length - 1; i >= 0; i--) {
      const p = this.traceParticles[i];
      p.t += p.speed;
      if (p.t > 1.1) this.traceParticles.splice(i, 1);
    }

    // Maintain exactly 1 ambient particle per connection
    for (const conn of this.connections) {
      const count = this.streamParticles.filter((p) => p.conn === conn).length;
      if (count < 1) {
        this.spawnStreamParticle(conn, 0.0015 + Math.random() * 0.001);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawConnections(ctx);
    this.drawStreamParticles(ctx);
    this.drawBurstParticles(ctx);
    this.drawTraceParticles(ctx);
    this.drawNodeGlows(ctx);
  }

  private renderStatic(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawConnections(ctx);
    this.drawNodeGlows(ctx);
  }

  /**
   * Draw connections as BREATHING lines — width and opacity pulse
   * with sine waves at different phases per connection, creating
   * an organic "blood flow" feeling through the network veins.
   */
  private drawConnections(ctx: CanvasRenderingContext2D): void {
    for (const conn of this.connections) {
      const isHighlighted =
        this.highlightedNode === conn.from || this.highlightedNode === conn.to;
      const isDimmed =
        this.highlightedNode !== null && !isHighlighted;

      const [r, g, b] = hexToRgb(conn.color);

      // Breathing pulse — each connection breathes at its own rate
      const breathe = Math.sin(this.time * 0.8 + conn.phase) * 0.5 + 0.5; // 0–1
      const breathe2 = Math.sin(this.time * 1.2 + conn.phase * 1.3) * 0.5 + 0.5;

      if (isDimmed) {
        // Dimmed: thin static line
        ctx.beginPath();
        ctx.moveTo(conn.p0.x, conn.p0.y);
        ctx.bezierCurveTo(conn.p1.x, conn.p1.y, conn.p2.x, conn.p2.y, conn.p3.x, conn.p3.y);
        ctx.strokeStyle = rgbString(r, g, b, 0.03);
        ctx.lineWidth = 0.5;
        ctx.stroke();
        continue;
      }

      // Base alpha pulses with breathing — all connections feel alive
      // Scale down on mobile for less visual noise
      const mob = this.isMobile ? 0.7 : 1;
      const baseAlpha = isHighlighted
        ? lerp(0.18, 0.38, breathe) * mob
        : lerp(0.10, 0.22, breathe) * mob;

      // Line width breathes too — veins expand and contract
      const baseWidth = (isHighlighted
        ? lerp(1.4, 2.8, breathe)
        : lerp(0.8, 1.8, breathe2)) * mob;

      // Draw the breathing vein
      ctx.beginPath();
      ctx.moveTo(conn.p0.x, conn.p0.y);
      ctx.bezierCurveTo(conn.p1.x, conn.p1.y, conn.p2.x, conn.p2.y, conn.p3.x, conn.p3.y);
      ctx.strokeStyle = rgbString(r, g, b, baseAlpha);
      ctx.lineWidth = baseWidth;
      ctx.stroke();

      // Flowing gradient overlay — a brighter band that crawls along
      // the connection, simulating data moving through the vein
      if (!isDimmed) {
        const flowT = (this.time * 0.15 + conn.phase * 0.5) % 1;
        const samples = this.isMobile ? 12 : 20;
        for (let s = 0; s < samples; s++) {
          const t1 = s / samples;
          const t2 = (s + 1) / samples;
          const pt1 = bezierPoint(conn.p0, conn.p1, conn.p2, conn.p3, t1);
          const pt2 = bezierPoint(conn.p0, conn.p1, conn.p2, conn.p3, t2);

          // Distance from the flowing highlight band
          const dist1 = Math.abs(t1 - flowT);
          const wrap1 = Math.min(dist1, 1 - dist1); // wrap around
          const glow = Math.max(0, 1 - wrap1 * 5); // ~20% of the path lit up

          if (glow > 0.01) {
            const segAlpha = glow * (isHighlighted ? 0.25 : 0.15) * breathe;
            const segWidth = baseWidth + glow * (isHighlighted ? 3.5 : 2.5);
            ctx.beginPath();
            ctx.moveTo(pt1.x, pt1.y);
            ctx.lineTo(pt2.x, pt2.y);
            ctx.strokeStyle = rgbString(
              Math.min(255, r + 30),
              Math.min(255, g + 30),
              Math.min(255, b + 30),
              segAlpha
            );
            ctx.lineWidth = segWidth;
            ctx.lineCap = 'round';
            ctx.stroke();
          }
        }
      }

      // Soft glow on all connections — stronger when highlighted, lighter on mobile
      ctx.save();
      ctx.shadowBlur = (isHighlighted ? 15 : 8) * breathe * mob;
      ctx.shadowColor = rgbString(r, g, b, (isHighlighted ? 0.3 : 0.15) * breathe * mob);
      ctx.beginPath();
      ctx.moveTo(conn.p0.x, conn.p0.y);
      ctx.bezierCurveTo(conn.p1.x, conn.p1.y, conn.p2.x, conn.p2.y, conn.p3.x, conn.p3.y);
      ctx.strokeStyle = rgbString(r, g, b, (isHighlighted ? 0.1 : 0.06) * breathe * mob);
      ctx.lineWidth = (isHighlighted ? 4 : 2.5) * mob;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawStreamParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.streamParticles) {
      if (p.t < 0 || p.t > 1) continue;

      const isDimmed =
        this.highlightedNode !== null &&
        this.highlightedNode !== p.conn.from &&
        this.highlightedNode !== p.conn.to;

      if (isDimmed) continue;

      const pos = bezierPoint(p.conn.p0, p.conn.p1, p.conn.p2, p.conn.p3, p.t);
      const [r, g, b] = hexToRgb(p.conn.color);

      // Subtle comet trail
      if (p.trail.length > 1) {
        for (let i = 0; i < p.trail.length - 1; i++) {
          const alpha = (i / p.trail.length) * p.opacity * 0.3;
          const trailSize = p.size * (i / p.trail.length) * 0.5;
          ctx.beginPath();
          ctx.arc(p.trail[i].x, p.trail[i].y, trailSize, 0, Math.PI * 2);
          ctx.fillStyle = rgbString(r, g, b, alpha);
          ctx.fill();
        }
      }

      // Main particle — softer glow
      ctx.save();
      ctx.shadowBlur = 6;
      ctx.shadowColor = rgbString(r, g, b, p.opacity * 0.4);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = rgbString(
        Math.min(255, r + 40),
        Math.min(255, g + 40),
        Math.min(255, b + 40),
        p.opacity
      );
      ctx.fill();
      ctx.restore();
    }
  }

  private drawBurstParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.burstParticles) {
      const [r, g, b] = hexToRgb(p.color);
      ctx.save();
      ctx.shadowBlur = 8;
      ctx.shadowColor = rgbString(r, g, b, p.opacity * 0.4);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = rgbString(
        Math.min(255, r + 60),
        Math.min(255, g + 60),
        Math.min(255, b + 60),
        p.opacity
      );
      ctx.fill();
      ctx.restore();
    }
  }

  private drawTraceParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.traceParticles) {
      const t = clamp(p.t, 0, 1);
      const pos = bezierPoint(p.conn.p0, p.conn.p1, p.conn.p2, p.conn.p3, t);
      const [r, g, b] = hexToRgb(p.color);

      ctx.save();
      ctx.shadowBlur = 25;
      ctx.shadowColor = rgbString(r, g, b, 0.8);

      // Outer glow
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.size * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = rgbString(r, g, b, 0.12);
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = rgbString(
        Math.min(255, r + 80),
        Math.min(255, g + 80),
        Math.min(255, b + 80),
        0.95
      );
      ctx.fill();

      // White-hot center
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.size * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();

      ctx.restore();
    }
  }

  private drawNodeGlows(ctx: CanvasRenderingContext2D): void {
    for (const [id, node] of this.nodeRects) {
      const isHighlighted = this.highlightedNode === id;
      const isConnected =
        this.highlightedNode !== null &&
        this.connections.some(
          (c) =>
            (c.from === this.highlightedNode && c.to === id) ||
            (c.to === this.highlightedNode && c.from === id)
        );

      if (!isHighlighted && !isConnected && this.highlightedNode !== null) continue;

      const [r, g, b] = hexToRgb(node.color);
      const pulse = Math.sin(this.time * 1.5 + id.charCodeAt(0) * 0.7) * 0.1 + 0.9;
      const glowAlpha = isHighlighted ? 0.25 * pulse : 0.06 * pulse;
      const glowSize = isHighlighted ? 25 : 12;

      const grad = ctx.createRadialGradient(
        node.cx, node.cy, 0,
        node.cx, node.cy, node.width * 0.5 + glowSize
      );
      grad.addColorStop(0, rgbString(r, g, b, glowAlpha));
      grad.addColorStop(1, rgbString(r, g, b, 0));

      ctx.beginPath();
      ctx.arc(node.cx, node.cy, node.width * 0.5 + glowSize, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }
}
