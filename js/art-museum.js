const artMuseumBucket = "art-museum";
const gallery = document.querySelector("#art-museum-gallery");
const galleryStatus = document.querySelector("#art-museum-status");
const adminToggle = document.querySelector("#museum-admin-toggle");
const museumLogin = document.querySelector("#museum-login");
const museumFeedback = document.querySelector("#museum-feedback");
const ownerControls = document.querySelector("#museum-owner-controls");
const museumOwnerStatus = document.querySelector("#museum-owner-status");
const museumSignOut = document.querySelector("#museum-sign-out");
const museumEmail = document.querySelector("#museum-email");
const museumPassword = document.querySelector("#museum-password");

let museumOwnerMode = false;

function getSupabase() {
  if (!window.supabaseClient) {
    throw new Error("The Art Museum service is unavailable. Check your connection and try again.");
  }

  return window.supabaseClient;
}

async function loadArtMuseum() {
  galleryStatus.textContent = "Loading the gallery...";
  gallery.replaceChildren();

  try {
    const supabase = getSupabase();
    const { data: artworks, error } = await supabase
      .from("art_museum")
      .select("id, image_path, sender_name, created_at, is_favorite, is_art_of_week")
      .order("is_art_of_week", { ascending: false })
      .order("is_favorite", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    if (artworks.length === 0) {
      galleryStatus.textContent = "The gallery is waiting for its first artwork.";
      return;
    }

    galleryStatus.textContent = `${artworks.length} ${
      artworks.length === 1 ? "artwork" : "artworks"
    } in the gallery.`;

    for (const artwork of artworks) {
      const figure = document.createElement("figure");
      figure.className = "museum-artwork";
      if (artwork.is_art_of_week) {
        figure.classList.add("is-art-of-week");
        const featuredBadge = document.createElement("span");
        featuredBadge.className = "museum-artwork-badge";
        featuredBadge.textContent = "Art of the Week";
        figure.append(featuredBadge);
      } else if (artwork.is_favorite) {
        figure.classList.add("is-owner-favorite");
      }

      const image = document.createElement("img");
      image.src = supabase.storage.from(artMuseumBucket).getPublicUrl(artwork.image_path).data.publicUrl;
      image.alt = `Artwork sent by ${artwork.sender_name || "Anonymous"}`;
      image.loading = "lazy";
      image.decoding = "async";

      const caption = document.createElement("figcaption");
      caption.textContent = `Sent by ${artwork.sender_name || "Anonymous"}`;
      figure.append(image, caption);

      const date = document.createElement("time");
      const timestamp = new Date(artwork.created_at);
      if (Number.isNaN(timestamp.getTime())) {
        date.textContent = "Date unavailable";
      } else {
        date.dateTime = timestamp.toISOString();
        date.textContent = timestamp.toLocaleDateString();
      }
      figure.append(date);

      if (museumOwnerMode) {
        const favoriteButton = document.createElement("button");
        favoriteButton.className = `letter-button letter-button-secondary museum-favorite-button${
          artwork.is_favorite ? " is-selected" : ""
        }`;
        favoriteButton.type = "button";
        favoriteButton.setAttribute("aria-pressed", String(artwork.is_favorite));
        favoriteButton.textContent = artwork.is_favorite ? "♥ Favorited by you" : "♡ Heart artwork";
        favoriteButton.addEventListener("click", () => toggleArtworkFavorite(supabase, artwork, favoriteButton));
        figure.append(favoriteButton);

        const artOfWeekButton = document.createElement("button");
        artOfWeekButton.className = "letter-button letter-button-secondary museum-feature-button";
        artOfWeekButton.type = "button";
        artOfWeekButton.textContent = artwork.is_art_of_week ? "Art of the Week ★" : "Make Art of the Week";
        artOfWeekButton.disabled = artwork.is_art_of_week;
        artOfWeekButton.addEventListener("click", () => setArtOfWeek(supabase, artwork, artOfWeekButton));
        figure.append(artOfWeekButton);

        const removeButton = document.createElement("button");
        removeButton.className = "letter-button letter-button-secondary";
        removeButton.type = "button";
        removeButton.textContent = "Remove from Art Museum";
        removeButton.addEventListener("click", () => removeArtwork(supabase, artwork, removeButton));
        figure.append(removeButton);
      }

      gallery.append(figure);
    }
  } catch (error) {
    galleryStatus.textContent =
      "Could not load the Art Museum. Run the latest supabase-setup.sql and try again.";
    console.error("Unable to load Art Museum:", error);
  }
}

async function toggleArtworkFavorite(supabase, artwork, button) {
  button.disabled = true;
  museumFeedback.textContent = "";
  try {
    const { data, error } = await supabase
      .from("art_museum")
      .update({ is_favorite: !artwork.is_favorite })
      .eq("id", artwork.id)
      .select("id")
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("Artwork was not updated. Confirm you are signed in as the mailbox owner.");
    }
    museumFeedback.textContent = artwork.is_favorite
      ? "Removed from your hearted favorites."
      : "Added to your hearted favorites; hearted artwork appears first.";
    await loadArtMuseum();
  } catch (error) {
    museumFeedback.textContent = error.message || "Could not update this favorite.";
    console.error("Unable to favorite Art Museum artwork:", error);
    button.disabled = false;
  }
}

async function setArtOfWeek(supabase, artwork, button) {
  button.disabled = true;
  museumFeedback.textContent = "";
  try {
    const { error } = await supabase.rpc("set_art_of_week", { p_artwork_id: artwork.id });
    if (error) {
      throw error;
    }
    museumFeedback.textContent = "Art of the Week updated.";
    await loadArtMuseum();
  } catch (error) {
    museumFeedback.textContent = error.message || "Could not set Art of the Week.";
    console.error("Unable to set Art of the Week:", error);
    button.disabled = false;
  }
}

async function removeArtwork(supabase, artwork, button) {
  button.disabled = true;
  button.textContent = "Removing...";
  museumFeedback.textContent = "";

  const { data, error } = await supabase
    .from("art_museum")
    .delete()
    .eq("id", artwork.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    museumFeedback.textContent =
      error?.message || "This artwork was not removed. Confirm you are signed in as the mailbox owner.";
    console.error("Unable to remove Art Museum entry:", error || "Delete policy did not remove a row.");
    button.disabled = false;
    button.textContent = "Remove from Art Museum";
    return;
  }

  const { error: imageError } = await supabase.storage
    .from(artMuseumBucket)
    .remove([artwork.image_path]);

  if (imageError) {
    museumFeedback.textContent = "Artwork removed, but its image could not be cleaned up from storage.";
    console.error("Unable to remove Art Museum image:", imageError);
  } else {
    museumFeedback.textContent = "Artwork removed from the Art Museum.";
  }

  await loadArtMuseum();
}

adminToggle.addEventListener("click", () => {
  museumLogin.hidden = !museumLogin.hidden;
  if (!museumLogin.hidden) {
    museumEmail.focus();
  }
});

museumLogin.addEventListener("submit", async (event) => {
  event.preventDefault();
  museumFeedback.textContent = "";
  const submitButton = museumLogin.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Signing in...";

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: museumEmail.value.trim(),
      password: museumPassword.value,
    });
    if (error) {
      throw error;
    }

    const { data: isOwner, error: ownerError } = await supabase.rpc("is_mailbox_owner");
    if (ownerError) {
      throw ownerError;
    }
    if (!isOwner) {
      await supabase.auth.signOut();
      throw new Error("This account does not have Art Museum owner access.");
    }

    museumOwnerMode = true;
    museumLogin.hidden = true;
    adminToggle.hidden = true;
    ownerControls.hidden = false;
    museumOwnerStatus.textContent = "Owner mode: heart favorites, choose Art of the Week, or remove artworks.";
    museumPassword.value = "";
    await loadArtMuseum();
  } catch (error) {
    museumFeedback.textContent = error.message || "Sign-in failed. Check the mailbox account and try again.";
    console.error("Unable to sign into Art Museum owner mode:", error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Sign in";
  }
});

museumSignOut.addEventListener("click", async () => {
  museumFeedback.textContent = "";
  const { error } = await getSupabase().auth.signOut();
  if (error) {
    museumFeedback.textContent = "Sign-out failed. Please try again.";
    console.error("Unable to sign out of Art Museum owner mode:", error);
    return;
  }

  museumOwnerMode = false;
  ownerControls.hidden = true;
  adminToggle.hidden = false;
  museumLogin.hidden = true;
  await loadArtMuseum();
});

loadArtMuseum();
