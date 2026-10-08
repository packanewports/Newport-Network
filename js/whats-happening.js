const happeningStatus = document.querySelector("#whats-happening-status");
const happeningMusicTitle = document.querySelector("#happening-music-title");
const happeningMusicDetail = document.querySelector("#happening-music-detail");
const happeningBlogTitle = document.querySelector("#happening-blog-title");
const happeningBlogDetail = document.querySelector("#happening-blog-detail");
const happeningWallPost = document.querySelector("#happening-wall-post");
const happeningWallDetail = document.querySelector("#happening-wall-detail");
const happeningArtLabel = document.querySelector("#happening-art-label");
const happeningArtImage = document.querySelector("#happening-art-image");
const happeningArtTitle = document.querySelector("#happening-art-title");
const happeningArtDetail = document.querySelector("#happening-art-detail");

function excerpt(value, maxLength = 130) {
  const normalized = value?.trim() || "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trimEnd()}...` : normalized;
}

function setHappeningError(titleElement, detailElement, message, error, section) {
  titleElement.textContent = message;
  detailElement.textContent = "Try again in a little while.";
  console.error(`Unable to load ${section} for the home page:`, error);
}

async function loadHappening() {
  const supabase = window.supabaseClient;
  if (!supabase) {
    happeningStatus.textContent = "Live updates are unavailable right now.";
    setHappeningError(happeningMusicTitle, happeningMusicDetail, "Music Bar unavailable", new Error("Supabase client unavailable."), "Music Bar");
    setHappeningError(happeningBlogTitle, happeningBlogDetail, "Blog unavailable", new Error("Supabase client unavailable."), "blog");
    setHappeningError(happeningWallPost, happeningWallDetail, "Anon Wall unavailable", new Error("Supabase client unavailable."), "Anon Wall");
    happeningArtTitle.textContent = "Art Museum unavailable";
    happeningArtDetail.textContent = "Try again in a little while.";
    return;
  }

  const [musicResult, blogResult, wallResult, artResult] = await Promise.allSettled([
    supabase.from("music_room_state").select("current_track_id").eq("id", true).maybeSingle(),
    supabase.from("blog_posts").select("title, body, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("anon_wall_posts").select("body, media_path, media_type, created_at").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("art_museum").select("image_path, sender_name, is_art_of_week, is_favorite, created_at").order("is_art_of_week", { ascending: false }).order("is_favorite", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  let sectionErrors = 0;

  if (musicResult.status === "fulfilled" && !musicResult.value.error) {
    const state = musicResult.value.data;
    if (state?.current_track_id) {
      const { data, error } = await supabase.from("music_queue").select("title, requester_name, status").eq("id", state.current_track_id).maybeSingle();
      if (error) {
        sectionErrors += 1;
        setHappeningError(happeningMusicTitle, happeningMusicDetail, "Music Bar unavailable", error, "Music Bar");
      } else if (data) {
        happeningMusicTitle.textContent = data.title;
        happeningMusicDetail.textContent = `Now playing${data.requester_name ? ` · requested by ${data.requester_name}` : ""}`;
      } else {
        happeningMusicTitle.textContent = "Nothing is playing";
        happeningMusicDetail.textContent = "Add a song to the shared queue";
      }
    } else {
      happeningMusicTitle.textContent = "Nothing is playing";
      happeningMusicDetail.textContent = "Add a song to the shared queue";
    }
  } else {
    sectionErrors += 1;
    const reason = musicResult.status === "rejected" ? musicResult.reason : musicResult.value.error;
    setHappeningError(happeningMusicTitle, happeningMusicDetail, "Music Bar unavailable", reason, "Music Bar");
  }

  if (blogResult.status === "fulfilled" && !blogResult.value.error) {
    const post = blogResult.value.data;
    happeningBlogTitle.textContent = post?.title || "No blog posts yet";
    happeningBlogDetail.textContent = post ? excerpt(post.body, 110) : "Packa's thoughts and updates";
  } else {
    sectionErrors += 1;
    const reason = blogResult.status === "rejected" ? blogResult.reason : blogResult.value.error;
    setHappeningError(happeningBlogTitle, happeningBlogDetail, "Blog unavailable", reason, "blog");
  }

  if (wallResult.status === "fulfilled" && !wallResult.value.error) {
    const post = wallResult.value.data;
    happeningWallPost.textContent = post?.body ? excerpt(post.body) : post?.media_path ? "A new media post" : "No posts yet";
    happeningWallDetail.textContent = post ? `Posted ${new Date(post.created_at).toLocaleString()}` : "Be the first to write on the wall";
  } else {
    sectionErrors += 1;
    const reason = wallResult.status === "rejected" ? wallResult.reason : wallResult.value.error;
    setHappeningError(happeningWallPost, happeningWallDetail, "Anon Wall unavailable", reason, "Anon Wall");
  }

  if (artResult.status === "fulfilled" && !artResult.value.error) {
    const artwork = artResult.value.data;
    if (artwork) {
      happeningArtLabel.textContent = artwork.is_art_of_week ? "Art of the Week" : "From the Art Museum";
      happeningArtTitle.textContent = artwork.is_art_of_week
        ? "This week's featured piece"
        : `Artwork sent by ${artwork.sender_name || "Anonymous"}`;
      happeningArtDetail.textContent = artwork.is_art_of_week
        ? "Chosen by Packa"
        : artwork.is_favorite ? "♥ A Packa favorite" : "Visit the Art Museum";
      happeningArtImage.src = supabase.storage.from("art-museum").getPublicUrl(artwork.image_path).data.publicUrl;
      happeningArtImage.hidden = false;
    } else {
      happeningArtTitle.textContent = "The gallery is waiting";
      happeningArtDetail.textContent = "Send a drawing to the Art Museum";
    }
  } else {
    sectionErrors += 1;
    const reason = artResult.status === "rejected" ? artResult.reason : artResult.value.error;
    happeningArtTitle.textContent = "Art Museum unavailable";
    happeningArtDetail.textContent = "Try again in a little while.";
    console.error("Unable to load Art Museum for the home page:", reason);
  }

  happeningStatus.textContent = sectionErrors > 0
    ? "Some live updates are unavailable right now; visit a section to try again."
    : "The latest from around Newport Network.";
}

loadHappening().catch((error) => {
  happeningStatus.textContent = "Some live updates could not be loaded.";
  console.error("Unable to load the What's Happening section:", error);
});
