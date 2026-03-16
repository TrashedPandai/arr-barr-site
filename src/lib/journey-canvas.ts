// journey-canvas.ts — Canvas-based journey animation for the nautical section.
// Draws a curved sailing path, golden trail, ship, wake particles, and chapter
// nodes in a single render pass so nothing can desync on resize.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

interface PathPoint extends Point {
  angle: number;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  opacity: number;
  driftX: number;
  driftY: number;
  spawnProgress: number;
  hueShift: number; // slight warm variation
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const GOLD = '#d4a04a';
const HULL_BROWN = '#6b4c12';
const HULL_DARK = '#4a3008';
const SAIL_WHITE = 'rgba(220, 225, 235, 0.15)';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Linearly interpolate between a and b. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp n between lo and hi. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Evaluate a cubic Bezier at t given four control values (1-D). */
function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

// ---------------------------------------------------------------------------
// JourneyCanvas
// ---------------------------------------------------------------------------

export class JourneyCanvas {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Dimensions (CSS pixels)
  private width = 0;
  private height = 0;
  private dpr = 1;
  private isMobile = false;
  private reducedMotion = false;

  // Path data — ~300 sampled points along the cubic spline
  private pathPoints: PathPoint[] = [];
  // Cumulative arc-length at each sample (for uniform-speed interpolation)
  private pathLengths: number[] = [];
  private totalPathLength = 0;

  // Chapter node positions along the path (t values)
  private chapterTs: number[] = [];
  // Raw waypoint positions (CSS px) for node drawing
  private chapterPositions: Point[] = [];

  // Wake particles
  private particles: Particle[] = [];
  private lastSpawnProgress = -1;

  // Current scroll progress
  private progress = 0;

  // -----------------------------------------------------------------------
  // Constructor / Destruction
  // -----------------------------------------------------------------------

  constructor(container: HTMLElement) {
    this.container = container;

    // Detect reduced-motion preference
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '1';
    this.container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;

    // Initial sizing + path computation
    this.measureAndResize();
    this.computePath();
    this.render(this.progress);
  }

  /** Remove the canvas and release references. */
  destroy(): void {
    this.canvas.remove();
    this.particles.length = 0;
    this.pathPoints.length = 0;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Update the scroll progress (0-1) and re-render. */
  setProgress(progress: number): void {
    this.progress = clamp(progress, 0, 1);
    this.render(this.progress);
  }

  /** Recompute everything on window resize. */
  resize(): void {
    this.measureAndResize();
    this.computePath();
    this.render(this.progress);
  }

  // -----------------------------------------------------------------------
  // Canvas Sizing
  // -----------------------------------------------------------------------

  private measureAndResize(): void {
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = window.devicePixelRatio || 1;
    this.isMobile = window.innerWidth < 768;

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // On mobile, canvas sits behind chapter text
    this.canvas.style.zIndex = this.isMobile ? '0' : '1';
  }

  // -----------------------------------------------------------------------
  // Path Computation
  // -----------------------------------------------------------------------

  /**
   * Build a wide, wandering path that meanders across the full container width.
   * The ship explores the page rather than hugging a narrow column.
   * Chapter nodes are still tracked for glow effects but don't constrain the path.
   */
  private computePath(): void {
    const nodes = this.container.querySelectorAll<HTMLElement>('.chapter-node');
    const containerRect = this.container.getBoundingClientRect();

    // Record chapter positions for glow effects
    this.chapterPositions = [];
    nodes.forEach((node) => {
      const r = node.getBoundingClientRect();
      this.chapterPositions.push({
        x: r.left - containerRect.left + r.width / 2,
        y: r.top - containerRect.top + r.height / 2,
      });
    });

    if (this.chapterPositions.length === 0) {
      this.pathPoints = [];
      this.pathLengths = [];
      this.totalPathLength = 0;
      this.chapterTs = [];
      return;
    }

    const h = this.height;
    const w = this.width;

    // Desktop: ship hugs the LEFT side (text is center-right).
    // Mobile: ship hugs the RIGHT side (text is center-left).
    // Gentle undulations like a river — subtle, realistic, pretty.
    // Keep x within a narrow band so the ship never overlaps text.
    const allPoints: Point[] = this.isMobile
      ? [
          // Enter from upper right edge
          { x: w * 0.88, y: -50 },
          // Gentle drift inward
          { x: w * 0.78, y: h * 0.10 },
          // Ease back out
          { x: w * 0.90, y: h * 0.22 },
          // Subtle inward curve
          { x: w * 0.76, y: h * 0.36 },
          // Drift out again
          { x: w * 0.92, y: h * 0.50 },
          // Gentle inward
          { x: w * 0.80, y: h * 0.64 },
          // Ease out
          { x: w * 0.88, y: h * 0.78 },
          // Settle toward shore
          { x: w * 0.82, y: h * 0.92 },
          // Land
          { x: w * 0.85, y: h + 40 },
        ]
      : [
          // Enter from upper left
          { x: w * 0.10, y: -60 },
          // Drift left
          { x: w * 0.05, y: h * 0.08 },
          // Gentle ease right
          { x: w * 0.12, y: h * 0.20 },
          // Drift back left
          { x: w * 0.04, y: h * 0.32 },
          // Gentle rightward curve
          { x: w * 0.11, y: h * 0.44 },
          // Drift left again
          { x: w * 0.03, y: h * 0.56 },
          // Ease right
          { x: w * 0.10, y: h * 0.68 },
          // Drift left
          { x: w * 0.05, y: h * 0.80 },
          // Settle toward shore
          { x: w * 0.08, y: h * 0.92 },
          // Land
          { x: w * 0.06, y: h + 40 },
        ];

    // Sample a smooth spline through waypoints
    this.sampleSpline(allPoints, 400);

    // Compute which t each chapter node is closest to on the path
    this.chapterTs = this.chapterPositions.map((cp) => this.findClosestT(cp));
  }

  /**
   * Convert a set of waypoints into ~sampleCount uniformly-spaced PathPoints
   * using Catmull-Rom spline segments converted to cubic Bezier form, with
   * gentle S-curve amplitude applied perpendicular to the segment direction.
   */
  private sampleSpline(pts: Point[], sampleCount: number): void {
    if (pts.length < 2) {
      this.pathPoints = pts.map((p) => ({ ...p, angle: Math.PI / 2 }));
      this.pathLengths = [0];
      this.totalPathLength = 0;
      return;
    }

    // Raw sampled points before arc-length parameterisation
    const raw: Point[] = [];

    const n = pts.length;
    // For Catmull-Rom we need phantom points at start/end
    const padded: Point[] = [
      { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y },
      ...pts,
      { x: 2 * pts[n - 1].x - pts[n - 2].x, y: 2 * pts[n - 1].y - pts[n - 2].y },
    ];

    // Samples per segment
    const segments = n - 1;
    const samplesPerSeg = Math.ceil(sampleCount / segments);

    for (let i = 0; i < segments; i++) {
      const p0 = padded[i];
      const p1 = padded[i + 1];
      const p2 = padded[i + 2];
      const p3 = padded[i + 3];

      // Catmull-Rom to cubic Bezier control points (alpha = 0.5 standard)
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      const count = i === segments - 1 ? samplesPerSeg + 1 : samplesPerSeg;
      for (let j = 0; j < count; j++) {
        const t = j / samplesPerSeg;
        const x = cubicBezier(p1.x, cp1x, cp2x, p2.x, t);
        const y = cubicBezier(p1.y, cp1y, cp2y, p2.y, t);

        raw.push({ x, y });
      }
    }

    // Compute cumulative arc lengths
    const arcLens: number[] = [0];
    for (let i = 1; i < raw.length; i++) {
      const dx = raw[i].x - raw[i - 1].x;
      const dy = raw[i].y - raw[i - 1].y;
      arcLens.push(arcLens[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    const totalLen = arcLens[arcLens.length - 1];

    // Resample at uniform arc-length intervals
    const resampled: PathPoint[] = [];
    const resampleLens: number[] = [];
    let arcIdx = 0;

    for (let s = 0; s < sampleCount; s++) {
      const targetLen = (s / (sampleCount - 1)) * totalLen;

      // Advance arcIdx
      while (arcIdx < arcLens.length - 2 && arcLens[arcIdx + 1] < targetLen) {
        arcIdx++;
      }

      const segLen = arcLens[arcIdx + 1] - arcLens[arcIdx];
      const localT = segLen > 0 ? (targetLen - arcLens[arcIdx]) / segLen : 0;
      const x = lerp(raw[arcIdx].x, raw[arcIdx + 1].x, localT);
      const y = lerp(raw[arcIdx].y, raw[arcIdx + 1].y, localT);

      // Tangent angle (compute from neighbours)
      resampled.push({ x, y, angle: 0 });
      resampleLens.push(targetLen);
    }

    // Compute tangent angles from finite differences
    for (let i = 0; i < resampled.length; i++) {
      const prev = resampled[Math.max(0, i - 1)];
      const next = resampled[Math.min(resampled.length - 1, i + 1)];
      resampled[i].angle = Math.atan2(next.y - prev.y, next.x - prev.x);
    }

    this.pathPoints = resampled;
    this.pathLengths = resampleLens;
    this.totalPathLength = totalLen;
  }

  /** Find the t (0-1) of the path point closest to `target`. */
  private findClosestT(target: Point): number {
    let bestDist = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < this.pathPoints.length; i++) {
      const dx = this.pathPoints[i].x - target.x;
      const dy = this.pathPoints[i].y - target.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx / (this.pathPoints.length - 1);
  }

  // -----------------------------------------------------------------------
  // Path Interpolation
  // -----------------------------------------------------------------------

  /** Return the position and tangent angle at progress t (0-1). */
  private getPointOnPath(t: number): PathPoint {
    if (this.pathPoints.length === 0) return { x: 0, y: 0, angle: Math.PI / 2 };

    const idx = t * (this.pathPoints.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, this.pathPoints.length - 1);
    const frac = idx - lo;

    const a = this.pathPoints[lo];
    const b = this.pathPoints[hi];

    return {
      x: lerp(a.x, b.x, frac),
      y: lerp(a.y, b.y, frac),
      angle: lerpAngle(a.angle, b.angle, frac),
    };
  }

  // -----------------------------------------------------------------------
  // Drawing — Ship
  // -----------------------------------------------------------------------

  /**
   * Draw a detailed overhead sailing vessel, rotated to match path direction.
   * Hull, deck, two masts with yard arms, four bowed sails, golden glow.
   */
  private drawShip(x: number, y: number, angle: number): void {
    const ctx = this.ctx;
    const scale = this.isMobile ? 0.7 : 1.15;
    const alpha = this.isMobile ? 0.55 : 1;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle - Math.PI / 2); // bow at +Y aligns with path going down
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    // ================================================================
    //  Pirate Ship — top-down / bird's eye view
    //  Ship sprite: bow at +Y (bottom), stern at -Y (top)
    //  Origin (0,0) is center of hull
    // ================================================================

    // -- Water disturbance (subtle rings around hull) --
    ctx.strokeStyle = 'rgba(100, 160, 200, 0.04)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(0, -4, 18, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(100, 160, 200, 0.025)';
    ctx.beginPath();
    ctx.ellipse(0, -8, 16, 5, 0, 0, Math.PI * 2);
    ctx.stroke();

    // -- Hull outer — carved prow, tapered stern --
    ctx.beginPath();
    ctx.moveTo(0, 30);  // bow (sharp point)
    ctx.bezierCurveTo(3, 26, 7, 18, 10, 8);
    ctx.bezierCurveTo(12, 0, 13, -10, 12, -18);
    ctx.bezierCurveTo(11.5, -22, 10, -26, 7, -28);
    ctx.lineTo(-7, -28);
    ctx.bezierCurveTo(-10, -26, -11.5, -22, -12, -18);
    ctx.bezierCurveTo(-13, -10, -12, 0, -10, 8);
    ctx.bezierCurveTo(-7, 18, -3, 26, 0, 30);
    ctx.closePath();
    const hullGrad = ctx.createLinearGradient(-12, 0, 12, 0);
    hullGrad.addColorStop(0, 'rgba(74, 48, 8, 0.7)');
    hullGrad.addColorStop(0.35, 'rgba(122, 85, 24, 0.65)');
    hullGrad.addColorStop(0.65, 'rgba(122, 85, 24, 0.65)');
    hullGrad.addColorStop(1, 'rgba(74, 48, 8, 0.7)');
    ctx.fillStyle = hullGrad;
    ctx.fill();

    // -- Inner deck --
    ctx.beginPath();
    ctx.moveTo(0, 26);
    ctx.bezierCurveTo(2.5, 23, 5.5, 15, 8, 6);
    ctx.bezierCurveTo(9.5, -1, 10, -9, 9.5, -16);
    ctx.bezierCurveTo(9, -20, 8, -23, 5.5, -25);
    ctx.lineTo(-5.5, -25);
    ctx.bezierCurveTo(-8, -23, -9, -20, -9.5, -16);
    ctx.bezierCurveTo(-10, -9, -9.5, -1, -8, 6);
    ctx.bezierCurveTo(-5.5, 15, -2.5, 23, 0, 26);
    ctx.closePath();
    ctx.fillStyle = HULL_DARK;
    ctx.globalAlpha = alpha * 0.45;
    ctx.fill();

    ctx.globalAlpha = alpha;

    // -- Planking lines (horizontal details on hull) --
    ctx.strokeStyle = 'rgba(90, 62, 14, 0.18)';
    ctx.lineWidth = 0.4;
    const plankYs = [-22, -16, -10, -4, 2, 8, 14, 20];
    for (const py of plankYs) {
      // Approximate hull width at this y
      const t = (py + 28) / 58; // 0 at stern, 1 at bow
      const hw = t < 0.5
        ? 6 + t * 12  // widen from stern
        : 12 - (t - 0.5) * 16; // taper to bow
      ctx.beginPath();
      ctx.moveTo(-hw, py);
      ctx.lineTo(hw, py);
      ctx.stroke();
    }

    // -- Keel line (center spine) --
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(0, 27);
    ctx.strokeStyle = 'rgba(120, 85, 25, 0.22)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // -- Stern castle (raised rear) --
    ctx.beginPath();
    ctx.moveTo(-6, -24);
    ctx.quadraticCurveTo(-7, -26, -5.5, -27);
    ctx.lineTo(5.5, -27);
    ctx.quadraticCurveTo(7, -26, 6, -24);
    ctx.closePath();
    ctx.fillStyle = 'rgba(90, 62, 14, 0.35)';
    ctx.fill();

    // -- Bowsprit (forward spar extending from bow) --
    ctx.beginPath();
    ctx.moveTo(0, 26);
    ctx.lineTo(0, 36);
    ctx.strokeStyle = 'rgba(140, 100, 35, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Bowsprit tip ornament
    ctx.beginPath();
    ctx.arc(0, 36, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = GOLD;
    ctx.globalAlpha = alpha * 0.6;
    ctx.fill();
    ctx.globalAlpha = alpha;

    // -- Fore mast (front) --
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(0, 20);
    ctx.strokeStyle = 'rgba(140, 100, 35, 0.4)';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    // -- Main mast (center, tallest) --
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 8);
    ctx.strokeStyle = 'rgba(140, 100, 35, 0.45)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // -- Mizzen mast (rear) --
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(0, -6);
    ctx.strokeStyle = 'rgba(140, 100, 35, 0.35)';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // -- Crow's nest on main mast --
    ctx.beginPath();
    ctx.moveTo(-3, -5);
    ctx.lineTo(-4, -7);
    ctx.lineTo(4, -7);
    ctx.lineTo(3, -5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(100, 72, 20, 0.4)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(140, 100, 35, 0.25)';
    ctx.lineWidth = 0.4;
    ctx.stroke();

    // -- Mast top ornaments --
    const mastTops = [20, 8, -6, -20];
    const mastRadii = [1.0, 1.4, 1.2, 0.9];
    for (let i = 0; i < mastTops.length; i++) {
      ctx.beginPath();
      ctx.arc(0, mastTops[i], mastRadii[i], 0, Math.PI * 2);
      ctx.fillStyle = GOLD;
      ctx.globalAlpha = alpha * (0.4 + i * 0.05);
      ctx.fill();
    }
    ctx.globalAlpha = alpha;

    // -- Jolly Roger flag on main mast top --
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(6, -9);
    ctx.lineTo(6, -5);
    ctx.lineTo(0, -6.5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(30, 30, 30, 0.5)';
    ctx.fill();
    // Tiny skull on flag
    ctx.beginPath();
    ctx.arc(3.5, -7, 0.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220, 220, 220, 0.3)';
    ctx.fill();

    // -- Cannon ports (dark squares along hull) --
    ctx.fillStyle = 'rgba(20, 15, 5, 0.25)';
    const cannonYs = [-14, -6, 2, 10];
    for (const cy of cannonYs) {
      // Port side cannons
      const hw = 8 + ((cy + 28) / 58) * 4; // approximate hull width
      ctx.fillRect(-hw - 0.5, cy - 0.6, 1.2, 1.2);
      // Starboard side cannons
      ctx.fillRect(hw - 0.7, cy - 0.6, 1.2, 1.2);
    }

    // -- Yard arms (horizontal cross-bars on masts) --
    const yards = [
      { y: 16, hw: 14 },  // fore lower
      { y: 12, hw: 16 },  // fore upper
      { y: 4, hw: 20 },   // main lower (longest)
      { y: -1, hw: 18 },  // main upper
      { y: -10, hw: 14 }, // mizzen lower
      { y: -16, hw: 12 }, // mizzen upper
    ];
    for (const yd of yards) {
      ctx.beginPath();
      ctx.moveTo(-yd.hw, yd.y);
      ctx.lineTo(yd.hw, yd.y);
      ctx.strokeStyle = 'rgba(130, 95, 30, 0.25)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    // -- Sails (bowed by wind — port and starboard pairs) --
    const sailPairs = [
      { y1: 12, y2: 16, hw: 14 },  // fore upper sail
      { y1: 16, y2: 20, hw: 12 },  // fore lower sail
      { y1: -1, y2: 4, hw: 18 },   // main upper sail (biggest)
      { y1: 4, y2: 8, hw: 16 },    // main lower sail
      { y1: -16, y2: -10, hw: 12 }, // mizzen upper sail
      { y1: -10, y2: -6, hw: 10 },  // mizzen lower sail
    ];
    for (const sp of sailPairs) {
      const midY = (sp.y1 + sp.y2) / 2;

      // Port sail (left, wind-bowed)
      ctx.beginPath();
      ctx.moveTo(0, sp.y1);
      ctx.lineTo(-sp.hw, sp.y1);
      ctx.quadraticCurveTo(-sp.hw - 3, midY, -sp.hw, sp.y2);
      ctx.lineTo(0, sp.y2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(220, 225, 235, 0.12)';
      ctx.strokeStyle = 'rgba(200, 210, 225, 0.06)';
      ctx.lineWidth = 0.3;
      ctx.fill();
      ctx.stroke();

      // Starboard sail (right, slightly less visible)
      ctx.beginPath();
      ctx.moveTo(0, sp.y1);
      ctx.lineTo(sp.hw, sp.y1);
      ctx.quadraticCurveTo(sp.hw + 2, midY, sp.hw, sp.y2);
      ctx.lineTo(0, sp.y2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(210, 215, 225, 0.08)';
      ctx.strokeStyle = 'rgba(200, 210, 225, 0.04)';
      ctx.fill();
      ctx.stroke();
    }

    // -- Rigging lines (shrouds from mast tops to hull edges) --
    ctx.strokeStyle = 'rgba(160, 130, 60, 0.08)';
    ctx.lineWidth = 0.3;
    const rigging = [
      [0, 20, -8, 22], [0, 20, 8, 22],     // fore shrouds
      [0, 8, -10, 12], [0, 8, 10, 12],      // main shrouds
      [0, -6, -8, -2], [0, -6, 8, -2],      // main upper shrouds
      [0, -20, -6, -16], [0, -20, 6, -16],  // mizzen shrouds
    ];
    for (const [x1, y1, x2, y2] of rigging) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // -- Rudder (trailing behind stern) --
    ctx.beginPath();
    ctx.moveTo(0, -27);
    ctx.lineTo(0, -33);
    ctx.strokeStyle = 'rgba(90, 62, 14, 0.3)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2, -30);
    ctx.lineTo(0, -33);
    ctx.lineTo(2, -30);
    ctx.strokeStyle = 'rgba(90, 62, 14, 0.2)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // -- Stern lantern (golden glow) --
    ctx.beginPath();
    ctx.arc(0, -27, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(212, 160, 74, 0.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -27, 0.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 200, 80, 0.45)';
    ctx.fill();

    // -- Figurehead at bow (golden ornament) --
    ctx.beginPath();
    ctx.moveTo(-1.5, 30);
    ctx.quadraticCurveTo(-2.5, 33, -1, 35);
    ctx.quadraticCurveTo(0, 36, 1, 35);
    ctx.quadraticCurveTo(2.5, 33, 1.5, 30);
    ctx.closePath();
    ctx.fillStyle = 'rgba(212, 160, 74, 0.5)';
    ctx.fill();

    // -- Railing detail along hull edges --
    ctx.strokeStyle = 'rgba(140, 100, 35, 0.12)';
    ctx.lineWidth = 0.4;
    // Port railing
    ctx.beginPath();
    ctx.moveTo(-10, 8);
    ctx.bezierCurveTo(-12, 0, -12, -10, -11, -18);
    ctx.bezierCurveTo(-10.5, -22, -9, -25, -6, -27);
    ctx.stroke();
    // Starboard railing
    ctx.beginPath();
    ctx.moveTo(10, 8);
    ctx.bezierCurveTo(12, 0, 12, -10, 11, -18);
    ctx.bezierCurveTo(10.5, -22, 9, -25, 6, -27);
    ctx.stroke();

    // -- Wake spray behind stern (V-shaped ripples) --
    ctx.globalAlpha = alpha * 0.08;
    ctx.strokeStyle = 'rgba(180, 200, 220, 1)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
      const offset = -33 - i * 5;
      const spread = 4 + i * 3.5;
      ctx.beginPath();
      ctx.moveTo(-spread, offset);
      ctx.quadraticCurveTo(0, offset + 3, spread, offset);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;

    // -- Golden glow halo around ship --
    ctx.shadowColor = 'rgba(212, 160, 74, 0.35)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = GOLD;
    ctx.globalAlpha = alpha * 0.3;
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Drawing — Golden Trail
  // -----------------------------------------------------------------------

  /**
   * Draw the path from 0 to `progress` as a glowing golden line with a
   * gradient that brightens near the ship.
   */
  private drawTrail(progress: number): void {
    if (this.pathPoints.length < 2 || progress <= 0) return;

    const ctx = this.ctx;
    const endIdx = Math.min(
      Math.floor(progress * (this.pathPoints.length - 1)),
      this.pathPoints.length - 1,
    );
    if (endIdx < 1) return;

    const startPt = this.pathPoints[0];
    const endPt = this.pathPoints[endIdx];

    // Create gradient from start to end of trail
    const grad = ctx.createLinearGradient(startPt.x, startPt.y, endPt.x, endPt.y);
    const baseOpacity = this.isMobile ? 0.1 : 0.15;
    const tipOpacity = this.isMobile ? 0.35 : 0.6;
    grad.addColorStop(0, `rgba(212, 160, 74, ${baseOpacity})`);
    grad.addColorStop(1, `rgba(212, 160, 74, ${tipOpacity})`);

    ctx.save();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(212, 160, 74, 0.35)';
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.moveTo(this.pathPoints[0].x, this.pathPoints[0].y);
    for (let i = 1; i <= endIdx; i++) {
      ctx.lineTo(this.pathPoints[i].x, this.pathPoints[i].y);
    }
    ctx.stroke();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Drawing — Dashed Preview Path
  // -----------------------------------------------------------------------

  /** Draw the path ahead of the ship as a faint dashed line. */
  private drawPreviewPath(progress: number): void {
    if (this.pathPoints.length < 2 || progress >= 1) return;

    const ctx = this.ctx;
    const startIdx = Math.max(
      0,
      Math.floor(progress * (this.pathPoints.length - 1)),
    );

    ctx.save();
    ctx.strokeStyle = 'rgba(212, 160, 74, 0.1)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 10]);
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(this.pathPoints[startIdx].x, this.pathPoints[startIdx].y);
    for (let i = startIdx + 1; i < this.pathPoints.length; i++) {
      ctx.lineTo(this.pathPoints[i].x, this.pathPoints[i].y);
    }
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Drawing — Wake Particles
  // -----------------------------------------------------------------------

  /**
   * Maintain a pool of particles that spawn behind the ship and fade as the
   * ship moves away. On backward scroll, particles ahead are removed.
   */
  private updateAndDrawParticles(progress: number): void {
    if (this.reducedMotion) return;

    const maxParticles = this.isMobile ? 30 : 80;
    const ship = this.getPointOnPath(progress);

    // -- Remove particles that are "ahead" of ship (from backward scrolling) --
    this.particles = this.particles.filter((p) => p.spawnProgress <= progress);

    // -- Spawn new particles when ship moves forward --
    const spawnThreshold = 0.002; // spawn every 0.2% of scroll travel
    if (progress > this.lastSpawnProgress + spawnThreshold) {
      const perpAngle = ship.angle + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const spread = 4 + Math.random() * 8;

      this.particles.push({
        x: ship.x + Math.cos(perpAngle) * spread,
        y: ship.y + Math.sin(perpAngle) * spread,
        size: 2 + Math.random() * 3,
        opacity: 0.4,
        driftX: Math.cos(perpAngle) * (0.2 + Math.random() * 0.5),
        driftY: Math.sin(perpAngle) * (0.2 + Math.random() * 0.5),
        spawnProgress: progress,
        hueShift: -10 + Math.random() * 20, // slight warm variation
      });

      this.lastSpawnProgress = progress;
    }

    // -- Enforce pool size (recycle oldest) --
    while (this.particles.length > maxParticles) {
      this.particles.shift();
    }

    // -- Update drift and draw each particle --
    const ctx = this.ctx;
    ctx.save();

    for (const p of this.particles) {
      // Drift outward slightly
      p.x += p.driftX;
      p.y += p.driftY;

      // Fade based on distance from ship in scroll-space
      const scrollDist = progress - p.spawnProgress;
      const alpha = Math.max(0, p.opacity * (1 - scrollDist * 8));
      if (alpha <= 0) continue;

      // Slight warm colour variation via hue shift on the base gold
      const r = clamp(212 + p.hueShift, 180, 240);
      const g = clamp(160 + p.hueShift * 0.5, 130, 190);
      const b = 74;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`;
      ctx.shadowBlur = 6;
      ctx.fill();
    }

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Drawing — Chapter Nodes
  // -----------------------------------------------------------------------

  /** Draw circles at each chapter position: faint if unvisited, golden if passed. */
  private drawNodes(progress: number): void {
    const ctx = this.ctx;

    for (let i = 0; i < this.chapterPositions.length; i++) {
      const pos = this.chapterPositions[i];
      const nodeT = this.chapterTs[i];

      // Proximity factor: 1 when ship is at or past the node, 0 when far ahead
      const proximity = clamp((progress - nodeT + 0.05) / 0.1, 0, 1);

      const radius = 5;

      ctx.save();

      if (proximity >= 1) {
        // -- Passed: golden glowing circle --
        // Pulse glow
        const pulse = 0.3 + 0.2 * Math.sin(Date.now() * 0.003 + i);
        ctx.shadowColor = `rgba(212, 160, 74, ${0.5 * pulse + 0.3})`;
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = GOLD;
        ctx.globalAlpha = 1;
        ctx.fill();
      } else if (proximity <= 0) {
        // -- Not yet reached: faint circle --
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200, 200, 200, 0.1)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        // -- Transitioning: lerp between faint and golden --
        const faintFill = [200, 200, 200];
        const goldFill = [212, 160, 74];
        const r = lerp(faintFill[0], goldFill[0], proximity);
        const g = lerp(faintFill[1], goldFill[1], proximity);
        const b = lerp(faintFill[2], goldFill[2], proximity);
        const fillAlpha = lerp(0.1, 1, proximity);

        ctx.shadowColor = `rgba(212, 160, 74, ${0.5 * proximity})`;
        ctx.shadowBlur = 12 * proximity;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${fillAlpha})`;
        ctx.fill();

        const strokeAlpha = lerp(0.25, 0, proximity);
        if (strokeAlpha > 0.01) {
          ctx.strokeStyle = `rgba(200, 200, 200, ${strokeAlpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // -----------------------------------------------------------------------
  // Render Loop
  // -----------------------------------------------------------------------

  /**
   * Single-pass render: clear, draw preview path, trail, particles, nodes, ship.
   * Because everything draws on one canvas in one frame, desync is impossible.
   */
  private render(progress: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (this.pathPoints.length < 2) return;

    // Reduced motion: static path only
    if (this.reducedMotion) {
      this.drawPreviewPath(0);
      return;
    }

    // 1. Dashed preview path (faint, ahead of ship)
    this.drawPreviewPath(progress);

    // 2. Golden trail (bright, behind ship)
    this.drawTrail(progress);

    // 3. Ship
    const pos = this.getPointOnPath(progress);
    this.drawShip(pos.x, pos.y, pos.angle);
  }
}

// ---------------------------------------------------------------------------
// Angle Interpolation Helper
// ---------------------------------------------------------------------------

/** Lerp between two angles, choosing the shortest arc. */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  // Normalize to [-PI, PI]
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export default JourneyCanvas;
