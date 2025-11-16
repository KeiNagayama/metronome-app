// ===== Metronome core state =====
let audioCtx = null;
let isPlaying = false;

const STEP_OPTIONS = [1, 5, 10];
const RANGE_MIN_LIMIT = 40;
const RANGE_MAX_LIMIT = 300;
const RANGE_STEP = 10;

let bpm = 100;
let subdivision = 1; // 1 = quarter, 2 = eighth, 4 = sixteenth
let stepSize = 5;
let rangeMin = 50;
let rangeMax = 150;

const beatsPerBar = 4;    // 4/4 拍子
let currentSubStep = 0;   // 0 .. subdivision-1
let currentBeatInBar = 0; // 0..3

const lookahead = 25;          // ms: how often to check
const scheduleAheadTime = 0.1; // seconds
let nextNoteTime = 0.0;
let schedulerTimerId = null;

// ===== DOM refs =====
let bpmSlider,
  bpmValueLabel,
  bpmUpBtn,
  bpmDownBtn,
  toggleBtn,
  pulseDot,
  subdivisionGroup,
  stepPill,
  rangeMinBtn,
  rangeMaxBtn,
  rangeMinMenu,
  rangeMaxMenu,
  rangeMinControl,
  rangeMaxControl,
  openRangeControl,
  bpmScaleLabels,
  pulseBeats,
  beatDots;

// ===== UI helpers =====
function clampBpm(value) {
  return Math.max(rangeMin, Math.min(rangeMax, value));
}

function updateBpmDisplay(value) {
  bpm = clampBpm(value);
  if (bpmValueLabel) bpmValueLabel.textContent = bpm;
}

function updateStepSize(value) {
  stepSize = value;
  if (bpmSlider) {
    bpmSlider.step = stepSize;
    const snapped = clampBpm(Math.round(bpm / stepSize) * stepSize);
    bpmSlider.value = snapped;
    updateBpmDisplay(snapped);
  }
  if (stepPill) {
    stepPill.textContent = `${stepSize} BPM`;
  }
  if (bpmUpBtn) {
    bpmUpBtn.textContent = `+${stepSize}`;
    bpmUpBtn.setAttribute("aria-label", `Increase BPM by ${stepSize}`);
  }
  if (bpmDownBtn) {
    bpmDownBtn.textContent = `-${stepSize}`;
    bpmDownBtn.setAttribute("aria-label", `Decrease BPM by ${stepSize}`);
  }
}

function cycleStepSize(direction = 1) {
  const currentIndex = STEP_OPTIONS.indexOf(stepSize);
  const nextIndex = (currentIndex + direction + STEP_OPTIONS.length) % STEP_OPTIONS.length;
  const nextValue = STEP_OPTIONS[nextIndex];
  updateStepSize(nextValue);
}

function refreshScaleLabels() {
  if (!bpmScaleLabels || bpmScaleLabels.length === 0) return;
  const step = (rangeMax - rangeMin) / (bpmScaleLabels.length - 1);
  bpmScaleLabels.forEach((label, idx) => {
    const value = Math.round(rangeMin + step * idx);
    label.textContent = value;
  });
}

function updateRange(min = rangeMin, max = rangeMax) {
  const boundedMin = Math.max(RANGE_MIN_LIMIT, Math.min(min, RANGE_MAX_LIMIT));
  const boundedMax = Math.max(boundedMin, Math.min(max, RANGE_MAX_LIMIT));
  rangeMin = Math.min(boundedMin, boundedMax);
  rangeMax = Math.max(boundedMin, boundedMax);

  if (rangeMinBtn) {
    rangeMinBtn.textContent = `${rangeMin}`;
    rangeMinBtn.setAttribute("aria-label", `Minimum ${rangeMin} BPM`);
  }
  if (rangeMaxBtn) {
    rangeMaxBtn.textContent = `${rangeMax}`;
    rangeMaxBtn.setAttribute("aria-label", `Maximum ${rangeMax} BPM`);
  }

  if (bpmSlider) {
    bpmSlider.min = rangeMin;
    bpmSlider.max = rangeMax;
    const snapped = clampBpm(Math.round(bpm / stepSize) * stepSize);
    bpmSlider.value = snapped;
    updateBpmDisplay(snapped);
  } else {
    updateBpmDisplay(bpm);
  }

  refreshScaleLabels();
}

function buildRangeMenu(type) {
  const isMin = type === "min";
  const menu = isMin ? rangeMinMenu : rangeMaxMenu;
  if (!menu) return;
  menu.innerHTML = "";

  const start = isMin ? RANGE_MIN_LIMIT : rangeMin;
  const end = isMin ? rangeMax : RANGE_MAX_LIMIT;

  for (let value = start; value <= end; value += RANGE_STEP) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${value}`;
    if ((isMin && value === rangeMin) || (!isMin && value === rangeMax)) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => {
      if (isMin) {
        updateRange(value, rangeMax);
      } else {
        updateRange(rangeMin, value);
      }
      closeRangeMenus();
    });
    menu.appendChild(btn);
  }
}

function openRangeMenu(type) {
  const control = type === "min" ? rangeMinControl : rangeMaxControl;
  if (!control) return;

  if (openRangeControl && openRangeControl !== control) {
    openRangeControl.classList.remove("open");
    const btn = openRangeControl.querySelector(".range-trigger");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  const isOpen = control.classList.toggle("open");
  const btn = control.querySelector(".range-trigger");
  if (btn) btn.setAttribute("aria-expanded", isOpen ? "true" : "false");

  if (isOpen) {
    buildRangeMenu(type);
    openRangeControl = control;
  } else {
    openRangeControl = null;
  }
}

function closeRangeMenus() {
  if (openRangeControl) {
    openRangeControl.classList.remove("open");
    const btn = openRangeControl.querySelector(".range-trigger");
    if (btn) btn.setAttribute("aria-expanded", "false");
    openRangeControl = null;
  }
}

// Defer DOM queries and listener setup until the document is ready
document.addEventListener("DOMContentLoaded", () => {
  bpmSlider = document.getElementById("bpmSlider");
  bpmValueLabel = document.getElementById("bpmValue");
  bpmUpBtn = document.getElementById("bpmUp");
  bpmDownBtn = document.getElementById("bpmDown");
  toggleBtn = document.getElementById("toggleBtn");
  stepPill = document.getElementById("stepPill");
  rangeMinBtn = document.getElementById("rangeMinBtn");
  rangeMaxBtn = document.getElementById("rangeMaxBtn");
  rangeMinMenu = document.getElementById("rangeMinMenu");
  rangeMaxMenu = document.getElementById("rangeMaxMenu");
  rangeMinControl = document.querySelector('.range-control[data-type="min"]');
  rangeMaxControl = document.querySelector('.range-control[data-type="max"]');
  bpmScaleLabels = document.querySelectorAll(".bpm-scale span");
  // try multiple selectors to remain compatible with different HTML variants
  pulseDot = document.getElementById("pulseDot") || document.querySelector(".pulse-dot");
  subdivisionGroup = document.getElementById("subdivisionGroup");
  // some markup uses id="pulseBeats", older file uses id="beatsRow"
  pulseBeats = document.getElementById("pulseBeats") || document.getElementById("beatsRow");
  beatDots = pulseBeats ? pulseBeats.querySelectorAll(".beat-dot") : [];

  if (bpmSlider) {
    bpmSlider.step = stepSize;
    bpmSlider.addEventListener("input", (e) => {
      updateBpmDisplay(parseInt(e.target.value, 10));
    });
  }

  if (bpmUpBtn) {
    bpmUpBtn.addEventListener("click", () => {
      const next = clampBpm(bpm + stepSize);
      if (bpmSlider) bpmSlider.value = next;
      updateBpmDisplay(next);
    });
  }

  if (bpmDownBtn) {
    bpmDownBtn.addEventListener("click", () => {
      const next = clampBpm(bpm - stepSize);
      if (bpmSlider) bpmSlider.value = next;
      updateBpmDisplay(next);
    });
  }

  if (stepPill) {
    stepPill.addEventListener("click", () => cycleStepSize(1));
    stepPill.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cycleStepSize(1);
      }
    });
  }
  if (rangeMinBtn && rangeMinControl) {
    rangeMinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openRangeMenu("min");
    });
  }

  if (rangeMaxBtn && rangeMaxControl) {
    rangeMaxBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openRangeMenu("max");
    });
  }

  document.addEventListener("click", (e) => {
    if (openRangeControl && !openRangeControl.contains(e.target)) {
      closeRangeMenus();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeRangeMenus();
    }
  });

  updateRange(rangeMin, rangeMax);
  updateStepSize(stepSize);

  if (subdivisionGroup) {
    subdivisionGroup.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-subdiv]");
      if (!btn) return;
      const value = parseInt(btn.getAttribute("data-subdiv"), 10);
      subdivision = value;

      subdivisionGroup
        .querySelectorAll(".subdivision-option")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (!isPlaying) {
        startMetronome();
      } else {
        stopMetronome();
      }
    });
  }
});

// ===== Audio init =====
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } else if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

// ===== Click scheduling =====
function scheduleClick(time, isBarAccent, isBeatAccent) {
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  const duration = 0.04; // seconds

  // 音の高さを 3 段階にする:
  // 小節頭 > 各拍頭 > 細分
  let freq;
  if (isBarAccent) {
    freq = 1400;
  } else if (isBeatAccent) {
    freq = 1000;
  } else {
    freq = 750;
  }
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.6, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(time);
  osc.stop(time + duration);
}

function pulseVisual(isBarAccent, isBeatAccent) {
  // central pulse (guard if element is missing)
  if (!pulseDot) return;

  pulseDot.classList.add("active");
  if (isBarAccent) {
    pulseDot.style.boxShadow =
      "0 0 30px rgba(236, 246, 255, 0.95), 0 0 80px rgba(34, 211, 238, 0.9)";
  } else if (isBeatAccent) {
    pulseDot.style.boxShadow =
      "0 0 26px rgba(79, 209, 197, 0.95), 0 0 70px rgba(34, 211, 238, 0.85)";
  } else {
    pulseDot.style.boxShadow =
      "0 0 20px rgba(79, 209, 197, 0.7), 0 0 50px rgba(79, 209, 197, 0.4)";
  }

  setTimeout(() => {
    if (!pulseDot) return;
    pulseDot.classList.remove("active");
    pulseDot.style.boxShadow =
      "0 0 24px rgba(79, 209, 197, 0.8), 0 0 60px rgba(79, 209, 197, 0.3)";
  }, 90);
}

function updateBeatRow(beatIndex, isBarAccent) {
  beatDots.forEach((dot, i) => {
    const active = i === beatIndex;
    dot.classList.toggle("active", active);

    // bar accent は1拍目でactiveのときだけ
    dot.classList.toggle("bar-accent", active && isBarAccent);
  });
}


// 次のクリック（音）までの時間をセット
function advanceNote() {
  const secondsPerBeat = 60.0 / bpm;
  const interval = secondsPerBeat / subdivision;

  nextNoteTime += interval;

  currentSubStep++;
  if (currentSubStep >= subdivision) {
    currentSubStep = 0;
    currentBeatInBar = (currentBeatInBar + 1) % beatsPerBar;
  }
}

// Web Audio scheduler
function scheduler() {
  if (!audioCtx) return;

  while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
    const isBeatAccent = currentSubStep === 0;
    const isBarAccent = isBeatAccent && currentBeatInBar === 0;

    scheduleClick(nextNoteTime, isBarAccent, isBeatAccent);
    pulseVisual(isBarAccent, isBeatAccent);
    if (isBeatAccent) {
      updateBeatRow(currentBeatInBar, isBarAccent);
    }

    advanceNote();
  }

  schedulerTimerId = setTimeout(scheduler, lookahead);
}

// ===== Start / Stop =====
function startMetronome() {
  if (isPlaying) return;
  initAudio();
  if (!audioCtx) return;

  isPlaying = true;
  if (toggleBtn) {
    toggleBtn.classList.add("stop");
    toggleBtn.setAttribute('aria-label', 'Stop metronome');
  }

  currentSubStep = 0;
  currentBeatInBar = 0;
  updateBeatRow(0, true);

  nextNoteTime = audioCtx.currentTime + 0.1;

  scheduler();
}

function stopMetronome() {
  isPlaying = false;
  if (toggleBtn) {
    toggleBtn.classList.remove("stop");
    toggleBtn.setAttribute('aria-label', 'Start metronome');
  }
  if (schedulerTimerId) {
    clearTimeout(schedulerTimerId);
    schedulerTimerId = null;
  }
}
// iOS 対策：初回タップまでは AudioContext を作らない
document.addEventListener(
  "touchstart",
  function onceTouch() {
    initAudio();
    document.removeEventListener("touchstart", onceTouch);
  },
  { passive: true }
);
