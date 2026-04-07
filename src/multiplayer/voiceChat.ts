import type { ClientToServerMessage, PlayerSlot, WebRtcSignalPayload } from './protocol.ts';

export type VoicePeerOptions = {
  myId: string;
  localPlayerSlot: PlayerSlot;
  send: (msg: ClientToServerMessage) => void;
  remoteAudio: HTMLAudioElement;
  iceServers?: RTCIceServer[];
  /** Host (slot 0) must not send an offer until another player is seated. */
  hasRemotePlayer: () => boolean;
  /** Autoplay policy blocked remote audio — show “tap to play” in UI. */
  onRemotePlayBlocked?: () => void;
  onRemotePlaybackStarted?: () => void;
  /** After remote MediaStream is bound (e.g. apply setSinkId before play()). */
  onRemoteStreamAttached?: () => void | Promise<void>;
};

function parseIceServersFromEnv(): RTCIceServer[] | null {
  const raw = import.meta.env.VITE_RTC_ICE_SERVERS;
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as RTCIceServer[];
  } catch {
    return null;
  }
}

export function defaultVoiceIceServers(): RTCIceServer[] {
  return (
    parseIceServersFromEnv() ?? [
      {
        urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
      },
    ]
  );
}

/**
 * WebRTC audio to the other seated player. Signaling via room WebSocket.
 * Slot 0 sends the offer when both sides are ready; slot 1 answers.
 */
export function createVoicePeer(opts: VoicePeerOptions) {
  const iceServers = opts.iceServers ?? defaultVoiceIceServers();

  let localStream: MediaStream | null = null;
  let pc: RTCPeerConnection | null = null;
  let audioSender: RTCRtpSender | null = null;
  let micMuted = false;
  let remoteDescSet = false;
  const pendingIce: RTCIceCandidateInit[] = [];
  const remoteTrackUnmuteCleanups: Array<() => void> = [];

  function sendPayload(payload: WebRtcSignalPayload): void {
    opts.send({ type: 'webrtcSignal', payload });
  }

  function applyMutedToLocalTracks(): void {
    if (!localStream) return;
    for (const t of localStream.getAudioTracks()) {
      t.enabled = !micMuted;
    }
  }

  function attemptPlayRemote(): void {
    void opts.remoteAudio.play().then(
      () => {
        opts.onRemotePlaybackStarted?.();
      },
      () => {
        opts.onRemotePlayBlocked?.();
      },
    );
  }

  function attachRemoteStream(stream: MediaStream, track: MediaStreamTrack): void {
    for (const c of remoteTrackUnmuteCleanups.splice(0)) {
      c();
    }
    opts.remoteAudio.srcObject = stream;
    opts.remoteAudio.volume = 1;
    opts.remoteAudio.muted = false;
    const onUnmute = (): void => {
      attemptPlayRemote();
    };
    track.addEventListener('unmute', onUnmute);
    remoteTrackUnmuteCleanups.push(() => track.removeEventListener('unmute', onUnmute));
    void Promise.resolve()
      .then(() => opts.onRemoteStreamAttached?.())
      .finally(() => {
        attemptPlayRemote();
      });
  }

  function flushIce(): void {
    if (!pc || !remoteDescSet) return;
    while (pendingIce.length > 0) {
      const c = pendingIce.shift()!;
      void pc.addIceCandidate(c).catch(() => {});
    }
  }

  function ensurePc(): RTCPeerConnection {
    if (pc) return pc;
    remoteDescSet = false;
    pendingIce.length = 0;
    const p = new RTCPeerConnection({ iceServers });
    const tr = p.addTransceiver('audio', { direction: 'sendrecv' });
    audioSender = tr.sender;
    p.onicecandidate = (ev) => {
      if (ev.candidate) {
        sendPayload({
          phase: 'ice',
          candidate: JSON.stringify(ev.candidate.toJSON()),
        });
      }
    };
    p.ontrack = (ev) => {
      const track = ev.track;
      if (track.kind !== 'audio') return;
      const streamWithTrack =
        ev.streams.find((s) => s.getTracks().includes(track)) ??
        new MediaStream([track]);
      attachRemoteStream(streamWithTrack, track);
    };
    pc = p;
    return p;
  }

  async function syncMicToSender(): Promise<void> {
    if (!audioSender) return;
    const t = localStream?.getAudioTracks()[0] ?? null;
    await audioSender.replaceTrack(t);
    applyMutedToLocalTracks();
  }

  async function hostNegotiate(): Promise<void> {
    if (opts.localPlayerSlot !== 0 || !localStream) return;
    if (!opts.hasRemotePlayer()) return;
    const p = ensurePc();
    await syncMicToSender();
    if (p.signalingState !== 'stable') return;
    const offer = await p.createOffer();
    await p.setLocalDescription(offer);
    if (!offer.sdp) return;
    sendPayload({ phase: 'offer', sdp: offer.sdp });
  }

  async function onOffer(sdp: string): Promise<void> {
    const p = ensurePc();
    await syncMicToSender();
    await p.setRemoteDescription({ type: 'offer', sdp });
    remoteDescSet = true;
    flushIce();
    const answer = await p.createAnswer();
    await p.setLocalDescription(answer);
    if (!answer.sdp) return;
    sendPayload({ phase: 'answer', sdp: answer.sdp });
  }

  /** Host (slot 0): guest sent a follow-up offer (mic after first answer, or ICE restart). */
  async function onIncomingOfferAsHost(sdp: string): Promise<void> {
    if (opts.localPlayerSlot !== 0) return;
    const p = ensurePc();
    await syncMicToSender();
    await p.setRemoteDescription({ type: 'offer', sdp });
    remoteDescSet = true;
    flushIce();
    const answer = await p.createAnswer();
    await p.setLocalDescription(answer);
    if (!answer.sdp) return;
    sendPayload({ phase: 'answer', sdp: answer.sdp });
  }

  /**
   * Guest (slot 1): after mic is enabled post-handshake, send a new offer so the host
   * completes SDP/ICE (host previously ignored incoming offers; guest also ignored answers).
   */
  async function guestRenegotiateAfterMic(): Promise<void> {
    if (opts.localPlayerSlot !== 1) return;
    if (!localStream || !opts.hasRemotePlayer()) return;
    const p = pc;
    if (!p || p.signalingState !== 'stable') return;
    await syncMicToSender();
    const offer = await p.createOffer({ iceRestart: true });
    await p.setLocalDescription(offer);
    if (!offer.sdp) return;
    sendPayload({ phase: 'offer', sdp: offer.sdp });
  }

  async function replaceMicrophoneDevice(deviceId: string | null): Promise<void> {
    if (!localStream) return;
    const audioConstraints: MediaTrackConstraints | boolean =
      deviceId && deviceId.length > 0
        ? { deviceId: { exact: deviceId } }
        : true;
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: false,
    });
    for (const t of localStream.getTracks()) {
      t.stop();
    }
    localStream = newStream;
    applyMutedToLocalTracks();
    await syncMicToSender();
    if (opts.localPlayerSlot === 0) await hostNegotiate();
    if (opts.localPlayerSlot === 1) await guestRenegotiateAfterMic();
  }

  return {
    get hasLocalMic(): boolean {
      return localStream !== null;
    },

    async startMicrophone(deviceId?: string | null): Promise<void> {
      const audioConstraints: MediaTrackConstraints | boolean =
        deviceId && deviceId.length > 0
          ? { deviceId: { exact: deviceId } }
          : true;
      if (localStream) {
        if (deviceId && deviceId.length > 0) {
          await replaceMicrophoneDevice(deviceId);
        } else {
          await syncMicToSender();
          if (opts.localPlayerSlot === 0) await hostNegotiate();
          if (opts.localPlayerSlot === 1) await guestRenegotiateAfterMic();
        }
        return;
      }
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      applyMutedToLocalTracks();
      await syncMicToSender();
      if (opts.localPlayerSlot === 0) await hostNegotiate();
      if (opts.localPlayerSlot === 1) await guestRenegotiateAfterMic();
    },

    switchMicrophoneDevice(deviceId: string | null): Promise<void> {
      return replaceMicrophoneDevice(deviceId);
    },

    /** Call from a button click if the browser blocked autoplay for remote audio. */
    async tryPlayRemoteAudio(): Promise<boolean> {
      try {
        await opts.remoteAudio.play();
        opts.onRemotePlaybackStarted?.();
        return true;
      } catch {
        return false;
      }
    },

    /** Slot 0: second player present or mic just enabled while guest already in room. */
    async notifyHostShouldNegotiate(): Promise<void> {
      await hostNegotiate();
    },

    setMicMuted(muted: boolean): void {
      micMuted = muted;
      applyMutedToLocalTracks();
    },

    async onServerSignal(fromId: string, payload: WebRtcSignalPayload): Promise<void> {
      if (fromId === opts.myId) return;

      if (payload.phase === 'offer') {
        if (opts.localPlayerSlot === 0) {
          await onIncomingOfferAsHost(payload.sdp);
        } else {
          await onOffer(payload.sdp);
        }
        return;
      }

      if (payload.phase === 'answer') {
        if (!pc) return;
        await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
        remoteDescSet = true;
        flushIce();
        return;
      }

      if (payload.phase === 'ice') {
        let init: RTCIceCandidateInit;
        try {
          init = JSON.parse(payload.candidate) as RTCIceCandidateInit;
        } catch {
          return;
        }
        if (!init?.candidate) return;
        if (!pc) {
          pendingIce.push(init);
          return;
        }
        if (!remoteDescSet) {
          pendingIce.push(init);
          return;
        }
        void pc.addIceCandidate(init).catch(() => {});
      }
    },

    /** Close WebRTC session when the other player leaves; keep mic stream if any. */
    resetSession(): void {
      for (const c of remoteTrackUnmuteCleanups.splice(0)) {
        c();
      }
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.close();
        pc = null;
      }
      audioSender = null;
      remoteDescSet = false;
      pendingIce.length = 0;
      opts.remoteAudio.srcObject = null;
    },

    dispose(): void {
      this.resetSession();
      if (localStream) {
        for (const t of localStream.getTracks()) {
          t.stop();
        }
        localStream = null;
      }
    },

    getConnectionState(): RTCPeerConnectionState | null {
      return pc?.connectionState ?? null;
    },
  };
}

export type VoicePeer = ReturnType<typeof createVoicePeer>;
