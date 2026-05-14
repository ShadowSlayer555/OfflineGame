import LZString from 'lz-string';

// Helper to wait until ICE gathering is complete
export async function getCompleteLocalDescription(peer: RTCPeerConnection, meta: any = null): Promise<string> {
  return new Promise((resolve) => {
    if (peer.iceGatheringState === 'complete') {
      const sdpString = JSON.stringify({ ...peer.localDescription?.toJSON(), meta });
      resolve(LZString.compressToEncodedURIComponent(sdpString));
      return;
    }

    const checkState = () => {
      if (peer.iceGatheringState === 'complete') {
        peer.removeEventListener('icegatheringstatechange', checkState);
        const sdpString = JSON.stringify({ ...peer.localDescription?.toJSON(), meta });
        resolve(LZString.compressToEncodedURIComponent(sdpString));
      }
    };
    peer.addEventListener('icegatheringstatechange', checkState);

    // Timeout fallback after 7s (to allow STUN servers to resolve over slower hotspot connections)
    setTimeout(() => {
      if (peer.iceGatheringState !== 'complete') {
        peer.removeEventListener('icegatheringstatechange', checkState);
        const sdpString = JSON.stringify({ ...peer.localDescription?.toJSON(), meta });
        resolve(LZString.compressToEncodedURIComponent(sdpString));
      }
    }, 7000);
  });
}

export function decodeDescription(encoded: string): RTCSessionDescriptionInit & { meta?: any } {
  const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
  if (!decompressed) throw new Error("Invalid or corrupted QR data");
  return JSON.parse(decompressed);
}

// Config string for local P2P with STUN fallback.
export const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
};
