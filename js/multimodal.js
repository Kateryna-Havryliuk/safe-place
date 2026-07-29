class MultimodalManager {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        //this.videoRecorder = null;
        //this.videoChunks = [];
        //this.videoStream = null;
        this.isRecording = false;
        //this.isVideoRecording = false;
        this.currentMode = this.getModeFromUrl() || 'text';
        this.animationFrame = null;
        this.isFullscreen = false;
        this.lastFrameTime = 0;
        this.frameInterval = 1000;
        this.currentFacingMode = 'user';
        this.screenStream = null;
        this.screenShareInterval = null;
        this.showingEmotionStats = false;
        //this.videoAnalysisHistory = [];
        this.lastEmotionData = null;
        this.currentChatId = null;
        this.recordingStartTime = null;
        this.recordingTimer = null;
        
        this.init();
        
        // Синхронізація з chat.js
        this.syncChatId = () => {
            if (window.getCurrentChatId) {
                this.currentChatId = window.getCurrentChatId();
                if (this.currentChatId) {
                    console.log('🔄 Multimodal синхронізовано chatId:', this.currentChatId);
                }
            }
        };
        
        // Періодична синхронізація
        setInterval(() => this.syncChatId(), 1000);
        
        // Синхронізуємо при зміні чату
        window.addEventListener('chatChanged', (e) => {
            this.currentChatId = e.detail?.chatId || window.getCurrentChatId();
            console.log('📢 Отримано подію зміни чату:', this.currentChatId);
        });
        
        // Відкладена синхронізація
        setTimeout(() => this.syncChatId(), 500);
    }
    
    getModeFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('mode');
    }
    
    initModeFromUrl() {
        if (this.currentMode && this.currentMode !== 'text') {
            setTimeout(() => {
                if (this.currentMode === 'voice') {
                    document.getElementById('voiceInputBtn')?.click();
                } else if (this.currentMode === 'video' || this.currentMode === 'multimodal') {
                    document.getElementById('videoInputBtn')?.click();
                }
            }, 1000);
        }
    }
    
    init() {
        this.initEventListeners();
        this.initModeFromUrl();
        document.addEventListener('keydown', (e) => this.handleEscapeKey(e));
    }
    
    initEventListeners() {
        // Голосовий ввід
        document.getElementById('voiceInputBtn')?.addEventListener('click', () => this.toggleVoiceRecording());
        document.getElementById('stopRecordingBtn')?.addEventListener('click', () => this.stopVoiceRecording());
        
       /* // Відео
        document.getElementById('fullscreenVideoBtn')?.addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('videoInputBtn')?.addEventListener('click', () => this.toggleVideo());
        document.getElementById('closeVideoBtn')?.addEventListener('click', () => this.closeVideo());
        document.getElementById('capturePhotoBtn')?.addEventListener('click', () => this.capturePhoto());
        document.getElementById('toggleCameraBtn')?.addEventListener('click', () => this.toggleCamera());
        document.getElementById('toggleVideoBtn')?.addEventListener('click', () => this.toggleVideoRecording());
        */

        // Перемикання режимів
        document.querySelectorAll('.multimodal-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchMode(e));
        });

        // Нові кнопки
        document.getElementById('screenShareBtn')?.addEventListener('click', () => this.toggleScreenShare());
        document.getElementById('emotionAnalysisBtn')?.addEventListener('click', () => this.toggleEmotionAnalysis());
        document.getElementById('saveChatBtn')?.addEventListener('click', () => this.saveChat());
        document.getElementById('shareChatBtn')?.addEventListener('click', () => this.shareChat());
    }
    
    // ===== ГОЛОСОВІ ФУНКЦІЇ =====
    async toggleVoiceRecording() {
        if (this.isRecording) {
            this.stopVoiceRecording();
        } else {
            await this.startVoiceRecording();
        }
    }
    
    async startVoiceRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // ВАЖЛИВО: використовуємо формат, який Whisper розуміє
            const mimeType = MediaRecorder.isTypeSupported('audio/mp4') 
                ? 'audio/mp4' 
                : 'audio/webm';
            
            this.mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
            this.audioChunks = [];
            this.recordingStartTime = Date.now();
            
            this.mediaRecorder.ondataavailable = event => {
                if (event.data && event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.sendVoiceMessage();
                stream.getTracks().forEach(track => track.stop());
            };
            
            this.mediaRecorder.start(100);
            this.isRecording = true;
            this.startRecordingTimer();
            
            document.getElementById('voiceRecordingIndicator').style.display = 'flex';
            document.getElementById('voiceInputBtn').classList.add('recording');
            
        } catch (error) {
            console.error('Помилка доступу до мікрофону:', error);
            alert('Будь ласка, дозвольте доступ до мікрофону');
        }
    }
    
    startRecordingTimer() {
        const timerElement = document.getElementById('recordingTime');
        if (!timerElement) return;
        
        this.recordingTimer = setInterval(() => {
            if (!this.recordingStartTime) return;
            const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
            const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const secs = (elapsed % 60).toString().padStart(2, '0');
            timerElement.textContent = `${mins}:${secs}`;
            
            // Автоматична зупинка через 5 хвилин
            if (elapsed >= 300) {
                this.stopVoiceRecording();
            }
        }, 1000);
    }
    
    stopVoiceRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            if (this.recordingTimer) {
                clearInterval(this.recordingTimer);
                this.recordingTimer = null;
            }
            
            document.getElementById('voiceRecordingIndicator').style.display = 'none';
            document.getElementById('voiceInputBtn').classList.remove('recording');
        }
    }
    
    async sendVoiceMessage() {
        console.log('🎤 Відправка голосового повідомлення');
        
        if (!this.audioChunks || this.audioChunks.length === 0) {
            console.error('❌ Немає аудіо даних');
            return;
        }
        
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        this.showLoading('Аналізую голос...');
        
        const formData = new FormData();
        formData.append('audio', audioBlob, `voice-${Date.now()}.webm`);
        
        try {
            const token = localStorage.getItem('authToken');
            
            const response = await fetch('/api/analyze-voice', {
                method: 'POST',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: formData
            });
            
            const data = await response.json();
            console.log('📊 Аналіз голосу:', data);
            
            if (response.ok && data.success) {
                const messageId = this.addVoiceMessageToChat(data);
                
                if (token && this.currentChatId) {
                    await this.saveVoiceToDatabase(data, messageId);
                }
                
                await this.getAIResponse(data.transcription || '', data);
            } else {
                console.error('❌ Помилка:', data);
                this.showNotification('Помилка аналізу голосу: ' + (data.error || 'невідома помилка'), 'error');
            }
            
        } catch (error) {
            console.error('❌ Помилка відправки голосу:', error);
            this.showNotification('Помилка при обробці голосу', 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    addVoiceMessageToChat(data) {
        const messageId = 'msg-' + Date.now();
        
        const userMessage = {
            id: messageId,
            role: 'user',
            type: 'voice',
            content: data.transcription || '[Голосове повідомлення]',
            transcription: data.transcription,
            emotions: data.voice_emotions || {},
            is_critical: data.crisis_indicators?.length > 0,
            timestamp: new Date().toISOString(),
            duration: this.recordingStartTime ? Math.floor((Date.now() - this.recordingStartTime) / 1000) : 0
        };
        
        // Використовуємо глобальну функцію з chat.js
        if (window.addMessageToChat) {
            window.addMessageToChat(userMessage);
            console.log('✅ Голосове повідомлення додано через глобальну функцію');
        } else {
            // Fallback - додаємо напряму
            console.warn('⚠️ window.addMessageToChat не знайдено, додаємо напряму');
            this.addMessageDirectly(userMessage);
        }
        
        return messageId;
    }
    
    addMessageDirectly(message) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;
        
        const messageDiv = this.createMessageElement(message);
        const typingIndicator = document.getElementById('typingIndicator');
        
        if (typingIndicator) {
            messagesContainer.insertBefore(messageDiv, typingIndicator);
        } else {
            messagesContainer.appendChild(messageDiv);
        }
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    createMessageElement(msg) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.role === 'user' ? 'user' : 'bot'}`;
        messageDiv.id = msg.id;
        messageDiv.dataset.type = msg.type || 'text';
        
        const time = msg.timestamp 
            ? new Date(msg.timestamp).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
            : new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
        
        let contentHtml = '';
        
        switch(msg.type) {
            case 'voice':
                contentHtml = this.renderVoiceMessageContent(msg);
                break;
            case 'video':
                contentHtml = this.renderVideoMessageContent(msg);
                break;
            case 'photo':
                contentHtml = this.renderPhotoMessageContent(msg);
                break;
            default:
                contentHtml = `<div class="message-text">${this.formatMessageText(msg.content)}</div>`;
        }
        
        if (msg.role === 'bot' || msg.role === 'assistant') {
            messageDiv.innerHTML = `
                <div class="avatar">S</div>
                <div class="message-content">
                    ${contentHtml}
                    <div class="message-footer">
                        <span class="message-time">${time}</span>
                    </div>
                </div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="message-content">
                    ${contentHtml}
                    <div class="message-footer">
                        <span class="message-time">${time}</span>
                    </div>
                </div>
                <div class="avatar">В</div>
            `;
        }
        
        return messageDiv;
    }
    
    renderVoiceMessageContent(msg) {
        const emotions = msg.emotions || {};
        const dominant = Object.entries(emotions).sort((a, b) => b[1] - a[1])[0] || ['neutral', 0];
        
        return `
            <div class="voice-message-content">
                <div class="voice-header">
                    <i class="fas fa-microphone"></i>
                    <span>Голосове повідомлення</span>
                    ${msg.duration ? `<span class="duration">${this.formatDuration(msg.duration)}</span>` : ''}
                </div>
                ${msg.transcription ? `
                    <div class="voice-transcription">
                        <i class="fas fa-quote-left"></i>
                        ${this.escapeHtml(msg.transcription)}
                    </div>
                ` : ''}
                <div class="voice-meta">
                    <span class="emotion-tag" style="background: ${this.getEmotionColor(dominant[0])}">
                        ${dominant[0]}: ${Math.round(dominant[1] * 100)}%
                    </span>
                    ${msg.is_critical ? '<span class="crisis-tag"><i class="fas fa-exclamation-triangle"></i> Криза</span>' : ''}
                </div>
            </div>
        `;
    }
    
    /*renderVideoMessageContent(msg) {
        return `
            <div class="video-message-content">
                <div class="video-header">
                    <i class="fas fa-video"></i>
                    <span>Відео повідомлення</span>
                    ${msg.duration ? `<span class="duration">${this.formatDuration(msg.duration)}</span>` : ''}
                </div>
                ${msg.video_url ? `
                    <video controls class="chat-video" preload="metadata">
                        <source src="${msg.video_url}" type="video/webm">
                    </video>
                ` : ''}
            </div>
        `;
    }
    */

    renderPhotoMessageContent(msg) {
        return `
            <div class="photo-message-content">
                <div class="photo-header">
                    <i class="fas fa-camera"></i>
                    <span>Фото</span>
                </div>
                ${msg.photo_url ? `
                    <img src="${msg.photo_url}" class="chat-photo" onclick="window.open('${msg.photo_url}', '_blank')">
                ` : ''}
            </div>
        `;
    }
    
    async saveVoiceToDatabase(data, messageId) {
        try {
            const token = localStorage.getItem('authToken');
            let chatId = this.currentChatId || window.getCurrentChatId();
            
            if (!chatId) {
                console.warn('⚠️ Немає chatId для збереження голосу, створюємо новий чат');
                
                const createResult = await fetch('/api/chat/new', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token ? `Bearer ${token}` : ''
                    }
                });
                
                const newChat = await createResult.json();
                if (newChat.success && newChat.chat_id) {
                    chatId = newChat.chat_id;
                    if (window.setCurrentChatId) {
                        window.setCurrentChatId(chatId);
                    }
                    this.currentChatId = chatId;
                    console.log('✅ Створено новий чат для голосу:', chatId);
                } else {
                    console.error('❌ Не вдалося створити чат');
                    return;
                }
            }
            
            const response = await fetch('/api/save-voice-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                    transcription: data.transcription,
                    voice_emotions: data.voice_emotions,
                    fused_emotions: data.fused_emotions,
                    is_crisis: data.crisis_indicators?.length > 0,
                    crisis_level: data.crisis_level,
                    timestamp: new Date().toISOString()
                })
            });
            
            const result = await response.json();
            console.log('💾 Голос збережено:', result);
            
        } catch (error) {
            console.error('❌ Помилка збереження голосу:', error);
        }
    }
    
    async getAIResponse(text, voiceData = null) {
        try {
            const token = localStorage.getItem('authToken');
            
            const requestBody = {
                message: text,
                chat_id: this.currentChatId,
                context: {
                    has_voice: !!voiceData,
                    emotions: voiceData?.voice_emotions || null,
                    crisis_detected: voiceData?.crisis_indicators?.length > 0 || false
                }
            };
            
            const response = await fetch('/api/talk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            
            if (data.answer) {
                if (data.chat_id && !this.currentChatId) {
                    if (window.setCurrentChatId) {
                        window.setCurrentChatId(data.chat_id);
                    }
                    this.currentChatId = data.chat_id;
                }
                
                const aiMessage = {
                    id: `msg-${Date.now()}`,
                    role: 'assistant',
                    type: 'text',
                    content: data.answer,
                    timestamp: new Date().toISOString()
                };
                
                if (window.addMessageToChat) {
                    window.addMessageToChat(aiMessage);
                } else {
                    this.addMessageDirectly(aiMessage);
                }
            }
            
        } catch (error) {
            console.error('❌ Помилка отримання AI відповіді:', error);
        }
    }
    
  /*  // ===== ВІДЕО ФУНКЦІЇ =====
    
    async toggleVideo() {
        const videoPanel = document.getElementById('videoPanel');
        const isCurrentlyVisible = videoPanel.style.display === 'block';
        
        if (isCurrentlyVisible) {
            this.closeVideo();
        } else {
            videoPanel.style.display = 'block';
            await this.startVideo();
        }
    }
    
    async startVideo() {
        console.log('🚀 startVideo: починаємо ініціалізацію камери');
        
        const statusDiv = document.getElementById('cameraStatus');
        const videoContainer = document.getElementById('videoContainer');
        const videoElement = document.getElementById('localVideo');
        
        if (!videoElement) {
            console.error('❌ Елемент localVideo не знайдено');
            return;
        }
        
        if (statusDiv) {
            statusDiv.innerHTML = `
                <div style="text-align: center;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #3498db; margin-bottom: 15px; display: block;"></i>
                    <p style="margin: 0 0 10px 0; font-size: 16px; color: white;">Запит доступу до камери...</p>
                </div>
            `;
            statusDiv.style.display = 'flex';
        }
        
        try {
            this.videoStream = await navigator.mediaDevices.getUserMedia({ 
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: this.currentFacingMode
                },
                audio: true
            });
            
            console.log('✅ Доступ до камери отримано');
            
            videoElement.srcObject = this.videoStream;
            videoContainer?.classList.add('active');
            
            await videoElement.play();
            console.log('▶️ Відео відтворюється');
            
            if (statusDiv) statusDiv.style.display = 'none';
            
            this.startFrameAnalysis();
            this.startVideoRecording();
            
        } catch (error) {
            console.error('❌ Помилка камери:', error);
            this.showCameraError(error, statusDiv);
        }
    }
    
    startVideoRecording() {
        if (!this.videoStream) return;
        
        console.log('🎬 Починаємо запис відео для чату');
        
        this.videoChunks = [];
        
        const options = {
            mimeType: 'video/webm;codecs=vp9,opus',
            videoBitsPerSecond: 2500000
        };
        
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm;codecs=vp8,opus';
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'video/webm';
            }
        }
        
        try {
            this.videoRecorder = new MediaRecorder(this.videoStream, options);
        } catch (e) {
            console.warn('Не вдалося створити MediaRecorder з обраним кодеком, пробуємо без опцій');
            this.videoRecorder = new MediaRecorder(this.videoStream);
        }
        
        this.videoRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                this.videoChunks.push(event.data);
            }
        };
        
        this.videoRecorder.onstop = () => {
            console.log('🛑 Запис відео зупинено, чанків:', this.videoChunks.length);
            this.saveVideoToChat();
        };
        
        this.videoRecorder.start(1000);
        this.isVideoRecording = true;
        
        const toggleBtn = document.getElementById('toggleVideoBtn');
        if (toggleBtn) {
            toggleBtn.innerHTML = '<i class="fas fa-stop"></i>';
            toggleBtn.title = 'Зупинити запис';
            toggleBtn.classList.add('recording');
        }
        
        this.showVideoRecordingIndicator();
    }
    
    stopVideoRecording() {
        if (this.videoRecorder && this.videoRecorder.state !== 'inactive') {
            this.videoRecorder.stop();
        }
        this.isVideoRecording = false;
        
        const toggleBtn = document.getElementById('toggleVideoBtn');
        if (toggleBtn) {
            toggleBtn.innerHTML = '<i class="fas fa-play"></i>';
            toggleBtn.title = 'Почати запис';
            toggleBtn.classList.remove('recording');
        }
        
        this.hideVideoRecordingIndicator();
    }
    
    toggleVideoRecording() {
        if (this.isVideoRecording) {
            this.stopVideoRecording();
        } else {
            this.startVideoRecording();
        }
    }
    
    showVideoRecordingIndicator() {
        let indicator = document.getElementById('videoRecordingIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'videoRecordingIndicator';
            indicator.className = 'video-recording-indicator';
            indicator.innerHTML = `
                <div class="recording-dot"></div>
                <span>Запис відео</span>
                <span class="recording-time" id="videoRecordingTime">00:00</span>
            `;
            indicator.style.cssText = `
                position: absolute;
                top: 10px;
                left: 10px;
                background: rgba(231, 76, 60, 0.9);
                color: white;
                padding: 8px 15px;
                border-radius: 20px;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 13px;
                z-index: 100;
                animation: pulse 2s infinite;
            `;
            
            const videoContainer = document.getElementById('videoContainer');
            if (videoContainer) {
                videoContainer.style.position = 'relative';
                videoContainer.appendChild(indicator);
            }
        }
        
        this.recordingStartTime = Date.now();
        this.recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
            const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const secs = (elapsed % 60).toString().padStart(2, '0');
            const timeEl = document.getElementById('videoRecordingTime');
            if (timeEl) timeEl.textContent = `${mins}:${secs}`;
        }, 1000);
    }
    
    hideVideoRecordingIndicator() {
        const indicator = document.getElementById('videoRecordingIndicator');
        if (indicator) indicator.remove();
        
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
    }
    
    async saveVideoToChat() {
        if (this.videoChunks.length === 0) {
            console.warn('⚠️ Немає даних відео для збереження');
            return;
        }
        
        console.log('💾 Збереження відео в чат, чанків:', this.videoChunks.length);
        
        const videoBlob = new Blob(this.videoChunks, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(videoBlob);
        const messageId = 'video-' + Date.now();
        
        const emotionData = this.lastEmotionData || {
            happy: 0.2, sad: 0.2, angry: 0.1, fear: 0.1, stress: 0.2, neutral: 0.2
        };
        
        const videoMessage = {
            id: messageId,
            role: 'user',
            type: 'video',
            content: '[Відео повідомлення]',
            video_url: videoUrl,
            emotions: emotionData,
            duration: this.recordingStartTime ? Math.floor((Date.now() - this.recordingStartTime) / 1000) : 0,
            timestamp: new Date().toISOString()
        };
        
        // Додаємо повідомлення в чат
        if (window.addMessageToChat) {
            const success = window.addMessageToChat(videoMessage);
            if (success) {
                console.log('✅ Відео додано в чат');
                
                // Отримуємо AI відповідь на відео
                await this.getAIResponse('[Відео повідомлення]', { emotions: emotionData });
            }
        } else {
            console.error('❌ window.addMessageToChat не знайдено');
            this.addMessageDirectly(videoMessage);
        }
        
        this.videoChunks = [];
    }
    */
    
    // ===== АНАЛІЗ КАДРІВ =====
    
    startFrameAnalysis() {
        const video = document.getElementById('localVideo');
        
        if (!video) {
            console.error('Відео елемент не знайдено для аналізу');
            return;
        }
        
        console.log('🎬 Починаємо аналіз кадрів');
        
        this.videoAnalysisHistory = [];
        
        const analyzeFrame = async (timestamp) => {
            if (!this.videoStream) return;
            
            if (timestamp - this.lastFrameTime > this.frameInterval) {
                this.lastFrameTime = timestamp;
                
                if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = 320;
                        canvas.height = 240;
                        const ctx = canvas.getContext('2d');
                        
                        ctx.translate(canvas.width, 0);
                        ctx.scale(-1, 1);
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        
                        const blob = await new Promise(resolve => 
                            canvas.toBlob(resolve, 'image/jpeg', 0.8)
                        );
                        
                        if (blob) {
                            await this.analyzeVideoFrame(blob);
                        }
                    } catch (e) {
                        console.error('Помилка захоплення кадру:', e);
                    }
                }
            }
            
            this.animationFrame = requestAnimationFrame(analyzeFrame);
        };
        
        this.animationFrame = requestAnimationFrame(analyzeFrame);
    }
    
    async analyzeVideoFrame(frameBlob) {
        try {
            const reader = new FileReader();
            
            reader.onloadend = async () => {
                const base64Frame = reader.result;
                
                try {
                    const token = localStorage.getItem('authToken');
                    
                    // Перевірте чи є токен
                    if (!token) {
                        console.warn('⚠️ Немає токена для відео-аналізу');
                        return;
                    }
                    
                    const response = await fetch('/api/analyze-multimodal', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            video: base64Frame,
                            text: "[Відео-аналіз]"
                        })
                    });
                    
                    if (!response.ok) {
                        console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
                        return;
                    }
                    
                    const data = await response.json();
                    console.log('🎭 Отримано аналіз відео:', data);
                    
                    // ВАЖЛИВО: Оновлюємо UI з отриманими емоціями
                    if (data.success && data.results && data.results.video) {
                        const emotions = data.results.video.emotions;
                        if (emotions) {
                            console.log('📊 Оновлюємо емоції:', emotions);
                            this.updateEmotionStats(emotions);
                            this.lastEmotionData = emotions;
                        }
                    } else if (data.success && data.results && data.results.fused) {
                        // Альтернативний шлях - з fused результатів
                        const emotions = data.results.fused;
                        if (emotions && typeof emotions === 'object') {
                            console.log('📊 Оновлюємо емоції (fused):', emotions);
                            this.updateEmotionStats(emotions);
                            this.lastEmotionData = emotions;
                        }
                    }
                    
                } catch (error) {
                    console.error('❌ Помилка fetch:', error);
                }
            };
            
            reader.readAsDataURL(frameBlob);
            
        } catch (error) {
            console.error('❌ Помилка analyzeVideoFrame:', error);
        }
    }
    
    updateEmotionStats(emotions) {
        if (!emotions || typeof emotions !== 'object') return;
        
        console.log('🔄 updateEmotionStats отримано:', emotions);
        
        // Мапінг назв емоцій (різні формати від сервера)
        const emotionMap = {
            happy: emotions.happiness || emotions.happy || emotions.joy || 0,
            sad: emotions.sadness || emotions.sad || emotions.sorrow || 0,
            angry: emotions.anger || emotions.angry || emotions.rage || 0,
            fear: emotions.fear || emotions.scared || emotions.afraid || 0,
            stress: emotions.stress || emotions.anxiety || emotions.anxious || 0,
            neutral: emotions.neutral || 0
        };
        
        console.log('📊 Мапінг емоцій:', emotionMap);
        
        // Оновлюємо UI
        this.updateEmotionBarUI('happyValue', emotionMap.happy, 0);
        this.updateEmotionBarUI('sadValue', emotionMap.sad, 1);
        this.updateEmotionBarUI('angryValue', emotionMap.angry, 2);
        this.updateEmotionBarUI('fearValue', emotionMap.fear, 3);
        this.updateEmotionBarUI('stressValue', emotionMap.stress, 4);
        
        this.lastEmotionData = emotionMap;
        this.updateEmotionSummary(emotionMap);
    }
    
    updateEmotionBarUI(elementId, value, barIndex) {
        const percent = Math.min(100, Math.max(0, Math.round((value || 0) * 100)));
        
        const valueElement = document.getElementById(elementId);
        if (valueElement) {
            valueElement.textContent = `${percent}%`;
            // Змінюємо колір тексту залежно від відсотка
            if (percent > 70) {
                valueElement.style.color = '#e74c3c';
            } else if (percent > 40) {
                valueElement.style.color = '#f39c12';
            } else {
                valueElement.style.color = '#2ecc71';
            }
        }
        
        // Оновлюємо прогрес-бар
        const bars = document.querySelectorAll('.emotion-bar .progress-fill');
        if (bars[barIndex]) {
            bars[barIndex].style.width = `${percent}%`;
            bars[barIndex].style.transition = 'width 0.3s ease';
            
            // Змінюємо колір прогрес-бару
            if (percent > 70) {
                bars[barIndex].style.background = '#e74c3c';
            } else if (percent > 40) {
                bars[barIndex].style.background = '#f39c12';
            } else {
                bars[barIndex].style.background = '#2ecc71';
            }
        }
    }
    
    updateEmotionSummary(emotionMap) {
        const summaryDiv = document.getElementById('emotionSummary');
        if (!summaryDiv) return;
        
        const dominant = Object.entries(emotionMap)
            .filter(([key]) => key !== 'neutral')
            .sort((a, b) => b[1] - a[1])[0];
        
        const dominantEmotion = dominant?.[0] || 'neutral';
        const dominantValue = dominant?.[1] || 0;
        
        let overallMood = 'нейтральний';
        let moodColor = '#95a5a6';
        let moodIcon = '😐';
        
        const positive = emotionMap.happy;
        const negative = emotionMap.sad + emotionMap.angry + emotionMap.fear + emotionMap.stress;
        
        if (positive > 0.4 && positive > negative) {
            overallMood = 'позитивний';
            moodColor = '#2ecc71';
            moodIcon = '😊';
        } else if (negative > 0.4) {
            if (emotionMap.stress > 0.3 || emotionMap.fear > 0.3) {
                overallMood = 'тривожний';
                moodColor = '#e67e22';
                moodIcon = '😰';
            } else if (emotionMap.sad > 0.3) {
                overallMood = 'пригнічений';
                moodColor = '#3498db';
                moodIcon = '😔';
            } else if (emotionMap.angry > 0.3) {
                overallMood = 'напружений';
                moodColor = '#e74c3c';
                moodIcon = '😠';
            }
        }
        
        let description = '';
        if (dominantValue > 0.3) {
            description = `Домінує ${this.translateEmotion(dominantEmotion)} (${Math.round(dominantValue * 100)}%)`;
        }
        
        let warning = '';
        if (emotionMap.stress > 0.4) {
            warning = '<div class="stress-warning" style="color: #e67e22; margin-top: 8px;"><i class="fas fa-exclamation-circle"></i> Високий рівень тривоги/стресу</div>';
        }
        
        summaryDiv.innerHTML = `
            <div class="overall-mood" style="color: ${moodColor}; font-size: 18px; margin-bottom: 8px;">
                ${moodIcon} ${overallMood}
            </div>
            <div class="mood-description" style="color: #666; font-size: 14px;">
                ${description}
            </div>
            ${warning}
        `;
    }
    
    // ===== ДОПОМІЖНІ ФУНКЦІЇ =====
    
    translateEmotion(emotion) {
        const translations = {
            happy: 'Радість',
            sad: 'Сум',
            angry: 'Гнів',
            fear: 'Страх',
            stress: 'Стрес/Тривога',
            neutral: 'Нейтрально'
        };
        return translations[emotion] || emotion;
    }
    
    getEmotionColor(emotion) {
        const colors = {
            anger: '#e74c3c',
            angry: '#e74c3c',
            sadness: '#3498db',
            sad: '#3498db',
            fear: '#9b59b6',
            happiness: '#f1c40f',
            happy: '#f1c40f',
            anxiety: '#e67e22',
            stress: '#e67e22',
            neutral: '#95a5a6'
        };
        return colors[emotion] || '#95a5a6';
    }
    
    formatDuration(seconds) {
        if (!seconds || seconds < 1) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        if (mins > 0) {
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
        return `0:${secs.toString().padStart(2, '0')}`;
    }
    
    formatMessageText(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>')
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    showLoading(message) {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.style.display = 'flex';
            const textSpan = indicator.querySelector('.typing-text');
            if (textSpan) {
                textSpan.textContent = message;
            } else {
                indicator.innerHTML = `
                    <span></span><span></span><span></span>
                    <span class="typing-text">${message}</span>
                `;
            }
        }
    }
    
    hideLoading() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `chat-notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            <span>${message}</span>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${type === 'success' ? '#2ecc71' : type === 'error' ? '#e74c3c' : '#3498db'};
            color: white;
            border-radius: 12px;
            box-shadow: 0 5px 25px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 12px;
            z-index: 10000;
            transform: translateX(150%);
            transition: transform 0.3s ease;
            font-size: 14px;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => notification.style.transform = 'translateX(0)', 10);
        setTimeout(() => {
            notification.style.transform = 'translateX(150%)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    showCrisisBanner(level, indicators) {
        const banner = document.getElementById('emergencyBanner');
        if (banner) {
            banner.style.display = 'block';
            banner.innerHTML = `
                <i class="fas fa-exclamation-circle"></i>
                <strong>КРИТИЧНА СИТУАЦІЯ (рівень: ${level})</strong><br>
                ${indicators?.join('<br>') || 'Негайно зверніться за допомогою!'}
            `;
            
            setTimeout(() => {
                banner.style.display = 'none';
            }, 30000);
        }
    }
    
    showCameraError(error, statusDiv) {
        if (!statusDiv) return;
        
        let title = 'Помилка камери';
        let message = error.message || 'Невідома помилка';
        let icon = 'fa-exclamation-triangle';
        let color = '#e74c3c';
        
        if (error.message === 'NO_CAMERAS') {
            title = 'Камеру не знайдено';
            message = 'Перевірте підключення камери';
            icon = 'fa-video-slash';
        } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            title = 'Доступ заборонено';
            message = 'Дозвольте доступ до камери в налаштуваннях браузера';
            icon = 'fa-ban';
            color = '#f39c12';
        }
        
        statusDiv.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <i class="fas ${icon}" style="font-size: 48px; color: ${color}; margin-bottom: 15px;"></i>
                <h3 style="margin: 0 0 10px 0; color: white; font-size: 18px;">${title}</h3>
                <p style="margin: 0 0 20px 0; color: #aaa; font-size: 14px;">${message}</p>
                <button onclick="window.multimodalManager.retryVideo()" 
                        style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    <i class="fas fa-redo"></i> Спробувати знову
                </button>
            </div>
        `;
        statusDiv.style.display = 'flex';
    }
    
    async retryVideo() {
        this.closeVideo();
        await new Promise(r => setTimeout(r, 500));
        await this.toggleVideo();
    }
    
    closeVideo() {
        if (this.isVideoRecording) {
            this.stopVideoRecording();
        }
        
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
        }
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        
        const videoPanel = document.getElementById('videoPanel');
        const videoElement = document.getElementById('localVideo');
        const videoContainer = document.getElementById('videoContainer');
        
        if (videoPanel) videoPanel.style.display = 'none';
        if (videoElement) videoElement.srcObject = null;
        if (videoContainer) videoContainer.classList.remove('active');
        
        this.resetEmotionBars();
    }
    
    resetEmotionBars() {
        ['happyValue', 'sadValue', 'angryValue', 'fearValue', 'stressValue'].forEach((id, index) => {
            this.updateEmotionBarUI(id, 0, index);
        });
        
        const summary = document.getElementById('emotionSummary');
        if (summary) {
            summary.innerHTML = '<p>Очікування аналізу...</p>';
        }
    }
    
    toggleFullscreen() {
        const videoPanel = document.getElementById('videoPanel');
        const fullscreenBtn = document.getElementById('fullscreenVideoBtn');
        
        if (!this.isFullscreen) {
            videoPanel.classList.add('fullscreen');
            if (fullscreenBtn) {
                fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
                fullscreenBtn.title = 'Вийти з повноекранного режиму';
            }
            document.body.style.overflow = 'hidden';
            this.isFullscreen = true;
        } else {
            videoPanel.classList.remove('fullscreen');
            if (fullscreenBtn) {
                fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
                fullscreenBtn.title = 'На весь екран';
            }
            document.body.style.overflow = '';
            this.isFullscreen = false;
        }
    }
    
    handleEscapeKey(e) {
        if (e.key === 'Escape' && this.isFullscreen) {
            this.toggleFullscreen();
        }
    }
    
    async capturePhoto() {
        const video = document.getElementById('localVideo');
        if (!video || !video.videoWidth) {
            alert('Камера не активна');
            return;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0);
        
        this.showLoading('Аналізую фото...');
        
        canvas.toBlob(async (blob) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = async () => {
                const base64Photo = reader.result;
                
                try {
                    const token = localStorage.getItem('authToken');
                    const response = await fetch('/api/analyze-multimodal', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': token ? `Bearer ${token}` : ''
                        },
                        body: JSON.stringify({
                            video: base64Photo
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        const photoMessage = {
                            id: 'photo-' + Date.now(),
                            role: 'user',
                            type: 'photo',
                            content: '[Фото]',
                            photo_url: URL.createObjectURL(blob),
                            emotions: data.emotion_analysis?.fused || {},
                            timestamp: new Date().toISOString()
                        };
                        
                        if (window.addMessageToChat) {
                            window.addMessageToChat(photoMessage);
                        } else {
                            this.addMessageDirectly(photoMessage);
                        }
                        
                        if (data.emotion_analysis?.fused) {
                            this.updateEmotionStats(data.emotion_analysis.fused);
                        }
                    }
                    
                } catch (error) {
                    console.error('Помилка аналізу фото:', error);
                } finally {
                    this.hideLoading();
                }
            };
        }, 'image/jpeg');
    }
    
    async toggleCamera() {
        this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
        console.log('🔄 Перемикання камери на:', this.currentFacingMode);
        
        if (this.videoStream) {
            await this.retryVideo();
        }
    }
    
    async toggleEmotionAnalysis() {
        console.log('📊 Відкриваю аналіз емоцій для поточного чату');
        
        const btn = document.getElementById('emotionAnalysisBtn');
        
        if (this.emotionAnalysisPanel) {
            this.closeEmotionAnalysis();
            return;
        }
        
        // Перевіряємо чи є активний чат
        if (!this.currentChatId) {
            this.showDemoAnalysis('💬 Спочатку створіть або виберіть чат');
            return;
        }
        
        try {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            
            const token = localStorage.getItem('authToken');
            if (!token) {
                this.showDemoAnalysis('❌ Увійдіть в акаунт для перегляду аналітики');
                return;
            }
            
            // Отримуємо дані САМЕ ДЛЯ ПОТОЧНОГО ЧАТУ
            const response = await fetch(`/api/chat/${this.currentChatId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const data = await response.json();
            console.log('📊 Отримано дані чату:', data);
            
            if (data.success && data.chat) {
                this.showChatEmotionAnalysis(data.chat);
            } else {
                this.showDemoAnalysis('❌ Не вдалося отримати аналітику чату');
            }
            
        } catch (error) {
            console.error('❌ Помилка:', error);
            this.showDemoAnalysis('❌ Помилка з\'єднання з сервером');
        } finally {
            btn.innerHTML = '<i class="fas fa-chart-line"></i>';
        }
    }
    

    showChatEmotionAnalysis(chat) {
        const messages = chat.messages || [];
        const chatTitle = chat.title || 'Поточний чат';
        
        // Аналізуємо повідомлення чату
        let userMessages = messages.filter(m => m.role === 'user');
        let botMessages = messages.filter(m => m.role === 'assistant');
        
        // Збираємо статистику
        let totalMessages = messages.length;
        let userMsgCount = userMessages.length;
        let botMsgCount = botMessages.length;
        
        // Аналіз емоцій з повідомлень
        let emotions = {
            positive: 0,
            negative: 0,
            anxious: 0,
            sad: 0,
            angry: 0,
            neutral: 0
        };
        
        // Ключові слова для аналізу
        const emotionKeywords = {
            positive: ['добре', 'супер', 'чудово', 'радий', 'щасливий', 'дякую', 'клас', 'прекрасно', 'весело'],
            negative: ['погано', 'жах', 'жорстко', 'важко', 'боляче', 'нестерпно', 'втомився'],
            anxious: ['тривога', 'страх', 'паніка', 'хвилююсь', 'боюся', 'нервую', 'переживаю', 'неспокій'],
            sad: ['сумно', 'плачу', 'тужу', 'втрата', 'горе', 'депресія', 'пустота', 'безнадія'],
            angry: ['злість', 'гнів', 'роздратований', 'бісить', 'ненавиджу', 'розлючений']
        };
        
        // Аналізуємо кожне повідомлення користувача
        userMessages.forEach(msg => {
            const text = (msg.content || '').toLowerCase();
            let detected = false;
            
            for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
                if (keywords.some(kw => text.includes(kw))) {
                    emotions[emotion]++;
                    detected = true;
                    break;
                }
            }
            if (!detected && text.length > 0) {
                emotions.neutral++;
            }
        });
        
        // Знаходимо домінантну емоцію
        let dominantEmotion = 'neutral';
        let maxCount = 0;
        for (const [emotion, count] of Object.entries(emotions)) {
            if (count > maxCount) {
                maxCount = count;
                dominantEmotion = emotion;
            }
        }
        
        // Емодзі для домінантної емоції
        const emotionEmojis = {
            positive: '😊', negative: '😔', anxious: '😰', sad: '😢', angry: '😠', neutral: '😐'
        };
        
        const emotionNames = {
            positive: 'Позитивний', negative: 'Негативний', anxious: 'Тривожний', sad: 'Сумний', angry: 'Гнівний', neutral: 'Нейтральний'
        };
        
        // Аналіз довжини повідомлень
        const avgUserLength = userMsgCount > 0 ? 
            userMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / userMsgCount : 0;
        
        // Критичні повідомлення
        const criticalMessages = messages.filter(m => m.is_critical === 1 || m.is_critical === true);
        
        // Остання активність
        const lastMessage = messages[messages.length - 1];
        const lastActivity = lastMessage ? new Date(lastMessage.timestamp).toLocaleString('uk-UA') : 'немає';
        
        const panel = document.createElement('div');
        panel.className = 'emotion-analysis-panel';
        panel.id = 'emotionAnalysisPanel';
        
        panel.innerHTML = `
            <div class="analysis-header">
                <h3><i class="fas fa-comment-dots"></i> Аналіз чату: ${this.escapeHtml(chatTitle)}</h3>
                <button class="close-analysis-btn" onclick="window.multimodalManager.closeEmotionAnalysis()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="analysis-content">
                <div class="analysis-stats">
                    <div class="stat-item">
                        <span class="stat-label">💬 Всього повідомлень</span>
                        <span class="stat-value">${totalMessages}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">👤 Ваші повідомлення</span>
                        <span class="stat-value">${userMsgCount}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">🤖 Відповіді AI</span>
                        <span class="stat-value">${botMsgCount}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">📏 Сер. довжина</span>
                        <span class="stat-value">${avgUserLength.toFixed(0)} символів</span>
                    </div>
                </div>
                
                <div class="analysis-section">
                    <h4><i class="fas fa-smile"></i> Емоційний профіль чату</h4>
                    <div class="dominant-emotion" style="text-align: center; padding: 15px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 12px; color: white; margin-bottom: 15px;">
                        <div style="font-size: 48px;">${emotionEmojis[dominantEmotion]}</div>
                        <div style="font-size: 18px; font-weight: bold;">${emotionNames[dominantEmotion]}</div>
                        <div style="font-size: 12px;">Домінантна емоція чату</div>
                    </div>
                    
                    <div class="emotion-bars">
                        ${Object.entries(emotions).map(([emotion, count]) => {
                            const percent = userMsgCount > 0 ? (count / userMsgCount * 100).toFixed(0) : 0;
                            const colors = {
                                positive: '#2ecc71', negative: '#e74c3c', anxious: '#f39c12',
                                sad: '#3498db', angry: '#e67e22', neutral: '#95a5a6'
                            };
                            return `
                                <div class="emotion-bar-item">
                                    <span class="emotion-label">${emotionNames[emotion]} ${emotionEmojis[emotion]}</span>
                                    <div class="emotion-bar-container">
                                        <div class="emotion-bar-fill" style="width: ${percent}%; background: ${colors[emotion]};"></div>
                                    </div>
                                    <span class="emotion-percent">${percent}%</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                ${criticalMessages.length > 0 ? `
                <div class="analysis-section critical-section">
                    <h4><i class="fas fa-exclamation-triangle"></i> Критичні моменти</h4>
                    <div class="critical-count">⚠️ Виявлено ${criticalMessages.length} критичних повідомлень</div>
                    <div class="critical-messages">
                        ${criticalMessages.slice(0, 3).map(m => `
                            <div class="critical-message-preview">
                                "${m.content?.substring(0, 100)}${m.content?.length > 100 ? '...' : ''}"
                            </div>
                        `).join('')}
                    </div>
                    <div class="crisis-help">
                        <i class="fas fa-phone-alt"></i> Телефон довіри: <strong>0 800 500 225</strong>
                    </div>
                </div>
                ` : ''}
                
                <div class="analysis-section">
                    <h4><i class="fas fa-chart-line"></i> Інсайти</h4>
                    <div class="insights-list">
                        ${this.generateChatInsights(userMessages, emotions, criticalMessages.length)}
                    </div>
                </div>
                
                <div class="analysis-section">
                    <h4><i class="fas fa-clock"></i> Інформація про чат</h4>
                    <div class="chat-info">
                        <div>📅 Створено: ${new Date(chat.created_at).toLocaleString('uk-UA')}</div>
                        <div>🕐 Остання активність: ${lastActivity}</div>
                        <div>📊 Всього слів у чаті: ${messages.reduce((sum, m) => sum + (m.content?.split(/\s+/).length || 0), 0)}</div>
                    </div>
                </div>
            </div>
        `;
        
        // Додаємо стилі
        const style = document.createElement('style');
        style.textContent = `
            .emotion-analysis-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.9);
                width: 90%;
                max-width: 500px;
                max-height: 80vh;
                background: var(--card-bg, white);
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                z-index: 10001;
                opacity: 0;
                transition: all 0.3s ease;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            .emotion-analysis-panel.show { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            .analysis-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
            }
            .analysis-header h3 { margin: 0; font-size: 16px; }
            .close-analysis-btn {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
            }
            .analysis-content { padding: 20px; overflow-y: auto; flex: 1; }
            .analysis-stats {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
                margin-bottom: 20px;
            }
            .stat-item {
                text-align: center;
                padding: 12px;
                background: var(--bg-color, #f0f0f0);
                border-radius: 12px;
            }
            .stat-label { font-size: 11px; color: var(--muted, #666); }
            .stat-value { font-size: 20px; font-weight: bold; }
            .analysis-section {
                margin-bottom: 20px;
                padding: 15px;
                background: var(--bg-color, #f8f9fa);
                border-radius: 12px;
            }
            .analysis-section h4 {
                margin: 0 0 12px 0;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
            }
            .emotion-bar-item {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 10px;
            }
            .emotion-label { width: 100px; font-size: 12px; }
            .emotion-bar-container {
                flex: 1;
                height: 8px;
                background: #e0e0e0;
                border-radius: 4px;
                overflow: hidden;
            }
            .emotion-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
            .emotion-percent { width: 45px; font-size: 11px; text-align: right; }
            .critical-section { border-left: 4px solid #e74c3c; }
            .critical-count { font-size: 14px; color: #e74c3c; margin-bottom: 10px; }
            .critical-message-preview {
                font-size: 12px;
                padding: 8px;
                background: rgba(231,76,60,0.1);
                border-radius: 8px;
                margin-bottom: 5px;
                color: #e74c3c;
            }
            .crisis-help {
                margin-top: 10px;
                padding: 10px;
                background: #fef2f2;
                border-radius: 8px;
                font-size: 12px;
                text-align: center;
            }
            .insights-list { display: flex; flex-direction: column; gap: 8px; }
            .insight-item {
                font-size: 12px;
                padding: 8px;
                background: rgba(52,152,219,0.1);
                border-radius: 8px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .chat-info { font-size: 12px; line-height: 1.8; color: var(--muted, #666); }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(panel);
        setTimeout(() => panel.classList.add('show'), 10);
        this.emotionAnalysisPanel = panel;
    }

    generateChatInsights(messages, emotions, criticalCount) {
        const insights = [];
        
        if (messages.length === 0) {
            insights.push('💬 Немає повідомлень для аналізу');
            return insights.map(i => `<div class="insight-item">${i}</div>`).join('');
        }
        
        // Аналіз емоційного стану
        if (emotions.positive > emotions.negative && emotions.positive > emotions.anxious) {
            insights.push('😊 У цьому чаті переважає позитивний настрій');
        } else if (emotions.anxious > emotions.positive && emotions.anxious > emotions.sad) {
            insights.push('😰 Ви часто висловлюєте тривогу - це нормально, важливо про це говорити');
        } else if (emotions.sad > emotions.positive) {
            insights.push('😔 Ви ділитеся сумними почуттями - це допомагає їх опрацювати');
        } else if (emotions.angry > 0) {
            insights.push('😠 Ви виражаєте гнів - це здорова емоція, яку важливо не пригнічувати');
        }
        
        // Аналіз активності
        if (messages.length > 20) {
            insights.push('💪 Ви дуже активні в цьому чаті - це допомагає краще розуміти себе');
        } else if (messages.length < 5) {
            insights.push('🌱 Ви тільки починаєте розмову - продовжуйте ділитися');
        }
        
        // Критичні ситуації
        if (criticalCount > 0) {
            insights.push('⚠️ У цьому чаті були критичні моменти. Пам\'ятайте, що ви не самотні.');
        }
        
        // Довжина повідомлень
        const avgLength = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / messages.length;
        if (avgLength > 200) {
            insights.push('📝 Ви пишете розгорнуті повідомлення - це допомагає глибше проаналізувати ситуацію');
        }
        
        if (insights.length === 0) {
            insights.push('💫 Продовжуйте ділитися своїми думками та почуттями');
        }
        
        return insights.map(i => `<div class="insight-item">${i}</div>`).join('');
    }

    showEmotionAnalysisPanel(data) {
        const panel = document.createElement('div');
        panel.className = 'emotion-analysis-panel';
        panel.id = 'emotionAnalysisPanel';
        
        panel.innerHTML = `
            <div class="analysis-header">
                <h3><i class="fas fa-chart-pie"></i> Детальний аналіз емоцій</h3>
                <button class="close-analysis-btn" onclick="window.multimodalManager.closeEmotionAnalysis()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="analysis-content">
                <div class="analysis-stats">
                    <div class="stat-item">
                        <span class="stat-label">Всього повідомлень</span>
                        <span class="stat-value">${data.summary?.total_messages || 0}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Критичних моментів</span>
                        <span class="stat-value ${data.summary?.critical_messages > 0 ? 'critical' : ''}">
                            ${data.summary?.critical_messages || 0}
                        </span>
                    </div>
                </div>
                <div class="recommendations-section">
                    <h4><i class="fas fa-lightbulb"></i> Рекомендації</h4>
                    <div class="recommendations-list">
                        ${this.renderRecommendations(data.recommendations || [])}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        setTimeout(() => panel.classList.add('show'), 10);
        this.emotionAnalysisPanel = panel;
    }
    
    closeEmotionAnalysis() {
        if (this.emotionAnalysisPanel) {
            this.emotionAnalysisPanel.classList.remove('show');
            setTimeout(() => {
                if (this.emotionAnalysisPanel) {
                    this.emotionAnalysisPanel.remove();
                    this.emotionAnalysisPanel = null;
                }
            }, 300);
        }
    }
    
    renderRecommendations(recommendations) {
        if (!recommendations || recommendations.length === 0) {
            return `
                <div class="recommendation-item">
                    <i class="fas fa-heart" style="color: #3498db;"></i>
                    <span>Продовжуйте ділитися своїми почуттями</span>
                </div>
            `;
        }
        
        return recommendations.map(rec => `
            <div class="recommendation-item">
                <i class="fas fa-check-circle" style="color: #2ecc71;"></i>
                <span>${rec}</span>
            </div>
        `).join('');
    }
    
    showDemoAnalysis() {
        const demoData = {
            success: true,
            summary: { total_messages: 0, critical_messages: 0 },
            recommendations: [
                'Почніть розмову, щоб отримати аналітику',
                'Ваші емоції важливі для нас'
            ]
        };
        this.showEmotionAnalysisPanel(demoData);
    }
    
    async toggleScreenShare() {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: "always" },
                audio: false
            });
            
            this.showLoading('Ділюся екраном...');
            
            const videoTrack = screenStream.getVideoTracks()[0];
            const imageCapture = new ImageCapture(videoTrack);
            
            this.screenShareInterval = setInterval(async () => {
                try {
                    const frame = await imageCapture.grabFrame();
                    const canvas = document.createElement('canvas');
                    canvas.width = frame.width;
                    canvas.height = frame.height;
                    canvas.getContext('2d').drawImage(frame, 0, 0);
                    
                    canvas.toBlob(async (blob) => {
                        if (blob) {
                            await this.analyzeVideoFrame(blob);
                        }
                    }, 'image/jpeg', 0.7);
                    
                } catch (e) {
                    console.error('Помилка захоплення кадру екрану:', e);
                }
            }, 5000);
            
            videoTrack.onended = () => {
                clearInterval(this.screenShareInterval);
                this.hideLoading();
                this.showNotification('Шерінг екрану завершено', 'info');
            };
            
            const btn = document.getElementById('screenShareBtn');
            btn.innerHTML = '<i class="fas fa-stop"></i>';
            btn.title = 'Зупинити шерінг';
            
            this.screenStream = screenStream;
            
        } catch (error) {
            console.error('Помилка шерінгу екрану:', error);
            this.showNotification('Не вдалося поділитися екраном', 'error');
        }
    }
    
    async saveChat() {
        try {
            this.showLoading('Зберігаю чат...');
            
            const messages = document.querySelectorAll('.message');
            const chatContent = [];
            
            messages.forEach(msg => {
                const isBot = msg.classList.contains('bot');
                const textElement = msg.querySelector('.message-content > div:first-child');
                const text = textElement ? textElement.textContent : '';
                const timeElement = msg.querySelector('.message-time');
                const time = timeElement ? timeElement.textContent : '';
                
                if (text.trim()) {
                    chatContent.push({
                        role: isBot ? 'AI' : 'Користувач',
                        text: text.trim(),
                        time: time
                    });
                }
            });
            
            const chatText = chatContent.map(m => 
                `[${m.time}] ${m.role}: ${m.text}`
            ).join('\n\n');
            
            const blob = new Blob([chatText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `safeplace-chat-${new Date().toISOString().slice(0,10)}.txt`;
            a.click();
            
            URL.revokeObjectURL(url);
            this.hideLoading();
            this.showNotification('✅ Чат збережено!', 'success');
            
        } catch (error) {
            console.error('Помилка збереження:', error);
            this.showNotification('❌ Помилка збереження', 'error');
            this.hideLoading();
        }
    }
    
    async shareChat() {
        try {
            const messages = document.querySelectorAll('.message');
            let shareText = '🗣️ Розмова в Safe Place:\n\n';
            
            messages.forEach(msg => {
                const isBot = msg.classList.contains('bot');
                const text = msg.querySelector('.message-content div')?.textContent || '';
                const role = isBot ? '🤖 Safe Place' : '👤 Я';
                shareText += `${role}: ${text}\n\n`;
            });
            
            if (navigator.share) {
                await navigator.share({
                    title: 'Моя розмова в Safe Place',
                    text: shareText,
                    url: window.location.href
                });
            } else {
                await navigator.clipboard.writeText(shareText);
                this.showNotification('📋 Розмову скопійовано в буфер!', 'success');
            }
            
        } catch (error) {
            console.error('Помилка поширення:', error);
            try {
                await navigator.clipboard.writeText(shareText);
                this.showNotification('📋 Скопійовано в буфер!', 'success');
            } catch (clipError) {
                this.showNotification('❌ Не вдалося поділитися', 'error');
            }
        }
    }
    
    switchMode(event) {
        const tab = event.currentTarget;
        const mode = tab.dataset.mode;
        
        document.querySelectorAll('.multimodal-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        this.currentMode = mode;
        
        const url = new URL(window.location);
        url.searchParams.set('mode', mode);
        window.history.pushState({}, '', url);
    }
}

// Ініціалізація
document.addEventListener('DOMContentLoaded', () => {
    window.multimodalManager = new MultimodalManager();
    console.log('✅ MultimodalManager ініціалізовано');
});