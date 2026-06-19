// Realtime 1:1 / group chat with read receipts, typing indicator, media + calls.
import { el, mount, clear, toast, clockTime, debounce } from "../utils.js";
import { icon } from "../icons.js";
import { header, avatar, spinnerRow, pickFile } from "../components.js";
import { ensureShell } from "../shell.js";
import { navigate } from "../router.js";
import { me, uid } from "../state.js";
import {
  watchConversation, watchMessages, sendMessage, markRead, setTyping, watchTyping,
} from "../services/messages.js";
import { getUser } from "../services/users.js";
import { uploadToCloudinary } from "../cloudinary.js";
import { isCloudinaryConfigured } from "../config.js";
import { callController, startGroupCallNotice } from "../call.js";

export function renderChat(ctx) {
  const main = ensureShell();
  const cid = ctx.params.cid;
  let conv = null, otherUser = null, messages = [];
  const unsubs = [];

  const titleEl = el("h1", { text: "Chat" });
  const subEl = el("div", { class: "muted", style: { fontSize: ".8rem" } });
  const backBtn = el("button", { class: "back-btn", html: icon("back"), onClick: () => navigate("/messages") });
  const voiceBtn = el("button", { class: "back-btn", title: "Voice call", html: icon("phone") });
  const videoBtn = el("button", { class: "back-btn", title: "Video call", html: icon("videoCall") });

  const scroll = el("div", { class: "chat-scroll" }, [spinnerRow()]);
  const typingEl = el("div", { class: "typing" });

  const input = el("textarea", { class: "textarea", placeholder: "Message…", rows: 1 });
  const imgBtn = el("button", { class: "icon-btn", html: icon("image"), title: "Send photo" });
  const sendBtn = el("button", { class: "icon-btn", html: icon("send") });

  const headerEl = el("div", { class: "col-header" }, [
    backBtn, el("div", { class: "col grow" }, [titleEl, subEl]), voiceBtn, videoBtn,
  ]);

  mount(main, el("div", { class: "chat-wrap" }, [
    headerEl,
    scroll,
    typingEl,
    el("div", { class: "chat-input-bar" }, [imgBtn, input, sendBtn]),
  ]));

  // auto-grow textarea
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; });

  // ----- conversation meta -----
  unsubs.push(watchConversation(cid, async (c) => {
    if (!c) { titleEl.textContent = "Conversation"; return; }
    conv = c;
    if (c.isGroup) {
      titleEl.textContent = c.name || "Group";
      subEl.textContent = (c.members?.length || 0) + " members";
      voiceBtn.onclick = startGroupCallNotice;
      videoBtn.onclick = startGroupCallNotice;
    } else {
      const otherId = (c.members || []).find((m) => m !== uid());
      const info = (c.memberInfo && c.memberInfo[otherId]) || {};
      otherUser = { id: otherId, ...info };
      titleEl.textContent = info.displayName || "Conversation";
      subEl.textContent = "@" + (info.username || "");
      titleEl.style.cursor = "pointer";
      titleEl.onclick = () => info.username && navigate("/u/" + info.username);
      voiceBtn.onclick = () => otherUser && callController.startOutgoing(otherUser, "voice");
      videoBtn.onclick = () => otherUser && callController.startOutgoing(otherUser, "video");
    }
  }));

  // ----- messages -----
  unsubs.push(watchMessages(cid, (msgs) => {
    messages = msgs;
    renderMessages();
    markRead(cid, uid(), msgs).catch(() => {});
  }));

  function renderMessages() {
    if (!messages.length) { mount(scroll, el("div", { class: "empty", text: "No messages yet — say hi!" })); return; }
    const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120;
    clear(scroll);
    let lastSender = null;
    messages.forEach((m) => {
      const mine = m.senderId === uid();
      const showAvatar = conv?.isGroup && !mine && m.senderId !== lastSender;
      lastSender = m.senderId;
      const readByOther = (m.readBy || []).some((x) => x !== uid());
      const bubble = el("div", { class: "bubble " + (mine ? "me" : "them") }, [
        showAvatar ? el("div", { class: "faint", style: { fontSize: ".72rem", marginBottom: "2px" }, text: m.senderName || "" }) : null,
        m.image ? el("img", { src: m.image, loading: "lazy" }) : null,
        m.text ? el("div", { text: m.text }) : null,
        el("div", { class: "meta" }, [
          el("span", { text: clockTime(m.createdAt) }),
          mine ? el("span", { class: "ic", style: { width: "14px", height: "14px" }, html: icon(readByOther ? "checkDouble" : "check") }) : null,
        ]),
      ]);
      scroll.appendChild(bubble);
    });
    if (atBottom) scroll.scrollTop = scroll.scrollHeight;
  }

  // ----- typing indicator -----
  unsubs.push(watchTyping(cid, uid(), (typers) => {
    if (!typers.length) { typingEl.textContent = ""; return; }
    const name = conv?.memberInfo?.[typers[0]]?.displayName || "Someone";
    typingEl.innerHTML = `${name} is typing<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>`;
  }));

  const stopTyping = debounce(() => setTyping(cid, uid(), false), 2500);
  input.addEventListener("input", () => { setTyping(cid, uid(), true); stopTyping(); });

  // ----- send -----
  const doSend = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = ""; input.style.height = "auto";
    setTyping(cid, uid(), false);
    try { await sendMessage(cid, me(), { text }); } catch (e) { toast("Could not send", "error"); input.value = text; }
  };
  sendBtn.addEventListener("click", doSend);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); } });

  imgBtn.addEventListener("click", async () => {
    if (!isCloudinaryConfigured()) return toast("Cloudinary isn't configured (Settings).", "error");
    const f = await pickFile("image/*");
    if (!f) return;
    toast("Uploading photo…");
    try {
      const up = await uploadToCloudinary(f, { resourceType: "image", folder: "messages" });
      await sendMessage(cid, me(), { image: up.secureUrl });
    } catch (e) { toast(e.message || "Upload failed", "error"); }
  });

  return () => { unsubs.forEach((u) => { try { u(); } catch {} }); setTyping(cid, uid(), false); };
}
