// Get DOM elements
const timerDisplay = document.getElementById("timer-display");
const startBtn = document.getElementById("start-btn");
const pauseBtn = document.getElementById("pause-btn");
const resetBtn = document.getElementById("reset-btn");
const stopBtn = document.getElementById("stop-btn"); // Added stop button functionality
const modeButtons = document.querySelectorAll(".mode-btn");
const pomodoroDurationInput = document.getElementById("pomodoro-duration");
const shortBreakDurationInput = document.getElementById("short-break-duration");
const longBreakDurationInput = document.getElementById("long-break-duration");
const applySettingsBtn = document.getElementById("apply-settings-btn");
const beepSound = document.getElementById("beep-sound");

// Timer state variables
let timerInterval = null;
let timeLeft = 0; // Will be set based on mode
let currentMode = "pomodoro"; // 'pomodoro', 'shortBreak', 'longBreak'
let isPaused = true; // Timer starts paused

// Default durations (in minutes) - these can be updated by settings
let durations = {
  pomodoro: 25,
  shortBreak: 5,
  longBreak: 15,
};

// --- Helper Functions ---

// Update Timer Display (formats seconds into MM:SS)
function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  // Pad with leading zero if needed
  timerDisplay.textContent = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
  // Update browser tab title
  document.title = `${timerDisplay.textContent} - ${
    currentMode.charAt(0).toUpperCase() +
    currentMode.slice(1).replace("B", " B")
  } Timer`;
}

// Play the beep sound
function playBeep() {
  beepSound.currentTime = 0; // Rewind to start in case it's still playing
  beepSound
    .play()
    .catch((error) => console.error("Error playing sound:", error));
  // Browsers might block autoplay without user interaction.
  // A click (like start) usually grants permission.
}

// --- Core Timer Logic ---

// The countdown function called every second
function countdown() {
  if (timeLeft <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    isPaused = true;
    playBeep();
    // Optional: Automatically switch to the next mode?
    // For simplicity, we just stop here. User can select next mode.
    alert(
      `${
        currentMode.charAt(0).toUpperCase() +
        currentMode.slice(1).replace("B", " B")
      } finished!`
    );
    updateTimerDisplay(); // Ensure display shows 00:00
    return;
  }
  timeLeft--;
  updateTimerDisplay();
}

// --- Control Functions ---

function startTimer() {
  if (isPaused) {
    // Only start if there's time left and it's currently paused
    if (timeLeft <= 0) {
      resetTimer(); // Reset to current mode's duration if timer ended
    }
    isPaused = false;
    // Clear any residual interval before starting a new one
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(countdown, 1000);
    console.log("Timer started");
  }
}

function pauseTimer() {
  if (!isPaused && timerInterval) {
    isPaused = true;
    clearInterval(timerInterval);
    timerInterval = null;
    console.log("Timer paused");
  }
}

// Reset the timer to the beginning of the CURRENT mode
function resetTimer() {
  pauseTimer(); // Stop the interval if running
  isPaused = true;
  timeLeft = durations[currentMode] * 60; // Reset time based on current mode
  updateTimerDisplay();
  console.log(`Timer reset for ${currentMode}`);
}

// Stop the timer completely and reset to default Pomodoro mode
function stopTimer() {
  pauseTimer(); // Stop interval
  isPaused = true;
  currentMode = "pomodoro"; // Force back to Pomodoro mode
  setActiveModeButton(currentMode);
  timeLeft = durations.pomodoro * 60; // Reset time to Pomodoro duration
  updateTimerDisplay();
  console.log("Timer stopped and reset to Pomodoro");
}

// --- Mode Switching ---

function switchMode(newMode) {
  pauseTimer(); // Stop current timer when switching modes
  isPaused = true;
  currentMode = newMode;
  timeLeft = durations[currentMode] * 60; // Set time for the new mode
  setActiveModeButton(newMode);
  updateTimerDisplay();
  console.log(`Switched to ${currentMode} mode`);
}

// Update which mode button looks active
function setActiveModeButton(activeMode) {
  modeButtons.forEach((button) => {
    if (button.dataset.mode === activeMode) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });
}

// --- Settings ---

function applySettings() {
  const newPomodoro = parseInt(pomodoroDurationInput.value, 10);
  const newShortBreak = parseInt(shortBreakDurationInput.value, 10);
  const newLongBreak = parseInt(longBreakDurationInput.value, 10);

  // Basic validation
  if (
    isNaN(newPomodoro) ||
    newPomodoro < 1 ||
    isNaN(newShortBreak) ||
    newShortBreak < 1 ||
    isNaN(newLongBreak) ||
    newLongBreak < 1
  ) {
    alert("Please enter valid durations (minimum 1 minute).");
    // Optional: Reset inputs to current values
    pomodoroDurationInput.value = durations.pomodoro;
    shortBreakDurationInput.value = durations.shortBreak;
    longBreakDurationInput.value = durations.longBreak;
    return;
  }

  durations.pomodoro = newPomodoro;
  durations.shortBreak = newShortBreak;
  durations.longBreak = newLongBreak;

  console.log("Settings applied:", durations);
  alert("Settings updated!");

  // If the timer is currently paused/stopped, update the time immediately
  // based on the new duration for the active mode.
  if (isPaused) {
    timeLeft = durations[currentMode] * 60;
    updateTimerDisplay();
  }
}

// --- Event Listeners ---

startBtn.addEventListener("click", startTimer);
pauseBtn.addEventListener("click", pauseTimer);
resetBtn.addEventListener("click", resetTimer);
stopBtn.addEventListener("click", stopTimer); // Added listener for stop button

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    switchMode(button.dataset.mode);
  });
});

applySettingsBtn.addEventListener("click", applySettings);

// --- Initial Setup ---

function initializeTimer() {
  // Set input fields to default values initially
  pomodoroDurationInput.value = durations.pomodoro;
  shortBreakDurationInput.value = durations.shortBreak;
  longBreakDurationInput.value = durations.longBreak;

  // Set initial time based on default mode ('pomodoro')
  timeLeft = durations.pomodoro * 60;
  setActiveModeButton(currentMode); // Set the 'pomodoro' button as active visually
  updateTimerDisplay(); // Display the initial time
}

// Call initialize function when the script loads
initializeTimer();
