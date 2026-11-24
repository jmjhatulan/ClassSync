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
  const twoReleased = modules === 3 && released.value === "2";
  m2Wrap.classList.toggle("hidden", modules === 2 || !twoReleased);
  neededHeading.textContent =
    modules === 2
      ? "Required Module 2 grade"
      : released.value === "1"
        ? "Required Module 2 & 3 grade"
        : "Required Module 3 grade";
  calculate();
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
      statusCell.textContent = "Lowest grade band";
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

courseType.addEventListener("change", updateVisibility);
released.addEventListener("change", updateVisibility);
m1Input.addEventListener("input", handleInput);
m2Input.addEventListener("input", handleInput);
showPrecision.addEventListener("change", calculate);

updateVisibility();
