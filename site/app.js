const STORAGE_KEY = "fanglaw.site.prototype.account";
const SESSION_TOKEN_STORAGE_KEY = "fanglaw.site.session_token";
const APPEARANCE_STORAGE_KEY = "fanglaw.site.prototype.appearance.v3";

const API_BASE = (() => {
  const { protocol, hostname, origin } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:2567";
  }

  if (protocol === "http:" || protocol === "https:") {
    return origin;
  }

  return "http://localhost:2567";
})();

const form = document.getElementById("registration-form");
const loginForm = document.getElementById("login-form");
const statusNode = document.getElementById("form-status");
const savedDataNode = document.getElementById("saved-data");
const authChip = document.getElementById("auth-chip");
const authLoggedOut = document.getElementById("auth-logged-out");
const authLoggedIn = document.getElementById("auth-logged-in");
const editorPanel = document.getElementById("editor-panel");
const editorLocked = document.getElementById("editor-locked");
const saveAppearanceButton = document.getElementById("save-appearance-button");
const appearanceSaveStatusNode = document.getElementById("appearance-save-status");
const accountCharacterNameNode = document.getElementById("account-character-name");
const accountEmailNode = document.getElementById("account-email");
const showRegisterButton = document.getElementById("show-register-button");
const showLoginButton = document.getElementById("show-login-button");
const logoutButton = document.getElementById("logout-button");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const passwordConfirmInput = document.getElementById("password-confirm");
const characterNameInput = document.getElementById("character-name");
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");

const previewNameNode = document.getElementById("preview-name");
const appearancePayloadNode = document.getElementById("appearance-payload");
const previewCanvas = document.getElementById("character-preview");

const bodyColorInput = document.getElementById("body-color");
const noseColorInput = document.getElementById("nose-color");
const eyeColorInput = document.getElementById("eye-color");
const earsSelect = document.getElementById("ears-select");
const earsColorInput = document.getElementById("ears-color");
const tailSelect = document.getElementById("tail-select");
const tailColorInput = document.getElementById("tail-color");
const maneSelect = document.getElementById("mane-select");
const maneColorInput = document.getElementById("mane-color");
const cheeksSelect = document.getElementById("cheeks-select");

const bodyPatternSlotsNode = document.getElementById("body-pattern-slots");
const tailPatternSlotsNode = document.getElementById("tail-pattern-slots");
const bodyPatternAddButton = document.getElementById("body-pattern-add-button");
const tailPatternAddButton = document.getElementById("tail-pattern-add-button");

const NATURAL_PICKER_WIDTH = 240;
const NATURAL_PICKER_HEIGHT = 156;
const DEFAULT_NATURAL_WHITE = "#f7f2ec";
const NATURAL_PALETTE_STOPS = [
  { t: 0.0, color: "#f1ebe4" },
  { t: 0.08, color: "#e1d8ce" },
  { t: 0.18, color: "#b7ada2" },
  { t: 0.28, color: "#83786f" },
  { t: 0.38, color: "#ddccb3" },
  { t: 0.48, color: "#cca57e" },
  { t: 0.58, color: "#b1784b" },
  { t: 0.68, color: "#8a5537" },
  { t: 0.78, color: "#6b4330" },
  { t: 0.86, color: "#9f5548" },
  { t: 0.93, color: "#c9866d" },
  { t: 1.0, color: "#8ea1ad" },
];

const naturalPaletteSurface = {
  canvas: null,
};

const naturalPalettePointCache = new Map();
const naturalColorControls = new WeakMap();
let naturalPickerGlobalsBound = false;

const BODY_PATTERN_OPTIONS = [
  { id: "none", label: "Без паттерна" },
  { id: "pattern1", label: "1 - пятна" },
  { id: "pattern2", label: "2 - полосы" },
  { id: "pattern3", label: "3 - бровь" },
  { id: "pattern4", label: "4 - подбородок" },
  { id: "pattern5", label: "5 - щека" },
  { id: "pattern6", label: "6 - маска" },
  { id: "pattern7", label: "7 - полоска под глазом" },
  { id: "pattern8", label: "8 - слезы" },
  { id: "pattern9", label: "9 - пятна под глазом" },
  { id: "pattern10", label: "10 - пятно над глазом" },
  { id: "pattern11", label: "11 - полоска на носу" },
  { id: "pattern13", label: "13 - ремень" },
  { id: "pattern14", label: "14 - большое пятно" },
  { id: "pattern15", label: "15 - чепрак" },
  { id: "pattern16", label: "16 - живот" },
  { id: "pattern17", label: "17 - пятна на лапах" },
  { id: "pattern18", label: "18 - грудь" },
  { id: "pattern19", label: "19 - рваные пятна" },
  { id: "pattern20", label: "20 - затушевка" },
  { id: "pattern21", label: "21 - большие пятна" },
  { id: "pattern22", label: "22 - пальцы" },
  { id: "pattern23", label: "23 - полосы на лапах" },
];

const TAIL_PATTERN_OPTIONS_BY_TAIL = {
  tails1: [
    { id: "none", label: "Без паттерна" },
    { id: "patterntail1_1", label: "Хвост 1 - паттерн 1" },
    { id: "patterntail1_2", label: "Хвост 1 - паттерн 2" },
    { id: "patterntail1_3", label: "Хвост 1 - паттерн 3" },
  ],
  tails2: [
    { id: "none", label: "Без паттерна" },
    { id: "patterntail2_1", label: "Хвост 2 - паттерн 1" },
    { id: "patterntail2_2", label: "Хвост 2 - паттерн 2" },
    { id: "patterntail2_3", label: "Хвост 2 - паттерн 3" },
  ],
  tails3: [
    { id: "none", label: "Без паттерна" },
    { id: "patterntail3_1", label: "Хвост 3 - паттерн 1" },
    { id: "patterntail3_2", label: "Хвост 3 - паттерн 2" },
    { id: "patterntail3_3", label: "Хвост 3 - паттерн 3" },
  ],
};

const previewAssets = {
  bodyBase: "./assets/characters/body/base/bodybase.png",
  bodyShadow: "./assets/characters/body/shadows/bodybaseshadow.png",
  bodyContour: "./assets/characters/body/contours/bodybaseco.png",
  ear1: "./assets/characters/ears/ears1.png",
  ear2: "./assets/characters/ears/ears2.png",
  ear3: "./assets/characters/ears/ears3.png",
  ear1Contour: "./assets/characters/ears/contours/ears1co.png",
  ear2Contour: "./assets/characters/ears/contours/ears2co.png",
  ear3Contour: "./assets/characters/ears/contours/ears3co.png",
  tail1: "./assets/characters/tails/base/tails1.png",
  tail2: "./assets/characters/tails/base/tails2.png",
  tail3: "./assets/characters/tails/base/tails3.png",
  tail1Shadow: "./assets/characters/tails/shadows/tails1shadow.png",
  tail2Shadow: "./assets/characters/tails/shadows/tails2shadow.png",
  tail3Shadow: "./assets/characters/tails/shadows/tails3shadow.png",
  tail1Contour: "./assets/characters/tails/contours/tails1co.png",
  tail2Contour: "./assets/characters/tails/contours/tails2co.png",
  tail3Contour: "./assets/characters/tails/contours/tails3co.png",
  mane1: "./assets/characters/manes/manes1.png",
  mane1Contour: "./assets/characters/manes/contours/manes1co.png",
  cheeks1: "./assets/characters/cheeks/cheeks1.png",
  cheeks2: "./assets/characters/cheeks/cheeks2.png",
  eyesBase: "./assets/characters/patterns/body/eyeswhite.png",
  noseMask: "./assets/characters/patterns/body/pattern12nose.png",
  pattern1: "./assets/characters/patterns/body/pattern1.png",
  pattern2: "./assets/characters/patterns/body/pattern2.png",
  pattern3: "./assets/characters/patterns/body/pattern3.png",
  pattern4: "./assets/characters/patterns/body/pattern4.png",
  pattern5: "./assets/characters/patterns/body/pattern5.png",
  pattern6: "./assets/characters/patterns/body/pattern6.png",
  pattern7: "./assets/characters/patterns/body/pattern7.png",
  pattern8: "./assets/characters/patterns/body/pattern8.png",
  pattern9: "./assets/characters/patterns/body/pattern9.png",
  pattern10: "./assets/characters/patterns/body/pattern10.png",
  pattern11: "./assets/characters/patterns/body/pattern11.png",
  pattern13: "./assets/characters/patterns/body/pattern13.png",
  pattern14: "./assets/characters/patterns/body/pattern14.png",
  pattern15: "./assets/characters/patterns/body/pattern15.png",
  pattern16: "./assets/characters/patterns/body/pattern16.png",
  pattern17: "./assets/characters/patterns/body/pattern17.png",
  pattern18: "./assets/characters/patterns/body/pattern18.png",
  pattern19: "./assets/characters/patterns/body/pattern19.png",
  pattern20: "./assets/characters/patterns/body/pattern20.png",
  pattern21: "./assets/characters/patterns/body/pattern21.png",
  pattern22: "./assets/characters/patterns/body/pattern22.png",
  pattern23: "./assets/characters/patterns/body/pattern23.png",
  patterntail1_1: "./assets/characters/patterns/tail/patterntail1_1.png",
  patterntail1_2: "./assets/characters/patterns/tail/patterntail1_2.png",
  patterntail1_3: "./assets/characters/patterns/tail/patterntail1_3.png",
  patterntail2_1: "./assets/characters/patterns/tail/patterntail2_1.png",
  patterntail2_2: "./assets/characters/patterns/tail/patterntail2_2.png",
  patterntail2_3: "./assets/characters/patterns/tail/patterntail2_3.png",
  patterntail3_1: "./assets/characters/patterns/tail/patterntail3_1.png",
  patterntail3_2: "./assets/characters/patterns/tail/patterntail3_2.png",
  patterntail3_3: "./assets/characters/patterns/tail/patterntail3_3.png",
};

function createPatternSlot() {
  return {
    pattern_id: "none",
    color: DEFAULT_NATURAL_WHITE,
  };
}

function createPatternSlots(count) {
  return Array.from({ length: count }, () => createPatternSlot());
}

const authState = {
  sessionToken: localStorage.getItem(SESSION_TOKEN_STORAGE_KEY) || "",
  account: null,
  character: null,
};

const appearanceState = {
  body_color: DEFAULT_NATURAL_WHITE,
  nose_color: DEFAULT_NATURAL_WHITE,
  eye_color: DEFAULT_NATURAL_WHITE,
  ears_id: "ears1",
  ears_color: DEFAULT_NATURAL_WHITE,
  tail_id: "tails1",
  tail_color: DEFAULT_NATURAL_WHITE,
  mane_id: "none",
  mane_color: DEFAULT_NATURAL_WHITE,
  cheeks_id: "none",
  body_pattern_slots: createPatternSlots(4),
  tail_pattern_slots: createPatternSlots(3),
};

const loadedImages = {};
let previewReady = false;

function setStatus(text, isError = false) {
  statusNode.textContent = text;
  statusNode.style.color = isError ? "#8f2118" : "#8d4122";
}

function setAppearanceStatus(text, isError = false) {
  if (!appearanceSaveStatusNode) {
    return;
  }

  appearanceSaveStatusNode.textContent = text;
  appearanceSaveStatusNode.style.color = isError ? "#8f2118" : "#8d4122";
}

function setAuthMode(mode) {
  const registerActive = mode === "register";
  form.classList.toggle("is-hidden", !registerActive);
  loginForm.classList.toggle("is-hidden", registerActive);
  showRegisterButton.classList.toggle("is-active", registerActive);
  showLoginButton.classList.toggle("is-active", !registerActive);
}

function setAuthenticated(payload) {
  authState.sessionToken = payload.sessionToken;
  authState.account = payload.account;
  authState.character = payload.character;

  localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, payload.sessionToken);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

  authLoggedOut.classList.add("is-hidden");
  authLoggedIn.classList.remove("is-hidden");
  editorLocked.classList.add("is-hidden");
  editorPanel.classList.remove("is-hidden");

  authChip.textContent = "Авторизован";
  accountCharacterNameNode.textContent = payload.character?.name || "Player";
  accountEmailNode.textContent = payload.account?.email || "";
  previewNameNode.textContent = payload.character?.name || characterNameInput.value.trim() || "Player";
  if (payload.character?.appearance) {
    applyAppearancePayloadToState(payload.character.appearance);
  }
  setAppearanceLockedState(payload.character?.appearanceLocked === true);
  setAppearanceStatus(
    payload.character?.appearanceLocked === true
      ? "Окрас уже сохранён и зафиксирован."
      : "Окрас можно сохранить только один раз на аккаунт."
  );

  renderSavedState();
  renderEditor();
}

function clearAuthState() {
  authState.sessionToken = "";
  authState.account = null;
  authState.character = null;

  localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY);

  authLoggedOut.classList.remove("is-hidden");
  authLoggedIn.classList.add("is-hidden");
  editorLocked.classList.remove("is-hidden");
  editorPanel.classList.add("is-hidden");

  authChip.textContent = "Гость";
  accountCharacterNameNode.textContent = "Player";
  accountEmailNode.textContent = "";
  setAppearanceLockedState(false);
  setAppearanceStatus("Окрас можно сохранить только один раз на аккаунт.");
  renderSavedState();
  renderPreview();
}

function setAppearanceLockedState(isLocked) {
  const editorInputs = editorPanel.querySelectorAll("input, select, button");
  editorInputs.forEach((element) => {
    if (element.id === "save-appearance-button") {
      return;
    }

    element.disabled = Boolean(isLocked);
  });

  if (saveAppearanceButton) {
    saveAppearanceButton.disabled = !authState.sessionToken || Boolean(isLocked);
    saveAppearanceButton.textContent = isLocked ? "Окрас сохранён" : "Сохранить окрас";
  }
}

function renderSavedState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    savedDataNode.textContent = "Пока ничего не сохранено.";
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    savedDataNode.textContent = JSON.stringify(parsed, null, 2);
  } catch (_error) {
    savedDataNode.textContent = "Данные в localStorage повреждены.";
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  if (typeof hex !== "string") {
    return null;
  }

  const normalized = hex.trim().replace("#", "");
  if (normalized.length !== 6) {
    return null;
  }

  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) {
    return null;
  }

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixRgb(first, second, amount) {
  const t = clamp(amount, 0, 1);
  return {
    r: first.r + (second.r - first.r) * t,
    g: first.g + (second.g - first.g) * t,
    b: first.b + (second.b - first.b) * t,
  };
}

function grayscale(rgb) {
  const value = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
  return { r: value, g: value, b: value };
}

function colorDistance(first, second) {
  const dr = first.r - second.r;
  const dg = first.g - second.g;
  const db = first.b - second.b;
  return dr * dr + dg * dg + db * db;
}

function interpolatePaletteStops(stops, point) {
  const t = clamp(point, 0, 1);
  let previous = stops[0];

  for (let index = 1; index < stops.length; index += 1) {
    const current = stops[index];
    if (t <= current.t) {
      const localRange = current.t - previous.t || 1;
      const localT = (t - previous.t) / localRange;
      return mixRgb(hexToRgb(previous.color), hexToRgb(current.color), localT);
    }
    previous = current;
  }

  return hexToRgb(stops[stops.length - 1].color);
}

function naturalColorFromPoint(x, y) {
  const nx = clamp(x, 0, 1);
  const ny = clamp(y, 0, 1);

  const offWhite = hexToRgb("#faf6f0");
  const nearBlack = hexToRgb("#181413");

  let color = interpolatePaletteStops(NATURAL_PALETTE_STOPS, nx);
  const gray = grayscale(color);
  color = mixRgb(color, gray, 0.14 + Math.abs(ny - 0.5) * 0.22);

  if (nx < 0.24) {
    color = mixRgb(color, gray, 0.4);
  }

  if (ny < 0.5) {
    color = mixRgb(color, offWhite, ((0.5 - ny) / 0.5) * 0.88);
  } else {
    color = mixRgb(color, nearBlack, ((ny - 0.5) / 0.5) * 0.9);
  }

  return rgbToHex(color);
}

function findNearestNaturalPalettePoint(colorHex) {
  const normalizedHex = typeof colorHex === "string" ? colorHex.toLowerCase() : DEFAULT_NATURAL_WHITE;
  if (naturalPalettePointCache.has(normalizedHex)) {
    return naturalPalettePointCache.get(normalizedHex);
  }

  const target = hexToRgb(normalizedHex) || hexToRgb(DEFAULT_NATURAL_WHITE);
  let bestMatch = {
    x: 0.02,
    y: 0.08,
    hex: DEFAULT_NATURAL_WHITE,
    distance: Number.POSITIVE_INFINITY,
  };

  for (let yIndex = 0; yIndex <= 40; yIndex += 1) {
    const y = yIndex / 40;
    for (let xIndex = 0; xIndex <= 60; xIndex += 1) {
      const x = xIndex / 60;
      const hex = naturalColorFromPoint(x, y);
      const distance = colorDistance(target, hexToRgb(hex));
      if (distance < bestMatch.distance) {
        bestMatch = { x, y, hex, distance };
      }
    }
  }

  naturalPalettePointCache.set(normalizedHex, bestMatch);
  return bestMatch;
}

function normalizeNaturalColor(colorHex) {
  return findNearestNaturalPalettePoint(colorHex).hex;
}

function normalizeHexInput(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/[^0-9a-fA-F]/g, "");
  if (normalized.length !== 6) {
    return null;
  }

  return `#${normalized.toLowerCase()}`;
}

function getNaturalPaletteCanvas() {
  if (naturalPaletteSurface.canvas) {
    return naturalPaletteSurface.canvas;
  }

  const canvas = document.createElement("canvas");
  canvas.width = NATURAL_PICKER_WIDTH;
  canvas.height = NATURAL_PICKER_HEIGHT;
  const context = canvas.getContext("2d");
  const imageData = context.createImageData(canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      const hex = naturalColorFromPoint(
        x / (canvas.width - 1),
        y / (canvas.height - 1),
      );
      const rgb = hexToRgb(hex);
      imageData.data[offset] = rgb.r;
      imageData.data[offset + 1] = rgb.g;
      imageData.data[offset + 2] = rgb.b;
      imageData.data[offset + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);
  naturalPaletteSurface.canvas = canvas;
  return canvas;
}

function drawNaturalPalette(canvas, point) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(getNaturalPaletteCanvas(), 0, 0, canvas.width, canvas.height);

  const knobX = point.x * (canvas.width - 1);
  const knobY = point.y * (canvas.height - 1);

  context.beginPath();
  context.arc(knobX, knobY, 8, 0, Math.PI * 2);
  context.fillStyle = "rgba(255, 251, 243, 0.92)";
  context.fill();
  context.lineWidth = 2.5;
  context.strokeStyle = "rgba(32, 21, 14, 0.92)";
  context.stroke();

  context.beginPath();
  context.arc(knobX, knobY, 11, 0, Math.PI * 2);
  context.lineWidth = 1;
  context.strokeStyle = "rgba(255, 255, 255, 0.55)";
  context.stroke();
}

function closeNaturalColorPanels(exceptControl = null) {
  document.querySelectorAll(".natural-color-control.is-open").forEach((node) => {
    if (node !== exceptControl) {
      node.classList.remove("is-open");
    }
  });
}

function updateNaturalColorControl(input) {
  const control = naturalColorControls.get(input);
  if (!control) {
    return;
  }

  const point = control.dragging && control.point
    ? {
        x: control.point.x,
        y: control.point.y,
        hex: input.value,
      }
    : findNearestNaturalPalettePoint(input.value);

  control.point = { x: point.x, y: point.y };
  control.swatch.style.background = input.value;
  control.text.textContent = input.value.toUpperCase();
  control.hexInput.value = input.value.toUpperCase();
  drawNaturalPalette(control.canvas, control.point);
}

function enhanceNaturalColorInput(input) {
  if (!input) {
    return;
  }

  if (input.dataset.naturalColorEnhanced === "true") {
    updateNaturalColorControl(input);
    return;
  }

  if (!naturalPickerGlobalsBound) {
    document.addEventListener("pointerdown", (event) => {
      if (!event.target.closest(".natural-color-control")) {
        closeNaturalColorPanels();
      }
    });
    naturalPickerGlobalsBound = true;
  }

  input.dataset.naturalColorEnhanced = "true";
  input.dataset.originalInputType = input.type;
  input.type = "hidden";
  input.classList.add("native-color-input");

  const wrapper = document.createElement("div");
  wrapper.className = "natural-color-control";

  const button = document.createElement("button");
  button.className = "natural-color-button";
  button.type = "button";

  const swatch = document.createElement("span");
  swatch.className = "natural-color-swatch";

  const text = document.createElement("span");
  text.className = "natural-color-text";

  const panel = document.createElement("div");
  panel.className = "natural-color-panel";

  const canvas = document.createElement("canvas");
  canvas.className = "natural-color-canvas";
  canvas.width = NATURAL_PICKER_WIDTH;
  canvas.height = NATURAL_PICKER_HEIGHT;

  const meta = document.createElement("div");
  meta.className = "natural-color-meta";

  const metaRow = document.createElement("div");
  metaRow.className = "natural-color-meta-row";

  const hexInput = document.createElement("input");
  hexInput.className = "natural-color-hex";
  hexInput.type = "text";
  hexInput.inputMode = "text";
  hexInput.maxLength = 7;
  hexInput.spellcheck = false;

  const copyButton = document.createElement("button");
  copyButton.className = "natural-color-copy";
  copyButton.type = "button";
  copyButton.textContent = "Копия";

  const hint = document.createElement("div");
  hint.className = "natural-color-hint";
  hint.textContent = "Можно двигать кружок или ввести HEX. Цвет всё равно останется в природной палитре.";

  button.append(swatch, text);
  metaRow.append(hexInput, copyButton);
  meta.append(metaRow, hint);
  panel.append(canvas, meta);

  const parent = input.parentNode;
  parent.insertBefore(wrapper, input);
  wrapper.append(input, button, panel);

  const control = {
    wrapper,
    button,
    swatch,
    text,
    panel,
    canvas,
    hexInput,
    copyButton,
    point: findNearestNaturalPalettePoint(input.value),
    dragging: false,
  };

  naturalColorControls.set(input, control);

  const applyPointerColor = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const color = naturalColorFromPoint(x, y);

    input.value = color;
    control.point = { x, y };
    control.dragging = true;
    control.swatch.style.background = color;
    control.text.textContent = color.toUpperCase();
    control.hexInput.value = color.toUpperCase();
    drawNaturalPalette(canvas, control.point);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const shouldOpen = !wrapper.classList.contains("is-open");
    closeNaturalColorPanels(shouldOpen ? wrapper : null);
    wrapper.classList.toggle("is-open", shouldOpen);
    if (shouldOpen) {
      updateNaturalColorControl(input);
    }
  });

  panel.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    closeNaturalColorPanels(wrapper);
    wrapper.classList.add("is-open");
    if (typeof canvas.setPointerCapture === "function") {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (_error) {
        // Ignore pointer-capture failures on unsupported browsers.
      }
    }
    applyPointerColor(event);

    const handleMove = (moveEvent) => {
      applyPointerColor(moveEvent);
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      if (typeof canvas.releasePointerCapture === "function") {
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch (_error) {
          // Ignore pointer-capture failures on unsupported browsers.
        }
      }
      input.dispatchEvent(new Event("change", { bubbles: true }));
      control.dragging = false;
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  });

  input.addEventListener("input", () => updateNaturalColorControl(input));
  input.addEventListener("change", () => updateNaturalColorControl(input));

  hexInput.addEventListener("input", () => {
    const normalized = normalizeHexInput(hexInput.value);
    if (!normalized) {
      return;
    }

    const color = normalizeNaturalColor(normalized);
    input.value = color;
    control.dragging = false;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  hexInput.addEventListener("change", () => {
    const normalized = normalizeHexInput(hexInput.value);
    const color = normalizeNaturalColor(normalized || input.value);
    input.value = color;
    hexInput.value = color.toUpperCase();
    control.dragging = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(input.value.toUpperCase());
      copyButton.textContent = "Скоп.";
      window.setTimeout(() => {
        copyButton.textContent = "Копия";
      }, 900);
    } catch (_error) {
      hexInput.focus();
      hexInput.select();
    }
  });

  updateNaturalColorControl(input);
}

function refreshNaturalColorInputs(root = document) {
  root.querySelectorAll("input[type='color']").forEach((input) => {
    enhanceNaturalColorInput(input);
  });
}

async function saveRegistration() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const passwordConfirm = passwordConfirmInput.value;
  const characterName = characterNameInput.value.trim();

  if (!email || !password || !passwordConfirm || !characterName) {
    setStatus("Заполните обязательные поля.", true);
    return;
  }

  if (password.length < 6) {
    setStatus("Пароль должен быть не короче 6 символов.", true);
    return;
  }

  if (password !== passwordConfirm) {
    setStatus("Пароли не совпадают.", true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        characterName,
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Не удалось зарегистрироваться.");
    }

    setAuthenticated(payload);
    passwordInput.value = "";
    passwordConfirmInput.value = "";
    setStatus("Аккаунт зарегистрирован. Редактор внешности открыт.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось зарегистрироваться.";
    setStatus(message, true);
  }
}

async function login() {
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;

  if (!email || !password) {
    setStatus("Введите email и пароль.", true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Не удалось войти.");
    }

    setAuthenticated(payload);
    loginPasswordInput.value = "";
    setStatus("Вход выполнен. Редактор внешности открыт.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось войти.";
    setStatus(message, true);
  }
}

async function restoreSession() {
  if (!authState.sessionToken) {
    clearAuthState();
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/me`, {
      headers: {
        Authorization: `Bearer ${authState.sessionToken}`,
        Accept: "application/json",
      },
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Сессия недействительна.");
    }

    setAuthenticated(payload);
  } catch (_error) {
    clearAuthState();
  }
}

async function saveAppearance() {
  if (!authState.sessionToken) {
    setAppearanceStatus("Сначала нужно войти на сайт.", true);
    return;
  }

  if (authState.character?.appearanceLocked) {
    setAppearanceStatus("Окрас уже зафиксирован и не может быть изменён.", true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/me/appearance`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authState.sessionToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        appearance: buildAppearancePayload(),
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Не удалось сохранить окрас.");
    }

    setAuthenticated(payload);
    setAppearanceStatus("Окрас сохранён. Теперь он зафиксирован за персонажем.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить окрас.";
    setAppearanceStatus(message, true);
  }
}

function ensureMinimumSlots(slots, minCount) {
  const normalized = Array.isArray(slots)
    ? slots.map((slot) => ({
        pattern_id: typeof slot.pattern_id === "string" ? slot.pattern_id : "none",
        color: normalizeNaturalColor(typeof slot.color === "string" ? slot.color : DEFAULT_NATURAL_WHITE),
      }))
    : [];

  while (normalized.length < minCount) {
    normalized.push(createPatternSlot());
  }

  return normalized;
}

function loadDraftAppearance() {
  const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    appearanceState.body_color = normalizeNaturalColor(parsed.body_color || appearanceState.body_color);
    appearanceState.nose_color = normalizeNaturalColor(parsed.nose_color || appearanceState.nose_color);
    appearanceState.eye_color = normalizeNaturalColor(parsed.eye_color || appearanceState.eye_color);
    appearanceState.ears_id = parsed.ears_id || appearanceState.ears_id;
    appearanceState.ears_color = normalizeNaturalColor(parsed.ears_color || appearanceState.ears_color);
    appearanceState.tail_id = parsed.tail_id || appearanceState.tail_id;
    appearanceState.tail_color = normalizeNaturalColor(parsed.tail_color || appearanceState.tail_color);
    appearanceState.mane_id = parsed.mane_id || appearanceState.mane_id;
    appearanceState.mane_color = normalizeNaturalColor(parsed.mane_color || appearanceState.mane_color);
    appearanceState.cheeks_id = parsed.cheeks_id || appearanceState.cheeks_id;

    if (Array.isArray(parsed.body_pattern_slots)) {
      appearanceState.body_pattern_slots = ensureMinimumSlots(parsed.body_pattern_slots, 1);
    }

    if (Array.isArray(parsed.tail_pattern_slots)) {
      appearanceState.tail_pattern_slots = ensureMinimumSlots(parsed.tail_pattern_slots, 1);
    }
  } catch (_error) {
    localStorage.removeItem(APPEARANCE_STORAGE_KEY);
  }

  appearanceState.body_pattern_slots = ensureMinimumSlots(appearanceState.body_pattern_slots, 1);
  appearanceState.tail_pattern_slots = ensureMinimumSlots(appearanceState.tail_pattern_slots, 1);
  normalizeTailPatternSlots();
}

function saveDraftAppearance() {
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearanceState));
}

function getTailPatternOptions() {
  return TAIL_PATTERN_OPTIONS_BY_TAIL[appearanceState.tail_id] || [{ id: "none", label: "Без паттерна" }];
}

function normalizeTailPatternSlots() {
  const allowedIds = new Set(getTailPatternOptions().map((option) => option.id));
  appearanceState.tail_pattern_slots = ensureMinimumSlots(appearanceState.tail_pattern_slots, 1).map((slot) => {
    if (!allowedIds.has(slot.pattern_id)) {
      return {
        pattern_id: "none",
        color: slot.color,
      };
    }

    return slot;
  });
}

function syncControlsFromState() {
  bodyColorInput.value = appearanceState.body_color;
  noseColorInput.value = appearanceState.nose_color;
  eyeColorInput.value = appearanceState.eye_color;
  earsSelect.value = appearanceState.ears_id;
  earsColorInput.value = appearanceState.ears_color;
  tailSelect.value = appearanceState.tail_id;
  tailColorInput.value = appearanceState.tail_color;
  maneSelect.value = appearanceState.mane_id;
  maneColorInput.value = appearanceState.mane_color;
  cheeksSelect.value = appearanceState.cheeks_id;
}

function syncStateFromControls() {
  appearanceState.body_color = bodyColorInput.value;
  appearanceState.nose_color = noseColorInput.value;
  appearanceState.eye_color = eyeColorInput.value;
  appearanceState.ears_id = earsSelect.value;
  appearanceState.ears_color = earsColorInput.value;
  appearanceState.tail_id = tailSelect.value;
  appearanceState.tail_color = tailColorInput.value;
  appearanceState.mane_id = maneSelect.value;
  appearanceState.mane_color = maneColorInput.value;
  appearanceState.cheeks_id = cheeksSelect.value;
  normalizeTailPatternSlots();
}

function createOptionsMarkup(options, selectedId) {
  return options
    .map((option) => `<option value="${option.id}"${option.id === selectedId ? " selected" : ""}>${option.label}</option>`)
    .join("");
}

function createPatternSlotMarkup(kind, slotIndex, slot, options, maxIndex, canRemove) {
  const title = kind === "body" ? `Слой базы ${slotIndex + 1}` : `Слой хвоста ${slotIndex + 1}`;

  return `
    <div class="pattern-slot" data-slot-kind="${kind}" data-slot-index="${slotIndex}">
      <div class="pattern-slot-top">
        <span class="pattern-slot-title">${title}</span>
        <div class="slot-actions">
          <button class="slot-button" type="button" data-action="move-up" ${slotIndex === 0 ? "disabled" : ""}>↑</button>
          <button class="slot-button" type="button" data-action="move-down" ${slotIndex === maxIndex ? "disabled" : ""}>↓</button>
          <button class="slot-button slot-button-remove" type="button" data-action="remove-slot" ${canRemove ? "" : "disabled"}>×</button>
        </div>
      </div>
      <div class="slot-fields">
        <label class="field">
          <span>Паттерн</span>
          <select data-role="select">
            ${createOptionsMarkup(options, slot.pattern_id)}
          </select>
        </label>
        <label class="field">
          <span>Цвет</span>
          <input data-role="color" type="color" value="${slot.color}">
        </label>
      </div>
    </div>
  `;
}

function bindPatternSlotEvents(container, kind) {
  const slots = kind === "body" ? appearanceState.body_pattern_slots : appearanceState.tail_pattern_slots;

  container.querySelectorAll("[data-role='select']").forEach((node) => {
    node.addEventListener("change", (event) => {
      const slotNode = event.currentTarget.closest(".pattern-slot");
      const slotIndex = Number(slotNode.dataset.slotIndex);
      slots[slotIndex].pattern_id = event.currentTarget.value;
      renderEditor();
    });
  });

  container.querySelectorAll("[data-role='color']").forEach((node) => {
    const updateColor = (event) => {
      const slotNode = event.currentTarget.closest(".pattern-slot");
      const slotIndex = Number(slotNode.dataset.slotIndex);
      slots[slotIndex].color = event.currentTarget.value;
      refreshAppearanceOutput();
    };

    node.addEventListener("input", updateColor);
    node.addEventListener("change", updateColor);
  });

  container.querySelectorAll("[data-action='move-up']").forEach((button) => {
    button.addEventListener("click", (event) => {
      const slotNode = event.currentTarget.closest(".pattern-slot");
      const slotIndex = Number(slotNode.dataset.slotIndex);
      if (slotIndex <= 0) {
        return;
      }

      [slots[slotIndex - 1], slots[slotIndex]] = [slots[slotIndex], slots[slotIndex - 1]];
      renderEditor();
    });
  });

  container.querySelectorAll("[data-action='move-down']").forEach((button) => {
    button.addEventListener("click", (event) => {
      const slotNode = event.currentTarget.closest(".pattern-slot");
      const slotIndex = Number(slotNode.dataset.slotIndex);
      if (slotIndex >= slots.length - 1) {
        return;
      }

      [slots[slotIndex + 1], slots[slotIndex]] = [slots[slotIndex], slots[slotIndex + 1]];
      renderEditor();
    });
  });

  container.querySelectorAll("[data-action='remove-slot']").forEach((button) => {
    button.addEventListener("click", (event) => {
      const slotNode = event.currentTarget.closest(".pattern-slot");
      const slotIndex = Number(slotNode.dataset.slotIndex);
      if (slots.length <= 1) {
        slots[slotIndex] = createPatternSlot();
      } else {
        slots.splice(slotIndex, 1);
      }
      renderEditor();
    });
  });
}

function renderPatternSlotControls() {
  bodyPatternSlotsNode.innerHTML = appearanceState.body_pattern_slots
    .map((slot, index) =>
      createPatternSlotMarkup(
        "body",
        index,
        slot,
        BODY_PATTERN_OPTIONS,
        appearanceState.body_pattern_slots.length - 1,
        appearanceState.body_pattern_slots.length > 1,
      ),
    )
    .join("");

  const tailOptions = getTailPatternOptions();
  tailPatternSlotsNode.innerHTML = appearanceState.tail_pattern_slots
    .map((slot, index) =>
      createPatternSlotMarkup(
        "tail",
        index,
        slot,
        tailOptions,
        appearanceState.tail_pattern_slots.length - 1,
        appearanceState.tail_pattern_slots.length > 1,
      ),
    )
    .join("");

  bindPatternSlotEvents(bodyPatternSlotsNode, "body");
  bindPatternSlotEvents(tailPatternSlotsNode, "tail");
  refreshNaturalColorInputs(bodyPatternSlotsNode);
  refreshNaturalColorInputs(tailPatternSlotsNode);
}

function buildAppearancePayload() {
  return {
    body: {
      base_id: "bodybase",
      shadow_id: "bodybaseshadow",
      contour_id: "bodybaseco",
      color: appearanceState.body_color,
    },
    eyes: {
      base_id: "eyeswhite",
      color: appearanceState.eye_color,
    },
    nose: {
      mask_id: "pattern12nose",
      color: appearanceState.nose_color,
    },
    ears: {
      id: appearanceState.ears_id,
      contour_id: `${appearanceState.ears_id}co`,
      color: appearanceState.ears_color,
    },
    tail: {
      id: appearanceState.tail_id,
      shadow_id: `${appearanceState.tail_id}shadow`,
      contour_id: `${appearanceState.tail_id}co`,
      color: appearanceState.tail_color,
    },
    mane: appearanceState.mane_id === "none"
      ? null
      : {
          id: appearanceState.mane_id,
          contour_id: `${appearanceState.mane_id}co`,
          color: appearanceState.mane_color,
        },
    cheeks: appearanceState.cheeks_id === "none"
      ? null
      : {
          id: appearanceState.cheeks_id,
        },
    body_pattern_layers: appearanceState.body_pattern_slots
      .filter((slot) => slot.pattern_id !== "none")
      .map((slot, index) => ({
        layer: index + 1,
        id: slot.pattern_id,
        color: slot.color,
      })),
    tail_pattern_layers: appearanceState.tail_pattern_slots
      .filter((slot) => slot.pattern_id !== "none")
      .map((slot, index) => ({
        layer: index + 1,
        id: slot.pattern_id,
        color: slot.color,
      })),
  };
}

function applyAppearancePayloadToState(payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }

  appearanceState.body_color = normalizeNaturalColor(payload.body?.color || appearanceState.body_color);
  appearanceState.eye_color = normalizeNaturalColor(payload.eyes?.color || appearanceState.eye_color);
  appearanceState.nose_color = normalizeNaturalColor(payload.nose?.color || appearanceState.nose_color);
  appearanceState.ears_id = payload.ears?.id || appearanceState.ears_id;
  appearanceState.ears_color = normalizeNaturalColor(payload.ears?.color || appearanceState.ears_color);
  appearanceState.tail_id = payload.tail?.id || appearanceState.tail_id;
  appearanceState.tail_color = normalizeNaturalColor(payload.tail?.color || appearanceState.tail_color);
  appearanceState.mane_id = payload.mane?.id || "none";
  appearanceState.mane_color = normalizeNaturalColor(payload.mane?.color || appearanceState.mane_color);
  appearanceState.cheeks_id = payload.cheeks?.id || "none";
  appearanceState.body_pattern_slots = ensureMinimumSlots(
    Array.isArray(payload.body_pattern_layers)
      ? payload.body_pattern_layers.map((layer) => ({
          pattern_id: typeof layer?.id === "string" ? layer.id : "none",
          color: normalizeNaturalColor(typeof layer?.color === "string" ? layer.color : DEFAULT_NATURAL_WHITE),
        }))
      : [],
    1,
  );
  appearanceState.tail_pattern_slots = ensureMinimumSlots(
    Array.isArray(payload.tail_pattern_layers)
      ? payload.tail_pattern_layers.map((layer) => ({
          pattern_id: typeof layer?.id === "string" ? layer.id : "none",
          color: normalizeNaturalColor(typeof layer?.color === "string" ? layer.color : DEFAULT_NATURAL_WHITE),
        }))
      : [],
    1,
  );
  normalizeTailPatternSlots();
}

function renderAppearancePayload() {
  const payload = buildAppearancePayload();
  appearancePayloadNode.textContent = JSON.stringify(payload, null, 2);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    image.src = src;
  });
}

async function bootPreviewAssets() {
  await Promise.all(
    Object.entries(previewAssets).map(async ([key, src]) => {
      loadedImages[key] = await loadImage(src);
    }),
  );

  const baseImage = loadedImages.bodyBase;
  previewCanvas.width = baseImage.naturalWidth;
  previewCanvas.height = baseImage.naturalHeight;
  previewReady = true;
}

function drawPlainLayer(targetContext, image, width, height) {
  if (!image) {
    return;
  }
  targetContext.drawImage(image, 0, 0, width, height);
}

function drawTintedLayer(targetContext, image, color, width, height) {
  if (!image) {
    return;
  }

  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = width;
  offscreenCanvas.height = height;
  const offscreenContext = offscreenCanvas.getContext("2d");

  offscreenContext.clearRect(0, 0, width, height);
  offscreenContext.fillStyle = color;
  offscreenContext.fillRect(0, 0, width, height);
  offscreenContext.globalCompositeOperation = "multiply";
  offscreenContext.drawImage(image, 0, 0, width, height);
  offscreenContext.globalCompositeOperation = "destination-in";
  offscreenContext.drawImage(image, 0, 0, width, height);

  targetContext.drawImage(offscreenCanvas, 0, 0, width, height);
}

function tailBaseKey() {
  return appearanceState.tail_id.replace("tails", "tail");
}

function tailShadowKey() {
  return `${tailBaseKey()}Shadow`;
}

function tailContourKey() {
  return `${tailBaseKey()}Contour`;
}

function earsKey() {
  return appearanceState.ears_id.replace("ears", "ear");
}

function earsContourKey() {
  return `${earsKey()}Contour`;
}

function maneKey() {
  return appearanceState.mane_id.replace("manes", "mane");
}

function maneContourKey() {
  return `${maneKey()}Contour`;
}

function renderPreview() {
  if (!previewReady) {
    return;
  }

  const context = previewCanvas.getContext("2d");
  const width = previewCanvas.width;
  const height = previewCanvas.height;

  context.clearRect(0, 0, width, height);

  drawTintedLayer(context, loadedImages[tailBaseKey()], appearanceState.tail_color, width, height);
  for (const slot of appearanceState.tail_pattern_slots) {
    if (slot.pattern_id === "none") {
      continue;
    }
    drawTintedLayer(context, loadedImages[slot.pattern_id], slot.color, width, height);
  }
  drawPlainLayer(context, loadedImages[tailShadowKey()], width, height);
  drawPlainLayer(context, loadedImages[tailContourKey()], width, height);

  drawTintedLayer(context, loadedImages.bodyBase, appearanceState.body_color, width, height);
  for (const slot of appearanceState.body_pattern_slots) {
    if (slot.pattern_id === "none") {
      continue;
    }
    drawTintedLayer(context, loadedImages[slot.pattern_id], slot.color, width, height);
  }

  drawTintedLayer(context, loadedImages.eyesBase, appearanceState.eye_color, width, height);
  drawTintedLayer(context, loadedImages.noseMask, appearanceState.nose_color, width, height);
  drawPlainLayer(context, loadedImages.bodyShadow, width, height);
  drawPlainLayer(context, loadedImages.bodyContour, width, height);

  if (appearanceState.cheeks_id !== "none") {
    drawPlainLayer(context, loadedImages[appearanceState.cheeks_id], width, height);
  }

  if (appearanceState.mane_id !== "none") {
    drawTintedLayer(context, loadedImages[maneKey()], appearanceState.mane_color, width, height);
    drawPlainLayer(context, loadedImages[maneContourKey()], width, height);
  }

  drawTintedLayer(context, loadedImages[earsKey()], appearanceState.ears_color, width, height);
  drawPlainLayer(context, loadedImages[earsContourKey()], width, height);

  previewNameNode.textContent = authState.character?.name || characterNameInput.value.trim() || "Player";
}

function refreshAppearanceOutput() {
  saveDraftAppearance();
  renderAppearancePayload();
  renderPreview();
}

function renderEditor() {
  syncControlsFromState();
  renderPatternSlotControls();
  refreshNaturalColorInputs(editorPanel);
  refreshAppearanceOutput();
}

function addPatternSlot(kind) {
  const slots = kind === "body" ? appearanceState.body_pattern_slots : appearanceState.tail_pattern_slots;
  slots.push(createPatternSlot());
  renderEditor();
}

function bindStaticEditorEvents() {
  const liveInputs = [
    bodyColorInput,
    noseColorInput,
    eyeColorInput,
    earsColorInput,
    tailColorInput,
    maneColorInput,
    characterNameInput,
  ];

  for (const input of liveInputs) {
    input.addEventListener("input", () => {
      syncStateFromControls();
      refreshAppearanceOutput();
    });
    input.addEventListener("change", () => {
      syncStateFromControls();
      refreshAppearanceOutput();
    });
  }

  const structuralInputs = [
    earsSelect,
    tailSelect,
    maneSelect,
    cheeksSelect,
  ];

  for (const input of structuralInputs) {
    input.addEventListener("input", () => {
      syncStateFromControls();
      renderEditor();
    });
    input.addEventListener("change", () => {
      syncStateFromControls();
      renderEditor();
    });
  }

bodyPatternAddButton?.addEventListener("click", () => addPatternSlot("body"));
tailPatternAddButton?.addEventListener("click", () => addPatternSlot("tail"));
saveAppearanceButton?.addEventListener("click", () => {
  void saveAppearance();
});
refreshNaturalColorInputs(editorPanel);
}

showRegisterButton.addEventListener("click", () => setAuthMode("register"));
showLoginButton.addEventListener("click", () => setAuthMode("login"));
logoutButton.addEventListener("click", () => {
  clearAuthState();
  setStatus("Вы вышли из аккаунта.");
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveRegistration();
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void login();
});

renderSavedState();
loadDraftAppearance();
syncControlsFromState();
bindStaticEditorEvents();
renderAppearancePayload();
setAppearanceLockedState(false);
setAppearanceStatus("Окрас можно сохранить только один раз на аккаунт.");
setAuthMode("register");

bootPreviewAssets()
  .then(() => restoreSession())
  .then(() => {
    renderEditor();
  })
  .catch((error) => {
    appearancePayloadNode.textContent = error instanceof Error ? error.message : "Не удалось запустить предпросмотр.";
  });
