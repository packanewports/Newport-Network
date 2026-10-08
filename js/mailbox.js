const imageBucket = "letter-images";
const artMuseumBucket = "art-museum";
const imageExtensions = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const newMailAnnouncement = "You've got mail!";
const newMailSound = new Audio("audio/yougotmail.mp3");
newMailSound.preload = "auto";
const mailboxLogin = document.querySelector("#mailbox-login");
const mailboxEmailInput = document.querySelector("#mailbox-email");
const mailboxPasswordInput = document.querySelector("#mailbox-password");
const mailboxContent = document.querySelector("#mailbox-content");
const mailboxList = document.querySelector("#mailbox-list");
const mailboxFeedback = document.querySelector("#mailbox-feedback");
const mailboxCount = document.querySelector("#mailbox-count");
const mailboxNewMail = document.querySelector("#mailbox-new-mail");
const mailboxPlaySound = document.querySelector("#mailbox-play-sound");

async function playNewMailSound() {
  try {
    newMailSound.currentTime = 0;
    await newMailSound.play();
    mailboxPlaySound.hidden = true;
  } catch (error) {
    mailboxPlaySound.hidden = false;
    console.warn("Unable to play the new-mail MP3. Check audio/yougotmail.mp3:", error);
  }
}

async function addLetterImageToMuseum(supabase, letter, button, status) {
  button.disabled = true;
  button.textContent = "Adding...";
  status.textContent = "";
  let galleryImagePath = null;

  try {
    const { data: image, error: downloadError } = await supabase.storage
      .from(imageBucket)
      .download(letter.image_path);
    if (downloadError) {
      throw downloadError;
    }

    const extension = imageExtensions.get(image.type);
    if (!extension || image.size > 5 * 1024 * 1024) {
      throw new Error("This image type or size cannot be added to the Art Museum.");
    }

    galleryImagePath = `${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(artMuseumBucket)
      .upload(galleryImagePath, image, {
        cacheControl: "3600",
        contentType: image.type,
        upsert: false,
      });
    if (uploadError) {
      throw uploadError;
    }

    const { error: insertError } = await supabase.from("art_museum").insert({
      source_letter_id: letter.id,
      image_path: galleryImagePath,
      sender_name: letter.sender_name || "Anonymous",
    });
    if (insertError) {
      throw insertError;
    }

    button.textContent = "Added to Art Museum";
  } catch (error) {
    if (galleryImagePath) {
      const { error: cleanupError } = await supabase.storage
        .from(artMuseumBucket)
        .remove([galleryImagePath]);
      if (cleanupError) {
        console.error("Unable to clean up an unlisted Art Museum image:", cleanupError);
      }
    }

    status.textContent = error.message || "Could not add this image to the Art Museum.";
    button.textContent = "Add to Art Museum";
    button.disabled = false;
    console.error("Unable to add letter image to Art Museum:", error);
  }
}

async function showMailbox(supabase, ownerId) {
  mailboxLogin.hidden = true;
  mailboxContent.hidden = false;
  mailboxCount.textContent = "Loading letters...";
  mailboxNewMail.hidden = true;
  mailboxPlaySound.hidden = true;
  mailboxList.replaceChildren();

  const { data: mailboxState, error: stateError } = await supabase
    .from("mailbox_state")
    .select("last_seen_at")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (stateError || !mailboxState) {
    mailboxCount.textContent =
      "Mailbox tracking is not set up yet. Run the latest supabase-setup.sql and try again.";
    console.error("Unable to load mailbox state:", stateError || "Mailbox state row is missing.");
    return;
  }

  const { data: letters, error } = await supabase
    .from("letters")
    .select("id, sender_name, message, image_path, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    mailboxCount.textContent = "Unable to load letters. Check the mailbox setup and try again.";
    console.error("Unable to load letters:", error);
    return;
  }

  const lastSeenAt = new Date(mailboxState.last_seen_at).getTime();
  const newLetters = letters.filter(
    (letter) => new Date(letter.created_at).getTime() > lastSeenAt
  );

  mailboxCount.textContent = `${letters.length} ${
    letters.length === 1 ? "letter" : "letters"
  } received.`;

  const { data: museumEntries, error: museumEntriesError } = await supabase
    .from("art_museum")
    .select("source_letter_id");
  const museumLetterIds = new Set(
    museumEntriesError ? [] : museumEntries.map((entry) => entry.source_letter_id)
  );

  if (museumEntriesError) {
    mailboxCount.textContent += " Art Museum controls unavailable; run the latest supabase-setup.sql.";
    console.error("Unable to load Art Museum entries:", museumEntriesError);
  }

  for (const letter of letters) {
    const entry = document.createElement("article");
    entry.className = "mailbox-entry";
    const isNew = new Date(letter.created_at).getTime() > lastSeenAt;

    if (isNew) {
      entry.classList.add("is-new");
    }

    const sender = document.createElement("h2");
    sender.textContent = letter.sender_name || "Anonymous";
    if (isNew) {
      const badge = document.createElement("span");
      badge.className = "mailbox-entry-badge";
      badge.textContent = "NEW";
      sender.append(badge);
    }

    const date = document.createElement("time");
    const timestamp = new Date(letter.created_at);

    if (Number.isNaN(timestamp.getTime())) {
      date.textContent = "Date unavailable";
    } else {
      date.dateTime = timestamp.toISOString();
      date.textContent = timestamp.toLocaleString();
    }

    const message = document.createElement("p");
    message.textContent = letter.message;
    entry.append(sender, date, message);

    if (letter.image_path) {
      const { data, error: imageError } = await supabase.storage
        .from(imageBucket)
        .createSignedUrl(letter.image_path, 3600);

      if (imageError) {
        const unavailable = document.createElement("p");
        unavailable.className = "mailbox-image-error";
        unavailable.textContent = "The attached image could not be loaded.";
        entry.append(unavailable);
        console.error("Unable to create image link:", imageError);
      } else {
        const image = document.createElement("img");
        image.className = "mailbox-image";
        image.src = data.signedUrl;
        image.alt = `Image attached by ${letter.sender_name || "Anonymous"}`;
        image.loading = "lazy";
        entry.append(image);

        if (!museumEntriesError) {
          const museumControls = document.createElement("div");
          museumControls.className = "mailbox-museum-controls";
          const museumStatus = document.createElement("p");
          museumStatus.className = "mailbox-image-error";
          museumStatus.setAttribute("role", "status");
          const museumButton = document.createElement("button");
          museumButton.className = "letter-button letter-button-secondary";
          museumButton.type = "button";
          if (museumLetterIds.has(letter.id)) {
            museumButton.textContent = "Added to Art Museum";
            museumButton.disabled = true;
          } else {
            museumButton.textContent = "Add to Art Museum";
            museumButton.addEventListener("click", () => {
              addLetterImageToMuseum(supabase, letter, museumButton, museumStatus);
            });
          }
          museumControls.append(museumButton, museumStatus);
          entry.append(museumControls);
        }
      }
    }

    mailboxList.append(entry);
  }

  if (newLetters.length > 0) {
    mailboxNewMail.textContent = newMailAnnouncement;
    mailboxNewMail.hidden = false;
    playNewMailSound();
  }

  if (letters.length > 0) {
    const newestLetterAt = letters.reduce((newest, letter) => {
      const createdAt = new Date(letter.created_at);
      return createdAt > newest ? createdAt : newest;
    }, new Date(mailboxState.last_seen_at));

    if (newestLetterAt.getTime() > lastSeenAt) {
      const { error: updateError } = await supabase
        .from("mailbox_state")
        .update({ last_seen_at: newestLetterAt.toISOString() })
        .eq("owner_id", ownerId);

      if (updateError) {
        mailboxCount.textContent += " New-mail status could not be saved.";
        console.error("Unable to update mailbox read time:", updateError);
      }
    }
  }
}

mailboxLogin.addEventListener("submit", async (event) => {
  event.preventDefault();
  mailboxFeedback.textContent = "";

  const supabase = window.supabaseClient;

  if (!supabase) {
    mailboxFeedback.textContent =
      "The mailbox service is unavailable. Check your internet connection and refresh.";
    return;
  }

  const submitButton = mailboxLogin.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Signing in...";

  const { data, error } = await supabase.auth.signInWithPassword({
    email: mailboxEmailInput.value.trim(),
    password: mailboxPasswordInput.value,
  });

  if (error) {
    mailboxFeedback.textContent = "Sign-in failed. Check your email and password.";
    console.error("Mailbox sign-in failed:", error);
    submitButton.disabled = false;
    submitButton.textContent = "Sign in";
    return;
  }

  await showMailbox(supabase, data.user.id);
  submitButton.disabled = false;
  submitButton.textContent = "Sign in";
});

mailboxPlaySound.addEventListener("click", playNewMailSound);

document.querySelector("#mailbox-sign-out").addEventListener("click", async () => {
  const supabase = window.supabaseClient;

  if (!supabase) {
    mailboxFeedback.textContent = "The mailbox service is unavailable.";
    return;
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    mailboxCount.textContent = "Sign-out failed. Please try again.";
    console.error("Mailbox sign-out failed:", error);
    return;
  }

  mailboxList.replaceChildren();
  mailboxNewMail.hidden = true;
  mailboxPlaySound.hidden = true;
  mailboxContent.hidden = true;
  mailboxLogin.hidden = false;
  mailboxPasswordInput.value = "";
  mailboxFeedback.textContent = "You have signed out.";
  mailboxEmailInput.focus();
});
