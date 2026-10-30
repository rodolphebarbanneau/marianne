/**
 * What a runtime page takes away before the service's code runs. The pages' content policy
 * forbids every connection but one kind it doesn't govern: WebRTC, which could reach a server of
 * the service's choosing. Its constructors are gone from the page (and can't be put back); the
 * main side's sandbox also sends it nowhere (its session's proxy), whatever a frame would find.
 */

const CONNECTIONS = ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCSessionDescription', 'RTCIceCandidate']

export function removeConnections(): void {
  for (const name of CONNECTIONS) {
    try {
      Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false, enumerable: false })
    } catch {
      // not defined here, or already taken away
    }
  }
}
