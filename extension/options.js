const DEFAULT_API_BASE = "https://eye-analysis.online/api/v1";
const input = document.getElementById("api-base");

chrome.storage.local.get(["apiBase"], ({ apiBase }) => {
  input.value = apiBase || DEFAULT_API_BASE;
});

document.getElementById("save-btn").addEventListener("click", async () => {
  await chrome.storage.local.set({ apiBase: input.value.trim() || DEFAULT_API_BASE });
  const saved = document.getElementById("saved");
  saved.style.display = "block";
  setTimeout(() => (saved.style.display = "none"), 1500);
});
