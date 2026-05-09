import LZString from 'lz-string';

// Helper to wait until ICE gathering is complete
export async function getCompleteLocalDescription(peer: RTCPeerConnection): Promise<string> {
  return new Promise((resolve) => {
    if (peer.iceGatheringState === 'complete') {
      const sdpString = JSON.stringify(peer.localDescription);
      resolve(LZString.compressToEncodedURIComponent(sdpString));
      return;
    }

    const checkState = () => {
      if (peer.iceGatheringState === 'complete') {
        peer.removeEventListener('icegatheringstatechange', checkState);
        const sdpString = JSON.stringify(peer.localDescription);
        resolve(LZString.compressToEncodedURIComponent(sdpString));
      }
    };
    peer.addEventListener('icegatheringstatechange', checkState);

    // Timeout fallback after 2s (since local network ICE candidates should be nearly instant)
    setTimeout(() => {
      if (peer.iceGatheringState !== 'complete') {
        peer.removeEventListener('icegatheringstatechange', checkState);
        const sdpString = JSON.stringify(peer.localDescription);
        resolve(LZString.compressToEncodedURIComponent(sdpString));
      }
    }, 2000);
  });
}

export function decodeDescription(encoded: string): RTCSessionDescriptionInit {
  const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
  if (!decompressed) throw new Error("Invalid or corrupted QR data");
  return JSON.parse(decompressed);
}

// Config string for local P2P without STUN/TURN fallback.
export const rtcConfig: RTCConfiguration = {
  iceServers: [], // empty for local wifi direct/hotspot only
};
