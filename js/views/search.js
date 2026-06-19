// User search with live results.
import { el, mount, clear, debounce } from "../utils.js";
import { icon } from "../icons.js";
import { header, userRow, emptyState, spinnerRow } from "../components.js";
import { ensureShell } from "../shell.js";
import { navigate } from "../router.js";
import { uid } from "../state.js";
import { searchUsers, suggestedUsers } from "../services/users.js";

export function renderSearch(ctx) {
  const main = ensureShell();
  const initialQ = ctx.query.q ? decodeURIComponent(ctx.query.q) : "";

  const input = el("input", { class: "input", placeholder: "Search people", value: initialQ.replace(/^#/, "") });
  const searchBar = el("div", { class: "search-input-wrap", style: { flex: "1" } }, [
    el("span", { class: "ic", html: icon("search") }), input,
  ]);
  const results = el("div");

  const run = debounce(async (term) => {
    if (!term || term.trim().length < 1) { showSuggestions(); return; }
    mount(results, spinnerRow());
    try {
      const users = await searchUsers(term.trim());
      if (!users.length) { mount(results, emptyState("No results", `Nobody matches “${term}”.`)); return; }
      clear(results);
      users.forEach((u) => results.appendChild(userRow(u)));
    } catch (e) { mount(results, emptyState("Search failed", e.message || "")); }
  }, 280);

  async function showSuggestions() {
    mount(results, spinnerRow());
    try {
      const users = await suggestedUsers(uid(), 12);
      if (!users.length) { mount(results, emptyState("Find people", "Search by name or @username.")); return; }
      clear(results);
      results.appendChild(el("div", { class: "muted", style: { padding: "12px 16px 4px", fontWeight: "700" }, text: "Suggested for you" }));
      users.forEach((u) => results.appendChild(userRow(u)));
    } catch { mount(results, emptyState("Find people", "Search by name or @username.")); }
  }

  input.addEventListener("input", () => run(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(input.value); });

  mount(main,
    el("div", { class: "col-header" }, [searchBar]),
    results,
  );

  if (initialQ) run(initialQ.replace(/^#/, "")); else showSuggestions();
  setTimeout(() => input.focus(), 50);
}
