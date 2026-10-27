/**
 * FARM FRESH CHOCOLATE MILK - HIGH PERFORMANCE SCROLL ENGINE
 * 151 Frames Canvas Rendering with RAF Interpolation & Interactive UI
 */

const TOTAL_FRAMES = 151;
const FRAME_PATH_PREFIX = 'assets/frames/ezgif-frame-';
const FRAME_EXTENSION = '.jpg';

// DOM Elements
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const scrollTrack = document.getElementById('scroll-experience');
const preloader = document.getElementById('preloader');
const progressBar = document.getElementById('progress-bar');
const loaderStatus = document.getElementById('loader-status');
const loaderPercent = document.getElementById('loader-percent');

// Story Overlays
const scene1 = document.getElementById('scene-1');
const scene2 = document.getElementById('scene-2');
const scene3 = document.getElementById('scene-3');
const scene4 = document.getElementById('scene-4');
const scrollPrompt = document.getElementById('scroll-prompt');

// Scrubber Controls
const frameSlider = document.getElementById('frame-slider');
const currentFrameNum = document.getElementById('current-frame-num');
const btnPlayPause = document.getElementById('btn-play-pause');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const btnReset = document.getElementById('btn-reset');

// Audio Toggle
const audioToggle = document.getElementById('audio-toggle');
const audioStatusText = document.getElementById('audio-status-text');

// State Variables
const images = [];
let loadedCount = 0;
let targetFrame = 0;
let currentFrame = 0;
let lastRenderedFrame = -1;
let isPlaying = false;
let playInterval = null;
let audioContext = null;
let isAudioActive = false;
let lastAudioTriggerTime = 0;

// Setup High-DPI Canvas
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.scale(dpr, dpr);
  renderFrame(Math.round(currentFrame));
}

window.addEventListener('resize', resizeCanvas);

// Render Single Frame to Canvas with Aspect-Fit
function renderFrame(index) {
  const safeIndex = Math.max(0, Math.min(TOTAL_FRAMES - 1, index));
  const img = images[safeIndex];

  if (!img || !img.complete) return;

  const dpr = window.devicePixelRatio || 1;
  const canvasW = canvas.width / dpr;
  const canvasH = canvas.height / dpr;

  // Clear canvas with dark chocolate base
  ctx.fillStyle = '#0a0403';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Contain fit calculation
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const canvasAspect = canvasW / canvasH;

  let drawW, drawH;
  if (canvasAspect > imgAspect) {
    // Screen is wider than image
    drawH = canvasH;
    drawW = canvasH * imgAspect;
  } else {
    // Screen is taller than image
    drawW = canvasW;
    drawH = canvasW / imgAspect;
  }

  // Slight zoom for heroic feel on larger screens
  const scaleMultiplier = window.innerWidth > 900 ? 1.06 : 1.0;
  const finalW = drawW * scaleMultiplier;
  const finalH = drawH * scaleMultiplier;

  const x = (canvasW - finalW) / 2;
  const y = (canvasH - finalH) / 2;

  ctx.drawImage(img, x, y, finalW, finalH);
  lastRenderedFrame = safeIndex;

  // Update Scrubber UI
  currentFrameNum.textContent = String(safeIndex + 1).padStart(3, '0');
  frameSlider.value = safeIndex;

  // Trigger sensory tone if active
  if (isAudioActive) {
    triggerSensoryAudio(safeIndex);
  }
}

// Preload All 151 Images
function preloadImages() {
  for (let i = 1; i <= TOTAL_FRAMES; i++) {
    const img = new Image();
    const formattedIndex = String(i).padStart(3, '0');
    img.src = `${FRAME_PATH_PREFIX}${formattedIndex}${FRAME_EXTENSION}`;

    img.onload = () => {
      loadedCount++;
      const progress = Math.round((loadedCount / TOTAL_FRAMES) * 100);
      progressBar.style.width = `${progress}%`;
      loaderStatus.textContent = `Loading frames: ${loadedCount} / ${TOTAL_FRAMES}`;
      loaderPercent.textContent = `${progress}%`;

      // Render initial frame as soon as frame 1 is ready
      if (i === 1) {
        resizeCanvas();
        renderFrame(0);
      }

      if (loadedCount === TOTAL_FRAMES) {
        onAllFramesLoaded();
      }
    };

    img.onerror = () => {
      console.warn(`Frame ${i} failed to load, retrying...`);
      loadedCount++;
      if (loadedCount === TOTAL_FRAMES) {
        onAllFramesLoaded();
      }
    };

    images.push(img);
  }
}

function onAllFramesLoaded() {
  setTimeout(() => {
    preloader.classList.add('hidden');
    resizeCanvas();
    renderFrame(0);
  }, 350);
}

// Compute Target Frame from Scroll Track Position
function updateScrollProgress() {
  if (isPlaying) return; // Allow auto-play override

  const trackRect = scrollTrack.getBoundingClientRect();
  const maxScroll = trackRect.height - window.innerHeight;
  const scrolled = -trackRect.top;

  const progress = Math.max(0, Math.min(1, scrolled / maxScroll));
  targetFrame = progress * (TOTAL_FRAMES - 1);

  // Update Overlays based on Progress
  updateStoryScenes(progress);

  // Fade out scroll prompt once scrolling started
  if (progress > 0.02) {
    scrollPrompt.classList.add('faded');
  } else {
    scrollPrompt.classList.remove('faded');
  }
}

// Update Scene Overlay Visibility
function updateStoryScenes(progress) {
  // Scene 1: 0% - 21%
  if (progress >= 0.00 && progress <= 0.21) {
    scene1.classList.add('visible');
  } else {
    scene1.classList.remove('visible');
  }

  // Scene 2: 24% - 49%
  if (progress >= 0.24 && progress <= 0.49) {
    scene2.classList.add('visible');
  } else {
    scene2.classList.remove('visible');
  }

  // Scene 3: 52% - 76%
  if (progress >= 0.52 && progress <= 0.76) {
    scene3.classList.add('visible');
  } else {
    scene3.classList.remove('visible');
  }

  // Scene 4: 80% - 100%
  if (progress >= 0.80 && progress <= 1.00) {
    scene4.classList.add('visible');
  } else {
    scene4.classList.remove('visible');
  }
}

// Silky Smooth RAF Animation Loop with Lerp
function animationLoop() {
  // Lerp smoothing
  const diff = targetFrame - currentFrame;
  if (Math.abs(diff) > 0.01) {
    currentFrame += diff * 0.16;
  } else {
    currentFrame = targetFrame;
  }

  const frameToRender = Math.round(currentFrame);
  if (frameToRender !== lastRenderedFrame) {
    renderFrame(frameToRender);
  }

  requestAnimationFrame(animationLoop);
}

// Scroll Event
window.addEventListener('scroll', updateScrollProgress, { passive: true });

// Scrubber Slider Interaction
frameSlider.addEventListener('input', (e) => {
  stopAutoPlay();
  const frameVal = parseInt(e.target.value, 10);
  targetFrame = frameVal;
  currentFrame = frameVal;

  // Synchronize window scroll position to match slider
  const trackRect = scrollTrack.getBoundingClientRect();
  const trackTop = window.scrollY + trackRect.top;
  const maxScroll = trackRect.height - window.innerHeight;
  const targetScrollY = trackTop + (frameVal / (TOTAL_FRAMES - 1)) * maxScroll;

  window.scrollTo({
    top: targetScrollY,
    behavior: 'auto'
  });

  updateStoryScenes(frameVal / (TOTAL_FRAMES - 1));
});

// Auto-Play Controls
function startAutoPlay() {
  isPlaying = true;
  iconPlay.classList.add('hidden');
  iconPause.classList.remove('hidden');

  if (currentFrame >= TOTAL_FRAMES - 1) {
    currentFrame = 0;
    targetFrame = 0;
  }

  playInterval = setInterval(() => {
    if (targetFrame < TOTAL_FRAMES - 1) {
      targetFrame += 1;
      currentFrame = targetFrame;
      const progress = targetFrame / (TOTAL_FRAMES - 1);
      updateStoryScenes(progress);

      // Scroll with animation
      const trackRect = scrollTrack.getBoundingClientRect();
      const trackTop = window.scrollY + trackRect.top;
      const maxScroll = trackRect.height - window.innerHeight;
      window.scrollTo({
        top: trackTop + progress * maxScroll,
        behavior: 'auto'
      });
    } else {
      stopAutoPlay();
    }
  }, 40); // 25 fps playback
}

function stopAutoPlay() {
  isPlaying = false;
  clearInterval(playInterval);
  iconPlay.classList.remove('hidden');
  iconPause.classList.add('hidden');
}

btnPlayPause.addEventListener('click', () => {
  if (isPlaying) {
    stopAutoPlay();
  } else {
    startAutoPlay();
  }
});

btnReset.addEventListener('click', () => {
  stopAutoPlay();
  targetFrame = 0;
  currentFrame = 0;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateStoryScenes(0);
});

// Replay Animation Buttons
document.querySelectorAll('.replay-scroll-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      startAutoPlay();
    }, 600);
  });
});

// Modal Logic
function openOrderModal() {
  const modal = document.getElementById('order-modal');
  if (modal) modal.showModal();
}

function closeOrderModal() {
  const modal = document.getElementById('order-modal');
  if (modal) modal.close();
}

window.openOrderModal = openOrderModal;
window.closeOrderModal = closeOrderModal;

// Ambient Web Audio Synthesizer (Liquid Drops & Warm Chords)
function initAudio() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function triggerSensoryAudio(frameIndex) {
  const now = performance.now();
  if (now - lastAudioTriggerTime < 80) return; // Throttle
  lastAudioTriggerTime = now;

  if (!audioContext || audioContext.state !== 'running') return;

  try {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    // Map frame 0..150 to a warm pentatonic frequency (220Hz to 660Hz)
    const baseFreq = 220 + (frameIndex / TOTAL_FRAMES) * 330;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, audioContext.currentTime + 0.12);

    gain.gain.setValueAtTime(0.04, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start();
    osc.stop(audioContext.currentTime + 0.13);
  } catch (e) {
    // Graceful fallback
  }
}

audioToggle.addEventListener('click', () => {
  initAudio();
  isAudioActive = !isAudioActive;

  if (isAudioActive) {
    audioToggle.classList.add('active');
    audioStatusText.textContent = 'ON';
    // Initial soothing tone
    triggerSensoryAudio(Math.round(currentFrame));
  } else {
    audioToggle.classList.remove('active');
    audioStatusText.textContent = 'OFF';
  }
});

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  preloadImages();
  resizeCanvas();
  requestAnimationFrame(animationLoop);
  updateScrollProgress();
});
