// DOM Elements
const homepage = document.getElementById('homepage');
const mainApp = document.getElementById('mainApp');
const getStartedBtn = document.getElementById('getStartedBtn');
const siteTitle = document.getElementById('siteTitle');
const inputSection = document.getElementById('inputSection');
const toggleInputBtn = document.getElementById('toggleInputBtn');
const textInput = document.getElementById('textInput');
const wordDisplay = document.getElementById('wordContext');
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
const blinkStatus = document.getElementById('blinkStatus');
const wordLengthToggle = document.getElementById('wordLengthToggle');
const punctuationToggle = document.getElementById('punctuationToggle');
const increaseSizeBtn = document.getElementById('increaseSizeBtn');
const decreaseSizeBtn = document.getElementById('decreaseSizeBtn');

// Homepage transition
getStartedBtn.addEventListener('click', () => {
    homepage.style.display = 'none';
    mainApp.style.display = 'block';
    
    // Auto-focus textarea if it's empty
    if (!textInput.value.trim()) {
        setTimeout(() => textInput.focus(), 100);
    }
});

siteTitle.addEventListener('click', () => {
    mainApp.style.display = 'none';
    homepage.style.display = 'flex';
});

// Auto-focus textarea on initial load if empty and main app is visible
if (mainApp.style.display !== 'none' && !textInput.value.trim()) {
    setTimeout(() => textInput.focus(), 100);
}

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
let blinkCooldownUntil = 0; // Timestamp when cooldown period ends
let smoothedEyeDistance = 0; // Smoothed measurement for stability
let calibrationCheckTimeout = null; // Timeout to check if calibration is stuck
let variableWordLength = false; // Variable duration based on word length
let variablePunctuation = false; // Variable duration based on punctuation
let textSizeMultiplier = 1; // Text size multiplier (1 = 100%)

// Function to update text size
function updateTextSize() {
    wordDisplay.style.fontSize = (2.5 * textSizeMultiplier) + 'em';
}

// Load saved reading speed from localStorage
const savedSpeed = localStorage.getItem('easyreads_speed');
if (savedSpeed !== null) {
    wordsPerMinute = parseInt(savedSpeed);
    speedSlider.value = wordsPerMinute;
}

// Load saved text size from localStorage
const savedTextSize = localStorage.getItem('easyreads_textsize');
if (savedTextSize !== null) {
    textSizeMultiplier = parseFloat(savedTextSize);
    updateTextSize();
}

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
                displayWordWithContext(currentIndex);
            }
        }
    } catch (e) {
        console.error('Error loading saved progress:', e);
    }
}

// Load saved toggle preferences
const savedWordLength = localStorage.getItem('easyreads_word_length');
if (savedWordLength !== null) {
    variableWordLength = savedWordLength === 'true';
    wordLengthToggle.checked = variableWordLength;
}

const savedPunctuation = localStorage.getItem('easyreads_punctuation');
if (savedPunctuation !== null) {
    variablePunctuation = savedPunctuation === 'true';
    punctuationToggle.checked = variablePunctuation;
}

// Load saved blink detection preference
const savedBlinkPref = localStorage.getItem('easyreads_blink_enabled');
if (savedBlinkPref === 'true') {
    // User had it enabled before - restore the toggle state
    blinkToggle.checked = true;
    
    // Automatically request permission and enable
    (async () => {
        blinkToggle.disabled = true;
        blinkStatus.textContent = '⏳ Requesting camera...';
        blinkStatus.className = 'blink-status loading';
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            blinkDetectionEnabled = true;
            cameraInitialized = true;
            stream.getTracks().forEach(track => track.stop());
            blinkToggle.disabled = false;
            blinkStatus.textContent = '✓ Active';
            blinkStatus.className = 'blink-status active';
        } catch (error) {
            console.log('Camera permission not granted on load');
            blinkToggle.checked = false;
            blinkToggle.disabled = false;
            blinkStatus.textContent = '';
            blinkStatus.className = 'blink-status';
            localStorage.setItem('easyreads_blink_enabled', 'false');
        }
    })();
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
wordLengthToggle.addEventListener('change', (e) => {
    variableWordLength = e.target.checked;
    localStorage.setItem('easyreads_word_length', e.target.checked);
});
punctuationToggle.addEventListener('change', (e) => {
    variablePunctuation = e.target.checked;
    localStorage.setItem('easyreads_punctuation', e.target.checked);
});

// Toggle text input visibility
toggleInputBtn.addEventListener('click', () => {
    inputSection.classList.toggle('collapsed');
    if (inputSection.classList.contains('collapsed')) {
        toggleInputBtn.textContent = 'Show full text ▼';
    } else {
        toggleInputBtn.textContent = 'Hide full text ▲';
    }
});

// Text size controls
increaseSizeBtn.addEventListener('click', () => {
    textSizeMultiplier = Math.min(textSizeMultiplier + 0.1, 2); // Max 200%
    updateTextSize();
    localStorage.setItem('easyreads_textsize', textSizeMultiplier);
});

decreaseSizeBtn.addEventListener('click', () => {
    textSizeMultiplier = Math.max(textSizeMultiplier - 0.1, 0.5); // Min 50%
    updateTextSize();
    localStorage.setItem('easyreads_textsize', textSizeMultiplier);
});

function updateTextSize() {
    wordDisplay.style.fontSize = (2.5 * textSizeMultiplier) + 'em';
}

// Keyboard controls
document.addEventListener('keydown', (event) => {
    // Space bar to pause/resume
    if (event.code === 'Space' && event.target !== textInput) {
        event.preventDefault();
        if (isReading) {
            pauseReading();
        } else if (words.length > 0) {
            startReading();
        }
    }
});

// Dragging state
let isDragging = false;

// Mode switching
function switchMode(mode) {
    currentMode = mode;
    
    // Update tab states
    modeTabs.forEach(tab => {
        if (tab.dataset.mode === mode) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // Stop any current reading
    if (isReading) {
        pauseReading();
    }
    
    // Switch displays
    if (mode === 'fixation') {
        wordDisplay.style.display = 'flex';
        scrollDisplay.style.display = 'none';
        if (currentIndex < words.length && words.length > 0) {
            displayWordWithContext(currentIndex);
        } else {
            wordDisplay.innerHTML = '<div class="word-context-container">Ready</div>';
        }
    } else {
        wordDisplay.style.display = 'none';
        scrollDisplay.style.display = 'flex';
        if (words.length > 0) {
            scrollDisplay.innerHTML = '<div class="scroll-text">' + words.join(' ') + '</div>';
        } else {
            scrollDisplay.innerHTML = 'Ready';
        }
    }
}

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
    
    // Reset calibration BEFORE starting reading
    if (blinkDetectionEnabled && cameraInitialized) {
            eyeDistanceHistory = [];
            recentEyeDistances = [];
            isCalibrating = true;
            blinkCooldownUntil = 0;
            smoothedEyeDistance = 0;
            lastEyeDistance = 0;
            isBlinking = false; // Reset blink state
            
            if (blinkPauseTimeout) {
                clearTimeout(blinkPauseTimeout);
                blinkPauseTimeout = null;
            }
            
            // Clear any existing calibration check timeout
            if (calibrationCheckTimeout) {
                clearTimeout(calibrationCheckTimeout);
                calibrationCheckTimeout = null;
            }
            
            // Update status to show recalibration
            if (blinkStatus) {
                blinkStatus.textContent = '⏳ Calibrating... 0/30';
                blinkStatus.className = 'blink-status calibrating';
            }
            
            console.log('Calibration reset at', Date.now(), '- isCalibrating:', isCalibrating);
            
            // Always restart camera to ensure fresh calibration
            stopCamera();
            setTimeout(() => {
                initializeCamera();
                console.log('Camera reinitialized');
                
                // Check calibration progress after 2 seconds
                calibrationCheckTimeout = setTimeout(() => {
                    if (isCalibrating && eyeDistanceHistory.length === 0) {
                        console.log('Calibration stuck at 0 - restarting camera');
                        stopCamera();
                        setTimeout(() => {
                            initializeCamera();
                            console.log('Camera restarted due to stuck calibration');
                        }, 50);
                    }
                }, 2000);
            }, 50);
        }
        
        displayNextWord();
        startInterval();
}

function pauseReading() {
    isReading = false;
    readBtn.disabled = false;
    pauseBtn.disabled = true;
    textInput.disabled = false;
    
    if (intervalId) {
        clearTimeout(intervalId);
        intervalId = null;
    }
    
    // Clear calibration check timeout
    if (calibrationCheckTimeout) {
        clearTimeout(calibrationCheckTimeout);
        calibrationCheckTimeout = null;
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
        displayWordWithContext(currentIndex);
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
    } else if (word.length <= 12) {
        fixationIndex = 4; // 5th letter for 11-12 characters
    } else {
        fixationIndex = 5; // 6th letter for 13+ characters
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

function displayWordWithContext(index) {
    if (index >= words.length) {
        return;
    }
    
    const currentWord = words[index];
    
    // Get as many words as possible before and after (up to 50 each)
    const contextBefore = [];
    const contextAfter = [];
    
    for (let i = 1; i <= 50; i++) {
        const beforeIndex = index - i;
        if (beforeIndex >= 0) {
            contextBefore.unshift(words[beforeIndex]);
        }
    }
    
    for (let i = 1; i <= 50; i++) {
        const afterIndex = index + i;
        if (afterIndex < words.length) {
            contextAfter.push(words[afterIndex]);
        }
    }
    
    // Format current word with fixation
    const formattedCurrentWord = formatWordWithFixation(currentWord);
    
    // Build the HTML with horizontal layout
    let html = '<div class="word-context-container-horizontal">';
    
    // Words before (dimmed) - on the left
    if (contextBefore.length > 0) {
        html += '<span class="context-words context-horizontal-before">' + contextBefore.join(' ') + '</span>';
        html += '<span class="word-spacer"> </span>';
    }
    
    // Current word with fixation (highlighted)
    html += '<span class="current-word-inline">' + formattedCurrentWord + '</span>';
    
    // Words after (dimmed) - on the right
    if (contextAfter.length > 0) {
        html += '<span class="word-spacer"> </span>';
        html += '<span class="context-words context-horizontal-after">' + contextAfter.join(' ') + '</span>';
    }
    
    html += '</div>';
    
    wordDisplay.innerHTML = html;
    
    // Center the fixation letter after rendering
    requestAnimationFrame(() => {
        centerFixationLetter();
        setTimeout(centerFixationLetter, 10);
    });
}

function centerFixationLetter() {
    const fixationLetter = document.querySelector('.fixation-letter');
    const container = document.querySelector('.word-context-container-horizontal');
    const displayBox = document.querySelector('.word-display');
    
    if (!fixationLetter || !container || !displayBox) {
        return;
    }
    
    // Reset position first
    container.style.left = '0';
    container.style.transform = 'translateY(-50%)';
    
    // Force reflow
    container.offsetHeight;
    
    // Get positions
    const displayRect = displayBox.getBoundingClientRect();
    const fixationRect = fixationLetter.getBoundingClientRect();
    
    // Calculate center of display
    const displayCenterX = displayRect.left + displayRect.width / 2;
    
    // Calculate current position of fixation letter center
    const fixationCenterX = fixationRect.left + fixationRect.width / 2;
    
    // Calculate offset needed
    const offset = displayCenterX - fixationCenterX;
    
    // Apply the offset to the container
    container.style.left = `${offset}px`;
}

// Blink Detection Toggle Handler
async function handleBlinkToggle(event) {
    const isEnabled = event.target.checked;
    
    if (isEnabled) {
        // Disable the toggle and show loading state
        blinkToggle.disabled = true;
        blinkStatus.textContent = '⏳ Requesting camera...';
        blinkStatus.className = 'blink-status loading';
        
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
            
            // Re-enable toggle and show success
            blinkToggle.disabled = false;
            blinkStatus.textContent = '✓ Active';
            blinkStatus.className = 'blink-status active';
            
            // Save preference
            localStorage.setItem('easyreads_blink_enabled', 'true');
            
        } catch (error) {
            console.error('Camera permission denied:', error);
            alert('Camera access is required for blink detection. Please allow camera access and try again.');
            
            // Reset toggle
            blinkToggle.checked = false;
            blinkToggle.disabled = false;
            blinkDetectionEnabled = false;
            blinkStatus.textContent = '';
            blinkStatus.className = 'blink-status';
            
            // Save disabled preference
            localStorage.setItem('easyreads_blink_enabled', 'false');
        }
    } else {
        // Disable blink detection
        blinkDetectionEnabled = false;
        blinkStatus.textContent = '';
        blinkStatus.className = 'blink-status';
        
        // Stop camera if it's running
        if (camera || faceMesh) {
            stopCamera();
        }
        
        // Save preference
        localStorage.setItem('easyreads_blink_enabled', 'false');
    }
}

// Camera and Blink Detection
function initializeCamera() {
    if (typeof FaceMesh === 'undefined') {
        console.error('MediaPipe Face Mesh not loaded');
        return;
    }
    
    // Only reset calibration if this is a fresh initialization (not a restart)
    if (!camera && !faceMesh) {
        eyeDistanceHistory = [];
        recentEyeDistances = [];
        isCalibrating = true;
        blinkCooldownUntil = 0;
        smoothedEyeDistance = 0;
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
    
    // Throttle to ~20 FPS for better battery life
    let lastFrameTime = 0;
    const targetFrameDelay = 1000 / 20; // ~50ms between frames (20 FPS)
    
    camera = new Camera(videoElement, {
        onFrame: async () => {
            const now = performance.now();
            if (now - lastFrameTime >= targetFrameDelay) {
                await faceMesh.send({ image: videoElement });
                lastFrameTime = now;
            }
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
    
    // Reset calibration and cooldown for next session
    eyeDistanceHistory = [];
    recentEyeDistances = [];
    isCalibrating = true;
    blinkCooldownUntil = 0;
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
    
    // Check if we're in cooldown period (2 seconds after a blink)
    // BUT allow processing during calibration regardless of cooldown
    const now = performance.now();
    if (!isCalibrating && now < blinkCooldownUntil) {
        return; // Skip processing during cooldown to save battery (but not during calibration)
    }
    
    // Enhanced eye landmarks for more accurate blink detection
    // Left eye: multiple vertical points for better measurement
    // Top: 159, 158, 157, 173  Bottom: 145, 144, 153, 154
    // Right eye: Top: 386, 385, 384, 398  Bottom: 374, 373, 380, 381
    
    // Left eye vertical measurements (multiple points)
    const leftEyeTop1 = landmarks[159];
    const leftEyeTop2 = landmarks[158];
    const leftEyeBottom1 = landmarks[145];
    const leftEyeBottom2 = landmarks[153];
    
    // Right eye vertical measurements (multiple points)
    const rightEyeTop1 = landmarks[386];
    const rightEyeTop2 = landmarks[385];
    const rightEyeBottom1 = landmarks[374];
    const rightEyeBottom2 = landmarks[380];
    
    // Calculate Eye Aspect Ratio (EAR) using multiple measurements for accuracy
    const leftEyeDist1 = Math.abs(leftEyeTop1.y - leftEyeBottom1.y);
    const leftEyeDist2 = Math.abs(leftEyeTop2.y - leftEyeBottom2.y);
    const leftEyeDistance = (leftEyeDist1 + leftEyeDist2) / 2;
    
    const rightEyeDist1 = Math.abs(rightEyeTop1.y - rightEyeBottom1.y);
    const rightEyeDist2 = Math.abs(rightEyeTop2.y - rightEyeBottom2.y);
    const rightEyeDistance = (rightEyeDist1 + rightEyeDist2) / 2;
    
    // Use average of both eyes
    const averageEyeDistance = (leftEyeDistance + rightEyeDistance) / 2;
    
    // Check if both eyes are closing (more lenient threshold for natural blinks)
    const bothEyesClosed = (leftEyeDistance < calibratedThreshold * 1.5) && 
                           (rightEyeDistance < calibratedThreshold * 1.5);
    
    // Adaptive calibration for first 30 frames (~1 second)
    if (isCalibrating && eyeDistanceHistory.length < 30) {
        eyeDistanceHistory.push(averageEyeDistance);
        smoothedEyeDistance = averageEyeDistance; // Initialize smoothed value
        
        if (eyeDistanceHistory.length === 30) {
            // Calculate average eye opening and set threshold dynamically
            const avgEyeOpening = eyeDistanceHistory.reduce((a, b) => a + b, 0) / 30;
            calibratedThreshold = avgEyeOpening * 0.6; // Lower threshold for higher sensitivity
            isCalibrating = false;
            console.log(`Blink detection calibrated. Threshold: ${calibratedThreshold.toFixed(4)}`);
            
            // Clear the calibration check timeout since calibration succeeded
            if (calibrationCheckTimeout) {
                clearTimeout(calibrationCheckTimeout);
                calibrationCheckTimeout = null;
            }
            
            // Update status to show calibration complete
            if (blinkStatus) {
                blinkStatus.textContent = '● Active';
                blinkStatus.className = 'blink-status calibrated';
            }
        } else {
            // Show calibration progress
            if (blinkStatus) {
                blinkStatus.textContent = `⏳ Calibrating... ${eyeDistanceHistory.length}/30`;
                blinkStatus.className = 'blink-status calibrating';
            }
        }
        return; // Don't detect blinks during calibration
    }
    
    // Apply lighter exponential smoothing to be more responsive (alpha = 0.5 for faster response)
    smoothedEyeDistance = 0.5 * averageEyeDistance + 0.5 * smoothedEyeDistance;
    
    // Track recent eye distances for trend detection (keep last 4 frames for better pattern recognition)
    recentEyeDistances.push(smoothedEyeDistance);
    if (recentEyeDistances.length > 4) {
        recentEyeDistances.shift();
    }
    
    // Use calibrated or default threshold (slightly more sensitive)
    const blinkThreshold = calibratedThreshold;
    
    // Enhanced predictive detection: check if eyes are rapidly closing
    let isRapidlyClosing = false;
    if (recentEyeDistances.length >= 3 && isReading && !isBlinking) {
        // Check for downward trend in eye opening
        let closingTrends = 0;
        for (let i = 1; i < recentEyeDistances.length; i++) {
            const trend = recentEyeDistances[i] - recentEyeDistances[i - 1];
            if (trend < -0.001) { // More sensitive threshold
                closingTrends++;
            }
        }
        
        // If majority of recent frames show closing trend
        if (closingTrends >= 2) {
            isRapidlyClosing = true;
        }
    }
    
    // More sensitive blink detection (use smoothed value for stability)
    const sensitiveThreshold = blinkThreshold * 1.4; // 40% more sensitive to catch more blinks
    
    // Enhanced blink trigger logic:
    // 1. Both eyes must be closing (prevents winks from triggering)
    // 2. Either threshold reached OR rapid closing detected
    // 3. Not already in blink state
    // 4. Currently reading
    const thresholdMet = smoothedEyeDistance < sensitiveThreshold;
    const shouldTriggerBlink = (thresholdMet || isRapidlyClosing) && bothEyesClosed && !isBlinking && isReading;
    
    if (shouldTriggerBlink) {
        isBlinking = true;
        onBlinkDetected();
    } else if (smoothedEyeDistance >= blinkThreshold * 1.5 && isBlinking) {
        // Use higher threshold for blink end detection to avoid re-triggering
        isBlinking = false;
    }
    
    lastEyeDistance = smoothedEyeDistance;
}

function onBlinkDetected() {
    // Set cooldown period - pause detection for 2 seconds to save battery
    blinkCooldownUntil = performance.now() + 2000; // 2 seconds from now
    
    // Visual feedback - flash the word display briefly
    wordDisplay.style.transition = 'opacity 0.1s';
    wordDisplay.style.opacity = '0.3';
    setTimeout(() => {
        wordDisplay.style.opacity = '1';
    }, 100);
    
    // Pause the word display
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    
    // Clear any existing timeout
    if (blinkPauseTimeout) {
        clearTimeout(blinkPauseTimeout);
    }
    
    // Show the last word that was displayed before the blink
    if (currentIndex > 0) {
        displayWordWithContext(currentIndex - 1);
    }
    
    // Resume after 0.5 seconds
    blinkPauseTimeout = setTimeout(() => {
        if (isReading) {
            displayNextWord();
            startInterval();
        }
    }, 500);
}

function startInterval() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    
    scheduleNextWord();
}

function scheduleNextWord() {
    if (!isReading || currentIndex >= words.length) {
        return;
    }
    
    // Calculate base delay for average word length
    const baseDelay = (60 / wordsPerMinute) * 1000;
    
    // Get current word length
    const currentWord = words[currentIndex];
    const wordLength = currentWord ? currentWord.length : 5;
    
    let finalDelay = baseDelay;
    
    // Apply word length variation if enabled
    if (variableWordLength) {
        // Average word length in English is about 5 characters
        // Adjust timing: shorter words = less time, longer words = more time
        const averageWordLength = 5;
        const lengthRatio = wordLength / averageWordLength;
        
        // Apply smoothing: 0.5 * baseDelay + 0.5 * adjusted delay
        // This keeps 50% of original speed, varies 50% based on word length
        const adjustedDelay = baseDelay * lengthRatio;
        finalDelay = baseDelay * 0.5 + adjustedDelay * 0.5;
    }
    
    // Apply punctuation pauses if enabled
    if (variablePunctuation) {
        // Check for pause punctuation (commas, dashes, etc.)
        const hasPausePunctuation = /[,;:\-–—]$/.test(currentWord);
        if (hasPausePunctuation) {
            finalDelay *= 1.5; // 1.5x time for pause punctuation
        }
        
        // Check if word ends with sentence-ending punctuation
        const endsWithPunctuation = /[.!?]$/.test(currentWord);
        if (endsWithPunctuation) {
            finalDelay *= 2; // Double the time for end of sentence
        }
    }
    
    displayNextWord();
    
    intervalId = setTimeout(() => {
        scheduleNextWord();
    }, finalDelay);
}

function updateSpeed(event) {
    wordsPerMinute = parseInt(event.target.value);
    speedValue.textContent = wordsPerMinute;
    
    // Save to localStorage
    localStorage.setItem('easyreads_speed', wordsPerMinute);
    
    // Update time remaining with new speed
    if (words.length > 0) {
        updateTimeRemaining();
    }
    
    // If currently reading, restart with new speed
    if (isReading) {
        if (currentMode === 'fixation') {
            startInterval();
        } else {
            // Restart scrolling with new speed
            if (scrollAnimationId) {
                clearTimeout(scrollAnimationId);
                scrollAnimationId = null;
            }
            continueScrolling();
        }
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
            displayWordWithContext(currentIndex);
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
        displayWordWithContext(currentIndex);
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

// Scroll Mode Functions
function startScrolling() {
    if (words.length === 0) return;
    
    currentIndex = 0;
    displayScrollWords();
}

function displayScrollWords() {
    if (!isReading || currentIndex >= words.length) {
        if (currentIndex >= words.length) {
            pauseReading();
            scrollDisplay.innerHTML = 'Finished!';
            setTimeout(() => {
                scrollDisplay.innerHTML = 'Ready';
                currentIndex = 0;
                updateProgress();
            }, 2000);
        }
        return;
    }
    
    const displayWidth = scrollDisplay.getBoundingClientRect().width;
    
    // Build words from some starting point to currentIndex (the newest word)
    // The newest word (at currentIndex) should be right-aligned
    let startIndex = currentIndex;
    let visibleWords = [words[currentIndex]];
    
    // Add words going backwards until we run out of space
    for (let i = currentIndex - 1; i >= 0; i--) {
        const testWords = words.slice(i, currentIndex + 1);
        const testHTML = testWords.join(' ');
        
        // Create temporary element to measure
        scrollDisplay.innerHTML = '<div class="scroll-text">' + testHTML + '</div>';
        const textWidth = scrollDisplay.querySelector('.scroll-text').getBoundingClientRect().width;
        
        if (textWidth > displayWidth) {
            // This word doesn't fit, stop here
            break;
        }
        
        startIndex = i;
        visibleWords = testWords;
    }
    
    // Display with the newest word highlighted and others dimmed
    let html = '<div class="scroll-text">';
    for (let i = 0; i < visibleWords.length; i++) {
        if (i === visibleWords.length - 1) {
            // Newest word - bright
            html += '<span class="scroll-word-new">' + visibleWords[i] + '</span>';
        } else {
            // Older words - dimmed
            html += '<span class="scroll-word-old">' + visibleWords[i] + '</span>';
            if (i < visibleWords.length - 1) {
                html += ' ';
            }
        }
    }
    html += '</div>';
    
    scrollDisplay.innerHTML = html;
    
    updateProgress();
    
    // Schedule next word
    const delay = (60 / wordsPerMinute) * 1000;
    
    scrollAnimationId = setTimeout(() => {
        currentIndex++;
        displayScrollWords();
    }, delay);
}

function continueScrolling() {
    // This function is called when speed changes
    if (scrollAnimationId) {
        clearTimeout(scrollAnimationId);
        scrollAnimationId = null;
    }
    displayScrollWords();
}
