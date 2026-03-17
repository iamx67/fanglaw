const STORAGE_KEY = "fanglaw.site.prototype.account";
const SESSION_TOKEN_STORAGE_KEY = "fanglaw.site.session_token";
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
const statusNode = document.getElementById("form-status");
const savedDataNode = document.getElementById("saved-data");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const passwordConfirmInput = document.getElementById("password-confirm");
const characterNameInput = document.getElementById("character-name");

function setStatus(text, isError = false) {
  statusNode.textContent = text;
  statusNode.style.color = isError ? "#8f2118" : "#8d4122";
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
        "Accept": "application/json",
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

    localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, payload.sessionToken);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setStatus("Аккаунт зарегистрирован. Session token сохранён в браузере.");
    passwordInput.value = "";
    passwordConfirmInput.value = "";
    renderSavedState();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось зарегистрироваться.";
    setStatus(message, true);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveRegistration();
});

renderSavedState();
