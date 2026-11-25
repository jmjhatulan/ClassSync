const panel = document.querySelector("#randomizer-panel");
const modeButtons = [...document.querySelectorAll(".mode-button")];
const wheelSets = [
  {
    name: "Wheel 1",
    color: "#43b8a7",
    entries: "Option 1\nOption 2\nOption 3\nOption 4",
  },
];
const gunSets = [
  {
    name: "Chamber 1",
    entries: "Choice 1\nChoice 2\nChoice 3\nChoice 4\nChoice 5\nChoice 6",
  },
];
const wheelResults = [];
const gunResults = [];
const descriptions = {
  wheel: [
    "Wheel",
    "Create one or more colorful wheels. Each wheel can use its own list of choices.",
  ],
  dice: [
    "Dice",
    "Roll several dice across multiple phases. D&D mode rolls a set of D20s and marks natural 1s and 20s.",
  ],
  gun: [
    "Wheel Gun",
    "Load a choice list into each chamber and spin multiple cylinders side by side.",
  ],
  race: [
    "Race",
    "Add racers and watch them dash to the finish. Upload an image to use for every racer.",
  ],
  number: [
    "Number Randomizer",
    "Choose a range and watch numbers shuffle before the final pick.",
  ],
  coin: [
    "Coin Flip",
    "Flip between heads and tails, true and false, yes and no, or your own prompts.",
  ],
  groups: [
    "Group Randomizer",
    "Shuffle a list of names into groups with sizes as even as possible.",
  ],
};

let currentMode = "wheel";
let raceImage = "";
let isBusy = false;

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

function parseEntries(value) {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function makeIntro(mode) {
  const [title, description] = descriptions[mode];
  return `<h2 class="mode-heading">${title}</h2><p class="mode-description">${description}</p><p class="mode-message" id="mode-message" role="alert"></p>`;
}

function setMessage(message) {
  const element = document.querySelector("#mode-message");
  if (element) element.textContent = message;
}

function collectSets(selector) {
  return [...panel.querySelectorAll(selector)].map((card, index) => ({
    name:
      card.querySelector("[data-set-name]").value.trim() || `Set ${index + 1}`,
    color: card.querySelector("[data-set-color]")?.value || "#43b8a7",
    entries: card.querySelector("[data-set-entries]").value,
  }));
}

function wheelCard(set, index) {
  const count = Math.max(2, parseEntries(set.entries).length);
  const colors = [set.color, "#f9d978", "#c4b5fd", "#ffb4a2"];
  const stops = Array.from({ length: count }, (_, i) => {
    const start = (i * 100) / count;
    const end = ((i + 1) * 100) / count;
    return `${colors[i % colors.length]} ${start}% ${end}%`;
  }).join(", ");

  return `<article class="wheel-card" data-wheel="${index}">
    <div class="wheel-card__top">
      <label class="field">Wheel name<input data-set-name value="${escapeHTML(set.name)}" maxlength="40"></label>
      <label class="field">Color<input data-set-color type="color" value="${escapeHTML(set.color)}" aria-label="Wheel ${index + 1} color"></label>
      ${wheelSets.length > 1 ? `<button class="button button-danger" type="button" data-action="remove-wheel" data-index="${index}" aria-label="Remove wheel ${index + 1}">Remove</button>` : ""}
    </div>
    <label class="field">Choices (one per line)<textarea data-set-entries>${escapeHTML(set.entries)}</textarea></label>
    <div class="wheel-disc-wrap" aria-hidden="true"><span class="wheel-pointer"></span><div class="wheel-disc" style="background: conic-gradient(${stops})"></div></div>
    <p class="wheel-result" data-result>${escapeHTML(wheelResults[index] || "Ready to spin")}</p>
  </article>`;
}

function gunCard(set, index) {
  const chamberCount = Math.max(6, Math.min(9, parseEntries(set.entries).length));
  const chambers = Array.from(
    { length: chamberCount },
    () => '<span class="gun-chamber"></span>',
  ).join("");

  return `<article class="gun-card" data-gun="${index}">
    <div class="gun-card__top">
      <label class="field">Cylinder name<input data-set-name value="${escapeHTML(set.name)}" maxlength="40"></label>
      ${gunSets.length > 1 ? `<button class="button button-danger" type="button" data-action="remove-gun" data-index="${index}">Remove</button>` : ""}
    </div>
    <label class="field">Chamber choices (one per line)<textarea data-set-entries>${escapeHTML(set.entries)}</textarea></label>
    <div class="gun-cylinder" aria-hidden="true">${chambers}</div>
    <p class="wheel-result" data-result>${escapeHTML(gunResults[index] || "Ready to spin")}</p>
  </article>`;
}

function renderWheel() {
  panel.innerHTML = `${makeIntro("wheel")}
    <div class="control-row"><button type="button" class="button" data-action="add-wheel">＋ Add wheel</button><button type="button" class="button button-primary" data-action="spin-wheels">Spin all wheels</button></div>
    <div class="wheel-grid">${wheelSets.map(wheelCard).join("")}</div>`;
}

function renderGun() {
  panel.innerHTML = `${makeIntro("gun")}
    <div class="control-row"><button type="button" class="button" data-action="add-gun">＋ Add cylinder</button><button type="button" class="button button-primary" data-action="spin-guns">Spin all cylinders</button></div>
    <div class="gun-grid">${gunSets.map(gunCard).join("")}</div>`;
}

function renderDice() {
  panel.innerHTML = `${makeIntro("dice")}
    <div class="control-row">
      <label class="field">Dice per phase<input id="dice-count" type="number" min="1" max="30" value="2"></label>
      <label class="field">Number of phases<input id="phase-count" type="number" min="1" max="10" value="1"></label>
      <label class="field">Die type<select id="die-type"><option value="4">D4</option><option value="6" selected>D6</option><option value="8">D8</option><option value="10">D10</option><option value="12">D12</option><option value="20">D20</option><option value="100">D100</option></select></label>
      <label class="check-field"><input id="dnd-mode" type="checkbox"> D&amp;D mode (D20)</label>
      <button type="button" class="button button-primary" data-action="roll-dice">Roll dice</button>
    </div>
    <div id="dice-results" class="dice-results" aria-live="polite"></div>`;
}

function renderRace() {
  panel.innerHTML = `${makeIntro("race")}
    <label class="field">Racers (one name per line)<textarea id="race-names">Racer 1\nRacer 2\nRacer 3\nRacer 4</textarea></label>
    <div class="control-row">
      <label class="field">Optional racer image (used for everyone)<input id="race-image" type="file" accept="image/*"></label>
      <button type="button" class="button button-primary" data-action="start-race">Start race</button>
    </div>
    <div id="race-results" class="race-list" aria-live="polite"></div>
    <div id="race-winner" class="result-box" hidden><p class="result-label">Winner</p><p class="result-value"></p></div>`;
}

function renderNumber() {
  panel.innerHTML = `${makeIntro("number")}
    <div class="control-row">
      <label class="field">Minimum<input id="number-min" type="number" value="1"></label>
      <label class="field">Maximum<input id="number-max" type="number" value="100"></label>
      <button type="button" class="button button-primary" data-action="pick-number">Pick a number</button>
    </div>
    <div class="result-box" aria-live="polite"><p class="result-label">The number is</p><p class="result-value" id="number-result">?</p></div>`;
}

function renderCoin() {
  panel.innerHTML = `${makeIntro("coin")}
    <div class="control-row">
      <label class="field">Prompt set<select id="coin-preset"><option value="heads">Heads / Tails</option><option value="true">True / False</option><option value="yes">Yes / No</option><option value="custom">Custom prompts</option></select></label>
      <label class="field">Side A<input id="coin-side-a" value="Heads" maxlength="30"></label>
      <label class="field">Side B<input id="coin-side-b" value="Tails" maxlength="30"></label>
      <button type="button" class="button button-primary" data-action="flip-coin">Flip coin</button>
    </div>
    <div class="coin-stage"><div id="coin" class="coin" aria-hidden="true">?</div></div>
    <div class="result-box" aria-live="polite"><p class="result-label">Result</p><p class="result-value" id="coin-result">Ready to flip</p></div>`;
}

function renderGroups() {
  panel.innerHTML = `${makeIntro("groups")}
    <label class="field">Names (one per line)<textarea id="group-names">Alex\nBlake\nCasey\nDrew\nEmery\nFinley\nGray\nHarper</textarea></label>
    <div class="control-row">
      <label class="field">Number of groups<input id="group-count" type="number" min="1" value="2"></label>
      <button type="button" class="button button-primary" data-action="make-groups">Randomize groups</button>
    </div>
    <div id="group-results" class="group-results" aria-live="polite"></div>`;
}

const renderers = {
  wheel: renderWheel,
  dice: renderDice,
  gun: renderGun,
  race: renderRace,
  number: renderNumber,
  coin: renderCoin,
  groups: renderGroups,
};

function selectMode(mode) {
  currentMode = mode;
  modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderers[mode]();
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function spinSets(kind) {
  if (isBusy) return;
  const isWheel = kind === "wheel";
  const selector = isWheel ? ".wheel-card" : ".gun-card";
  const sets = collectSets(selector);
  const results = isWheel ? wheelResults : gunResults;
  const entries = sets.map((set) => parseEntries(set.entries));
  const emptyIndex = entries.findIndex((list) => list.length === 0);

  if (emptyIndex !== -1) {
    setMessage(`Add at least one choice to ${sets[emptyIndex].name}.`);
    return;
  }

  isBusy = true;
  setMessage("");
  const cards = [...panel.querySelectorAll(selector)];
  cards.forEach((card) => {
    card.querySelector("[data-result]").textContent = "Spinning…";
    card
      .querySelector(isWheel ? ".wheel-disc" : ".gun-cylinder")
      .classList.add("is-spinning");
  });
  await wait(1400);

  sets.forEach((set, index) => {
    results[index] = entries[index][randomInt(0, entries[index].length - 1)];
    cards[index].querySelector("[data-result]").textContent = results[index];
    cards[index]
      .querySelector(isWheel ? ".wheel-disc" : ".gun-cylinder")
      .classList.remove("is-spinning");
  });
  isBusy = false;
}

function rollDice() {
  const diceCount = Number(document.querySelector("#dice-count").value);
  const phaseCount = Number(document.querySelector("#phase-count").value);
  const dnd = document.querySelector("#dnd-mode").checked;
  const sides = dnd ? 20 : Number(document.querySelector("#die-type").value);

  if (
    !Number.isInteger(diceCount) ||
    diceCount < 1 ||
    diceCount > 30 ||
    !Number.isInteger(phaseCount) ||
    phaseCount < 1 ||
    phaseCount > 10
  ) {
    setMessage("Choose 1–30 dice and 1–10 phases.");
    return;
  }

  setMessage("");
  const phases = Array.from({ length: phaseCount }, (_, phaseIndex) => {
    const rolls = Array.from({ length: diceCount }, () => randomInt(1, sides));
    const total = rolls.reduce((sum, value) => sum + value, 0);
    const dice = rolls
      .map((value) => {
        const className =
          dnd && value === 20
            ? "is-critical"
            : dnd && value === 1
              ? "is-fumble"
              : "";
        return `<span class="die ${className}" aria-label="${value}">${value}</span>`;
      })
      .join("");
    return `<article class="dice-phase"><h3>Phase ${phaseIndex + 1} · Total ${total}</h3><div class="die-list">${dice}</div></article>`;
  });
  document.querySelector("#dice-results").innerHTML = phases.join("");
}

function startRace() {
  if (isBusy) return;
  const racers = parseEntries(document.querySelector("#race-names").value);
  if (racers.length < 2) {
    setMessage("Add at least two racers.");
    return;
  }

  setMessage("");
  const list = document.querySelector("#race-results");
  const winnerBox = document.querySelector("#race-winner");
  winnerBox.hidden = true;
  const colors = ["#a7e4dc", "#f9d978", "#c4b5fd", "#ffb4a2"];
  list.innerHTML = racers
    .map((name, index) => {
      const racer = raceImage
        ? `<img src="${raceImage}" alt="">`
        : "🏃";
      return `<div class="race-lane"><span class="race-name">${escapeHTML(name)}</span><div class="race-track"><span class="race-runner" style="--runner-color:${colors[index % colors.length]}" data-racer="${index}">${racer}</span></div></div>`;
    })
    .join("");

  const runners = [...list.querySelectorAll(".race-runner")];
  const progress = runners.map(() => 0);
  const speeds = runners.map(() => 0.00006 + Math.random() * 0.0001);
  isBusy = true;
  let previousTime = 0;

  function advance(time) {
    if (!previousTime) previousTime = time;
    const delta = Math.min(40, time - previousTime);
    previousTime = time;
    progress.forEach((value, index) => {
      progress[index] = Math.min(100, value + speeds[index] * delta * 1000);
      runners[index].style.left = `calc(${Math.min(progress[index], 94)}% - 42px)`;
    });

    const winnerIndex = progress.findIndex((value) => value >= 100);
    if (winnerIndex !== -1) {
      document.querySelector("#race-winner .result-value").textContent =
        `${racers[winnerIndex]} wins!`;
      winnerBox.hidden = false;
      isBusy = false;
      return;
    }
    requestAnimationFrame(advance);
  }

  requestAnimationFrame(advance);
}

function changeCoinPreset() {
  const preset = document.querySelector("#coin-preset").value;
  const prompts = {
    heads: ["Heads", "Tails"],
    true: ["True", "False"],
    yes: ["Yes", "No"],
  };
  if (prompts[preset]) {
    document.querySelector("#coin-side-a").value = prompts[preset][0];
    document.querySelector("#coin-side-b").value = prompts[preset][1];
  }
}

async function flipCoin() {
  if (isBusy) return;
  const first = document.querySelector("#coin-side-a").value.trim();
  const second = document.querySelector("#coin-side-b").value.trim();
  if (!first || !second) {
    setMessage("Enter a prompt for both sides.");
    return;
  }

  setMessage("");
  isBusy = true;
  const coin = document.querySelector("#coin");
  coin.classList.remove("is-flipping");
  void coin.offsetWidth;
  coin.classList.add("is-flipping");
  document.querySelector("#coin-result").textContent = "Flipping…";
  await wait(900);
  const result = Math.random() < 0.5 ? first : second;
  coin.textContent = result;
  document.querySelector("#coin-result").textContent = result;
  coin.classList.remove("is-flipping");
  isBusy = false;
}

async function pickNumber() {
  if (isBusy) return;
  const min = Number(document.querySelector("#number-min").value);
  const max = Number(document.querySelector("#number-max").value);
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
    setMessage(
      "Enter a valid whole-number range with maximum at least the minimum.",
    );
    return;
  }

  setMessage("");
  isBusy = true;
  const output = document.querySelector("#number-result");
  for (let i = 0; i < 22; i++) {
    output.textContent = randomInt(min, max);
    await wait(65);
  }
  output.textContent = randomInt(min, max);
  isBusy = false;
}

function makeGroups() {
  const names = parseEntries(document.querySelector("#group-names").value);
  const groupCount = Number(document.querySelector("#group-count").value);
  if (!names.length) {
    setMessage("Add at least one name.");
    return;
  }
  if (
    !Number.isInteger(groupCount) ||
    groupCount < 1 ||
    groupCount > names.length
  ) {
    setMessage(`Choose between 1 and ${names.length} groups.`);
    return;
  }

  setMessage("");
  const groups = Array.from({ length: groupCount }, () => []);
  shuffle(names).forEach((name, index) => {
    groups[index % groupCount].push(name);
  });
  document.querySelector("#group-results").innerHTML = groups
    .map(
      (group, index) =>
        `<article class="group-card"><h3>Group ${index + 1} · ${group.length}</h3><ul>${group.map((name) => `<li>${escapeHTML(name)}</li>`).join("")}</ul></article>`,
    )
    .join("");
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => selectMode(button.dataset.mode));
});

panel.addEventListener("input", (event) => {
  if (
    currentMode === "wheel" &&
    event.target.matches("[data-set-name], [data-set-color], [data-set-entries]")
  ) {
    const cards = [...panel.querySelectorAll(".wheel-card")];
    cards.forEach((card, index) => {
      const entries = parseEntries(
        card.querySelector("[data-set-entries]").value,
      );
      const color = card.querySelector("[data-set-color]").value;
      const colors = [color, "#f9d978", "#c4b5fd", "#ffb4a2"];
      const count = Math.max(2, entries.length);
      const stops = Array.from({ length: count }, (_, i) => {
        const start = (i * 100) / count;
        const end = ((i + 1) * 100) / count;
        return `${colors[i % colors.length]} ${start}% ${end}%`;
      }).join(", ");
      card.querySelector(".wheel-disc").style.background =
        `conic-gradient(${stops})`;
      wheelSets[index] = {
        name: card.querySelector("[data-set-name]").value,
        color,
        entries: card.querySelector("[data-set-entries]").value,
      };
    });
  }

  if (
    currentMode === "gun" &&
    event.target.matches("[data-set-name], [data-set-entries]")
  ) {
    gunSets.splice(0, gunSets.length, ...collectSets(".gun-card"));
  }
});

panel.addEventListener("change", (event) => {
  if (event.target.id === "dnd-mode") {
    document.querySelector("#die-type").disabled = event.target.checked;
  }
  if (event.target.id === "coin-preset") changeCoinPreset();
  if (event.target.id === "race-image") {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      raceImage = typeof reader.result === "string" ? reader.result : "";
    });
    reader.addEventListener("error", () => {
      setMessage("Could not read that image. Please choose another file.");
    });
    reader.readAsDataURL(file);
  }
});

panel.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  switch (button.dataset.action) {
    case "add-wheel":
      wheelSets.splice(0, wheelSets.length, ...collectSets(".wheel-card"));
      wheelSets.push({
        name: `Wheel ${wheelSets.length + 1}`,
        color: "#43b8a7",
        entries: "Option 1\nOption 2\nOption 3",
      });
      renderWheel();
      break;
    case "remove-wheel": {
      wheelSets.splice(0, wheelSets.length, ...collectSets(".wheel-card"));
      const index = Number(button.dataset.index);
      wheelSets.splice(index, 1);
      wheelResults.splice(index, 1);
      renderWheel();
      break;
    }
    case "spin-wheels":
      await spinSets("wheel");
      break;
    case "add-gun":
      gunSets.splice(0, gunSets.length, ...collectSets(".gun-card"));
      gunSets.push({
        name: `Cylinder ${gunSets.length + 1}`,
        entries: "Choice 1\nChoice 2\nChoice 3\nChoice 4\nChoice 5\nChoice 6",
      });
      renderGun();
      break;
    case "remove-gun": {
      gunSets.splice(0, gunSets.length, ...collectSets(".gun-card"));
      const index = Number(button.dataset.index);
      gunSets.splice(index, 1);
      gunResults.splice(index, 1);
      renderGun();
      break;
    }
    case "spin-guns":
      await spinSets("gun");
      break;
    case "roll-dice":
      rollDice();
      break;
    case "start-race":
      startRace();
      break;
    case "pick-number":
      await pickNumber();
      break;
    case "flip-coin":
      await flipCoin();
      break;
    case "make-groups":
      makeGroups();
      break;
  }
});

selectMode(currentMode);
