// DOM Elements
const textInput = document.getElementById('textInput');
const wordDisplay = document.getElementById('currentWord');
const readBtn = document.getElementById('readBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const wordCounter = document.getElementById('wordCounter');
const progressFill = document.getElementById('progressFill');
const progressBar = document.querySelector('.progress-bar');

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

// Initialize
speedValue.textContent = wordsPerMinute;

// Event Listeners
readBtn.addEventListener('click', startReading);
pauseBtn.addEventListener('click', pauseReading);
resetBtn.addEventListener('click', resetReading);
speedSlider.addEventListener('input', updateSpeed);
progressBar.addEventListener('click', seekToPosition);

// Functions
function startReading() {
    const text = textInput.value.trim();
    
    if (!text) {
        alert('Please enter some text to read!');
        return;
    }
    
    // Parse text into words if starting fresh
    if (currentIndex === 0) {
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
    initializeCamera();
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
}

function displayNextWord() {
    if (currentIndex < words.length) {
        const word = words[currentIndex];
        wordDisplay.innerHTML = formatWordWithFixation(word);
        currentIndex++;
        updateProgress();
    } else {
        // Finished reading
        wordDisplay.textContent = 'Finished!';
        pauseReading();
        setTimeout(() => {
            wordDisplay.textContent = 'Ready';
            currentIndex = 0;
            updateProgress();
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
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    
    faceMesh.onResults(onFaceMeshResults);
    
    camera = new Camera(videoElement, {
        onFrame: async () => {
            await faceMesh.send({ image: videoElement });
        },
        width: 640,
        height: 480
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
}

function onFaceMeshResults(results) {
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
    
    // Threshold for detecting blink (adjust if needed)
    const blinkThreshold = 0.015;
    
    if (averageEyeDistance < blinkThreshold && !isBlinking && isReading) {
        isBlinking = true;
        onBlinkDetected();
    } else if (averageEyeDistance >= blinkThreshold && isBlinking) {
        isBlinking = false;
    }
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
    } else {
        wordCounter.textContent = `${currentIndex} / ${totalWords} words`;
        const percentage = (currentIndex / totalWords) * 100;
        progressFill.style.width = `${percentage}%`;
    }
}

function seekToPosition(event) {
    if (words.length === 0) {
        return;
    }
    
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
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

// Initialize progress
updateProgress();
