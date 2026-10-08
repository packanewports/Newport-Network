const wallTable = "anon_wall_posts";
const repliesTable = "anon_wall_replies";
const likesTable = "anon_wall_likes";
const mediaBucket = "anon-wall-media";
const pageSize = 20;
const maxBodyLength = 5000;
const maxReplyLength = 2000;
const maxMediaBytes = 10 * 1024 * 1024;
const mediaTypes = new Map([
  ["image/jpeg", { extension: "jpg", kind: "image" }],
  ["image/png", { extension: "png", kind: "image" }],
  ["image/gif", { extension: "gif", kind: "image" }],
  ["image/webp", { extension: "webp", kind: "image" }],
  ["video/mp4", { extension: "mp4", kind: "video" }],
  ["video/webm", { extension: "webm", kind: "video" }],
]);

const postForm = document.querySelector("#anon-post-form");
const postDialog = document.querySelector("#anon-post-dialog");
const postOpen = document.querySelector("#anon-post-open");
const postClose = document.querySelector("#anon-post-close");
const postBody = document.querySelector("#anon-post-body");
const postMedia = document.querySelector("#anon-post-media");
const uploadInfo = document.querySelector("#anon-upload-info");
const postSubmit = document.querySelector("#anon-post-submit");
const postFeedback = document.querySelector("#anon-post-feedback");
const feed = document.querySelector("#anon-feed");
const feedStatus = document.querySelector("#anon-feed-status");
const wallTitle = document.querySelector("#anon-wall-title");
const threadBack = document.querySelector("#anon-thread-back");
const pagination = document.querySelector("#anon-pagination");
const pagePrevious = document.querySelector("#anon-page-previous");
const pageNext = document.querySelector("#anon-page-next");
const pageStatus = document.querySelector("#anon-page-status");
const ownerToggle = document.querySelector("#anon-owner-toggle");
const ownerForm = document.querySelector("#anon-owner-form");
const ownerEmail = document.querySelector("#anon-owner-email");
const ownerPassword = document.querySelector("#anon-owner-password");
const ownerFeedback = document.querySelector("#anon-owner-feedback");
const ownerSession = document.querySelector("#anon-owner-session");
const ownerSignOut = document.querySelector("#anon-owner-sign-out");

postOpen.addEventListener("click", () => {
  postDialog.showModal();
  postBody.focus();
});

postClose.addEventListener("click", () => postDialog.close());

const voterStorageKey = "newport-anon-wall-voter-id";
const pageParameters = new URLSearchParams(location.search);
const threadPostId = pageParameters.get("post");
let pageNumber = Math.max(1, Number.parseInt(pageParameters.get("page"), 10) || 1);
let totalPages = 1;
let isOwner = false;
let fallbackVoterId;

function getSupabase() {
  if (!window.supabaseClient) {
    throw new Error("The Anon Wall service is unavailable. Check your connection and try again.");
  }
  return window.supabaseClient;
}

function getVoterId() {
  try {
    let voterId = localStorage.getItem(voterStorageKey);
    if (!voterId) {
      voterId = crypto.randomUUID();
      localStorage.setItem(voterStorageKey, voterId);
    }
    return voterId;
  } catch (error) {
    console.warn("Anon Wall likes will only persist for this visit:", error);
    fallbackVoterId ??= crypto.randomUUID();
    return fallbackVoterId;
  }
}

function updatePageUrl() {
  const url = new URL(location.href);
  if (pageNumber === 1) {
    url.searchParams.delete("page");
  } else {
    url.searchParams.set("page", String(pageNumber));
  }
  history.replaceState(null, "", url);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { text: "Date unavailable", dateTime: "" };
  }
  return { text: date.toLocaleString(), dateTime: date.toISOString() };
}

function createMediaElement(post, supabase) {
  if (!post.media_path || !post.media_type) {
    return null;
  }

  const publicUrl = supabase.storage.from(mediaBucket).getPublicUrl(post.media_path).data.publicUrl;
  if (post.media_type.startsWith("video/")) {
    const video = document.createElement("video");
    video.className = "anon-post-media";
    video.src = publicUrl;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.setAttribute("aria-label", "Anonymous video post");
    return video;
  }

  const image = document.createElement("img");
  image.className = "anon-post-media";
  image.src = publicUrl;
  image.alt = "Image attached to anonymous post";
  image.loading = "lazy";
  image.decoding = "async";
  return image;
}

function createReply(postId, reply, supabase) {
  const article = document.createElement("article");
  article.className = "anon-reply";
  const body = document.createElement("p");
  body.textContent = reply.body;
  const date = document.createElement("time");
  const formatted = formatDate(reply.created_at);
  date.textContent = formatted.text;
  date.dateTime = formatted.dateTime;
  article.append(body, date);

  if (isOwner) {
    const removeButton = document.createElement("button");
    removeButton.className = "letter-button letter-button-secondary anon-delete-reply";
    removeButton.type = "button";
    removeButton.textContent = "Delete reply";
    removeButton.addEventListener("click", () => deleteReply(supabase, reply, removeButton));
    article.append(removeButton);
  }
  return article;
}

async function deleteReply(supabase, reply, button) {
  if (!window.confirm("Delete this reply permanently?")) {
    return;
  }
  button.disabled = true;
  try {
    const { data, error } = await supabase
      .from(repliesTable)
      .delete()
      .eq("id", reply.id)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      button.disabled = false;
      ownerFeedback.textContent = error?.message || "Reply was not deleted. Check owner permissions.";
      console.error("Unable to delete Anon Wall reply:", error || "No row deleted.");
      return;
    }
    await loadPosts();
  } catch (error) {
    button.disabled = false;
    ownerFeedback.textContent = "Reply was not deleted. Please check your connection and try again.";
    console.error("Unable to delete Anon Wall reply:", error);
  }
}

function createReplyForm(post, supabase) {
  const form = document.createElement("form");
  form.className = "anon-reply-form";
  const label = document.createElement("label");
  const textarea = document.createElement("textarea");
  const id = `reply-${post.id}`;
  label.htmlFor = id;
  label.textContent = "Write an anonymous reply";
  textarea.id = id;
  textarea.name = "body";
  textarea.maxLength = maxReplyLength;
  textarea.required = true;
  textarea.placeholder = "Reply to this post...";
  const submit = document.createElement("button");
  submit.className = "letter-button";
  submit.type = "submit";
  submit.textContent = "Post reply";
  const status = document.createElement("p");
  status.className = "anon-reply-feedback";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  form.append(label, textarea, submit, status);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = textarea.value.trim();
    if (!body || body.length > maxReplyLength) {
      status.textContent = `Replies must be between 1 and ${maxReplyLength} characters.`;
      return;
    }

    submit.disabled = true;
    submit.textContent = "Posting...";
    status.textContent = "";
    try {
      const { error } = await supabase.from(repliesTable).insert({ post_id: post.id, body });
      if (error) {
        status.textContent = "Could not post your reply. Please try again.";
        console.error("Unable to post Anon Wall reply:", error);
        submit.disabled = false;
        submit.textContent = "Post reply";
        return;
      }
      await loadPosts();
    } catch (error) {
      status.textContent = "Could not post your reply. Please try again.";
      console.error("Unable to post Anon Wall reply:", error);
      submit.disabled = false;
      submit.textContent = "Post reply";
    }
  });
  return form;
}

function createPostCard(post, replies, likeRows, voterId, supabase, threadView = false) {
  const article = document.createElement("article");
  article.className = "anon-post";
  article.dataset.postId = post.id;

  const header = document.createElement("div");
  header.className = "anon-post-header";
  const anonymous = document.createElement("strong");
  anonymous.textContent = "Anonymous";
  const date = document.createElement("time");
  const formatted = formatDate(post.created_at);
  date.textContent = formatted.text;
  date.dateTime = formatted.dateTime;
  header.append(anonymous, date);
  article.append(header);

  if (post.body) {
    const body = document.createElement("p");
    body.className = "anon-post-body";
    body.textContent = post.body;
    article.append(body);
  }

  const media = createMediaElement(post, supabase);
  if (media) {
    article.append(media);
  }

  const actions = document.createElement("div");
  actions.className = "anon-post-actions";
  const postLikes = likeRows.filter((like) => like.post_id === post.id);
  const replyCount = Array.isArray(replies) ? replies.length : replies;
  const liked = postLikes.some((like) => like.voter_id === voterId);
  const likeButton = document.createElement("button");
  likeButton.className = `letter-button letter-button-secondary anon-like-button${liked ? " is-liked" : ""}`;
  likeButton.type = "button";
  likeButton.setAttribute("aria-pressed", String(liked));
  likeButton.textContent = `${liked ? "♥ Liked" : "♡ Like"} · ${postLikes.length}`;
  likeButton.addEventListener("click", async () => {
    likeButton.disabled = true;
    try {
      const result = liked
        ? await supabase.from(likesTable).delete().eq("post_id", post.id).eq("voter_id", voterId)
        : await supabase.from(likesTable).insert({ post_id: post.id, voter_id: voterId });
      if (result.error) {
        likeButton.disabled = false;
        ownerFeedback.textContent = "Could not update your like. Please try again.";
        console.error("Unable to update Anon Wall like:", result.error);
        return;
      }
      await loadPosts();
    } catch (error) {
      likeButton.disabled = false;
      ownerFeedback.textContent = "Could not update your like. Please try again.";
      console.error("Unable to update Anon Wall like:", error);
    }
  });

  actions.append(likeButton);
  if (!threadView) {
    const viewReplies = document.createElement("a");
    viewReplies.className = "letter-button letter-button-secondary";
    viewReplies.href = `anonwall.html?post=${encodeURIComponent(post.id)}`;
    viewReplies.textContent = `View replies · ${replyCount}`;
    actions.append(viewReplies);
  }

  if (isOwner) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "letter-button letter-button-secondary";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete post";
    deleteButton.addEventListener("click", () => deletePost(supabase, post, deleteButton));
    actions.append(deleteButton);
  }
  article.append(actions);

  if (threadView) {
    const repliesSection = document.createElement("section");
    repliesSection.className = "anon-replies";
    repliesSection.setAttribute("aria-label", "Replies");
    for (const reply of replies) {
      repliesSection.append(createReply(post.id, reply, supabase));
    }
    repliesSection.append(createReplyForm(post, supabase));
    article.append(repliesSection);
  }
  return article;
}

async function deletePost(supabase, post, button) {
  if (!window.confirm("Delete this post and all its replies permanently?")) {
    return;
  }
  button.disabled = true;
  button.textContent = "Deleting...";
  let data;
  try {
    const result = await supabase
      .from(wallTable)
      .delete()
      .eq("id", post.id)
      .select("id, media_path")
      .maybeSingle();
    if (result.error || !result.data) {
      button.disabled = false;
      button.textContent = "Delete post";
      ownerFeedback.textContent = result.error?.message || "Post was not deleted. Check owner permissions.";
      console.error("Unable to delete Anon Wall post:", result.error || "No row deleted.");
      return;
    }
    data = result.data;
  } catch (error) {
    button.disabled = false;
    button.textContent = "Delete post";
    ownerFeedback.textContent = "Post was not deleted. Please check your connection and try again.";
    console.error("Unable to delete Anon Wall post:", error);
    return;
  }

  if (data.media_path) {
    try {
      const { error: storageError } = await supabase.storage
        .from(mediaBucket)
        .remove([data.media_path]);
      if (storageError) {
        ownerFeedback.textContent = "Post deleted, but its media file could not be removed from storage.";
        console.error("Unable to remove deleted post media:", storageError);
      }
    } catch (error) {
      ownerFeedback.textContent = "Post deleted, but its media file could not be removed from storage.";
      console.error("Unable to remove deleted post media:", error);
    }
  }
  await loadPosts();
}

async function loadPosts() {
  feedStatus.textContent = "Loading posts...";
  feed.replaceChildren();
  pagePrevious.disabled = true;
  pageNext.disabled = true;
  const isThreadView = Boolean(threadPostId);
  threadBack.hidden = !isThreadView;
  pagination.hidden = isThreadView;
  postOpen.hidden = isThreadView;
  wallTitle.querySelector(".rainbow-float").textContent = isThreadView ? "Post and replies" : "Anon Wall";
  document.title = isThreadView ? "Post and replies | Anon Wall" : "Anon Wall | Newport Network";

  try {
    const supabase = getSupabase();
    if (isThreadView) {
      const { data: post, error: postError } = await supabase
        .from(wallTable)
        .select("id, body, media_path, media_type, created_at")
        .eq("id", threadPostId)
        .maybeSingle();
      if (postError) throw postError;
      if (!post) {
        feedStatus.textContent = "That post could not be found. It may have been deleted.";
        return;
      }

      const [replyResult, likeResult] = await Promise.all([
        supabase.from(repliesTable).select("id, post_id, body, created_at").eq("post_id", post.id)
          .order("created_at", { ascending: true }),
        supabase.from(likesTable).select("post_id, voter_id").eq("post_id", post.id),
      ]);
      if (replyResult.error) throw replyResult.error;
      if (likeResult.error) throw likeResult.error;

      feed.append(createPostCard(post, replyResult.data, likeResult.data, getVoterId(), supabase, true));
      feedStatus.textContent = `${replyResult.data.length} ${
        replyResult.data.length === 1 ? "reply" : "replies"
      }`;
      return;
    }

    const start = (pageNumber - 1) * pageSize;
    const { data: posts, count, error } = await supabase
      .from(wallTable)
      .select("id, body, media_path, media_type, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, start + pageSize - 1);
    if (error) {
      throw error;
    }

    totalPages = Math.max(1, Math.ceil((count ?? posts.length) / pageSize));
    if (pageNumber > totalPages) {
      pageNumber = totalPages;
      updatePageUrl();
      return loadPosts();
    }
    pageStatus.textContent = `Page ${pageNumber} of ${totalPages}`;
    pagePrevious.disabled = pageNumber <= 1;
    pageNext.disabled = pageNumber >= totalPages;

    if (posts.length === 0) {
      feedStatus.textContent = "No posts yet. Be the first to write on the wall!";
      return;
    }

    const ids = posts.map((post) => post.id);
    const [replyResult, likeResult] = await Promise.all([
      supabase.from(repliesTable).select("post_id").in("post_id", ids),
      supabase.from(likesTable).select("post_id, voter_id").in("post_id", ids),
    ]);
    if (replyResult.error) {
      throw replyResult.error;
    }
    if (likeResult.error) {
      throw likeResult.error;
    }

    const replyCounts = new Map(ids.map((id) => [id, 0]));
    for (const reply of replyResult.data) {
      replyCounts.set(reply.post_id, (replyCounts.get(reply.post_id) || 0) + 1);
    }
    const voterId = getVoterId();
    for (const post of posts) {
      feed.append(
        createPostCard(post, replyCounts.get(post.id) || 0, likeResult.data, voterId, supabase)
      );
    }
    feedStatus.textContent = `${count ?? posts.length} anonymous ${
      (count ?? posts.length) === 1 ? "post" : "posts"
    }`;
  } catch (error) {
    feedStatus.textContent =
      "Could not load the wall. Run the latest supabase-setup.sql and try again.";
    console.error("Unable to load Anon Wall posts:", error);
  }
}

postMedia.addEventListener("change", () => {
  const file = postMedia.files[0];
  if (!file) {
    uploadInfo.textContent = "Optional · up to 10 MB";
    postFeedback.textContent = "";
    return;
  }
  if (!mediaTypes.has(file.type)) {
    postMedia.value = "";
    uploadInfo.textContent = "Optional · up to 10 MB";
    postFeedback.textContent = "Choose a JPG, PNG, GIF, WebP, MP4, or WebM file.";
    return;
  }
  if (file.size > maxMediaBytes) {
    postMedia.value = "";
    uploadInfo.textContent = "Optional · up to 10 MB";
    postFeedback.textContent = "That media file is too large. The maximum is 10 MB.";
    return;
  }
  uploadInfo.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
  postFeedback.textContent = "";
});

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = postBody.value.trim();
  const file = postMedia.files[0] || null;
  if (!body && !file) {
    postFeedback.textContent = "Write something or attach an image/video before posting.";
    return;
  }
  if (body.length > maxBodyLength || file && (!mediaTypes.has(file.type) || file.size > maxMediaBytes)) {
    postFeedback.textContent = "Check the post text and make sure your media is allowed and no larger than 10 MB.";
    return;
  }

  postSubmit.disabled = true;
  postSubmit.textContent = "Posting...";
  postFeedback.textContent = file ? "Uploading media..." : "Publishing post...";
  let mediaPath = null;

  try {
    const supabase = getSupabase();
    let mediaType = null;
    if (file) {
      const mediaInfo = mediaTypes.get(file.type);
      mediaType = file.type;
      mediaPath = `${crypto.randomUUID()}.${mediaInfo.extension}`;
      const { error: uploadError } = await supabase.storage.from(mediaBucket).upload(mediaPath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) {
        throw uploadError;
      }
      postFeedback.textContent = "Publishing post...";
    }

    const { error } = await supabase.from(wallTable).insert({
      body,
      media_path: mediaPath,
      media_type: mediaType,
    });
    if (error) {
      throw error;
    }

    postBody.value = "";
    postMedia.value = "";
    uploadInfo.textContent = "Optional · up to 10 MB";
    postFeedback.textContent = "";
    pageNumber = 1;
    updatePageUrl();
    postDialog.close();
    if (threadPostId) {
      location.href = "anonwall.html";
      return;
    }
    await loadPosts();
    document.querySelector(".anon-composer").scrollIntoView({ block: "nearest", behavior: "smooth" });
  } catch (error) {
    postFeedback.textContent =
      error.message || "Your post could not be published. Please try again.";
    console.error("Unable to publish Anon Wall post:", error);
    if (mediaPath) {
      console.warn("If media upload succeeded, its orphaned file may need owner cleanup:", mediaPath);
    }
  } finally {
    postSubmit.disabled = false;
    postSubmit.textContent = "Post anonymously";
  }
});

pagePrevious.addEventListener("click", () => {
  if (pageNumber <= 1) return;
  pageNumber -= 1;
  updatePageUrl();
  loadPosts();
});

pageNext.addEventListener("click", () => {
  if (pageNumber >= totalPages) return;
  pageNumber += 1;
  updatePageUrl();
  loadPosts();
});

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
    const supabase = getSupabase();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: ownerEmail.value.trim(),
      password: ownerPassword.value,
    });
    if (signInError) {
      throw signInError;
    }

    const { data: owner, error: ownerError } = await supabase.rpc("is_mailbox_owner");
    if (ownerError) {
      throw ownerError;
    }
    if (!owner) {
      await supabase.auth.signOut();
      throw new Error("This account does not have owner permissions.");
    }

    isOwner = true;
    ownerForm.hidden = true;
    ownerToggle.hidden = true;
    ownerSession.hidden = false;
    ownerPassword.value = "";
    await loadPosts();
  } catch (error) {
    ownerFeedback.textContent = error.message || "Sign-in failed. Check the mailbox owner account.";
    console.error("Unable to sign into Anon Wall owner mode:", error);
  } finally {
    submit.disabled = false;
    submit.textContent = "Sign in";
  }
});

ownerSignOut.addEventListener("click", async () => {
  ownerFeedback.textContent = "";
  try {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
    isOwner = false;
    ownerSession.hidden = true;
    ownerToggle.hidden = false;
    ownerForm.hidden = true;
    await loadPosts();
  } catch (error) {
    ownerFeedback.textContent = "Sign-out failed. Please try again.";
    console.error("Unable to sign out of Anon Wall owner mode:", error);
  }
});

loadPosts();
