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
const SPECTROGRAM_MIN_FREQ = 60;
const SPECTROGRAM_LABELS = [100, 1000, 5000];

const actSections = Array.from(document.querySelectorAll(".act-section"));
const closureButton = document.getElementById("annular-button");
const closureSection = document.getElementById("closure");

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

const handleUnlockGesture = () => {
  void unlockAudio(true);
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

function volumeFromProgress(progress) {
  const p = clamp(progress, 0, 1);

  if (p <= 0) {
    return 0;
  }

  if (p < 0.2) {
    return (p / 0.2) * MAX_VOLUME;
  }

  if (p <= 0.8) {
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
  const base = volumeFromProgress(progress);

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

unlockEvents.forEach((eventName) => {
  window.addEventListener(eventName, handleUnlockGesture, { passive: true });
});

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
      deactivateAct(state);
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
  if (annihilated) {
    return;
  }

  if (enabled && !unlockedAudios.has(closureAudio)) {
    void unlockAudio();
  }

  if (!audioUnlocked || !unlockedAudios.has(closureAudio)) {
    return;
  }

  if (closurePauseCall) {
    closurePauseCall.kill();
    closurePauseCall = null;
  }

  if (enabled) {
    const act4 = actStates.find((state) => state.act === 4);
    if (act4 && act4.active) {
      deactivateAct(act4);
    }

    closureAudio.muted = false;
    if (closureAudio.paused) {
      closureAudio.currentTime = 0;
    }

    safePlay(closureAudio);
    setClosureVolume(Math.min(MAX_VOLUME, CLOSURE_VOLUME));
    return;
  }

  setClosureVolume(0);
  closurePauseCall = gsap.delayedCall(RAMP_SECONDS, () => {
    closureAudio.volume = 0;
    closureAudio.pause();
    closureAudio.currentTime = 0;
    closureAudio.muted = true;
    closurePauseCall = null;
  });
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
      <h2 class="references-heading">Referencias</h2>
      <div class="references-list">
        <article class="ref-entry">
          <h3 class="ref-name">Barthes, Roland. Fragmentos de un discurso amoroso</h3>
          <p class="ref-text">Es el centro de todo; una radiografía del cuerpo que ama. Trata el discurso amoroso como un fenómeno físico: algo que golpea, vibra y deja una huella biológica en el sujeto.</p>
          <p class="ref-context">Barthes, Roland (1915-1980): Su obra Fragmentos de un discurso amoroso, publicada en 1977 por Éditions du Seuil, marcó un hito en la crítica literaria al vender más de 60,000 ejemplares en sus primeros meses. Este giro hacia lo "intratable" del sentimiento ocurrió tras la muerte de su madre, Henriette Barthes, en octubre de 1977, evento que lo alejó del estructuralismo científico para explorar una escritura del afecto y el duelo.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Nietzsche, Friedrich. La genealogía de la moral</h3>
          <p class="ref-text">Describe al sujeto que no puede "digerir" las experiencias y cuya memoria se vuelve resentimiento. Aquí, el dolor se convierte en una forma de fidelidad que se niega al olvido.</p>
          <p class="ref-context">Nietzsche, Friedrich (1844-1900): La influencia del filósofo alemán fue central en la etapa tardía de Barthes, especialmente tras el auge del "nuevo nietzscheanismo" francés de los años 60. Barthes adoptó la noción de la "voluntad de poder" no como dominio, sino como una energía vital que el cuerpo expresa al hablar. En su curso en el Collège de France (1977-1978), Barthes cita a Nietzsche como la herramienta para desarticular la "Doxa" o el sentido común.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Lacan, Jacques</h3>
          <p class="ref-text">De él viene el "Imaginario", el lugar donde amamos una imagen construida y perfecta del otro. El conflicto estalla cuando la persona real aparece y hace crujir nuestra caja de resonancia mental.</p>
          <p class="ref-context">Lacan, Jacques (1901-1981): Durante la década de los 70, Barthes fue un asistente regular a los Seminarios de Lacan en la Escuela Freudiana de París. Utilizó conceptos fundamentales de los Escritos (1966), específicamente el "Estadio del Espejo" y la distinción entre lo Imaginario y lo Real, para diseccionar cómo el sujeto enamorado construye una imagen idealizada que inevitablemente colisiona con la realidad del otro.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Saussure, Ferdinand de. Curso de lingüística general</h3>
          <p class="ref-text">Representa la lingüística que Barthes rechaza por ser una escucha "plana" del diccionario. Sirve de contraste para demostrar que el amor opera en una frecuencia de fuerzas, no de sistemas.</p>
          <p class="ref-context">Saussure, Ferdinand de (1857-1913): Aunque el Curso de lingüística general (1916) fue la base del Barthes estructuralista de los años 50 y 60, su obra de 1977 representa una ruptura con esta herencia. Barthes transita de la semiología del significado a una "semiología de la pulsión", donde el significante ya no sirve para comunicar conceptos, sino para producir placer sensorial.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Retentissement y Ressentiment — el francés como evidencia</h3>
          <p class="ref-text">Juego lingüístico donde la resonancia física rima con el resentimiento temporal. En francés, el idioma ya sabe que vibrar por un golpe actual es, en realidad, volver a sentir un dolor antiguo.</p>
          <p class="ref-context">Barthes, formado en filología clásica, utiliza estos términos para explicar la fenomenología del lenguaje. Mientras que el ressentiment fue analizado por Nietzsche en La genealogía de la moral (1887) como una fuerza reactiva, Barthes propone el retentissement como una categoría estética para describir el eco psicológico que las palabras dejan en el cuerpo.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Diderot, Denis</h3>
          <p class="ref-text">Aporta la idea del cuerpo como teatro donde las emociones —palidez, sudor, temblor— son imposibles de ocultar. El cuerpo amoroso es un testigo que delata la verdad que la mente intenta controlar.</p>
          <p class="ref-context">Diderot, Denis (1713-1784): Barthes recuperó la estética de la Ilustración, citando frecuentemente el Paradoja sobre el comediante (escrito entre 1773 y 1778). El interés de Barthes radicaba en la técnica de la "escena" y el "cuadro" que Diderot propuso para el teatro, aplicándola al análisis de cómo el amante teatraliza su propio sufrimiento mediante gestos físicos codificados.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Flaubert, Gustave</h3>
          <p class="ref-text">Representa el estado de "adobo": rendirse a la tempestad interior desde la horizontalidad del diván. Es el gesto honesto de dejar que el dolor ocupe todo el espacio hasta que se amortigüe solo.</p>
          <p class="ref-context">Flaubert, Gustave (1821-1880): Considerado por Barthes como el precursor de la modernidad literaria, su relación se intensificó en los ensayos de los años 70. Barthes analizaba la correspondencia de Flaubert para entender la "agonía del estilo" y la búsqueda de la mot juste (palabra exacta). Veía en las crisis creativas del autor de Madame Bovary una forma de resistencia ética frente a la banalización del lenguaje.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">La cama y la mesa — Barthes</h3>
          <p class="ref-text">Divide el espacio entre lo Imaginario (la parálisis horizontal que alimenta el dolor) y la Realidad (el gesto vertical de levantarse). Es la geografía clínica de cómo el cuerpo entra o sale del sufrimiento.</p>
          <p class="ref-context">Estas referencias aluden al entorno doméstico de Barthes en su apartamento de la Rue Servandoni en París. Históricamente, su rutina de escritura estaba estrictamente dividida entre la horizontalidad de la lectura y la verticalidad de la máquina de escribir, una dicotomía que él conceptualizó como la lucha entre el abandono emocional y la disciplina intelectual.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">El monje zen — figura citada por Barthes</h3>
          <p class="ref-text">Es la antítesis del amante; mientras el monje busca el vacío para hallar la calma, el amante busca la saturación. En el colapso, el amante no busca la paz, sino habitar el amargor de sus imágenes.</p>
          <p class="ref-context">Tras tres viajes a Japón en 1966, Barthes publicó El imperio de los signos (1970). Allí contrapone la saturación de sentido de Occidente con la vacuidad del Zen. La figura del monje representa para él un ideal de desapego lingüístico, donde el sujeto puede finalmente "vaciar" el discurso amoroso de su carga trágica y analítica.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Ruysbroeck, Jan van</h3>
          <p class="ref-text">Un místico que buscaba vaciarse de imágenes, justo lo opuesto al amante. Nosotros buscamos llenarnos compulsivamente con la imagen del otro, convirtiendo el amor en una religión de la asfixia.</p>
          <p class="ref-context">Ruysbroeck, Jan van (1293-1381): La mención de este místico flamenco del siglo XIV permite a Barthes conectar la retórica amorosa contemporánea con la tradición de la devotio moderna. Utiliza textos como El ornamento de las bodas espirituales para contrastar la "noche oscura" del alma mística con la "noche" del amante abandonado, estableciendo una genealogía del deseo que trasciende lo secular.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Deleuze, Gilles. Nietzsche y la filosofía</h3>
          <p class="ref-text">Sostiene que no hay hechos, solo interpretaciones de fuerzas. Explica por qué el amante no escucha palabras, sino el peso, el tono y la intención oculta tras el lenguaje.</p>
          <p class="ref-context">Deleuze, Gilles (1925-1995): La relación intelectual entre ambos se consolidó tras la publicación de Nietzsche y la filosofía (1962). Barthes tomó de Deleuze la idea del "sujeto nómada" y la multiplicidad de fuerzas. En el contexto del París post-1968, esta visión permitió a Barthes tratar el discurso del amante no como una unidad psíquica, sino como un flujo de intensidades y afectos en constante mutación.</p>
        </article>
        <article class="ref-entry">
          <h3 class="ref-name">Freud, Sigmund — La huella mnémica y la atención flotante</h3>
          <p class="ref-text">Aporta la "huella mnémica" (marcas que se reactivan) y la falta de "atención flotante". El amante vive la tragedia de una lucidez total: escucha sin filtro, sin ruido y con todo el cuerpo.</p>
          <p class="ref-context">Freud, Sigmund (1856-1939): Barthes utiliza el aparato teórico del psicoanálisis, particularmente conceptos de Más allá del principio de placer (1920), para explicar la naturaleza repetitiva y compulsiva del amor. Sitúa el discurso amoroso en el ámbito de la neurosis de transferencia, donde el amado es un soporte para figuras parentales y traumas no resueltos de la infancia.</p>
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
