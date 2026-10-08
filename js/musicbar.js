const musicQueueTable = "music_queue";
const musicRoomStateTable = "music_room_state";
const musicChatTable = "music_chat";
const musicPlinkoStateTable = "music_plinko_state";
const musicSessionKey = "newport-music-room-session";
const chatHistoryLimit = 60;

const currentTitle = document.querySelector("#music-current-title");
const currentRequester = document.querySelector("#music-current-requester");
const playerMessage = document.querySelector("#music-player-message");
const queueList = document.querySelector("#music-queue");
const queueCount = document.querySelector("#music-queue-count");
const queueEmpty = document.querySelector("#music-queue-empty");
const roomCount = document.querySelector("#music-room-count");
const roomOdometer = document.querySelector("#music-room-odometer");
const roomPeople = document.querySelector("#music-room-people");
const skipButton = document.querySelector("#music-skip-button");
const skipStatus = document.querySelector("#music-skip-status");
const connectionStatus = document.querySelector("#music-connection-status");
const requestForm = document.querySelector("#music-request-form");
const requestTitle = document.querySelector("#music-song-title");
const requestUrl = document.querySelector("#music-song-url");
const requestSubmit = document.querySelector("#music-request-submit");
const requestStatus = document.querySelector("#music-request-status");
const chatForm = document.querySelector("#music-chat-form");
const chatName = document.querySelector("#music-chat-name");
const chatMessage = document.querySelector("#music-chat-message");
const chatSubmit = document.querySelector("#music-chat-submit");
const chatStatus = document.querySelector("#music-chat-status");
const chatMessages = document.querySelector("#music-chat-messages");
const chatHistoryStatus = document.querySelector("#music-chat-history-status");
const reactionLayer = document.querySelector("#music-reaction-layer");
const reactionImages = Array.from({ length: 8 }, (_, index) => `img/reaction${index + 1}.png`);
const reactionSquishImage = "img/reactionsquish.webp";
const requestName = document.querySelector("#music-song-requester");
const ownerToggle = document.querySelector("#music-owner-toggle");
const ownerForm = document.querySelector("#music-owner-form");
const ownerEmail = document.querySelector("#music-owner-email");
const ownerPassword = document.querySelector("#music-owner-password");
const ownerStatus = document.querySelector("#music-owner-status");
const ownerSession = document.querySelector("#music-owner-session");
const ownerSignOut = document.querySelector("#music-owner-sign-out");
const clearQueueButton = document.querySelector("#music-clear-queue");
const reactionTestToggle = document.querySelector("#music-reaction-test-toggle");
const reactionTestPanel = document.querySelector("#music-reaction-test");
const reactionTestButton = document.querySelector("#music-reaction-test-button");
const plinkoTestButton = document.querySelector("#music-plinko-test-button");
const maxFlyingReactions = 50;
const reactionStartLeadMs = 500;
const reactionBurstSpacingMs = 90;
const plinkoSlotCount = 7;

let musicSupabase;
let musicChannel;
let youtubePlayer;
let youtubeReady = false;
let youtubePlayerReady = false;
let youtubeApiLoading = false;
let currentTrack = null;
let activeSessionId;
let livePresenceAvailable = false;
let roomRefreshRunning = false;
let roomRefreshPending = false;
let audienceRefreshTimer;
let heartbeatTimer;
let skipInProgress = false;
let musicOwnerMode = false;
let currentPlinkoSlot = 3;
let plinkoStateReady = false;
const activePlinkoRounds = new Set();
const activeReactionBodies = new Map();
const activePlinkoBalls = new Map();
let activePlinkoBoard = null;
let reactionAnimationPending = false;
let plinkoAnimationPending = false;
let oldestChatMessage = null;
let chatHistoryHasMore = true;
let chatHistoryLoading = false;
const renderedChatMessageIds = new Set();

function getMusicSupabase() {
  if (!window.supabaseClient) {
    throw new Error("The Music Bar service is unavailable. Check your connection and try again.");
  }
  return window.supabaseClient;
}

function getSessionId() {
  try {
    let id = localStorage.getItem(musicSessionKey);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(musicSessionKey, id);
    }
    return id;
  } catch (error) {
    console.warn("Music room identity will only last for this visit:", error);
    return crypto.randomUUID();
  }
}

function parseYouTubeVideoId(value) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
      if (url.pathname === "/watch") {
        id = url.searchParams.get("v") || "";
      } else {
        const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/);
        id = match?.[1] || "";
      }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function formatMusicDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString();
}

function formatChatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function requestYouTubeApi() {
  if (window.YT?.Player) {
    youtubeReady = true;
    initializeYouTubePlayer();
    return;
  }
  if (youtubeApiLoading) {
    return;
  }

  const priorCallback = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    if (typeof priorCallback === "function") {
      priorCallback();
    }
    youtubeApiLoading = false;
    youtubeReady = true;
    initializeYouTubePlayer();
  };
  if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
    youtubeApiLoading = true;
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      youtubeApiLoading = false;
      script.remove();
      playerMessage.textContent = "The YouTube player could not load. Check your connection and try again.";
    };
    document.head.append(script);
  } else {
    youtubeApiLoading = true;
  }
}

function initializeYouTubePlayer() {
  if (!youtubeReady || !currentTrack || youtubePlayer || !window.YT?.Player) {
    return;
  }
  youtubePlayer = new window.YT.Player("music-player", {
    width: "100%",
    height: "100%",
    playerVars: {
      autoplay: 0,
      controls: 1,
      origin: location.origin,
      playsinline: 1,
      rel: 0,
    },
    events: {
      onReady: () => {
        youtubePlayerReady = true;
        syncYouTubePlayer();
      },
      onStateChange: (event) => {
        if (event.data === window.YT.PlayerState.ENDED && currentTrack) {
          finishCurrentTrack(currentTrack.id);
        }
      },
      onError: () => {
        playerMessage.textContent =
          "This video cannot play in the embedded player. The room can vote to skip it.";
      },
    },
  });
}

function syncYouTubePlayer() {
  if (
    !youtubePlayerReady ||
    !youtubePlayer ||
    typeof youtubePlayer.loadVideoById !== "function" ||
    !currentTrack
  ) {
    return;
  }
  const elapsedSeconds = Math.max(0, (Date.now() - new Date(currentTrack.started_at).getTime()) / 1000);
  const videoId = currentTrack.video_id;
  if (youtubePlayer.getVideoData?.()?.video_id === videoId) {
    const drift = Math.abs((youtubePlayer.getCurrentTime?.() || 0) - elapsedSeconds);
    if (drift > 5) {
      youtubePlayer.seekTo?.(elapsedSeconds, true);
    }
    return;
  }
  youtubePlayer.loadVideoById({ videoId, startSeconds: elapsedSeconds });
  playerMessage.textContent = "If playback does not start automatically, press Play in the YouTube player.";
}

function clearYouTubePlayer() {
  try {
    if (youtubePlayerReady && typeof youtubePlayer?.stopVideo === "function") {
      youtubePlayer.stopVideo();
    }
  } catch (error) {
    console.warn("Unable to stop the previous YouTube video:", error);
  }
}

function renderQueue(queue) {
  queueList.replaceChildren();
  queueCount.textContent = `${queue.length} ${queue.length === 1 ? "song" : "songs"}`;
  queueEmpty.hidden = queue.length > 0;
  for (const track of queue) {
    const item = document.createElement("li");
    const details = document.createElement("div");
    details.className = "music-queue-item-details";
    const title = document.createElement("strong");
    title.textContent = track.title;
    const requester = document.createElement("span");
    requester.className = "music-queue-requester";
    requester.textContent = `Requested by ${track.requester_name || "Anonymous"}`;
    const timestamp = document.createElement("time");
    timestamp.dateTime = new Date(track.created_at).toISOString();
    timestamp.textContent = `Added ${formatMusicDate(track.created_at)}`;
    details.append(title, document.createElement("br"), requester, document.createElement("br"), timestamp);
    item.append(details);
    if (musicOwnerMode || track.can_remove) {
      const removeButton = document.createElement("button");
      removeButton.className = "letter-button letter-button-secondary music-queue-remove";
      removeButton.type = "button";
      removeButton.textContent = "Remove";
      removeButton.setAttribute("aria-label", `Remove ${track.title} from the queue`);
      removeButton.addEventListener("click", () => removeQueuedTrack(track, removeButton));
      item.append(removeButton);
    }
    queueList.append(item);
  }
  clearQueueButton.disabled = queue.length === 0;
}

async function removeQueuedTrack(track, button) {
  button.disabled = true;
  button.textContent = "Removing...";
  try {
    const { data, error } = await musicSupabase.rpc("music_remove_queued_track", {
      p_track_id: track.id,
      p_session_id: activeSessionId,
    });
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("That song is no longer in the queue.");
    }
    await refreshRoom();
  } catch (error) {
    requestStatus.textContent = error.message || "Could not remove that song.";
    console.error("Unable to remove queued Music Bar song:", error);
    button.disabled = false;
    button.textContent = "Remove";
  }
}

function createSeededRandom(seed) {
  let state = 2166136261;
  for (const character of String(seed)) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function fadeAndRemove(element, delay = 350) {
  if (!element.isConnected) return;
  element.classList.add("is-fading");
  window.setTimeout(() => element.remove(), delay);
}

function scheduleStainFade(stain, random) {
  const lifetime = 4000 + random() * 8000;
  window.setTimeout(() => fadeAndRemove(stain, 1200), lifetime - 1200);
}

function getReactionBurstCount(messageId) {
  const random = createSeededRandom(`${messageId}-burst`);
  const roll = random();
  // Ten-reaction bursts are limited to the rarest 0.05% of message rolls.
  if (roll < 0.82) return 1;
  if (roll < 0.94) return 2;
  if (roll < 0.985) return 3;
  if (roll < 0.997) return 4 + Math.floor(random() * 2);
  if (roll < 0.9995) return 6 + Math.floor(random() * 3);
  return 9 + Math.floor(random() * 2);
}

function launchChatReaction(messageId, testOnly = false, createdAt = Date.now()) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const count = testOnly ? 1 : getReactionBurstCount(messageId);
  const messageTime = new Date(createdAt).getTime();
  const baseStartTime = (Number.isFinite(messageTime) ? messageTime : Date.now()) + reactionStartLeadMs;
  const previousReactionIndexes = [];
  for (let index = 0; index < count; index += 1) {
    const reactionId = `${messageId}-reaction-${index}`;
    const imageRandom = createSeededRandom(`${messageId}-appearance-${index}`);
    let reactionIndex = Math.floor(imageRandom() * reactionImages.length);
    if (reactionImages.length > 1 && reactionIndex === previousReactionIndexes[index - 1]) {
      reactionIndex = (reactionIndex + 1 + Math.floor(imageRandom() * (reactionImages.length - 1))) % reactionImages.length;
    }
    previousReactionIndexes.push(reactionIndex);
    const reactionSrc = reactionImages[reactionIndex];
    const delay = Math.max(0, baseStartTime + index * reactionBurstSpacingMs - Date.now());
    window.setTimeout(() => spawnChatReaction(reactionId, testOnly, reactionSrc), delay);
  }
}

function spawnChatReaction(reactionId, testOnly, reactionSrc) {
  if (activeReactionBodies.size >= maxFlyingReactions) return;
  const random = createSeededRandom(reactionId);
  const image = document.createElement("img");
  image.className = "music-flying-reaction";
  image.src = reactionSrc || reactionImages[Math.floor(random() * reactionImages.length)];
  image.alt = "";
  image.draggable = false;

  const chatRect = chatMessages.getBoundingClientRect();
  const pageScrollX = window.scrollX;
  const pageScrollY = window.scrollY;
  const size = 48 + random() * 42;
  const minX = Math.max(0, chatRect.left + pageScrollX);
  const maxX = Math.max(minX, Math.min(
    Math.max(document.documentElement.scrollWidth, window.innerWidth) - size,
    chatRect.right + pageScrollX - size
  ));
  const x = minX + random() * (maxX - minX);
  const fromTop = random() < 0.5;
  const y = fromTop ? -size - 2 : pageScrollY + window.innerHeight + 2;
  const startedAt = performance.now();
  const lifetimeMs = 2000 + random() * 8000;
  const physics = {
    x,
    y,
    previousX: x,
    previousY: y,
    velocityX: (random() - 0.5) * 250,
    velocityY: fromTop ? 260 + random() * 260 : -(650 + random() * 520),
    gravity: 1000 + random() * 300,
    grounded: false,
    rotation: (random() - 0.5) * 40,
    angularVelocity: (random() - 0.5) * 420,
    size,
    lastHitTarget: null,
    lastHitAt: 0,
    startedAt,
    lastFrameAt: startedAt,
    lifetimeMs,
    random,
  };

  image.style.width = `${size}px`;
  image.style.height = `${size}px`;
  image.style.left = "0";
  image.style.top = "0";
  image.style.opacity = "1";
  image.style.transform =
    `translate3d(${x - pageScrollX}px, ${y - pageScrollY}px, 0) rotate(${physics.rotation}deg)`;
  image.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    explodeReaction(image, physics, `${reactionId}-clicked`);
  });
  reactionLayer.append(image);
  activeReactionBodies.set(image, { image, physics, testOnly, fromTop });
  requestReactionAnimation();
}

function explodeReaction(image, physics, seed) {
  const impactX = physics.x + physics.size / 2;
  const impactY = physics.y + physics.size / 2;
  const viewportX = impactX - window.scrollX;
  const viewportY = impactY - window.scrollY;
  activeReactionBodies.delete(image);
  image.className = "music-reaction-squish";
  image.src = reactionSquishImage;
  image.style.left = "0";
  image.style.top = "0";
  image.style.width = `${physics.size}px`;
  image.style.height = `${physics.size}px`;
  image.style.setProperty("--impact-x", `${viewportX}px`);
  image.style.setProperty("--impact-y", `${viewportY}px`);
  image.style.setProperty("--impact-spin", `${(physics.random() - 0.5) * 40}deg`);
  image.style.transform = "";
  const random = createSeededRandom(seed);
  const burstStainCount = 16 + Math.floor(random() * 9);
  spawnReactionStains(impactX, impactY, random, burstStainCount, true);
  window.setTimeout(() => image.remove(), 520);
}

function getImpactStainCount(speed, random) {
  const intensity = Math.max(0, Math.min(1, (speed - 140) / 860));
  if (intensity === 0) return 0;
  const maxStains = Math.min(16, 2 + Math.ceil(intensity * 14));
  return 1 + Math.floor(random() * maxStains);
}

function spawnReactionStains(x, y, random, count, prioritizeBurst = false) {
  let currentStains = reactionLayer.querySelectorAll(".music-reaction-stain");
  if (prioritizeBurst && currentStains.length + count > 100) {
    const stainsToRemove = currentStains.length + count - 100;
    for (const stain of Array.from(currentStains).slice(0, stainsToRemove)) {
      stain.remove();
    }
    currentStains = reactionLayer.querySelectorAll(".music-reaction-stain");
  }
  const stainsToCreate = Math.min(count, Math.max(0, 100 - currentStains.length));
  for (let index = 0; index < stainsToCreate; index += 1) {
    const stain = document.createElement("span");
    stain.className = "music-reaction-stain";
    stain.setAttribute("aria-hidden", "true");
    const size = 4 + random() * 7;
    const angle = random() * Math.PI * 2;
    const speed = 150 + random() * 330;
    stain.style.width = `${size}px`;
    stain.style.height = `${size * (0.75 + random() * 0.7)}px`;
    const tilt = (random() - 0.5) * 80;
    stain.style.left = `${x - window.scrollX}px`;
    stain.style.top = `${y - window.scrollY}px`;
    stain.style.setProperty("--stain-tilt", `${tilt}deg`);
    stain.style.transform = `translate(-50%, -50%) rotate(${tilt}deg)`;
    reactionLayer.append(stain);

    const physics = {
      x,
      y,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed - 100,
      gravity: 880,
      lastFrameAt: performance.now(),
      startedAt: performance.now(),
      landed: false,
      random,
    };

    function animateStain(frameTime) {
      if (!stain.isConnected || physics.landed) return;
      const elapsed = Math.min((frameTime - physics.lastFrameAt) / 1000, 0.03);
      physics.lastFrameAt = frameTime;
      physics.velocityY += physics.gravity * elapsed;
      physics.x += physics.velocityX * elapsed;
      physics.y += physics.velocityY * elapsed;

      const pageWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
      if (physics.x < 4 || physics.x > pageWidth - 4) {
        physics.x = Math.min(pageWidth - 4, Math.max(4, physics.x));
        physics.velocityX *= -0.45;
      }
      if (physics.y < 4) {
        physics.y = 4;
        physics.velocityY = Math.abs(physics.velocityY) * 0.45;
      }

      const viewportX = physics.x - window.scrollX;
      const viewportY = physics.y - window.scrollY;
      const pointIsVisible = viewportX >= 0 &&
        viewportY >= 0 &&
        viewportX < window.innerWidth &&
        viewportY < window.innerHeight;
      const target = frameTime - physics.startedAt > 100 && pointIsVisible
        ? document.elementFromPoint(viewportX, viewportY)
        : null;
      const hitSurface = target &&
        target !== document.body &&
        target !== document.documentElement &&
        !target.closest(".music-chat-panel") &&
        !reactionLayer.contains(target);
      const pageHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      if (hitSurface || physics.y >= pageHeight - 2) {
        physics.landed = true;
        stain.dataset.pageX = String(physics.x);
        stain.dataset.pageY = String(physics.y);
        stain.style.left = `${physics.x - window.scrollX}px`;
        stain.style.top = `${Math.max(0, physics.y - window.scrollY)}px`;
        stain.style.transform =
          `translate(-50%, -50%) rotate(${stain.style.getPropertyValue("--stain-tilt")})`;
        scheduleStainFade(stain, random);
        return;
      }

      if (frameTime - physics.startedAt > 2400) {
        physics.landed = true;
        physics.y = Math.min(pageHeight - 2, physics.y);
        stain.dataset.pageX = String(physics.x);
        stain.dataset.pageY = String(physics.y);
        stain.style.left = `${physics.x - window.scrollX}px`;
        stain.style.top = `${physics.y - window.scrollY}px`;
        stain.style.transform =
          `translate(-50%, -50%) rotate(${stain.style.getPropertyValue("--stain-tilt")})`;
        scheduleStainFade(stain, random);
        return;
      }

      stain.style.left = `${physics.x - window.scrollX}px`;
      stain.style.top = `${physics.y - window.scrollY}px`;
      stain.style.transform =
        `translate(-50%, -50%) rotate(${physics.velocityX * 0.08}deg)`;
      requestAnimationFrame(animateStain);
    }

    requestAnimationFrame(animateStain);
  }
}

function repositionLandedStains() {
  for (const stain of reactionLayer.querySelectorAll(".music-reaction-stain[data-page-x][data-page-y]")) {
    stain.style.left = `${Number(stain.dataset.pageX) - window.scrollX}px`;
    stain.style.top = `${Number(stain.dataset.pageY) - window.scrollY}px`;
  }
}

window.addEventListener("scroll", repositionLandedStains, true);

function requestReactionAnimation() {
  if (reactionAnimationPending || activeReactionBodies.size === 0) return;
  reactionAnimationPending = true;
  requestAnimationFrame(animateFlyingReactions);
}

function animateFlyingReactions(frameTime) {
  reactionAnimationPending = false;
  const bodies = [...activeReactionBodies.values()];
  const chatRect = chatMessages.getBoundingClientRect();
  const chatBounds = {
    left: chatRect.left + window.scrollX,
    right: chatRect.right + window.scrollX,
    top: chatRect.top + window.scrollY,
    bottom: chatRect.bottom + window.scrollY,
  };

  for (const body of bodies) {
    const { image, physics, testOnly, fromTop } = body;
    if (!image.isConnected) {
      activeReactionBodies.delete(image);
      continue;
    }
    const elapsed = Math.min((frameTime - physics.lastFrameAt) / 1000, 0.03);
    physics.lastFrameAt = frameTime;
    physics.previousX = physics.x;
    physics.previousY = physics.y;
    const pageHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    const floorY = Math.max(0, pageHeight - physics.size);
    if (physics.grounded) {
      physics.x += physics.velocityX * elapsed;
      physics.velocityX *= Math.exp(-1.6 * elapsed);
      physics.y = floorY;
      if (Math.abs(physics.velocityX) < 8) {
        physics.velocityX = 0;
      }
    } else {
      physics.velocityY += physics.gravity * elapsed;
      physics.x += physics.velocityX * elapsed;
      physics.y += physics.velocityY * elapsed;
    }
    physics.rotation += physics.angularVelocity * elapsed;

    const overlapsChat = physics.x + physics.size > chatBounds.left &&
      physics.x < chatBounds.right &&
      physics.y + physics.size > chatBounds.top &&
      physics.y < chatBounds.bottom;
    const justEnteredChatFromTop = fromTop &&
      physics.velocityY > 0 &&
      physics.previousY + physics.size <= chatBounds.top &&
      physics.y + physics.size >= chatBounds.top &&
      physics.x + physics.size > chatBounds.left &&
      physics.x < chatBounds.right;
    if (!testOnly && (justEnteredChatFromTop || overlapsChat)) {
      const reactionSrc = image.src;
      explodeReaction(image, physics, `${physics.startedAt}-plinko`);
      startPlinkoDrop(crypto.randomUUID(), reactionSrc).catch((error) => {
        chatStatus.textContent = "Could not start the Plinko drop.";
        console.error("Unable to start a Music Bar Plinko drop:", error);
      });
      continue;
    }

    const pageWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    const maxX = Math.max(0, pageWidth - physics.size);
    if (physics.x <= 0 || physics.x >= maxX) {
      physics.x = Math.min(maxX, Math.max(0, physics.x));
      physics.velocityX *= -0.72;
      physics.angularVelocity += (physics.random() - 0.5) * 80;
    }
    if (physics.y <= 0 && physics.velocityY < 0) {
      physics.y = 0;
      physics.velocityY = Math.abs(physics.velocityY) * 0.72;
    }

    const hit = findReactionCollision(physics, image);
    if (hit) {
      const impactSpeed = Math.hypot(physics.velocityX, physics.velocityY);
      resolveReactionCollision(physics, hit);
      const stainCount = getImpactStainCount(impactSpeed, physics.random);
      if (stainCount > 0) {
        spawnReactionStains(
          physics.x + physics.size / 2,
          physics.y + physics.size / 2,
          physics.random,
          stainCount
        );
      }
    }

    const updatedPageHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    const updatedFloorY = Math.max(0, updatedPageHeight - physics.size);
    if (physics.y >= updatedFloorY && physics.velocityY >= 0) {
      physics.y = updatedFloorY;
      if (Math.abs(physics.velocityY) < 90) {
        physics.velocityY = 0;
        physics.grounded = true;
      } else {
        physics.velocityY = -physics.velocityY * 0.86;
        physics.velocityX *= 0.96;
        physics.angularVelocity += (physics.random() - 0.5) * 65;
      }
    }
  }

  resolveReactionBodyCollisions(bodies);

  for (const body of bodies) {
    const { image, physics } = body;
    if (!activeReactionBodies.has(image)) continue;
    image.style.opacity = "1";
    image.style.transform =
      `translate3d(${physics.x - window.scrollX}px, ${physics.y - window.scrollY}px, 0) rotate(${physics.rotation}deg)`;
    if (frameTime - physics.startedAt >= physics.lifetimeMs) {
      explodeReaction(image, physics, `${physics.startedAt}-exit`);
    }
  }

  requestReactionAnimation();
}

function resolveReactionBodyCollisions(bodies) {
  const restitution = 0.78;
  for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
    const firstBody = bodies[firstIndex];
    if (!activeReactionBodies.has(firstBody.image)) continue;
    const first = firstBody.physics;
    const firstRadius = first.size * 0.44;
    const firstCenterX = first.x + first.size / 2;
    const firstCenterY = first.y + first.size / 2;

    for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
      const secondBody = bodies[secondIndex];
      if (!activeReactionBodies.has(secondBody.image)) continue;
      const second = secondBody.physics;
      const secondRadius = second.size * 0.44;
      const dx = second.x + second.size / 2 - firstCenterX;
      const dy = second.y + second.size / 2 - firstCenterY;
      const distance = Math.hypot(dx, dy);
      const minimumDistance = firstRadius + secondRadius;
      if (distance >= minimumDistance) continue;

      const normalX = distance > 0 ? dx / distance : 1;
      const normalY = distance > 0 ? dy / distance : 0;
      const overlap = minimumDistance - distance;
      first.x -= normalX * overlap / 2;
      first.y -= normalY * overlap / 2;
      second.x += normalX * overlap / 2;
      second.y += normalY * overlap / 2;

      const relativeVelocityX = second.velocityX - first.velocityX;
      const relativeVelocityY = second.velocityY - first.velocityY;
      const relativeNormalSpeed = relativeVelocityX * normalX + relativeVelocityY * normalY;
      if (relativeNormalSpeed >= 0) continue;
      const impulse = -(1 + restitution) * relativeNormalSpeed / 2;
      first.velocityX -= impulse * normalX;
      first.velocityY -= impulse * normalY;
      second.velocityX += impulse * normalX;
      second.velocityY += impulse * normalY;
      first.grounded = false;
      second.grounded = false;
      first.angularVelocity += (first.random() - 0.5) * 80;
      second.angularVelocity += (second.random() - 0.5) * 80;
    }
  }
}

function findReactionCollision(physics, image) {
  const points = [
    [physics.x + physics.size / 2, physics.y + physics.size / 2],
    [physics.x + physics.size / 2, physics.y + physics.size - 2],
    [physics.x + physics.size / 2, physics.y + 2],
    [physics.x + 2, physics.y + physics.size / 2],
    [physics.x + physics.size - 2, physics.y + physics.size / 2],
  ];
  const now = performance.now();
  const hitTargets = new Set();

  for (const [x, y] of points) {
    const viewportX = x - window.scrollX;
    const viewportY = y - window.scrollY;
    if (viewportX < 0 || viewportY < 0 || viewportX >= window.innerWidth || viewportY >= window.innerHeight) continue;
    let target = document.elementFromPoint(viewportX, viewportY);
    while (target && target !== document.body && target !== document.documentElement) {
      if (
        target !== image &&
        !reactionLayer.contains(target) &&
        !target.closest(".music-chat-panel") &&
        !isTopChromeCollisionTarget(target) &&
        isReactionCollisionTarget(target) &&
        !(target === physics.lastHitTarget && now - physics.lastHitAt < 110)
      ) {
        hitTargets.add(target);
        break;
      }
      target = target.parentElement;
    }
  }

  for (const target of hitTargets) {
    const viewportRect = target.getBoundingClientRect();
    const rect = {
      left: viewportRect.left + window.scrollX,
      right: viewportRect.right + window.scrollX,
      top: viewportRect.top + window.scrollY,
      bottom: viewportRect.bottom + window.scrollY,
    };
    const overlapX = Math.min(physics.x + physics.size, rect.right) - Math.max(physics.x, rect.left);
    const overlapY = Math.min(physics.y + physics.size, rect.bottom) - Math.max(physics.y, rect.top);
    if (overlapX > 0 && overlapY > 0 && rect.top >= getReactionCollisionStartY()) {
      return { target, rect, overlapX, overlapY };
    }
  }
  return null;
}

function getReactionCollisionStartY() {
  return Math.max(window.innerHeight * 0.55, document.documentElement.scrollHeight * 0.55);
}

function isReactionCollisionTarget(element) {
  if (!(element instanceof HTMLElement)) return false;
  const tagName = element.tagName;
  if (
    !["A", "BUTTON", "IFRAME", "IMG", "INPUT", "SELECT", "TEXTAREA", "VIDEO", "FOOTER"].includes(tagName) &&
    !element.matches(".music-panel, .music-player-card, .music-connection-status, footer, .music-queue li")
  ) {
    return false;
  }
  return !element.hidden && getComputedStyle(element).visibility !== "hidden";
}

function isTopChromeCollisionTarget(element) {
  const excluded = element.closest(
    "header, nav, .music-owner-controls, .music-page > h1, .music-intro, .music-reaction-test, .music-reaction-test-toggle"
  );
  if (excluded) return true;
  const position = getComputedStyle(element).position;
  return position === "fixed" || position === "sticky";
}

function resolveReactionCollision(physics, hit) {
  physics.lastHitTarget = hit.target;
  physics.lastHitAt = performance.now();
  const restitution = 0.86;
  physics.grounded = false;
  if (hit.overlapX < hit.overlapY) {
    if (physics.previousX + physics.size <= hit.rect.left || physics.velocityX > 0 && physics.x < hit.rect.left) {
      physics.x = hit.rect.left - physics.size - 1;
    } else {
      physics.x = hit.rect.right + 1;
    }
    physics.velocityX *= -restitution;
    physics.velocityY *= 0.99;
  } else {
    if (physics.previousY + physics.size <= hit.rect.top || physics.velocityY > 0 && physics.y < hit.rect.top) {
      physics.y = hit.rect.top - physics.size - 1;
      physics.velocityY = -Math.abs(physics.velocityY) * restitution;
    } else {
      physics.y = hit.rect.bottom + 1;
      physics.velocityY = Math.abs(physics.velocityY) * restitution;
    }
    physics.velocityX *= 0.99;
  }
  physics.angularVelocity += (physics.random() - 0.5) * 100;
}

async function loadPlinkoState() {
  const { data, error } = await musicSupabase
    .from(musicPlinkoStateTable)
    .select("target_slot")
    .eq("id", true)
    .single();
  if (error) {
    throw error;
  }
  if (!data || !Number.isInteger(data.target_slot) || data.target_slot < 0 || data.target_slot >= plinkoSlotCount) {
    throw new Error("The shared Plinko target is missing or invalid.");
  }
  setCurrentPlinkoSlot(data.target_slot);
  plinkoStateReady = true;
}

function setCurrentPlinkoSlot(slotIndex) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= plinkoSlotCount) {
    console.error("Received an invalid shared Plinko target:", slotIndex);
    return;
  }
  currentPlinkoSlot = slotIndex;
  for (const board of chatMessages.querySelectorAll(".music-plinko-board")) {
    const slots = board.querySelectorAll(".music-plinko-slot");
    slots.forEach((slot, index) => {
      const isWinningSlot = index === currentPlinkoSlot;
      slot.classList.toggle("is-winning-slot", isWinningSlot);
      slot.textContent = isWinningSlot ? "WIN" : String(index + 1);
    });
  }
}

async function startPlinkoDrop(roundId, reactionSrc, testOnly = false) {
  if (
    !reactionSrc ||
    activePlinkoRounds.has(roundId) ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }
  if (!plinkoStateReady) {
    await loadPlinkoState();
  }

  const board = ensurePlinkoBoard();
  window.clearTimeout(board.closeTimer);
  board.closeTimer = null;
  board.element.classList.remove("is-fading");
  activePlinkoRounds.add(roundId);

  const random = createSeededRandom(roundId);
  const landingRandom = createSeededRandom(`${roundId}-landing`);
  const ballRadius = 13;
  const width = board.width;
  const height = board.height;
  const slotWidth = width / plinkoSlotCount;
  const ball = document.createElement("img");
  ball.className = "music-plinko-ball";
  ball.src = reactionSrc;
  ball.alt = "";
  ball.style.width = `${ballRadius * 2}px`;
  ball.style.height = `${ballRadius * 2}px`;
  board.playfield.append(ball);

  activePlinkoBalls.set(roundId, {
    roundId,
    element: ball,
    random,
    testOnly,
    targetSlot: currentPlinkoSlot,
    landingSlot: Math.floor(landingRandom() * plinkoSlotCount),
    x: width / 2,
    y: 12,
    velocityX: (random() - 0.5) * 160,
    velocityY: 40,
    gravity: 920,
    rotation: 0,
    angularVelocity: (random() - 0.5) * 400,
    radius: ballRadius,
    lastFrameAt: performance.now(),
    startedAt: performance.now(),
  });
  updatePlinkoBoardStatus();
  requestPlinkoAnimation();
}

function ensurePlinkoBoard() {
  if (activePlinkoBoard?.element.isConnected) return activePlinkoBoard;

  const board = document.createElement("section");
  board.className = "music-plinko-board";
  board.setAttribute("aria-label", "Live chat Plinko");
  const heading = document.createElement("strong");
  heading.className = "music-plinko-heading";
  heading.textContent = "CHAT PLINKO";
  const status = document.createElement("span");
  status.className = "music-plinko-status";
  const playfield = document.createElement("div");
  playfield.className = "music-plinko-playfield";
  const slots = document.createElement("div");
  slots.className = "music-plinko-slots";
  const width = chatMessages.clientWidth;
  const height = chatMessages.clientHeight;
  const pegLayout = createPlinkoPegs(width);
  for (const peg of pegLayout) {
    const pegElement = document.createElement("i");
    pegElement.className = "music-plinko-peg";
    pegElement.style.left = `${peg.x}px`;
    pegElement.style.top = `${peg.y}px`;
    playfield.append(pegElement);
  }
  for (let index = 0; index < plinkoSlotCount; index += 1) {
    const slot = document.createElement("span");
    slot.className = "music-plinko-slot";
    slots.append(slot);
  }
  const closeButton = document.createElement("button");
  closeButton.className = "music-plinko-close";
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Close Plinko");
  closeButton.addEventListener("click", closePlinkoBoard);
  board.append(heading, status, playfield, slots, closeButton);

  chatMessages.classList.add("is-plinko-open");
  document.body.classList.add("music-plinko-open");
  board.style.top = `${chatMessages.scrollTop}px`;
  board.style.width = `${chatMessages.clientWidth}px`;
  board.style.height = `${chatMessages.clientHeight}px`;
  chatMessages.append(board);

  activePlinkoBoard = {
    element: board,
    status,
    playfield,
    slots,
    pegs: pegLayout,
    width: chatMessages.clientWidth,
    height: chatMessages.clientHeight,
    closeTimer: null,
    pendingResults: 0,
  };
  setCurrentPlinkoSlot(currentPlinkoSlot);
  return activePlinkoBoard;
}

function updatePlinkoBoardStatus(message) {
  const board = activePlinkoBoard;
  if (!board?.element.isConnected) return;
  if (message) {
    board.status.textContent = message;
    return;
  }
  const ballCount = activePlinkoBalls.size;
  board.status.textContent = ballCount > 0
    ? `${ballCount} ${ballCount === 1 ? "reaction" : "reactions"} in play · Hole ${currentPlinkoSlot + 1} wins`
    : `Hole ${currentPlinkoSlot + 1} is the target.`;
}

function requestPlinkoAnimation() {
  if (plinkoAnimationPending || activePlinkoBalls.size === 0) return;
  plinkoAnimationPending = true;
  requestAnimationFrame(animatePlinkoBalls);
}

function animatePlinkoBalls(frameTime) {
  plinkoAnimationPending = false;
  const board = activePlinkoBoard;
  if (!board?.element.isConnected) {
    activePlinkoBalls.clear();
    activePlinkoRounds.clear();
    return;
  }

  const width = board.width;
  const height = board.height;
  const inset = 12;
  const fieldHeight = height - 74;
  const slotsTop = fieldHeight - 13 - 2;
  const slotWidth = width / plinkoSlotCount;
  const landedBalls = [];
  const balls = [...activePlinkoBalls.values()];

  for (const physics of balls) {
    const elapsed = Math.min((frameTime - physics.lastFrameAt) / 1000, 0.03);
    physics.lastFrameAt = frameTime;
    physics.velocityY += physics.gravity * elapsed;
    physics.x += physics.velocityX * elapsed;
    physics.y += physics.velocityY * elapsed;
    physics.rotation += physics.angularVelocity * elapsed;

    if (physics.x < inset + physics.radius || physics.x > width - inset - physics.radius) {
      physics.x = Math.min(width - inset - physics.radius, Math.max(inset + physics.radius, physics.x));
      physics.velocityX *= -0.72;
    }

    for (const peg of board.pegs) {
      if (peg.y < 0 || peg.y > fieldHeight) continue;
      const dx = physics.x - peg.x;
      const dy = physics.y - peg.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = physics.radius + peg.radius;
      if (distance >= minDistance || distance === 0) continue;
      const normalX = dx / distance;
      const normalY = dy / distance;
      const overlap = minDistance - distance;
      physics.x += normalX * overlap;
      physics.y += normalY * overlap;
      const normalSpeed = physics.velocityX * normalX + physics.velocityY * normalY;
      if (normalSpeed < 0) {
        physics.velocityX -= 1.52 * normalSpeed * normalX;
        physics.velocityY -= 1.52 * normalSpeed * normalY;
      }
      physics.velocityX += (physics.random() - 0.5) * 32;
      physics.angularVelocity += (physics.random() - 0.5) * 28;
    }

    if (physics.y > slotsTop - 48) {
      const landingX = (physics.landingSlot + 0.5) * slotWidth;
      physics.velocityX += (landingX - physics.x) * elapsed * 12;
    }
    if (physics.y >= slotsTop) {
      physics.y = slotsTop;
      physics.x = (physics.landingSlot + 0.5) * slotWidth;
      landedBalls.push(physics);
    } else if (frameTime - physics.startedAt > 8000) {
      landedBalls.push(physics);
    }
  }

  resolvePlinkoBallCollisions(balls);
  for (const physics of balls) {
    if (!activePlinkoBalls.has(physics.roundId)) continue;
    physics.element.style.transform =
      `translate3d(${physics.x - physics.radius}px, ${physics.y - physics.radius}px, 0) rotate(${physics.rotation}deg)`;
  }

  for (const physics of landedBalls) {
    activePlinkoBalls.delete(physics.roundId);
    finishPlinkoBall(physics);
  }
  updatePlinkoBoardStatus();
  if (activePlinkoBalls.size > 0) {
    requestPlinkoAnimation();
  } else if (board.pendingResults === 0) {
    schedulePlinkoBoardClose(board);
  }
}

function resolvePlinkoBallCollisions(balls) {
  for (let firstIndex = 0; firstIndex < balls.length; firstIndex += 1) {
    const first = balls[firstIndex];
    if (!activePlinkoBalls.has(first.roundId)) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < balls.length; secondIndex += 1) {
      const second = balls[secondIndex];
      if (!activePlinkoBalls.has(second.roundId)) continue;
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = first.radius + second.radius;
      if (distance >= minDistance) continue;
      const normalX = distance > 0 ? dx / distance : 1;
      const normalY = distance > 0 ? dy / distance : 0;
      const overlap = minDistance - distance;
      first.x -= normalX * overlap / 2;
      first.y -= normalY * overlap / 2;
      second.x += normalX * overlap / 2;
      second.y += normalY * overlap / 2;
      const relativeX = second.velocityX - first.velocityX;
      const relativeY = second.velocityY - first.velocityY;
      const normalSpeed = relativeX * normalX + relativeY * normalY;
      if (normalSpeed >= 0) continue;
      const impulse = -(1 + 0.78) * normalSpeed / 2;
      first.velocityX -= impulse * normalX;
      first.velocityY -= impulse * normalY;
      second.velocityX += impulse * normalX;
      second.velocityY += impulse * normalY;
    }
  }
}

async function finishPlinkoBall(physics) {
  const board = activePlinkoBoard;
  if (!board?.element.isConnected) {
    activePlinkoRounds.delete(physics.roundId);
    return;
  }
  const landedSlot = physics.landingSlot;
  const won = landedSlot === physics.targetSlot;
  board.pendingResults += 1;
  if (won && !physics.testOnly) {
    updatePlinkoBoardStatus("Target hit! Updating the shared hole...");
    try {
      const { data, error } = await musicSupabase.rpc("music_plinko_record_win", {
        p_round_id: physics.roundId,
        p_expected_slot: physics.targetSlot,
      });
      if (error) throw error;
      if (
        !data ||
        typeof data.won !== "boolean" ||
        !Number.isInteger(data.target_slot) ||
        data.target_slot < 0 ||
        data.target_slot >= plinkoSlotCount
      ) {
        throw new Error("The shared Plinko service returned an invalid result.");
      }
      setCurrentPlinkoSlot(data.target_slot);
      if (data.won) {
        board.element.classList.add("is-winner");
        launchPlinkoConfetti(board.element, board.width, board.height, physics.random);
      }
      updatePlinkoBoardStatus(data.won
        ? `Winner! Hole ${data.target_slot + 1} is the new target.`
        : `Another ball already won. Hole ${data.target_slot + 1} is now the target.`);
    } catch (error) {
      chatStatus.textContent = "Plinko could not save a win. Please try again.";
      updatePlinkoBoardStatus("Could not save the shared win. The target has not changed.");
      console.error("Unable to save shared Music Bar Plinko win:", error);
    }
  } else if (won) {
    board.element.classList.add("is-winner");
    launchPlinkoConfetti(board.element, board.width, board.height, physics.random);
    updatePlinkoBoardStatus(`Test win! Hole ${physics.targetSlot + 1} remains the target.`);
  } else {
    updatePlinkoBoardStatus(`Missed hole ${landedSlot + 1}. Hole ${currentPlinkoSlot + 1} stays the target.`);
  }

  activePlinkoRounds.delete(physics.roundId);
  board.pendingResults -= 1;
  if (activePlinkoBalls.size === 0 && board.pendingResults === 0) {
    schedulePlinkoBoardClose(board);
  }
}

function schedulePlinkoBoardClose(board) {
  window.clearTimeout(board.closeTimer);
  board.closeTimer = window.setTimeout(() => {
    if (activePlinkoBoard !== board || activePlinkoBalls.size > 0 || board.pendingResults > 0) return;
    closePlinkoBoard();
  }, 1800);
}

function closePlinkoBoard() {
  const board = activePlinkoBoard;
  if (!board) return;
  window.clearTimeout(board.closeTimer);
  for (const [roundId, physics] of activePlinkoBalls) {
    activePlinkoRounds.delete(roundId);
    physics.element.remove();
  }
  activePlinkoBalls.clear();
  board.element.remove();
  chatMessages.classList.remove("is-plinko-open");
  document.body.classList.remove("music-plinko-open");
  activePlinkoBoard = null;
}

function preventScrollWhilePlinkoOpen(event) {
  if (activePlinkoBoard) event.preventDefault();
}

window.addEventListener("wheel", preventScrollWhilePlinkoOpen, { passive: false });
window.addEventListener("touchmove", preventScrollWhilePlinkoOpen, { passive: false });

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activePlinkoBoard) closePlinkoBoard();
});

function createPlinkoPegs(width) {
  const pegs = [];
  const rows = 6;
  const columns = 8;
  const spacing = (width - 48) / (columns - 1);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const stagger = row % 2 ? spacing / 2 : 0;
      const x = 24 + column * spacing + stagger;
      if (x > width - 20) continue;
      pegs.push({ x, y: 42 + row * 35, radius: 4 });
    }
  }
  return pegs;
}

function launchPlinkoConfetti(board, width, height, random) {
  for (let index = 0; index < 36; index += 1) {
    const piece = document.createElement("i");
    piece.className = "music-plinko-confetti";
    piece.style.left = `${width / 2}px`;
    piece.style.top = `${height * 0.62}px`;
    piece.style.setProperty("--confetti-x", `${(random() - 0.5) * 300}px`);
    piece.style.setProperty("--confetti-y", `${-70 - random() * 220}px`);
    piece.style.setProperty("--confetti-spin", `${(random() - 0.5) * 900}deg`);
    piece.style.setProperty("--confetti-color", `hsl(${Math.floor(random() * 360)} 85% 55%)`);
    board.append(piece);
    window.setTimeout(() => fadeAndRemove(piece, 300), 1700);
  }
}

function renderChatMessage(message, animate = false, prepend = false) {
  const messageKey = message.client_id || message.id;
  if (renderedChatMessageIds.has(messageKey)) {
    return false;
  }
  renderedChatMessageIds.add(messageKey);
  const article = document.createElement("article");
  article.className = "music-chat-message";
  article.dataset.messageId = messageKey;
  const header = document.createElement("header");
  const name = document.createElement("strong");
  name.textContent = message.display_name;
  const time = document.createElement("time");
  time.dateTime = new Date(message.created_at).toISOString();
  time.textContent = formatChatTime(message.created_at);
  const body = document.createElement("p");
  body.textContent = message.body;
  header.append(name, time);
  article.append(header, body);
  if (prepend) {
    chatMessages.prepend(article);
  } else {
    chatMessages.append(article);
  }
  if (!prepend) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  if (animate) {
    launchChatReaction(messageKey, false, message.created_at);
  }
  return true;
}

async function loadChatHistory() {
  const { data, error } = await musicSupabase
    .from(musicChatTable)
    .select("id, client_id, display_name, body, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(chatHistoryLimit);
  if (error) {
    throw error;
  }
  chatMessages.replaceChildren();
  renderedChatMessageIds.clear();
  chatHistoryHasMore = data.length === chatHistoryLimit;
  oldestChatMessage = data.length > 0 ? data[data.length - 1] : null;
  for (const message of [...data].reverse()) {
    renderChatMessage(message);
  }
  chatHistoryStatus.textContent = chatHistoryHasMore
    ? "Scroll up in the chat to load older messages."
    : "You're at the beginning of chat history.";
}

async function loadOlderChatMessages() {
  if (chatHistoryLoading || !chatHistoryHasMore || !oldestChatMessage) {
    return;
  }
  chatHistoryLoading = true;
  chatHistoryStatus.textContent = "Loading older messages...";
  const previousHeight = chatMessages.scrollHeight;
  const previousTop = chatMessages.scrollTop;
  try {
    const { data, error } = await musicSupabase
      .from(musicChatTable)
      .select("id, client_id, display_name, body, created_at")
      .or(
        `created_at.lt.${oldestChatMessage.created_at},and(created_at.eq.${oldestChatMessage.created_at},id.lt.${oldestChatMessage.id})`
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(chatHistoryLimit);
    if (error) {
      throw error;
    }
    if (data.length === 0) {
      chatHistoryHasMore = false;
      chatHistoryStatus.textContent = "You're at the beginning of chat history.";
      return;
    }

    oldestChatMessage = data[data.length - 1];
    chatHistoryHasMore = data.length === chatHistoryLimit;
    for (const message of [...data].reverse()) {
      renderChatMessage(message, false, true);
    }
    chatMessages.scrollTop = previousTop + chatMessages.scrollHeight - previousHeight;
    chatHistoryStatus.textContent = chatHistoryHasMore
      ? "Scroll up in the chat to load older messages."
      : "You're at the beginning of chat history.";
  } catch (error) {
    chatHistoryStatus.textContent = "Could not load older messages. Scroll to the top to try again.";
    console.error("Unable to load older Music Bar chat messages:", error);
  } finally {
    chatHistoryLoading = false;
  }
}

async function loadAudienceCount() {
  const { data, error } = await musicSupabase.rpc("music_room_presence_count");
  if (error) {
    throw error;
  }
  if (livePresenceAvailable) {
    updateLivePresenceCount();
  } else {
    renderRoomCount(data);
  }
}

function renderRoomCount(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError("The Music Bar presence count must be a non-negative integer.");
  }

  const digits = String(value);
  const previousDigits = roomOdometer.querySelectorAll(".music-odometer-digit");
  if (previousDigits.length !== digits.length) {
    roomOdometer.replaceChildren();
    for (const digit of digits) {
      const digitWindow = document.createElement("span");
      const strip = document.createElement("span");
      digitWindow.className = "music-odometer-digit";
      strip.className = "music-odometer-strip";
      for (let number = 0; number <= 9; number += 1) {
        const cell = document.createElement("span");
        cell.textContent = String(number);
        strip.append(cell);
      }
      digitWindow.append(strip);
      roomOdometer.append(digitWindow);
    }
    requestAnimationFrame(() => {
      for (const [index, digit] of [...roomOdometer.children].entries()) {
        digit.firstElementChild.style.transform = `translateY(-${digits[index]}em)`;
      }
    });
  } else {
    for (const [index, digit] of [...roomOdometer.children].entries()) {
      digit.firstElementChild.style.transform = `translateY(-${digits[index]}em)`;
    }
  }

  roomOdometer.hidden = false;
  roomPeople.textContent = value === 1 ? "person" : "people";
  roomCount.setAttribute("aria-label", `Room: ${value} ${value === 1 ? "person" : "people"}`);
}

function setRoomCountUnavailable() {
  roomOdometer.hidden = true;
  roomPeople.textContent = "count unavailable";
  roomCount.setAttribute("aria-label", "Room count unavailable");
}

function updateLivePresenceCount() {
  if (!musicChannel) return;
  const count = Object.keys(musicChannel.presenceState()).length;
  renderRoomCount(count);
}

async function updateSkipStatus() {
  if (!currentTrack) {
    skipButton.disabled = true;
    skipButton.textContent = "Vote to skip";
    skipStatus.textContent = "";
    return;
  }
  const { data, error } = await musicSupabase.rpc("music_get_skip_status", {
    p_track_id: currentTrack.id,
    p_session_id: activeSessionId,
  });
  if (error) {
    throw error;
  }
  skipButton.disabled = false;
  skipButton.textContent = data.has_voted ? "Remove skip vote" : "Vote to skip";
  skipStatus.textContent = `${data.votes} of ${data.required} votes needed to skip (${data.audience} in the room).`;
}

async function refreshRoom() {
  if (roomRefreshRunning) {
    roomRefreshPending = true;
    return;
  }
  roomRefreshRunning = true;
  try {
    do {
      roomRefreshPending = false;
      const { data: state, error: stateError } = await musicSupabase
        .from(musicRoomStateTable)
        .select("current_track_id, started_at")
        .eq("id", true)
        .maybeSingle();
      if (stateError) {
        throw stateError;
      }

      let nextCurrent = null;
      if (state?.current_track_id) {
        const { data, error } = await musicSupabase
          .from(musicQueueTable)
          .select("id, title, video_id, status, requester_name, created_at")
          .eq("id", state.current_track_id)
          .maybeSingle();
        if (error) {
          throw error;
        }
        if (data) {
          nextCurrent = { ...data, started_at: state.started_at };
        }
      }

      const { data: queue, error: queueError } = await musicSupabase.rpc("music_get_queue", {
        p_session_id: activeSessionId,
      });
      if (queueError) {
        throw queueError;
      }

      const previousTrackId = currentTrack?.id || null;
      currentTrack = nextCurrent;
      if (currentTrack) {
        currentTitle.textContent = currentTrack.title;
        currentRequester.textContent = `Requested by ${currentTrack.requester_name || "Anonymous"}`;
        playerMessage.textContent = "The room is playing this YouTube video.";
        skipButton.disabled = false;
        requestYouTubeApi();
        if (currentTrack.id !== previousTrackId) {
          syncYouTubePlayer();
        }
      } else {
        currentTitle.textContent = "Nothing is playing";
        currentRequester.textContent = "";
        playerMessage.textContent = "Add a song to start the room.";
        skipButton.disabled = true;
        clearYouTubePlayer();
      }
      renderQueue(queue);
      await Promise.all([loadAudienceCount(), updateSkipStatus()]);
      connectionStatus.textContent = "Connected to the Music Bar.";

      if (!currentTrack && queue.length > 0) {
        const { error: startError } = await musicSupabase.rpc("music_start_next_track");
        if (startError) {
          throw startError;
        }
        roomRefreshPending = true;
      }
    } while (roomRefreshPending);
  } catch (error) {
    connectionStatus.textContent = "Could not connect to the Music Bar. Run the latest supabase-setup.sql and try again.";
    console.error("Unable to refresh the music room:", error);
  } finally {
    roomRefreshRunning = false;
  }
}

async function finishCurrentTrack(trackId) {
  try {
    const { error } = await musicSupabase.rpc("music_finish_track", { p_track_id: trackId });
    if (error) {
      throw error;
    }
    await refreshRoom();
  } catch (error) {
    console.error("Unable to advance after the song ended:", error);
    playerMessage.textContent = "The song ended, but the queue could not advance. Check the room connection.";
  }
}

async function startRoomHeartbeat() {
  const update = async () => {
    try {
      const { error } = await musicSupabase.rpc("music_room_heartbeat", { p_session_id: activeSessionId });
      if (error) {
        throw error;
      }
      await loadAudienceCount();
    } catch (error) {
      console.error("Unable to update Music Bar room presence:", error);
      setRoomCountUnavailable();
    }
  };
  await update();
  heartbeatTimer = window.setInterval(update, 15000);
}

async function subscribeToMusicRoom() {
  musicChannel = musicSupabase
    .channel("newport-music-room", { config: { presence: { key: activeSessionId } } })
    .on("presence", { event: "sync" }, updateLivePresenceCount)
    .on("presence", { event: "join" }, updateLivePresenceCount)
    .on("presence", { event: "leave" }, updateLivePresenceCount)
    .on("postgres_changes", { event: "*", schema: "public", table: musicRoomStateTable }, refreshRoom)
    .on("postgres_changes", { event: "*", schema: "public", table: musicQueueTable }, refreshRoom)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: musicPlinkoStateTable }, ({ new: state }) => {
      setCurrentPlinkoSlot(state.target_slot);
      plinkoStateReady = true;
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: musicChatTable }, ({ new: message }) => {
      renderChatMessage(message, true);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        connectionStatus.textContent = "Connected to the Music Bar.";
        musicChannel.track({ session_id: activeSessionId }).then((result) => {
          if (result !== "ok") {
            console.error("Unable to publish Music Bar live presence:", result);
            return;
          }
          livePresenceAvailable = true;
          updateLivePresenceCount();
        }).catch((error) => {
          console.error("Unable to publish Music Bar live presence:", error);
        });
        loadPlinkoState().catch((error) => {
          chatStatus.textContent = "Could not load the shared Plinko hole. Run the latest supabase-setup.sql and try again.";
          console.error("Unable to load shared Music Bar Plinko state:", error);
        });
        refreshRoom();
        loadChatHistory().catch((error) => {
          console.error("Unable to load Music Bar chat:", error);
          chatStatus.textContent = "Could not load the chat history.";
        });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        livePresenceAvailable = false;
        connectionStatus.textContent = "Live updates disconnected. Trying to reconnect...";
      }
    });
}

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = requestTitle.value.trim();
  const videoId = parseYouTubeVideoId(requestUrl.value);
  if (!videoId) {
    requestStatus.textContent = "Enter a valid YouTube video link.";
    return;
  }
  if (!title || title.length > 160) {
    requestStatus.textContent = "Enter a song title of 1 to 160 characters.";
    return;
  }

  requestSubmit.disabled = true;
  requestSubmit.textContent = "Adding...";
  requestStatus.textContent = "";
  let songAdded = false;
  try {
    const { error } = await musicSupabase.from(musicQueueTable).insert({
      title,
      video_id: videoId,
      requester_id: activeSessionId,
      requester_name: requestName.value.trim() || "Anonymous",
    });
    if (error) {
      throw error;
    }
    songAdded = true;
    requestForm.reset();
    requestStatus.textContent = "Added to the shared queue.";
    const { error: startError } = await musicSupabase.rpc("music_start_next_track");
    if (startError) {
      throw startError;
    }
    await refreshRoom();
  } catch (error) {
    requestStatus.textContent = songAdded
      ? "Song added to the queue, but the room could not update. It should appear when the connection returns."
      : error.message || "Could not add that song. Please try again.";
    console.error("Unable to add a song to the Music Bar queue:", error);
  } finally {
    requestSubmit.disabled = false;
    requestSubmit.textContent = "Add to queue";
  }
});

ownerToggle.addEventListener("click", () => {
  ownerForm.hidden = !ownerForm.hidden;
  if (!ownerForm.hidden) {
    ownerEmail.focus();
  }
});

ownerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  ownerStatus.textContent = "";
  const submit = ownerForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = "Signing in...";
  try {
    const { error: signInError } = await musicSupabase.auth.signInWithPassword({
      email: ownerEmail.value.trim(),
      password: ownerPassword.value,
    });
    if (signInError) {
      throw signInError;
    }
    const { data: isOwner, error: ownerError } = await musicSupabase.rpc("is_mailbox_owner");
    if (ownerError) {
      throw ownerError;
    }
    if (!isOwner) {
      await musicSupabase.auth.signOut();
      throw new Error("This account does not have Music Bar owner access.");
    }

    musicOwnerMode = true;
    ownerForm.hidden = true;
    ownerToggle.hidden = true;
    ownerSession.hidden = false;
    reactionTestToggle.hidden = false;
    reactionTestPanel.hidden = true;
    reactionTestToggle.setAttribute("aria-expanded", "false");
    clearQueueButton.hidden = false;
    ownerPassword.value = "";
    ownerStatus.textContent = "Owner mode enabled.";
    await refreshRoom();
  } catch (error) {
    ownerStatus.textContent = error.message || "Sign-in failed. Check the mailbox owner account.";
    console.error("Unable to sign into Music Bar owner mode:", error);
  } finally {
    submit.disabled = false;
    submit.textContent = "Sign in";
  }
});

ownerSignOut.addEventListener("click", async () => {
  ownerStatus.textContent = "";
  try {
    const { error } = await musicSupabase.auth.signOut();
    if (error) {
      throw error;
    }
    musicOwnerMode = false;
    ownerSession.hidden = true;
    ownerToggle.hidden = false;
    ownerForm.hidden = true;
    reactionTestToggle.hidden = true;
    reactionTestPanel.hidden = true;
    reactionTestToggle.setAttribute("aria-expanded", "false");
    clearQueueButton.hidden = true;
    await refreshRoom();
  } catch (error) {
    ownerStatus.textContent = "Sign-out failed. Please try again.";
    console.error("Unable to sign out of Music Bar owner mode:", error);
  }
});

reactionTestToggle.addEventListener("click", () => {
  if (!musicOwnerMode) return;
  reactionTestPanel.hidden = !reactionTestPanel.hidden;
  reactionTestToggle.setAttribute("aria-expanded", String(!reactionTestPanel.hidden));
});

reactionTestButton.addEventListener("click", () => {
  if (!musicOwnerMode) return;
  launchChatReaction(crypto.randomUUID(), true);
});

plinkoTestButton.addEventListener("click", () => {
  if (!musicOwnerMode) return;
  const roundId = crypto.randomUUID();
  const random = createSeededRandom(roundId);
  startPlinkoDrop(roundId, reactionImages[Math.floor(random() * reactionImages.length)], true).catch((error) => {
    chatStatus.textContent = "Could not start the Plinko test.";
    console.error("Unable to start a Music Bar Plinko test:", error);
  });
});

clearQueueButton.addEventListener("click", async () => {
  if (!musicOwnerMode || !window.confirm("Clear all upcoming songs from the Music Bar queue?")) {
    return;
  }
  clearQueueButton.disabled = true;
  ownerStatus.textContent = "Clearing the queue...";
  try {
    const { data: deletedCount, error } = await musicSupabase.rpc("music_clear_queue");
    if (error) {
      throw error;
    }
    ownerStatus.textContent = `Cleared ${deletedCount} queued ${deletedCount === 1 ? "song" : "songs"}.`;
    await refreshRoom();
  } catch (error) {
    ownerStatus.textContent = error.message || "Could not clear the queue.";
    console.error("Unable to clear Music Bar queue:", error);
  } finally {
    clearQueueButton.disabled = queueList.children.length === 0;
  }
});

skipButton.addEventListener("click", async () => {
  if (!currentTrack || skipInProgress) {
    return;
  }
  skipInProgress = true;
  skipButton.disabled = true;
  try {
    const { data, error } = await musicSupabase.rpc("music_vote_skip", {
      p_track_id: currentTrack.id,
      p_session_id: activeSessionId,
    });
    if (error) {
      throw error;
    }
    if (data.passed) {
      skipStatus.textContent = `Skip passed (${data.votes} of ${data.required}). Loading the next song...`;
    } else if (data.has_voted) {
      skipStatus.textContent = `${data.votes} of ${data.required} votes needed to skip (${data.audience} in the room).`;
    } else {
      skipStatus.textContent = "Your skip vote was removed.";
    }
    await refreshRoom();
  } catch (error) {
    skipStatus.textContent = "Could not record your vote. Please try again.";
    console.error("Unable to vote to skip the current song:", error);
  } finally {
    skipInProgress = false;
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = chatMessage.value.trim();
  const displayName = chatName.value.trim() || "Anonymous";
  if (!body) {
    chatStatus.textContent = "Write a message before sending.";
    return;
  }
  chatSubmit.disabled = true;
  chatSubmit.textContent = "Sending...";
  chatStatus.textContent = "";
  const clientId = crypto.randomUUID();
  try {
    const { error } = await musicSupabase.from(musicChatTable).insert({
      client_id: clientId,
      display_name: displayName,
      body,
    });
    if (error) {
      throw error;
    }
    chatMessage.value = "";
    renderChatMessage({
      id: clientId,
      client_id: clientId,
      display_name: displayName,
      body,
      created_at: new Date().toISOString(),
    }, true);
  } catch (error) {
    chatStatus.textContent = error.message || "Could not send your message. Please try again.";
    console.error("Unable to send Music Bar chat message:", error);
  } finally {
    chatSubmit.disabled = false;
    chatSubmit.textContent = "Send";
  }
});

chatMessages.addEventListener("scroll", () => {
  for (const board of chatMessages.querySelectorAll(".music-plinko-board")) {
    board.style.top = `${chatMessages.scrollTop}px`;
  }
  if (chatMessages.scrollTop <= 20) {
    loadOlderChatMessages();
  }
});

window.addEventListener("pagehide", () => {
  if (heartbeatTimer) {
    window.clearInterval(heartbeatTimer);
  }
  if (musicChannel) {
    musicSupabase.removeChannel(musicChannel);
  }
  if (musicSupabase && activeSessionId) {
    musicSupabase.rpc("music_room_leave", { p_session_id: activeSessionId });
  }
  window.clearInterval(audienceRefreshTimer);
});

async function initializeMusicBar() {
  try {
    musicSupabase = getMusicSupabase();
    activeSessionId = getSessionId();
    await startRoomHeartbeat();
    await subscribeToMusicRoom();
    await refreshRoom();
    audienceRefreshTimer = window.setInterval(() => {
      if (currentTrack && youtubePlayer?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING) {
        syncYouTubePlayer();
      }
    }, 15000);
  } catch (error) {
    connectionStatus.textContent = error.message || "Could not connect to the Music Bar.";
    console.error("Unable to initialize the Music Bar:", error);
  }
}

initializeMusicBar();
