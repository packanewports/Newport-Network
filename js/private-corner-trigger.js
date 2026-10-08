const privateCornerPhrase = "justis";
let privateCornerKeyBuffer = "";

document.addEventListener("keydown", (event) => {
  const typingTarget =
    event.target instanceof HTMLElement &&
    event.target.closest("input, textarea, select, [contenteditable='true']");

  if (typingTarget || event.repeat) {
    if (typingTarget) privateCornerKeyBuffer = "";
    return;
  }

  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.key.length !== 1 ||
    !/[a-z]/i.test(event.key)
  ) {
    privateCornerKeyBuffer = "";
    return;
  }

  privateCornerKeyBuffer = `${privateCornerKeyBuffer}${event.key.toLowerCase()}`.slice(-privateCornerPhrase.length);
  if (privateCornerKeyBuffer === privateCornerPhrase) {
    window.location.assign("privatecorner.html");
  }
});
