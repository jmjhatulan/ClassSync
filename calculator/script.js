const thresholds = [
  { grade: "1.00", min: 96.01 },
  { grade: "1.25", min: 91.51 },
  { grade: "1.50", min: 87.01 },
  { grade: "1.75", min: 82.51 },
  { grade: "2.00", min: 78.01 },
  { grade: "2.25", min: 73.51 },
  { grade: "2.50", min: 69.01 },
  { grade: "2.75", min: 64.51 },
  { grade: "3.00", min: 60.0 },
  { grade: "5.00", min: 0.0 },
];

const courseType = document.getElementById("courseType");
const released = document.getElementById("released");
const releaseWrap = document.getElementById("releaseWrap");
const m1Input = document.getElementById("m1");
const m2Input = document.getElementById("m2");
const m2Wrap = document.getElementById("m2Wrap");
const results = document.getElementById("results");
const neededHeading = document.getElementById("neededHeading");
const showPrecision = document.getElementById("showPrecision");
const taskModules = document.getElementById("taskModules");
const taskLists = Array.from(document.querySelectorAll(".task-list"));
const taskTarget = document.getElementById("taskTarget");
const weightSummary = document.getElementById("weightSummary");
const taskGoal = document.getElementById("taskGoal");

let nextTaskId = 1;

function validGrade(input) {
  if (!input || input.value.trim() === "") return 0;
  const value = Number(input.value);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 0;
}

function sanitizeInput(input) {
  if (input.value.includes("-")) {
    input.value = input.value.replace(/-/g, "");
  }

  const value = Number(input.value);
  if (input.value !== "" && value < 0) {
    input.value = "0";
  } else if (value > 100) {
    input.value = "100";
  }
}

function ceil2(value) {
  return Math.ceil((value - 1e-9) * 100) / 100;
}

function fmt(value, decimals = 2) {
  return value.toFixed(decimals) + "%";
}

function updateVisibility() {
  const modules = Number(courseType.value);
  releaseWrap.classList.toggle("hidden", modules !== 3);
  taskModules
    .querySelector('[data-module="3"]')
    .classList.toggle("hidden", modules !== 3);
  const twoReleased = modules === 3 && released.value === "2";
  m2Wrap.classList.toggle("hidden", modules === 2 || !twoReleased);
  neededHeading.textContent =
    modules === 2
      ? "Required Module 2 grade"
      : released.value === "1"
        ? "Required Module 2 & 3 grade"
        : "Required Module 3 grade";
  calculate();
  updateTaskPlanner();
}

function calculate() {
  const modules = Number(courseType.value);
  const m1 = validGrade(m1Input);
  const twoReleased = modules === 3 && released.value === "2";
  const m2 = twoReleased ? validGrade(m2Input) : 0;
  const usePrecision = showPrecision.checked;

  results.innerHTML = "";
  thresholds.forEach((item) => {
    let required;
    if (modules === 2) {
      required = 2 * item.min - m1;
    } else if (released.value === "1") {
      required = (3 * item.min - m1) / 2;
    } else {
      required = 3 * item.min - m1 - m2;
    }

    const row = document.createElement("tr");

    const gradeCell = document.createElement("td");
    gradeCell.className = "grade";
    gradeCell.textContent = item.grade;

    const thresholdCell = document.createElement("td");
    thresholdCell.className = "num";
    thresholdCell.textContent = fmt(item.min, 2);

    const requiredCell = document.createElement("td");
    requiredCell.className = "num";

    const statusCell = document.createElement("td");
    statusCell.className = "status";

    if (item.grade === "5.00") {
      requiredCell.textContent = "No target needed";
      statusCell.textContent = "Failing Grade";
      statusCell.classList.add("small");
    } else if (required > 100) {
      requiredCell.textContent = "Over 100%";
      statusCell.textContent = "Not Possible";
      statusCell.classList.add("impossible");
    } else {
      const rawValue = Math.max(0, required);
      const displayedValue = usePrecision
        ? rawValue
        : Math.max(0, ceil2(required));
      const formattedGrade = fmt(displayedValue, usePrecision ? 10 : 2);

      requiredCell.textContent =
        modules === 3 && released.value === "1"
          ? formattedGrade + " each"
          : formattedGrade;

      if (required <= 0) {
        statusCell.textContent =
          "Threshold already secured by current grade(s)";
        statusCell.classList.add("achievable");
      } else {
        statusCell.textContent = "Achievable";
        statusCell.classList.add("achievable");
      }
    }

    row.append(gradeCell, thresholdCell, requiredCell, statusCell);
    results.appendChild(row);
  });
}

function handleInput(event) {
  sanitizeInput(event.target);
  calculate();
}

function taskRows(list) {
  return Array.from(list.querySelectorAll("tr"));
}

function taskWeight(row) {
  const input = row.querySelector(".task-weight");
  const value = Number(input.value);
  return input.value.trim() !== "" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function rebalanceWeights(list, pinnedRow = null) {
  const rows = taskRows(list);
  const fixedRows = rows.filter(
    (row) => row.querySelector(".task-lock").checked || row === pinnedRow,
  );
  const unlockedRows = rows.filter((row) => !fixedRows.includes(row));
  const fixedWeight = fixedRows.reduce((sum, row) => sum + taskWeight(row), 0);

  if (fixedWeight > 100 || unlockedRows.length === 0) {
    return false;
  }

  const share =
    Math.floor(((100 - fixedWeight) / unlockedRows.length) * 100) / 100;
  let assigned = 0;

  unlockedRows.forEach((row, index) => {
    const weight =
      index === unlockedRows.length - 1
        ? Math.round((100 - fixedWeight - assigned) * 100) / 100
        : share;
    row.querySelector(".task-weight").value = weight.toFixed(2);
    assigned += weight;
  });

  return true;
}

function createTask(list, name = "") {
  const row = document.createElement("tr");
  const id = nextTaskId++;
  const moduleNumber = list.dataset.module;

  const nameCell = document.createElement("td");
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "task-name";
  nameInput.value = name || `Learning Task ${id}`;
  nameInput.setAttribute(
    "aria-label",
    `Module ${moduleNumber} learning task ${id} name`,
  );
  nameCell.appendChild(nameInput);

  const weightCell = document.createElement("td");
  const weightInput = document.createElement("input");
  weightInput.type = "number";
  weightInput.className = "task-weight";
  weightInput.min = "0";
  weightInput.max = "100";
  weightInput.step = "0.01";
  weightInput.value = "0";
  weightInput.inputMode = "decimal";
  weightInput.setAttribute(
    "aria-label",
    `Module ${moduleNumber} learning task ${id} weight percentage`,
  );
  weightCell.appendChild(weightInput);

  const scoreCell = document.createElement("td");
  scoreCell.className = "task-score-cell";
  const earnedInput = document.createElement("input");
  earnedInput.type = "number";
  earnedInput.className = "task-earned";
  earnedInput.min = "0";
  earnedInput.step = "any";
  earnedInput.placeholder = "Earned";
  earnedInput.inputMode = "decimal";
  earnedInput.setAttribute(
    "aria-label",
    `Module ${moduleNumber} learning task ${id} points earned`,
  );
  const scoreDivider = document.createElement("span");
  scoreDivider.textContent = "/";
  const possibleInput = document.createElement("input");
  possibleInput.type = "number";
  possibleInput.className = "task-possible";
  possibleInput.min = "0";
  possibleInput.step = "any";
  possibleInput.placeholder = "Possible";
  possibleInput.inputMode = "decimal";
  possibleInput.setAttribute(
    "aria-label",
    `Module ${moduleNumber} learning task ${id} points possible`,
  );
  const goalHint = document.createElement("span");
  goalHint.className = "task-goal-points";
  scoreCell.append(earnedInput, scoreDivider, possibleInput, goalHint);

  const lockCell = document.createElement("td");
  const lockLabel = document.createElement("label");
  lockLabel.className = "task-lock-label";
  const lockInput = document.createElement("input");
  lockInput.type = "checkbox";
  lockInput.className = "task-lock";
  lockInput.setAttribute(
    "aria-label",
    `Lock Module ${moduleNumber} Learning Task ${id} weight`,
  );
  const lockText = document.createElement("span");
  lockText.textContent = "Lock";
  lockLabel.append(lockInput, lockText);
  lockCell.appendChild(lockLabel);

  const actionCell = document.createElement("td");
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "remove-task";
  removeButton.textContent = "Remove";
  removeButton.setAttribute(
    "aria-label",
    `Remove Module ${moduleNumber} Learning Task ${id}`,
  );
  actionCell.appendChild(removeButton);

  row.append(nameCell, weightCell, scoreCell, lockCell, actionCell);
  list.appendChild(row);
  return row;
}

function updateTaskPlanner() {
  taskModules.querySelectorAll(".task-goal-points").forEach((hint) => {
    hint.textContent = "";
  });
  const modules = Number(courseType.value);
  const activeLists = taskLists.filter(
    (list) => Number(list.dataset.module) <= modules,
  );
  const moduleWeights = activeLists.map((list) => {
    const total = taskRows(list).reduce((sum, row) => sum + taskWeight(row), 0);
    return { module: list.dataset.module, total };
  });
  weightSummary.textContent = moduleWeights
    .map(({ module, total }) => `Module ${module}: ${total.toFixed(2)}%`)
    .join(" · ");
  const invalidWeights = moduleWeights.some(
    ({ total }) => Math.abs(total - 100) > 0.005,
  );
  weightSummary.classList.toggle("error-text", invalidWeights);
  taskGoal.classList.remove("error-text", "achievable", "impossible");

  if (invalidWeights) {
    taskGoal.textContent =
      "Adjust each module's task weights to total 100% to calculate your goal.";
    taskGoal.classList.add("error-text");
    return;
  }

  let completedContribution = 0;
  let remainingWeight = 0;
  let invalidRow = false;

  activeLists.forEach((list) => {
    taskRows(list).forEach((row) => {
      const earnedInput = row.querySelector(".task-earned");
      const possibleInput = row.querySelector(".task-possible");
      const earnedText = earnedInput.value.trim();
      const possibleText = possibleInput.value.trim();

      if (earnedText === "") {
        if (
          possibleText !== "" &&
          (!Number.isFinite(Number(possibleText)) || Number(possibleText) <= 0)
        ) {
          invalidRow = true;
          return;
        }
        remainingWeight += taskWeight(row) / modules;
        return;
      }

      const earned = Number(earnedText);
      const possible = Number(possibleText);
      if (
        possibleText === "" ||
        !Number.isFinite(earned) ||
        !Number.isFinite(possible) ||
        earned < 0 ||
        possible <= 0 ||
        earned > possible
      ) {
        invalidRow = true;
        return;
      }

      completedContribution +=
        (taskWeight(row) / modules) * (earned / possible);
    });
  });

  if (invalidRow) {
    taskGoal.textContent =
      "Enter valid earned and possible points for each scored task.";
    taskGoal.classList.add("error-text");
    return;
  }

  const target = Number(taskTarget.value);
  const requiredPercent =
    remainingWeight > 0
      ? ((target - completedContribution) / remainingWeight) * 100
      : null;
  const displayedRequiredPercent =
    requiredPercent === null ? null : Math.max(0, ceil2(requiredPercent));
  const earnedPercent = completedContribution;
  const selectedGrade = taskTarget.options[taskTarget.selectedIndex].text;

  if (requiredPercent !== null && requiredPercent <= 100) {
    activeLists.forEach((list) => {
      taskRows(list).forEach((row) => {
        const earnedInput = row.querySelector(".task-earned");
        const possibleInput = row.querySelector(".task-possible");
        const possibleText = possibleInput.value.trim();
        if (earnedInput.value.trim() !== "") return;

        const hint = row.querySelector(".task-goal-points");
        if (possibleText === "") {
          hint.textContent = `At target average: ${displayedRequiredPercent.toFixed(2)}%`;
          return;
        }

        const possible = Number(possibleText);
        const neededPoints = (displayedRequiredPercent * possible) / 100;
        const roundedPoints = Math.ceil((neededPoints - 1e-9) * 100) / 100;
        hint.textContent = `At target average: ${roundedPoints.toFixed(2)} / ${possible}`;
      });
    });
  }

  if (requiredPercent === null) {
    const met = earnedPercent + 1e-9 >= target;
    taskGoal.textContent = met
      ? `Target ${selectedGrade} reached. Weighted grade: ${earnedPercent.toFixed(2)}%.`
      : `Target ${selectedGrade} not reached. Weighted grade: ${earnedPercent.toFixed(2)}%.`;
    taskGoal.classList.add(met ? "achievable" : "impossible");
  } else if (requiredPercent > 100) {
    taskGoal.textContent = `Target ${selectedGrade} is not possible with the remaining ${remainingWeight.toFixed(2)}% unscored.`;
    taskGoal.classList.add("impossible");
  } else if (requiredPercent <= 0) {
    taskGoal.textContent = `Target ${selectedGrade} is already secured. Remaining tasks may average 0%.`;
    taskGoal.classList.add("achievable");
  } else {
    taskGoal.textContent = `Average needed on unscored tasks for target ${selectedGrade}: ${displayedRequiredPercent.toFixed(2)}%.`;
    taskGoal.classList.add("achievable");
  }
}

taskModules.addEventListener("input", (event) => {
  if (event.target.classList.contains("task-weight")) {
    updateTaskPlanner();
    return;
  }
  updateTaskPlanner();
});

taskModules.addEventListener("change", (event) => {
  if (event.target.classList.contains("task-weight")) {
    const list = event.target.closest(".task-list");
    rebalanceWeights(list, event.target.closest("tr"));
  } else if (event.target.classList.contains("task-lock")) {
    updateTaskPlanner();
  }
  updateTaskPlanner();
});

taskModules.addEventListener("click", (event) => {
  const addButton = event.target.closest(".add-task");
  if (addButton) {
    const list = taskLists.find(
      (item) => item.dataset.module === addButton.dataset.module,
    );
    createTask(list);
    rebalanceWeights(list);
    updateTaskPlanner();
    return;
  }

  const removeButton = event.target.closest(".remove-task");
  if (!removeButton) return;

  const row = removeButton.closest("tr");
  const list = row.closest(".task-list");
  row.remove();
  if (taskRows(list).length === 0) createTask(list);
  rebalanceWeights(list);
  updateTaskPlanner();
});

taskTarget.addEventListener("change", updateTaskPlanner);

courseType.addEventListener("change", updateVisibility);
released.addEventListener("change", updateVisibility);
m1Input.addEventListener("input", handleInput);
m2Input.addEventListener("input", handleInput);
showPrecision.addEventListener("change", calculate);

taskLists.forEach((list) => {
  createTask(list);
  rebalanceWeights(list);
});
updateVisibility();
