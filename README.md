# ⚡ VOLTBURN
**Battery Drain Controller v2.0**

VOLTBURN is a specialized, browser-based application designed for rigorous device stress-testing. By intentionally saturating CPU cores and GPU execution units, it provides a controlled environment for battery drain analysis, thermal throttling observation, and raw performance benchmarking—all wrapped in a high-fidelity cyberpunk terminal interface.

---
## 🖥️ Application URL

https://voltburn.vercel.app/

## ✨ Key Features

*   **Multi-Threaded CPU Stress:** Leverages Web Workers to run heavy, continuous Miller-Rabin primality tests on large integers. Spawns across multiple cores to maximize CPU thread utilization.
*   **Intensive GPU Shading:** Utilizes a custom WebGL pipeline that renders an iterated Mandelbrot set combined with domain-warped fractional Brownian motion (fBm) noise, designed to heavily tax GPU ALUs.
*   **Screen Wake Lock API:** Automatically prevents the device screen from dimming or going to sleep during extended test cycles.
*   **Granular Control:** Choose between "CPU Only", "GPU Only", or "Both (Max Drain)" modes. A real-time intensity slider allows you to scale the load dynamically without restarting the test.
*   **Cyberpunk Telemetry Interface:** Features a live system log, real-time FPS counter, thread monitor, global timer, hardware metadata panel, and custom styling with CRT scanlines and neon glow effects.
*   **Fault Tolerance:** Built with a custom React Error Boundary to catch UI/component crashes, displaying a fallback terminal screen with the stack trace instead of failing silently.

## 🚀 Getting Started

This application is built with standard React and can be run using modern bundlers like Vite or Webpack.

### Prerequisites
*   Node.js (v16+ recommended)
*   npm, yarn, or pnpm
*   A modern web browser with WebGL and Web Worker support

### Installation

1.  **Clone the repository** (or download the source):
    ```bash
    git clone https://github.com/your-username/voltburn.git
    cd voltburn
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the development server:**
    ```bash
    npm run dev
    ```

4.  **Open the application:**
    Navigate to `http://localhost:5173` (or the port provided by your terminal).

## 🛠️ Architecture & Tech Stack

*   **React 18+ (`StrictMode`):** Core UI component management, state hooks (`useState`, `useEffect`, `useRef`), and isolated error boundaries.
*   **Web Workers (Blob URLs):** Isolates the heavy Miller-Rabin math functions from the main thread, allowing the UI to remain responsive even at 100% CPU load.
*   **WebGL (GLSL):** The fragment shader dynamically translates an intensity parameter (`u_iterations`) into rendering depth to scale GPU compute load.
*   **Wake Lock API:** `navigator.wakeLock.request('screen')` ensures long-running drain tests aren't interrupted by device sleep policies.
*   **CSS-in-JS (Inline + Global):** Uses injected global stylesheets for animations (`@keyframes`) and raw CSS variables for the color palette (`--green`, `--green-glow`).

## ⚠️ Disclaimer & Warning

**FOR TESTING PURPOSES ONLY — USE RESPONSIBLY.**

Running VOLTBURN at maximum settings ("BOTH" mode, max intensity) will cause your device to draw maximum power. Extended use may lead to:
*   Rapid battery depletion.
*   Significant device heating / thermal throttling.
*   Reduced hardware lifespan if ran continuously without adequate cooling.

Ensure you monitor your device's temperature when running intensity tests for extended periods.
