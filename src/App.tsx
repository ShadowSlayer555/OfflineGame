import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { Game } from './components/Game';
import { QRScanner } from './components/QRScanner';
import { decodeDescription, getCompleteLocalDescription, rtcConfig } from './lib/webrtc';
import { Smartphone, WifiOff, ScanLine, QrCode } from 'lucide-react';

type AppState =
  | 'IDLE'
  | 'HOSTING_OFFER'
  | 'HOSTING_SCAN_ANSWER'
  | 'JOIN_SCAN_OFFER'
  | 'JOIN_ANSWER'
  | 'CONNECTED';

export default function App() {
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [localData, setLocalData] = useState<string>(''); // Base64 compressed SDP
  const [errorTimer, setErrorTimer] = useState<string | null>(null);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);

  // Initialize Host
  const startHosting = async () => {
    try {
      const peer = new RTCPeerConnection(rtcConfig);
      peerRef.current = peer;

      // Host creates data channel
      const channel = peer.createDataChannel('game', {
        negotiated: true,
        id: 0,
      });
      channelRef.current = channel;

      channel.onopen = () => setAppState('CONNECTED');
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') setAppState('CONNECTED');
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const compressedOffer = await getCompleteLocalDescription(peer);
      setLocalData(compressedOffer);
      setAppState('HOSTING_OFFER');
    } catch (e: any) {
      setErrorTimer(e.message);
    }
  };

  // Host scans Guest Answer
  const hostScanAnswer = async (decodedSdp: string) => {
    try {
      const peer = peerRef.current;
      if (!peer) return;
      const desc = decodeDescription(decodedSdp);
      await peer.setRemoteDescription(desc);
      setAppState('CONNECTED');
    } catch (e: any) {
      console.warn("Invalid answer code", e);
    }
  };

  // Initialize Guest
  const startJoin = () => {
    setAppState('JOIN_SCAN_OFFER');
  };

  // Guest scans Host Offer
  const joinScanOffer = async (decodedSdp: string) => {
    try {
      const peer = new RTCPeerConnection(rtcConfig);
      peerRef.current = peer;

      // Guest also sets up negociated data channel
      const channel = peer.createDataChannel('game', {
        negotiated: true,
        id: 0,
      });
      channelRef.current = channel;
      channel.onopen = () => setAppState('CONNECTED');
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') setAppState('CONNECTED');
      };

      const desc = decodeDescription(decodedSdp);
      await peer.setRemoteDescription(desc);

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      const compressedAnswer = await getCompleteLocalDescription(peer);
      setLocalData(compressedAnswer);
      setAppState('JOIN_ANSWER');
    } catch (e: any) {
      console.warn("Invalid offer code", e);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans flex flex-col items-center">
      <header className="w-full max-w-lg mx-auto p-4 flex justify-between items-center border-b border-gray-200">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <WifiOff className="w-5 h-5 text-indigo-600" />
          Offline Play
        </h1>
        {appState !== 'IDLE' && appState !== 'CONNECTED' && (
          <button
            onClick={() => {
              peerRef.current?.close();
              setAppState('IDLE');
            }}
            className="text-sm font-medium text-gray-500 hover:text-gray-900"
          >
            Cancel
          </button>
        )}
      </header>

      <main className="w-full max-w-lg mx-auto flex-1 flex flex-col items-center justify-center p-6 space-y-8">
        {errorTimer && (
          <div className="bg-red-100 text-red-800 p-3 rounded-lg text-sm mb-4">
            {errorTimer}
          </div>
        )}

        {appState === 'IDLE' && (
          <div className="space-y-6 w-full text-center">
            <div className="pb-8">
              <Smartphone className="w-20 h-20 text-indigo-600 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold mb-2">Local Multiplayer</h2>
              <p className="text-gray-500">Connect to a friend's hotspot and play without the internet.</p>
            </div>

            <button
              onClick={startHosting}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl shadow-lg font-medium hover:bg-indigo-700 active:scale-[0.98] transition-transform"
            >
              Host Game
            </button>
            <button
              onClick={startJoin}
              className="w-full py-4 bg-white text-indigo-600 border-2 border-indigo-100 rounded-xl shadow-sm font-medium hover:bg-indigo-50 active:scale-[0.98] transition-transform"
            >
              Join Game
            </button>
          </div>
        )}

        {appState === 'HOSTING_OFFER' && (
          <div className="space-y-6 text-center w-full">
            <div>
              <h2 className="text-xl font-semibold mb-2">Host: Step 1</h2>
              <p className="text-sm text-gray-500 mb-6">Have your friend click "Join", then scan this QR code.</p>
            </div>
            <div className="bg-white p-4 rounded-3xl shadow-xl inline-block mx-auto border border-gray-100">
              <QRCodeSVG value={localData} size={250} level="L" marginSize={2} />
            </div>
            
            <button
              onClick={() => setAppState('HOSTING_SCAN_ANSWER')}
              className="w-full mt-6 py-4 bg-indigo-600 text-white flex justify-center items-center gap-2 rounded-xl shadow-lg font-medium hover:bg-indigo-700"
            >
              <ScanLine className="w-5 h-5" />
              I scanned it, now scan theirs
            </button>
          </div>
        )}

        {appState === 'HOSTING_SCAN_ANSWER' && (
          <div className="space-y-6 text-center w-full flex flex-col items-center">
             <div>
              <h2 className="text-xl font-semibold mb-2">Host: Step 2</h2>
              <p className="text-sm text-gray-500 mb-6">Scan the answer code on your friend's screen to start.</p>
            </div>
            <QRScanner
              onScan={hostScanAnswer}
              onError={() => {}}
            />
          </div>
        )}

        {appState === 'JOIN_SCAN_OFFER' && (
          <div className="space-y-6 text-center w-full flex flex-col items-center">
            <div>
              <h2 className="text-xl font-semibold mb-2">Join: Step 1</h2>
              <p className="text-sm text-gray-500 mb-6">Scan the host's QR code.</p>
            </div>
            <QRScanner
              onScan={joinScanOffer}
              onError={() => {}}
            />
          </div>
        )}

        {appState === 'JOIN_ANSWER' && (
          <div className="space-y-6 text-center w-full">
            <div>
              <h2 className="text-xl font-semibold mb-2">Join: Step 2</h2>
              <p className="text-sm text-gray-500 mb-6">Show this code to the host so they can scan it.</p>
            </div>
            
            <div className="bg-white p-4 rounded-3xl shadow-xl inline-block mx-auto border border-gray-100">
              <QRCodeSVG value={localData} size={250} level="L" marginSize={2} />
            </div>
            
            <p className="text-sm text-indigo-600 mt-6 flex items-center justify-center gap-2 font-medium">
              <QrCode className="w-4 h-4 animate-pulse" />
              Waiting for host...
            </p>
          </div>
        )}

        {appState === 'CONNECTED' && channelRef.current && (
          <Game 
            channel={channelRef.current} 
            isHost={peerRef.current?.localDescription?.type === 'offer'} 
          />
        )}
      </main>
    </div>
  );
}
