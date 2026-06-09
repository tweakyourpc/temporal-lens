import { getSettings } from "../utils/settings.js";

const form = document.getElementById("settings-form");
const statusElement = document.getElementById("status");
const thresholdInput = document.getElementById("confidence-threshold");
const thresholdValue = document.getElementById("threshold-value");

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await getSettings();
  populateForm(settings);
  updateThresholdLabel();
});

thresholdInput.addEventListener("input", updateThresholdLabel);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving...");

  const payload = {
    chipColor: document.getElementById("chip-color").value,
    confidenceThreshold: Number(thresholdInput.value),
    enabled: document.getElementById("enabled").checked,
    showMediumConfidence: document.getElementById("show-medium-confidence").checked,
    platforms: {
      discord: document.getElementById("platform-discord").checked,
      slack: document.getElementById("platform-slack").checked,
      web: document.getElementById("platform-web").checked,
    },
  };

  const response = await chrome.runtime.sendMessage({
    type: "temporalLens:saveSettings",
    settings: payload,
  });

  if (response?.error) {
    setStatus(response.error);
    return;
  }

  populateForm(response.settings);
  setStatus("Settings saved.");
});

function populateForm(settings) {
  document.getElementById("enabled").checked = settings.enabled;
  thresholdInput.value = String(settings.confidenceThreshold);
  document.getElementById("show-medium-confidence").checked = settings.showMediumConfidence;
  document.getElementById("platform-discord").checked = settings.platforms.discord;
  document.getElementById("platform-slack").checked = settings.platforms.slack;
  document.getElementById("platform-web").checked = settings.platforms.web;
  document.getElementById("chip-color").value = settings.chipColor;
  updateThresholdLabel();
}

function updateThresholdLabel() {
  thresholdValue.value = Number(thresholdInput.value).toFixed(2);
}

function setStatus(message) {
  statusElement.textContent = message;
}
