const mainCanvas = document.getElementById("main-canvas");
const cursorCanvas = document.getElementById("cursor-canvas");
const ctx = mainCanvas.getContext("2d", { willReadFrequently: true });
const curCtx = cursorCanvas.getContext("2d");
const wrapper = document.getElementById("canvas-wrapper");
const emptyState = document.getElementById("empty-state");

let brushMode = "erase",
  brushSize = 40,
  strength = 0.85,
  softness = 0.5,
  sampleRadius = 12;
let zoom = 1,
  isDrawing = false,
  imageLoaded = false;
let originalData = null,
  history = [],
  redoStack = [],
  editCount = 0,
  credits = 10;

// ── Upload ──────────────────────────────────────────────────────────────────
document
  .getElementById("file-input")
  .addEventListener("change", (e) => loadImg(e.target.files[0]));
document
  .getElementById("upload-zone")
  .addEventListener("dragover", (e) => e.preventDefault());
document.getElementById("upload-zone").addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith("image/")) loadImg(f);
});

function loadImg(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      mainCanvas.width = img.width;
      mainCanvas.height = img.height;
      cursorCanvas.width = img.width;
      cursorCanvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      originalData = ctx.getImageData(0, 0, img.width, img.height);
      history = [ctx.getImageData(0, 0, img.width, img.height)];
      redoStack = [];
      editCount = 0;
      imageLoaded = true;
      wrapper.classList.add("visible");
      emptyState.style.display = "none";
      fitZoom();
      updateInfo(file, img);
      updateBtns();
      updateStatus("Ready to erase");
      updateHistoryList();
      toast("Image loaded — paint over the watermark to erase it");
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// ── Info panel ──────────────────────────────────────────────────────────────
function updateInfo(file, img) {
  document.getElementById("inf-w").textContent = img.width + "px";
  document.getElementById("inf-h").textContent = img.height + "px";
  document.getElementById("inf-fmt").textContent = file.type
    .split("/")[1]
    .toUpperCase();
  document.getElementById("inf-size").textContent =
    (file.size / 1024).toFixed(0) + " KB";
}

// ── Zoom ────────────────────────────────────────────────────────────────────
function setZoom(z) {
  zoom = Math.max(0.08, Math.min(5, z));
  mainCanvas.style.width = mainCanvas.width * zoom + "px";
  mainCanvas.style.height = mainCanvas.height * zoom + "px";
  cursorCanvas.style.width = mainCanvas.style.width;
  cursorCanvas.style.height = mainCanvas.style.height;
  document.getElementById("zoom-pct").textContent =
    Math.round(zoom * 100) + "%";
}
function fitZoom() {
  const area = document.getElementById("canvas-area");
  const mw = (area.clientWidth - 60) / mainCanvas.width;
  const mh = (area.clientHeight - 60) / mainCanvas.height;
  setZoom(Math.min(1, mw, mh));
}

// ── Mode ────────────────────────────────────────────────────────────────────
function setMode(el) {
  document
    .querySelectorAll(".tool-btn")
    .forEach((b) => b.classList.remove("active"));
  el.classList.add("active");
  brushMode = el.dataset.mode;
  updateStatus("Mode: " + el.querySelector(".t-name").textContent);
}

// ── Cursor ──────────────────────────────────────────────────────────────────
function drawCursor(x, y) {
  curCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
  const r = brushSize / 2;
  curCtx.beginPath();
  curCtx.arc(x, y, r, 0, Math.PI * 2);
  curCtx.strokeStyle = "rgba(232,82,26,0.85)";
  curCtx.lineWidth = 1.5 / zoom;
  curCtx.setLineDash([3 / zoom, 3 / zoom]);
  curCtx.stroke();
  curCtx.setLineDash([]);
  curCtx.beginPath();
  curCtx.moveTo(x - 5 / zoom, y);
  curCtx.lineTo(x + 5 / zoom, y);
  curCtx.moveTo(x, y - 5 / zoom);
  curCtx.lineTo(x, y + 5 / zoom);
  curCtx.strokeStyle = "rgba(232,82,26,0.5)";
  curCtx.lineWidth = 1 / zoom;
  curCtx.stroke();
}

// ── Canvas events ────────────────────────────────────────────────────────────
function getPos(e) {
  const r = mainCanvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
}

mainCanvas.addEventListener("mousemove", (e) => {
  const p = getPos(e);
  drawCursor(p.x, p.y);
  if (isDrawing) applyBrush(p.x, p.y);
});
mainCanvas.addEventListener("mousedown", (e) => {
  if (!imageLoaded) return;
  isDrawing = true;
  saveHistory();
  const p = getPos(e);
  applyBrush(p.x, p.y);
});
mainCanvas.addEventListener("mouseup", () => {
  isDrawing = false;
});
mainCanvas.addEventListener("mouseleave", () => {
  isDrawing = false;
  curCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
});
mainCanvas.style.cursor = "none";

mainCanvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    if (!imageLoaded) return;
    isDrawing = true;
    saveHistory();
    applyBrush(...Object.values(getPos(e.touches[0])));
  },
  { passive: false },
);
mainCanvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    if (isDrawing) applyBrush(...Object.values(getPos(e.touches[0])));
  },
  { passive: false },
);
mainCanvas.addEventListener("touchend", () => {
  isDrawing = false;
});

// ── Brush algorithm ──────────────────────────────────────────────────────────
function applyBrush(cx, cy) {
  const d = ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
  const px = d.data,
    W = mainCanvas.width,
    H = mainCanvas.height;
  const r = Math.round(brushSize / 2);

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > r) continue;
      const x = Math.round(cx + dx),
        y = Math.round(cy + dy);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const hard = r * (1 - softness * 0.8);
      let a = dist < hard ? 1 : 1 - (dist - hard) / (r - hard + 0.001);
      a = Math.pow(Math.max(0, Math.min(1, a)), 0.5) * strength;
      const i = (y * W + x) * 4;
      let nr, ng, nb;
      if (brushMode === "erase") {
        [nr, ng, nb] = sampleRing(px, x, y, r + sampleRadius, r, W, H);
      } else if (brushMode === "smart") {
        [nr, ng, nb] = smartSamp(px, x, y, sampleRadius, W, H);
      } else if (brushMode === "clone") {
        const sx = Math.max(0, Math.min(W - 1, x + Math.round(W * 0.12))),
          si = (y * W + sx) * 4;
        nr = px[si];
        ng = px[si + 1];
        nb = px[si + 2];
      } else {
        [nr, ng, nb] = gaussSamp(px, x, y, sampleRadius, W, H);
      }
      px[i] = Math.round(px[i] * (1 - a) + nr * a);
      px[i + 1] = Math.round(px[i + 1] * (1 - a) + ng * a);
      px[i + 2] = Math.round(px[i + 2] * (1 - a) + nb * a);
    }
  }
  ctx.putImageData(d, 0, 0);
  editCount++;
  document.getElementById("inf-edits").textContent = editCount;
  updateBtns();
}

function sampleRing(data, cx, cy, outerR, innerR, W, H) {
  let rs = 0,
    gs = 0,
    bs = 0,
    wt = 0;
  const step = Math.max(1, Math.floor(outerR / 8));
  for (let dy = -outerR; dy <= outerR; dy += step) {
    for (let dx = -outerR; dx <= outerR; dx += step) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < innerR || d > outerR) continue;
      const px = cx + dx,
        py = cy + dy;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const w = 1 / (d - innerR + 1),
        i = (Math.round(py) * W + Math.round(px)) * 4;
      rs += data[i] * w;
      gs += data[i + 1] * w;
      bs += data[i + 2] * w;
      wt += w;
    }
  }
  return wt === 0 ? [255, 255, 255] : [rs / wt, gs / wt, bs / wt];
}

function smartSamp(data, cx, cy, pr, W, H) {
  let rs = 0,
    gs = 0,
    bs = 0,
    wt = 0;
  const angles = [0, 45, 90, 135, 180, 225, 270, 315],
    dists = [pr * 2, pr * 3, pr * 4];
  for (const ang of angles) {
    for (const d of dists) {
      const rad = (ang * Math.PI) / 180,
        sx = Math.round(cx + Math.cos(rad) * d),
        sy = Math.round(cy + Math.sin(rad) * d);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const w = 1 / d,
        i = (sy * W + sx) * 4;
      rs += data[i] * w;
      gs += data[i + 1] * w;
      bs += data[i + 2] * w;
      wt += w;
    }
  }
  return wt === 0
    ? sampleRing(data, cx, cy, pr * 4, pr, W, H)
    : [rs / wt, gs / wt, bs / wt];
}

function gaussSamp(data, cx, cy, r, W, H) {
  let rs = 0,
    gs = 0,
    bs = 0,
    ws = 0;
  const sig = r / 2;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const px = cx + dx,
        py = cy + dy;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const w = Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig)),
        i = (py * W + px) * 4;
      rs += data[i] * w;
      gs += data[i + 1] * w;
      bs += data[i + 2] * w;
      ws += w;
    }
  }
  return ws === 0 ? [255, 255, 255] : [rs / ws, gs / ws, bs / ws];
}

// ── History ──────────────────────────────────────────────────────────────────
let histLabels = [];
function saveHistory() {
  if (!imageLoaded) return;
  history.push(ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height));
  histLabels.push(brushMode + " stroke");
  if (history.length > 25) {
    history.shift();
    histLabels.shift();
  }
  redoStack = [];
  updateHistoryList();
  if (credits > 0) credits--;
  document.getElementById("credit-count").textContent = credits;
}

function doUndo() {
  if (history.length < 2) return;
  redoStack.push(history.pop());
  histLabels.pop();
  ctx.putImageData(history[history.length - 1], 0, 0);
  updateBtns();
  updateHistoryList();
}

function doRedo() {
  if (!redoStack.length) return;
  const s = redoStack.pop();
  history.push(s);
  histLabels.push("redo");
  ctx.putImageData(s, 0, 0);
  updateBtns();
  updateHistoryList();
}

function doReset() {
  if (!originalData) return;
  saveHistory();
  ctx.putImageData(originalData, 0, 0);
  updateBtns();
  toast("Reset to original");
}

function doClear() {
  if (!imageLoaded) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
  updateBtns();
}

function doDownload() {
  const link = document.createElement("a");
  link.download = "pixelle-result.png";
  link.href = mainCanvas.toDataURL("image/png");
  link.click();
  toast("Downloaded as PNG");
}

function updateHistoryList() {
  const list = document.getElementById("history-list");
  if (histLabels.length === 0) {
    list.innerHTML =
      "<div style=\"font-size:0.7rem;color:var(--muted);font-family:'DM Mono',monospace\">No edits yet</div>";
    return;
  }
  list.innerHTML = histLabels
    .map(
      (l, i) =>
        `<div class="hist-item${i === histLabels.length - 1 ? " current" : ""}">
      <div class="hist-dot"></div>${l}
    </div>`,
    )
    .reverse()
    .slice(0, 8)
    .join("");
}

function updateBtns() {
  const on = imageLoaded;
  ["download-btn", "dl-btn2"].forEach(
    (id) => (document.getElementById(id).disabled = !on),
  );
  document.getElementById("undo-btn").disabled = !on || history.length < 2;
  document.getElementById("redo-btn").disabled = !redoStack.length;
  document.getElementById("reset-btn").disabled = !on;
  document.getElementById("clear-btn").disabled = !on;
}

function updateStatus(msg) {
  document.getElementById("status-box").innerHTML =
    `<span class="hi">${brushMode.charAt(0).toUpperCase() + brushMode.slice(1)} mode</span><br>${msg || "Paint over watermarks to erase"}<br><br>Size: <span class="hi">${brushSize}px</span> · Strength: <span class="hi">${Math.round(strength * 100)}%</span>`;
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

// Keyboard
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) doUndo();
  else if (
    (e.ctrlKey || e.metaKey) &&
    (e.key === "y" || (e.key === "z" && e.shiftKey))
  )
    doRedo();
  else if (e.key === "[") {
    brushSize = Math.max(5, brushSize - 5);
    document.getElementById("size-sl").value = brushSize;
    document.getElementById("size-v").textContent = brushSize + "px";
  } else if (e.key === "]") {
    brushSize = Math.min(150, brushSize + 5);
    document.getElementById("size-sl").value = brushSize;
    document.getElementById("size-v").textContent = brushSize + "px";
  }
});

updateBtns();
