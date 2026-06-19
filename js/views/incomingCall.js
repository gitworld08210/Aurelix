// Incoming call banner. Mounted into #call-layer when a ringing call arrives.
import { el, mount, clear } from "../utils.js";
import { icon } from "../icons.js";
import { avatar } from "../components.js";
import { callController } from "../call.js";
import { setStatus } from "../services/calls.js";

let currentCallId = null;

export function mountIncomingCall(calls) {
  const layer = document.getElementById("call-layer");
  // If we're already on a call, ignore incoming ring UI.
  if (callController.isActive()) return;

  const call = calls && calls[0];
  if (!call) { if (currentCallId) { currentCallId = null; clear(layer); } return; }
  if (call.id === currentCallId) return; // already showing
  currentCallId = call.id;

  const caller = { displayName: call.callerName, photoURL: call.callerPhoto };
  const accept = async () => { clear(layer); currentCallId = null; await callController.acceptIncoming(call); };
  const decline = async () => { clear(layer); currentCallId = null; await setStatus(call.id, "declined"); };

  mount(layer, el("div", { class: "incoming-call glass" }, [
    el("span", { class: "pulse" }, [avatar(caller, "")]),
    el("div", { class: "grow" }, [
      el("div", { style: { fontWeight: "800" }, text: caller.displayName || "Someone" }),
      el("div", { class: "muted", text: (call.type === "video" ? "Incoming video call…" : "Incoming voice call…") }),
    ]),
    el("div", { class: "ring-actions" }, [
      el("button", { class: "call-btn end", style: { width: "48px", height: "48px" }, "aria-label": "Decline", html: icon("phoneOff"), onClick: decline }),
      el("button", { class: "call-btn answer", style: { width: "48px", height: "48px" }, "aria-label": "Answer", html: icon(call.type === "video" ? "videoCall" : "phone"), onClick: accept }),
    ]),
  ]));
}
