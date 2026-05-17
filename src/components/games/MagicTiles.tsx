import { useEffect, useRef, useState } from 'react';
import { GameMessage } from '../../types';
import { playMagicTileNote } from '../../lib/audioManager';

interface MagicTilesProps {
  channel: RTCDataChannel;
  isHost: boolean;
  onBackToLobby: () => void;
}

interface Tile {
  id: string;
  lane: number;
  y: number; // 0 to 1
  direction: 'up' | 'down';
  speed: number;
  note: string;
  hitState?: 'good' | 'perfect'; // Visual cue when flying up
}

const MELODY = [
  "E5", "D#5", "E5", "D#5", "E5", "B4", "D5", "C5", "A4",
  "C4", "E4", "A4", "B4",
  "E4", "G#4", "B4", "C5",
  "E4", "E5", "D#5", "E5", "D#5", "E5", "B4", "D5", "C5", "A4",
  "C4", "E4", "A4", "B4",
  "E4", "C5", "B4", "A4"
];

export function MagicTiles({ channel, isHost, onBackToLobby }: MagicTilesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [lives, setLives] = useState(20);
  const [opponentLives, setOpponentLives] = useState(20);

  const gameState = useRef({
    tiles: [] as Tile[],
    lives: 20,
    opponentLives: 20,
    startTime: 0,
    spawnQueue: [] as { time: number, lane: number, note: string, speed: number }[],
    gameOver: null as string | null
  });

  const broadcastInfo = useRef<{ type: string; [key: string]: any }[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'GAME_MESSAGE' && message.game === 'MAGIC_TILES') {
          const data = message.payload;
          if (data.type === 'SEND_TILE') {
            gameState.current.tiles.push({
              id: Math.random().toString(),
              lane: 3 - data.lane, // Mirror the lane! Left for them is Right for us.
              direction: 'down',
              y: -0.1,
              speed: data.speed,
              note: data.note,
            });
          } else if (data.type === 'UPDATE_LIVES') {
            gameState.current.opponentLives = data.lives;
            setOpponentLives(data.lives);
          } else if (data.type === 'GAME_OVER') {
            gameState.current.gameOver = data.winner;
            setGameOver(data.winner);
          } else if (data.type === 'REMATCH') {
            resetGame();
          }
        }
      } catch (err) {}
    };

    channel.addEventListener('message', handleMessage);
    return () => channel.removeEventListener('message', handleMessage);
  }, [channel]);

  // Start initial tiles
  useEffect(() => {
    if (isHost && !gameOver && gameState.current.tiles.length === 0 && gameState.current.spawnQueue.length === 0) {
      setTimeout(() => {
        if (!gameState.current.gameOver) {
            resetGame();
        }
      }, 1000);
    }
  }, [isHost, gameOver]);

  // Main game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();
    let reqId: number;

    const draw = (time: number) => {
      const nowSec = performance.now() / 1000;
      const dt = (time - lastTime) / 1000; // delta time in seconds
      lastTime = time;

      if (!gameState.current.gameOver) {
          // Update physics
          const state = gameState.current;

          // Spawn queued tiles
          while (state.spawnQueue.length > 0 && nowSec >= state.spawnQueue[0].time) {
              const spawn = state.spawnQueue.shift()!;
              state.tiles.push({
                  id: Math.random().toString(),
                  lane: spawn.lane,
                  y: -0.1,
                  direction: 'down',
                  speed: spawn.speed,
                  note: spawn.note
              });
          }
          
          for (let i = state.tiles.length - 1; i >= 0; i--) {
               const t = state.tiles[i];
               if (t.direction === 'down') {
                   t.y += t.speed * dt;
                   if (t.y > 1.1) {
                       // Missed!
                       state.tiles.splice(i, 1);
                       state.lives -= 1;
                       setLives(state.lives);
                       broadcastInfo.current.push({ type: 'UPDATE_LIVES', lives: state.lives });
                       if (state.lives <= 0) {
                           state.gameOver = 'Opponent won!';
                           setGameOver('Opponent won!');
                           broadcastInfo.current.push({ type: 'GAME_OVER', winner: 'Host won!' /* wait, fix this later */ });
                       }
                   }
               } else {
                   // Flying up!
                   t.y -= t.speed * (dt * 1.5); // fly up a bit faster visually
                   if (t.y < -0.1) {
                       state.tiles.splice(i, 1);
                       broadcastInfo.current.push({ type: 'SEND_TILE', lane: t.lane, speed: Math.min(t.speed, 2.5), note: t.note }); 
                   }
               }
          }

          // Process broadcasts
          while (broadcastInfo.current.length > 0) {
              const msg = broadcastInfo.current.shift()!;
              if (msg.type === 'GAME_OVER') {
                  // If my lives hit 0, opponent won. Let's send the text they should see.
                   sendPayload({ type: 'GAME_OVER', winner: 'You won!' });
              } else {
                   sendPayload(msg);
              }
          }
      }

      // Render
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Draw lanes
      const laneWidth = w / 4;
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * laneWidth, 0);
        ctx.lineTo(i * laneWidth, h);
        ctx.stroke();
      }

      // Draw hit zone
      const hitStart = h * 0.75;
      const hitEnd = h * 0.95;
      ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
      ctx.fillRect(0, hitStart, w, hitEnd - hitStart);
      ctx.strokeStyle = '#6366f1';
      ctx.beginPath();
      ctx.moveTo(0, hitStart);
      ctx.lineTo(w, hitStart);
      ctx.moveTo(0, hitEnd);
      ctx.lineTo(w, hitEnd);
      ctx.stroke();

      // Draw tiles
      gameState.current.tiles.forEach(t => {
          const x = t.lane * laneWidth;
          const ty = t.y * h;
          const tileHeight = h * 0.15;
          
          if (t.direction === 'down') {
              ctx.fillStyle = '#1f2937'; // slate-800
              ctx.fillRect(x + 5, ty, laneWidth - 10, tileHeight);
          } else {
               // Flying up - add visual trail
               ctx.fillStyle = '#6366f1'; // indigo-500
               ctx.fillRect(x + 5, ty, laneWidth - 10, tileHeight);
               ctx.globalAlpha = 0.3;
               ctx.fillRect(x + 5, ty + tileHeight, laneWidth - 10, tileHeight * 1.5);
               ctx.globalAlpha = 1.0;
               
               if (t.hitState) {
                  ctx.fillStyle = 'white';
                  ctx.font = 'bold 20px inter';
                  ctx.textAlign = 'center';
                  ctx.fillText(t.hitState.toUpperCase(), x + laneWidth/2, ty + tileHeight/2 + 7);
               }
          }
      });

      reqId = requestAnimationFrame(draw);
    };

    reqId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(reqId);
  }, []);

  const sendPayload = (payload: any) => {
    if (channel.readyState === 'open') {
      channel.send(JSON.stringify({
        type: 'GAME_MESSAGE',
        game: 'MAGIC_TILES',
        payload
      }));
    }
  };

  const handleTap = (lane: number) => {
     if (gameState.current.gameOver) return;

     const state = gameState.current;
     
     // Note: visual coordinates. y=0 is top, y=1 is bottom. 
     // Hit zone is between roughly 0.7 and 1.0
     const hitZoneStart = 0.65;
     const hitZoneEnd = 1.05;

     let bestTileIndex = -1;
     let lowestY = -1;

     // Find lowest tile in hit zone
     for (let i = 0; i < state.tiles.length; i++) {
         const t = state.tiles[i];
         if (t.lane === lane && t.direction === 'down' && t.y > hitZoneStart && t.y < hitZoneEnd) {
             if (t.y > lowestY) {
                 lowestY = t.y;
                 bestTileIndex = i;
             }
         }
     }

     if (bestTileIndex !== -1) {
         // Hit!
         const t = state.tiles[bestTileIndex];
         state.tiles.splice(bestTileIndex, 1);
         playMagicTileNote(t.note);

         // speed up!
         const newSpeed = t.speed * 1.02;
         let hitState: 'good' | 'perfect' = 'good';
         if (t.y > 0.75 && t.y < 0.90) {
             hitState = 'perfect';
         }

         state.tiles.push({
             id: Math.random().toString(),
             lane,
             direction: 'up',
             y: t.y,
             speed: newSpeed,
             hitState,
             note: t.note
         });
     }
  };

  // Setup click handlers for container
  useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const handlePointerDown = (e: PointerEvent) => {
         e.preventDefault();
         const rect = container.getBoundingClientRect();
         const x = e.clientX - rect.left;
         const lane = Math.floor((x / rect.width) * 4);
         if (lane >= 0 && lane <= 3) {
             handleTap(lane);
         }
      };

      container.addEventListener('pointerdown', handlePointerDown);
      return () => container.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const resetGame = () => {
      gameState.current = {
        tiles: [],
        lives: 20,
        opponentLives: 20,
        startTime: performance.now() / 1000,
        spawnQueue: [],
        gameOver: null
      };
      setLives(20);
      setOpponentLives(20);
      setGameOver(null);
      if (isHost) {
          gameState.current.spawnQueue = MELODY.map((note, idx) => ({
             time: (performance.now() / 1000) + 1.0 + (idx * 0.5),
             lane: Math.floor(Math.random() * 4),
             note: note,
             speed: 0.4
          }));
      }
  };

  const requestRematch = () => {
     sendPayload({ type: 'REMATCH' });
     resetGame();
  };

  return (
    <div className="flex flex-col items-center justify-start w-full h-[80vh] pt-4">
      <div className="flex w-full max-w-md justify-between items-center px-4 mb-2">
         <div className="flex flex-col">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">You</span>
            <div className="flex gap-1 mt-1">
               <span className={`text-xl font-black ${lives < 5 ? 'text-red-500' : 'text-indigo-600'}`}>{lives}</span>
               <span className="text-xl text-gray-400">♥</span>
            </div>
         </div>
         
         <button onClick={onBackToLobby} className="text-xs font-bold bg-white text-gray-600 px-3 py-1.5 rounded-full border shadow-sm">Quit</button>

         <div className="flex flex-col items-end">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Opponent</span>
            <div className="flex gap-1 mt-1">
               <span className="text-xl text-gray-400">♥</span>
               <span className={`text-xl font-black ${opponentLives < 5 ? 'text-red-500' : 'text-rose-500'}`}>{opponentLives}</span>
            </div>
         </div>
      </div>

      <div className="relative w-full max-w-md bg-white border-2 border-gray-200 rounded-3xl overflow-hidden shadow-sm flex-1 mb-6 mt-2 touch-none select-none" ref={containerRef}>
         <canvas 
            ref={canvasRef}
            width={400}
            height={600}
            className="w-full h-full object-cover touch-none"
         />
         
         {/* Instruction Overlay */}
         <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none opacity-20">
             <div className="text-2xl font-black tracking-widest uppercase">Tap Lanes</div>
             <div className="text-sm font-bold">To play music & attack!</div>
         </div>

         {/* Base Piano Keys Visual */}
         <div className="absolute bottom-0 left-0 right-0 h-24 flex pointer-events-none">
             {[0,1,2,3].map(i => (
                 <div key={i} className="flex-1 border-r last:border-r-0 border-gray-300 relative">
                     <div className="absolute bottom-2 left-2 right-2 h-16 bg-gray-100 rounded-xl border-b-4 border-gray-300 shadow-inner"></div>
                 </div>
             ))}
         </div>

         {gameOver && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-6 animate-in fade-in">
                <h3 className="text-4xl font-black text-gray-900 mb-6">{gameOver}</h3>
                <button onClick={requestRematch} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold text-xl shadow-xl shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all">
                    Rematch
                </button>
            </div>
         )}
      </div>
    </div>
  );
}
