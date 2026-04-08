/* ============================================================
   DiskSim – script.js
   HDD Scheduling Simulator – Algorithms + UI + Canvas Animation
   ============================================================ */

'use strict';

// ── DOM refs ──────────────────────────────────────────────────
const requestQueueInput = document.getElementById('request-queue');
const headPositionInput = document.getElementById('head-position');
const diskSizeInput = document.getElementById('disk-size');
const algorithmSelect = document.getElementById('algorithm-select');
const speedSlider = document.getElementById('speed-slider');
const runBtn = document.getElementById('run-btn');
const resetBtn = document.getElementById('reset-btn');
const errorBox = document.getElementById('error-box');
const diskSizeGroup = document.getElementById('disk-size-group');
const directionGroup = document.getElementById('direction-group');
const algoInfoBody = document.getElementById('algo-info-body');
const canvasPlaceholder = document.getElementById('canvas-placeholder');
const simStatus = document.getElementById('sim-status');
const movementTicker = document.getElementById('movement-ticker');
const tickerText = document.getElementById('ticker-text');
const seekLive = document.getElementById('seek-live');
const resultsPanel = document.getElementById('results-panel');
const resAlgoName = document.getElementById('res-algo-name');
const resSeekTime = document.getElementById('res-seek-time');
const resReqCount = document.getElementById('res-req-count');
const execSequence = document.getElementById('exec-sequence');
const comparisonTbody = document.getElementById('comparison-tbody');
const canvas = document.getElementById('disk-canvas');
const ctx = canvas.getContext('2d');
const highlightCanvas = document.getElementById('highlight-canvas');
const hCtx = highlightCanvas.getContext('2d');
const tooltipEl = document.getElementById('graph-tooltip');

// ── State ─────────────────────────────────────────────────────
let comparisonData = {};   // { fcfs: {name, seek}, sstf: {...}, ... }
let animationRunning = false;
let drawnPoints = [];   // [{x, y, cylinder, step, fromCyl, toCyl}]
let hitArea = null; // dynamic div for mouse/touch

// ── Algorithm Metadata ────────────────────────────────────────
const ALGO_INFO = {
  fcfs: {
    label: 'First Come First Served (FCFS)',
    subtitle: 'Simplest scheduling policy — no reordering of requests.',
    description: `FCFS services disk requests strictly in the order they arrive in the queue. The disk head moves to each cylinder in the sequence requested, without any optimization for proximity. While conceptually straightforward and fair, FCFS can result in substantial head movement when requests are scattered across the disk.`,
    advantages: [
      'Simple to understand and implement',
      'Every request is honored in arrival order — fully fair',
      'No starvation of any request',
    ],
    limitations: [
      'No optimization of seek time — potentially very high total seek cost',
      'Poor performance under heavy or random workloads',
      'Does not exploit disk locality',
    ],
  },
  sstf: {
    label: 'Shortest Seek Time First (SSTF)',
    subtitle: 'Greedy approach — always serve the closest request.',
    description: `SSTF selects the pending request whose cylinder position is closest to the current head location at each step. This greedy strategy minimizes seek time at each individual step, and generally yields a much lower total seek cost than FCFS. However, it can lead to starvation of distant requests when new closer requests continuously arrive.`,
    advantages: [
      'Significantly lower average seek time than FCFS',
      'Exploits disk locality effectively',
      'Good throughput under moderate load',
    ],
    limitations: [
      'Risk of starvation for requests far from the current head position',
      'Not truly optimal — greedy local choices may not minimize global seek cost',
      'Can cause unpredictable response times',
    ],
  },
  scan: {
    label: 'SCAN (Elevator Algorithm)',
    subtitle: 'Sweeps across the disk like an elevator, reversing at the boundary.',
    description: `SCAN moves the disk head in one direction, servicing all requests it encounters until it reaches the end of the disk (or the last request in that direction), then reverses direction and repeats. Its behavior mirrors that of an elevator in a building. Requests at mid-range positions receive good service, while those at the extremes may wait longer.`,
    advantages: [
      'Low variance in wait time compared to FCFS and SSTF',
      'No starvation — every cylinder is eventually reached',
      'Better throughput than FCFS under heavy load',
    ],
    limitations: [
      'Requests just behind the head direction must wait for a full sweep',
      'Cylinders at the midpoint receive somewhat preferential service',
      'Requires knowledge of disk size for boundary reversal',
    ],
  },
  cscan: {
    label: 'C-SCAN (Circular SCAN)',
    subtitle: 'Uni-directional sweep with wrap-around for uniform wait times.',
    description: `C-SCAN is a variant of SCAN that services requests only in one direction (typically ascending). After reaching the last cylinder, the head jumps back to the beginning of the disk without servicing any requests on the return trip, then resumes scanning. This provides a more uniform waiting time distribution than standard SCAN.`,
    advantages: [
      'More uniform wait time across all cylinder positions',
      'Prevents preferential treatment of mid-disk regions',
      'Predictable and consistent behavior',
    ],
    limitations: [
      'Return trip from end to start is wasted (no servicing during jump-back)',
      'Total seek distance can be higher than SCAN due to wrap-around',
      'Requires knowledge of disk size boundaries',
    ],
  },
  look: {
    label: 'LOOK',
    subtitle: 'Like SCAN, but reverses at the last actual request, not the disk boundary.',
    description: `LOOK is an optimization of SCAN that reverses direction at the furthest pending request rather than traveling all the way to the physical disk boundary. This avoids unnecessary traversal of unoccupied cylinders at the edges, making it more efficient than SCAN in practice. It is one of the most commonly used algorithms in operating systems today.`,
    advantages: [
      'Avoids unnecessary travel to disk boundaries — more efficient than SCAN',
      'Low average seek time with good fairness guarantees',
      'No starvation; all requests are eventually serviced',
    ],
    limitations: [
      'Slightly more complex to implement than SCAN',
      'Like SCAN, requests just behind the head still wait for a full sweep',
      'Performance depends on incoming request distribution',
    ],
  },
};

// ── Algorithm Info Panel ──────────────────────────────────────
function renderAlgoInfo(algoKey) {
  const info = ALGO_INFO[algoKey];
  if (!info) return;

  const adv = info.advantages.map(a => `<li>${a}</li>`).join('');
  const lim = info.limitations.map(l => `<li>${l}</li>`).join('');

  algoInfoBody.innerHTML = `
    <div class="algo-info-title">${info.label}</div>
    <div class="algo-info-subtitle">${info.subtitle}</div>
    <div class="algo-info-desc">${info.description}</div>
    <div class="info-section">
      <div class="info-section-title">Advantages</div>
      <ul class="info-list advantages">${adv}</ul>
    </div>
    <div class="info-section">
      <div class="info-section-title">Limitations</div>
      <ul class="info-list limitations">${lim}</ul>
    </div>
  `;
}

// ── Dynamic UI Visibility ─────────────────────────────────────
function updateUIVisibility(algoKey) {
  const showDiskSize = ['scan', 'cscan'].includes(algoKey);
  const showDirection = ['scan', 'cscan', 'look'].includes(algoKey);

  diskSizeGroup.classList.toggle('hidden', !showDiskSize);
  directionGroup.classList.toggle('hidden', !showDirection);
}

// ── Input Validation ──────────────────────────────────────────
function parseInputs() {
  const rawQueue = requestQueueInput.value.trim();
  const rawHead = headPositionInput.value.trim();
  const rawDiskSize = diskSizeInput.value.trim();
  const algo = algorithmSelect.value;
  const direction = document.querySelector('input[name="direction"]:checked').value;

  if (!rawQueue) throw new Error('Request queue cannot be empty.');
  if (!rawHead) throw new Error('Initial head position is required.');

  const requests = rawQueue.split(/[,\s]+/).filter(s => s.length > 0).map(s => {
    const n = parseInt(s.trim(), 10);
    if (isNaN(n)) throw new Error(`Invalid value in request queue: "${s.trim()}"`);
    return n;
  });

  const head = parseInt(rawHead, 10);
  if (isNaN(head) || head < 0) throw new Error('Head position must be a non-negative integer.');

  const needsDiskSize = ['scan', 'cscan'].includes(algo);
  let diskSize = null;
  if (needsDiskSize) {
    if (!rawDiskSize) throw new Error('Disk size is required for SCAN and C-SCAN.');
    diskSize = parseInt(rawDiskSize, 10);
    if (isNaN(diskSize) || diskSize <= 0) throw new Error('Disk size must be a positive integer.');
    if (head >= diskSize) throw new Error('Head position must be less than disk size.');
    for (const r of requests) {
      if (r < 0 || r >= diskSize)
        throw new Error(`Request ${r} is out of disk range [0, ${diskSize - 1}].`);
    }
  }

  return { requests, head, diskSize, algo, direction };
}

// ── Algorithms ────────────────────────────────────────────────

function fcfs(head, requests) {
  const order = [head, ...requests];
  let seek = 0;
  for (let i = 1; i < order.length; i++) seek += Math.abs(order[i] - order[i - 1]);
  return { order, seek };
}

function sstf(head, requests) {
  const remaining = [...requests];
  const order = [head];
  let seek = 0, current = head;

  while (remaining.length) {
    let minIdx = 0, minDist = Math.abs(remaining[0] - current);
    for (let i = 1; i < remaining.length; i++) {
      const d = Math.abs(remaining[i] - current);
      if (d < minDist) { minDist = d; minIdx = i; }
    }
    seek += minDist;
    current = remaining[minIdx];
    order.push(current);
    remaining.splice(minIdx, 1);
  }
  return { order, seek };
}

function scan(head, requests, diskSize, direction) {
  const sorted = [...requests].sort((a, b) => a - b);
  const left = sorted.filter(r => r < head).reverse();
  const right = sorted.filter(r => r >= head);
  const order = [head];
  let seek = 0, current = head;

  const traverse = (list) => {
    for (const pos of list) {
      seek += Math.abs(current - pos);
      current = pos;
      order.push(current);
    }
  };

  if (direction === 'right') {
    traverse(right);
    if (diskSize !== null && current < diskSize - 1) {
      seek += Math.abs(current - (diskSize - 1));
      current = diskSize - 1;
      order.push(current);
    }
    traverse(left);
  } else {
    traverse(left);
    if (current > 0) {
      seek += current;
      current = 0;
      order.push(0);
    }
    traverse(right);
  }
  return { order, seek };
}

function cscan(head, requests, diskSize, direction) {
  const sorted = [...requests].sort((a, b) => a - b);
  const left = sorted.filter(r => r < head).reverse();
  const right = sorted.filter(r => r >= head);
  const order = [head];
  let seek = 0, current = head;

  const traverse = (list) => {
    for (const pos of list) {
      seek += Math.abs(current - pos);
      current = pos;
      order.push(current);
    }
  };

  if (direction === 'right') {
    traverse(right);
    if (diskSize !== null) {
      // go to end then jump to 0
      seek += Math.abs(current - (diskSize - 1));
      current = diskSize - 1;
      order.push(current);
      seek += diskSize - 1; // jump to 0
      current = 0;
      order.push(0);
    }
    traverse(left.slice().reverse()); // serve left in ascending order
  } else {
    traverse(left);
    seek += current; // go to 0
    current = 0;
    order.push(0);
    seek += diskSize - 1; // jump to end
    current = diskSize - 1;
    order.push(current);
    traverse(right.slice().reverse());
  }
  return { order, seek };
}

function look(head, requests, direction) {
  const sorted = [...requests].sort((a, b) => a - b);
  const left = sorted.filter(r => r < head).reverse();
  const right = sorted.filter(r => r >= head);
  const order = [head];
  let seek = 0, current = head;

  const traverse = (list) => {
    for (const pos of list) {
      seek += Math.abs(current - pos);
      current = pos;
      order.push(current);
    }
  };

  if (direction === 'right') {
    traverse(right);
    traverse(left);
  } else {
    traverse(left);
    traverse(right);
  }
  return { order, seek };
}

function runAlgorithm(algo, head, requests, diskSize, direction) {
  switch (algo) {
    case 'fcfs': return fcfs(head, requests);
    case 'sstf': return sstf(head, requests);
    case 'scan': return scan(head, requests, diskSize, direction);
    case 'cscan': return cscan(head, requests, diskSize, direction);
    case 'look': return look(head, requests, direction);
    default: throw new Error('Unknown algorithm selected.');
  }
}

// ── Canvas Helpers ────────────────────────────────────────────
const CANVAS_H = 320;
const PADDING_X = 60;
const PADDING_Y = 40;
const AXIS_Y = CANVAS_H - PADDING_Y;
const GRAPH_TOP_Y = PADDING_Y + 30;

function resizeCanvas() {
  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  const style = getComputedStyle(parent);
  const hSpace = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2;
  const w = rect.width - hSpace;
  canvas.width = w;
  canvas.height = CANVAS_H;
  highlightCanvas.width = w;
  highlightCanvas.height = CANVAS_H;
}

function getX(cylinder, minC, maxC) {
  const graphW = canvas.width - PADDING_X * 2;
  return PADDING_X + ((cylinder - minC) / (maxC - minC || 1)) * graphW;
}

function getY(step, totalSteps) {
  return GRAPH_TOP_Y + (step / (totalSteps || 1)) * (AXIS_Y - GRAPH_TOP_Y);
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawBackground(order, minC, maxC, totalSteps) {
  const graphW = canvas.width - PADDING_X * 2;
  const graphH = AXIS_Y - GRAPH_TOP_Y;

  // 1. Solid background (dynamic to theme)
  const style = getComputedStyle(document.documentElement);
  ctx.fillStyle = style.getPropertyValue('--bg-base').trim() || '#070b14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Horizontal step grid lines
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  for (let s = 0; s <= totalSteps; s++) {
    const y = getY(s, totalSteps);
    // Grid line
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)'; // faint cyan for step divisions
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PADDING_X, y);
    ctx.lineTo(canvas.width - PADDING_X, y);
    ctx.stroke();

    // Step label
    ctx.fillStyle = 'rgba(148, 163, 184, 0.9)'; // lighter gray
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillText(`${s}`, PADDING_X - 12, y + 4);
  }
  ctx.setLineDash([]); // reset

  // 3. Vertical cylinder bounding / reference lines
  const range = maxC - minC;
  let gridCount = 10;
  if (range > 0 && range < 10) gridCount = range;

  for (let i = 0; i <= gridCount; i++) {
    const x = PADDING_X + (i / gridCount) * graphW;
    const isBoundary = (i === 0 || i === gridCount);

    // Vertical line
    ctx.strokeStyle = isBoundary ? 'rgba(59, 130, 246, 0.5)' : 'rgba(59, 130, 246, 0.1)';
    ctx.lineWidth = isBoundary ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, GRAPH_TOP_Y - 15);
    ctx.lineTo(x, AXIS_Y + 15);
    ctx.stroke();

    // Bottom label
    const val = Math.round(minC + (i / gridCount) * (maxC - minC));
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.fillStyle = isBoundary ? '#3b82f6' : (isLight ? 'rgba(71, 85, 105, 0.6)' : 'rgba(148, 163, 184, 0.7)');
    ctx.font = isBoundary ? 'bold 12px Inter, sans-serif' : '11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(val, x, AXIS_Y + 28);

  }

  // 4. Main Horizontal X-Axis Line
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PADDING_X - 5, AXIS_Y + 15);
  ctx.lineTo(canvas.width - PADDING_X + 5, AXIS_Y + 15);
  ctx.stroke();



  // X-axis label
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 12px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Cylinder Number', canvas.width / 2, CANVAS_H - 2);

  // Y-axis label
  ctx.save();
  ctx.translate(16, CANVAS_H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 12px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Step / Sequence', 0, 0);
  ctx.restore();
}

function drawSegment(ctx, x1, y1, x2, y2, progress) {
  const xi = x1 + (x2 - x1) * progress;
  const yi = y1 + (y2 - y1) * progress;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(xi, yi);
  ctx.stroke();
  return { x: xi, y: yi };
}

// ── Speed Slider → delay (ms) ──────────────────────────────────
function getDelay() {
  const val = parseInt(speedSlider.value, 10); // 1 (slow) → 10 (fast)
  // map 1→800ms, 10→60ms
  return Math.round(800 - (val - 1) * (800 - 60) / 9);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Start-point pop animation ──────────────────────────────
async function showStartAnimation(x, y, cylinder) {
  const maxR = 10;
  // Phase 1: grow from 0 → maxR with glow (on highlight canvas)
  for (let r = 0; r <= maxR; r++) {
    hCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
    const alpha = r / maxR;
    // outer glow ring
    hCtx.shadowColor = '#a855f7';
    hCtx.shadowBlur = 20;
    hCtx.strokeStyle = `rgba(168,85,247,${alpha})`;
    hCtx.lineWidth = 2;
    hCtx.beginPath();
    hCtx.arc(x, y, Math.max(r + 4, 5), 0, Math.PI * 2);
    hCtx.stroke();
    // filled dot
    hCtx.shadowBlur = 16;
    hCtx.fillStyle = `rgba(168,85,247,${alpha})`;
    hCtx.beginPath();
    hCtx.arc(x, y, r, 0, Math.PI * 2);
    hCtx.fill();
    hCtx.shadowBlur = 0;
    await sleep(18);
    if (!animationRunning) return;
  }
  // Phase 2: pulse ring expansion
  for (let r = maxR; r <= maxR + 18; r += 2) {
    hCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
    const alpha = 1 - (r - maxR) / 18;
    // pulse ring
    hCtx.strokeStyle = `rgba(168,85,247,${alpha})`;
    hCtx.lineWidth = 2;
    hCtx.beginPath();
    hCtx.arc(x, y, r, 0, Math.PI * 2);
    hCtx.stroke();
    // stable center dot
    hCtx.shadowColor = '#a855f7'; hCtx.shadowBlur = 14;
    hCtx.fillStyle = '#a855f7';
    hCtx.beginPath();
    hCtx.arc(x, y, maxR, 0, Math.PI * 2);
    hCtx.fill();
    hCtx.shadowBlur = 0;
    await sleep(20);
    if (!animationRunning) return;
  }
  // Phase 3: stamp "START" label on main canvas, draw permanent dot
  ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 14;
  ctx.fillStyle = '#a855f7';
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  ctx.fillStyle = isLight ? '#0f172a' : '#fff';
  ctx.shadowBlur = 0;
  ctx.font = 'bold 600 10px Poppins, Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('START', x, y - 16);
  // clear highlight canvas for upcoming path
  hCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
  // pause before path starts
  await sleep(480);
}

// ── Main Animation ──────────────────────────────────────────
async function animate(order, algoName, seekTotal, diskSize = null) {
  animationRunning = true;
  drawnPoints = [];
  setStatus('running');
  movementTicker.style.display = 'flex';

  resizeCanvas();
  // Standardize graph scale from 0 to max request or diskSize boundary
  const minC = 0;
  const orderMax = Math.max(...order);
  const maxC = diskSize ? diskSize - 1 : Math.max(1, orderMax);
  const totalSteps = order.length - 1;

  let cumulativeSeek = 0;

  // Draw static background once
  clearCanvas();
  drawBackground(order, minC, maxC, totalSteps);

  // Faint tick marks for every request on the axis
  for (const pos of order) {
    const x = getX(pos, minC, maxC);
    ctx.fillStyle = 'rgba(59,130,246,0.15)';
    ctx.beginPath();
    ctx.arc(x, AXIS_Y + 10, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Head initialization pop animation ──────────────────
  const startX = getX(order[0], minC, maxC);
  const startY = getY(0, totalSteps);
  await showStartAnimation(startX, startY, order[0]);
  if (!animationRunning) return;

  // Record start point
  drawnPoints.push({ x: startX, y: startY, cylinder: order[0], step: 0, fromCyl: order[0], toCyl: order[0] });

  // ── Animate each segment ──────────────────────────────
  for (let step = 0; step < totalSteps; step++) {
    const from = order[step];
    const to = order[step + 1];
    const dist = Math.abs(to - from);

    const x1 = getX(from, minC, maxC);
    const y1 = getY(step, totalSteps);
    const x2 = getX(to, minC, maxC);
    const y2 = getY(step + 1, totalSteps);

    const isFirst = step === 0;
    const isLast = step === totalSteps - 1;
    const segColor = isFirst ? '#a855f7' : isLast ? '#22c55e' : '#3b82f6';

    // waypoint dot at origin of this segment
    if (step > 0) {
      ctx.fillStyle = 'rgba(139,148,158,0.55)';
      ctx.beginPath();
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const subSteps = 30;
    const delay = getDelay();

    ctx.strokeStyle = segColor;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);



    let lastX = x1, lastY = y1;

    for (let f = 1; f <= subSteps; f++) {
      const progress = f / subSteps;
      const curX = x1 + (x2 - x1) * progress;
      const curY = y1 + (y2 - y1) * progress;

      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(curX, curY);
      ctx.stroke();

      lastX = curX; lastY = curY;

      if (f === subSteps) {
        ctx.fillStyle = segColor;
        ctx.beginPath();
        ctx.arc(curX, curY, isLast ? 8 : 5, 0, Math.PI * 2);
        ctx.fill();


        if (isLast) {
          ctx.strokeStyle = 'rgba(255,255,255,.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(curX, curY, 8, 0, Math.PI * 2);
          ctx.stroke();
          // END label
          const isLight = document.documentElement.getAttribute('data-theme') === 'light';
          ctx.fillStyle = isLight ? '#0f172a' : '#fff';
          ctx.font = 'bold 10px Poppins, Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('END', curX, curY - 16);
        }
        ctx.shadowColor = 'transparent';
      }

      await sleep(delay / subSteps);
      if (!animationRunning) return;
    }

    // Record this endpoint for tooltip interaction
    drawnPoints.push({
      x: x2, y: y2,
      cylinder: to,
      step: step + 1,
      fromCyl: from,
      toCyl: to,
    });

    cumulativeSeek += dist;
    tickerText.textContent = `${from} → ${to}  (+${dist})`;
    seekLive.textContent = `Seek: ${cumulativeSeek}`;
    resSeekTime.textContent = cumulativeSeek;

    await sleep(delay * 0.3);
    if (!animationRunning) return;
  }

  setStatus('done');
  tickerText.innerHTML = `<span style="color:var(--accent-green)">✔ Simulation Complete</span> <span style="opacity:0.5;margin:0 8px">|</span> Total Seek Time: <span style="color:var(--text-primary);font-weight:600">${cumulativeSeek}</span>`;
  animationRunning = false;



  // Enable interactive tooltips now that all points are recorded
  setupCanvasInteraction();
}

// ── Interaction: nearest-point detection ─────────────────────

function findNearestPoint(mx, my) {
  const RADIUS = 22; // px hit radius
  let best = null, bestDist = RADIUS;
  for (const pt of drawnPoints) {
    const d = Math.hypot(pt.x - mx, pt.y - my);
    if (d < bestDist) { bestDist = d; best = pt; }
  }
  return best;
}

function drawHighlightPoint(pt) {
  hCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
  const color = pt.step === 0 ? '#a855f7'
    : pt.step === drawnPoints.length - 1 ? '#22c55e'
      : '#3b82f6';
  // outer glow ring
  hCtx.shadowColor = color; hCtx.shadowBlur = 18;
  hCtx.strokeStyle = `${color}88`;
  hCtx.lineWidth = 2.5;
  hCtx.beginPath();
  hCtx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
  hCtx.stroke();
  // inner bright ring
  hCtx.shadowBlur = 8;
  hCtx.strokeStyle = color;
  hCtx.lineWidth = 2;
  hCtx.beginPath();
  hCtx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
  hCtx.stroke();
  hCtx.shadowBlur = 0;
}

function showTooltip(pt) {
  const isStart = pt.step === 0;
  const isEnd = pt.step === drawnPoints.length - 1;
  const moveStr = isStart ? '— (start)' : `${pt.fromCyl} → ${pt.toCyl}`;
  const dist = isStart ? 0 : Math.abs(pt.toCyl - pt.fromCyl);

  tooltipEl.innerHTML = `
    <div class="tooltip-row">
      <span class="tooltip-label">Track</span>
      <span class="tooltip-value accent">${pt.cylinder}</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">Step</span>
      <span class="tooltip-value">${pt.step}${isStart ? ' (start)' : isEnd ? ' (end)' : ''}</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">Move</span>
      <span class="tooltip-value">${moveStr}</span>
    </div>
    ${!isStart ? `<div class="tooltip-row">
      <span class="tooltip-label">Δ Seek</span>
      <span class="tooltip-value">${dist}</span>
    </div>` : ''}
  `;


  // Position: anchor rigidly to the point coordinates
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;

  const viewportX = rect.left + pt.x * scaleX;
  const viewportY = rect.top + pt.y * scaleY;

  // Use natural height to properly elevate it fully above the dot
  const TH = tooltipEl.offsetHeight || 130;
  const TW = 172;

  // Pivot check: if node is in the right-most 30% of the screen, 
  // shift the tooltip to the left of the dot.
  const screenPct = viewportX / window.innerWidth;
  let tx;

  if (screenPct > 0.7) {
    tx = viewportX - TW - 20; // Pivot left
  } else if (screenPct < 0.3) {
    tx = viewportX + 20;      // Pivot right
  } else {
    tx = viewportX - TW / 2; // Center
  }

  let ty = viewportY - TH - 16; // Above the point

  // Safety bounds
  if (tx < 12) tx = 12;
  if (tx + TW > window.innerWidth - 12) tx = window.innerWidth - TW - 12;

  // If hitting the top of the browser, flip it to show below the point
  if (ty < 12) {
    ty = viewportY + 24;
  }

  tooltipEl.style.left = `${tx}px`;
  tooltipEl.style.top = `${ty}px`;
  tooltipEl.classList.add('visible');

}

function hideTooltip() {
  tooltipEl.classList.remove('visible');
  hCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
}

function setupCanvasInteraction() {
  // Remove old hit area if re-running
  if (hitArea) hitArea.remove();
  hitArea = document.createElement('div');
  hitArea.className = 'canvas-hit-area';
  canvas.parentElement.appendChild(hitArea);

  function getCanvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  hitArea.addEventListener('mousemove', (e) => {
    const { x, y } = getCanvasCoords(e.clientX, e.clientY);
    const pt = findNearestPoint(x, y);
    if (pt) {
      drawHighlightPoint(pt);
      showTooltip(pt);
      hitArea.style.cursor = 'pointer';
    } else {
      hideTooltip();
      hitArea.style.cursor = 'crosshair';
    }
  });

  hitArea.addEventListener('mouseleave', hideTooltip);

  hitArea.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const { x, y } = getCanvasCoords(touch.clientX, touch.clientY);
    const pt = findNearestPoint(x, y);
    if (pt) { drawHighlightPoint(pt); showTooltip(pt); }
    else { hideTooltip(); }
  }, { passive: false });

  hitArea.addEventListener('touchend', hideTooltip);
}

// ── Execution Order Display ───────────────────────────────────
function renderExecOrder(order) {
  execSequence.innerHTML = '';
  order.forEach((pos, i) => {
    const span = document.createElement('span');
    span.className = `exec-seq-item${i === 0 ? ' start-item' : ''}`;
    span.textContent = pos;
    span.style.animationDelay = `${i * 40}ms`;
    execSequence.appendChild(span);
    if (i < order.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'exec-seq-arrow';
      arrow.textContent = '→';
      arrow.style.animationDelay = `${i * 40 + 20}ms`;
      execSequence.appendChild(arrow);
    }
  });
}

// ── Comparison Table ──────────────────────────────────────────
function updateComparisonTable() {
  if (Object.keys(comparisonData).length === 0) {
    comparisonTbody.innerHTML = '<tr class="empty-row"><td colspan="3">No results yet. Run a simulation to begin.</td></tr>';
    return;
  }

  // find min
  const seeks = Object.values(comparisonData).map(d => d.seek);
  const minSeek = Math.min(...seeks);

  comparisonTbody.innerHTML = '';
  const algoOrder = ['fcfs', 'sstf', 'look', 'scan', 'cscan'];
  for (const key of algoOrder) {
    if (!comparisonData[key]) continue;
    const { name, seek } = comparisonData[key];
    const isBest = seek === minSeek;

    const tr = document.createElement('tr');
    if (isBest) tr.classList.add('best-row');
    tr.innerHTML = `
      <td>
        <span class="algo-chip">${name}</span>
        ${isBest ? '<span class="best-badge">★ Best</span>' : ''}
      </td>
      <td>${seek}</td>
      <td><span class="status-dot done"></span>Completed</td>
    `;
    comparisonTbody.appendChild(tr);
  }
}

// ── Status Badge ──────────────────────────────────────────────
function setStatus(state) {
  simStatus.textContent = state === 'running' ? 'Running' : state === 'done' ? 'Complete' : 'Ready';
  simStatus.className = `status-badge${state !== 'ready' ? ' ' + state : ''}`;
}

// ── Error Display ─────────────────────────────────────────────
function showError(msg) {
  errorBox.textContent = '⚠ ' + msg;
  errorBox.style.display = 'block';
}
function clearError() {
  errorBox.textContent = '';
  errorBox.style.display = 'none';
}

// ── Run Simulation ────────────────────────────────────────────
async function runSimulation() {
  if (animationRunning) return;
  clearError();

  let params;
  try {
    params = parseInputs();
  } catch (e) {
    showError(e.message);
    return;
  }

  const { requests, head, diskSize, algo, direction } = params;
  let result;
  try {
    result = runAlgorithm(algo, head, requests, diskSize, direction);
  } catch (e) {
    showError(e.message);
    return;
  }

  const { order, seek } = result;
  const algoName = ALGO_INFO[algo].label.split(' (')[0];

  // Store for comparison
  comparisonData[algo] = { name: algoName, seek };
  updateComparisonTable();

  // Show results panel
  resultsPanel.style.display = '';
  resAlgoName.textContent = algoName;
  resSeekTime.textContent = 0;
  resReqCount.textContent = requests.length;
  renderExecOrder(order);

  // Show movement ticker
  if (movementTicker) movementTicker.style.display = 'flex';


  // Hide placeholder, show canvas
  canvasPlaceholder.classList.add('hidden');

  // Run animation
  runBtn.disabled = true;
  runBtn.textContent = '⏳ Simulating…';
  await animate(order, algoName, seek, diskSize);
  runBtn.disabled = false;
  runBtn.innerHTML = '<span>▶</span> Run Simulation';

  // Final display
  resSeekTime.textContent = seek;
}

// ── Reset ─────────────────────────────────────────────────────
function resetAll() {
  animationRunning = false;
  drawnPoints = [];
  clearCanvas();
  hCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
  hideTooltip();
  if (hitArea) { hitArea.remove(); hitArea = null; }
  clearError();
  canvasPlaceholder.classList.remove('hidden');
  movementTicker.style.display = 'none';
  resultsPanel.style.display = 'none';
  setStatus('ready');
  runBtn.disabled = false;
  runBtn.innerHTML = '<span>▶</span> Run Simulation';
  tickerText.textContent = '—';
  seekLive.textContent = 'Seek: 0';
}

// ── Speed Slider live update ───────────────────────────────────
speedSlider.addEventListener('input', () => {
  const pct = ((speedSlider.value - 1) / 9) * 100;
  speedSlider.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`;
});
// initialize
speedSlider.dispatchEvent(new Event('input'));

// ── Algorithm select listener ─────────────────────────────────
algorithmSelect.addEventListener('change', () => {
  const algo = algorithmSelect.value;
  renderAlgoInfo(algo);
  updateUIVisibility(algo);
});

// ── Buttons ───────────────────────────────────────────────────
runBtn.addEventListener('click', runSimulation);
resetBtn.addEventListener('click', resetAll);

// ── Window resize → re-draw canvas ───────────────────────────
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (!canvasPlaceholder.classList.contains('hidden')) resizeCanvas();
  }, 200);
});

// ── Theme Toggle ──────────────────────────────────────────────
const themeToggleBtn = document.getElementById('theme-toggle');
let currentTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', currentTheme);

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);

    // Redraw graph lines to instantly match theme background if a simulation exists
    if (!animationRunning && drawnPoints.length > 0) {
      const order = drawnPoints.map(p => p.cylinder);
      order.unshift(drawnPoints[0].fromCyl);

      const parsedDisk = parseInt(document.getElementById('diskSize').value, 10);
      const limit = isNaN(parsedDisk) ? null : parsedDisk - 1;
      const minC = 0;
      const maxC = limit !== null ? limit : Math.max(1, ...order);

      clearCanvas();
      drawBackground(order, minC, maxC, drawnPoints.length - 1);

      // Re-draw segments and dots
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      for (let i = 1; i < drawnPoints.length; i++) {
        const pt = drawnPoints[i];
        const prev = drawnPoints[i - 1];
        const segColor = i === 1 ? '#a855f7' : i === drawnPoints.length - 1 ? '#22c55e' : '#3b82f6';
        ctx.strokeStyle = segColor;
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();

        ctx.fillStyle = segColor;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, i === drawnPoints.length - 1 ? 8 : 5, 0, Math.PI * 2); ctx.fill();
        if (i === drawnPoints.length - 1) {
          ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = (currentTheme === 'light') ? '#0f172a' : '#fff';
          ctx.font = 'bold 10px Poppins, Inter, sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('END', pt.x, pt.y - 16);
        }
      }

      // Re-draw start dot
      const start = drawnPoints[0];
      ctx.fillStyle = '#a855f7'; ctx.beginPath(); ctx.arc(start.x, start.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = (currentTheme === 'light') ? '#0f172a' : '#fff';
      ctx.font = 'bold 600 10px Poppins, Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('START', start.x, start.y - 16);
    } else if (!animationRunning) {
      // Just redraw empty background if no simulation ran
      clearCanvas();
      drawBackground([], 0, 100, 10);
    }
  });
}

// ── Init ──────────────────────────────────────────────────────
(function init() {
  renderAlgoInfo(algorithmSelect.value);
  updateUIVisibility(algorithmSelect.value);
  resizeCanvas();
})();
