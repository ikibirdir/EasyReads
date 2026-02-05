// DOM Elements
const textInput = document.getElementById('textInput');
const wordDisplay = document.getElementById('currentWord');
const readBtn = document.getElementById('readBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const wordCounter = document.getElementById('wordCounter');
const timeRemaining = document.getElementById('timeRemaining');
const progressFill = document.getElementById('progressFill');
const progressBar = document.querySelector('.progress-bar');
const blinkToggle = document.getElementById('blinkToggle');

// State variables
let words = [];
let currentIndex = 0;
let isReading = false;
let intervalId = null;
let wordsPerMinute = 300;
let faceMesh = null;
let camera = null;
let isBlinking = false;
let blinkPauseTimeout = null;
let eyeDistanceHistory = [];
let calibratedThreshold = 0.015;
let isCalibrating = true;
let recentEyeDistances = []; // Track last few frames for trend detection
let lastEyeDistance = 0;
let blinkDetectionEnabled = false;
let cameraInitialized = false;

// Initialize
speedValue.textContent = wordsPerMinute;

// Load saved text from localStorage
const savedText = localStorage.getItem('easyreads_text');
if (savedText) {
    textInput.value = savedText;
    updateWordCountPreview(); // Update word count for saved text
}

// Load saved progress from localStorage
const savedProgress = localStorage.getItem('easyreads_progress');
if (savedProgress) {
    try {
        const progress = JSON.parse(savedProgress);
        if (progress.words && progress.words.length > 0) {
            words = progress.words;
            currentIndex = progress.currentIndex || 0;
            updateProgress();
            
            // Show the current word
            if (currentIndex < words.length) {
                wordDisplay.innerHTML = formatWordWithFixation(words[currentIndex]);
            }
        }
    } catch (e) {
        console.error('Error loading saved progress:', e);
    }
}

// Event Listeners
readBtn.addEventListener('click', startReading);
pauseBtn.addEventListener('click', pauseReading);
resetBtn.addEventListener('click', resetReading);
speedSlider.addEventListener('input', updateSpeed);
progressBar.addEventListener('click', seekToPosition);
progressBar.addEventListener('mousedown', startDragging);
textInput.addEventListener('input', handleTextInput);
blinkToggle.addEventListener('change', handleBlinkToggle);

// Dragging state
let isDragging = false;

// Functions
function startReading() {
    const text = textInput.value.trim();
    
    if (!text) {
        alert('Please enter some text to read!');
        return;
    }
    
    // Parse text into words if starting fresh (no words loaded)
    if (words.length === 0) {
        // Split by whitespace first
        const rawWords = text.split(/\s+/).filter(word => word.length > 0);
        
        // Split hyphenated words into separate words
        words = [];
        rawWords.forEach(word => {
            if (word.includes('-')) {
                // Split by hyphen and add each part as separate word
                const parts = word.split('-').filter(part => part.length > 0);
                words.push(...parts);
            } else {
                words.push(word);
            }
        });
        
        if (words.length === 0) {
            alert('No valid words found in the text!');
            return;
        }
        
        currentIndex = 0;
    }
    
    if (currentIndex >= words.length) {
        // Text finished, reset and start over
        currentIndex = 0;
    }
    
    isReading = true;
    readBtn.disabled = true;
    pauseBtn.disabled = false;
    textInput.disabled = true;
    
    displayNextWord();
    startInterval();
    
    // Only initialize camera if blink detection is enabled
    if (blinkDetectionEnabled && cameraInitialized) {
        initializeCamera();
    }
}

function pauseReading() {
    isReading = false;
    readBtn.disabled = false;
    pauseBtn.disabled = true;
    textInput.disabled = false;
    
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    
    // Save current progress
    saveProgress();
    
    stopCamera();
}

function resetReading() {
    pauseReading();
    currentIndex = 0;
    words = [];
    wordDisplay.textContent = 'Ready';
    updateProgress();
    readBtn.disabled = false;
    textInput.disabled = false;
    
    // Clear saved progress
    localStorage.removeItem('easyreads_progress');
}

function displayNextWord() {
    if (currentIndex < words.length) {
        const word = words[currentIndex];
        wordDisplay.innerHTML = formatWordWithFixation(word);
        currentIndex++;
        updateProgress();
        
        // Save progress every 10 words to avoid excessive writes
        if (currentIndex % 10 === 0) {
            saveProgress();
        }
    } else {
        // Finished reading
        wordDisplay.textContent = 'Finished!';
        pauseReading();
        setTimeout(() => {
            wordDisplay.textContent = 'Ready';
            currentIndex = 0;
            updateProgress();
            localStorage.removeItem('easyreads_progress');
        }, 2000);
    }
}

function formatWordWithFixation(word) {
    // Handle single-letter words - display in red at fixation point
    if (word.length === 1) {
        return `<span class="word-before"></span><span class="fixation-letter">${word}</span><span class="word-after"></span>`;
    }
    
    // Determine the fixation point (index of letter to highlight)
    let fixationIndex;
    if (word.length <= 5) {
        fixationIndex = 1; // 2nd letter
    } else if (word.length <= 7) {
        fixationIndex = 2; // 3rd letter for 6-7 characters
    } else if (word.length <= 10) {
        fixationIndex = 3; // 4th letter for 8-10 characters
    } else {
        fixationIndex = 4; // 5th letter for 11+ characters
    }
    
    if (word.length < fixationIndex + 1) {
        // Word is too short for the fixation index, just return it as is
        return `<span class="word-part">${word}</span>`;
    }
    
    const before = word.substring(0, fixationIndex);
    const fixation = word[fixationIndex];
    const after = word.substring(fixationIndex + 1);
    
    return `<span class="word-before">${before}</span><span class="fixation-letter">${fixation}</span><span class="word-after">${after}</span>`;
}

// Blink Detection Toggle Handler
async function handleBlinkToggle(event) {
    const isEnabled = event.target.checked;
    
    if (isEnabled) {
        // Disable the toggle and show loading state
        blinkToggle.disabled = true;
        
        try {
            // Request camera permission
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            
            // Permission granted, initialize camera system
            blinkDetectionEnabled = true;
            cameraInitialized = true;
            
            // Stop the test stream
            stream.getTracks().forEach(track => track.stop());
            
            // If currently reading, start the camera
            if (isReading) {
                initializeCamera();
            }
            
            // Re-enable toggle
            blinkToggle.disabled = false;
            
        } catch (error) {
            console.error('Camera permission denied:', error);
            alert('Camera access is required for blink detection. Please allow camera access and try again.');
            
            // Reset toggle
            blinkToggle.checked = false;
            blinkToggle.disabled = false;
            blinkDetectionEnabled = false;
        }
    } else {
        // Disable blink detection
        blinkDetectionEnabled = false;
        
        // Stop camera if it's running
        if (camera || faceMesh) {
            stopCamera();
        }
    }
}

// Camera and Blink Detection
function initializeCamera() {
    if (typeof FaceMesh === 'undefined') {
        console.error('MediaPipe Face Mesh not loaded');
        return;
    }
    
    const videoElement = document.getElementById('cameraVideo');
    
    faceMesh = new FaceMesh({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }
    });
    
    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.3,  // Lower for faster initial detection
        minTrackingConfidence: 0.3    // Lower for faster tracking
    });
    
    faceMesh.onResults(onFaceMeshResults);
    
    camera = new Camera(videoElement, {
        onFrame: async () => {
            await faceMesh.send({ image: videoElement });
        },
        width: 320,   // Lower resolution for faster processing
        height: 240
    });
    
    camera.start();
}

function stopCamera() {
    if (camera) {
        camera.stop();
        camera = null;
    }
    if (faceMesh) {
        faceMesh.close();
        faceMesh = null;
    }
    
    // Reset calibration for next session
    eyeDistanceHistory = [];
    recentEyeDistances = [];
    isCalibrating = true;
}

function onFaceMeshResults(results) {
    // Only process if blink detection is enabled
    if (!blinkDetectionEnabled) {
        return;
    }
    
    if (!results.multiFaceLandmarks || !results.multiFaceLandmarks.length) {
        return;
    }
    
    const landmarks = results.multiFaceLandmarks[0];
    
    // Eye landmarks for blink detection
    // Left eye: 159, 145 (top and bottom)
    // Right eye: 386, 374 (top and bottom)
    const leftEyeTop = landmarks[159];
    const leftEyeBottom = landmarks[145];
    const rightEyeTop = landmarks[386];
    const rightEyeBottom = landmarks[374];
    
    // Calculate Eye Aspect Ratio (EAR)
    const leftEyeDistance = Math.abs(leftEyeTop.y - leftEyeBottom.y);
    const rightEyeDistance = Math.abs(rightEyeTop.y - rightEyeBottom.y);
    const averageEyeDistance = (leftEyeDistance + rightEyeDistance) / 2;
    
    // Adaptive calibration for first 30 frames (~1 second)
    if (isCalibrating && eyeDistanceHistory.length < 30) {
        eyeDistanceHistory.push(averageEyeDistance);
        
        if (eyeDistanceHistory.length === 30) {
            // Calculate average eye opening and set threshold dynamically
            const avgEyeOpening = eyeDistanceHistory.reduce((a, b) => a + b, 0) / 30;
            calibratedThreshold = avgEyeOpening * 0.5; // Blink threshold is 50% of normal opening
            isCalibrating = false;
            console.log(`Blink detection calibrated. Threshold: ${calibratedThreshold.toFixed(4)}`);
        }
        return; // Don't detect blinks during calibration
    }
    
    // Track recent eye distances for trend detection (keep last 3 frames)
    recentEyeDistances.push(averageEyeDistance);
    if (recentEyeDistances.length > 3) {
        recentEyeDistances.shift();
    }
    
    // Use calibrated or default threshold
    const blinkThreshold = calibratedThreshold;
    
    // Predictive detection: check if eyes are rapidly closing
    let isRapidlyClosing = false;
    if (recentEyeDistances.length === 3 && isReading && !isBlinking) {
        const trend1 = recentEyeDistances[1] - recentEyeDistances[0];
        const trend2 = recentEyeDistances[2] - recentEyeDistances[1];
        
        // If eyes are closing rapidly (both trends negative and accelerating)
        if (trend1 < -0.002 && trend2 < -0.002) {
            isRapidlyClosing = true;
        }
    }
    
    // Trigger blink on: actual threshold OR rapid closing trend
    if ((averageEyeDistance < blinkThreshold || isRapidlyClosing) && !isBlinking && isReading) {
        isBlinking = true;
        onBlinkDetected();
    } else if (averageEyeDistance >= blinkThreshold && isBlinking) {
        isBlinking = false;
    }
    
    lastEyeDistance = averageEyeDistance;
}

function onBlinkDetected() {
    // Pause the word display
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    
    // Clear any existing timeout
    if (blinkPauseTimeout) {
        clearTimeout(blinkPauseTimeout);
    }
    
    // Show empty container
    wordDisplay.innerHTML = '';
    
    // Resume after 0.5 seconds
    blinkPauseTimeout = setTimeout(() => {
        if (isReading) {
            startInterval();
        }
    }, 500);
}

function startInterval() {
    if (intervalId) {
        clearInterval(intervalId);
    }
    
    // Calculate delay in milliseconds
    const delay = (60 / wordsPerMinute) * 1000;
    
    intervalId = setInterval(() => {
        if (isReading && currentIndex < words.length) {
            displayNextWord();
        }
    }, delay);
}

function updateSpeed(event) {
    wordsPerMinute = parseInt(event.target.value);
    speedValue.textContent = wordsPerMinute;
    
    // Update time remaining with new speed
    if (words.length > 0) {
        updateTimeRemaining();
    }
    
    // If currently reading, restart interval with new speed
    if (isReading) {
        startInterval();
    }
}

function updateProgress() {
    const totalWords = words.length;
    
    if (totalWords === 0) {
        wordCounter.textContent = '0 / 0 words';
        progressFill.style.width = '0%';
        timeRemaining.textContent = '';
    } else {
        wordCounter.textContent = `${currentIndex} / ${totalWords} words`;
        const percentage = (currentIndex / totalWords) * 100;
        progressFill.style.width = `${percentage}%`;
        updateTimeRemaining();
    }
}

function updateTimeRemaining() {
    const remainingWords = words.length - currentIndex;
    
    if (remainingWords <= 0) {
        timeRemaining.textContent = '';
        return;
    }
    
    // Calculate minutes remaining
    const minutesLeft = remainingWords / wordsPerMinute;
    
    if (minutesLeft < 1) {
        // Show seconds if less than 1 minute
        const secondsLeft = Math.ceil(minutesLeft * 60);
        timeRemaining.textContent = `${secondsLeft}s left`;
    } else {
        // Show minutes, rounded to 1 decimal place
        const displayMinutes = Math.ceil(minutesLeft);
        timeRemaining.textContent = `${displayMinutes} min left`;
    }
}

function seekToPosition(event) {
    if (words.length === 0) {
        return;
    }
    
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newIndex = Math.floor(percentage * words.length);
    
    // Clamp to valid range
    currentIndex = Math.max(0, Math.min(newIndex, words.length - 1));
    
    // If currently reading, restart interval to show new word immediately
    if (isReading) {
        displayNextWord();
        startInterval();
    } else {
        // Just update the display
        if (currentIndex < words.length) {
            wordDisplay.innerHTML = formatWordWithFixation(words[currentIndex]);
        }
    }
    
    updateProgress();
}

function startDragging(event) {
    if (words.length === 0) {
        return;
    }
    
    isDragging = true;
    const wasReading = isReading;
    
    // Pause reading while dragging
    if (isReading) {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }
    
    // Handle the initial drag position
    updateDragPosition(event);
    
    // Add global mouse event listeners
    document.addEventListener('mousemove', handleDragging);
    document.addEventListener('mouseup', () => stopDragging(wasReading));
    
    event.preventDefault();
}

function handleDragging(event) {
    if (!isDragging) return;
    updateDragPosition(event);
}

function updateDragPosition(event) {
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newIndex = Math.floor(percentage * words.length);
    
    // Clamp to valid range
    currentIndex = Math.max(0, Math.min(newIndex, words.length - 1));
    
    // Update display
    if (currentIndex < words.length) {
        wordDisplay.innerHTML = formatWordWithFixation(words[currentIndex]);
    }
    
    updateProgress();
}

function stopDragging(wasReading) {
    if (!isDragging) return;
    
    isDragging = false;
    
    // Remove global event listeners
    document.removeEventListener('mousemove', handleDragging);
    document.removeEventListener('mouseup', stopDragging);
    
    // Resume reading if it was playing before
    if (wasReading) {
        startInterval();
    }
}

function handleTextInput() {
    // Save text to localStorage
    localStorage.setItem('easyreads_text', textInput.value);
    
    // Clear progress when text changes (user is editing)
    if (!isReading) {
        words = [];
        currentIndex = 0;
        localStorage.removeItem('easyreads_progress');
    }
    
    // Update word count preview
    updateWordCountPreview();
}

function saveProgress() {
    if (words.length > 0) {
        const progress = {
            words: words,
            currentIndex: currentIndex
        };
        localStorage.setItem('easyreads_progress', JSON.stringify(progress));
    }
}

function updateWordCountPreview() {
    // Don't update if currently reading
    if (isReading) {
        return;
    }
    
    const text = textInput.value.trim();
    
    if (!text) {
        wordCounter.textContent = '0 / 0 words';
        timeRemaining.textContent = '';
        return;
    }
    
    // Count words the same way as startReading does
    const rawWords = text.split(/\s+/).filter(word => word.length > 0);
    let previewWords = [];
    rawWords.forEach(word => {
        if (word.includes('-')) {
            const parts = word.split('-').filter(part => part.length > 0);
            previewWords.push(...parts);
        } else {
            previewWords.push(word);
        }
    });
    
    const totalWords = previewWords.length;
    wordCounter.textContent = `0 / ${totalWords} words`;
    
    // Calculate estimated time
    const minutesTotal = totalWords / wordsPerMinute;
    
    if (minutesTotal < 1) {
        const secondsTotal = Math.ceil(minutesTotal * 60);
        timeRemaining.textContent = `~${secondsTotal}s total`;
    } else {
        const displayMinutes = Math.ceil(minutesTotal);
        timeRemaining.textContent = `~${displayMinutes} min total`;
    }
}

// Initialize progress
updateProgress();
