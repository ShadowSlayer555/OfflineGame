# 🧠 Agent Knowledge Transfer & Architectural Guidelines (The "OfflineGame" Playbook)

**Project Repository:** [https://github.com/ShadowSlayer555/OfflineGame](https://github.com/ShadowSlayer555/OfflineGame)

Hello! If you are a new AI agent reading this, welcome to the project. 
This document contains the complete architectural blueprint, design philosophy, and critical lessons learned from building this suite of peer-to-peer (P2P) offline games. 

The previous AI made several structural mistakes over the course of development. Your goal is to read this document carefully, absorb the context, and perfectly emulate the successful patterns of this project—while completely avoiding the pitfalls we've already solved.

---

## 1. The Core Paradigm
- **The Core Goal:** We build "Offline" Multiplayer Games. This means players connect their devices directly to each other **locally**, without relying on an external cloud server for game logic.
- **The Tech Stack:** Standard tools are TypeScript, React (18+), Vite, Tailwind CSS, and `lucide-react` for graphics/icons.
- **GitHub Integration:** The user actively deploys and manages source code via GitHub, including using `.github/workflows/deploy.yml` for CI/CD. Maintain clean, standardized project structures, and never clutter the root directory with messy test scripts (like `test-mqtt.cjs` or `test-vite.mjs`).

## 2. Networking Architecture (WebRTC First)
**⚠️ CRITICAL RULE: NO CENTRAL SERVERS.** 
The biggest mistake you could make is attempting to connect this app to a central backend (like introducing `socket.io`, MQTT brokers, or a persistent Node.js/Cloud backend). 
- **Signaling Phase:** We use QR Codes (via `QRScanner.tsx`) to pass WebRTC SDP offers/answers and ICE candidates physically/visually between devices. This completely bypasses the need for an online signaling server.
- **Data Transport:** All real-time inputs and game state syncs happen exclusively over WebRTC `RTCDataChannel`.
- **The Host-Client Relationship:** Because there is no server, one device acts as the **Host** (`isHost: true`) and the other as the **Client**. 
  - The Host computes the "Authoritative State" (physics collisions, true scoring, spawning).
  - The Client sends inputs to the host and renders the state they receive back. Always meticulously separate `isHost` logic in game loops.

## 3. Game Engineering & Physics Modules
We've built varying types of games (continuous physics vs. state-machine logic). Adhere to these exact rules:

### A. Matter.js Pitfalls (Physics)
When working with `matter-js` (used in games like Rocket League), Vite sometimes aggressively botches the CommonJS / Default Export resolution. 
- **The Fix:** If imports fail at runtime, use this safe resolution wrapper to ensure the engine initializes correctly:
  ```typescript
  const M3 = MatterPkg.Engine ? MatterPkg : (MatterPkg as any).default || MatterPkg;
  ```

### B. The React Effect Lifecycle (Memory Leaks)
Games use intense loops (`setInterval` for tick-rates or `requestAnimationFrame` for canvas rendering). If you don't clean these up perfectly, React's Strict Mode (or normal component unmounting) will cause game loops to exponentially multiply.
- **Always clear intervals/animations:** 
  ```typescript
  useEffect(() => {
    const loop = setInterval(() => { /* game logic */ }, 1000 / 60);
    const reqId = requestAnimationFrame(draw);
    return () => {
      clearInterval(loop);
      cancelAnimationFrame(reqId);
    };
  }, []);
  ```
- **Always clear physical engines:** If using Matter.js, you MUST call `Engine.clear(engine)` in the cleanup block so physics bodies do not duplicate upon re-rendering.

## 4. Current Game Roster & Design Patterns
- **Turn-based / Discrete Event Games (Chess, Hidden Role, CardBattleGround):** State sync is event-driven. You don't need a 60fps game loop. Send actions via WebRTC only when a player takes a turn.
- **Continuous Physics Games (Rocket League, Pong):** Rely on strict fixed tick-rates (e.g., `setInterval` for logic updates) and interpolated canvas renders.
- **Rhythm Games (Magic Tiles):** HTML5 Canvas API driven heavily by `requestAnimationFrame`. Requires precise millisecond timing. 

## 5. Final Guidelines
1. **Never mock data.** We build real integrations here.
2. **Keep the repo clean.** If you write a test file, delete it when you're done. 
3. **Pristine UIs.** Use Tailwind to build clean, intentional interfaces. Do not add random "techy" sci-fi styling or over-engineered dashboards unless explicitly asked.
4. **Learn from the file tree.** If a module like `audioManager.ts` or `webrtc.ts` exists, import and utilize those shared resources rather than reinventing standard libraries for every new mini-game.
