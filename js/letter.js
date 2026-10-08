const imageBucket = "letter-images";
const maxImageBytes = 5 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const letterStage = document.querySelector("#letter-stage");
const letterChoices = document.querySelector("#letter-choices");
const letterForm = document.querySelector("#letter-form");
const senderName = document.querySelector("#sender-name");
const letterImage = document.querySelector("#letter-image");
const attachmentDetails = document.querySelector("#attachment-details");
const removeAttachmentButton = document.querySelector("#remove-attachment-button");
const letterMessage = document.querySelector("#letter-message");
const sendButton = document.querySelector("#send-button");
const letterFeedback = document.querySelector("#letter-feedback");
const drawingForm = document.querySelector("#drawing-form");
const drawingSenderName = document.querySelector("#drawing-sender-name");
const drawingFeedback = document.querySelector("#drawing-feedback");
const drawingCanvas = document.querySelector("#drawing-canvas");
const drawingContext = drawingCanvas.getContext("2d", { willReadFrequently: true });
const drawingPaperImage = document.querySelector(".drawing-paper > img");
const drawingHandCursor = document.querySelector("#drawing-hand-cursor");
const brushPreview = document.querySelector("#brush-preview");
const drawingCursorMarker = document.querySelector("#drawing-cursor-marker");
const drawingColor = document.querySelector("#drawing-color");
const drawingSize = document.querySelector("#drawing-size");
const drawingSizeValue = document.querySelector("#drawing-size-value");
const pencilTool = document.querySelector("#pencil-tool");
const eraserTool = document.querySelector("#eraser-tool");
const bucketTool = document.querySelector("#bucket-tool");
const lineTool = document.querySelector("#line-tool");
const circleTool = document.querySelector("#circle-tool");
const squareTool = document.querySelector("#square-tool");
const undoDrawingButton = document.querySelector("#undo-drawing");
const redoDrawingButton = document.querySelector("#redo-drawing");
const clearDrawingButton = document.querySelector("#clear-drawing");
const sendDrawingButton = document.querySelector("#send-drawing");
const letterSent = document.querySelector("#letter-sent");
const sentEnvelope = document.querySelector("#sent-envelope");
const sentStamp = document.querySelector("#sent-stamp");
const writeAnotherButton = document.querySelector("#write-another-button");
const nameAdjectives = ["Curious", "Sleepy", "Moonlit", "Lucky", "Cosmic", "Gentle", "Mossy", "Jolly"];
const nameNouns = ["Raccoon", "Pigeon", "Comet", "Mushroom", "Fox", "Frog", "Moth", "Badger"];
const creativeSound = new Audio("audio/creative.mp3");
const scribbleSound = new Audio("audio/scribble.mp3");
const eraseSound = new Audio("audio/erase.mp3");
const splatSound = new Audio("audio/splat.mp3");
const letterUpSound = new Audio("audio/up.mp3");
const letterDownSound = new Audio("audio/down.mp3");
const stampSound = new Audio("audio/stamp.mp3");
const drawingActions = [];
let activeStroke = null;
let selectedDrawingTool = "pencil";
let historyIndex = 0;

creativeSound.loop = true;
creativeSound.volume = 0.7;
scribbleSound.loop = true;
eraseSound.loop = true;
for (const sound of [
  creativeSound,
  scribbleSound,
  eraseSound,
  splatSound,
  letterUpSound,
  letterDownSound,
  stampSound,
]) {
  sound.preload = "auto";
}

drawingCanvas.width = 1200;
drawingCanvas.height = 1200;

function validateLetter() {
  const hasMessage = letterMessage.value.trim().length > 0;
  const fitsOnPaper = letterMessage.scrollHeight <= letterMessage.clientHeight + 1;
  sendButton.disabled = !hasMessage || !fitsOnPaper;
  letterFeedback.textContent = fitsOnPaper
    ? ""
    : "That is more than fits on this page. Please shorten your letter.";
}

function setLetterOverlayVisible(form, focusTarget) {
  letterStage.classList.add("is-writing");
  letterChoices.hidden = true;
  form.hidden = false;
  form.classList.remove("is-leaving");
  window.setTimeout(() => {
    form.classList.add("is-visible");
    letterStage.scrollTop = 0;
    form.scrollTop = 0;
    focusTarget.focus({ preventScroll: true });
  }, 20);
}

function showWritingForm() {
  playSoundEffect(letterUpSound);
  setLetterOverlayVisible(letterForm, letterMessage);
  window.setTimeout(validateLetter, 30);
}

function showDrawingForm() {
  playSoundEffect(letterUpSound);
  setLetterOverlayVisible(drawingForm, pencilTool);
  playDrawingSound(creativeSound);
}

function showChoices() {
  stopDrawingSounds();
  letterStage.classList.remove("is-writing");
  letterForm.classList.remove("is-visible", "is-leaving");
  drawingForm.classList.remove("is-visible", "is-leaving");
  letterForm.hidden = true;
  drawingForm.hidden = true;
  letterChoices.hidden = false;
  letterMessage.value = "";
  senderName.value = "";
  letterImage.value = "";
  attachmentDetails.textContent = "Optional · JPG, PNG, WebP, or GIF · up to 5 MB";
  removeAttachmentButton.hidden = true;
  letterFeedback.textContent = "";
  sendButton.textContent = "Send letter";
  drawingFeedback.textContent = "";
  sendDrawingButton.textContent = "Send drawing";
  drawingSenderName.value = "";
  drawingActions.length = 0;
  historyIndex = 0;
  activeStroke = null;
  redrawDrawing();
  updateDrawingControls();
  sendButton.disabled = true;
}

function selectRandomName(input) {
  const adjective = nameAdjectives[Math.floor(Math.random() * nameAdjectives.length)];
  const noun = nameNouns[Math.floor(Math.random() * nameNouns.length)];
  input.value = `${adjective} ${noun}`;
}

function getImageExtension(file) {
  const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  return extensions[file.type];
}

function hasCurrentDrawing() {
  let lastClearIndex = -1;
  for (let index = 0; index < historyIndex; index += 1) {
    if (drawingActions[index].type === "clear") {
      lastClearIndex = index;
    }
  }

  return drawingActions
    .slice(lastClearIndex + 1, historyIndex)
    .some((action) => action.type !== "clear");
}

function updateDrawingControls() {
  const hasDrawing = hasCurrentDrawing();
  undoDrawingButton.disabled = historyIndex === 0;
  redoDrawingButton.disabled = historyIndex >= drawingActions.length;
  clearDrawingButton.disabled = !hasDrawing;
  sendDrawingButton.disabled = !hasDrawing;
  drawingSizeValue.value = `${drawingSize.value} px`;
  drawingSizeValue.textContent = `${drawingSize.value} px`;
}

function drawStroke(context, stroke) {
  if (stroke.points.length === 0) {
    return;
  }

  context.save();
  context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (stroke.type === "circle") {
    const [start, end = start] = stroke.points;
    const diameter = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
    const circleEndX = start.x + Math.sign(end.x - start.x || 1) * diameter;
    const circleEndY = start.y + Math.sign(end.y - start.y || 1) * diameter;
    const centerX = (start.x + circleEndX) / 2;
    const centerY = (start.y + circleEndY) / 2;
    const radius = diameter / 2;
    context.beginPath();
    context.arc(centerX, centerY, Math.max(radius, stroke.width / 2), 0, Math.PI * 2);
    context.stroke();
  } else if (stroke.type === "square") {
    const [start, end = start] = stroke.points;
    const side = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
    const x = end.x < start.x ? start.x - side : start.x;
    const y = end.y < start.y ? start.y - side : start.y;
    context.strokeRect(x, y, side, side);
  } else if (stroke.type === "line" || stroke.straight) {
    const points = stroke.points;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    context.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    context.stroke();
  } else if (stroke.points.length > 1) {
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (const point of stroke.points.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    context.stroke();
  } else {
    const [point] = stroke.points;
    context.beginPath();
    context.arc(point.x, point.y, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function matchesFillColor(data, pixelIndex, target) {
  const alpha = data[pixelIndex + 3];
  if (target[3] < 16) {
    return alpha < 16;
  }

  return (
    alpha >= 16 &&
    Math.abs(data[pixelIndex] - target[0]) <= 24 &&
    Math.abs(data[pixelIndex + 1] - target[1]) <= 24 &&
    Math.abs(data[pixelIndex + 2] - target[2]) <= 24 &&
    Math.abs(alpha - target[3]) <= 32
  );
}

function applyBucketFill(context, action) {
  const image = context.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);
  const { data } = image;
  const startX = Math.floor(action.point.x);
  const startY = Math.floor(action.point.y);

  if (
    startX < 0 ||
    startY < 0 ||
    startX >= drawingCanvas.width ||
    startY >= drawingCanvas.height
  ) {
    return;
  }

  const startIndex = (startY * drawingCanvas.width + startX) * 4;
  const target = Array.from(data.slice(startIndex, startIndex + 4));
  const fill = action.color.match(/[a-f\d]{2}/gi).map((channel) => parseInt(channel, 16));

  if (matchesFillColor(data, startIndex, fill.concat(255))) {
    return;
  }

  const stack = [[startX, startY]];
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    let currentX = x;
    let pixelIndex = (y * drawingCanvas.width + currentX) * 4;

    while (currentX >= 0 && matchesFillColor(data, pixelIndex, target)) {
      currentX -= 1;
      pixelIndex -= 4;
    }

    currentX += 1;
    pixelIndex += 4;
    let scanAbove = false;
    let scanBelow = false;

    while (currentX < drawingCanvas.width && matchesFillColor(data, pixelIndex, target)) {
      data[pixelIndex] = fill[0];
      data[pixelIndex + 1] = fill[1];
      data[pixelIndex + 2] = fill[2];
      data[pixelIndex + 3] = 255;

      if (y > 0) {
        const aboveIndex = pixelIndex - drawingCanvas.width * 4;
        if (matchesFillColor(data, aboveIndex, target)) {
          if (!scanAbove) {
            stack.push([currentX, y - 1]);
            scanAbove = true;
          }
        } else {
          scanAbove = false;
        }
      }

      if (y < drawingCanvas.height - 1) {
        const belowIndex = pixelIndex + drawingCanvas.width * 4;
        if (matchesFillColor(data, belowIndex, target)) {
          if (!scanBelow) {
            stack.push([currentX, y + 1]);
            scanBelow = true;
          }
        } else {
          scanBelow = false;
        }
      }

      currentX += 1;
      pixelIndex += 4;
    }
  }

  context.putImageData(image, 0, 0);
}

function applyDrawingAction(context, action) {
  if (action.type === "clear") {
    context.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  } else if (action.type === "bucket") {
    applyBucketFill(context, action);
  } else {
    drawStroke(context, action);
  }
}

function recordDrawingAction(action) {
  drawingActions.splice(historyIndex);
  drawingActions.push(action);
  historyIndex += 1;
  redrawDrawing();
  updateDrawingControls();
}

function redrawDrawing() {
  drawingContext.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  for (const action of drawingActions.slice(0, historyIndex)) {
    applyDrawingAction(drawingContext, action);
  }
  if (activeStroke) {
    drawStroke(drawingContext, activeStroke);
  }
}

function getCanvasPoint(event) {
  const bounds = drawingCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * drawingCanvas.width,
    y: ((event.clientY - bounds.top) / bounds.height) * drawingCanvas.height,
  };
}

function updateHandCursor(event) {
  const bounds = drawingCanvas.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  const isBrushTool = selectedDrawingTool === "pencil" || selectedDrawingTool === "eraser";
  brushPreview.hidden = false;
  drawingHandCursor.hidden = false;

  if (isBrushTool) {
    const diameter = Number(drawingSize.value);
    brushPreview.style.width = `${diameter}px`;
    brushPreview.style.height = `${diameter}px`;
    brushPreview.style.left = `${x - diameter / 2}px`;
    brushPreview.style.top = `${y - diameter / 2}px`;
    drawingCursorMarker.hidden = true;
  } else {
    brushPreview.style.width = "8px";
    brushPreview.style.height = "8px";
    brushPreview.style.left = `${x - 4}px`;
    brushPreview.style.top = `${y - 4}px`;
    drawingCursorMarker.hidden = selectedDrawingTool !== "bucket";
    drawingCursorMarker.style.left = `${x - 4}px`;
    drawingCursorMarker.style.top = `${y - 4}px`;
  }

  drawingHandCursor.style.left = `${x - 14}px`;
  drawingHandCursor.style.top = `${y - 16}px`;
  drawingHandCursor.style.width = "48px";
}

function selectDrawingTool(tool) {
  selectedDrawingTool = tool;
  const toolButtons = {
    pencil: pencilTool,
    eraser: eraserTool,
    bucket: bucketTool,
    line: lineTool,
    circle: circleTool,
    square: squareTool,
  };

  for (const [name, button] of Object.entries(toolButtons)) {
    const isSelected = name === tool;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  }

  drawingCanvas.classList.toggle("is-erasing", tool === "eraser");
  drawingHandCursor.hidden = true;
  brushPreview.hidden = true;
  drawingCursorMarker.hidden = true;
}

function playDrawingSound(sound) {
  const playback = sound.play();
  if (playback) {
    playback.catch((error) => {
      if (error.name === "AbortError" && sound.paused) {
        return;
      }

      if (!drawingForm.hidden) {
        drawingFeedback.textContent = "A drawing sound could not play. You can still draw and send your picture.";
      }
      console.error("Unable to play drawing sound:", error);
    });
  }
}

function stopDrawingSound(sound) {
  sound.pause();
  sound.currentTime = 0;
}

function stopDrawingSounds() {
  for (const sound of [creativeSound, scribbleSound, eraseSound, splatSound]) {
    stopDrawingSound(sound);
  }
}

function playSoundEffect(sound) {
  sound.pause();
  sound.currentTime = 0;
  const playback = sound.play();
  if (playback) {
    playback.catch((error) => {
      if (error.name === "AbortError" && sound.paused) {
        return;
      }
      console.error("Unable to play letter animation sound:", error);
    });
  }
}

function startStrokeSound() {
  if (selectedDrawingTool === "eraser") {
    stopDrawingSound(scribbleSound);
    playDrawingSound(eraseSound);
  } else {
    stopDrawingSound(eraseSound);
    playDrawingSound(scribbleSound);
  }
}

function exportDrawing() {
  return new Promise((resolve, reject) => {
    if (!drawingPaperImage.complete || drawingPaperImage.naturalWidth === 0) {
      reject(new Error("The drawing paper texture could not be loaded."));
      return;
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = drawingCanvas.width;
    exportCanvas.height = drawingCanvas.height;
    const exportContext = exportCanvas.getContext("2d");

    if (!exportContext) {
      reject(new Error("Could not prepare the drawing image."));
      return;
    }

    exportContext.drawImage(drawingPaperImage, 0, 0, exportCanvas.width, exportCanvas.height);
    exportContext.drawImage(drawingCanvas, 0, 0);
    exportCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not export the drawing."));
          return;
        }

        resolve(new File([blob], "letter-drawing.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.82
    );
  });
}

async function sendLetter({ name, message, image }) {
  const supabase = window.supabaseClient;

  if (!supabase) {
    throw new Error("The letter service is unavailable. Please refresh and try again.");
  }

  if (image && (!allowedImageTypes.has(image.type) || image.size > maxImageBytes)) {
    throw new Error("Choose one JPG, PNG, WebP, or GIF image up to 5 MB.");
  }

  let imagePath = null;

  try {
    if (image) {
      const imagePathWithExtension = `${crypto.randomUUID()}.${getImageExtension(image)}`;
      const { error: uploadError } = await supabase.storage
        .from(imageBucket)
        .upload(imagePathWithExtension, image, {
          cacheControl: "3600",
          contentType: image.type,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      imagePath = imagePathWithExtension;
    }

    const { error: insertError } = await supabase.from("letters").insert({
      sender_name: name.trim() || "Anonymous",
      message,
      image_path: imagePath,
    });

    if (insertError) {
      throw insertError;
    }
  } catch (error) {
    if (imagePath) {
      const { error: cleanupError } = await supabase.storage
        .from(imageBucket)
        .remove([imagePath]);

      if (cleanupError) {
        console.error("Unable to remove the unattached drawing image:", cleanupError);
      }
    }

    throw error;
  }
}

function showSentEnvelope() {
  stopDrawingSounds();
  letterForm.classList.remove("is-visible");
  drawingForm.classList.remove("is-visible");
  letterForm.classList.add("is-leaving");
  drawingForm.classList.add("is-leaving");

  window.setTimeout(() => {
    letterForm.hidden = true;
    drawingForm.hidden = true;
    letterSent.hidden = false;
    playSoundEffect(letterDownSound);
    window.setTimeout(() => letterSent.classList.add("is-visible"), 20);

    window.setTimeout(() => {
      sentEnvelope.src = "img/closed.png";
      sentEnvelope.alt = "Your letter is sealed in an envelope";
      writeAnotherButton.hidden = false;

      window.setTimeout(() => {
        sentStamp.hidden = false;
        playSoundEffect(stampSound);
        window.setTimeout(() => sentStamp.classList.add("is-visible"), 20);
      }, 1000);
    }, 1800);
  }, 650);
}

document.querySelector("#write-button").addEventListener("click", showWritingForm);
document.querySelector("#draw-button").addEventListener("click", showDrawingForm);
document.querySelector("#cancel-button").addEventListener("click", showChoices);
document.querySelector("#cancel-drawing").addEventListener("click", showChoices);
document.querySelector("#random-name-button").addEventListener("click", () => {
  selectRandomName(senderName);
});
document.querySelector("#drawing-random-name").addEventListener("click", () => {
  selectRandomName(drawingSenderName);
});
letterMessage.addEventListener("input", validateLetter);

letterImage.addEventListener("change", () => {
  const file = letterImage.files[0];

  if (!file) {
    attachmentDetails.textContent = "Optional · JPG, PNG, WebP, or GIF · up to 5 MB";
    removeAttachmentButton.hidden = true;
    return;
  }

  if (!allowedImageTypes.has(file.type)) {
    letterImage.value = "";
    letterFeedback.textContent = "Choose a JPG, PNG, WebP, or GIF image.";
    removeAttachmentButton.hidden = true;
    return;
  }

  if (file.size > maxImageBytes) {
    letterImage.value = "";
    letterFeedback.textContent = "That image is too large. The maximum size is 5 MB.";
    removeAttachmentButton.hidden = true;
    return;
  }

  attachmentDetails.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  removeAttachmentButton.hidden = false;
  letterFeedback.textContent = "";
});

removeAttachmentButton.addEventListener("click", () => {
  letterImage.value = "";
  attachmentDetails.textContent = "Optional · JPG, PNG, WebP, or GIF · up to 5 MB";
  removeAttachmentButton.hidden = true;
});

letterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  validateLetter();

  if (sendButton.disabled) {
    return;
  }

  sendButton.disabled = true;
  letterFeedback.textContent = "Sending your letter...";
  sendButton.textContent = "Sending...";

  try {
    await sendLetter({
      name: senderName.value,
      message: letterMessage.value.trim(),
      image: letterImage.files[0],
    });
  } catch (error) {
    console.error("Unable to send letter:", error);
    validateLetter();
    letterFeedback.textContent = error.message || "Your letter could not be sent. Please try again.";
    sendButton.textContent = "Send letter";
    return;
  }

  letterFeedback.textContent = "";
  showSentEnvelope();
});

drawingCanvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 && event.pointerType === "mouse") {
    return;
  }

  event.preventDefault();
  const point = getCanvasPoint(event);
  updateHandCursor(event);

  if (selectedDrawingTool === "bucket") {
    stopDrawingSound(scribbleSound);
    stopDrawingSound(eraseSound);
    stopDrawingSound(splatSound);
    playDrawingSound(splatSound);
    recordDrawingAction({
      type: "bucket",
      color: drawingColor.value,
      point,
    });
    return;
  }

  const shapeType = ["line", "circle", "square"].includes(selectedDrawingTool)
    ? selectedDrawingTool
    : "stroke";
  activeStroke = {
    type: shapeType,
    tool: selectedDrawingTool,
    color: drawingColor.value,
    width: Number(drawingSize.value) * (drawingCanvas.width / drawingCanvas.clientWidth),
    points: [point],
  };
  startStrokeSound();
  drawingCanvas.setPointerCapture(event.pointerId);
  redrawDrawing();
  updateHandCursor(event);
});

drawingCanvas.addEventListener("pointermove", (event) => {
  updateHandCursor(event);

  if (!activeStroke) {
    return;
  }

  event.preventDefault();
  const point = getCanvasPoint(event);

  if (activeStroke.type !== "stroke") {
    activeStroke.points = [activeStroke.points[0], point];
    redrawDrawing();
    return;
  }

  if (event.shiftKey) {
    activeStroke.straight = true;
    activeStroke.points = [activeStroke.points[0], point];
    redrawDrawing();
    return;
  }

  if (activeStroke.straight) {
    activeStroke.straight = false;
    activeStroke.points = [activeStroke.points[0], point];
  } else {
    activeStroke.points.push(point);
  }
  drawStroke(drawingContext, {
    ...activeStroke,
    points: activeStroke.points.slice(-2),
  });
});

function endDrawingStroke(event) {
  if (activeStroke) {
    const finishedStroke = activeStroke;
    activeStroke = null;
    if (drawingCanvas.hasPointerCapture(event.pointerId)) {
      drawingCanvas.releasePointerCapture(event.pointerId);
    }
    recordDrawingAction(finishedStroke);
  }
  stopDrawingSound(scribbleSound);
  stopDrawingSound(eraseSound);
}

drawingCanvas.addEventListener("pointerup", endDrawingStroke);
drawingCanvas.addEventListener("pointercancel", endDrawingStroke);
drawingCanvas.addEventListener("lostpointercapture", endDrawingStroke);
drawingCanvas.addEventListener("pointerleave", () => {
  if (!activeStroke) {
    drawingHandCursor.hidden = true;
    brushPreview.hidden = true;
    drawingCursorMarker.hidden = true;
  }
});

pencilTool.addEventListener("click", () => selectDrawingTool("pencil"));
eraserTool.addEventListener("click", () => selectDrawingTool("eraser"));
bucketTool.addEventListener("click", () => selectDrawingTool("bucket"));
lineTool.addEventListener("click", () => selectDrawingTool("line"));
circleTool.addEventListener("click", () => selectDrawingTool("circle"));
squareTool.addEventListener("click", () => selectDrawingTool("square"));
undoDrawingButton.addEventListener("click", () => {
  if (historyIndex === 0) {
    return;
  }

  historyIndex -= 1;
  redrawDrawing();
  updateDrawingControls();
});
redoDrawingButton.addEventListener("click", () => {
  if (historyIndex >= drawingActions.length) {
    return;
  }

  historyIndex += 1;
  redrawDrawing();
  updateDrawingControls();
});
clearDrawingButton.addEventListener("click", () => {
  if (clearDrawingButton.disabled) {
    return;
  }

  recordDrawingAction({ type: "clear" });
});
drawingSize.addEventListener("input", updateDrawingControls);
drawingSize.addEventListener("input", (event) => {
  if (!brushPreview.hidden) {
    const bounds = drawingCanvas.getBoundingClientRect();
    updateHandCursor({
      clientX: bounds.left + parseFloat(brushPreview.style.left) + Number(event.target.value) / 2,
      clientY: bounds.top + parseFloat(brushPreview.style.top) + Number(event.target.value) / 2,
    });
  }
});
drawingColor.addEventListener("input", () => {
  if (selectedDrawingTool === "pencil" || selectedDrawingTool === "eraser") {
    brushPreview.style.borderColor = drawingColor.value;
  }
});

drawingForm.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return;
  }

  const target = event.target;
  if (
    target instanceof HTMLElement &&
    target.closest("input, textarea, select, [contenteditable='true']")
  ) {
    return;
  }

  if (event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redoDrawingButton.click();
    } else {
      undoDrawingButton.click();
    }
  } else if (event.key.toLowerCase() === "y") {
    event.preventDefault();
    redoDrawingButton.click();
  }
});

drawingForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!hasCurrentDrawing() || sendDrawingButton.disabled) {
    return;
  }

  sendDrawingButton.disabled = true;
  sendDrawingButton.textContent = "Preparing...";
  drawingFeedback.textContent = "Preparing your drawing...";

  try {
    const drawing = await exportDrawing();
    if (drawing.size > maxImageBytes) {
      throw new Error("This drawing is too large to send. Please try a simpler picture.");
    }

    drawingFeedback.textContent = "Sending your drawing...";
    sendDrawingButton.textContent = "Sending...";
    await sendLetter({
      name: drawingSenderName.value,
      message: "A drawing",
      image: drawing,
    });
  } catch (error) {
    drawingFeedback.textContent =
      error.message || "Your drawing could not be sent. Please try again.";
    console.error("Unable to send drawing:", error);
    updateDrawingControls();
    sendDrawingButton.textContent = "Send drawing";
    return;
  }

  drawingFeedback.textContent = "";
  showSentEnvelope();
});

writeAnotherButton.addEventListener("click", () => {
  letterSent.classList.remove("is-visible");
  sentStamp.classList.remove("is-visible");
  letterSent.hidden = true;
  sentStamp.hidden = true;
  writeAnotherButton.hidden = true;
  sentEnvelope.src = "img/envelope.png";
  sentEnvelope.alt = "An envelope with your letter";
  letterStage.classList.remove("is-writing");
  showChoices();
});
