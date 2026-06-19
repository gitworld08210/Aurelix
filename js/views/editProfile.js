// Edit profile: avatar, display name, username, bio.
import { el, mount, toast } from "../utils.js";
import { icon } from "../icons.js";
import { header, avatar, pickFile } from "../components.js";
import { ensureShell } from "../shell.js";
import { navigate } from "../router.js";
import { me } from "../state.js";
import { auth, fb } from "../firebase.js";
import { updateUser, changeUsername, isUsernameAvailable } from "../services/users.js";
import { uploadToCloudinary } from "../cloudinary.js";
import { isCloudinaryConfigured } from "../config.js";

export function renderEditProfile() {
  const main = ensureShell();
  const user = me();
  if (!user) return navigate("/login");

  let newPhotoURL = user.photoURL || "";
  let photoFile = null;

  const avatarBox = el("div", { style: { position: "relative", width: "fit-content", margin: "0 auto" } }, [
    avatar({ ...user }, "xl"),
    el("button", { class: "icon-btn", style: { position: "absolute", right: "-6px", bottom: "-6px", background: "var(--accent)", color: "#fff" }, html: icon("edit"), onClick: pickAvatar }),
  ]);

  async function pickAvatar() {
    const f = await pickFile("image/*");
    if (!f) return;
    photoFile = f;
    newPhotoURL = URL.createObjectURL(f);
    mount(avatarBox, avatar({ ...user, photoURL: newPhotoURL }, "xl"),
      el("button", { class: "icon-btn", style: { position: "absolute", right: "-6px", bottom: "-6px", background: "var(--accent)", color: "#fff" }, html: icon("edit"), onClick: pickAvatar }));
  }

  const nameI = el("input", { class: "input", value: user.displayName || "" });
  const userI = el("input", { class: "input", value: user.username || "", spellcheck: false });
  const bioI = el("textarea", { class: "textarea", value: user.bio || "", maxlength: 200, placeholder: "Tell people about yourself" });
  const err = el("div", { class: "error-text" });
  const save = el("button", { class: "btn primary full mt", text: "Save changes" });

  userI.addEventListener("input", () => { userI.value = userI.value.toLowerCase().replace(/[^a-z0-9_]/g, ""); });

  save.addEventListener("click", async () => {
    err.textContent = "";
    const name = nameI.value.trim();
    const uname = userI.value.trim();
    if (!name) return (err.textContent = "Name can't be empty.");
    if (uname.length < 3) return (err.textContent = "Username must be at least 3 characters.");
    save.disabled = true; save.textContent = "Saving…";
    try {
      if (photoFile) {
        if (!isCloudinaryConfigured()) throw new Error("Cloudinary isn't configured (Settings) — can't upload avatar.");
        const up = await uploadToCloudinary(photoFile, { resourceType: "image", folder: "avatars" });
        newPhotoURL = up.secureUrl;
      }
      if (uname !== user.username) {
        if (!(await isUsernameAvailable(uname, user.id))) throw new Error("That username is taken.");
        await changeUsername(user.id, uname, user.username);
      }
      await updateUser(user.id, { displayName: name, bio: bioI.value.trim(), photoURL: newPhotoURL });
      try { await fb.updateProfile(auth.currentUser, { displayName: name, photoURL: newPhotoURL }); } catch {}
      toast("Profile updated", "success");
      navigate("/u/" + uname);
    } catch (e) {
      err.textContent = e.message || "Could not save.";
      save.disabled = false; save.textContent = "Save changes";
    }
  });

  mount(main,
    header("Edit profile", { back: true }),
    el("div", { class: "container" }, [
      avatarBox,
      el("div", { class: "field mt" }, [el("label", { text: "Name" }), nameI]),
      el("div", { class: "field" }, [el("label", { text: "Username" }), userI]),
      el("div", { class: "field" }, [el("label", { text: "Bio" }), bioI]),
      err,
      save,
    ]),
  );
}
