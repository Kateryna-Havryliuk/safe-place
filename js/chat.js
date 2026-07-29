// API базовий URL
const API_BASE = 'http://127.0.0.1:5003/api';

// Глобальні змінні
let currentUser = null;
let currentChatId = null;
let isAnonymous = true;
let chatsCache = [];
let currentMessages = [];
let editingMessageId = null;

// Елементи DOM
const messagesContainer = document.getElementById("messagesContainer");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendButton");
const typingIndicator = document.getElementById("typingIndicator");
const emergencyBanner = document.getElementById("emergencyBanner");
const clearChatBtn = document.getElementById("clearChatBtn");
const sidebar = document.getElementById("sidebar");
const anonymousWarning = document.getElementById("anonymousWarning");
const userAvatar = document.getElementById("userAvatar");
const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");
const newChatBtn = document.getElementById("newChatBtn");
const chatsList = document.getElementById("chatsList");
const quickInsights = document.getElementById("quickInsights");

// ==================== ГЛОБАЛЬНІ ФУНКЦІЇ ДЛЯ СИНХРОНІЗАЦІЇ ====================

window.getCurrentChatId = () => currentChatId;

window.setCurrentChatId = (id) => {
    currentChatId = id;
    if (id) {
        localStorage.setItem('currentChatId', id);
    } else {
        localStorage.removeItem('currentChatId');
    }
    console.log('🔄 currentChatId оновлено:', currentChatId);
    window.dispatchEvent(new CustomEvent('chatChanged', { detail: { chatId: id } }));
};

window.addMessageToChat = (message) => {
    if (!currentChatId) {
        console.warn('⚠️ Немає активного чату для додавання повідомлення');
        return false;
    }
    
    console.log('➕ Додаємо повідомлення в чат:', message);
    
    // Додаємо в масив поточних повідомлень
    currentMessages.push(message);
    
    // Відображаємо в UI
    displayMessage(message);
    
    // Зберігаємо в localStorage
    saveMessageToStorage(message);
    
    // Оновлюємо список чатів
    loadUserChats();
    
    return true;
};

window.refreshCurrentChat = async () => {
    if (currentChatId) {
        await loadChat(currentChatId);
    }
};

// ==================== ІНІЦІАЛІЗАЦІЯ ТЕМИ ====================

function initChatTheme() {
    if (window.themeManager) {
        updateThemeButton(window.themeManager.getCurrentTheme());
    } else {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeButton(savedTheme);
    }
}

function toggleChatTheme() {
    if (window.themeManager) {
        window.themeManager.toggleTheme();
        updateThemeButton(window.themeManager.getCurrentTheme());
    } else {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeButton(newTheme);
    }
}

function updateThemeButton(theme) {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const sunIcon = themeToggle.querySelector('.fa-sun');
        const moonIcon = themeToggle.querySelector('.fa-moon');
        
        if (theme === 'dark') {
            if (sunIcon) sunIcon.style.display = 'none';
            if (moonIcon) moonIcon.style.display = 'inline-block';
        } else {
            if (sunIcon) sunIcon.style.display = 'inline-block';
            if (moonIcon) moonIcon.style.display = 'none';
        }
    }
}

// ==================== API ЗАПИТИ ====================

async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        }
    };
    
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...defaultOptions,
            ...options
        });
        
        if (response.status === 401) {
            logout();
            return { success: false, message: 'Необхідно авторизуватися' };
        }
        
        return await response.json();
    } catch (error) {
        console.error('Помилка API:', error);
        return { success: false, message: 'Помилка з\'єднання з сервером' };
    }
}

// ==================== УПРАВЛІННЯ ЧАТАМИ ====================

async function createNewChat(title = null) {
    console.log('📝 Створення нового чату...');
    
    const result = await apiRequest('/chat/new', {
        method: 'POST',
        body: JSON.stringify({ title: title || generateChatTitle() })
    });
    
    if (result.success) {
        window.setCurrentChatId(result.chat_id);
        currentMessages = [];
        clearChatMessages();
        addWelcomeMessage();
        await loadUserChats();
        console.log('✅ Новий чат створено:', result.chat_id);
        return result.chat_id;
    }
    return null;
}

function generateChatTitle() {
    const now = new Date();
    return `Чат ${now.toLocaleDateString('uk-UA')} ${now.toLocaleTimeString('uk-UA', {hour: '2-digit', minute:'2-digit'})}`;
}

async function loadUserChats() {
    const result = await apiRequest('/chats');
    
    if (result.success) {
        chatsCache = result.chats || [];
        renderChatsList(chatsCache);
    }
}

function renderChatsList(chats) {
    if (!chatsList) return;
    
    chatsList.innerHTML = '';
    
    if (chats.length === 0) {
        chatsList.innerHTML = `
            <div class="empty-chats">
                <i class="fas fa-comments"></i>
                <p>Ще немає чатів</p>
                <button onclick="createNewChat()" class="btn-primary">Створити перший чат</button>
            </div>
        `;
        return;
    }
    
    chats.forEach(chat => {
        const chatElement = document.createElement('div');
        chatElement.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        chatElement.dataset.chatId = chat.id;
        
        const lastMessage = chat.last_message || 'Немає повідомлень';
        const truncatedMessage = lastMessage.length > 30 
            ? lastMessage.substring(0, 30) + '...' 
            : lastMessage;
        
        chatElement.innerHTML = `
            <div class="chat-item-content" onclick="loadChat('${chat.id}')">
                <div class="chat-title">${escapeHtml(chat.title || 'Новий чат')}</div>
                <div class="chat-preview">${escapeHtml(truncatedMessage)}</div>
                <div class="chat-meta">
                    ${formatDate(chat.last_activity || chat.created_at)} • 
                    ${chat.message_count || 0} повід.
                </div>
            </div>
            <div class="chat-actions">
                <button class="chat-action-btn" onclick="event.stopPropagation(); showChatMenu('${chat.id}', this)" title="Меню">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        `;
        
        chatsList.appendChild(chatElement);
    });
}

// ==================== ПОШУК ЧАТІВ ====================

let currentSearchQuery = '';
let allChatsCache = []; // Кеш всіх чатів

// Оновлена функція renderChatsList з підтримкою пошуку
function renderChatsList(chats) {
    if (!chatsList) return;
    
    // Зберігаємо кеш
    allChatsCache = [...chats];
    
    // Фільтруємо за пошуковим запитом
    let filteredChats = chats;
    if (currentSearchQuery) {
        const query = currentSearchQuery.toLowerCase();
        filteredChats = chats.filter(chat => 
            chat.title?.toLowerCase().includes(query) ||
            chat.last_message?.toLowerCase().includes(query)
        );
    }
    
    chatsList.innerHTML = '';
    
    if (filteredChats.length === 0) {
        chatsList.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <p>Немає чатів за запитом "${escapeHtml(currentSearchQuery)}"</p>
                <button onclick="clearSearch()" class="btn-primary" style="margin-top: 10px; padding: 8px 16px; font-size: 12px;">
                    Очистити пошук
                </button>
            </div>
        `;
        return;
    }
    
    filteredChats.forEach(chat => {
        const chatElement = document.createElement('div');
        chatElement.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        chatElement.dataset.chatId = chat.id;
        
        const lastMessage = chat.last_message || 'Немає повідомлень';
        let truncatedMessage = lastMessage.length > 30 
            ? lastMessage.substring(0, 30) + '...' 
            : lastMessage;
        
        // Підсвічуємо знайдений текст
        if (currentSearchQuery) {
            const regex = new RegExp(`(${escapeRegex(currentSearchQuery)})`, 'gi');
            truncatedMessage = truncatedMessage.replace(regex, '<mark>$1</mark>');
        }
        
        chatElement.innerHTML = `
            <div class="chat-item-content" onclick="loadChat('${chat.id}')">
                <div class="chat-title">${escapeHtml(chat.title || 'Новий чат')}</div>
                <div class="chat-preview">${truncatedMessage}</div>
                <div class="chat-meta">
                    ${formatDate(chat.last_activity || chat.created_at)} • 
                    ${chat.message_count || 0} повід.
                </div>
            </div>
            <div class="chat-actions">
                <button class="chat-action-btn" onclick="event.stopPropagation(); showChatMenu('${chat.id}', this)" title="Меню">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        `;
        
        chatsList.appendChild(chatElement);
    });
}

// Функція для пошуку
function searchChats(query) {
    currentSearchQuery = query.trim();
    renderChatsList(allChatsCache);
    
    // Показуємо/ховаємо кнопку очищення
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) {
        clearBtn.style.display = currentSearchQuery ? 'flex' : 'none';
    }
}

// Очищення пошуку
function clearSearch() {
    const searchInput = document.getElementById('searchChatsInput');
    if (searchInput) {
        searchInput.value = '';
    }
    currentSearchQuery = '';
    renderChatsList(allChatsCache);
    
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }
}

// Екранування regex спецсимволів
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Ініціалізація пошуку
function initSearch() {
    const searchInput = document.getElementById('searchChatsInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchChats(e.target.value);
        });
        
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Escape') {
                clearSearch();
                searchInput.blur();
            }
        });
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', clearSearch);
    }
}


function showChatMenu(chatId, buttonElement) {
    closeAllMenus();
    
    const menu = document.createElement('div');
    menu.className = 'chat-menu';
    menu.id = `menu-${chatId}`;
    menu.innerHTML = `
        <div class="menu-item" onclick="renameChat('${chatId}')">
            <i class="fas fa-edit"></i> Перейменувати
        </div>
        <div class="menu-item" onclick="deleteChat('${chatId}')">
            <i class="fas fa-trash"></i> Видалити чат
        </div>
        <div class="menu-item" onclick="exportChat('${chatId}')">
            <i class="fas fa-download"></i> Експортувати
        </div>
    `;
    
    const rect = buttonElement.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.left = `${rect.left - 100}px`;
    menu.style.zIndex = '1000';
    
    document.body.appendChild(menu);
    
    setTimeout(() => {
        document.addEventListener('click', closeMenuHandler);
    }, 10);
}

function closeMenuHandler(e) {
    if (!e.target.closest('.chat-menu') && !e.target.closest('.chat-action-btn')) {
        closeAllMenus();
    }
}

function closeAllMenus() {
    document.querySelectorAll('.chat-menu').forEach(m => m.remove());
    document.querySelectorAll('.message-menu').forEach(m => m.remove());
    document.removeEventListener('click', closeMenuHandler);
}

async function renameChat(chatId) {
    closeAllMenus();
    const chat = chatsCache.find(c => c.id === chatId);
    if (!chat) return;
    
    const newTitle = prompt('Нова назва чату:', chat.title || 'Новий чат');
    if (newTitle === null || newTitle.trim() === '') return;
    
    const result = await apiRequest(`/chat/${chatId}/rename`, {
        method: 'PUT',
        body: JSON.stringify({ title: newTitle.trim() })
    });
    
    if (result.success) {
        await loadUserChats();
        showNotification('✅ Назву чату змінено', 'success');
    } else {
        showNotification('❌ Помилка зміни назви', 'error');
    }
}

async function deleteChat(chatId) {
    closeAllMenus();
    
    if (!confirm('Ви впевнені, що хочете видалити цей чат? Всі повідомлення будуть втрачені.')) {
        return;
    }
    
    const result = await apiRequest(`/chat/${chatId}`, {
        method: 'DELETE'
    });
    
    if (result.success) {
        if (currentChatId === chatId) {
            window.setCurrentChatId(null);
            currentMessages = [];
            clearChatMessages();
            addWelcomeMessage();
        }
        await loadUserChats();
        showNotification('✅ Чат видалено', 'success');
    } else {
        showNotification('❌ Помилка видалення', 'error');
    }
}

async function exportChat(chatId) {
    closeAllMenus();
    
    const result = await apiRequest(`/chat/${chatId}/export`);
    
    if (result.success && result.messages) {
        const chat = chatsCache.find(c => c.id === chatId);
        const chatText = formatChatForExport(result.messages, chat?.title);
        
        const blob = new Blob([chatText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `safeplace-chat-${chatId}-${new Date().toISOString().slice(0,10)}.txt`;
        a.click();
        
        URL.revokeObjectURL(url);
        showNotification('✅ Чат експортовано', 'success');
    }
}

function formatChatForExport(messages, chatTitle) {
    let text = `Safe Place - Чат: ${chatTitle || 'Без назви'}\n`;
    text += `Експортовано: ${new Date().toLocaleString('uk-UA')}\n`;
    text += `=====================================\n\n`;
    
    messages.forEach(msg => {
        const time = new Date(msg.timestamp).toLocaleString('uk-UA');
        const role = msg.role === 'user' ? '👤 Користувач' : '🤖 AI';
        const type = msg.type ? ` [${msg.type}]` : '';
        
        text += `[${time}] ${role}${type}:\n`;
        text += `${msg.content}\n\n`;
    });
    
    return text;
}

// ==================== ЗАВАНТАЖЕННЯ ЧАТУ ====================

async function loadChat(chatId) {
    console.log('📂 Завантаження чату:', chatId);
    
    // Зберігаємо поточний стан
    if (currentChatId && currentMessages.length > 0) {
        saveCurrentChatState();
    }
    
    // ОНОВЛЮЄМО currentChatId ГЛОБАЛЬНО
    window.setCurrentChatId(chatId);
    
    // Сповіщаємо multimodal.js про зміну чату
    window.dispatchEvent(new CustomEvent('chatChanged', { detail: { chatId } }));
    
    const result = await apiRequest(`/chat/${chatId}`);
    
    if (result.success && result.chat) {
        // Зберігаємо повідомлення
        currentMessages = result.chat.messages || [];
        
        // Відображаємо
        renderChatMessages(currentMessages);
        
        // Оновлюємо список чатів
        await loadUserChats();
        
        console.log('✅ Завантажено повідомлень:', currentMessages.length);
        
    } else {
        console.error('❌ Помилка завантаження чату:', result);
        showNotification('❌ Помилка завантаження чату', 'error');
        // Якщо чат не завантажився, створюємо новий
        if (currentMessages.length === 0) {
            addWelcomeMessage();
        }
    }
}

function saveCurrentChatState() {
    // Зберігаємо стан чату в localStorage
    if (currentChatId && currentMessages.length > 0) {
        localStorage.setItem(`chat_draft_${currentChatId}`, JSON.stringify({
            timestamp: new Date().toISOString(),
            messages: currentMessages
        }));
    }
}

// ==================== ВІДОБРАЖЕННЯ ПОВІДОМЛЕНЬ ====================

function renderChatMessages(messages) {
    console.log('🎨 Рендеринг повідомлень:', messages.length);
    
    clearChatMessages();
    
    if (!messages || messages.length === 0) {
        addWelcomeMessage();
        console.log('ℹ️ Чат порожній, додано вітальне повідомлення');
        return;
    }
    
    messages.forEach(msg => {
        if (msg.role !== 'system') {
            displayMessage(msg);
        }
    });
    
    scrollToBottom();
    console.log('✅ Повідомлення відображено');
}

function displayMessage(msg) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${msg.role === 'user' ? 'user' : 'bot'}`;
    messageDiv.dataset.messageId = msg.id || `msg-${Date.now()}-${Math.random()}`;
    messageDiv.dataset.type = msg.type || 'text';
    
    const time = msg.timestamp 
        ? new Date(msg.timestamp).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    
    let contentHtml = '';
    
    // Обробка різних типів повідомлень
    switch(msg.type) {
        case 'voice':
            contentHtml = renderVoiceMessage(msg);
            break;
        case 'video':
            contentHtml = renderVideoMessage(msg);
            break;
        case 'photo':
            contentHtml = renderPhotoMessage(msg);
            break;
        default:
            contentHtml = renderTextMessage(msg);
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
        // Отримуємо аватар користувача
        const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const userName = user.name || 'В';
        const userInitial = userName.charAt(0).toUpperCase();
        const userAvatar = user.avatar || null;

        const avatarHtml = userAvatar 
            ? `<img src="${userAvatar}" alt="${userName}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`
            : userInitial;

        messageDiv.innerHTML = `
            <div class="message-content">
                ${contentHtml}
                <div class="message-footer">
                    <span class="message-time">${time}</span>
                    <div class="message-actions">
                        <button class="msg-action-btn" onclick="showMessageMenu('${messageDiv.dataset.messageId}', this)" title="Дії">
                            <i class="fas fa-ellipsis-h"></i>
                        </button>
                    </div>
                </div>
            </div>
            <div class="avatar">${avatarHtml}</div>
        `;
    }
    
    // Перевірка на кризові слова
    // ПЕРЕВІРКА НА КРИЗУ - ПОСИЛЕНА
    let isCritical = false;

    // 1. Прямий флаг від сервера
    if (msg.is_critical === true) {
        isCritical = true;
        console.log('🔴 Криза: is_critical=true');
    }
    // 2. Перевірка вмісту повідомлення
    else if (msg.content && checkForCriticalWords(msg.content)) {
        isCritical = true;
        console.log('🔴 Криза: знайдено критичні слова в контенті:', msg.content.substring(0, 50));
    }
    // 3. ДЛЯ AI: перевіряємо, чи попереднє повідомлення користувача було критичним
    else if (msg.role === 'assistant' || msg.role === 'bot') {
        // Знаходимо останнє повідомлення користувача
        const lastUserMessage = currentMessages.filter(m => m.role === 'user').pop();
        if (lastUserMessage && (lastUserMessage.is_critical || checkForCriticalWords(lastUserMessage.content))) {
            isCritical = true;
            console.log('🔴 Криза: попереднє повідомлення користувача було критичним');
        }
    }

    if (isCritical) {
        messageDiv.classList.add('critical');
        console.log('✅ Додано клас critical до повідомлення');
    }
    
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        messagesContainer.insertBefore(messageDiv, typingIndicator);
    } else {
        messagesContainer.appendChild(messageDiv);
    }
    scrollToBottom();
}

function renderTextMessage(msg) {
    const formattedText = formatMessageText(msg.content);
    return `<div class="message-text">${formattedText}</div>`;
}

function renderVoiceMessage(msg) {
    const emotions = msg.emotions || {};
    const dominant = Object.entries(emotions).sort((a, b) => b[1] - a[1])[0] || ['neutral', 0];
    
    return `
        <div class="voice-message-content">
            <div class="voice-header">
                <i class="fas fa-microphone"></i>
                <span>Голосове повідомлення</span>
            </div>
            ${msg.transcription ? `
                <div class="voice-transcription">
                    <i class="fas fa-quote-left"></i>
                    ${escapeHtml(msg.transcription)}
                </div>
            ` : ''}
            ${msg.audio_url ? `
                <audio controls src="${msg.audio_url}" style="width: 100%; margin-top: 8px;"></audio>
            ` : ''}
            <div class="voice-meta">
                <span class="emotion-tag" style="background: ${getEmotionColor(dominant[0])}">
                    ${dominant[0]}: ${Math.round(dominant[1] * 100)}%
                </span>
                ${msg.duration ? `<span class="duration">${formatDuration(msg.duration)}</span>` : ''}
            </div>
        </div>
    `;
}

function renderVideoMessage(msg) {
    return `
        <div class="video-message-content">
            <div class="video-header">
                <i class="fas fa-video"></i>
                <span>Відео повідомлення</span>
                ${msg.duration ? `<span class="duration">${formatDuration(msg.duration)}</span>` : ''}
            </div>
            ${msg.video_url ? `
                <video controls class="chat-video" preload="metadata">
                    <source src="${msg.video_url}" type="video/webm">
                </video>
            ` : ''}
        </div>
    `;
}

function renderPhotoMessage(msg) {
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

function showMessageMenu(messageId, buttonElement) {
    // Закриваємо всі попередні меню
    closeAllMenus();
    
    // Створюємо меню
    const menu = document.createElement('div');
    menu.className = 'message-menu';
    menu.id = `menu-${messageId}`;
    menu.innerHTML = `
        <div class="menu-item delete-item" data-message-id="${messageId}">
            <i class="fas fa-trash"></i> Видалити
        </div>
    `;
    
    // Позиціонуємо меню
    const rect = buttonElement.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.zIndex = '10000';
    
    document.body.appendChild(menu);
    
    // Обробник для кнопки видалення
    const deleteBtn = menu.querySelector('.delete-item');
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const msgId = deleteBtn.dataset.messageId;
        
        // Закриваємо меню
        menu.remove();
        
        // Видаляємо повідомлення
        await deleteMessage(msgId);
    });
    
    // Закриття при кліку поза меню
    const closeHandler = (e) => {
        if (!menu.contains(e.target) && !buttonElement.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeHandler);
    }, 10);
}

async function deleteMessage(messageId) {
    console.log('🗑 Видаляємо повідомлення:', messageId);
    
    // Знаходимо елемент повідомлення
    const msgElement = document.querySelector(`[data-message-id="${messageId}"]`);
    
    if (!msgElement) {
        console.error('❌ Повідомлення не знайдено');
        return;
    }
    
    // Видаляємо з DOM
    msgElement.remove();
    console.log('✅ Повідомлення видалено з екрану');
    
    // Видаляємо з масиву currentMessages
    const index = currentMessages.findIndex(m => m.id === messageId);
    if (index !== -1) {
        currentMessages.splice(index, 1);
        console.log('✅ Видалено з масиву currentMessages');
    }
    
    // Видаляємо з localStorage
    try {
        let analyticsData = localStorage.getItem('analytics_messages');
        if (analyticsData) {
            let messages = JSON.parse(analyticsData);
            messages = messages.filter(m => m.id !== messageId);
            localStorage.setItem('analytics_messages', JSON.stringify(messages));
            console.log('✅ Видалено з localStorage');
        }
    } catch (e) {
        console.error('Помилка видалення з localStorage:', e);
    }
    
    // Видаляємо з сервера (якщо є чат)
    if (currentChatId) {
        try {
            const result = await apiRequest(`/chat/${currentChatId}/message/${messageId}`, {
                method: 'DELETE'
            });
            if (result.success) {
                console.log('✅ Видалено з сервера');
                showNotification('✅ Повідомлення видалено', 'success');
            }
        } catch (error) {
            console.error('❌ Помилка видалення з сервера:', error);
        }
    }
    
    // Оновлюємо список чатів (щоб оновити кількість повідомлень)
    await loadUserChats();
}

// ==================== ВІДПРАВКА ПОВІДОМЛЕНЬ ====================

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;
    
    console.log('📤 Відправляємо повідомлення. Поточний chat_id:', currentChatId);
    
    // Очищаємо поле
    userInput.value = '';
    userInput.style.height = 'auto';
    
    // Створюємо повідомлення користувача
    const userMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        type: 'text',
        content: text,
        timestamp: new Date().toISOString(),
        is_critical: checkForCriticalWords(text)
    };
    
    // Додаємо в UI
    displayMessage(userMessage);
    currentMessages.push(userMessage);
    
    // Перевірка на кризу
    if (userMessage.is_critical) {
        showCrisisWarning();
    }
    
    // Показуємо індикатор завантаження
    showLoading('AI думає...');
    
    try {
        const token = localStorage.getItem('authToken');

        const response = await fetch(`${API_BASE}/talk`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify({
                message: text,
                chat_id: currentChatId || null,  // ← змініть: якщо null, а не ''
                context: {
                    is_critical: userMessage.is_critical
                }
            })
        });
        const data = await response.json();
        
        if (data.answer) {
            // Сервер повернув chat_id - зберігаємо
            if (data.chat_id) {
                if (!currentChatId) {
                    window.setCurrentChatId(data.chat_id);
                    console.log('💾 Створено новий чат:', currentChatId);
                    await loadUserChats();
                } else if (currentChatId !== data.chat_id) {
                    window.setCurrentChatId(data.chat_id);
                }
            }
            
            // Створюємо повідомлення AI
            const aiMessage = {
                id: `msg-${Date.now()}`,
                role: 'assistant',
                type: 'text',
                content: data.answer,
                timestamp: new Date().toISOString(),
                is_critical: data.crisis_warning || checkForCriticalWords(data.answer)
            };
            
            // Додаємо в UI
            displayMessage(aiMessage);
            currentMessages.push(aiMessage);
            
            // Зберігаємо в localStorage для аналітики
            saveMessageToStorage(userMessage);
            saveMessageToStorage(aiMessage);
            
            // Перевірка кризи у відповіді
            if (data.crisis_warning || checkForCriticalWords(data.answer)) {
                showCrisisWarning();
            }
            
            // Оновлюємо список чатів
            await loadUserChats();
            
        } else {
            throw new Error(data.message || 'Помилка відповіді AI');
        }
        
    } catch (error) {
        console.error('❌ Помилка:', error);
        
        // Fallback повідомлення
        const fallbackMessage = {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            type: 'text',
            content: '🫂 Вибачте, сталася помилка з\'єднання. Спробуйте ще раз.',
            timestamp: new Date().toISOString()
        };
        
        displayMessage(fallbackMessage);
        currentMessages.push(fallbackMessage);
        showNotification('❌ Помилка з\'єднання', 'error');
        
    } finally {
        hideLoading();
    }
}

// ==================== ЗБЕРЕЖЕННЯ В АНАЛІТИКУ ====================

function saveMessageToStorage(message) {
    console.log('💾 Збереження повідомлення:', message.id, 'чат:', currentChatId);
    try {
        let analyticsData = localStorage.getItem('analytics_messages');
        let messages = [];
        
        if (analyticsData) {
            try {
                messages = JSON.parse(analyticsData);
                if (!Array.isArray(messages)) messages = [];
            } catch (e) {
                messages = [];
            }
        }
        
        messages.push({
            id: message.id,
            timestamp: message.timestamp,
            role: message.role,
            content: message.content,
            chat_id: currentChatId,
            type: message.type || 'text',
            emotions: message.emotions || null,
            is_critical: message.is_critical || false
        });
        
        // Обмежуємо кількість
        if (messages.length > 1000) {
            messages = messages.slice(-1000);
        }
        
        localStorage.setItem('analytics_messages', JSON.stringify(messages));
        console.log('💾 Збережено повідомлення в localStorage');
        
    } catch (e) {
        console.error('❌ Помилка збереження:', e);
    }
}

// ==================== АНАЛІТИКА ====================

async function loadQuickInsights() {
    if (!quickInsights) return;
    
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            quickInsights.innerHTML = `
                <div class="insight-card">
                    <div class="insight-header">
                        <span class="insight-title">Увійдіть для аналітики</span>
                    </div>
                    <div class="insight-value">
                        <span>🔐 Авторизуйтесь, щоб бачити статистику</span>
                    </div>
                </div>
            `;
            return;
        }
        
        const result = await apiRequest('/analytics/user');
        
        if (result.success && result.insights) {
            const insights = result.insights;
            
            // Визначаємо тренд
            let trendClass = 'unknown';
            let trendIcon = 'fa-chart-line';
            let trendText = 'Аналіз';
            
            switch(insights.severity_trend) {
                case 'improving':
                    trendClass = 'improving';
                    trendIcon = 'fa-arrow-up';
                    trendText = 'Покращення';
                    break;
                case 'worsening':
                    trendClass = 'worsening';
                    trendIcon = 'fa-arrow-down';
                    trendText = 'Погіршення';
                    break;
                case 'stable':
                    trendClass = 'stable';
                    trendIcon = 'fa-minus';
                    trendText = 'Стабільно';
                    break;
                default:
                    trendClass = 'unknown';
                    trendIcon = 'fa-chart-line';
                    trendText = 'Аналіз';
            }
            
            // Форматуємо настрій
            const avgSentiment = insights.avg_sentiment || 0;
            let sentimentEmoji = '😐';
            let sentimentText = 'Нейтрально';
            
            if (avgSentiment > 0.3) {
                sentimentEmoji = '😊';
                sentimentText = 'Позитивно';
            } else if (avgSentiment > 0) {
                sentimentEmoji = '🙂';
                sentimentText = 'Добре';
            } else if (avgSentiment > -0.3) {
                sentimentEmoji = '😐';
                sentimentText = 'Нейтрально';
            } else if (avgSentiment > -0.6) {
                sentimentEmoji = '😔';
                sentimentText = 'Пригнічено';
            } else {
                sentimentEmoji = '😢';
                sentimentText = 'Важко';
            }
            
            quickInsights.innerHTML = `
                <div class="insight-card">
                    <div class="insight-header">
                        <span class="insight-title">
                            <i class="fas fa-chart-line"></i> Емоційний стан
                        </span>
                        <span class="trend-badge ${trendClass}">
                            <i class="fas ${trendIcon}"></i> ${trendText}
                        </span>
                    </div>
                    <div class="insight-value">
                        <span class="emoji">${sentimentEmoji}</span>
                        <span>${sentimentText}</span>
                        <span style="font-size: 0.7rem; margin-left: auto;">
                            ${insights.message_count || 0} повід.
                        </span>
                    </div>
                </div>
            `;
            
            // Оновлюємо статистику
            const statMessages = document.getElementById('statMessages');
            const statCritical = document.getElementById('statCritical');
            const statSentiment = document.getElementById('statSentiment');
            
            if (statMessages) statMessages.textContent = insights.message_count || 0;
            if (statCritical) statCritical.textContent = insights.critical_messages || 0;
            if (statSentiment) {
                const sent = insights.avg_sentiment || 0;
                statSentiment.textContent = sent > 0 ? `+${Math.round(sent * 100)}%` : `${Math.round(sent * 100)}%`;
            }
            
        } else {
            quickInsights.innerHTML = `
                <div class="insight-card">
                    <div class="insight-header">
                        <span class="insight-title">
                            <i class="fas fa-chart-line"></i> Статистика
                        </span>
                    </div>
                    <div class="insight-value">
                        <span>💬 Почніть розмову</span>
                    </div>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Помилка завантаження аналітики:', error);
        quickInsights.innerHTML = `
            <div class="insight-card">
                <div class="insight-header">
                    <span class="insight-title">
                        <i class="fas fa-chart-line"></i> Статистика
                    </span>
                </div>
                <div class="insight-value">
                    <span>⚠️ Помилка завантаження</span>
                </div>
            </div>
        `;
    }
}

// ==================== ДОПОМІЖНІ ФУНКЦІЇ ====================

function checkForCriticalWords(text) {
    if (!text) return false;
    
    // Розширений список: 25+ ключових слів/фраз
    const criticalWords = [
        // Суїцидальні ризики (9)
        'суїцид', 'самогубство', 'повіситися', 'вбити себе', 'померти',
        'вмерти', 'не хочу жити', 'кінець життя', 'закінчити з собою',
        
        // Самопошкодження (4)
        'різати вени', 'передозування', 'стрибнути', 'застрелитися',
        
        // Психосоматичні (3)
        'панічна атака', 'не можу дихати', 'серце зупиниться',
        
        // Екзистенційні кризи (9+) — для досягнення 25+
        'все пропало', 'немає сенсу', 'прощайте', 'більше не можу',
        'покінчити', 'забрати життя', 'впуститися', 'пустота всередині',
        'хочу померти', 'не бачу сенсу', 'закінчити все', 'все безнадійно'
    ];
    
    const lowerText = text.toLowerCase();
    return criticalWords.some(word => lowerText.includes(word));
}

function showCrisisWarning() {
    const banner = document.getElementById('emergencyBanner');
    if (banner) {
        banner.style.display = 'block';
        banner.classList.add('show');
        
        setTimeout(() => {
            banner.classList.remove('show');
            setTimeout(() => {
                banner.style.display = 'none';
            }, 300);
        }, 30000);
    }
}

function formatMessageText(text) {
    if (!text) return '';
    
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
        .replace(/^\s*[-•]\s+/gm, '• ')
        .replace(/^\s*(\d+)\.\s+/gm, '$1. ');
}

function formatDate(dateString) {
    if (!dateString) return 'щойно';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'щойно';
    if (diffMins < 60) return `${diffMins} хв тому`;
    if (diffHours < 24) return `${diffHours} год тому`;
    if (diffDays === 1) return 'вчора';
    if (diffDays < 7) return `${diffDays} дн тому`;
    
    return date.toLocaleDateString('uk-UA');
}

function formatDuration(seconds) {
    if (!seconds || seconds < 1) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins > 0) {
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `0:${secs.toString().padStart(2, '0')}`;
}

function getEmotionColor(emotion) {
    const colors = {
        happy: '#f1c40f',
        happiness: '#f1c40f',
        joy: '#f1c40f',
        sad: '#3498db',
        sadness: '#3498db',
        angry: '#e74c3c',
        anger: '#e74c3c',
        fear: '#9b59b6',
        scared: '#9b59b6',
        stress: '#e67e22',
        anxiety: '#e67e22',
        worried: '#e67e22',
        neutral: '#95a5a6'
    };
    return colors[emotion] || '#95a5a6';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(text) {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.style.display = 'flex';
        const textSpan = indicator.querySelector('.typing-text');
        if (textSpan) {
            textSpan.textContent = text;
        } else {
            indicator.innerHTML = `
                <span></span><span></span><span></span>
                <span class="typing-text">${text}</span>
            `;
        }
    }
}

function hideLoading() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

function scrollToBottom() {
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function clearChatMessages() {
    if (!messagesContainer) return;
    
    // Залишаємо тільки typingIndicator
    while (messagesContainer.children.length > 0) {
        const child = messagesContainer.children[0];
        if (child.id === 'typingIndicator') {
            break;
        }
        messagesContainer.removeChild(child);
    }
}

function addWelcomeMessage() {
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'message bot';
    welcomeDiv.innerHTML = `
        <div class="avatar">S</div>
        <div class="message-content">
            <div>Привіт! Я твій віртуальний супутник у складні моменти. Моя роль — надати тобі емоційну підтримку, вислухати без осуду та допомогти знайти внутрішні ресурси для подолання труднощів.</div>
            <div class="message-footer">
                <span class="message-time">${new Date().toLocaleTimeString('uk-UA', {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
        </div>
    `;
    
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        messagesContainer.insertBefore(welcomeDiv, typingIndicator);
    } else {
        messagesContainer.appendChild(welcomeDiv);
    }
}

function showNotification(message, type = 'info') {
    // Видаляємо старі сповіщення
    document.querySelectorAll('.chat-notification').forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `chat-notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
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

function analyzeSimpleSentiment(text) {
    if (!text) return 0;
    
    const positive = ['добре', 'супер', 'радий', 'щастя', 'дякую', 'клас', 'чудово'];
    const negative = ['погано', 'важко', 'страшно', 'тривога', 'депресія', 'поганий', 'жах'];
    
    let score = 0;
    const lower = text.toLowerCase();
    
    positive.forEach(w => { if (lower.includes(w)) score += 0.2; });
    negative.forEach(w => { if (lower.includes(w)) score -= 0.3; });
    
    return Math.max(-1, Math.min(1, score));
}

// ==================== АВТОРИЗАЦІЯ ====================

function initializeUserSession() {
    if (sidebar) {
        sidebar.style.display = 'flex';
        setTimeout(() => {
            sidebar.classList.add('initialized');
        }, 10);
    }
    if (anonymousWarning) anonymousWarning.style.display = 'none';
    
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (userAvatar) userAvatar.textContent = (user.name || 'U').charAt(0).toUpperCase();
    if (userName) userName.textContent = user.name || 'Користувач';
    if (userEmail) userEmail.textContent = user.email || '';
    
    loadUserChats();
    loadQuickInsights();
    initSearch(); 
}

function showAnonymousMode() {
    if (sidebar) {
        sidebar.style.display = 'none';
        sidebar.classList.remove('open', 'collapsed');
    }
    if (anonymousWarning) anonymousWarning.style.display = 'block';
    
    currentChatId = null;
    chatsCache = [];
    
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) overlay.classList.remove('show');
    
    document.body.style.overflow = '';
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentChatId');
    currentUser = null;
    isAnonymous = true;
    currentChatId = null;
    currentMessages = [];
    showAnonymousMode();
    clearChatMessages();
    addWelcomeMessage();
}

// ==================== ІНІЦІАЛІЗАЦІЯ ====================

window.addEventListener('load', async function() {
    console.log('=== CHAT LOADED ===');
    
    const savedUser = localStorage.getItem('currentUser');
    const savedToken = localStorage.getItem('authToken');
    const savedChatId = localStorage.getItem('currentChatId');
    
    console.log('💾 Збережений chat_id:', savedChatId);
    
    if (savedUser && savedToken) {
        try {
            currentUser = JSON.parse(savedUser);
            isAnonymous = false;
            initializeUserSession();
            
            if (savedChatId) {
                currentChatId = savedChatId;
                console.log('🔄 Відновлюємо чат:', currentChatId);
                await loadChat(currentChatId);
            }
            
        } catch (e) {
            console.error('Помилка відновлення сесії:', e);
            showAnonymousMode();
        }
    } else {
        showAnonymousMode();
    }
    
    // Обробка повідомлення з головної сторінки
    const initialMessage = localStorage.getItem('initialMessage');
    if (initialMessage) {
        setTimeout(() => {
            userInput.value = initialMessage;
            sendMessage();
            localStorage.removeItem('initialMessage');
        }, 500);
    }
    
    userInput?.focus();
    initChatTheme();
});

// Обробники подій
newChatBtn?.addEventListener('click', () => createNewChat());

userInput?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendButton?.addEventListener('click', sendMessage);

clearChatBtn?.addEventListener('click', function() {
    if (confirm('Очистити поточний чат? Історія збережеться.')) {
        clearChatMessages();
        addWelcomeMessage();
        currentMessages = [];
    }
});

// Обробка повідомлень від батьківського вікна
window.addEventListener('message', function(event) {
    if (event.data.type === 'INITIAL_MESSAGE') {
        const message = event.data.message;
        const user = event.data.user;
        const token = event.data.token;
        
        if (user && token) {
            currentUser = user;
            isAnonymous = false;
            localStorage.setItem('currentUser', JSON.stringify(user));
            localStorage.setItem('authToken', token);
            initializeUserSession();
        }
        
        setTimeout(() => {
            if (!currentChatId && !isAnonymous) {
                createNewChat().then(() => {
                    userInput.value = message;
                    sendMessage();
                });
            } else {
                userInput.value = message;
                sendMessage();
            }
        }, 500);
    }
});


// Експортуємо функції для глобального доступу
window.createNewChat = createNewChat;
window.loadChat = loadChat;
window.renameChat = renameChat;
window.deleteChat = deleteChat;
window.exportChat = exportChat;
window.showChatMenu = showChatMenu;
window.showMessageMenu = showMessageMenu;
window.deleteMessage = deleteMessage;
window.sendMessage = sendMessage;
window.logout = logout;