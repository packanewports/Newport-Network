const hammerPhrase = "packa";
const hammerSound = new Audio("audio/kaboom.mp3");
let hammerKeyBuffer = "";
let hammerModeActive = false;

const hammerCursor = document.createElement("img");
hammerCursor.className = "hammer-mode-cursor";
hammerCursor.setAttribute("aria-hidden", "true");
hammerCursor.src = "img/hammer.png";
hammerCursor.alt = "";
hammerCursor.hidden = true;

const hammerStatus = document.createElement("div");
hammerStatus.className = "hammer-mode-status";
hammerStatus.setAttribute("role", "status");
hammerStatus.setAttribute("aria-live", "polite");
hammerStatus.textContent = "Hammer time! Press Escape to exit.";
hammerStatus.hidden = true;
document.body.append(hammerCursor, hammerStatus);

function activateHammerMode() {
  hammerModeActive = true;
  hammerKeyBuffer = "";
  document.body.classList.add("hammer-mode-active");
  hammerStatus.hidden = false;
}

function deactivateHammerMode() {
  hammerModeActive = false;
  hammerKeyBuffer = "";
  document.body.classList.remove("hammer-mode-active");
  hammerCursor.hidden = true;
  hammerStatus.hidden = true;
}

window.deactivateHammerMode = deactivateHammerMode;

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && hammerModeActive) {
    deactivateHammerMode();
    return;
  }

  if (
    hammerModeActive ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.key.length !== 1 ||
    !/[a-z]/i.test(event.key) ||
    event.target instanceof HTMLElement &&
      event.target.closest("input, textarea, select, [contenteditable='true']")
  ) {
    return;
  }

  hammerKeyBuffer = `${hammerKeyBuffer}${event.key.toLowerCase()}`.slice(-hammerPhrase.length);
  if (hammerKeyBuffer === hammerPhrase) {
    activateHammerMode();
  }
});

document.addEventListener("pointermove", (event) => {
  if (!hammerModeActive || event.pointerType === "touch") {
    return;
  }

  hammerCursor.hidden = false;
  hammerCursor.style.left = `${event.clientX}px`;
  hammerCursor.style.top = `${event.clientY}px`;
});

function explodeElement(element) {
  if (element.classList.contains("hammer-mode-destroyed")) {
    return false;
  }

  const bounds = element.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) {
    return false;
  }

  const burst = document.createElement("img");
  burst.className = "hammer-mode-burst";
  burst.setAttribute("aria-hidden", "true");
  burst.src = "img/explosion.gif";
  burst.alt = "";
  const size = Math.max(bounds.width, bounds.height);
  burst.style.left = `${bounds.left + (bounds.width - size) / 2}px`;
  burst.style.top = `${bounds.top + (bounds.height - size) / 2}px`;
  burst.style.width = `${size}px`;
  burst.style.height = `${size}px`;
  element.classList.add("hammer-mode-destroyed");
  document.body.append(burst);

  window.setTimeout(() => burst.remove(), 1000);
  return true;
}

function playHammerSound() {
  const sound = hammerSound.cloneNode();
  sound.currentTime = 0;
  sound.play().catch((error) => {
    console.warn("Unable to play the hammer sound:", error);
  });
}

document.addEventListener(
  "click",
  (event) => {
    if (!hammerModeActive || !(event.target instanceof Element)) {
      return;
    }

    const target = event.target;
    const button = target.closest("button, input[type='button'], input[type='submit']");
    if (button) {
      if (button.matches("#write-button, #draw-button")) {
        deactivateHammerMode();
      }
      return;
    }

    const formElement = target.closest(
      "form, input, textarea, select, option, label, [contenteditable='true']"
    );
    if (formElement) {
      deactivateHammerMode();
      return;
    }

    const link = target.closest("a[href]");
    if (link) {
      event.preventDefault();
    }

    const element = link || target.closest(
      "img, svg, h1, h2, h3, h4, h5, h6, p, li, figure, figcaption, article, section, nav, header, footer, main, div, span"
    );
    if (!element || element === document.body || element === document.documentElement) {
      return;
    }

    event.preventDefault();
    if (explodeElement(element)) {
      playHammerSound();
    }
  },
  true
);

document.addEventListener("focusin", (event) => {
  if (
    hammerModeActive &&
    event.target instanceof Element &&
    event.target.closest("input, textarea, select, [contenteditable='true']")
  ) {
    deactivateHammerMode();
  }
});

window.addEventListener("pagehide", deactivateHammerMode);
