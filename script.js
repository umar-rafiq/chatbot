// ============================================
// Personal Recommendation Assistant
// ============================================

// DOM Elements
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const chatbotToggler = document.querySelector("#chatbot-toggler");
const closeChatbot = document.querySelector("#close-chatbot");
const speechToTextButton = document.querySelector("#speech-to-text");
const quickActionButtons = document.querySelectorAll(".quick-action-btn");
const chatForm = document.querySelector("#chat-form");

// API setup
const API_KEY = "AIzaSyCTPWIIEff4WVhwUkz1eIuIeAupffKFegg";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

// Application State
const userData = {
    message: null
};

const chatHistory = [];
const initialInputHeight = messageInput.scrollHeight;

// Speech Synthesis Setup
let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;
let availableVoices = [];
let isSpeechEnabled = true;
let autoSpeakEnabled = true;

// Connection Monitoring
let isOnline = navigator.onLine;
let offlineMessageQueue = [];
let pendingMessage = null;
let connectionCheckInterval = null;
let statusIndicator = null;
let statusText = null;
let connectionWarning = null;
let warningText = null;
let warningIcon = null;
let warningAction = null;
let chatbotOverlay = null;

// ============================================
// RECOMMENDATION SYSTEM
// ============================================

const recommendationSystem = {
    // System prompt for the assistant
    systemPrompt: `You are a friendly, conversational personal assistant named Assistant. You help users with recommendations and advice in a natural, engaging way like Siri or Alexa. 

Your specialties include:
1. **Book Recommendations** - Suggest books based on genres, moods, interests, or reading history
2. **Cooking Tips & Recipes** - Provide cooking advice, recipe suggestions, meal planning, and cooking tips
3. **Exercise Routines** - Recommend workout routines, fitness tips, and exercise plans based on goals and fitness levels
4. **Movie Recommendations** - Suggest movies based on genres, moods, preferences, or similar movies
5. **Daily Life Advice** - Offer practical advice on productivity, routines, habits, and daily life improvements

Guidelines:
- Be conversational, warm, and friendly
- Ask follow-up questions to better understand user needs
- Provide specific, actionable recommendations
- Use natural language, not robotic responses
- Show enthusiasm and personality
- Keep responses concise but informative (2-4 paragraphs max)
- Use emojis sparingly and appropriately
- Format lists and important information clearly`,

    // Quick action handlers
    quickActions: {
        books: {
            trigger: "book recommendation",
            prompt: "The user is asking about book recommendations. Provide helpful, personalized book suggestions based on their preferences, or ask what genres or types of books they enjoy."
        },
        cooking: {
            trigger: "cooking recipe",
            prompt: "The user is asking about cooking or recipes. Provide helpful cooking tips, recipe suggestions, or ask about their dietary preferences, skill level, or what they'd like to cook."
        },
        exercise: {
            trigger: "exercise routine",
            prompt: "The user is asking about exercise or fitness routines. Provide helpful exercise recommendations, workout plans, or ask about their fitness goals, experience level, or preferences."
        },
        movies: {
            trigger: "movie recommendation",
            prompt: "The user is asking about movie recommendations. Provide helpful movie suggestions based on genres, moods, or ask about their preferences and what they're in the mood to watch."
        },
        "daily-life": {
            trigger: "daily life advice",
            prompt: "The user is asking for daily life advice. Provide helpful tips on productivity, routines, habits, time management, or ask what specific area they'd like advice on."
        }
    }
};

// ============================================
// SPEECH SYNTHESIS
// ============================================

const initializeVoices = () => {
    const loadVoices = () => {
        availableVoices = speechSynthesis.getVoices();
        availableVoices.sort((a, b) => {
            const aScore = a.localService ? 1 : 0;
            const bScore = b.localService ? 1 : 0;
            return bScore - aScore;
        });
    };

    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
    }
    loadVoices();
};

const getPreferredVoice = () => {
    if (availableVoices.length === 0) return null;
    
    const preferredVoices = availableVoices.filter(voice => 
        voice.name.includes('Female') || 
        voice.name.includes('Google') || 
        voice.name.includes('Samantha') ||
        voice.name.includes('Karen') ||
        voice.name.includes('Microsoft Zira') ||
        voice.name.includes('Victoria') ||
        voice.name.includes('Siri')
    );
    
    return preferredVoices.length > 0 ? preferredVoices[0] : availableVoices[0];
};

// Note: speakText is no longer used for auto-speech
// Auto-speech now uses TTS controls directly for better button synchronization
const speakText = (text, messageElement = null) => {
    // This function is kept for backward compatibility but auto-speech
    // should use TTS controls' startAutoSpeech method instead
    if (!isSpeechEnabled || !text) return;

    // Stop any ongoing speech
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }

    // Clean text for speech (remove markdown, extra formatting)
    const cleanText = text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/\[.*?\]\(.*?\)/g, '')
        .replace(/#{1,6}\s/g, '')
        .replace(/\n{2,}/g, '. ')
        .replace(/\n/g, '. ')
        .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 0.9;

    const preferredVoice = getPreferredVoice();
    if (preferredVoice) {
        utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
        if (messageElement) {
            messageElement.classList.add('playing-audio');
        }
    };

    utterance.onend = () => {
        if (messageElement) {
            messageElement.classList.remove('playing-audio');
        }
        currentUtterance = null;
    };

    utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event.error);
        if (messageElement) {
            messageElement.classList.remove('playing-audio');
        }
        currentUtterance = null;
    };

    currentUtterance = utterance;
    speechSynthesis.speak(utterance);
};

const stopAllSpeech = () => {
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    // Use setTimeout to ensure cancel is processed before updating UI
    setTimeout(() => {
        // Remove playing-audio class from all messages
        document.querySelectorAll('.playing-audio').forEach(el => {
            el.classList.remove('playing-audio');
        });
        // Reset all TTS controls buttons to show play button only
        document.querySelectorAll('.tts-controls').forEach(controls => {
            const playBtn = controls.querySelector('.tts-play');
            const pauseBtn = controls.querySelector('.tts-pause');
            const stopBtn = controls.querySelector('.tts-stop');
            const progressBar = controls.querySelector('.tts-progress-bar');
            if (playBtn) playBtn.style.display = 'block';
            if (pauseBtn) pauseBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'none';
            if (progressBar) progressBar.style.width = '0%';
        });
        currentUtterance = null;
    }, 100);
};

// ============================================
// TTS CONTROLS
// ============================================

const createTTSControls = (messageText, messageElement) => {
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'tts-controls';
    
    controlsDiv.innerHTML = `
        <div class="tts-basic-controls">
            <button class="tts-play" title="Play audio">
                <span class="material-symbols-rounded" style="font-size: 18px;">play_arrow</span>
            </button>
            <button class="tts-pause" title="Pause audio" style="display: none;">
                <span class="material-symbols-rounded" style="font-size: 18px;">pause</span>
            </button>
            <button class="tts-stop" title="Stop audio" style="display: none;">
                <span class="material-symbols-rounded" style="font-size: 18px;">stop</span>
            </button>
            <div class="tts-progress">
                <div class="tts-progress-bar"></div>
            </div>
        </div>
        <div class="tts-advanced-controls" style="display: none;">
            <select class="tts-speed" title="Speech speed">
                <option value="0.7">Slow</option>
                <option value="1" selected>Normal</option>
                <option value="1.3">Fast</option>
            </select>
            ${availableVoices.length > 1 ? `
                <select class="tts-voice-selector" title="Select voice">
                    ${availableVoices.map(voice => 
                        `<option value="${voice.name}">${voice.name.replace('Microsoft', '').replace('Google', '').replace('English', '').replace('United States', '').trim() || 'Default'}</option>`
                    ).join('')}
                </select>
            ` : ''}
        </div>
        <button class="tts-settings" title="Settings">
            <span class="material-symbols-rounded" style="font-size: 16px;">settings</span>
        </button>
    `;

    const playBtn = controlsDiv.querySelector('.tts-play');
    const pauseBtn = controlsDiv.querySelector('.tts-pause');
    const stopBtn = controlsDiv.querySelector('.tts-stop');
    const progressBar = controlsDiv.querySelector('.tts-progress-bar');
    const speedSelect = controlsDiv.querySelector('.tts-speed');
    const voiceSelect = controlsDiv.querySelector('.tts-voice-selector');
    const settingsBtn = controlsDiv.querySelector('.tts-settings');
    const advancedControls = controlsDiv.querySelector('.tts-advanced-controls');

    let utterance = null;
    let progressInterval;
    let isSpeaking = false;
    let isStopped = false; // Flag to track if speech was manually stopped
    let isPausedState = false; // Track if we're in a paused state
    let pauseStartTime = null; // Track when pause started
    let speechStartTime = null; // Track when speech started
    let originalMessageText = messageText; // Store original text for resume

    // Update button states
    const updateButtonStates = (speaking, paused) => {
        if (speaking && !paused) {
            // Speaking - show pause and stop
            playBtn.style.display = 'none';
            pauseBtn.style.display = 'block';
            stopBtn.style.display = 'block';
            messageElement.classList.add('playing-audio');
        } else if (speaking && paused) {
            // Paused - show play and stop
            playBtn.style.display = 'block';
            pauseBtn.style.display = 'none';
            stopBtn.style.display = 'block';
            messageElement.classList.add('playing-audio');
        } else {
            // Not speaking - show play only
            playBtn.style.display = 'block';
            pauseBtn.style.display = 'none';
            stopBtn.style.display = 'none';
            messageElement.classList.remove('playing-audio');
            progressBar.style.width = '0%';
        }
    };

    const speakTextLocal = () => {
        // Stop any current speech first
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }
        
        // Clear any existing interval
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
        
        // Reset state before starting new speech
        isSpeaking = false;
        if (currentUtterance === utterance) {
            currentUtterance = null;
        }
        progressBar.style.width = '0%';
        
        // Create new utterance
        utterance = new SpeechSynthesisUtterance(messageText);
        utterance.rate = speedSelect ? parseFloat(speedSelect.value) : 1;
        utterance.pitch = 1;
        utterance.volume = 0.9;

        if (voiceSelect) {
            const selectedVoice = availableVoices.find(voice => voice.name === voiceSelect.value);
            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }
        } else {
            const preferredVoice = getPreferredVoice();
            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }
        }

        utterance.onstart = () => {
            isSpeaking = true;
            isStopped = false; // Reset stopped flag when speech starts
            isPausedState = false; // Reset paused state
            pauseStartTime = null; // Reset pause time
            speechStartTime = Date.now(); // Track when speech starts
            currentUtterance = utterance;
            updateButtonStates(true, false);

            // Clear any existing interval
            if (progressInterval) {
                clearInterval(progressInterval);
            }

            // Start progress animation
            progressInterval = setInterval(() => {
                if (utterance && speechSynthesis.speaking && !speechSynthesis.paused) {
                    const progress = (Date.now() % 2000) / 2000 * 100;
                    progressBar.style.width = `${progress}%`;
                } else if (speechSynthesis.paused) {
                    // Keep progress bar when paused
                    progressBar.style.width = progressBar.style.width || '50%';
                }
            }, 100);
        };

        utterance.onend = () => {
            // Clear intervals
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
            // Reset state
            isSpeaking = false;
            isStopped = false; // Reset stopped flag when speech ends naturally
            // Always update button states to show play button
            updateButtonStates(false, false);
            // Don't clear current utterance reference - keep it so play button works
            // Only clear if it's not our utterance
            if (currentUtterance !== utterance) {
                currentUtterance = null;
            }
            // Reset progress bar
            progressBar.style.width = '0%';
            // Keep utterance reference so user can replay
        };

        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            // Clear intervals
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
            // Reset state
            isSpeaking = false;
            isStopped = false; // Reset stopped flag on error
            // Always update button states to show play button
            updateButtonStates(false, false);
            // Don't clear current utterance reference - keep it so play button works
            if (currentUtterance !== utterance) {
                currentUtterance = null;
            }
            // Reset progress bar
            progressBar.style.width = '0%';
        };

        utterance.onpause = () => {
            // Stop progress animation
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
            // Update button states - show play button, hide pause button
            isSpeaking = true; // Still speaking, just paused
            isStopped = false; // Not stopped, just paused
            isPausedState = true; // Mark as paused
            pauseStartTime = Date.now(); // Track when paused
            // Always update to paused state
            updateButtonStates(true, true);
            // Ensure currentUtterance is set so resume works
            if (!currentUtterance) {
                currentUtterance = utterance;
            }
        };

        utterance.onresume = () => {
            // Update button states - show pause button, hide play button
            isSpeaking = true;
            isStopped = false; // Not stopped
            isPausedState = false; // No longer paused
            pauseStartTime = null; // Clear pause time
            // Ensure currentUtterance is set
            if (!currentUtterance) {
                currentUtterance = utterance;
            }
            // Update button states
            updateButtonStates(true, false);
            // Restart progress animation
            if (progressInterval) {
                clearInterval(progressInterval);
            }
            progressInterval = setInterval(() => {
                if (utterance && speechSynthesis.speaking && !speechSynthesis.paused) {
                    const progress = (Date.now() % 2000) / 2000 * 100;
                    progressBar.style.width = `${progress}%`;
                }
            }, 100);
        };

        speechSynthesis.speak(utterance);
    };

    // Monitor speech synthesis state to update buttons when speech starts externally (auto-speak)
    const checkSpeechState = () => {
        // Check if we have an utterance
        if (!utterance) {
            // Even without utterance, if buttons show pause, reset them
            if (pauseBtn.style.display !== 'none') {
                updateButtonStates(false, false);
            }
            return;
        }
        
        // Check if speech is currently speaking
        const isCurrentlySpeaking = speechSynthesis.speaking;
        const isCurrentlyPaused = speechSynthesis.paused;
        const isOurUtterance = currentUtterance === utterance;
        
        // If speech was manually stopped, don't interfere with button states
        // Just ensure play button is visible
        if (isStopped && !isCurrentlySpeaking) {
            if (playBtn.style.display === 'none') {
                updateButtonStates(false, false);
            }
            return;
        }
        
        if (isCurrentlySpeaking) {
            // Speech is speaking - check if it's our utterance
            if (isOurUtterance || !currentUtterance) {
                // Reset stopped flag when speech starts again
                isStopped = false;
                // Ensure currentUtterance is set to our utterance
                if (!currentUtterance && utterance) {
                    currentUtterance = utterance;
                }
                
                // Update button states based on pause state
                if (isCurrentlyPaused) {
                    // Paused - show play button, hide pause button
                    isSpeaking = true;
                    // Only update if button states are incorrect
                    if (playBtn.style.display === 'none' || pauseBtn.style.display !== 'none') {
                        updateButtonStates(true, true);
                    }
                    // Stop progress animation when paused
                    if (progressInterval) {
                        clearInterval(progressInterval);
                        progressInterval = null;
                    }
                } else {
                    // Speaking (not paused) - show pause button, hide play button
                    isSpeaking = true;
                    // Only update if button states are incorrect
                    if (pauseBtn.style.display === 'none' || playBtn.style.display !== 'none') {
                        updateButtonStates(true, false);
                    }
                    // Start progress animation if not already running
                    if (!progressInterval) {
                        progressInterval = setInterval(() => {
                            if (utterance && speechSynthesis.speaking && !speechSynthesis.paused) {
                                const progress = (Date.now() % 2000) / 2000 * 100;
                                progressBar.style.width = `${progress}%`;
                            }
                        }, 100);
                    }
                }
            }
        } else if (!isCurrentlySpeaking) {
            // Speech is not speaking
            // Only update if we were speaking and it wasn't manually stopped
            if (!isStopped && (isSpeaking || isOurUtterance)) {
                // Speech ended naturally - reset to play button
                isSpeaking = false;
                updateButtonStates(false, false);
                // Clear intervals
                if (progressInterval) {
                    clearInterval(progressInterval);
                    progressInterval = null;
                }
                // Reset progress bar
                progressBar.style.width = '0%';
                // Don't clear utterance reference - keep it for replay
            } else if (isStopped) {
                // Speech was stopped - ensure play button is visible
                isSpeaking = false;
                if (playBtn.style.display === 'none' || pauseBtn.style.display !== 'none') {
                    updateButtonStates(false, false);
                }
                // Clear intervals
                if (progressInterval) {
                    clearInterval(progressInterval);
                    progressInterval = null;
                }
                // Reset progress bar
                progressBar.style.width = '0%';
            }
        } else if (isCurrentlySpeaking && !isOurUtterance && isSpeaking && !isStopped) {
            // Another utterance is speaking, but we thought we were speaking
            // Reset our state (only if not manually stopped)
            isSpeaking = false;
            updateButtonStates(false, false);
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
            progressBar.style.width = '0%';
        }
    };

    // Check speech state more frequently for better responsiveness
    const stateCheckInterval = setInterval(checkSpeechState, 50);

    // Clean up interval when controls are removed
    const originalRemove = controlsDiv.remove.bind(controlsDiv);
    controlsDiv.remove = function() {
        clearInterval(stateCheckInterval);
        if (progressInterval) {
            clearInterval(progressInterval);
        }
        originalRemove();
    };

    playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        // Reset stopped flag when play is clicked
        isStopped = false;
        
        // Check current state
        const isPaused = speechSynthesis.paused;
        const isSpeakingNow = speechSynthesis.speaking;
        const hasUtterance = utterance !== null;
        
        // Priority 1: If speech is currently paused, try to resume
        if (isSpeakingNow && isPaused && hasUtterance && utterance) {
            // Ensure currentUtterance is set
            if (!currentUtterance) {
                currentUtterance = utterance;
            }
            
            // Update button states immediately
            isSpeaking = true;
            isPausedState = false;
            updateButtonStates(true, false);
            
            // Try to resume - try multiple times if needed
            let resumeAttempts = 0;
            const maxResumeAttempts = 3;
            
            const attemptResume = () => {
                resumeAttempts++;
                try {
                    speechSynthesis.resume();
                    
                    // Check if resume worked
                    setTimeout(() => {
                        if (speechSynthesis.speaking && !speechSynthesis.paused) {
                            // Resume worked!
                            // Restart progress animation
                            if (progressInterval) {
                                clearInterval(progressInterval);
                            }
                            progressInterval = setInterval(() => {
                                if (utterance && speechSynthesis.speaking && !speechSynthesis.paused) {
                                    const progress = (Date.now() % 2000) / 2000 * 100;
                                    progressBar.style.width = `${progress}%`;
                                }
                            }, 100);
                        } else if (resumeAttempts < maxResumeAttempts) {
                            // Resume didn't work, try again
                            setTimeout(() => {
                                attemptResume();
                            }, 100);
                        } else {
                            // Resume failed after multiple attempts - restart speech
                            console.warn('Resume failed after multiple attempts, restarting speech');
                            if (speechSynthesis.speaking) {
                                speechSynthesis.cancel();
                            }
                            setTimeout(() => {
                                speakTextLocal();
                            }, 150);
                        }
                    }, 250);
                } catch (error) {
                    console.error('Resume attempt error:', error);
                    if (resumeAttempts < maxResumeAttempts) {
                        setTimeout(() => {
                            attemptResume();
                        }, 100);
                    } else {
                        // Resume failed - restart speech
                        if (speechSynthesis.speaking) {
                            speechSynthesis.cancel();
                        }
                        setTimeout(() => {
                            speakTextLocal();
                        }, 150);
                    }
                }
            };
            
            // Start resume attempt
            attemptResume();
            return;
        }
        
        // Priority 2: If in paused state but speech ended, restart
        if (isPausedState && hasUtterance && !isSpeakingNow) {
            isPausedState = false;
            speakTextLocal();
            return;
        }
        
        // Priority 2b: If in paused state but speech is not actually paused, restart
        if (isPausedState && hasUtterance) {
            // We're in paused state - restart speech
            if (speechSynthesis.speaking) {
                speechSynthesis.cancel();
            }
            setTimeout(() => {
                isPausedState = false;
                speakTextLocal();
            }, 150);
            return;
        }
        
        // Priority 3: If already speaking and not paused, do nothing
        if (isSpeakingNow && !isPaused && utterance && currentUtterance === utterance) {
            return;
        }
        
        // Priority 4: Start new speech (or replay if stopped)
        speakTextLocal();
    });
    
    // Helper function to restart speech after pause
    const restartSpeechAfterPause = () => {
        // Cancel any current speech
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }
        
        // Reset state
        isPausedState = false;
        pauseStartTime = null;
        
        // Small delay to ensure cancel is processed
        setTimeout(() => {
            // Restart speech from beginning
            speakTextLocal();
        }, 100);
    };

    pauseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        // Check if speech is speaking and we have an utterance
        const isSpeakingNow = speechSynthesis.speaking;
        const isPausedNow = speechSynthesis.paused;
        const hasOurUtterance = utterance && (currentUtterance === utterance || !currentUtterance);
        
        if (hasOurUtterance && isSpeakingNow && !isPausedNow) {
            // Ensure currentUtterance is set
            if (!currentUtterance && utterance) {
                currentUtterance = utterance;
            }
            
            // Try to pause the speech
            try {
                // Call pause
                speechSynthesis.pause();
                
                // Update state immediately
                isSpeaking = true;
                isStopped = false;
                isPausedState = true;
                pauseStartTime = Date.now();
                
                // Update button states to show play button and hide pause button
                updateButtonStates(true, true);
                
                // Clear progress animation interval immediately
                if (progressInterval) {
                    clearInterval(progressInterval);
                    progressInterval = null;
                }
                
                // Verify pause worked - check multiple times
                let pauseCheckCount = 0;
                const pauseCheckInterval = setInterval(() => {
                    pauseCheckCount++;
                    const stillSpeaking = speechSynthesis.speaking;
                    const actuallyPaused = speechSynthesis.paused;
                    
                    if (actuallyPaused && stillSpeaking) {
                        // Pause worked!
                        clearInterval(pauseCheckInterval);
                        console.log('Pause confirmed - speech is paused');
                    } else if (!actuallyPaused && stillSpeaking && pauseCheckCount >= 5) {
                        // Pause didn't work after multiple checks
                        clearInterval(pauseCheckInterval);
                        console.warn('Pause not working - browser may not support it properly');
                        // Cancel speech and keep paused state - resume will restart
                        if (speechSynthesis.speaking) {
                            speechSynthesis.cancel();
                        }
                        // Keep isPausedState = true so resume knows to restart
                    } else if (!stillSpeaking) {
                        // Speech ended while checking
                        clearInterval(pauseCheckInterval);
                        isPausedState = false;
                    }
                }, 100);
            } catch (error) {
                console.error('Error pausing speech:', error);
                // If pause throws an error, cancel and mark as paused
                if (speechSynthesis.speaking) {
                    speechSynthesis.cancel();
                }
                isPausedState = true;
                pauseStartTime = Date.now();
                updateButtonStates(true, true);
            }
        }
    });

    stopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        // Set stopped flag first
        isStopped = true;
        
        // Stop speech if it's our utterance or if speech is speaking
        if (utterance) {
            if (currentUtterance === utterance || speechSynthesis.speaking) {
                speechSynthesis.cancel();
            }
        } else if (speechSynthesis.speaking) {
            // Even if utterance is null, cancel any speech
            speechSynthesis.cancel();
        }
        
        // Clear intervals immediately
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
        
        // Reset state immediately
        isSpeaking = false;
        // Always update to show play button when stopped - this should persist
        updateButtonStates(false, false);
        
        // Don't clear current utterance reference - keep it so user can replay
        // Only clear if it's not our utterance
        if (utterance && currentUtterance !== utterance) {
            currentUtterance = null;
        }
        
        // Reset progress bar
        progressBar.style.width = '0%';
        
        // Force button state to remain - play button should stay visible
        // Use a small delay to ensure state is set after any async operations
        setTimeout(() => {
            if (playBtn.style.display === 'none') {
                updateButtonStates(false, false);
            }
        }, 50);
    });

    if (speedSelect) {
        speedSelect.addEventListener('change', () => {
            if (speechSynthesis.speaking && utterance && currentUtterance === utterance) {
                const wasPaused = speechSynthesis.paused;
                speechSynthesis.cancel();
                if (!wasPaused) {
                    setTimeout(speakTextLocal, 100);
                }
            }
        });
    }

    if (voiceSelect) {
        voiceSelect.addEventListener('change', () => {
            if (speechSynthesis.speaking && utterance && currentUtterance === utterance) {
                const wasPaused = speechSynthesis.paused;
                speechSynthesis.cancel();
                if (!wasPaused) {
                    setTimeout(speakTextLocal, 100);
                }
            }
        });
        
        const preferredVoice = getPreferredVoice();
        if (preferredVoice) {
            voiceSelect.value = preferredVoice.name;
        }
    }

    settingsBtn.addEventListener('click', () => {
        const isVisible = advancedControls.style.display !== 'none';
        advancedControls.style.display = isVisible ? 'none' : 'flex';
        settingsBtn.classList.toggle('active', !isVisible);
    });

    // Return controls div and a function to start auto-speech
    return {
        controlsDiv: controlsDiv,
        startAutoSpeech: () => {
            // Use the same utterance system so controls work
            speakTextLocal();
        },
        getUtterance: () => utterance
    };
};

// ============================================
// CONNECTION MONITORING
// ============================================

const updateConnectionStatus = (online) => {
    isOnline = online;
    
    if (!statusIndicator || !statusText) return;
    
    if (online) {
        statusIndicator.classList.remove('offline');
        statusText.classList.remove('offline');
        statusText.textContent = 'Online';
        hideConnectionWarning();
        
        // Check if there are queued messages
        if (offlineMessageQueue.length > 0) {
            showConnectionWarning('Connection restored! You have pending messages.', 'success', true);
        }
    } else {
        statusIndicator.classList.add('offline');
        statusText.classList.add('offline');
        statusText.textContent = 'Offline';
        showConnectionWarning('No internet connection. Messages will be queued.', 'error', false);
    }
};

const showConnectionWarning = (message, type = 'error', showRetry = false) => {
    if (!connectionWarning || !warningText || !warningIcon) return;
    
    connectionWarning.className = `connection-warning ${type} show`;
    warningText.textContent = message;
    warningIcon.textContent = type === 'error' ? 'wifi_off' : type === 'success' ? 'check_circle' : 'warning';
    
    if (warningAction) {
        if (showRetry && offlineMessageQueue.length > 0) {
            warningAction.textContent = 'Process Queue';
            warningAction.style.display = 'block';
        } else if (showRetry) {
            warningAction.textContent = 'Retry';
            warningAction.style.display = 'block';
        } else {
            warningAction.style.display = 'none';
        }
    }
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            hideConnectionWarning();
        }, 5000);
    }
};

const hideConnectionWarning = () => {
    if (!connectionWarning) return;
    connectionWarning.classList.remove('show');
    setTimeout(() => {
        if (connectionWarning) {
            connectionWarning.className = 'connection-warning';
        }
    }, 300);
};

const checkConnection = async () => {
    try {
        // Try to fetch a small resource to verify connection
        const response = await fetch('https://www.google.com/favicon.ico', {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-cache'
        });
        if (!isOnline) {
            updateConnectionStatus(true);
        }
        return true;
    } catch (error) {
        if (isOnline) {
            updateConnectionStatus(false);
        }
        return false;
    }
};

const processOfflineQueue = async () => {
    if (!isOnline || offlineMessageQueue.length === 0) return;
    
    hideConnectionWarning();
    showConnectionWarning(`Processing ${offlineMessageQueue.length} queued message(s)...`, 'success', false);
    
    // Process each queued message
    while (offlineMessageQueue.length > 0) {
        const queuedItem = offlineMessageQueue.shift();
        
        try {
            // Create bot message element with thinking indicator
            const messageContent = `<div class="message-wrapper">
                <svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024">
                    <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z"></path>
                </svg>
                <div class="message-text">
                    <div class="thinking-indicator">
                        <div class="dot"></div>
                        <div class="dot"></div>
                        <div class="dot"></div>
                    </div>
                </div>
            </div>`;
            
            const incomingMessageDiv = createMessageElement(messageContent, "bot-message", "thinking");
            chatBody.appendChild(incomingMessageDiv);
            chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
            
            await generateBotResponse(incomingMessageDiv, queuedItem.message, queuedItem.context);
            
            // Small delay between messages
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error('Error processing queued message:', error);
            // Re-add to queue if failed
            offlineMessageQueue.unshift(queuedItem);
            break;
        }
    }
    
    if (offlineMessageQueue.length === 0) {
        showConnectionWarning('All queued messages processed successfully!', 'success', false);
    }
};

// Event listeners for connection status
window.addEventListener('online', () => {
    updateConnectionStatus(true);
    checkConnection();
});

window.addEventListener('offline', () => {
    updateConnectionStatus(false);
});

// Start connection monitoring (will be initialized in DOMContentLoaded)
// connectionCheckInterval will be set after DOM is loaded

// ============================================
// MESSAGE HANDLING
// ============================================

const createMessageElement = (content, ...classes) => {
    const div = document.createElement("div");
    div.classList.add("message", ...classes);
    div.innerHTML = content;
    return div;
};

const generateBotResponse = async (incomingMessageDiv, userMessage, context = null) => {
    const messageElement = incomingMessageDiv.querySelector(".message-text");
    
    // Build conversation context
    let conversationContext = recommendationSystem.systemPrompt + "\n\n";
    
    // Add context if provided (from quick actions)
    if (context) {
        conversationContext += context + "\n\n";
    }
    
    // Add chat history
    const historyText = chatHistory.map(msg => {
        if (msg.role === "user") {
            return `User: ${msg.parts[0].text}`;
        } else {
            return `Assistant: ${msg.parts[0].text}`;
        }
    }).join("\n\n");
    
    if (historyText) {
        conversationContext += "Previous conversation:\n" + historyText + "\n\n";
    }
    
    conversationContext += `User: ${userMessage}\nAssistant:`;

    // Add user message to chat history
    chatHistory.push({
        role: "user",
        parts: [{ text: userMessage }]
    });

    // API request
    const requestOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{
                role: "user",
                parts: [{ text: conversationContext }]
            }]
        })
    };

    try {
        // Check connection before making request
        if (!isOnline) {
            throw new Error("No internet connection");
        }
        
        const response = await fetch(API_URL, requestOptions);
        const data = await response.json();
        
        if (!response.ok) {
            // Check if it's a network error
            if (!response.status || response.status === 0) {
                throw new Error("Network error - no connection");
            }
            throw new Error(data.error?.message || "API request failed");
        }
        
        // Connection is working, update status
        if (!isOnline) {
            updateConnectionStatus(true);
        }

        // Extract and clean bot's response
        let apiResponseText = data.candidates[0].content.parts[0].text
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.*?)\*/g, "<em>$1</em>")
            .trim();
        
        // Format lists
        apiResponseText = apiResponseText
            .replace(/^\d+\.\s+/gm, "• ")
            .replace(/^-\s+/gm, "• ");
        
        // Create message content
        messageElement.innerHTML = '';
        const textContent = document.createElement('div');
        textContent.className = 'message-text-content';
        textContent.innerHTML = apiResponseText;
        messageElement.appendChild(textContent);

        // Add TTS controls and auto-speak
        if (isSpeechEnabled && apiResponseText) {
            const cleanText = apiResponseText.replace(/<[^>]*>/g, '');
            const ttsControlsResult = createTTSControls(cleanText, incomingMessageDiv);
            incomingMessageDiv.querySelector('.message-wrapper').appendChild(ttsControlsResult.controlsDiv);
            
            // Auto-speak the response using TTS controls so buttons work correctly
            if (autoSpeakEnabled) {
                setTimeout(() => {
                    ttsControlsResult.startAutoSpeech();
                }, 500);
            }
        }

        // Add bot response to chat history
        chatHistory.push({
            role: "model",
            parts: [{ text: apiResponseText.replace(/<[^>]*>/g, '') }]
        });
    } catch (error) {
        console.error("Error generating response:", error);
        incomingMessageDiv.classList.remove("thinking");
        
        // Check if it's a connection error
        if (error.message.includes("connection") || error.message.includes("Network") || error.message.includes("Failed to fetch")) {
            updateConnectionStatus(false);
            messageElement.innerHTML = '<div class="message-text-content" style="color: #ef4444;"><strong>⚠️ Connection Error</strong><br>Your message has been queued and will be sent when connection is restored. Please check your internet connection.</div>';
            
            // Don't add to chat history if it failed
            chatHistory.pop(); // Remove the user message that was added
            
            // Show retry option
            const retryButton = document.createElement('button');
            retryButton.textContent = 'Retry Now';
            retryButton.style.cssText = 'margin-top: 8px; padding: 6px 12px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer;';
            retryButton.onclick = () => {
                checkConnection().then(connected => {
                    if (connected) {
                        incomingMessageDiv.remove();
                        // Retry the message
                        handleOutgoingMessage(new Event('submit'), null);
                    } else {
                        alert('Still no connection. Please check your internet and try again.');
                    }
                });
            };
            messageElement.appendChild(retryButton);
        } else {
            messageElement.innerHTML = `<div class="message-text-content" style="color: #ef4444;"><strong>Error</strong><br>Sorry, I encountered an error: ${error.message}. Please try again.</div>`;
        }
    } finally {
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
    }
};

// ============================================
// SPEECH RECOGNITION
// ============================================

const setupSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        speechToTextButton.style.display = "none";
        console.warn("Speech recognition not supported in this browser");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    const errorElement = document.createElement("div");
    errorElement.classList.add("speech-recognition-error");
    speechToTextButton.parentNode.insertBefore(errorElement, speechToTextButton);

    recognition.onstart = () => {
        speechToTextButton.classList.add("listening");
        errorElement.classList.remove("show");
    };

    recognition.onend = () => {
        speechToTextButton.classList.remove("listening");
    };

    recognition.onerror = (event) => {
        let errorMessage = "Error occurred in recognition";
        switch(event.error) {
            case 'no-speech':
                errorMessage = "No speech detected. Please try again.";
                break;
            case 'audio-capture':
                errorMessage = "No microphone found";
                break;
            case 'not-allowed':
                errorMessage = "Microphone access denied. Please allow microphone access.";
                break;
            default:
                errorMessage = `Recognition error: ${event.error}`;
        }
        
        errorElement.textContent = errorMessage;
        errorElement.classList.add("show");
        setTimeout(() => errorElement.classList.remove("show"), 4000);
        speechToTextButton.classList.remove("listening");
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        messageInput.value = transcript;
        messageInput.dispatchEvent(new Event("input"));
        messageInput.focus();
        
        // Auto-submit if there's text
        setTimeout(() => {
            if (messageInput.value.trim()) {
                handleOutgoingMessage(new Event('submit'));
            }
        }, 300);
    };

    speechToTextButton.addEventListener("click", (e) => {
        e.preventDefault();
        try {
            if (speechToTextButton.classList.contains("listening")) {
                recognition.stop();
            } else {
                recognition.start();
            }
        } catch (error) {
            console.error("Speech recognition error:", error);
            errorElement.textContent = "Failed to start recognition";
            errorElement.classList.add("show");
            setTimeout(() => errorElement.classList.remove("show"), 3000);
        }
    });
};

// ============================================
// MESSAGE HANDLERS
// ============================================

const handleOutgoingMessage = (e, quickAction = null) => {
    e.preventDefault();
    
    let userMessage = messageInput.value.trim();
    
    // Handle quick actions
    if (quickAction && recommendationSystem.quickActions[quickAction]) {
        const action = recommendationSystem.quickActions[quickAction];
        userMessage = action.trigger;
        userData.message = userMessage;
    } else {
        userData.message = userMessage;
    }
    
    if (!userData.message) return;
    
    // Collapse quick actions section when chat starts
    const quickActionsContainer = document.querySelector('.quick-actions-container');
    if (quickActionsContainer && !quickActionsContainer.classList.contains('collapsed')) {
        quickActionsContainer.classList.add('collapsed');
        // Store state in localStorage
        localStorage.setItem('quickActionsCollapsed', 'true');
    }
    
    // Clear input
    messageInput.value = "";
    messageInput.dispatchEvent(new Event("input"));

    // Stop any ongoing speech
    stopAllSpeech();

    // Create and display user message
    const messageContent = `<div class="message-wrapper">
        <div class="message-text">
            <div class="message-text-content">${userData.message}</div>
        </div>
    </div>`;

    const outgoingMessageDiv = createMessageElement(messageContent, "user-message");
    chatBody.appendChild(outgoingMessageDiv);
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

    // Get context for quick actions
    let context = null;
    if (quickAction && recommendationSystem.quickActions[quickAction]) {
        context = recommendationSystem.quickActions[quickAction].prompt;
    }

    // Check if offline and queue message
    if (!isOnline) {
        offlineMessageQueue.push({ message: userData.message, context });
        const offlineMessage = createMessageElement(
            `<div class="message-wrapper">
                <div class="message-text">
                    <div class="message-text-content" style="color: #f59e0b;">
                        <strong>📴 Offline</strong><br>Your message has been queued. It will be sent when connection is restored.
                    </div>
                </div>
            </div>`,
            "bot-message"
        );
        chatBody.appendChild(offlineMessage);
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
        return;
    }

    // Simulate bot response with thinking indicator
    setTimeout(() => {
        const messageContent = `<div class="message-wrapper">
            <svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024">
                <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z"></path>
            </svg>
            <div class="message-text">
                <div class="thinking-indicator">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            </div>
        </div>`;

        const incomingMessageDiv = createMessageElement(messageContent, "bot-message", "thinking");
        chatBody.appendChild(incomingMessageDiv);
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
        
        generateBotResponse(incomingMessageDiv, userData.message, context);
    }, 600);
};

// ============================================
// EVENT LISTENERS
// ============================================

// Message input handling
messageInput.addEventListener("keydown", (e) => {
    const userMessage = e.target.value.trim();
    if (e.key === "Enter" && userMessage && !e.shiftKey && window.innerWidth > 768) {
        handleOutgoingMessage(e);
    }
});

// Auto-resize textarea
messageInput.addEventListener("input", () => {
    messageInput.style.height = `${initialInputHeight}px`;
    messageInput.style.height = `${messageInput.scrollHeight}px`;
    const borderRadius = messageInput.scrollHeight > initialInputHeight ? "20px" : "24px";
    document.querySelector(".chat-form").style.borderRadius = borderRadius;
});

// Form submission
chatForm.addEventListener("submit", (e) => handleOutgoingMessage(e));

// Send button
sendMessageButton.addEventListener("click", (e) => handleOutgoingMessage(e));

// Quick action buttons
quickActionButtons.forEach(button => {
    button.addEventListener("click", (e) => {
        const action = button.getAttribute("data-action");
        if (action && recommendationSystem.quickActions[action]) {
            handleOutgoingMessage(e, action);
        }
    });
});

// Chatbot toggler
chatbotToggler.addEventListener("click", () => {
    document.body.classList.toggle("show-chatbot");
    if (document.body.classList.contains("show-chatbot")) {
        messageInput.focus();
        // Check connection when opening
        checkConnection();
        // Close quick actions if chat history exists (after prompt has been sent)
        const quickActionsContainer = document.querySelector('.quick-actions-container');
        if (quickActionsContainer && chatHistory.length > 0) {
            quickActionsContainer.classList.add('collapsed');
            localStorage.setItem('quickActionsCollapsed', 'true');
        }
    }
});

// Close chatbot
closeChatbot.addEventListener("click", () => {
    document.body.classList.remove("show-chatbot");
    stopAllSpeech();
});

// Emoji picker
const picker = new EmojiMart.Picker({
    theme: "light",
    skinTonePosition: "none",
    previewPosition: "none",
    onEmojiSelect: (emoji) => {
        const { selectionStart: start, selectionEnd: end } = messageInput;
        messageInput.setRangeText(emoji.native, start, end, "end");
        messageInput.focus();
    },
    onClickOutside: () => {
        document.body.classList.remove("show-emoji-picker");
    }
});

document.querySelector(".chat-form").appendChild(picker);

document.querySelector("#emoji-picker").addEventListener("click", (e) => {
    e.preventDefault();
    document.body.classList.toggle("show-emoji-picker");
});

// Close emoji picker when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('em-emoji-picker') && !e.target.closest('#emoji-picker')) {
        document.body.classList.remove('show-emoji-picker');
    }
});

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM references
    statusIndicator = document.querySelector('.status-indicator');
    statusText = document.querySelector('#status-text');
    connectionWarning = document.querySelector('#connection-warning');
    warningText = document.querySelector('#warning-text');
    warningIcon = document.querySelector('#warning-icon');
    warningAction = document.querySelector('#warning-action');
    chatbotOverlay = document.querySelector('#chatbot-overlay');
    
    // Quick Actions Toggle
    const quickActionsToggle = document.querySelector('#quick-actions-toggle');
    const quickActionsContainer = document.querySelector('.quick-actions-container');
    const quickActionsHeader = document.querySelector('.quick-actions-header');
    
    if (quickActionsToggle && quickActionsContainer) {
        // Toggle functionality
        const toggleQuickActions = () => {
            quickActionsContainer.classList.toggle('collapsed');
            // Store state in localStorage
            const isCollapsed = quickActionsContainer.classList.contains('collapsed');
            localStorage.setItem('quickActionsCollapsed', isCollapsed);
        };
        
        // Restore state from localStorage or close if chat history exists
        const savedState = localStorage.getItem('quickActionsCollapsed');
        if (savedState === 'true' || chatHistory.length > 0) {
            quickActionsContainer.classList.add('collapsed');
            localStorage.setItem('quickActionsCollapsed', 'true');
        }
        
        // Add click handlers
        quickActionsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleQuickActions();
        });
        
        quickActionsHeader.addEventListener('click', (e) => {
            // Only toggle if clicking on the header itself, not on the toggle button
            if (e.target !== quickActionsToggle && !quickActionsToggle.contains(e.target)) {
                toggleQuickActions();
            }
        });
    }
    
    // Initialize connection monitoring
    if (statusIndicator && statusText) {
        updateConnectionStatus(navigator.onLine);
        checkConnection();
        
        // Start connection monitoring (clear any existing interval first)
        if (connectionCheckInterval) {
            clearInterval(connectionCheckInterval);
        }
        connectionCheckInterval = setInterval(checkConnection, 30000); // Check every 30 seconds
    }
    
    // Setup warning action button handler
    if (warningAction) {
        warningAction.addEventListener('click', () => {
            if (offlineMessageQueue.length > 0) {
                processOfflineQueue();
            } else if (!isOnline) {
                checkConnection().then(connected => {
                    if (connected) {
                        updateConnectionStatus(true);
                    }
                });
            }
        });
    }
    
    // Overlay click to close chatbot
    if (chatbotOverlay) {
        chatbotOverlay.addEventListener('click', () => {
            document.body.classList.remove("show-chatbot");
            stopAllSpeech();
        });
    }
    
    initializeVoices();
    setupSpeechRecognition();
    
    // Ensure voices are loaded
    setTimeout(() => {
        if (availableVoices.length === 0) {
            initializeVoices();
        }
    }, 1000);
    
    // Focus input when chatbot opens
    chatbotToggler.addEventListener("click", () => {
        setTimeout(() => {
            if (document.body.classList.contains("show-chatbot")) {
                messageInput.focus();
            }
        }, 300);
    });
});

// Handle page visibility change
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopAllSpeech();
    }
});

// Handle window focus
window.addEventListener('focus', () => {
    if (document.body.classList.contains("show-chatbot")) {
        messageInput.focus();
    }
});
