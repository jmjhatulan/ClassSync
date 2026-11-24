// PDF Presenter - Core Logic and Synchronization
const CHANNEL_NAME = 'pdf_presentation_channel';
const channel = new BroadcastChannel(CHANNEL_NAME);

// Determine execution context
const isPresentationView = document.body.classList.contains('presentation-body');

// State variables
let pdfDoc = null;
let currentPageNum = 1;
let totalPages = 0;
let pdfDataBuffer = null; // Store loaded ArrayBuffer to sync with new clients
let pdfFileName = '';

// Drawing & Interactive tools state
let activeTool = null; // 'laser' or 'draw'
let isDrawing = false;
let drawColor = '#ef4444';
let drawWidth = 3;
let drawingsHistory = {}; // Store drawings per page: { pageNum: [paths] }

// --- PAGE CACHE: Pre-rendered offscreen canvases ---
let pageCache = {}; // { pageNum: OffscreenCanvas-like HTMLCanvasElement }
let pageCacheScale = 0; // the scale at which pages were cached

// --- DOM ELEMENTS (View-specific) ---
const el = {
  // Common
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),

  // Controller elements
  btnSelectFile: document.getElementById('btn-select-file'),
  fileInput: document.getElementById('pdf-file-input'),
  btnOpenPresentation: document.getElementById('btn-open-presentation'),
  thumbnailContainer: document.getElementById('thumbnail-container'),
  emptyState: document.getElementById('empty-state'),
  previewWrapper: document.getElementById('preview-canvas-wrapper'),
  mainPreviewCanvas: document.getElementById('main-preview-canvas'),

  btnPrev: document.getElementById('btn-prev'),
  btnNext: document.getElementById('btn-next'),
  pageIndicator: document.getElementById('page-indicator'),

  btnLaser: document.getElementById('btn-laser'),
  btnDraw: document.getElementById('btn-draw'),
  btnColorPicker: document.getElementById('btn-color-picker'),
  activeColorDot: document.getElementById('active-color-dot'),
  colorPopup: document.getElementById('color-popup'),
  btnUndoDraw: document.getElementById('btn-undo-draw'),
  btnClearDraw: document.getElementById('btn-clear-draw'),
  btnRefreshAspect: document.getElementById('btn-refresh-aspect'),
  controllerLaserPointer: document.getElementById('controller-laser-pointer'),

  nextEmptyState: document.getElementById('next-empty-state'),
  nextPreviewCanvas: document.getElementById('next-preview-canvas'),
  nextEmptyState2: document.getElementById('next-empty-state-2'),
  nextPreviewCanvas2: document.getElementById('next-preview-canvas-2'),
  presenterNotes: document.getElementById('presenter-notes'),

  // Presentation Screen elements
  presentationCanvas: document.getElementById('presentation-canvas'),
  presentationEmptyState: document.getElementById('presentation-empty-state'),
  laserPointer: document.getElementById('laser-pointer')
};

// --- INITIALIZATION ---
if (isPresentationView) {
  initPresentationView();
} else {
  initControllerView();
}

// --- PRESENTATION VIEW LOGIC ---
function initPresentationView() {
  // Listen for BroadcastChannel messages
  channel.onmessage = (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'LOAD_PDF':
        // Ignore if this exact file+page is already loaded (retry deduplication)
        if (pdfDoc && msg.fileName === pdfFileName && msg.currentPageNum === currentPageNum) break;
        pdfFileName = msg.fileName;
        loadPDF(msg.arrayBuffer.slice(0), msg.currentPageNum);
        break;
      case 'CHANGE_PAGE':
        if (pdfDoc) {
          currentPageNum = msg.pageNum;
          renderActivePage();
        }
        break;
      case 'LASER_TOGGLE':
        if (el.laserPointer) {
          el.laserPointer.classList.toggle('hidden', !msg.active);
        }
        break;
      case 'LASER_MOVE':
        if (el.laserPointer) {
          el.laserPointer.style.left = `${msg.x}%`;
          el.laserPointer.style.top = `${msg.y}%`;
        }
        break;
      case 'DRAW_START':
        startRemoteDrawing(msg.x, msg.y, msg.color, msg.width, msg.opacity);
        break;
      case 'DRAW_MOVE':
        drawRemote(msg.x, msg.y);
        break;
      case 'DRAW_END':
        endRemoteDrawing();
        break;
      case 'DRAW_UNDO':
        if (drawingsHistory[currentPageNum] && drawingsHistory[currentPageNum].length > 0) {
          drawingsHistory[currentPageNum].pop();
        }
        renderActivePage();
        break;
      case 'DRAW_CLEAR':
        if (drawingsHistory[currentPageNum]) {
          drawingsHistory[currentPageNum] = [];
        }
        renderActivePage();
        break;
      case 'DRAW_COLOR':
        drawColor = msg.color;
        break;
    }
  };

  // Resize handler: invalidate cache so pages re-render at new resolution
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!pdfDoc) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(async () => {
      pageCacheScale = 0; // force cache rebuild
      await preRenderAllPages();
      renderActivePage();
    }, 200);
  });

  // Request state from controller on mount (in case controller already has PDF)
  channel.postMessage({ type: 'REQUEST_STATE' });
}

// --- CONTROLLER VIEW LOGIC ---
function initControllerView() {
  // Open PDF selector
  el.btnSelectFile.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', handleFileSelect);

  // Open Presentation view
  el.btnOpenPresentation.addEventListener('click', () => {
    window.open('presentation.html', 'YProfPresentationWindow', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');

    // If a PDF is already loaded, push it to the new window after it has time to initialize
    if (pdfDataBuffer && pdfDataBuffer.byteLength > 0) {
      // Retry sending a few times to make sure the window is ready
      let attempts = 0;
      const pushState = () => {
        attempts++;
        channel.postMessage({
          type: 'LOAD_PDF',
          arrayBuffer: pdfDataBuffer.slice(0),
          currentPageNum: currentPageNum,
          fileName: pdfFileName
        });
        if (attempts < 5) {
          setTimeout(pushState, 600);
        }
      };
      setTimeout(pushState, 400);
    }
  });

  // Navigation handlers
  el.btnPrev.addEventListener('click', prevPage);
  el.btnNext.addEventListener('click', nextPage);

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    // Skip if typing in notes
    if (document.activeElement === el.presenterNotes) return;

    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
      nextPage();
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key === 'PageUp') {
      prevPage();
      e.preventDefault();
    } else if (e.key.toLowerCase() === 'l') {
      toggleTool('laser');
    } else if (e.key.toLowerCase() === 'p') {
      toggleTool('draw');
    } else if (e.key.toLowerCase() === 'r') {
      refreshAspectSize();
    } else if (e.key.toLowerCase() === 'u' || (e.ctrlKey && e.key.toLowerCase() === 'z')) {
      undoLastStroke();
      if (e.ctrlKey) e.preventDefault();
    } else if (e.key.toLowerCase() === 'c') {
      clearLocalAndRemoteDrawings();
    }
  });

  // Tool buttons
  el.btnLaser.addEventListener('click', () => toggleTool('laser'));
  el.btnDraw.addEventListener('click', () => toggleTool('draw'));
  el.btnUndoDraw.addEventListener('click', undoLastStroke);
  el.btnClearDraw.addEventListener('click', clearLocalAndRemoteDrawings);
  if (el.btnRefreshAspect) el.btnRefreshAspect.addEventListener('click', refreshAspectSize);

  // Color picker popup
  el.btnColorPicker.addEventListener('click', (e) => {
    e.stopPropagation();
    el.colorPopup.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('color-picker-wrap').contains(e.target)) {
      el.colorPopup.classList.remove('open');
    }
  });

  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setDrawColor(btn.dataset.color);
    });
  });

  // Drawing overlay mouse/touch interactions
  setupDrawingInteractions();

  // Notes logic
  el.presenterNotes.addEventListener('input', () => {
    if (pdfDoc) {
      const notesKey = `notes_${pdfFileName}_${currentPageNum}`;
      localStorage.setItem(notesKey, el.presenterNotes.value);
    }
  });

  // Listen to messages (e.g. presentation window asking for current state)
  channel.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === 'REQUEST_STATE') {
      updateConnectionStatus(true);
      if (pdfDataBuffer && pdfDataBuffer.byteLength > 0) {
        channel.postMessage({
          type: 'LOAD_PDF',
          arrayBuffer: pdfDataBuffer.slice(0),
          currentPageNum: currentPageNum,
          fileName: pdfFileName
        });
      }
    }
  };

  // Connection indicator check on window focus
  updateConnectionStatus(false);
  setInterval(() => {
    // Simply ping presentation window or check if it responds
    updateConnectionStatus(true); // Default to true if channel works
  }, 5000);

  // Resize handler: invalidate cache so pages re-render at new resolution
  let ctrlResizeTimer = null;
  window.addEventListener('resize', () => {
    if (!pdfDoc) return;
    clearTimeout(ctrlResizeTimer);
    ctrlResizeTimer = setTimeout(async () => {
      pageCacheScale = 0;
      await preRenderAllPages();
      renderActivePage();
    }, 200);
  });
}

// --- CONNECTION STATUS ---
function updateConnectionStatus(isConnected) {
  if (!el.statusDot) return;
  if (isConnected) {
    el.statusDot.className = 'status-dot connected';
    el.statusText.textContent = 'Active';
  } else {
    el.statusDot.className = 'status-dot';
    el.statusText.textContent = 'Standby';
  }
}

// --- PDF LOADING AND RENDERING ---
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file || file.type !== 'application/pdf') return;

  pdfFileName = file.name;
  const reader = new FileReader();
  reader.onload = function (evt) {
    const bufferCopy = evt.target.result.slice(0);
    pdfDataBuffer = bufferCopy;
    // Broadcast loaded file
    channel.postMessage({
      type: 'LOAD_PDF',
      arrayBuffer: bufferCopy.slice(0),
      currentPageNum: 1,
      fileName: pdfFileName
    });
    // Load locally
    loadPDF(bufferCopy.slice(0), 1);
  };
  reader.readAsArrayBuffer(file);
}

async function loadPDF(arrayBuffer, startPage = 1) {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;
    currentPageNum = startPage;
    drawingsHistory = {};
    pageCache = {};
    pageCacheScale = 0;

    // Remove empty state
    if (el.emptyState) el.emptyState.classList.add('hidden');
    if (el.presentationEmptyState) el.presentationEmptyState.classList.add('hidden');
    if (el.previewWrapper) el.previewWrapper.classList.remove('hidden');
    if (el.presentationCanvas) el.presentationCanvas.classList.remove('hidden');

    // Immediately show active page & initial previews
    await goToPage(currentPageNum);

    // Pre-render pages in background (priority first, then rest)
    preRenderAllPages();
  } catch (err) {
    console.error('Error loading PDF: ', err);
  }
}

async function goToPage(pageNum) {
  if (pageNum < 1 || pageNum > totalPages) return;
  currentPageNum = pageNum;

  // Sync to Presentation Screen
  if (!isPresentationView) {
    channel.postMessage({ type: 'CHANGE_PAGE', pageNum });
  }

  // Update Page Number indicators
  if (el.pageIndicator) {
    el.pageIndicator.textContent = `${currentPageNum} / ${totalPages}`;
  }

  // Render Page Content
  await renderActivePage();

  // Render Next Page Preview (controller only)
  if (!isPresentationView) {
    renderNextPagePreview();
    // Load notes
    const notesKey = `notes_${pdfFileName}_${currentPageNum}`;
    el.presenterNotes.value = localStorage.getItem(notesKey) || '';
  }
}

function prevPage() {
  if (currentPageNum > 1) {
    goToPage(currentPageNum - 1);
  }
}

function nextPage() {
  if (currentPageNum < totalPages) {
    goToPage(currentPageNum + 1);
  }
}

let currentRenderTask = null;

// Compute the display scale for a page viewport given current container size
function getDisplayScale(viewport) {
  let containerWidth, containerHeight;
  if (isPresentationView) {
    containerWidth = window.innerWidth;
    containerHeight = window.innerHeight;
  } else {
    const wrapperRect = el.previewWrapper ? el.previewWrapper.getBoundingClientRect() : { width: 0, height: 0 };
    containerWidth = wrapperRect.width;
    containerHeight = wrapperRect.height;
  }
  const base = Math.min(containerWidth / viewport.width, containerHeight / viewport.height);
  return isPresentationView ? base : base * 0.95;
}

// Pre-render PDF pages into offscreen canvas cache (prioritizes active + upcoming slides)
async function preRenderAllPages() {
  if (!pdfDoc) return;

  // Determine scale from first page
  const firstPage = await pdfDoc.getPage(1);
  const firstViewport = firstPage.getViewport({ scale: 1 });
  const scale = getDisplayScale(firstViewport);
  pageCacheScale = scale;

  const renderPage = async (pageNum) => {
    if (pageCache[pageNum]) return;
    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const offscreen = document.createElement('canvas');
      offscreen.width = Math.round(viewport.width);
      offscreen.height = Math.round(viewport.height);
      const ctx = offscreen.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      pageCache[pageNum] = offscreen;
    } catch (e) {
      console.warn(`Pre-render failed for page ${pageNum}:`, e);
    }
  };

  // 1. Prioritize active page and next 2 slides immediately
  const priorityPages = [currentPageNum, currentPageNum + 1, currentPageNum + 2].filter(
    p => p >= 1 && p <= totalPages
  );
  await Promise.all(priorityPages.map(p => renderPage(p)));

  // Re-update active page and previews with cached renders
  renderActivePage();
  if (!isPresentationView) {
    renderNextPagePreview();
  }

  // 2. Pre-render remaining pages in background batches
  const otherPages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (!priorityPages.includes(i) && !pageCache[i]) {
      otherPages.push(i);
    }
  }

  const BATCH_SIZE = 4;
  for (let i = 0; i < otherPages.length; i += BATCH_SIZE) {
    const batch = otherPages.slice(i, i + BATCH_SIZE).map(p => renderPage(p));
    await Promise.all(batch);
  }
}

// Blit the cached page onto the display canvas, then redraw drawings
async function renderActivePage() {
  const canvas = isPresentationView ? el.presentationCanvas : el.mainPreviewCanvas;
  if (!canvas || !pdfDoc) return;

  // If cache is empty or scale changed, re-render cache (e.g. after resize)
  const firstPage = await pdfDoc.getPage(1);
  const viewport1 = firstPage.getViewport({ scale: 1 });
  const currentScale = getDisplayScale(viewport1);
  if (Math.abs(currentScale - pageCacheScale) > 0.001) {
    await preRenderAllPages();
  }

  const cached = pageCache[currentPageNum];
  if (!cached) {
    // Fallback: render on-demand if cache missed
    await renderPageOnDemand(canvas, currentPageNum);
    return;
  }

  // Instant blit from cache
  canvas.width = cached.width;
  canvas.height = cached.height;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(cached, 0, 0);

  // Redraw drawings on top
  redrawPageDrawings(canvas);
}

// Fallback on-demand renderer (used when cache misses)
async function renderPageOnDemand(canvas, pageNum) {
  if (currentRenderTask) {
    try { currentRenderTask.cancel(); } catch (e) { }
    currentRenderTask = null;
  }

  const page = await pdfDoc.getPage(pageNum);
  const context = canvas.getContext('2d');
  context.setTransform(1, 0, 0, 1, 0, 0);

  let containerWidth, containerHeight;
  if (isPresentationView) {
    containerWidth = window.innerWidth;
    containerHeight = window.innerHeight;
  } else {
    const wrapperRect = el.previewWrapper.getBoundingClientRect();
    containerWidth = wrapperRect.width;
    containerHeight = wrapperRect.height;
  }

  const viewport = page.getViewport({ scale: 1 });
  const scale = isPresentationView
    ? Math.min(containerWidth / viewport.width, containerHeight / viewport.height)
    : Math.min(containerWidth / viewport.width, containerHeight / viewport.height) * 0.95;
  const scaledViewport = page.getViewport({ scale });

  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;

  currentRenderTask = page.render({ canvasContext: context, viewport: scaledViewport });
  try {
    await currentRenderTask.promise;
  } catch (err) {
    if (err && err.name === 'RenderingCancelledException') return;
  } finally {
    currentRenderTask = null;
  }

  redrawPageDrawings(canvas);
}

async function renderNextPagePreview() {
  if (!pdfDoc) return;

  // Next Slide (+1)
  if (currentPageNum + 1 > totalPages) {
    if (el.nextEmptyState) el.nextEmptyState.classList.remove('hidden');
    if (el.nextPreviewCanvas) el.nextPreviewCanvas.classList.add('hidden');
  } else {
    if (el.nextEmptyState) el.nextEmptyState.classList.add('hidden');
    if (el.nextPreviewCanvas) el.nextPreviewCanvas.classList.remove('hidden');
    await renderPreviewCanvas(currentPageNum + 1, el.nextPreviewCanvas);
  }

  // Slide After Next (+2)
  if (currentPageNum + 2 > totalPages) {
    if (el.nextEmptyState2) el.nextEmptyState2.classList.remove('hidden');
    if (el.nextPreviewCanvas2) el.nextPreviewCanvas2.classList.add('hidden');
  } else {
    if (el.nextEmptyState2) el.nextEmptyState2.classList.add('hidden');
    if (el.nextPreviewCanvas2) el.nextPreviewCanvas2.classList.remove('hidden');
    await renderPreviewCanvas(currentPageNum + 2, el.nextPreviewCanvas2);
  }
}

async function renderPreviewCanvas(pageNum, canvas) {
  if (!canvas || !pdfDoc || pageNum < 1 || pageNum > totalPages) return;
  const ctx = canvas.getContext('2d');

  // Instant blit from preloaded page cache if available
  const cached = pageCache[pageNum];
  if (cached) {
    canvas.width = cached.width;
    canvas.height = cached.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cached, 0, 0);
    redrawPageDrawings(canvas, pageNum);
    return;
  }

  // Fallback: render on-demand if cache is not yet ready
  const page = await pdfDoc.getPage(pageNum);
  const box = canvas.parentElement.getBoundingClientRect();
  const viewport = page.getViewport({ scale: 1 });
  const boxW = box.width || 360;
  const boxH = box.height || 180;
  const scale = Math.min(boxW / viewport.width, boxH / viewport.height) * 0.95;
  const scaledViewport = page.getViewport({ scale: scale > 0 ? scale : 1 });

  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;

  const renderContext = {
    canvasContext: ctx,
    viewport: scaledViewport
  };
  await page.render(renderContext).promise;
  redrawPageDrawings(canvas, pageNum);
}


// --- INTERACTIVE TOOLS: DRAWING AND LASER ---
function toggleTool(tool) {
  if (activeTool === tool) {
    activeTool = null;
  } else {
    activeTool = tool;
  }

  // Update UI buttons
  if (el.btnLaser) el.btnLaser.classList.toggle('active', activeTool === 'laser');
  if (el.btnDraw) el.btnDraw.classList.toggle('active', activeTool === 'draw');

  const isLaser = activeTool === 'laser';
  if (el.controllerLaserPointer) {
    el.controllerLaserPointer.classList.toggle('hidden', !isLaser);
  }

  // Notify laser status change
  channel.postMessage({ type: 'LASER_TOGGLE', active: isLaser });

  // Reset cursor style
  if (el.mainPreviewCanvas) {
    if (activeTool === 'draw') {
      el.mainPreviewCanvas.style.cursor = 'crosshair';
    } else if (activeTool === 'laser') {
      el.mainPreviewCanvas.style.cursor = 'none';
    } else {
      el.mainPreviewCanvas.style.cursor = 'default';
    }
  }
}

function setupDrawingInteractions() {
  const canvas = el.mainPreviewCanvas;
  if (!canvas) return;

  let lastX = 0;
  let lastY = 0;

  function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      pctX: ((clientX - rect.left) / rect.width) * 100,
      pctY: ((clientY - rect.top) / rect.height) * 100
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    if (!pdfDoc) return;
    const coords = getCoords(e);

    if (activeTool === 'draw') {
      isDrawing = true;
      lastX = (coords.pctX / 100) * canvas.width;
      lastY = (coords.pctY / 100) * canvas.height;

      const strokeWidth = drawWidth;
      const strokeOpacity = 1.0;

      if (!drawingsHistory[currentPageNum]) {
        drawingsHistory[currentPageNum] = [];
      }
      drawingsHistory[currentPageNum].push({
        color: drawColor,
        width: strokeWidth,
        opacity: strokeOpacity,
        points: [{ x: coords.pctX / 100, y: coords.pctY / 100 }]
      });

      channel.postMessage({
        type: 'DRAW_START',
        x: coords.pctX,
        y: coords.pctY,
        color: drawColor,
        width: strokeWidth,
        opacity: strokeOpacity
      });
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!pdfDoc) return;
    const coords = getCoords(e);

    // Laser Tracking (Controller Live Preview + Presentation)
    if (activeTool === 'laser') {
      if (el.controllerLaserPointer) {
        el.controllerLaserPointer.classList.remove('hidden');
        el.controllerLaserPointer.style.left = `${coords.pctX}%`;
        el.controllerLaserPointer.style.top = `${coords.pctY}%`;
      }
      channel.postMessage({ type: 'LASER_MOVE', x: coords.pctX, y: coords.pctY });
    }

    // Drawing (Pen)
    if (isDrawing && activeTool === 'draw') {
      const ctx = canvas.getContext('2d');
      const currentX = (coords.pctX / 100) * canvas.width;
      const currentY = (coords.pctY / 100) * canvas.height;

      const currentPath = drawingsHistory[currentPageNum][drawingsHistory[currentPageNum].length - 1];

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(currentX, currentY);
      ctx.strokeStyle = currentPath.color;
      ctx.lineWidth = currentPath.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = currentPath.opacity;
      ctx.stroke();
      ctx.restore();

      lastX = currentX;
      lastY = currentY;

      currentPath.points.push({ x: coords.pctX / 100, y: coords.pctY / 100 });

      channel.postMessage({ type: 'DRAW_MOVE', x: coords.pctX, y: coords.pctY });
    }
  });

  canvas.addEventListener('mouseup', () => {
    if (isDrawing) {
      isDrawing = false;
      channel.postMessage({ type: 'DRAW_END' });
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (isDrawing) {
      isDrawing = false;
      channel.postMessage({ type: 'DRAW_END' });
    }
    if (activeTool === 'laser') {
      if (el.controllerLaserPointer) el.controllerLaserPointer.classList.add('hidden');
      channel.postMessage({ type: 'LASER_TOGGLE', active: false });
    }
  });

  canvas.addEventListener('mouseenter', () => {
    if (activeTool === 'laser') {
      if (el.controllerLaserPointer) el.controllerLaserPointer.classList.remove('hidden');
      channel.postMessage({ type: 'LASER_TOGGLE', active: true });
    }
  });
}

// Remote Draw Synchronization (Presentation Screen side)
let remoteCtx = null;
let currentRemotePath = null;

function startRemoteDrawing(pctX, pctY, color, width, opacity) {
  const canvas = el.presentationCanvas;
  if (!canvas) return;

  remoteCtx = canvas.getContext('2d');
  const x = (pctX / 100) * canvas.width;
  const y = (pctY / 100) * canvas.height;

  remoteCtx.beginPath();
  remoteCtx.moveTo(x, y);

  if (!drawingsHistory[currentPageNum]) {
    drawingsHistory[currentPageNum] = [];
  }

  currentRemotePath = {
    color: color || drawColor,
    width: width || drawWidth,
    opacity: opacity !== undefined ? opacity : 1.0,
    points: [{ x: pctX / 100, y: pctY / 100 }]
  };
  drawingsHistory[currentPageNum].push(currentRemotePath);
}

function drawRemote(pctX, pctY) {
  if (!remoteCtx || !el.presentationCanvas || !currentRemotePath) return;
  const canvas = el.presentationCanvas;
  const x = (pctX / 100) * canvas.width;
  const y = (pctY / 100) * canvas.height;

  remoteCtx.save();
  remoteCtx.lineTo(x, y);
  remoteCtx.strokeStyle = currentRemotePath.color;
  remoteCtx.lineWidth = currentRemotePath.width;
  remoteCtx.lineCap = 'round';
  remoteCtx.lineJoin = 'round';
  remoteCtx.globalAlpha = currentRemotePath.opacity !== undefined ? currentRemotePath.opacity : 1.0;
  remoteCtx.stroke();
  remoteCtx.restore();

  currentRemotePath.points.push({ x: pctX / 100, y: pctY / 100 });
}

function endRemoteDrawing() {
  remoteCtx = null;
  currentRemotePath = null;
}

function redrawPageDrawings(canvas, targetPageNum = currentPageNum) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const pagePaths = drawingsHistory[targetPageNum];
  if (!pagePaths || pagePaths.length === 0) return;

  pagePaths.forEach(path => {
    if (path.points.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = path.color;
    ctx.lineWidth = path.width || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = path.opacity !== undefined ? path.opacity : 1.0;

    ctx.moveTo(path.points[0].x * canvas.width, path.points[0].y * canvas.height);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x * canvas.width, path.points[i].y * canvas.height);
    }
    ctx.stroke();
    ctx.restore();
  });
}

function clearDrawingCanvas(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function clearLocalAndRemoteDrawings() {
  drawingsHistory[currentPageNum] = [];
  renderActivePage();
  if (!isPresentationView) {
    channel.postMessage({ type: 'DRAW_CLEAR' });
  }
}

function undoLastStroke() {
  if (drawingsHistory[currentPageNum] && drawingsHistory[currentPageNum].length > 0) {
    drawingsHistory[currentPageNum].pop();
    renderActivePage();
    if (!isPresentationView) {
      channel.postMessage({ type: 'DRAW_UNDO' });
    }
  }
}

function setDrawColor(color) {
  drawColor = color;
  // Update trigger button dot to show active color
  if (el.activeColorDot) el.activeColorDot.style.background = color;
  // Update active state inside popup
  document.querySelectorAll('.color-btn').forEach(s => {
    s.classList.toggle('active', s.dataset.color === color);
  });
  // Close popup
  if (el.colorPopup) el.colorPopup.classList.remove('open');
  // Sync to presentation screen
  channel.postMessage({ type: 'DRAW_COLOR', color });
  // Auto-activate draw tool when a color is picked
  if (activeTool !== 'draw') {
    toggleTool('draw');
  }
}

async function refreshAspectSize() {
  if (!pdfDoc) return;
  try {
    const firstPage = await pdfDoc.getPage(1);
    const vp = firstPage.getViewport({ scale: 1 });
    if (el.mainPreviewBox) {
      el.mainPreviewBox.style.setProperty('--pdf-ratio', `${vp.width} / ${vp.height}`);
    }
    pageCacheScale = 0;
    await preRenderAllPages();
    await renderActivePage();
    if (!isPresentationView) {
      renderNextPagePreview();
    }
  } catch (err) {
    console.error('Error refreshing aspect size: ', err);
  }
}
