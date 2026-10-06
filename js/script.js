const splashTexts = [
  "This was random selected, kinda like you.",
  "A suspiciously large amount of website.",
  "Now with 22% more website!",
  "Bottom Text",
  "SPLASHTEXT!",
  "YO MAMA!",
  "I like turtles.",
  "I'm proud of you!",
  "Packasites is a website that is a website that is a website that is a website that is a website that is a website that is a website that is a website that is a website that is a website that is a website that is a website that is a website that is a website that is a website that is a website.",
  "Packa what? Packa deez nutz!!!",
  "I'm so very gay.",
  "Things that bother you, they never bother me!",
  "Big fan of feet.",
  "It says gullible on the ceiling!",
  "I disect my food layer by layer.",
  "Lookin pretty cute today, aren't ya?",
  "Awww you're so cute when you're mad!",
  "Someone refreshed to see this again...",
  "Cutey wooty, cutie patooty.",
  "It really wants me to put 'I like turtles'",
  "Eat the little flesh bits!",
  "feet",
  "You're a good person, and I like you.",
  "you're looking sooo good today, I can't even.",
  "I LOVE YOUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUU",
  "Ouuu I'm splashing it~",
  "Gosh, You're so pretty!",
  "Love yourself, and love others too!",
  "Every living creature deserves love and respect.",
  "I be kissing people of all genders and sexualities, and I don't care who knows it.",
  "Give me more splashtexts, I need more splashtexts!",

];

const pageSubtitle = document.querySelector("#page-subtitle");

if (pageSubtitle) {
  const storageKey = "newport-splash-texts";
  const savedOrder = sessionStorage.getItem(storageKey);
  let remainingIndexes = savedOrder ? savedOrder.split(",").map(Number) : [];
  const validOrder = remainingIndexes.every(
    (index) => Number.isInteger(index) && index >= 0 && index < splashTexts.length
  ) && new Set(remainingIndexes).size === remainingIndexes.length;

  if (!validOrder || remainingIndexes.length === 0) {
    remainingIndexes = splashTexts.map((_, index) => index);

    for (let index = remainingIndexes.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [remainingIndexes[index], remainingIndexes[randomIndex]] =
        [remainingIndexes[randomIndex], remainingIndexes[index]];
    }
  }

  const nextIndex = remainingIndexes.shift();
  pageSubtitle.textContent = splashTexts[nextIndex];
  sessionStorage.setItem(storageKey, remainingIndexes.join(","));
}