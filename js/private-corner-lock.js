const privateCornerPassword = "MarlboroSux32";
const privateCornerSessionKey = "newport-private-corner-unlocked";
const privateCornerPostsTable = "private_corner_posts";
const privateCornerPageSize = 20;

const privateCornerLock = document.querySelector("#private-corner-lock");
const privateCornerInput = document.querySelector("#private-corner-password");
const privateCornerError = document.querySelector("#private-corner-error");
const privateCornerContent = document.querySelector("#private-corner-content");
const privateCornerFeed = document.querySelector("#private-corner-feed");
const privateCornerFeedStatus = document.querySelector("#private-corner-feed-status");
const privateCornerPageStatus = document.querySelector("#private-corner-page-status");
const privateCornerNewer = document.querySelector("#private-corner-newer");
const privateCornerOlder = document.querySelector("#private-corner-older");
const privateCornerOwnerToggle = document.querySelector("#private-corner-owner-toggle");
const privateCornerOwnerForm = document.querySelector("#private-corner-owner-form");
const privateCornerOwnerStatus = document.querySelector("#private-corner-owner-status");
const privateCornerOwnerSession = document.querySelector("#private-corner-owner-session");
const privateCornerOwnerSignOut = document.querySelector("#private-corner-owner-sign-out");
const privateCornerMailboxEmail = document.querySelector("#private-corner-email");
const privateCornerMailboxPassword = document.querySelector("#private-corner-mailbox-password");
const privateCornerPostForm = document.querySelector("#private-corner-post-form");
const privateCornerPostTitle = document.querySelector("#private-corner-post-title");
const privateCornerPostBody = document.querySelector("#private-corner-post-body");
const privateCornerPostStatus = document.querySelector("#private-corner-post-status");
const privateCornerPostSubmit = document.querySelector("#private-corner-post-submit");

let privateCornerPage = Math.max(1, Number.parseInt(new URLSearchParams(location.search).get("page"), 10) || 1);
let privateCornerTotalPages = 1;
let privateCornerIsOwner = false;

function getPrivateCornerSupabase() {
  if (!window.supabaseClient) {
    throw new Error("The journal service is unavailable. Check your connection and try again.");
  }
  return window.supabaseClient;
}

function unlockPrivateCorner() {
  privateCornerLock.hidden = true;
  privateCornerContent.hidden = false;
  privateCornerContent.querySelector("h2").focus();
  loadPrivateCornerPosts();
}

function updatePrivateCornerPageUrl() {
  const url = new URL(location.href);
  if (privateCornerPage === 1) {
    url.searchParams.delete("page");
  } else {
    url.searchParams.set("page", String(privateCornerPage));
  }
  history.replaceState(null, "", url);
}

function formatPrivateCornerDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { text: "Date unavailable", dateTime: "" };
  }
  return { text: date.toLocaleString(), dateTime: date.toISOString() };
}

function createPrivateCornerPost(post) {
  const article = document.createElement("article");
  const heading = document.createElement("h3");
  heading.textContent = post.title;

  const time = document.createElement("time");
  const formatted = formatPrivateCornerDate(post.created_at);
  time.textContent = formatted.text;
  time.dateTime = formatted.dateTime;

  const body = document.createElement("p");
  body.className = "private-corner-post-body";
  body.textContent = post.body;
  article.append(heading, time, body, document.createElement("hr"));
  return article;
}

async function loadPrivateCornerPosts() {
  privateCornerFeedStatus.textContent = "Loading posts...";
  privateCornerFeed.replaceChildren();
  privateCornerNewer.disabled = true;
  privateCornerOlder.disabled = true;

  try {
    const supabase = getPrivateCornerSupabase();
    const offset = (privateCornerPage - 1) * privateCornerPageSize;
    const { data: posts, count, error } = await supabase
      .from(privateCornerPostsTable)
      .select("id, title, body, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + privateCornerPageSize - 1);
    if (error) throw error;

    const totalPosts = count ?? posts.length;
    privateCornerTotalPages = Math.max(1, Math.ceil(totalPosts / privateCornerPageSize));
    if (privateCornerPage > privateCornerTotalPages) {
      privateCornerPage = privateCornerTotalPages;
      updatePrivateCornerPageUrl();
      return loadPrivateCornerPosts();
    }

    privateCornerPageStatus.textContent = `Page ${privateCornerPage} of ${privateCornerTotalPages}`;
    privateCornerNewer.disabled = privateCornerPage <= 1;
    privateCornerOlder.disabled = privateCornerPage >= privateCornerTotalPages;

    if (posts.length === 0) {
      privateCornerFeedStatus.textContent = "No posts yet.";
      return;
    }

    for (const post of posts) {
      privateCornerFeed.append(createPrivateCornerPost(post));
    }
    privateCornerFeedStatus.textContent = `${totalPosts} ${totalPosts === 1 ? "post" : "posts"}`;
  } catch (error) {
    privateCornerFeedStatus.textContent = "Could not load posts. Apply the latest supabase-setup.sql and try again.";
    console.error("Unable to load private-corner posts:", error);
  }
}

async function setPrivateCornerOwnerMode() {
  privateCornerIsOwner = true;
  privateCornerOwnerForm.hidden = true;
  privateCornerOwnerToggle.hidden = true;
  privateCornerOwnerSession.hidden = false;
  privateCornerPostForm.hidden = false;
  privateCornerOwnerStatus.textContent = "";
}

privateCornerLock.addEventListener("submit", (event) => {
  event.preventDefault();
  if (privateCornerInput.value !== privateCornerPassword) {
    privateCornerInput.value = "";
    privateCornerError.textContent = "That password is incorrect. Try again.";
    privateCornerInput.focus();
    return;
  }

  try {
    sessionStorage.setItem(privateCornerSessionKey, "true");
  } catch (error) {
    console.warn("Could not remember the page unlock for this tab:", error);
  }
  privateCornerError.textContent = "";
  unlockPrivateCorner();
});

try {
  if (sessionStorage.getItem(privateCornerSessionKey) === "true") {
    unlockPrivateCorner();
  }
} catch (error) {
  console.warn("Private-corner unlock will only last until this page is refreshed:", error);
}

privateCornerOwnerToggle.addEventListener("click", () => {
  privateCornerOwnerForm.hidden = !privateCornerOwnerForm.hidden;
  if (!privateCornerOwnerForm.hidden) privateCornerMailboxEmail.focus();
});

privateCornerOwnerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  privateCornerOwnerStatus.textContent = "Signing in...";
  const submit = privateCornerOwnerForm.querySelector('button[type="submit"]');
  submit.disabled = true;

  try {
    const supabase = getPrivateCornerSupabase();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: privateCornerMailboxEmail.value.trim(),
      password: privateCornerMailboxPassword.value,
    });
    if (signInError) throw signInError;

    const { data: isOwner, error: ownerError } = await supabase.rpc("is_mailbox_owner");
    if (ownerError) throw ownerError;
    if (!isOwner) {
      await supabase.auth.signOut();
      throw new Error("This account does not have mailbox-owner permissions.");
    }

    privateCornerMailboxPassword.value = "";
    await setPrivateCornerOwnerMode();
  } catch (error) {
    privateCornerOwnerStatus.textContent = error.message || "Sign-in failed. Check your mailbox owner account.";
    console.error("Unable to sign into private-corner publishing:", error);
  } finally {
    submit.disabled = false;
  }
});

privateCornerOwnerSignOut.addEventListener("click", async () => {
  privateCornerOwnerStatus.textContent = "";
  try {
    const { error } = await getPrivateCornerSupabase().auth.signOut();
    if (error) throw error;
    privateCornerIsOwner = false;
    privateCornerOwnerSession.hidden = true;
    privateCornerOwnerToggle.hidden = false;
    privateCornerPostForm.hidden = true;
  } catch (error) {
    privateCornerOwnerStatus.textContent = "Sign-out failed. Please try again.";
    console.error("Unable to sign out of private-corner publishing:", error);
  }
});

privateCornerPostForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!privateCornerIsOwner) {
    privateCornerPostStatus.textContent = "Sign in as the mailbox owner to publish.";
    return;
  }

  const title = privateCornerPostTitle.value.trim();
  const body = privateCornerPostBody.value.trim();
  if (!title || !body || title.length > 160 || body.length > 10000) {
    privateCornerPostStatus.textContent = "Enter a title and post text within the length limits.";
    return;
  }

  privateCornerPostSubmit.disabled = true;
  privateCornerPostSubmit.textContent = "Publishing...";
  privateCornerPostStatus.textContent = "";
  try {
    const { error } = await getPrivateCornerSupabase()
      .from(privateCornerPostsTable)
      .insert({ title, body });
    if (error) throw error;

    privateCornerPostForm.reset();
    privateCornerPage = 1;
    updatePrivateCornerPageUrl();
    await loadPrivateCornerPosts();
  } catch (error) {
    privateCornerPostStatus.textContent = error.message || "The post could not be published. Please try again.";
    console.error("Unable to publish private-corner post:", error);
  } finally {
    privateCornerPostSubmit.disabled = false;
    privateCornerPostSubmit.textContent = "Publish";
  }
});

privateCornerNewer.addEventListener("click", () => {
  if (privateCornerPage <= 1) return;
  privateCornerPage -= 1;
  updatePrivateCornerPageUrl();
  loadPrivateCornerPosts();
});

privateCornerOlder.addEventListener("click", () => {
  if (privateCornerPage >= privateCornerTotalPages) return;
  privateCornerPage += 1;
  updatePrivateCornerPageUrl();
  loadPrivateCornerPosts();
});
