// Create modal: text/image posts and video reels.
import { el, clear, toast, openModal } from "../utils.js";
import { icon } from "../icons.js";
import { avatar } from "../components.js";
import { me } from "../state.js";
import { uploadToCloudinary } from "../cloudinary.js";
import { isCloudinaryConfigured } from "../config.js";
import { createPost } from "../services/posts.js";
import { createReel } from "../services/reels.js";
import { navigate, refresh } from "../router.js";

export function openComposer(initial = "post") {
  let mode = initial; // 'post' | 'reel'
  let file = null;
  let previewUrl = null;

  const tabPost = el("button", { class: "tab", text: "Post" });
  const tabReel = el("button", { class: "tab", text: "Reel" });
  const tabs = el("div", { class: "tabs", style: { position: "static", borderRadius: "12px", overflow: "hidden", marginBottom: "14px" } }, [tabPost, tabReel]);

  const textArea = el("textarea", { class: "textarea", placeholder: "What's happening?", style: { border: "none", fontSize: "1.1rem" } });
  const captionArea = el("textarea", { class: "textarea", placeholder: "Add a caption…", style: { border: "none" } });
  const mediaPreview = el("div", { class: "mt" });
  const fileInput = el("input", { type: "file", style: { display: "none" } });

  const status = el("div", { class: "error-text" });
  const submitBtn = el("button", { class: "btn primary", text: "Post" });

  const setMode = (m) => {
    mode = m;
    tabPost.classList.toggle("active", m === "post");
    tabReel.classList.toggle("active", m === "reel");
    fileInput.accept = m === "reel" ? "video/*" : "image/*";
    submitBtn.textContent = m === "reel" ? "Share reel" : "Post";
    file = null; previewUrl && URL.revokeObjectURL(previewUrl); previewUrl = null;
    clear(mediaPreview);
    bodyWrap.replaceChildren(m === "reel" ? captionArea : textArea);
    pickBtn.querySelector(".lbl").textContent = m === "reel" ? "Select video" : "Add photo";
    pickBtn.querySelector(".ic").innerHTML = icon(m === "reel" ? "video" : "image");
  };

  tabPost.addEventListener("click", () => setMode("post"));
  tabReel.addEventListener("click", () => setMode("reel"));

  fileInput.addEventListener("change", () => {
    file = fileInput.files[0] || null;
    clear(mediaPreview);
    if (!file) return;
    previewUrl && URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video");
    mediaPreview.appendChild(
      el("div", { class: "media", style: { borderRadius: "14px", overflow: "hidden", maxHeight: "320px" } }, [
        isVideo ? el("video", { src: previewUrl, controls: true, style: { maxHeight: "320px" } })
                : el("img", { src: previewUrl, style: { maxHeight: "320px", objectFit: "cover", width: "100%" } }),
      ])
    );
  });

  const pickBtn = el("button", { class: "icon-btn", title: "Add media", onClick: () => fileInput.click() }, [
    el("span", { class: "ic", html: icon("image") }),
    el("span", { class: "lbl hidden" }),
  ]);
  // (keep label hidden visually but used for accessibility / mode text)
  pickBtn.querySelector(".lbl").classList.remove("hidden");
  pickBtn.querySelector(".lbl").style.fontSize = "0.85rem";

  const bodyWrap = el("div", {}, [textArea]);

  let busy = false;
  const doSubmit = async () => {
    if (busy) return;
    status.textContent = "";
    const user = me();
    if (mode === "post") {
      if (!textArea.value.trim() && !file) { status.textContent = "Write something or add a photo."; return; }
    } else {
      if (!file) { status.textContent = "Select a video for your reel."; return; }
    }
    if (file && !isCloudinaryConfigured()) { status.textContent = "Cloudinary isn't configured. Add it in Settings to upload media."; return; }

    busy = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML = "";
    submitBtn.appendChild(el("span", { class: "spinner sm" }));

    try {
      if (mode === "post") {
        let media = null;
        if (file) {
          const up = await uploadToCloudinary(file, { resourceType: "image" });
          media = { url: up.secureUrl, type: "image", width: up.width, height: up.height, publicId: up.publicId };
        }
        await createPost(user, { text: textArea.value, media });
        toast("Posted!", "success");
        modal.close();
        if (location.hash === "#/" || location.hash === "") refresh(); else navigate("/");
      } else {
        const up = await uploadToCloudinary(file, { resourceType: "video" });
        await createReel(user, {
          videoUrl: up.secureUrl, thumbnail: up.thumbnail, caption: captionArea.value,
          width: up.width, height: up.height, duration: up.duration,
        });
        toast("Reel shared!", "success");
        modal.close();
        navigate("/reels");
      }
    } catch (e) {
      console.error(e);
      status.textContent = e.message || "Could not share. Try again.";
      busy = false;
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "reel" ? "Share reel" : "Post";
    }
  };
  submitBtn.addEventListener("click", doSubmit);

  const content = el("div", {}, [
    el("h2", { text: "Create" }),
    tabs,
    el("div", { class: "row", style: { alignItems: "flex-start", gap: "12px" } }, [
      avatar(me() || {}, ""),
      el("div", { class: "grow" }, [bodyWrap, mediaPreview]),
    ]),
    status,
    el("div", { class: "row mt", style: { justifyContent: "space-between" } }, [
      pickBtn,
      submitBtn,
    ]),
    fileInput,
  ]);

  const modal = openModal(content, { onClose: () => { previewUrl && URL.revokeObjectURL(previewUrl); } });
  setMode(initial);
}
