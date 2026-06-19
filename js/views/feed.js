// Home feed: realtime-ish paginated posts with infinite scroll + pull to refresh.
import { el, mount, clear } from "../utils.js";
import { icon } from "../icons.js";
import { header, emptyState, spinnerRow, avatar } from "../components.js";
import { ensureShell, openComposer } from "../shell.js";
import { me } from "../state.js";
import { navigate } from "../router.js";
import { fetchFeedPage } from "../services/posts.js";
import { postCard } from "../postCard.js";

export function renderFeed() {
  const main = ensureShell();

  const list = el("div", { class: "feed-list" });
  const sentinel = el("div", { style: { height: "1px" } });
  const ptr = el("div", { class: "ptr" }, [el("span", { class: "spinner sm" })]);

  const composerStub = el("div", { class: "composer", onClick: () => openComposer("post") }, [
    avatar(me() || {}, ""),
    el("div", { class: "grow muted", style: { padding: "14px 4px", fontSize: "1.1rem" }, text: "What's happening?" }),
    el("button", { class: "icon-btn", html: icon("image"), onClick: (e) => { e.stopPropagation(); openComposer("post"); } }),
  ]);

  const msgAction = el("button", { class: "back-btn", title: "Messages", html: icon("mail"), onClick: () => navigate("/messages") });

  mount(main,
    header("Home", { actions: [msgAction] }),
    ptr,
    composerStub,
    list,
    sentinel,
  );

  let cursor = null, done = false, loading = false, empty = true;

  async function loadMore() {
    if (loading || done) return;
    loading = true;
    const loader = spinnerRow();
    list.appendChild(loader);
    try {
      const page = await fetchFeedPage({ cursor });
      loader.remove();
      cursor = page.cursor; done = page.done;
      if (page.items.length) {
        empty = false;
        page.items.forEach((p) => list.appendChild(postCard(p)));
      }
      if (empty && done) {
        list.appendChild(emptyState("Your feed is empty", "Follow people or create your first post.",
          el("button", { class: "btn primary", text: "Create post", onClick: () => openComposer("post") })));
      }
    } catch (e) {
      loader.remove();
      console.error(e);
      list.appendChild(emptyState("Couldn't load feed", e.message || "Check your connection / Firestore rules.",
        el("button", { class: "btn", text: "Retry", onClick: () => { done = false; loadMore(); } })));
      done = true;
    }
    loading = false;
  }

  async function refresh() {
    cursor = null; done = false; loading = false; empty = true;
    clear(list);
    await loadMore();
  }

  const io = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadMore();
  }, { rootMargin: "600px" });
  io.observe(sentinel);

  // Pull to refresh (touch)
  let startY = 0, pulling = false;
  const onStart = (e) => { if (window.scrollY <= 0) { startY = e.touches[0].clientY; pulling = true; } };
  const onMove = (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) ptr.classList.toggle("show", dy > 60);
  };
  const onEnd = () => { if (pulling && ptr.classList.contains("show")) { ptr.classList.remove("show"); refresh(); } pulling = false; };
  window.addEventListener("touchstart", onStart, { passive: true });
  window.addEventListener("touchmove", onMove, { passive: true });
  window.addEventListener("touchend", onEnd);

  loadMore();

  return () => {
    io.disconnect();
    window.removeEventListener("touchstart", onStart);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onEnd);
  };
}
