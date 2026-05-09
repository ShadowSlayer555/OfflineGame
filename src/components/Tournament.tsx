import React, { useEffect, useState, useMemo } from 'react';
import { GameType, GameMessage } from '../types';
import { TapWar } from './games/TapWar';
import { Pong } from './games/Pong';
import { ChessGame } from './games/ChessGame';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, ChevronRight, Swords } from 'lucide-react';

interface PlayerInfo {
  id: string;
  name: string;
}

interface Match {
  id: string;
  p1Id: string;
  p1Name: string;
  p2Id: string;
  p2Name: string;
  winnerId: string | null;
}

interface TournamentState {
  matches: Match[];
  currentMatchIndex: number;
  isComplete: boolean;
}

interface TournamentProps {
  gameType: GameType;
  myId: string;
  myName: string;
  players: PlayerInfo[];
  isGlobalHost: boolean;
  channelsRef: React.MutableRefObject<Map<string, RTCDataChannel>>;
  onBackToLobby: () => void;
}

export class VirtualDataChannel extends EventTarget {
  readyState = 'open';
  constructor(private sendCallback: (data: string) => void) {
    super();
  }
  send(data: string) {
    this.sendCallback(data);
  }
}

export function Tournament({ gameType, myId, myName, players, isGlobalHost, channelsRef, onBackToLobby }: TournamentProps) {
  const [tState, setTState] = useState<TournamentState | null>(null);
  const [showingBracket, setShowingBracket] = useState(true);

  // Generate round robin
  useEffect(() => {
    if (isGlobalHost && !tState) {
      const matches: Match[] = [];
      const p = [...players];
      for (let i = 0; i < p.length; i++) {
        for (let j = i + 1; j < p.length; j++) {
          matches.push({
            id: `match-${i}-${j}`,
            p1Id: p[i].id,
            p1Name: p[i].name,
            p2Id: p[j].id,
            p2Name: p[j].name,
            winnerId: null,
          });
        }
      }
      const initial = { matches, currentMatchIndex: 0, isComplete: false };
      setTState(initial);
      broadcast({ type: 'T_STATE', payload: initial });
    }
  }, [isGlobalHost, players, tState]);

  const broadcast = (msg: any) => {
    const msgStr = JSON.stringify(msg);
    channelsRef.current.forEach(c => {
      if (c.readyState === 'open') c.send(msgStr);
    });
  };

  // Handle incoming tournament messages
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'T_STATE') {
          setTState(msg.payload);
        } else if (msg.type === 'T_START_MATCH') {
          setShowingBracket(false);
        } else if (msg.type === 'T_MATCH_WIN') {
          if (isGlobalHost) {
            setTState(prev => {
              if (!prev) return prev;
              const next = { ...prev };
              next.matches[next.currentMatchIndex].winnerId = msg.winnerId;
              if (next.currentMatchIndex + 1 < next.matches.length) {
                next.currentMatchIndex++;
                setShowingBracket(true);
              } else {
                next.isComplete = true;
                setShowingBracket(true);
              }
              broadcast({ type: 'T_STATE', payload: next });
              return next;
            });
          }
        } else if (msg.type === 'T_RELAY') {
          // If we are global host and we need to route to a specific guest
          if (isGlobalHost && msg.toId) {
            const target = channelsRef.current.get(msg.toId);
            if (target && target.readyState === 'open') {
              target.send(JSON.stringify(msg.payload)); // Forward exact GameMessage
            }
          }
        }
      } catch (err) {}
    };

    channelsRef.current.forEach(c => c.addEventListener('message', handleMessage));
    return () => {
      channelsRef.current.forEach(c => c.removeEventListener('message', handleMessage));
    };
  }, [isGlobalHost, channelsRef]);

  if (!tState) return <div className="text-center p-8">Setting up tournament...</div>;

  const currentMatch = tState.matches[tState.currentMatchIndex];
  const amInMatch = currentMatch ? myId === currentMatch.p1Id || myId === currentMatch.p2Id : false;

  // Let's create the virtual data channel for the child game
  const vc = useMemo(() => {
    if (!currentMatch) return null;
    return new VirtualDataChannel((data: string) => {
      const parsed = JSON.parse(data);
      // Are we p1 or p2?
      const toId = myId === currentMatch.p1Id ? currentMatch.p2Id : currentMatch.p1Id;
      
      // Check for Game Over override!
      if (parsed.payload) {
         if (gameType === 'PONG') {
            // we will need to hook into Pong's end state somehow, or rely on them signaling?
            // pong doesn't have an explicit win message handled here.
            // Wait, we need to declare match win.
            // Let's patch standard GAME_MESSAGE if it has winner/score.
            // Actually, Pong sets 'gameOver'.
         }
      }

      if (toId === 'host') {
         // I am a guest talking to host, direct
         const c = channelsRef.current.get('host');
         if (c) c.send(data);
      } else if (myId === 'host') {
         // I am host talking to a guest
         const c = channelsRef.current.get(toId);
         if (c) c.send(data);
      } else {
         // Guest to Guest via Host
         const c = channelsRef.current.get('host'); 
         if (c) c.send(JSON.stringify({ type: 'T_RELAY', toId, payload: parsed }));
      }
    });
  }, [currentMatch, myId, channelsRef, gameType]);

  // Hook up incoming GAME_MESSAGEs to the virtual channel
  useEffect(() => {
    const handleGameMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'GAME_MESSAGE' && msg.game === gameType) { // Direct from opponent
            // Wrap in a fake message event and dispatch on virtual channel
            vc?.dispatchEvent(new MessageEvent('message', { data: e.data }));
        } else if (msg.type === 'T_RELAY' && !isGlobalHost) { // Relayed by host 
            // The payload is the original GameMessage
            vc?.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(msg.payload) }));
        }
      } catch (err) {}
    };
    channelsRef.current.forEach(c => c.addEventListener('message', handleGameMessage));
    return () => {
       channelsRef.current.forEach(c => c.removeEventListener('message', handleGameMessage));
    };
  }, [vc, channelsRef, isGlobalHost, gameType]);


  const startMatch = () => {
    if (isGlobalHost) {
      setShowingBracket(false);
      broadcast({ type: 'T_START_MATCH' });
    }
  };

  if (showingBracket) {
     return (
        <div className="flex flex-col items-center justify-center p-6 bg-slate-50 w-full min-h-full">
           <h2 className="text-3xl font-display font-bold text-slate-800 mb-8 flex items-center gap-3">
             <Trophy className="w-8 h-8 text-amber-500" />
             Tournament Bracket
           </h2>
           <div className="w-full max-w-2xl overflow-x-auto pb-8 snap-x snap-mandatory hide-scrollbar">
              <div className="flex gap-4">
                 {tState.matches.map((m, idx) => {
                    const isCurrent = idx === tState.currentMatchIndex && !tState.isComplete;
                    const isPast = idx < tState.currentMatchIndex;
                    return (
                       <div key={m.id} className={`snap-center shrink-0 w-64 bg-white rounded-2xl shadow-sm border-2 p-4 transition-all duration-300 ${isCurrent ? 'border-indigo-500 scale-105 shadow-md shadow-indigo-100' : isPast ? 'border-slate-200 opacity-60' : 'border-slate-200 opacity-80'}`}>
                          <div className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-3 text-center">Match {idx + 1}</div>
                          <div className="flex flex-col gap-2 items-center">
                             <div className={`w-full text-center p-3 rounded-xl font-bold bg-slate-50 border ${m.winnerId === m.p1Id ? 'border-green-400 text-green-700 bg-green-50' : m.winnerId ? 'border-red-200 text-slate-500' : 'border-slate-100 text-slate-700'}`}>
                                {m.p1Name} {m.winnerId === m.p1Id && '🏆'}
                             </div>
                             <Swords className="w-5 h-5 text-slate-300" />
                             <div className={`w-full text-center p-3 rounded-xl font-bold bg-slate-50 border ${m.winnerId === m.p2Id ? 'border-green-400 text-green-700 bg-green-50' : m.winnerId ? 'border-red-200 text-slate-500' : 'border-slate-100 text-slate-700'}`}>
                                {m.p2Name} {m.winnerId === m.p2Id && '🏆'}
                             </div>
                          </div>
                          {isCurrent && (
                             <div className="mt-4 text-center">
                               {isGlobalHost ? (
                                  <button onClick={startMatch} className="w-full bg-indigo-600 text-white font-bold py-2 rounded-xl text-sm shadow-sm hover:bg-indigo-700 active:scale-95 transition-all">Start Match</button>
                               ) : (
                                  <span className="text-xs text-indigo-500 font-bold animate-pulse">Waiting for host...</span>
                               )}
                             </div>
                          )}
                       </div>
                    );
                 })}
              </div>
           </div>
           
           {tState.isComplete && (
               <div className="mt-8 text-center animate-in fade-in slide-in-from-bottom">
                  <h3 className="text-2xl font-bold text-slate-800 mb-4">Tournament Complete!</h3>
                  <button onClick={onBackToLobby} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-bold text-lg shadow-lg hover:bg-slate-800 active:scale-95 transition-all">Back to Lobby</button>
               </div>
           )}
           {!tState.isComplete && (
              <button onClick={onBackToLobby} className="mt-8 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">Emergency Quit</button>
           )}
        </div>
     );
  }

  // Active Match Context
  const isP1 = myId === currentMatch.p1Id;
  const isP2 = myId === currentMatch.p2Id;
  // Let p1 be 'host' equivalent in the 2-player game logical sense
  const isGameHost = isP1;

  // We need to pass the game over to tournament state.
  // TapWar calls setGameOver("Host wins!") or "Joiner wins!". But we own it outside.
  // Actually, modifying TapWar and Pong slightly to emit win events to parent is better,
  // but if we don't want to touch them, we can intercept GAME_MESSAGE on vc?
  // Wait, let's just make Tournament intercept messages or provide a wrapper.

  return (
    <div className="w-full h-full relative">
       {amInMatch ? (
          <>
             <div className="absolute top-2 left-0 right-0 z-50 pointer-events-none flex justify-center">
                <span className="bg-white/90 backdrop-blur px-4 py-1.5 rounded-full text-xs font-bold text-slate-600 shadow-sm border border-slate-200">
                   Match {tState.currentMatchIndex + 1}: {currentMatch.p1Name} vs {currentMatch.p2Name}
                </span>
             </div>
             {gameType === 'TAP_WAR' && <TapWar channel={vc as any} isHost={isGameHost} onBackToLobby={() => {}} />}
             {gameType === 'PONG' && <Pong channel={vc as any} isHost={isGameHost} onBackToLobby={() => {}} />}
             {gameType === 'CHESS' && <ChessGame channel={vc as any} isHost={isGameHost} onBackToLobby={() => {}} />}

             <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
                {isGlobalHost && (
                   <>
                      <button onClick={() => {
                         const msg = { type: 'T_MATCH_WIN', winnerId: currentMatch.p1Id };
                         setTState(prev => {
                           if (!prev) return prev;
                           const next = { ...prev };
                           next.matches[next.currentMatchIndex].winnerId = currentMatch.p1Id;
                           if (next.currentMatchIndex + 1 < next.matches.length) {
                             next.currentMatchIndex++;
                             setShowingBracket(true);
                           } else {
                             next.isComplete = true;
                             setShowingBracket(true);
                           }
                           broadcast({ type: 'T_STATE', payload: next });
                           return next;
                         });
                      }} className="bg-indigo-600 text-white text-xs px-3 py-2 rounded-xl font-bold">{currentMatch.p1Name} Won</button>
                      
                      <button onClick={() => {
                         const msg = { type: 'T_MATCH_WIN', winnerId: currentMatch.p2Id };
                         setTState(prev => {
                           if (!prev) return prev;
                           const next = { ...prev };
                           next.matches[next.currentMatchIndex].winnerId = currentMatch.p2Id;
                           if (next.currentMatchIndex + 1 < next.matches.length) {
                             next.currentMatchIndex++;
                             setShowingBracket(true);
                           } else {
                             next.isComplete = true;
                             setShowingBracket(true);
                           }
                           broadcast({ type: 'T_STATE', payload: next });
                           return next;
                         });
                      }} className="bg-rose-500 text-white text-xs px-3 py-2 rounded-xl font-bold">{currentMatch.p2Name} Won</button>
                   </>
                )}
             </div>
          </>
       ) : (
          <div className="flex flex-col items-center justify-center h-[70vh]">
             <h3 className="text-2xl font-bold text-slate-800 mb-2">Spectating</h3>
             <p className="text-lg text-slate-500 mb-8">{currentMatch?.p1Name} vs {currentMatch?.p2Name}</p>
             <div className="flex items-center justify-center p-8 bg-slate-100 rounded-3xl animate-pulse">
                <Swords className="w-12 h-12 text-slate-300" />
             </div>
             {isGlobalHost && (
                <div className="mt-8 flex gap-2">
                   <button onClick={() => {
                         const msg = { type: 'T_MATCH_WIN', winnerId: currentMatch.p1Id };
                         setTState(prev => {
                           if (!prev) return prev;
                           const next = { ...prev };
                           next.matches[next.currentMatchIndex].winnerId = currentMatch.p1Id;
                           if (next.currentMatchIndex + 1 < next.matches.length) {
                             next.currentMatchIndex++;
                             setShowingBracket(true);
                           } else {
                             next.isComplete = true;
                             setShowingBracket(true);
                           }
                           broadcast({ type: 'T_STATE', payload: next });
                           return next;
                         });
                      }} className="bg-indigo-600 text-white text-xs px-3 py-2 rounded-xl font-bold">{currentMatch.p1Name} Won</button>
                      <button onClick={() => {
                         const msg = { type: 'T_MATCH_WIN', winnerId: currentMatch.p2Id };
                         setTState(prev => {
                           if (!prev) return prev;
                           const next = { ...prev };
                           next.matches[next.currentMatchIndex].winnerId = currentMatch.p2Id;
                           if (next.currentMatchIndex + 1 < next.matches.length) {
                             next.currentMatchIndex++;
                             setShowingBracket(true);
                           } else {
                             next.isComplete = true;
                             setShowingBracket(true);
                           }
                           broadcast({ type: 'T_STATE', payload: next });
                           return next;
                         });
                      }} className="bg-rose-500 text-white text-xs px-3 py-2 rounded-xl font-bold">{currentMatch.p2Name} Won</button>
                </div>
             )}
          </div>
       )}
    </div>
  );
}
