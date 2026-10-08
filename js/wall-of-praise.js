const praiseTable = "wall_of_praise";
const praiseBucket = "wall-of-praise";
const maxPraiseImageBytes = 5 * 1024 * 1024;
const praiseImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);

const praiseStatus = document.querySelector("#wall-of-praise-status");
const praiseGallery = document.querySelector("#praise-gallery");
const ownerToggle = document.querySelector("#praise-owner-toggle");
const ownerForm = document.querySelector("#praise-owner-form");
const ownerEmail = document.querySelector("#praise-owner-email");
const ownerPassword = document.querySelector("#praise-owner-password");
const ownerFeedback = document.querySelector("#praise-owner-feedback");
const ownerSession = document.querySelector("#praise-owner-session");
const ownerSignOut = document.querySelector("#praise-owner-sign-out");
const entryForm = document.querySelector("#praise-entry-form");
const entryFormTitle = document.querySelector("#praise-entry-form-title");
const personName = document.querySelector("#praise-person-name");
const praiseMessage = document.querySelector("#praise-message");
const praiseImage = document.querySelector("#praise-image");
const praiseImageHint = document.querySelector("#praise-image-hint");
const entrySubmit = document.querySelector("#praise-entry-submit");
const entryCancel = document.querySelector("#praise-entry-cancel");
const entryFeedback = document.querySelector("#praise-entry-feedback");

let praiseEntries = [];
let isPraiseOwner = false;
let editingPraiseId = null;

function getPraiseSupabase() {
  if (!window.supabaseClient) {
    throw new Error("The Wall of Praise service is unavailable. Check your connection.");
  }
  return window.supabaseClient;
}

function getPraiseImageUrl(supabase, path) {
  return supabase.storage.from(praiseBucket).getPublicUrl(path).data.publicUrl;
}

function createPraiseCard(entry, supabase) {
  const card = document.createElement("article");
  card.className = "praise-card";

  const frame = document.createElement("div");
  frame.className = "praise-frame";
  const image = document.createElement("img");
  image.src = getPraiseImageUrl(supabase, entry.image_path);
  image.alt = `Gold-framed profile picture of ${entry.person_name}`;
  image.loading = "lazy";
  image.decoding = "async";
  frame.append(image);

  const title = document.createElement("h3");
  title.textContent = entry.person_name;
  const message = document.createElement("p");
  message.textContent = entry.praise_text;
  card.append(frame, title, message);

  if (isPraiseOwner) {
    const actions = document.createElement("div");
    actions.className = "praise-card-actions";
    const editButton = document.createElement("button");
    editButton.className = "praise-button praise-button-secondary";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => startEditingPraise(entry));

    const deleteButton = document.createElement("button");
    deleteButton.className = "praise-button praise-button-secondary";
    deleteButton.type = "button";
    deleteButton.textContent = "Remove";
    deleteButton.addEventListener("click", () => removePraiseEntry(entry, deleteButton, supabase));
    actions.append(editButton, deleteButton);
    card.append(actions);
  }

  return card;
}

function renderPraise(entries) {
  praiseGallery.replaceChildren();
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "praise-empty";
    empty.textContent = "No one has been added yet. This wall is ready for its first bit of praise.";
    praiseGallery.append(empty);
    return;
  }

  const supabase = getPraiseSupabase();
  for (const entry of entries) {
    praiseGallery.append(createPraiseCard(entry, supabase));
  }
}

async function loadPraiseEntries() {
  praiseStatus.textContent = "Loading the good things...";
  try {
    const { data, error } = await getPraiseSupabase()
      .from(praiseTable)
      .select("id, person_name, praise_text, image_path, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    praiseEntries = data;
    renderPraise(praiseEntries);
    praiseStatus.textContent = `${data.length} ${data.length === 1 ? "person shamed" : "people shamed"}`;
  } catch (error) {
    praiseStatus.textContent = "Could not load the Wall of Praise. Run the latest supabase-setup.sql.";
    console.error("Unable to load Wall of Praise entries:", error);
  }
}

function resetPraiseForm() {
  editingPraiseId = null;
  entryForm.reset();
  entryFormTitle.textContent = "Add someone to the Wall of Praise";
  entrySubmit.textContent = "Add praise";
  entryCancel.hidden = true;
  praiseImageHint.textContent = "Use an image you have permission to share.";
  entryFeedback.textContent = "";
}

function startEditingPraise(entry) {
  editingPraiseId = entry.id;
  personName.value = entry.person_name;
  praiseMessage.value = entry.praise_text;
  praiseImage.value = "";
  entryFormTitle.textContent = `Edit praise for ${entry.person_name}`;
  entrySubmit.textContent = "Save changes";
  entryCancel.hidden = false;
  praiseImageHint.textContent = "Choose a new image only if you want to replace the existing picture.";
  entryFeedback.textContent = "";
  entryForm.scrollIntoView({ block: "center", behavior: "smooth" });
}

async function removeUploadedImage(supabase, path) {
  const { error } = await supabase.storage.from(praiseBucket).remove([path]);
  if (error) throw error;
}

async function removePraiseEntry(entry, button, supabase) {
  if (!window.confirm(`Remove ${entry.person_name} from the Wall of Praise?`)) return;
  button.disabled = true;
  button.textContent = "Removing...";
  try {
    const { data, error } = await supabase
      .from(praiseTable)
      .delete()
      .eq("id", entry.id)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      throw error || new Error("The praise entry was not removed. Check owner permissions.");
    }
    try {
      await removeUploadedImage(supabase, entry.image_path);
    } catch (error) {
      ownerFeedback.textContent = "Entry removed, but its image could not be removed from storage.";
      console.error("Unable to remove Wall of Praise image:", error);
    }
    await loadPraiseEntries();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Remove";
    ownerFeedback.textContent = error.message || "Could not remove this praise entry.";
    console.error("Unable to remove Wall of Praise entry:", error);
  }
}

async function setPraiseOwnerMode() {
  isPraiseOwner = true;
  ownerToggle.hidden = true;
  ownerForm.hidden = true;
  ownerSession.hidden = false;
  entryForm.hidden = false;
  await loadPraiseEntries();
}

async function checkPraiseOwnerSession() {
  try {
    const supabase = getPraiseSupabase();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) return;
    const { data: isOwner, error: ownerError } = await supabase.rpc("is_mailbox_owner");
    if (ownerError) throw ownerError;
    if (isOwner) await setPraiseOwnerMode();
  } catch (error) {
    console.error("Unable to check Wall of Praise owner session:", error);
  }
}

ownerToggle.addEventListener("click", () => {
  ownerForm.hidden = !ownerForm.hidden;
  if (!ownerForm.hidden) ownerEmail.focus();
});

ownerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  ownerFeedback.textContent = "";
  const submit = ownerForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = "Signing in...";
  try {
    const supabase = getPraiseSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: ownerEmail.value.trim(),
      password: ownerPassword.value,
    });
    if (error) throw error;
    const { data: isOwner, error: ownerError } = await supabase.rpc("is_mailbox_owner");
    if (ownerError) throw ownerError;
    if (!isOwner) {
      await supabase.auth.signOut();
      throw new Error("This account does not have owner permissions.");
    }
    ownerPassword.value = "";
    await setPraiseOwnerMode();
  } catch (error) {
    ownerFeedback.textContent = error.message || "Sign-in failed. Check the mailbox owner account.";
    console.error("Unable to sign into Wall of Praise owner mode:", error);
  } finally {
    submit.disabled = false;
    submit.textContent = "Sign in";
  }
});

ownerSignOut.addEventListener("click", async () => {
  ownerFeedback.textContent = "";
  try {
    const { error } = await getPraiseSupabase().auth.signOut();
    if (error) throw error;
    isPraiseOwner = false;
    ownerSession.hidden = true;
    ownerToggle.hidden = false;
    entryForm.hidden = true;
    resetPraiseForm();
    await loadPraiseEntries();
  } catch (error) {
    ownerFeedback.textContent = "Sign-out failed. Please try again.";
    console.error("Unable to sign out of Wall of Praise owner mode:", error);
  }
});

praiseImage.addEventListener("change", () => {
  const file = praiseImage.files[0];
  if (!file) return;
  if (!praiseImageTypes.has(file.type) || file.size > maxPraiseImageBytes) {
    praiseImage.value = "";
    entryFeedback.textContent = "Choose a JPG, PNG, GIF, or WebP image no larger than 5 MB.";
    return;
  }
  entryFeedback.textContent = "";
});

entryCancel.addEventListener("click", resetPraiseForm);

entryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = personName.value.trim();
  const text = praiseMessage.value.trim();
  const file = praiseImage.files[0] || null;
  const existingEntry = praiseEntries.find((entry) => entry.id === editingPraiseId);
  if (
    !name ||
    !text ||
    name.length > 80 ||
    text.length > 1000 ||
    (!editingPraiseId && !file) ||
    (editingPraiseId && !existingEntry)
  ) {
    entryFeedback.textContent = "Enter a name and praise message, and add a profile picture for new entries.";
    return;
  }
  if (file && (!praiseImageTypes.has(file.type) || file.size > maxPraiseImageBytes)) {
    entryFeedback.textContent = "Choose a JPG, PNG, GIF, or WebP image no larger than 5 MB.";
    return;
  }

  entrySubmit.disabled = true;
  entryCancel.disabled = true;
  entrySubmit.textContent = "Saving...";
  entryFeedback.textContent = file ? "Uploading picture..." : "Saving praise...";
  ownerFeedback.textContent = "";
  let supabase;
  let uploadedPath = null;

  try {
    supabase = getPraiseSupabase();
    let imagePath = existingEntry?.image_path;
    if (file) {
      const extension = praiseImageTypes.get(file.type);
      uploadedPath = `${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from(praiseBucket).upload(uploadedPath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      imagePath = uploadedPath;
    }

    const payload = { person_name: name, praise_text: text, image_path: imagePath };
    const result = editingPraiseId
      ? await supabase.from(praiseTable).update(payload).eq("id", editingPraiseId).select("id").maybeSingle()
      : await supabase.from(praiseTable).insert(payload).select("id").single();
    if (result.error) throw result.error;
    if (editingPraiseId && !result.data) throw new Error("The entry could not be updated. Check owner permissions.");

    if (file && existingEntry) {
      try {
        await removeUploadedImage(supabase, existingEntry.image_path);
      } catch (error) {
        ownerFeedback.textContent = "Praise saved, but the replaced picture could not be removed from storage.";
        console.error("Unable to remove replaced Wall of Praise image:", error);
      }
    }
    resetPraiseForm();
    await loadPraiseEntries();
  } catch (error) {
    if (uploadedPath && supabase) {
      try {
        await removeUploadedImage(supabase, uploadedPath);
      } catch (cleanupError) {
        console.error("Unable to clean up an unused Wall of Praise image:", cleanupError);
      }
    }
    entryFeedback.textContent = error.message || "Could not save this praise entry.";
    console.error("Unable to save Wall of Praise entry:", error);
  } finally {
    entrySubmit.disabled = false;
    entryCancel.disabled = false;
    if (editingPraiseId) {
      entrySubmit.textContent = "Save changes";
    } else {
      entrySubmit.textContent = "Add praise";
    }
  }
});

loadPraiseEntries();
checkPraiseOwnerSession();
