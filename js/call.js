// WebRTC call controller: 1:1 voice & video over Firestore signaling.
// Group calling is architected on top of this (see startGroupCall note) but a
// production group call needs an SFU/TURN server, which is out of scope here.
import { el, mount, clear, toast } from "./utils.js";
import { icon } from "./icons.js";
import { avatar } from "./components.js";
import {
  createCallDoc, setOffer, setAnswer, setStatus, watchCall,
  addCandidate, watchCandidates, cleanupCall,
} from "./services/calls.js";
import { me } from "./state.js";

const RTC_CONFIG = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    // For calls across strict NATs you should also configure a TURN server here.
  ],
};

class CallController {
  constructor() {
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
    this.callId = null;
    this.role = null; // 'caller' | 'callee'
    this.type = "video";
    this.peer = null; // {displayName, photoURL}
    this.unsubs = [];
    this.active = false;
    this.muted = false;
    this.camOff = false;
    this.statusText = "";
  }

  isActive() { return this.active; }

  async _getMedia(type) {
    const constraints = type === "video" ? { video: { facingMode: "user" }, audio: true } : { video: false, audio: true };
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      console.error(e);
      throw new Error(type === "video" ? "Camera/microphone access denied." : "Microphone access denied.");
    }
  }

  _newPeerConnection() {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.remoteStream = new MediaStream();
    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((t) => this.remoteStream.addTrack(t));
      this._attachRemote();
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") this._setStatus("Connected");
      else if (s === "connecting") this._setStatus("Connecting…");
      else if (s === "failed") { this._setStatus("Connection failed"); toast("Call connection failed (network/NAT). A TURN server may be required.", "error"); }
      else if (s === "disconnected") this._setStatus("Reconnecting…");
    };
    return pc;
  }

  async startOutgoing(callee, type = "video") {
    if (this.active) { toast("You're already on a call."); return; }
    const meUser = me();
    if (!meUser) return;
    if (callee.id === meUser.id) { toast("You can't call yourself."); return; }
    try {
      this.active = true;
      this.role = "caller";
      this.type = type;
      this.peer = callee;
      this.localStream = await this._getMedia(type);
      this.pc = this._newPeerConnection();
      this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream));

      this.callId = await createCallDoc({ caller: meUser, callee, type });

      this.pc.onicecandidate = (e) => { if (e.candidate) addCandidate(this.callId, "callerCandidates", e.candidate.toJSON()); };

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await setOffer(this.callId, { type: offer.type, sdp: offer.sdp });

      this._setStatus("Ringing…");
      this._render();

      // Listen for answer + status changes
      this.unsubs.push(watchCall(this.callId, async (call) => {
        if (!call) return this.hangup(true);
        if (call.status === "declined") { toast(`${callee.displayName || callee.username} declined`); return this.hangup(true); }
        if (call.status === "ended") return this.hangup(true);
        if (call.answer && this.pc && !this.pc.currentRemoteDescription) {
          await this.pc.setRemoteDescription(new RTCSessionDescription(call.answer));
        }
      }));
      this.unsubs.push(watchCandidates(this.callId, "calleeCandidates", (c) => {
        this.pc?.addIceCandidate(new RTCIceCandidate(c)).catch((err) => console.warn(err));
      }));
    } catch (e) {
      toast(e.message || "Could not start call", "error");
      this.hangup(true);
    }
  }

  async acceptIncoming(call) {
    if (this.active) { toast("You're already on a call."); return; }
    const meUser = me();
    try {
      this.active = true;
      this.role = "callee";
      this.type = call.type;
      this.callId = call.id;
      this.peer = { id: call.callerId, displayName: call.callerName, photoURL: call.callerPhoto };
      this.localStream = await this._getMedia(call.type);
      this.pc = this._newPeerConnection();
      this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream));
      this.pc.onicecandidate = (e) => { if (e.candidate) addCandidate(this.callId, "calleeCandidates", e.candidate.toJSON()); };

      // The offer should already be present; if not, wait for it via the watcher.
      const applyOfferAndAnswer = async (offer) => {
        if (this.pc.currentRemoteDescription) return;
        await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await setAnswer(this.callId, { type: answer.type, sdp: answer.sdp });
      };

      if (call.offer) await applyOfferAndAnswer(call.offer);

      this._setStatus("Connecting…");
      this._render();

      this.unsubs.push(watchCall(this.callId, async (c) => {
        if (!c || c.status === "ended") return this.hangup(true);
        if (c.offer && this.pc && !this.pc.currentRemoteDescription) await applyOfferAndAnswer(c.offer);
      }));
      this.unsubs.push(watchCandidates(this.callId, "callerCandidates", (c) => {
        this.pc?.addIceCandidate(new RTCIceCandidate(c)).catch((err) => console.warn(err));
      }));
    } catch (e) {
      toast(e.message || "Could not answer call", "error");
      setStatus(call.id, "ended");
      this.hangup(true);
    }
  }

  async hangup(skipRemote = false) {
    if (!skipRemote && this.callId) await setStatus(this.callId, "ended");
    this.unsubs.forEach((u) => { try { u(); } catch {} });
    this.unsubs = [];
    if (this.pc) { try { this.pc.close(); } catch {} this.pc = null; }
    if (this.localStream) { this.localStream.getTracks().forEach((t) => t.stop()); this.localStream = null; }
    this.remoteStream = null;
    if (this.callId && this.role === "caller") cleanupCall(this.callId);
    this.callId = null; this.active = false; this.muted = false; this.camOff = false;
    clear(document.getElementById("call-layer"));
  }

  toggleMute() {
    if (!this.localStream) return;
    this.muted = !this.muted;
    this.localStream.getAudioTracks().forEach((t) => (t.enabled = !this.muted));
    this._render();
  }

  toggleCamera() {
    if (!this.localStream || this.type !== "video") return;
    this.camOff = !this.camOff;
    this.localStream.getVideoTracks().forEach((t) => (t.enabled = !this.camOff));
    this._render();
  }

  _setStatus(text) { this.statusText = text; const n = document.querySelector(".call-status .state"); if (n) n.textContent = text; }

  _attachRemote() {
    const v = document.querySelector(".call-video-stage .remote");
    if (v && this.remoteStream) { v.srcObject = this.remoteStream; v.play?.().catch(() => {}); }
    const a = document.getElementById("call-remote-audio");
    if (a && this.remoteStream) { a.srcObject = this.remoteStream; a.play?.().catch(() => {}); }
  }

  _render() {
    const layer = document.getElementById("call-layer");
    const peerName = this.peer?.displayName || this.peer?.username || "User";

    const controls = el("div", { class: "call-controls" }, [
      el("button", { class: `call-btn ${this.muted ? "muted" : ""}`, "aria-label": "Mute", html: icon(this.muted ? "micOff" : "mic"), onClick: () => this.toggleMute() }),
      this.type === "video"
        ? el("button", { class: `call-btn ${this.camOff ? "muted" : ""}`, "aria-label": "Camera", html: icon(this.camOff ? "camOff" : "videoCall"), onClick: () => this.toggleCamera() })
        : null,
      el("button", { class: "call-btn end", "aria-label": "End call", html: icon("phoneOff"), onClick: () => this.hangup() }),
    ]);

    const status = el("div", { class: "call-status" }, [
      el("div", { class: "who", text: peerName }),
      el("div", { class: "state", text: this.statusText || (this.type === "video" ? "Video call" : "Voice call") }),
    ]);

    let stage;
    if (this.type === "video") {
      stage = el("div", { class: "call-video-stage" }, [
        el("video", { class: "remote", autoplay: true, playsinline: true }),
        el("video", { class: "local", autoplay: true, playsinline: true, muted: true }),
        status,
      ]);
    } else {
      stage = el("div", { class: "call-voice-stage" }, [
        status,
        avatar(this.peer || {}, "xl"),
        el("audio", { id: "call-remote-audio", autoplay: true }),
      ]);
    }

    mount(layer, el("div", { class: "call-overlay" }, [stage, controls]));

    // attach streams after mount
    if (this.type === "video") {
      const lv = layer.querySelector(".local");
      if (lv && this.localStream) { lv.srcObject = this.localStream; lv.play?.().catch(() => {}); }
    }
    this._attachRemote();
  }
}

export const callController = new CallController();

// Group calling note: to add group video/voice, create one CallController peer
// connection per remote participant (mesh) keyed under calls/{groupId}/peers/...,
// or integrate an SFU (e.g. LiveKit/mediasoup). The 1:1 signaling above is the
// building block. A TURN server is strongly recommended for reliability.
export function startGroupCallNotice() {
  toast("Group calls need a media server (SFU) — 1:1 voice/video is fully working.", "");
}
