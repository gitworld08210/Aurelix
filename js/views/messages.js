// Conversation list + new chat / new group creation.
import { el, mount, clear, toast, timeAgo, openModal, debounce } from "../utils.js";
import { icon } from "../icons.js";
import { header, avatar, emptyState, spinnerRow, userRow } from "../components.js";
import { ensureShell } from "../shell.js";
import { navigate } from "../router.js";
import { me, uid } from "../state.js";
import { watchMyConversations, getOrCreateDM, createGroup, isConversationUnread } from "../services/messages.js";
import { searchUsers } from "../services/users.js";

export function renderConversations() {
  const main = ensureShell();
  const list = el("div", {}, [spinnerRow()]);

  const newBtn = el("button", { class: "back-btn", title: "New message", html: icon("edit"), onClick: openNewChat });
  const groupBtn = el("button", { class: "back-btn", title: "New group", html: icon("group"), onClick: openNewGroup });

  mount(main, header("Messages", { actions: [groupBtn, newBtn] }), list);

  const unsub = watchMyConversations(uid(), (convs) => {
    if (!convs.length) { mount(list, emptyState("No conversations", "Start a chat from someone's profile or tap the compose icon.")); return; }
    clear(list);
    convs.forEach((c) => list.appendChild(convRow(c)));
  });

  return () => unsub?.();
}

function otherInfo(c) {
  if (c.isGroup) return { displayName: c.name || "Group", photoURL: c.photoURL || "", isGroup: true };
  const otherId = (c.members || []).find((m) => m !== uid());
  return (c.memberInfo && c.memberInfo[otherId]) || { displayName: "Conversation" };
}

function convRow(c) {
  const info = otherInfo(c);
  const unread = isConversationUnread(c, uid());
  const last = c.lastMessage;
  const av = c.isGroup
    ? el("div", { class: "avatar", html: icon("group") })
    : avatar(info, "");
  return el("div", { class: "conv-row", onClick: () => navigate("/messages/" + c.id) }, [
    av,
    el("div", { class: "grow col", style: { minWidth: 0 } }, [
      el("div", { class: "row", style: { justifyContent: "space-between" } }, [
        el("span", { style: { fontWeight: unread ? "800" : "700" }, text: info.displayName }),
        el("span", { class: "faint", style: { fontSize: ".78rem" }, text: last ? timeAgo(last.createdAt) : "" }),
      ]),
      el("div", { class: "row", style: { justifyContent: "space-between", gap: "8px" } }, [
        el("span", { class: "last ellipsis grow", text: last ? (last.senderId === uid() ? "You: " : "") + (last.text || "") : "Say hi 👋" }),
        unread ? el("span", { class: "unread-dot" }) : null,
      ]),
    ]),
  ]);
}

function userPicker({ multi = false, onPick, onDone, title }) {
  const input = el("input", { class: "input", placeholder: "Search people", style: { borderRadius: "var(--radius-pill)" } });
  const results = el("div", { style: { maxHeight: "44vh", overflowY: "auto" } });
  const selected = new Map();
  const chips = el("div", { class: "row", style: { flexWrap: "wrap", gap: "6px" } });

  const renderChips = () => {
    clear(chips);
    selected.forEach((u) => chips.appendChild(el("span", { class: "chip", onClick: () => { selected.delete(u.id); renderChips(); } }, [el("span", { text: u.displayName || u.username }), el("span", { html: icon("close") })])));
  };

  const run = debounce(async (term) => {
    if (!term.trim()) { clear(results); return; }
    mount(results, spinnerRow());
    try {
      const users = (await searchUsers(term.trim())).filter((u) => u.id !== uid());
      clear(results);
      if (!users.length) { mount(results, emptyState("No results", "")); return; }
      users.forEach((u) => {
        const row = userRow(u, { trailing: multi ? el("span", { class: "ic", html: icon(selected.has(u.id) ? "check" : "plus") }) : null });
        row.onclick = () => {
          if (multi) { if (selected.has(u.id)) selected.delete(u.id); else selected.set(u.id, u); renderChips(); run(input.value); }
          else onPick(u);
        };
        results.appendChild(row);
      });
    } catch (e) { mount(results, emptyState("Search failed", e.message || "")); }
  }, 260);
  input.addEventListener("input", () => run(input.value));

  const nameInput = multi ? el("input", { class: "input", placeholder: "Group name", style: { marginBottom: "10px" } }) : null;
  const doneBtn = multi ? el("button", { class: "btn primary full mt", text: "Create group", onClick: () => onDone([...selected.values()], nameInput.value) }) : null;

  const modal = openModal(el("div", {}, [
    el("h2", { text: title }),
    nameInput,
    input,
    multi ? chips : null,
    results,
    doneBtn,
  ]));
  setTimeout(() => input.focus(), 50);
  return modal;
}

function openNewChat() {
  const modal = userPicker({
    title: "New message",
    onPick: async (u) => {
      try { const cid = await getOrCreateDM(me(), u); modal.close(); navigate("/messages/" + cid); }
      catch (e) { toast(e.message || "Could not start chat", "error"); }
    },
  });
}

function openNewGroup() {
  const modal = userPicker({
    multi: true,
    title: "New group",
    onDone: async (users, name) => {
      if (users.length < 1) return toast("Add at least one person");
      try { const cid = await createGroup(me(), users, name || "New group"); modal.close(); navigate("/messages/" + cid); }
      catch (e) { toast(e.message || "Could not create group", "error"); }
    },
  });
}
