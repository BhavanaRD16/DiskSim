/* ============================================================
   DiskSim – script.js
   HDD Scheduling Simulator – Algorithms + UI + Canvas Animation
   ============================================================ */

'use strict';

// ── DOM refs ──────────────────────────────────────────────────
const requestQueueInput = document.getElementById('request-queue');
const headPositionInput = document.getElementById('head-position');
const diskSizeInput     = document.getElementById('disk-size');
const algorithmSelect   = document.getElementById('algorithm-select');
const speedSlider       = document.getElementById('speed-slider');
const runBtn            = document.getElementById('run-btn');
const resetBtn          = document.getElementById('reset-btn');
const errorBox          = document.getElementById('error-box');
const diskSizeGroup     = document.getElementById('disk-size-group');
const directionGroup    = document.getElementById('direction-group');
const algoInfoBody      = document.getElementById('algo-info-body');
const canvasPlaceholder = document.getElementById('canvas-placeholder');
const simStatus         = document.getElementById('sim-status');
const movementTicker    = document.getElementById('movement-ticker');
const tickerText        = document.getElementById('ticker-text');
const seekLive          = document.getElementById('seek-live');
const resultsPanel      = document.getElementById('results-panel');
const resAlgoName       = document.getElementById('res-algo-name');
const resSeekTime       = document.getElementById('res-seek-time');
const resReqCount       = document.getElementById('res-req-count');
const execSequence      = document.getElementById('exec-sequence');
const comparisonTbody   = document.getElementById('comparison-tbody');
const canvas            = document.getElementById('disk-canvas');
const ctx               = canvas.getContext('2d');

// ── State ─────────────────────────────────────────────────────
let comparisonData = {};   // { fcfs: {name, seek}, sstf: {...}, ... }
let animationRunning = false;

// ── Algorithm Metadata ────────────────────────────────────────
const ALGO_INFO = {
  fcfs: {
    label: 'First Come First Serve (FCFS)',
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
  const showDiskSize  = ['scan', 'cscan'].includes(algoKey);
  const showDirection = ['scan', 'cscan', 'look'].includes(algoKey);

  diskSizeGroup.classList.toggle('hidden', !showDiskSize);
  directionGroup.classList.toggle('hidden', !showDirection);
}

// ── Input Validation ──────────────────────────────────────────
function parseInputs() {
  const rawQueue       = requestQueueInput.value.trim();
  const rawHead        = headPositionInput.value.trim();
  const rawDiskSize    = diskSizeInput.value.trim();
  const algo           = algorithmSelect.value;
  const direction      = document.querySelector('input[name="direction"]:checked').value;

  if (!rawQueue)         throw new Error('Request queue cannot be empty.');
  if (!rawHead)          throw new Error('Initial head position is required.');

  const requests = rawQueue.split(',').map(s => {
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
  const left   = sorted.filter(r => r <  head).reverse();
  const right  = sorted.filter(r => r >= head);
  const order  = [head];
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
  const left   = sorted.filter(r => r <  head).reverse();
  const right  = sorted.filter(r => r >= head);
  const order  = [head];
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
  const left   = sorted.filter(r => r <  head).reverse();
  const right  = sorted.filter(r => r >= head);
  const order  = [head];
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
    case 'fcfs':  return fcfs(head, requests);
    case 'sstf':  return sstf(head, requests);
    case 'scan':  return scan(head, requests, diskSize, direction);
    case 'cscan': return cscan(head, requests, diskSize, direction);
    case 'look':  return look(head, requests, direction);
    default: throw new Error('Unknown algorithm selected.');
  }
}

// ── Canvas Helpers ────────────────────────────────────────────
const CANVAS_H    = 320;
const PADDING_X   = 60;
const PADDING_Y   = 40;
const AXIS_Y      = CANVAS_H - PADDING_Y;
const GRAPH_TOP_Y = PADDING_Y + 30;

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width  = rect.width - 24;  // account for card-body padding
  canvas.height = CANVAS_H;
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
  // background
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim() || '#161b22';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // grid lines
  const gridCount = 8;
  ctx.strokeStyle = 'rgba(42,51,71,0.7)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridCount; i++) {
    const x = PADDING_X + (i / gridCount) * graphW;
    ctx.beginPath();
    ctx.moveTo(x, GRAPH_TOP_Y - 10);
    ctx.lineTo(x, AXIS_Y + 10);
    ctx.stroke();

    // labels
    const val = Math.round(minC + (i / gridCount) * (maxC - minC));
    ctx.fillStyle = 'rgba(139,148,158,0.6)';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(val, x, AXIS_Y + 24);
  }

  // axis line
  ctx.strokeStyle = 'rgba(42,51,71,1)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PADDING_X, AXIS_Y + 10);
  ctx.lineTo(canvas.width - PADDING_X, AXIS_Y + 10);
  ctx.stroke();

  // step labels on left
  for (let s = 0; s <= totalSteps; s++) {
    const y = getY(s, totalSteps);
    ctx.fillStyle = 'rgba(139,148,158,0.4)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${s}`, PADDING_X - 10, y + 4);
  }

  // X-axis label
  ctx.fillStyle = 'rgba(139,148,158,0.5)';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Cylinder Number', canvas.width / 2, CANVAS_H - 6);

  // Y-axis label
  ctx.save();
  ctx.translate(14, CANVAS_H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Step', 0, 0);
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

// ── Main Animation ────────────────────────────────────────────
async function animate(order, algoName, seekTotal) {
  animationRunning = true;
  setStatus('running');
  movementTicker.style.display = 'flex';

  resizeCanvas();
  const minC = Math.min(...order);
  const maxC = Math.max(...order);
  const totalSteps = order.length - 1;

  let cumulativeSeek = 0;

  // Draw static background once
  clearCanvas();
  drawBackground(order, minC, maxC, totalSteps);

  // Draw dots for all request positions
  for (const pos of order) {
    const x = getX(pos, minC, maxC);
    ctx.fillStyle = 'rgba(59,130,246,0.15)';
    ctx.beginPath();
    ctx.arc(x, AXIS_Y + 10, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Animate each segment
  for (let step = 0; step < totalSteps; step++) {
    const from = order[step];
    const to   = order[step + 1];
    const dist = Math.abs(to - from);

    const x1 = getX(from, minC, maxC);
    const y1 = getY(step, totalSteps);
    const x2 = getX(to,   minC, maxC);
    const y2 = getY(step + 1, totalSteps);

    const isFirst = step === 0;
    const isLast  = step === totalSteps - 1;
    const segColor = isFirst ? '#a855f7' : isLast ? '#22c55e' : '#3b82f6';

    // draw dots at fixed points
    ctx.fillStyle = 'rgba(139,148,158,0.5)';
    ctx.beginPath();
    ctx.arc(x1, y1, 4, 0, Math.PI * 2);
    ctx.fill();

    // Animate segment in sub-steps
    const subSteps = 30;
    const delay = getDelay();

    ctx.strokeStyle = segColor;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = segColor;
    ctx.shadowBlur = 6;
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
        // Draw endpoint dot
        ctx.shadowBlur = 0;
        ctx.fillStyle = segColor;
        ctx.beginPath();
        ctx.arc(curX, curY, isLast ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();
        if (isLast) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(curX, curY, 7, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.shadowColor = 'transparent';
      }

      await sleep(delay / subSteps);
      if (!animationRunning) return;
    }

    cumulativeSeek += dist;
    tickerText.textContent = `${from} → ${to}  (+${dist})`;
    seekLive.textContent   = `Seek: ${cumulativeSeek}`;

    // Update results live
    resSeekTime.textContent = cumulativeSeek;
    await sleep(delay * 0.3);
    if (!animationRunning) return;
  }

  // Final glowing head marker
  const finalX = getX(order[totalSteps], minC, maxC);
  const finalY = getY(totalSteps, totalSteps);
  ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 16;
  ctx.fillStyle   = '#22c55e';
  ctx.beginPath(); ctx.arc(finalX, finalY, 8, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // start label
  const startX = getX(order[0], minC, maxC);
  const startY = getY(0, totalSteps);
  ctx.fillStyle = '#a855f7'; ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(startX, startY, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.shadowBlur = 0; ctx.font = 'bold 10px Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.fillText('START', startX, startY - 14);

  setStatus('done');
  tickerText.textContent = `Simulation complete — Total seek: ${cumulativeSeek}`;
  animationRunning = false;
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
  resAlgoName.textContent  = algoName;
  resSeekTime.textContent  = 0;
  resReqCount.textContent  = requests.length;
  renderExecOrder(order);

  // Hide placeholder, show canvas
  canvasPlaceholder.classList.add('hidden');

  // Run animation
  runBtn.disabled = true;
  runBtn.textContent = '⏳ Simulating…';
  await animate(order, algoName, seek);
  runBtn.disabled = false;
  runBtn.innerHTML = '<span>▶</span> Run Simulation';

  // Final display
  resSeekTime.textContent = seek;
}

// ── Reset ─────────────────────────────────────────────────────
function resetAll() {
  animationRunning = false;
  clearCanvas();
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

// ── Init ──────────────────────────────────────────────────────
(function init() {
  renderAlgoInfo(algorithmSelect.value);
  updateUIVisibility(algorithmSelect.value);
  resizeCanvas();
})();
