const blogPostsTable = "blog_posts";
const blogLikesTable = "blog_likes";
const blogPageSize = 20;
const blogVoterStorageKey = "newport-blog-voter-id";

const blogFeed = document.querySelector("#blog-feed");
const blogFeedStatus = document.querySelector("#blog-feed-status");
const blogPagePrevious = document.querySelector("#blog-page-previous");
const blogPageNext = document.querySelector("#blog-page-next");
const blogPageStatus = document.querySelector("#blog-page-status");
const ownerToggle = document.querySelector("#blog-owner-toggle");
const ownerForm = document.querySelector("#blog-owner-form");
const ownerEmail = document.querySelector("#blog-owner-email");
const ownerPassword = document.querySelector("#blog-owner-password");
const ownerFeedback = document.querySelector("#blog-owner-feedback");
const ownerSession = document.querySelector("#blog-owner-session");
const ownerSignOut = document.querySelector("#blog-owner-sign-out");
const postOpen = document.querySelector("#blog-post-open");
const postDialog = document.querySelector("#blog-post-dialog");
const postClose = document.querySelector("#blog-post-close");
const postForm = document.querySelector("#blog-post-form");
const postTitle = document.querySelector("#blog-post-title");
const postBody = document.querySelector("#blog-post-body");
const postFeedback = document.querySelector("#blog-post-feedback");
const postSubmit = document.querySelector("#blog-post-submit");

let blogPage = Math.max(1, Number.parseInt(new URLSearchParams(location.search).get("page"), 10) || 1);
let blogTotalPages = 1;
let blogIsOwner = false;
let fallbackBlogVoterId;

function getBlogSupabase() {
  if (!window.supabaseClient) {
    throw new Error("The blog service is unavailable. Check your connection and try again.");
  }
  return window.supabaseClient;
}

function getBlogVoterId() {
  try {
    let voterId = localStorage.getItem(blogVoterStorageKey);
    if (!voterId) {
      voterId = crypto.randomUUID();
      localStorage.setItem(blogVoterStorageKey, voterId);
    }
    return voterId;
  } catch (error) {
    console.warn("Blog likes will only persist for this visit:", error);
    fallbackBlogVoterId ??= crypto.randomUUID();
    return fallbackBlogVoterId;
  }
}

function updateBlogPageUrl() {
  const url = new URL(location.href);
  if (blogPage === 1) {
    url.searchParams.delete("page");
  } else {
    url.searchParams.set("page", String(blogPage));
  }
  history.replaceState(null, "", url);
}

function formatBlogDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { text: "Date unavailable", dateTime: "" };
  }
  return { text: date.toLocaleString(), dateTime: date.toISOString() };
}

function createBlogPost(post, likes, voterId, supabase) {
  const article = document.createElement("article");
  article.className = "blog-post";

  const avatar = document.createElement("img");
  avatar.className = "blog-post-avatar";
  avatar.src = "img/IMG_1184.jpeg";
  avatar.alt = "";
  avatar.width = 100;
  avatar.height = 100;
  avatar.loading = "lazy";
  avatar.decoding = "async";

  const content = document.createElement("div");
  content.className = "blog-post-content";
  const heading = document.createElement("h2");
  heading.textContent = post.title;
  const time = document.createElement("time");
  const formatted = formatBlogDate(post.created_at);
  time.textContent = formatted.text;
  time.dateTime = formatted.dateTime;
  const body = document.createElement("p");
  body.className = "blog-post-body";
  body.textContent = post.body;
  content.append(heading, time, body);

  const postLikes = likes.filter((like) => like.post_id === post.id);
  const liked = postLikes.some((like) => like.voter_id === voterId);
  const likeButton = document.createElement("button");
  likeButton.className = `letter-button letter-button-secondary blog-like-button${liked ? " is-liked" : ""}`;
  likeButton.type = "button";
  likeButton.setAttribute("aria-pressed", String(liked));
  likeButton.textContent = `${liked ? "♥ Liked" : "♡ Like"} · ${postLikes.length}`;
  likeButton.addEventListener("click", async () => {
    likeButton.disabled = true;
    try {
      const result = liked
        ? await supabase.from(blogLikesTable).delete().eq("post_id", post.id).eq("voter_id", voterId)
        : await supabase.from(blogLikesTable).insert({ post_id: post.id, voter_id: voterId });
      if (result.error) {
        throw result.error;
      }
      await loadBlogPosts();
    } catch (error) {
      likeButton.disabled = false;
      blogFeedStatus.textContent = "Could not update your like. Please try again.";
      console.error("Unable to update blog like:", error);
    }
  });
  content.append(likeButton);
  article.append(avatar, content);
  return article;
}

async function loadBlogPosts() {
  blogFeedStatus.textContent = "Loading posts...";
  blogFeed.replaceChildren();
  blogPagePrevious.disabled = true;
  blogPageNext.disabled = true;

  try {
    const supabase = getBlogSupabase();
    const offset = (blogPage - 1) * blogPageSize;
    const { data: posts, count, error } = await supabase
      .from(blogPostsTable)
      .select("id, title, body, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + blogPageSize - 1);
    if (error) {
      throw error;
    }

    blogTotalPages = Math.max(1, Math.ceil((count ?? posts.length) / blogPageSize));
    if (blogPage > blogTotalPages) {
      blogPage = blogTotalPages;
      updateBlogPageUrl();
      return loadBlogPosts();
    }
    blogPageStatus.textContent = `Page ${blogPage} of ${blogTotalPages}`;
    blogPagePrevious.disabled = blogPage <= 1;
    blogPageNext.disabled = blogPage >= blogTotalPages;

    if (posts.length === 0) {
      blogFeedStatus.textContent = "No blog posts yet.";
      return;
    }

    const ids = posts.map((post) => post.id);
    const { data: likes, error: likesError } = await supabase
      .from(blogLikesTable)
      .select("post_id, voter_id")
      .in("post_id", ids);
    if (likesError) {
      throw likesError;
    }
    const voterId = getBlogVoterId();
    for (const post of posts) {
      blogFeed.append(createBlogPost(post, likes, voterId, supabase));
    }
    blogFeedStatus.textContent = `${count ?? posts.length} blog ${(count ?? posts.length) === 1 ? "post" : "posts"}`;
  } catch (error) {
    blogFeedStatus.textContent = "Could not load the blog. Run the latest supabase-setup.sql and try again.";
    console.error("Unable to load blog posts:", error);
  }
}

ownerToggle.addEventListener("click", () => {
  ownerForm.hidden = !ownerForm.hidden;
  if (!ownerForm.hidden) {
    ownerEmail.focus();
  }
});

ownerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  ownerFeedback.textContent = "";
  const submit = ownerForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = "Signing in...";
  try {
    const supabase = getBlogSupabase();
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

    blogIsOwner = true;
    ownerForm.hidden = true;
    ownerToggle.hidden = true;
    ownerSession.hidden = false;
    postOpen.hidden = false;
    ownerPassword.value = "";
  } catch (error) {
    ownerFeedback.textContent = error.message || "Sign-in failed. Check the mailbox owner account.";
    console.error("Unable to sign into blog owner mode:", error);
  } finally {
    submit.disabled = false;
    submit.textContent = "Sign in";
  }
});

ownerSignOut.addEventListener("click", async () => {
  ownerFeedback.textContent = "";
  try {
    const { error } = await getBlogSupabase().auth.signOut();
    if (error) {
      throw error;
    }
    blogIsOwner = false;
    ownerSession.hidden = true;
    ownerToggle.hidden = false;
    ownerForm.hidden = true;
    postOpen.hidden = true;
    postDialog.close();
  } catch (error) {
    ownerFeedback.textContent = "Sign-out failed. Please try again.";
    console.error("Unable to sign out of blog owner mode:", error);
  }
});

postOpen.addEventListener("click", () => {
  if (!blogIsOwner) {
    return;
  }
  postFeedback.textContent = "";
  postDialog.showModal();
  postTitle.focus();
});

postClose.addEventListener("click", () => postDialog.close());

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!blogIsOwner) {
    postFeedback.textContent = "Sign in as the blog owner to publish.";
    return;
  }
  const title = postTitle.value.trim();
  const body = postBody.value.trim();
  if (!title || !body) {
    postFeedback.textContent = "Add a title and post text before publishing.";
    return;
  }

  postSubmit.disabled = true;
  postSubmit.textContent = "Publishing...";
  postFeedback.textContent = "";
  try {
    const { error } = await getBlogSupabase().from(blogPostsTable).insert({ title, body });
    if (error) {
      throw error;
    }
    postForm.reset();
    blogPage = 1;
    updateBlogPageUrl();
    postDialog.close();
    await loadBlogPosts();
  } catch (error) {
    postFeedback.textContent = error.message || "The post could not be published. Please try again.";
    console.error("Unable to publish blog post:", error);
  } finally {
    postSubmit.disabled = false;
    postSubmit.textContent = "Publish post";
  }
});

blogPagePrevious.addEventListener("click", () => {
  if (blogPage <= 1) {
    return;
  }
  blogPage -= 1;
  updateBlogPageUrl();
  loadBlogPosts();
});

blogPageNext.addEventListener("click", () => {
  if (blogPage >= blogTotalPages) {
    return;
  }
  blogPage += 1;
  updateBlogPageUrl();
  loadBlogPosts();
});

loadBlogPosts();
