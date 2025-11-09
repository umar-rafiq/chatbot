const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const fileInput = document.querySelector("#file-input");
const fileUploadWrapper = document.querySelector(".file-upload-wrapper");
const fileCancelButton = document.querySelector("#file-cancel");
const chatbotToggler = document.querySelector("#chatbot-toggler");
const closeChatbot = document.querySelector("#close-chatbot");
const speechToTextButton = document.querySelector("#speech-to-text");

// API setup
const API_KEY = "AIzaSyCTPWIIEff4WVhwUkz1eIuIeAupffKFegg";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

const userData = {
    message: null,
    file: {
        data: null,
        mime_type: null
    }
}

const chatHistory = [];
const initialInputHeight = messageInput.scrollHeight;

// Text-to-Speech setup
let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;
let availableVoices = [];
let isSpeechEnabled = true;

// Initialize voices
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

// Get the best available voice
const getPreferredVoice = () => {
    if (availableVoices.length === 0) return null;
    
    const preferredVoices = availableVoices.filter(voice => 
        voice.name.includes('Female') || 
        voice.name.includes('Google') || 
        voice.name.includes('Samantha') ||
        voice.name.includes('Karen') ||
        voice.name.includes('Microsoft Zira') ||
        voice.name.includes('Victoria')
    );
    
    return preferredVoices.length > 0 ? preferredVoices[0] : availableVoices[0];
};

// Create compact TTS controls for a message
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
    const basicControls = controlsDiv.querySelector('.tts-basic-controls');

    let utterance = null;
    let progressInterval;

    const speakText = () => {
        if (utterance) {
            speechSynthesis.cancel();
        }

        utterance = new SpeechSynthesisUtterance(messageText);
        utterance.rate = speedSelect ? parseFloat(speedSelect.value) : 1;
        utterance.pitch = 1;
        utterance.volume = 0.8;

        // Set selected voice
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

        // Event handlers
        utterance.onstart = () => {
            messageElement.classList.add('playing-audio');
            playBtn.style.display = 'none';
            pauseBtn.style.display = 'block';
            stopBtn.style.display = 'block';
            currentUtterance = utterance;

            progressInterval = setInterval(() => {
                if (utterance && speechSynthesis.speaking) {
                    const progress = (Date.now() % 2000) / 2000 * 100;
                    progressBar.style.width = `${progress}%`;
                }
            }, 100);
        };

        utterance.onend = () => {
            clearInterval(progressInterval);
            messageElement.classList.remove('playing-audio');
            playBtn.style.display = 'block';
            pauseBtn.style.display = 'none';
            stopBtn.style.display = 'none';
            progressBar.style.width = '0%';
            currentUtterance = null;
            utterance = null;
        };

        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
            clearInterval(progressInterval);
            messageElement.classList.remove('playing-audio');
            playBtn.style.display = 'block';
            pauseBtn.style.display = 'none';
            stopBtn.style.display = 'none';
            progressBar.style.width = '0%';
            currentUtterance = null;
            utterance = null;
        };

        utterance.onpause = () => {
            pauseBtn.style.display = 'none';
            playBtn.style.display = 'block';
            clearInterval(progressInterval);
        };

        utterance.onresume = () => {
            playBtn.style.display = 'none';
            pauseBtn.style.display = 'block';
            progressInterval = setInterval(() => {
                if (utterance && speechSynthesis.speaking) {
                    const progress = (Date.now() % 2000) / 2000 * 100;
                    progressBar.style.width = `${progress}%`;
                }
            }, 100);
        };

        speechSynthesis.speak(utterance);
    };

    // Event listeners for controls
    playBtn.addEventListener('click', () => {
        if (speechSynthesis.paused && utterance) {
            speechSynthesis.resume();
        } else {
            speakText();
        }
    });

    pauseBtn.addEventListener('click', () => {
        if (speechSynthesis.speaking && !speechSynthesis.paused) {
            speechSynthesis.pause();
        }
    });

    stopBtn.addEventListener('click', () => {
        speechSynthesis.cancel();
        clearInterval(progressInterval);
        messageElement.classList.remove('playing-audio');
        playBtn.style.display = 'block';
        pauseBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        progressBar.style.width = '0%';
        currentUtterance = null;
        utterance = null;
    });

    if (speedSelect) {
        speedSelect.addEventListener('change', () => {
            if (speechSynthesis.speaking && utterance) {
                const wasPaused = speechSynthesis.paused;
                speechSynthesis.cancel();
                if (!wasPaused) {
                    setTimeout(speakText, 100);
                }
            }
        });
    }

    if (voiceSelect) {
        voiceSelect.addEventListener('change', () => {
            if (speechSynthesis.speaking && utterance) {
                const wasPaused = speechSynthesis.paused;
                speechSynthesis.cancel();
                if (!wasPaused) {
                    setTimeout(speakText, 100);
                }
            }
        });
        
        // Set default voice to preferred voice
        const preferredVoice = getPreferredVoice();
        if (preferredVoice) {
            voiceSelect.value = preferredVoice.name;
        }
    }

    // Toggle advanced controls
    settingsBtn.addEventListener('click', () => {
        const isVisible = advancedControls.style.display !== 'none';
        advancedControls.style.display = isVisible ? 'none' : 'flex';
        settingsBtn.classList.toggle('active', !isVisible);
    });

    return controlsDiv;
};

// Stop any ongoing speech
const stopAllSpeech = () => {
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    // Remove playing audio class from all messages
    document.querySelectorAll('.playing-audio').forEach(el => {
        el.classList.remove('playing-audio');
    });
};

// Create message element with dynamic classes and return it
const createMessageElement = (content, ...classes) => {
    const div = document.createElement("div");
    div.classList.add("message", ...classes);
    div.innerHTML = content;
    return div;
}

// Generate bot response using API
const generateBotResponse = async (incomingMessageDiv) => {
    const messageElement = incomingMessageDiv.querySelector(".message-text");

    // Add user message to chat history
    chatHistory.push({
        role: "user",
        parts: [{ text: userData.message }, ...(userData.file.data ? [{ inline_data: userData.file }] : [])]
    });

    // API request Options
    const requestOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: chatHistory
        })
    }

    try {
        // Fetch Bot Response from API
        const response = await fetch(API_URL, requestOptions);
        const data = await response.json();
        if(!response.ok) throw new Error(data.error.message);

        // Extract and display bot's response text
        const apiResponseText = data.candidates[0].content.parts[0].text.replace(/\*\*(.*?)\*\*/g, "$1").trim();
        
        // Create proper message content with preserved formatting
        messageElement.innerHTML = '';
        const textContent = document.createElement('div');
        textContent.className = 'message-text-content';
        textContent.textContent = apiResponseText;
        messageElement.appendChild(textContent);

        // Add TTS controls if speech is enabled
        if (isSpeechEnabled && apiResponseText) {
            const ttsControls = createTTSControls(apiResponseText, incomingMessageDiv);
            incomingMessageDiv.appendChild(ttsControls);
        }

        // Add bot response to chat history
        chatHistory.push({
            role: "model",
            parts: [{ text: apiResponseText }]
        });
    } catch (error){
        // Handle error in API Response
        console.log(error);
        messageElement.innerHTML = '<div class="message-text-content" style="color: #ff0000;">Sorry, I encountered an error. Please try again.</div>';
    } finally {
        // Reset User's file data, removing thinking indicator and scroll chat to bottom
        userData.file = {};
        incomingMessageDiv.classList.remove("thinking");
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
    }
}

// Setup speech recognition for voice input
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

    // Create error message element
    const errorElement = document.createElement("div");
    errorElement.classList.add("speech-recognition-error");
    speechToTextButton.parentNode.insertBefore(errorElement, speechToTextButton);

    // Handle speech recognition events
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
                errorMessage = "No speech detected";
                break;
            case 'audio-capture':
                errorMessage = "No microphone found";
                break;
            case 'not-allowed':
                errorMessage = "Microphone access denied";
                break;
            default:
                errorMessage = `Recognition error: ${event.error}`;
        }
        
        errorElement.textContent = errorMessage;
        errorElement.classList.add("show");
        setTimeout(() => errorElement.classList.remove("show"), 3000);
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        messageInput.value += transcript;
        messageInput.dispatchEvent(new Event("input"));
        messageInput.focus();
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

// Handle outgoing user messages 
const handleOutgoingMessage = (e) => {
    e.preventDefault();
    userData.message = messageInput.value.trim();
    if (!userData.message && !userData.file.data) return;
    
    messageInput.value = "";
    fileUploadWrapper.classList.remove("file-uploaded");
    messageInput.dispatchEvent(new Event("input"));

    // Stop any ongoing speech when sending new message
    stopAllSpeech();

    // Create and display user message 
    const messageContent = `<div class="message-text"></div>
    ${userData.file.data ? `<img src="data:${userData.file.mime_type};base64,${userData.file.data}" class="attachment" />` : ""}`;

    const OutgoingMessageDiv = createMessageElement(messageContent, "user-message");
    OutgoingMessageDiv.querySelector(".message-text").textContent = userData.message;
    chatBody.appendChild(OutgoingMessageDiv);
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

    // Simulate bot response with thinking indicator after a delay
    setTimeout(() => {
        const messageContent = `<svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024"><path
                 d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z"></path></svg>
                <div class="message-text">
                    <div class="thinking-indicator">
                        <div class="dot"></div>
                        <div class="dot"></div>
                        <div class="dot"></div>
                    </div>
                </div>`;

        const incomingMessageDiv = createMessageElement(messageContent, "bot-message", "thinking");
        chatBody.appendChild(incomingMessageDiv);
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
        generateBotResponse(incomingMessageDiv);
    }, 600);
}

// Event Listeners

// Handle Enter key press for sending messages
messageInput.addEventListener("keydown", (e) => {
    const userMessage = e.target.value.trim();
    if(e.key === "Enter" && userMessage && !e.shiftKey && window.innerWidth > 768) {
        handleOutgoingMessage(e);
    }
});

// Adjust input field height dynamically  
messageInput.addEventListener("input", () => {
    messageInput.style.height = `${initialInputHeight}px`;
    messageInput.style.height = `${messageInput.scrollHeight}px`;
    document.querySelector(".chat-form").style.borderRadius = messageInput.scrollHeight > initialInputHeight ? "15px" : "32px";
});

// Handle file input change and preview the selected file 
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if(!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file only.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        fileUploadWrapper.querySelector("img").src = e.target.result;
        fileUploadWrapper.classList.add("file-uploaded");
        const base64String = e.target.result.split(",")[1];

        // Store file data in userdata
        userData.file = {
            data: base64String,
            mime_type: file.type
        }

        fileInput.value = "";
    }

    reader.readAsDataURL(file);
});

// Cancel file upload 
fileCancelButton.addEventListener("click", () => {
    userData.file = {};
    fileUploadWrapper.classList.remove("file-uploaded");
});

// Initialize Emoji Picker and handle emoji selection
const picker = new EmojiMart.Picker({
    theme: "light",
    skinTonePosition: "none",
    previewPosition: "none",
    onEmojiSelect: (emoji) => {
        const { selectionStart: start, selectionEnd: end } = messageInput;
        messageInput.setRangeText(emoji.native, start, end, "end");
        messageInput.focus();
    },
    onClickOutside: (e) => {
        if(e.target.id === "emoji-picker"){
            document.body.classList.toggle("show-emoji-picker");
        } else {
            document.body.classList.remove("show-emoji-picker");
        }
    }
});

document.querySelector(".chat-form").appendChild(picker);

// Main event listeners
sendMessageButton.addEventListener("click", (e) => handleOutgoingMessage(e));
document.querySelector("#file-upload").addEventListener("click", () => fileInput.click());
chatbotToggler.addEventListener("click", () => document.body.classList.toggle("show-chatbot"));
closeChatbot.addEventListener("click", () => {
    document.body.classList.remove("show-chatbot");
    stopAllSpeech(); // Stop speech when closing chatbot
});

// Add global click handler to close emoji picker when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('em-emoji-picker') && !e.target.closest('#emoji-picker')) {
        document.body.classList.remove('show-emoji-picker');
    }
});

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeVoices();
    setupSpeechRecognition();
    
    // Add a small delay to ensure voices are loaded
    setTimeout(() => {
        if (availableVoices.length === 0) {
            initializeVoices();
        }
    }, 1000);
});

// Handle page visibility change to stop speech when tab is not active
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopAllSpeech();
    }
});