import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────
//  GLOBAL STYLES (injected once into <head>)
// ─────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --black:    #000000;
    --green:    #00FF41;
    --green-dim:#00AA2A;
    --green-glow: 0 0 8px #00FF41, 0 0 20px #00FF4166, 0 0 40px #00FF4122;
    --cyan:     #00FFFF;
    --magenta:  #FF00AA;
    --red:      #FF2233;
    --text:     #C8FFC8;
    --muted:    #3A6B3A;
    --border:   #00FF4144;
    --font-mono: 'Share Tech Mono', 'Courier New', monospace;
    --font-display: 'Orbitron', 'Courier New', monospace;
  }

  html, body, #root {
    width: 100%; height: 100%;
    background: #000;
    color: var(--text);
    font-family: var(--font-mono);
    overflow-x: hidden;
  }

  /* scanline overlay */
  body::after {
    content: '';
    position: fixed; inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0,0,0,0.08) 2px,
      rgba(0,0,0,0.08) 4px
    );
    pointer-events: none;
    z-index: 9999;
  }

  /* scrollbar */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #000; }
  ::-webkit-scrollbar-thumb { background: var(--green-dim); border-radius: 2px; }

  /* range input */
  input[type=range] {
    -webkit-appearance: none;
    width: 100%;
    height: 4px;
    background: var(--muted);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px; height: 16px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: var(--green-glow);
    cursor: pointer;
    transition: transform .15s;
  }
  input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.3); }
  input[type=range]::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
  }

  select {
    background: #000;
    color: var(--green);
    border: 1px solid var(--green-dim);
    font-family: var(--font-mono);
    font-size: 14px;
    padding: 8px 12px;
    cursor: pointer;
    outline: none;
    border-radius: 2px;
    width: 100%;
  }
  select:focus { border-color: var(--green); box-shadow: var(--green-glow); }
  select option { background: #000; }

  @keyframes pulse-border {
    0%, 100% { box-shadow: 0 0 6px var(--green), 0 0 12px #00FF4133; }
    50%       { box-shadow: 0 0 14px var(--green), 0 0 30px #00FF4155, 0 0 60px #00FF4122; }
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes flicker {
    0%,100%{opacity:1} 92%{opacity:1} 93%{opacity:.6} 94%{opacity:1} 97%{opacity:.8} 98%{opacity:1}
  }
  @keyframes slide-in {
    from { opacity:0; transform:translateY(-10px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes glow-pulse {
    0%,100%{ text-shadow: 0 0 6px var(--green), 0 0 14px var(--green); }
    50%    { text-shadow: 0 0 12px var(--green), 0 0 30px var(--green), 0 0 60px var(--green); }
  }
`;

// ─────────────────────────────────────────────
//  WEB WORKER SOURCE  (runs in a Blob URL)
// ─────────────────────────────────────────────
// The worker performs continuous prime-sieve calculations to saturate one CPU core.
const WORKER_CODE = `
  // Heavy CPU loop: Miller-Rabin primality test on large numbers
  function mulmod(a, b, m) {
    let result = 0n;
    a = BigInt(a) % BigInt(m);
    b = BigInt(b);
    m = BigInt(m);
    while (b > 0n) {
      if (b & 1n) result = (result + a) % m;
      a = (a * 2n) % m;
      b >>= 1n;
    }
    return Number(result);
  }

  function isPrime(n) {
    if (n < 2) return false;
    if (n < 4) return true;
    if (n % 2 === 0 || n % 3 === 0) return false;
    const witnesses = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
    let d = n - 1, r = 0;
    while (d % 2 === 0) { d >>= 1; r++; }
    outer:
    for (const a of witnesses) {
      if (a >= n) continue;
      let x = Math.pow(a, d) % n; // approximate — enough for heat
      if (x === 1 || x === n - 1) continue;
      for (let i = 0; i < r - 1; i++) {
        x = (x * x) % n;
        if (x === n - 1) continue outer;
      }
      return false;
    }
    return true;
  }

  let running = false;

  self.onmessage = function(e) {
    if (e.data === 'start') {
      running = true;
      let n = 999_999_999;
      let found = 0;
      while (running) {
        n += 2;
        if (isPrime(n)) found++;
        // Post heartbeat every 10k primes so GC can run
        if (found % 10000 === 0) {
          self.postMessage({ type: 'heartbeat', found });
        }
      }
    }
    if (e.data === 'stop') {
      running = false;
    }
  };
`;

// ─────────────────────────────────────────────
//  WEBGL SHADER SOURCES
// ─────────────────────────────────────────────
const VERT_SRC = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Fragment shader: iterated Mandelbrot + domain-warped noise — iteration count
// is driven by u_iterations (maps to the intensity slider).
const FRAG_SRC = `
  precision highp float;
  uniform vec2  u_resolution;
  uniform float u_time;
  uniform int   u_iterations;

  // pseudo-random noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
      mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x),
      u.y
    );
  }

  // domain-warped fractal Brownian motion — moderately expensive
  float fbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 8; i++) {
      val += amp * noise(p * freq);
      amp  *= 0.5;
      freq *= 2.1;
    }
    return val;
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
    float t  = u_time * 0.3;

    // Domain warp — two layers of fbm offset for heavy ALU
    vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(5.2, 1.3) + t));
    vec2 r = vec2(fbm(uv + 4.0 * q + vec2(1.7, 9.2) + 0.15 * t),
                  fbm(uv + 4.0 * q + vec2(8.3, 2.8) + 0.126 * t));

    // Mandelbrot iteration loop — count controlled by uniform
    vec2 c = uv * 2.5 + vec2(-0.5, 0.0);
    vec2 z = c;
    float iter = 0.0;
    for (int i = 0; i < 512; i++) {
      if (i >= u_iterations) break;
      if (dot(z, z) > 4.0) break;
      z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
      iter += 1.0;
    }

    float f = fbm(uv + r);
    float m = iter / float(u_iterations);

    // Cyberpunk green/cyan palette
    vec3 col = mix(
      vec3(0.0, 1.0, 0.25) * m,
      vec3(0.0, 0.9, 1.0)  * f,
      0.4
    );
    col *= 0.6 + 0.4 * sin(t + uv.x * 3.0);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
}

function initWebGL(canvas, iterations) {
  const gl = canvas.getContext("webgl", { antialias: false, powerPreference: "high-performance" });
  if (!gl) return null;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
      console.error(gl.getShaderInfoLog(sh));
    return sh;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    console.error(gl.getProgramInfoLog(prog));

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  const loc = gl.getAttribLocation(prog, "a_position");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(prog);

  return {
    gl,
    prog,
    uRes: gl.getUniformLocation(prog, "u_resolution"),
    uTime: gl.getUniformLocation(prog, "u_time"),
    uIter: gl.getUniformLocation(prog, "u_iterations"),
  };
}

// ─────────────────────────────────────────────
//  SUB-COMPONENTS
// ─────────────────────────────────────────────

// Big ON/OFF toggle
function PowerToggle({ isOn, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: 90,
          height: 90,
          borderRadius: "50%",
          border: `3px solid ${isOn ? "var(--green)" : "var(--muted)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isOn ? "#00FF4111" : "transparent",
          boxShadow: isOn ? "var(--green-glow)" : "none",
          animation: isOn ? "pulse-border 2s ease-in-out infinite" : "none",
          transition: "all .3s",
        }}
      >
        {/* Power icon */}
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
          stroke={isOn ? "var(--green)" : "var(--muted)"}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
          <line x1="12" y1="2" x2="12" y2="12"/>
        </svg>
      </div>
      <span style={{
        fontFamily: "var(--font-display)",
        fontSize: 11,
        letterSpacing: 4,
        color: isOn ? "var(--green)" : "var(--muted)",
        textShadow: isOn ? "var(--green-glow)" : "none",
      }}>
        {isOn ? "ACTIVE" : "STANDBY"}
      </span>
    </div>
  );
}

// Digital timer display
function Timer({ ms, isActive }) {
  return (
    <div style={{
      fontFamily: "var(--font-display)",
      fontSize: 52,
      fontWeight: 900,
      letterSpacing: 6,
      color: isActive ? "var(--green)" : "var(--muted)",
      textShadow: isActive
        ? "0 0 10px var(--green), 0 0 25px var(--green), 0 0 60px #00FF4166"
        : "none",
      animation: isActive ? "flicker 8s infinite" : "none",
      lineHeight: 1,
    }}>
      {formatTime(ms)}
    </div>
  );
}

// Glowing section card
function Panel({ title, children, active, style }) {
  return (
    <div style={{
      border: `1px solid ${active ? "var(--green)" : "var(--border)"}`,
      borderRadius: 4,
      padding: "18px 20px",
      background: active ? "#00FF410A" : "#00FF4103",
      boxShadow: active ? "inset 0 0 20px #00FF4108, 0 0 12px #00FF4133" : "none",
      transition: "all .4s",
      animation: active ? "pulse-border 3s ease-in-out infinite" : "none",
      ...style,
    }}>
      {title && (
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 10,
          letterSpacing: 4,
          color: active ? "var(--green)" : "var(--muted)",
          marginBottom: 14,
          textTransform: "uppercase",
        }}>
          ▸ {title}
        </div>
      )}
      {children}
    </div>
  );
}

// Row-style label + value display
function MetaRow({ label, value, highlight }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <span style={{ color: "var(--muted)", fontSize: 12, letterSpacing: 2 }}>{label}</span>
      <span style={{
        fontSize: 13,
        color: highlight ? "var(--green)" : "var(--text)",
        textShadow: highlight ? "0 0 6px var(--green)" : "none",
        fontFamily: "var(--font-display)",
      }}>{value}</span>
    </div>
  );
}

// Status LED
function LED({ on, label, color }) {
  const c = color || "var(--green)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: 8, height: 8,
        borderRadius: "50%",
        background: on ? c : "#1a2a1a",
        boxShadow: on ? `0 0 6px ${c}, 0 0 14px ${c}` : "none",
        animation: on ? "blink 1.4s ease-in-out infinite" : "none",
        transition: "all .3s",
      }} />
      <span style={{ fontSize: 11, letterSpacing: 2, color: on ? c : "var(--muted)" }}>{label}</span>
    </div>
  );
}

// Horizontal bar (mini-progress)
function Bar({ value, max, color }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{
      width: "100%", height: 6,
      background: "#0a1a0a",
      borderRadius: 3,
      overflow: "hidden",
    }}>
      <div style={{
        width: `${pct}%`,
        height: "100%",
        background: color || "var(--green)",
        boxShadow: `0 0 8px ${color || "var(--green)"}`,
        borderRadius: 3,
        transition: "width .3s",
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────
export default function App() {
  // ── State ──────────────────────────────────
  const [isTestActive, setIsTestActive]   = useState(false);
  const [stressMode,   setStressMode]     = useState("both");
  const [intensityLevel, setIntensity]    = useState(4);
  const [elapsedMs,    setElapsedMs]      = useState(0);
  const [wakeLockStatus, setWLStatus]     = useState("unsupported"); // idle|active|unsupported
  const [workerCount,  setWorkerCount]    = useState(0);
  const [gpuFPS,       setGpuFPS]         = useState(0);
  const [log,          setLog]            = useState([]);

  // ── Refs ───────────────────────────────────
  const workersRef   = useRef([]);      // active Web Workers
  const canvasRef    = useRef(null);    // WebGL canvas
  const glRef        = useRef(null);    // WebGL context wrapper
  const rafRef       = useRef(null);    // requestAnimationFrame handle
  const startTimeRef = useRef(null);    // test start timestamp
  const timerRef     = useRef(null);    // setInterval handle for clock
  const wakeLockRef  = useRef(null);    // WakeLock sentinel
  const fpsCountRef  = useRef(0);       // frame counter for FPS calc
  const fpsTimerRef  = useRef(null);    // FPS interval

  const maxCores = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);

  // slider max depends on mode
  const sliderMax   = stressMode === "gpu" ? 10 : maxCores;
  const sliderLabel = stressMode === "gpu" ? "SHADER DEPTH" : "CPU THREADS";

  // ── Logging helper ─────────────────────────
  const pushLog = useCallback((msg, type = "info") => {
    const ts = new Date().toLocaleTimeString();
    setLog(prev => [...prev.slice(-60), { ts, msg, type }]);
  }, []);

  // ── CSS injection ──────────────────────────
  useEffect(() => {
    const tag = document.createElement("style");
    tag.textContent = GLOBAL_CSS;
    document.head.appendChild(tag);
    return () => document.head.removeChild(tag);
  }, []);

  // ── Clamp intensity when mode changes ─────
  useEffect(() => {
    setIntensity(prev => Math.min(prev, sliderMax));
  }, [stressMode, sliderMax]);

  // ── Wake Lock helpers ──────────────────────
  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) {
      setWLStatus("unsupported");
      pushLog("Wake Lock API not available in this browser", "warn");
      return;
    }
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setWLStatus("active");
      pushLog("Screen Wake Lock acquired", "ok");

      // Re-acquire on tab visibility change (lock is released automatically on hidden)
      wakeLockRef.current.addEventListener("release", () => {
        pushLog("Wake Lock released by system", "warn");
        setWLStatus("idle");
      });
    } catch (err) {
      setWLStatus("idle");
      pushLog(`Wake Lock request failed: ${err.message}`, "warn");
    }
  }, [pushLog]);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch { /* silently ignore */ }
      wakeLockRef.current = null;
      setWLStatus("idle");
      pushLog("Screen Wake Lock released", "info");
    }
  }, [pushLog]);

  // Re-acquire wake lock on tab visibility restore
  useEffect(() => {
    const handler = async () => {
      if (document.visibilityState === "visible" && isTestActive && !wakeLockRef.current) {
        await requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [isTestActive, requestWakeLock]);

  // ── CPU stressor ───────────────────────────
  const startCPU = useCallback((count) => {
    // Terminate any existing workers first
    workersRef.current.forEach(w => w.terminate());
    workersRef.current = [];

    const blob = new Blob([WORKER_CODE], { type: "application/javascript" });
    const url  = URL.createObjectURL(blob);

    for (let i = 0; i < count; i++) {
      const w = new Worker(url);
      w.postMessage("start");
      w.onmessage = () => { /* heartbeat — swallow */ };
      w.onerror   = (e) => pushLog(`Worker ${i} error: ${e.message}`, "err");
      workersRef.current.push(w);
    }
    URL.revokeObjectURL(url); // URL stays valid until workers are GCed
    setWorkerCount(count);
    pushLog(`Spawned ${count} CPU worker${count > 1 ? "s" : ""}`, "ok");
  }, [pushLog]);

  const stopCPU = useCallback(() => {
    workersRef.current.forEach(w => { w.postMessage("stop"); w.terminate(); });
    workersRef.current = [];
    setWorkerCount(0);
    pushLog("CPU workers terminated", "info");
  }, [pushLog]);

  // ── GPU stressor ───────────────────────────
  const startGPU = useCallback((iterations) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = initWebGL(canvas, iterations);
    if (!ctx) {
      pushLog("WebGL context unavailable — GPU stress disabled", "err");
      return;
    }
    glRef.current = ctx;

    let startTime = performance.now();
    let last = performance.now();

    const render = (now) => {
      const { gl, uRes, uTime, uIter } = glRef.current;
      const W = canvas.width;
      const H = canvas.height;

      gl.viewport(0, 0, W, H);
      gl.uniform2f(uRes, W, H);
      gl.uniform1f(uTime, (now - startTime) / 1000);
      // Map intensity (1-10) → iterations (16 to 512)
      const iterCount = Math.round(16 + (iterations - 1) * (512 - 16) / 9);
      gl.uniform1i(uIter, iterCount);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      fpsCountRef.current++;
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    // FPS counter
    fpsTimerRef.current = setInterval(() => {
      setGpuFPS(fpsCountRef.current);
      fpsCountRef.current = 0;
    }, 1000);

    pushLog(`GPU shader running — depth ${iterations}`, "ok");
  }, [pushLog]);

  const stopGPU = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (fpsTimerRef.current) { clearInterval(fpsTimerRef.current); fpsTimerRef.current = null; }
    // Reset WebGL context
    if (glRef.current) {
      const { gl } = glRef.current;
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
      glRef.current = null;
    }
    setGpuFPS(0);
    pushLog("GPU shader halted", "info");
  }, [pushLog]);

  // ── Master start/stop ──────────────────────
  const startTest = useCallback(async () => {
    pushLog("═══ TEST SEQUENCE INITIATED ═══", "ok");

    // Timer
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);

    // Wake lock
    await requestWakeLock();

    // CPU
    if (stressMode === "cpu" || stressMode === "both") {
      const threads = stressMode === "both"
        ? Math.min(intensityLevel, maxCores)
        : intensityLevel;
      startCPU(threads);
    }

    // GPU
    if (stressMode === "gpu" || stressMode === "both") {
      startGPU(intensityLevel);
    }
  }, [stressMode, intensityLevel, maxCores, requestWakeLock, startCPU, startGPU, pushLog]);

  const stopTest = useCallback(async () => {
    pushLog("═══ TEST SEQUENCE HALTED ═══", "warn");

    // Timer
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    // Stop stressors
    stopCPU();
    stopGPU();

    // Release wake lock
    await releaseWakeLock();
  }, [stopCPU, stopGPU, releaseWakeLock, pushLog]);

  // Toggle main switch
  const toggleTest = useCallback(() => {
    if (isTestActive) {
      setIsTestActive(false);
      stopTest();
    } else {
      setIsTestActive(true);
      startTest();
    }
  }, [isTestActive, startTest, stopTest]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCPU();
      stopGPU();
      releaseWakeLock();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // eslint-disable-line

  // ── Intensity update while running ────────
  // When slider changes during an active test, hot-reload the stressors
  const handleIntensityChange = useCallback((val) => {
    setIntensity(val);
    if (!isTestActive) return;

    if (stressMode === "cpu" || stressMode === "both") {
      stopCPU();
      const threads = stressMode === "both" ? Math.min(val, maxCores) : val;
      setTimeout(() => startCPU(threads), 50);
    }
    if (stressMode === "gpu" || stressMode === "both") {
      stopGPU();
      setTimeout(() => startGPU(val), 50);
    }
  }, [isTestActive, stressMode, maxCores, stopCPU, startCPU, stopGPU, startGPU]);

  // Mode change while running: restart
  const handleModeChange = useCallback((mode) => {
    setStressMode(mode);
    if (!isTestActive) return;
    stopCPU();
    stopGPU();
    setTimeout(() => {
      if (mode === "cpu" || mode === "both") startCPU(Math.min(intensityLevel, maxCores));
      if (mode === "gpu" || mode === "both") startGPU(intensityLevel);
    }, 80);
  }, [isTestActive, intensityLevel, maxCores, stopCPU, startCPU, stopGPU, startGPU]);

  const resetTimer = () => {
    startTimeRef.current = Date.now();
    setElapsedMs(0);
    pushLog("Timer reset", "info");
  };

  // ── Render ─────────────────────────────────
  const cpuActive = isTestActive && (stressMode === "cpu" || stressMode === "both");
  const gpuActive = isTestActive && (stressMode === "gpu" || stressMode === "both");

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "30px 20px",
      gap: 24,
      animation: "flicker 12s infinite",
    }}>

      {/* HEADER */}
      <div style={{ textAlign: "center", marginBottom: 4 }}>
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: 10,
          color: "var(--green)",
          textShadow: "0 0 10px var(--green), 0 0 30px var(--green)",
          animation: "glow-pulse 3s ease-in-out infinite",
        }}>VOLTBURN</div>
        <div style={{
          fontSize: 10,
          letterSpacing: 6,
          color: "var(--muted)",
          marginTop: 4,
        }}>BATTERY DRAIN CONTROLLER v2.0</div>
      </div>

      {/* MAIN GRID */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        gap: 20,
        width: "100%",
        maxWidth: 900,
      }}>

        {/* LEFT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Power + Timer */}
          <Panel title="MASTER CONTROL" active={isTestActive}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              <PowerToggle isOn={isTestActive} onToggle={toggleTest} />
              <Timer ms={elapsedMs} isActive={isTestActive} />
              <button
                onClick={resetTimer}
                style={{
                  background: "transparent",
                  border: "1px solid var(--muted)",
                  color: "var(--muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: 3,
                  padding: "5px 14px",
                  cursor: "pointer",
                  borderRadius: 2,
                  transition: "all .2s",
                }}
                onMouseEnter={e => { e.target.style.borderColor = "var(--green)"; e.target.style.color = "var(--green)"; }}
                onMouseLeave={e => { e.target.style.borderColor = "var(--muted)"; e.target.style.color = "var(--muted)"; }}
              >
                ↺ RESET TIMER
              </button>
            </div>
          </Panel>

          {/* System status LEDs */}
          <Panel title="SYSTEM STATUS">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <LED on={isTestActive} label="TEST RUNNING" />
              <LED on={cpuActive} label={`CPU STRESS (${workerCount} threads)`} />
              <LED on={gpuActive} label={`GPU SHADER (${gpuFPS} fps)`} color="var(--cyan)" />
              <LED
                on={wakeLockStatus === "active"}
                label={`WAKE LOCK ${wakeLockStatus === "unsupported" ? "(N/A)" : ""}`}
                color="var(--magenta)"
              />
            </div>
          </Panel>

          {/* Hardware info */}
          <Panel title="HARDWARE">
            <MetaRow label="CPU CORES"   value={navigator.hardwareConcurrency || "?"} highlight />
            <MetaRow label="MAX THREADS" value={maxCores} />
            <MetaRow label="USER AGENT"  value={
              (() => {
                const ua = navigator.userAgent;
                if (ua.includes("Chrome")) return "CHROME";
                if (ua.includes("Firefox")) return "FIREFOX";
                if (ua.includes("Safari")) return "SAFARI";
                return "UNKNOWN";
              })()
            } />
            <MetaRow label="WEBGL"       value={canvasRef.current ? "READY" : "INIT"} />
          </Panel>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* GPU Canvas */}
          <Panel title="GPU RENDER OUTPUT" active={gpuActive} style={{ position: "relative", minHeight: 200 }}>
            <canvas
              ref={canvasRef}
              width={540}
              height={180}
              style={{
                width: "100%",
                height: 180,
                display: "block",
                borderRadius: 2,
                opacity: gpuActive ? 1 : 0.1,
                transition: "opacity .5s",
                imageRendering: "pixelated",
              }}
            />
            {!gpuActive && (
              <div style={{
                position: "absolute",
                top: "50%", left: "50%",
                transform: "translate(-50%,-50%)",
                fontFamily: "var(--font-display)",
                fontSize: 12,
                letterSpacing: 6,
                color: "var(--muted)",
              }}>
                GPU OFFLINE
              </div>
            )}
          </Panel>

          {/* Controls */}
          <Panel title="STRESS CONFIGURATION" active={isTestActive}>
            {/* Mode selector */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "var(--muted)", marginBottom: 8 }}>
                STRESS MODE
              </div>
              <select
                value={stressMode}
                onChange={e => handleModeChange(e.target.value)}
              >
                <option value="cpu">CPU ONLY</option>
                <option value="gpu">GPU ONLY</option>
                <option value="both">BOTH (MAX DRAIN)</option>
              </select>
            </div>

            {/* Intensity slider */}
            <div style={{ marginBottom: 18 }}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 10,
              }}>
                <span style={{ fontSize: 10, letterSpacing: 3, color: "var(--muted)" }}>
                  {sliderLabel}
                </span>
                <span style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 18,
                  color: "var(--green)",
                  textShadow: "0 0 8px var(--green)",
                  lineHeight: 1,
                }}>
                  {intensityLevel}
                  <span style={{ fontSize: 10, marginLeft: 4, color: "var(--muted)" }}>
                    / {sliderMax}
                  </span>
                </span>
              </div>
              <Bar value={intensityLevel} max={sliderMax} />
              <div style={{ marginTop: 10 }}>
                <input
                  type="range"
                  min={1}
                  max={sliderMax}
                  value={intensityLevel}
                  onChange={e => handleIntensityChange(Number(e.target.value))}
                />
              </div>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 4,
                fontSize: 10,
                color: "var(--muted)",
              }}>
                <span>MIN</span>
                <span>MAX</span>
              </div>
            </div>

            {/* Quick-set presets */}
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "var(--muted)", marginBottom: 8 }}>
                QUICK PRESETS
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { label: "LOW",      mode: "cpu", val: 1 },
                  { label: "MEDIUM",   mode: "both", val: Math.ceil(maxCores / 2) },
                  { label: "HIGH",     mode: "both", val: maxCores },
                  { label: "GPU MAX",  mode: "gpu", val: 10 },
                ].map(p => (
                  <button
                    key={p.label}
                    onClick={() => {
                      handleModeChange(p.mode);
                      handleIntensityChange(p.val);
                    }}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--green-dim)",
                      color: "var(--green-dim)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: 2,
                      padding: "4px 10px",
                      cursor: "pointer",
                      borderRadius: 2,
                      transition: "all .2s",
                    }}
                    onMouseEnter={e => { e.target.style.borderColor = "var(--green)"; e.target.style.color = "var(--green)"; e.target.style.boxShadow = "0 0 6px var(--green)"; }}
                    onMouseLeave={e => { e.target.style.borderColor = "var(--green-dim)"; e.target.style.color = "var(--green-dim)"; e.target.style.boxShadow = "none"; }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          {/* System log */}
          <Panel title="SYSTEM LOG">
            <div style={{
              height: 160,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column-reverse",
            }}>
              {[...log].reverse().map((entry, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 11,
                    lineHeight: 1.6,
                    color: entry.type === "ok"   ? "var(--green)"
                         : entry.type === "warn" ? "#FFD700"
                         : entry.type === "err"  ? "var(--red)"
                         : "var(--muted)",
                    animation: i === 0 ? "slide-in .25s ease" : "none",
                    paddingBottom: 2,
                    borderBottom: "1px solid #00FF410A",
                    marginBottom: 2,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ color: "#1a3a1a", marginRight: 8 }}>{entry.ts}</span>
                  {entry.msg}
                </div>
              ))}
              {log.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 2 }}>
                  AWAITING COMMANDS...
                  <span style={{ animation: "blink 1s infinite", display: "inline-block", marginLeft: 4 }}>█</span>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: 3,
        color: "#1a3a1a",
        marginTop: 8,
      }}>
        VOLTBURN © 2025 — FOR TESTING PURPOSES ONLY — USE RESPONSIBLY
      </div>
    </div>
  );
}