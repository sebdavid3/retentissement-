import "./style.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// ======================================
// DYNAMIC FAVICON (Sine Wave)
// ======================================
(function initDynamicFavicon() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");

  // Fondo negro (#0a0a0a)
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, 32, 32);

  // Onda sinusoidal en blood red (#8b0000)
  ctx.strokeStyle = "#8b0000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  
  for (let x = 0; x <= 32; x++) {
    // 1 ciclo completo en 32px (Math.PI * 2)
    // Amplitud de 8px centrada en vertical (16)
    const y = 16 + Math.sin((x / 32) * Math.PI * 2) * 8;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = canvas.toDataURL();
  document.head.appendChild(link);
})();

gsap.registerPlugin(ScrollTrigger);

const MAX_VOLUME = 0.62;
const INTRO_VOLUME = 0.24;
const CLOSURE_VOLUME = 0.34;
const RAMP_SECONDS = 0.3;
const ENTRY_GATE_FADE_MS = 280;
const SPECTROGRAM_MIN_FREQ = 60;
const SPECTROGRAM_LABELS = [100, 1000, 5000];

const actSections = Array.from(document.querySelectorAll(".act-section"));
const closureButton = document.getElementById("annular-button");
const closureSection = document.getElementById("closure");
const entryGate = document.getElementById("entry-gate");
const entryButton = document.getElementById("entry-button");

const closureAudio = new Audio("/audio/act4.mp3");
closureAudio.loop = true;
closureAudio.preload = "auto";
closureAudio.volume = 0;
closureAudio.muted = true;
closureAudio.load();

let annihilated = false;
let audioUnlocked = false;
let unlockInProgress = false;
let hasUserScrolled = window.scrollY > 0;
let closurePauseCall = null;
let destroyAct1Spectrogram = null;
let resumeAct1Spectrogram = null;
let userGestureReceived = false;
let experienceStarted = !entryGate;
const unlockedAudios = new Set();

const setClosureVolume = gsap.quickTo(closureAudio, "volume", {
  duration: RAMP_SECONDS,
  ease: "none",
  overwrite: true
});

const unlockEvents = [
  "pointerdown",
  "mousedown",
  "touchstart",
  "touchend",
  "click",
  "keydown",
  "wheel"
];

const closeEntryGate = () => {
  if (!entryGate) {
    return;
  }

  entryGate.classList.add("is-hidden");
  document.body.classList.remove("gate-open");
  window.setTimeout(() => {
    entryGate.remove();
  }, ENTRY_GATE_FADE_MS);
};

const startExperience = () => {
  if (experienceStarted) {
    return;
  }

  experienceStarted = true;
  closeEntryGate();
};

const handleUnlockGesture = () => {
  void unlockAudio(true);
  startExperience();
};

const videoByAct = {
  2: document.getElementById("video-soprano"),
  3: document.getElementById("video-bridge"),
  4: document.getElementById("video-string")
};

const actStates = actSections.map((section) => {
  const audio = new Audio(section.dataset.audio);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  audio.load();

  return {
    section,
    act: Number(section.dataset.act),
    audio,
    progress: 0,
    active: false,
    deactivating: false,
    pauseCall: null,
    setVolume: gsap.quickTo(audio, "volume", {
      duration: RAMP_SECONDS,
      ease: "none",
      overwrite: true
    }),
    video: videoByAct[Number(section.dataset.act)] || null
  };
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function volumeFromProgress(progress, keepTailVolume = false) {
  const p = clamp(progress, 0, 1);

  if (p <= 0) {
    return 0;
  }

  if (p < 0.2) {
    return (p / 0.2) * MAX_VOLUME;
  }

  if (p <= 0.8 || keepTailVolume) {
    return MAX_VOLUME;
  }

  if (p < 1) {
    return ((1 - p) / 0.2) * MAX_VOLUME;
  }

  return 0;
}

function sectionProgress(section) {
  const viewportHeight = window.innerHeight || 1;
  const total = section.offsetHeight - viewportHeight;

  if (total <= 0) {
    return section.getBoundingClientRect().top <= 0 ? 1 : 0;
  }

  return clamp(-section.getBoundingClientRect().top / total, 0, 1);
}

function targetVolume(state, progress) {
  const base = volumeFromProgress(progress, state.act === 4);

  if (state.act === 1 && !hasUserScrolled && !annihilated) {
    return Math.max(base, INTRO_VOLUME);
  }

  return base;
}

function safePlay(media) {
  if (!media) {
    return;
  }

  const playPromise = media.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      // Ignore blocked autoplay; media will retry after user gesture.
    });
  }
}

function activateVideo(video) {
  if (!video || annihilated) {
    return;
  }

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    video.load();
  }

  video.muted = true;
  safePlay(video);
}

function deactivateVideo(video) {
  if (!video) {
    return;
  }

  video.pause();
}

function activateAct(state) {
  if (annihilated) {
    return;
  }

  if (state.pauseCall) {
    state.pauseCall.kill();
    state.pauseCall = null;
  }

  state.active = true;
  state.deactivating = false;

  if (audioUnlocked && unlockedAudios.has(state.audio)) {
    state.audio.muted = false;
    safePlay(state.audio);
  } else {
    state.audio.muted = true;
    state.audio.volume = 0;
    void unlockAudio();
  }

  activateVideo(state.video);
  state.setVolume(targetVolume(state, state.progress));
}

function deactivateAct(state) {
  if (state.deactivating || annihilated) {
    return;
  }

  if (state.pauseCall) {
    state.pauseCall.kill();
    state.pauseCall = null;
  }

  if (state.act === 4) {
    deactivateVideo(state.video);
    state.audio.volume = 0;
    state.audio.pause();
    state.audio.muted = true;
    state.active = false;
    state.deactivating = false;
    return;
  }

  state.deactivating = true;
  state.setVolume(0);

  deactivateVideo(state.video);

  state.pauseCall = gsap.delayedCall(RAMP_SECONDS, () => {
    state.audio.volume = 0;
    state.audio.pause();
    state.audio.muted = true;
    state.active = false;
    state.deactivating = false;
    state.pauseCall = null;
  });
}

function stopAllAudioImmediately() {
  actStates.forEach((state) => {
    if (state.pauseCall) {
      state.pauseCall.kill();
      state.pauseCall = null;
    }

    state.audio.volume = 0;
    state.audio.pause();
    state.audio.muted = true;
    state.active = false;
    state.deactivating = false;

    deactivateVideo(state.video);
  });

  if (closurePauseCall) {
    closurePauseCall.kill();
    closurePauseCall = null;
  }

  closureAudio.volume = 0;
  closureAudio.pause();
  closureAudio.currentTime = 0;
  closureAudio.muted = true;
}

async function unlockAudio(fromGesture = false) {
  if (fromGesture) {
    userGestureReceived = true;
  }

  if (!userGestureReceived) {
    return;
  }

  if (unlockInProgress || annihilated) {
    return;
  }

  unlockInProgress = true;

  if (resumeAct1Spectrogram) {
    await resumeAct1Spectrogram();
  }

  const unlockTargets = [...actStates.map((state) => state.audio), closureAudio];

  const results = await Promise.all(
    unlockTargets.map(async (audio) => {
      if (unlockedAudios.has(audio)) {
        return true;
      }

      try {
        audio.muted = true;
        audio.volume = 0;
        await audio.play();
        unlockedAudios.add(audio);
        return true;
      } catch {
        return false;
      }
    })
  );

  if (unlockedAudios.size === 0 && !results.some(Boolean)) {
    unlockInProgress = false;
    return;
  }

  audioUnlocked = unlockedAudios.size > 0;

  if (unlockedAudios.size === unlockTargets.length) {
    unlockEvents.forEach((eventName) => {
      window.removeEventListener(eventName, handleUnlockGesture);
    });
  }

  actStates.forEach((state) => {
    if (state.active && !state.deactivating && unlockedAudios.has(state.audio)) {
      state.audio.muted = false;
      safePlay(state.audio);
      activateVideo(state.video);
      state.setVolume(targetVolume(state, state.progress));
      return;
    }

    state.audio.volume = 0;
    state.audio.pause();
    state.audio.muted = true;
  });

  closureAudio.volume = 0;
  closureAudio.pause();
  closureAudio.muted = true;

  unlockInProgress = false;
}

if (entryGate) {
  document.body.classList.add("gate-open");
}

unlockEvents.forEach((eventName) => {
  window.addEventListener(eventName, handleUnlockGesture, { passive: true });
});

if (entryButton) {
  entryButton.addEventListener("click", handleUnlockGesture);
}

window.addEventListener(
  "scroll",
  () => {
    if (window.scrollY > 0) {
      hasUserScrolled = true;
    }
  },
  { passive: true }
);

actStates.forEach((state) => {
  const phrases = state.section.querySelectorAll(".act-phrase");
  gsap.set(phrases, { autoAlpha: 0, y: 20 });

  const revealTimeline = gsap.timeline({
    scrollTrigger: {
      trigger: state.section,
      start: "top top",
      end: "bottom bottom",
      scrub: true
    }
  });

  phrases.forEach((phrase, index) => {
    revealTimeline.to(
      phrase,
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.6,
        ease: "power2.out"
      },
      index * 0.45
    );
  });

  revealTimeline.to({}, { duration: 1.2 });

  ScrollTrigger.create({
    trigger: state.section,
    start: "top 130%",
    end: "bottom -30%",
    onEnter: (self) => {
      state.progress = self.progress;
      if (!unlockedAudios.has(state.audio)) {
        void unlockAudio();
      }
      activateAct(state);
    },
    onEnterBack: (self) => {
      state.progress = self.progress;
      if (!unlockedAudios.has(state.audio)) {
        void unlockAudio();
      }
      activateAct(state);
    },
    onLeave: () => {
      if (state.act !== 4) {
        deactivateAct(state);
      }
    },
    onLeaveBack: () => {
      deactivateAct(state);
    },
    onUpdate: (self) => {
      state.progress = self.progress;

      if (!state.active || state.deactivating || annihilated) {
        return;
      }

      state.setVolume(targetVolume(state, self.progress));
    }
  });
});

function primeInitialAct() {
  let anyVisible = false;

  actStates.forEach((state) => {
    state.progress = sectionProgress(state.section);
    const rect = state.section.getBoundingClientRect();
    const isVisible = rect.bottom > 0 && rect.top < window.innerHeight;

    if (isVisible) {
      anyVisible = true;
      activateAct(state);
    }
  });

  if (!anyVisible && actStates[0]) {
    actStates[0].progress = 0;
    activateAct(actStates[0]);
  }
}

function setClosureAmbience(enabled) {
  // Keep Act IV audio continuous into CALLAR. No separate ambience layer.
  return;
}

if (closureSection) {
  ScrollTrigger.create({
    trigger: closureSection,
    start: "top 92%",
    end: "bottom top",
    onEnter: () => setClosureAmbience(true),
    onEnterBack: () => setClosureAmbience(true),
    onLeave: () => setClosureAmbience(false),
    onLeaveBack: () => setClosureAmbience(false),
    onUpdate: (self) => {
      if (self.isActive) {
        setClosureAmbience(true);
      }
    }
  });
}

function initAct1Spectrogram(state) {
  const canvas = document.getElementById("act1-canvas");
  if (!canvas || !state) {
    return {
      destroy: null,
      resume: null
    };
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return {
      destroy: null,
      resume: null
    };
  }

  let frameId = null;
  let canvasDpr = 1;
  let audioContext = null;
  let analyserNode = null;
  let sourceNode = null;
  let analyserInitAttempted = false;
  let frequencyData = new Uint8Array(0);
  let nyquist = 22050;
  let plotX = 72;
  let plotWidth = 8;
  let yToBin = new Uint16Array(0);

  const infernoStops = [
    { stop: 0, rgb: [0, 0, 4] },
    { stop: 0.16, rgb: [31, 12, 72] },
    { stop: 0.32, rgb: [85, 15, 109] },
    { stop: 0.48, rgb: [136, 34, 106] },
    { stop: 0.64, rgb: [186, 54, 85] },
    { stop: 0.8, rgb: [227, 89, 51] },
    { stop: 0.92, rgb: [249, 140, 10] },
    { stop: 1, rgb: [252, 255, 164] }
  ];

  const maxSpectrogramFreq = () => Math.min(5000, nyquist);

  const interpolateHeatColor = (value) => {
    const t = clamp(value, 0, 1);

    for (let i = 1; i < infernoStops.length; i += 1) {
      const left = infernoStops[i - 1];
      const right = infernoStops[i];

      if (t <= right.stop) {
        const span = right.stop - left.stop || 1;
        const ratio = (t - left.stop) / span;
        const r = Math.round(left.rgb[0] + (right.rgb[0] - left.rgb[0]) * ratio);
        const g = Math.round(left.rgb[1] + (right.rgb[1] - left.rgb[1]) * ratio);
        const b = Math.round(left.rgb[2] + (right.rgb[2] - left.rgb[2]) * ratio);
        return `rgb(${r}, ${g}, ${b})`;
      }
    }

    return "rgb(252, 255, 164)";
  };

  const frequencyToY = (frequency, height) => {
    const minFreq = SPECTROGRAM_MIN_FREQ;
    const maxFreq = Math.max(minFreq + 1, maxSpectrogramFreq());
    const clampedFreq = clamp(frequency, minFreq, maxFreq);
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const ratio = (Math.log10(clampedFreq) - logMin) / (logMax - logMin || 1);
    return Math.round((1 - ratio) * (height - 1));
  };

  const rebuildLookup = (height) => {
    if (height <= 0) {
      yToBin = new Uint16Array(0);
      return;
    }

    const bins = Math.max(1, frequencyData.length);
    const minFreq = SPECTROGRAM_MIN_FREQ;
    const maxFreq = Math.max(minFreq + 1, maxSpectrogramFreq());
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    yToBin = new Uint16Array(height);

    for (let y = 0; y < height; y += 1) {
      const ratio = 1 - y / Math.max(1, height - 1);
      const frequency = Math.pow(10, logMin + ratio * (logMax - logMin));
      const bin = Math.round((frequency / nyquist) * (bins - 1));
      yToBin[y] = clamp(bin, 0, bins - 1);
    }
  };

  const ensureAnalyser = () => {
    if (analyserNode || !state.audio) {
      return Boolean(analyserNode);
    }

    if (!userGestureReceived) {
      return false;
    }

    if (analyserInitAttempted) {
      return false;
    }

    analyserInitAttempted = true;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      return false;
    }

    try {
      audioContext = new AudioCtx();
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      analyserNode.smoothingTimeConstant = 0.22;
      analyserNode.minDecibels = -95;
      analyserNode.maxDecibels = -15;

      sourceNode = audioContext.createMediaElementSource(state.audio);
      sourceNode.connect(analyserNode);
      analyserNode.connect(audioContext.destination);

      frequencyData = new Uint8Array(analyserNode.frequencyBinCount);
      nyquist = audioContext.sampleRate / 2;

      const currentHeight = Math.round(canvas.height / canvasDpr);
      rebuildLookup(currentHeight);
      return true;
    } catch {
      analyserNode = null;
      sourceNode = null;
      audioContext = null;
      return false;
    }
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    canvasDpr = clamp(window.devicePixelRatio || 1, 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * canvasDpr));
    canvas.height = Math.max(1, Math.floor(rect.height * canvasDpr));
    context.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
    context.imageSmoothingEnabled = false;

    const width = Math.round(canvas.width / canvasDpr);
    const height = Math.round(canvas.height / canvasDpr);
    plotX = Math.max(66, Math.round(width * 0.13));
    plotWidth = Math.max(10, width - plotX - 2);

    rebuildLookup(height);

    context.fillStyle = "#050505";
    context.fillRect(plotX, 0, plotWidth, height);
  };

  const drawAxis = (width, height) => {
    context.fillStyle = "rgba(10, 10, 10, 0.96)";
    context.fillRect(0, 0, plotX, height);

    context.strokeStyle = "rgba(232, 224, 208, 0.22)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(plotX + 0.5, 0);
    context.lineTo(plotX + 0.5, height);
    context.stroke();

    const fontSize = Math.max(11, Math.round(height * 0.034));
    context.font = `${fontSize}px Georgia`;
    context.textAlign = "left";
    context.textBaseline = "middle";

    const maxFreq = maxSpectrogramFreq();

    const labelInset = Math.max(10, Math.round(fontSize * 0.75));

    SPECTROGRAM_LABELS.forEach((frequency) => {
      if (frequency > maxFreq) {
        return;
      }

      const y = clamp(frequencyToY(frequency, height), labelInset, height - labelInset);

      context.strokeStyle = "rgba(232, 224, 208, 0.16)";
      context.beginPath();
      context.moveTo(plotX + 1, y + 0.5);
      context.lineTo(width, y + 0.5);
      context.stroke();

      context.fillStyle = "#e8e0d0";
      const label = frequency >= 1000 ? `${frequency / 1000}kHz` : `${frequency}Hz`;
      context.fillText(label, 8, y);
    });
  };

  const drawFrame = () => {
    if (annihilated) {
      return;
    }

    ensureAnalyser();

    const width = Math.round(canvas.width / canvasDpr);
    const height = Math.round(canvas.height / canvasDpr);

    if (analyserNode && frequencyData.length > 0) {
      analyserNode.getByteFrequencyData(frequencyData);
    }

    if (plotWidth > 1) {
      context.drawImage(
        canvas,
        (plotX + 1) * canvasDpr,
        0,
        (plotWidth - 1) * canvasDpr,
        height * canvasDpr,
        plotX,
        0,
        plotWidth - 1,
        height
      );
    }

    const columnX = plotX + plotWidth - 1;
    for (let y = 0; y < height; y += 1) {
      const bin = yToBin[y] || 0;
      const magnitude =
        analyserNode && frequencyData.length > 0 ? frequencyData[bin] / 255 : 0;
      context.fillStyle = interpolateHeatColor(magnitude);
      context.fillRect(columnX, y, 1, 1);
    }

    drawAxis(width, height);

    frameId = window.requestAnimationFrame(drawFrame);
  };

  const resume = async () => {
    if (!ensureAnalyser() || !audioContext) {
      return;
    }

    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch {
        // Ignore resume errors; unlock fallback remains active.
      }
    }
  };

  const destroy = () => {
    window.removeEventListener("resize", resize);

    if (frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }

    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }

    if (analyserNode) {
      analyserNode.disconnect();
      analyserNode = null;
    }

    if (audioContext && audioContext.state !== "closed") {
      audioContext.close().catch(() => {
        // Ignore close errors during teardown.
      });
    }

    audioContext = null;
    frequencyData = new Uint8Array(0);
    yToBin = new Uint16Array(0);
  };

  resize();
  window.addEventListener("resize", resize, { passive: true });
  frameId = window.requestAnimationFrame(drawFrame);

  return {
    destroy,
    resume
  };
}

const act1Spectrogram = initAct1Spectrogram(
  actStates.find((state) => state.act === 1)
);
destroyAct1Spectrogram = act1Spectrogram.destroy;
resumeAct1Spectrogram = act1Spectrogram.resume;

primeInitialAct();

const heroContent = document.querySelector(".hero-content");
const act1El = document.getElementById("act1");

if (heroContent && act1El) {
  gsap.set(act1El, { opacity: 0 });

  gsap.timeline({
    scrollTrigger: {
      trigger: "#hero",
      start: "top top",
      end: "bottom top",
      scrub: true
    }
  })
  .to(heroContent, { opacity: 0, ease: "none" }, 0.5)
  .fromTo(act1El, { opacity: 0 }, { opacity: 1, ease: "none" }, 0.5);
}

function initReferencesRipple(section) {
  if (!section) {
    return;
  }

  const rippleLayer = section.querySelector(".references-ripple-layer");
  if (!rippleLayer) {
    return;
  }

  const MOVE_DISTANCE_THRESHOLD = 18;
  const MOVE_TIME_THRESHOLD = 56;
  const MAX_ACTIVE_RINGS = 22;

  let sectionWidth = 1;
  let sectionHeight = 1;
  let activeRings = 0;
  let lastMoveStamp = 0;
  let lastMoveX = 0;
  let lastMoveY = 0;
  let hasLastMove = false;

  const refreshBounds = () => {
    const rect = section.getBoundingClientRect();
    sectionWidth = Math.max(1, Math.round(rect.width));
    sectionHeight = Math.max(1, Math.round(rect.height));
  };

  const spawnRing = (x, y, strength = 1) => {
    if (activeRings >= MAX_ACTIVE_RINGS) {
      return;
    }

    const ring = document.createElement("span");
    const factor = clamp(strength, 0.65, 1.45);
    const size = Math.round(180 + factor * 180);
    ring.className = "references-ripple-ring";
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    rippleLayer.appendChild(ring);
    activeRings += 1;

    gsap.fromTo(
      ring,
      {
        opacity: 0.78,
        scale: 0.12,
        xPercent: -50,
        yPercent: -50
      },
      {
        opacity: 0,
        scale: 1.2,
        duration: 1.3,
        ease: "power2.out",
        onComplete: () => {
          activeRings = Math.max(0, activeRings - 1);
          ring.remove();
        }
      }
    );
  };

  const emitAtEventPoint = (event, strength) => {
    const point = pointFromEvent(event);
    spawnRing(point.x, point.y, strength);
  };

  const pointFromEvent = (event) => {
    const rect = section.getBoundingClientRect();

    if (event.touches && event.touches[0]) {
      return {
        x: event.touches[0].clientX - rect.left,
        y: event.touches[0].clientY - rect.top
      };
    }

    if (event.changedTouches && event.changedTouches[0]) {
      return {
        x: event.changedTouches[0].clientX - rect.left,
        y: event.changedTouches[0].clientY - rect.top
      };
    }

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  section.addEventListener(
    "pointerenter",
    (event) => {
      emitAtEventPoint(event, 1.25);
    },
    { passive: true }
  );

  section.addEventListener(
    "pointerdown",
    (event) => {
      emitAtEventPoint(event, 1.35);
    },
    { passive: true }
  );

  section.addEventListener(
    "pointermove",
    (event) => {
      const now = performance.now();
      const point = pointFromEvent(event);

      if (!hasLastMove) {
        hasLastMove = true;
        lastMoveX = point.x;
        lastMoveY = point.y;
        lastMoveStamp = now;
        spawnRing(point.x, point.y, 0.82);
        return;
      }

      const distance = Math.hypot(point.x - lastMoveX, point.y - lastMoveY);
      const elapsed = now - lastMoveStamp;

      if (distance < MOVE_DISTANCE_THRESHOLD && elapsed < MOVE_TIME_THRESHOLD) {
        return;
      }

      lastMoveX = point.x;
      lastMoveY = point.y;
      lastMoveStamp = now;
      spawnRing(point.x, point.y, 0.82);
    },
    { passive: true }
  );

  section.addEventListener(
    "touchstart",
    (event) => {
      emitAtEventPoint(event, 1.15);
    },
    { passive: true }
  );

  section.addEventListener(
    "touchmove",
    (event) => {
      emitAtEventPoint(event, 0.86);
    },
    { passive: true }
  );

  window.setInterval(() => {
    if (document.hidden || sectionWidth < 2 || sectionHeight < 2) {
      return;
    }

    spawnRing(sectionWidth * 0.5, sectionHeight * 0.2, 0.72);
  }, 2400);

  refreshBounds();
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(refreshBounds);
    observer.observe(section);
  } else {
    window.addEventListener("resize", refreshBounds, { passive: true });
  }
}

function renderFinalState() {
  if (destroyAct1Spectrogram) {
    destroyAct1Spectrogram();
    destroyAct1Spectrogram = null;
    resumeAct1Spectrogram = null;
  }

  ScrollTrigger.getAll().forEach((trigger) => trigger.kill());

  document.body.className = "annihilated-state";
  document.body.innerHTML = `
    <main id="terminal-state" aria-live="polite">
      <svg class="flatline-svg" viewBox="0 0 1200 120" preserveAspectRatio="none" role="img" aria-label="Línea plana estática">
        <line x1="0" y1="60" x2="1200" y2="60" stroke="#8b0000" stroke-width="2" vector-effect="non-scaling-stroke"></line>
      </svg>
      <p class="terminal-quote"> En mí, es la oreja la que habla.</p>
    </main>
    <section id="referencias" class="references-section">
      <div class="references-ripple-layer" aria-hidden="true"></div>
      <h2 class="references-heading">Referencias</h2>
      <div class="references-list">
        <article class="ref-entry">
          <h3 class="ref-name">Barthes, Roland. Fragmentos de un discurso amoroso</h3>
          <p class="ref-text">Es el centro de todo. Barthes no escribe sobre el amor desde afuera, como si lo estuviera diseccionando en un laboratorio. Lo escribe desde adentro, desde el cuerpo del que ama y sufre. Trata el discurso amoroso como un fenómeno físico, algo que golpea, que vibra, que deja una marca biológica en el sujeto. No es un libro sobre el amor. Es una radiografía del cuerpo cuando ama.</p>
          <p class="ref-context">Roland Barthes (1915-1980) fue un crítico literario y semiólogo francés. Publicó Fragmentos en 1977, justo después de la muerte de su madre, y se convirtió en un fenómeno editorial inesperado: vendió más de 60.000 ejemplares en sus primeros meses. Marcó un giro en su obra, del estructuralismo científico hacia una escritura del afecto y el duelo.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Nietzsche, Friedrich. La genealogía de la moral</h3>
          <p class="ref-text">Nietzsche describe al sujeto que no puede digerir las experiencias. Su alma es como un estómago que no funciona: todo se queda adentro, pudriéndose. Barthes lo usa para hablar de la memoria como arma, como método de tortura. Lo que me quedó a mí es algo más simple: el dolor se vuelve una forma de fidelidad. No olvidamos porque, de alguna manera, soltar el dolor sería también soltar al otro.</p>
          <p class="ref-context">Friedrich Nietzsche (1844-1900) fue un filósofo alemán que cuestionó los fundamentos de la moral occidental. En La genealogía de la moral (1887) analiza el resentimiento como la psicología del que no puede olvidar ni actuar, y convierte su impotencia en juicio moral. Barthes lo usa no para hablar de moral, sino de amor: el amante es el resentido por excelencia.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Lacan, Jacques</h3>
          <p class="ref-text">De Lacan viene el Imaginario: ese lugar donde construimos una imagen perfecta y cerrada del otro que no tiene nada que ver con quien realmente es. El problema es que amamos esa imagen, no a la persona. El estruendo de la resonancia no ocurre afuera, ocurre en tu cine privado, mientras que afuera el otro solo dijo una frase trivial.</p>
          <p class="ref-context">Jacques Lacan (1901-1981) fue un psicoanalista francés que reformuló el psicoanálisis de Freud desde la lingüística. Su concepto del Imaginario describe el registro donde el sujeto busca totalidad e identificación. Barthes asistía a sus seminarios en París en los años 70 y tomó de él la idea de que el amor no es un encuentro entre dos personas, sino entre dos imágenes.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Saussure, Ferdinand de. Curso de lingüística general</h3>
          <p class="ref-text">Saussure estudia el lenguaje como sistema: qué significa cada palabra en el diccionario. Es una escucha plana. El amante no escucha lo que dijiste. Escucha el tono, el peso, la intención oculta. Saussure es el punto de partida que Barthes necesita para mostrar que el amor opera en otra frecuencia completamente distinta.</p>
          <p class="ref-context">Ferdinand de Saussure (1857-1913) fue un lingüista suizo considerado el fundador de la lingüística moderna. Su Curso de lingüística general (1916) estableció que el lenguaje es un sistema de signos donde lo que importa es la diferencia entre ellos, no su relación con el mundo real. Barthes partió de ahí en su juventud, pero en 1977 ya le interesaba lo que Saussure no podía explicar: la fuerza física de las palabras en el cuerpo.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Retentissement y Ressentiment — el francés como evidencia</h3>
          <p class="ref-text">En francés, resonancia se dice retentissement y resentimiento se dice ressentiment. Suenan casi igual y no es casualidad. El retentissement es el aspecto físico: el impacto de la onda en la caja de madera, el latigazo en el cuerpo. El ressentiment es el aspecto temporal: volver a sentir una y otra vez. En español perdemos esa cercanía sonora. En francés, el idioma ya sabe que vibrar por un golpe actual es, en realidad, volver a sentir un dolor antiguo.</p>
          <p class="ref-context">Barthes fue formado en filología clásica y era profundamente sensible al peso físico de las palabras. Esta proximidad entre retentissement y ressentiment no es un juego de palabras sino una tesis: que la resonancia amorosa y el resentimiento nietzscheano son el mismo fenómeno visto desde dos ángulos, uno acústico y otro temporal.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Diderot, Denis</h3>
          <p class="ref-text">Diderot estaba obsesionado con cómo las emociones se manifiestan en el cuerpo: el temblor, la palidez, el sudor. Para él, el cuerpo es un teatro donde todo lo que sentimos se vuelve visible aunque la mente intente controlarlo. Barthes lo usa para decir que el cuerpo amoroso es un testigo que delata. Lo que nos destruye no suele ser algo oscuro. Es algo que brilla con demasiada intensidad, una verdad que se nos revela de golpe y nos ciega.</p>
          <p class="ref-context">Denis Diderot (1713-1784) fue un filósofo y escritor francés, figura central de la Ilustración y director de la Enciclopedia. En su Paradoja sobre el comediante analizó cómo el actor debe distanciarse de la emoción para representarla con verdad. Barthes invierte esa paradoja: el amante no puede distanciarse. Su cuerpo actúa solo, sin permiso.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Flaubert, Gustave</h3>
          <p class="ref-text">Flaubert podía pasar un día entero buscando una sola palabra exacta y luego caía agotado en su diván. Barthes toma esa imagen y la traslada al amor: el amante busca la señal perfecta del otro y cuando no la encuentra, o cuando la encuentra y duele, cae en el mismo agotamiento. A eso Barthes lo llama el adobo. No es debilidad. Es el gesto honesto de tenderse, dejar que la tempestad interior ocurra, y esperar a que se amortigüe sola.</p>
          <p class="ref-context">Gustave Flaubert (1821-1880) fue un novelista francés considerado el padre del realismo literario. Era famoso por su agonía ante el lenguaje: buscaba la mot juste, la palabra exacta, con una obsesión casi enfermiza. Barthes veía en esa agonía creativa un espejo del amante: ambos buscan la forma perfecta de algo que el lenguaje no puede contener del todo.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">La cama y la mesa — Barthes</h3>
          <p class="ref-text">Barthes divide el espacio doméstico en dos zonas. La cama es el lugar de lo Imaginario: cuando estás horizontal, el cuerpo no tiene que hacer nada, entonces toda la energía se va a alimentar la imagen del otro. La mesa es la realidad: levantarte e ir a ella, aunque no hagas nada todavía, es suficiente para que la resonancia empiece a ceder. No es un consejo. Es una observación casi clínica de cómo el cuerpo y el espacio se conspiran para mantenerte dentro o fuera del dolor.</p>
          <p class="ref-context">Esta dicotomía refleja la rutina real de Barthes en su apartamento de París, donde separaba estrictamente el tiempo de lectura horizontal del tiempo de escritura vertical. Lo que comenzó como una disciplina de trabajo se convirtió en una categoría filosófica: el espacio no es neutro, el cuerpo piensa diferente según su postura.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">El monje zen — figura citada por Barthes</h3>
          <p class="ref-text">El monje busca el vacío, vaciarse de imágenes para alcanzar la calma. El amante hace exactamente lo opuesto: es un acumulador compulsivo de imágenes. En el colapso del Acto IV, el amante no busca la paz. Se queda en el lecho y deja que el amargor lo ocupe todo. No hay salida zen. Solo el adobo.</p>
          <p class="ref-context">Barthes viajó a Japón en varias ocasiones durante los años 60 y publicó El imperio de los signos en 1970, donde exploró la cultura japonesa como un sistema de sentido radicalmente distinto al occidental. El zen lo fascinaba precisamente porque proponía lo que él no podía hacer: desapegarse del lenguaje y de las imágenes.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Ruysbroeck, Jan van</h3>
          <p class="ref-text">Un místico flamenco del siglo XIV que buscaba sumergirse en Dios vaciándose de imágenes. Barthes lo pone como el opuesto exacto del amante: nosotros no queremos vaciarnos, queremos llenarnos con la imagen del otro aunque eso nos asfixie. Para Barthes, el dios del amante es su propia obsesión. Y como toda religión, tiene sus ritos, su lecho, su tempestad y su silencio final.</p>
          <p class="ref-context">Jan van Ruysbroeck (1293-1381) fue un místico flamenco cuya obra más conocida, El ornamento de las bodas espirituales, describe la unión del alma con Dios a través del vaciamiento de sí mismo. Barthes usa esta tradición mística para mostrar que el amor romántico tiene la misma estructura que la experiencia religiosa, pero invertida: en lugar de vaciarse, el amante se llena hasta el colapso.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Deleuze, Gilles. Nietzsche y la filosofía</h3>
          <p class="ref-text">Deleuze sostiene que no hay hechos, solo interpretaciones de fuerzas. El amante no escucha lo que el otro dice, escucha la fuerza que hay detrás: el tono, la intención, el peso invisible de cada gesto. Nada es casual. Si hoy no me miró, empiezo a tejer un hilo que llega hasta una frase que dijo hace tres meses. Eso es leer fuerzas, no palabras. El amante es, por desgracia, un experto en eso.</p>
          <p class="ref-context">Gilles Deleuze (1925-1995) fue un filósofo francés cuya lectura de Nietzsche en los años 60 renovó el pensamiento francés contemporáneo. Su idea central es que el mundo no está hecho de hechos sino de fuerzas en tensión. Barthes tomó eso y lo aplicó al lenguaje amoroso: cada palabra del otro es una fuerza, no un mensaje.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Freud, Sigmund — La huella mnémica y la atención flotante</h3>
          <p class="ref-text">Freud aparece en dos momentos. Primero con la huella mnémica: cada experiencia deja una marca en el cuerpo que puede reactivarse con cualquier estímulo parecido. Por eso todo sonido que entra en nosotros rima inevitablemente con un dolor pasado. Segundo con la atención flotante: el analista escucha sin juzgar, dejando pasar las palabras. El amante hace exactamente lo contrario. Escucha con todo el cuerpo, sin filtro, sin ruido. Mientras el otro habla, el amante está condenado a una lucidez total.</p>
          <p class="ref-context">Sigmund Freud (1856-1939) fue el fundador del psicoanálisis. La huella mnémica aparece en sus primeros textos como la idea de que toda experiencia deja una inscripción en el aparato psíquico que puede reactivarse. La atención flotante es la técnica del analista: escuchar sin privilegiar ninguna palabra. Barthes usa ambos conceptos para mostrar que el amante es el anti-analista: todo le importa, nada puede ignorar.</p>
        </article>
      </div>
      <div class="download-container">
        <a href="/resonancia.pdf" download class="download-btn">Descargar Fragmento</a>
      </div>
    </section>
  `;

  document.documentElement.style.backgroundColor = "#ffffff";
  document.body.style.backgroundColor = "#ffffff";
  window.scrollTo(0, 0);

  const referencesSection = document.querySelector(".references-section");
  if (referencesSection) {
    initReferencesRipple(referencesSection);

    gsap.set(referencesSection, {
      "--refs-blend-opacity": 0,
      "--refs-blend-shift": "-36px"
    });

    gsap.to(referencesSection, {
      "--refs-blend-opacity": 1,
      "--refs-blend-shift": "0px",
      ease: "none",
      scrollTrigger: {
        trigger: referencesSection,
        start: "top bottom",
        end: "top 45%",
        scrub: true
      }
    });
  }

  const refEntries = document.querySelectorAll(".ref-entry");

  refEntries.forEach((entry) => {
    const title = entry.querySelector(".ref-name");
    const text = entry.querySelector(".ref-text");
    const context = entry.querySelector(".ref-context");

    gsap.set(title, { opacity: 0 });
    if (text) gsap.set(text, { opacity: 0 });
    if (context) gsap.set(context, { opacity: 0 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: entry,
        start: "top 90%",
        toggleActions: "play none none none"
      }
    });

    tl.to(title, { opacity: 1, duration: 0.5, ease: "power2.out" });

    if (text) {
      tl.to(text, { opacity: 0.88, duration: 0.6, ease: "power2.out" }, "-=0.2");
    }

    if (context) {
      tl.to(context, { opacity: 0.52, duration: 0.6, ease: "power2.out" }, "-=0.3");
    }
  });

  const downloadBtn = document.querySelector(".download-btn");
  if (downloadBtn) {
    gsap.set(downloadBtn, { opacity: 0 });
    gsap.to(downloadBtn, {
      scrollTrigger: {
        trigger: ".download-container",
        start: "top 95%",
        toggleActions: "play none none none"
      },
      opacity: 1,
      duration: 0.8,
      ease: "power2.out"
    });
  }
}

function handleAnnihilation() {
  if (annihilated) {
    return;
  }

  annihilated = true;

  unlockEvents.forEach((eventName) => {
    window.removeEventListener(eventName, handleUnlockGesture);
  });

  stopAllAudioImmediately();

  document.body.classList.add("annihilation-transition");

  gsap.to([document.documentElement, document.body], {
    backgroundColor: "#ffffff",
    duration: 0.8,
    ease: "power2.out",
    onComplete: renderFinalState
  });
}

if (closureButton) {
  closureButton.addEventListener("click", handleAnnihilation);
}
