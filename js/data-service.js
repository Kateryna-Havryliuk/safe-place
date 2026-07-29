// ==================== DataService.js ====================
// Єдине джерело правди для всіх даних

const DataService = {
    // Ключі для localStorage
    STORAGE_KEYS: {
        CHATS: 'safeplace_chats',
        CURRENT_USER: 'safeplace_currentUser',
        USER_EMAIL: 'safeplace_userEmail',
        USER_NAME: 'safeplace_userName'
    },

    // Ініціалізація
    init() {
        console.log('📊 DataService ініціалізовано');
        if (!localStorage.getItem(this.STORAGE_KEYS.CHATS)) {
            localStorage.setItem(this.STORAGE_KEYS.CHATS, JSON.stringify([]));
        }
    },

    // ========== Робота з чатами ==========
    getChats() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEYS.CHATS)) || [];
        } catch (e) {
            console.error('Помилка читання чатів:', e);
            return [];
        }
    },

    saveChat(chatData) {
        const chats = this.getChats();
        const newChat = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            messages: chatData.messages || [],
            preview: chatData.preview || 'Новий чат',
            messageCount: chatData.messages?.length || 0,
            ...chatData
        };
        
        chats.unshift(newChat);
        // Обмежуємо кількість чатів
        if (chats.length > 50) chats.pop();
        
        localStorage.setItem(this.STORAGE_KEYS.CHATS, JSON.stringify(chats));
        return newChat;
    },

    // ========== Отримання всіх повідомлень для аналітики ==========
    getAllMessages() {
        const chats = this.getChats();
        const allMessages = [];
        
        chats.forEach(chat => {
            if (chat.messages && Array.isArray(chat.messages)) {
                chat.messages.forEach(msg => {
                    allMessages.push({
                        ...msg,
                        chatId: chat.id,
                        chatPreview: chat.preview,
                        timestamp: msg.timestamp || chat.timestamp
                    });
                });
            }
        });
        
        // Сортуємо за часом
        return allMessages.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
    },

    // ========== Додавання нового повідомлення ==========
    addMessage(messageData) {
        const chats = this.getChats();
        let currentChat = chats[0]; // Останній чат
        
        // Якщо немає чатів або минуло більше години - створюємо новий
        if (!currentChat || this.isNewChatNeeded(currentChat)) {
            currentChat = this.saveChat({
                messages: [],
                preview: messageData.text?.substring(0, 30) + '...'
            });
        }
        
        // Додаємо повідомлення
        if (!currentChat.messages) currentChat.messages = [];
        
        const newMessage = {
            id: Date.now() + Math.random(),
            text: messageData.text,
            sender: messageData.sender || 'user',
            timestamp: new Date().toISOString(),
            sentiment: messageData.sentiment || this.analyzeSentiment(messageData.text),
            emotions: messageData.emotions || this.analyzeEmotions(messageData.text),
            category: messageData.category || this.categorizeMessage(messageData.text),
            is_crisis: messageData.is_crisis || this.detectCrisis(messageData.text)
        };
        
        currentChat.messages.push(newMessage);
        currentChat.messageCount = currentChat.messages.length;
        currentChat.preview = newMessage.text.substring(0, 30) + '...';
        currentChat.lastMessage = newMessage.timestamp;
        
        // Оновлюємо в localStorage
        localStorage.setItem(this.STORAGE_KEYS.CHATS, JSON.stringify(chats));
        
        return newMessage;
    },

    // ========== Допоміжні функції аналізу ==========
    analyzeSentiment(text) {
        if (!text) return 0;
        text = text.toLowerCase();
        
        const positive = ['добре', 'супер', 'чудово', 'радий', 'щасливий', 'весело', '❤️', '😊'];
        const negative = ['погано', 'сумно', 'важко', 'страшно', 'тривога', 'не хочу', 'жити', 'депресія', '😢', '😔'];
        
        let score = 0;
        positive.forEach(word => { if (text.includes(word)) score += 0.3; });
        negative.forEach(word => { if (text.includes(word)) score -= 0.3; });
        
        return Math.max(-1, Math.min(1, score));
    },

    analyzeEmotions(text) {
        if (!text) return {};
        text = text.toLowerCase();
        
        return {
            joy: text.includes('весело') || text.includes('радий') ? 0.8 : 0.2,
            sadness: text.includes('сумно') || text.includes('важко') ? 0.7 : 0.1,
            anger: text.includes('злий') || text.includes('бісить') ? 0.6 : 0.1,
            fear: text.includes('страшно') || text.includes('тривога') ? 0.7 : 0.1,
            stress: text.includes('важко') || text.includes('втомився') ? 0.6 : 0.2
        };
    },

    categorizeMessage(text) {
        if (!text) return 'general';
        text = text.toLowerCase();
        
        if (text.includes('робот') || text.includes('навчання') || text.includes('універ')) return 'work_study';
        if (text.includes('депресія') || text.includes('жити')) return 'depression';
        if (text.includes('тривога') || text.includes('страх')) return 'anxiety';
        if (text.includes('стрес') || text.includes('втом')) return 'stress';
        if (text.includes('весело') || text.includes('радий')) return 'positive';
        
        return 'general';
    },

    detectCrisis(text) {
        if (!text) return false;
        text = text.toLowerCase();
        const crisisWords = ['не хочу жити', 'самогубство', 'смерть', 'померти', 'кінець', 'все', 'навіщо'];
        return crisisWords.some(word => text.includes(word));
    },

    isNewChatNeeded(chat) {
        if (!chat || !chat.lastMessage) return true;
        const lastMessageTime = new Date(chat.lastMessage).getTime();
        const now = Date.now();
        // Новий чат якщо минуло більше 1 години
        return (now - lastMessageTime) > 60 * 60 * 1000;
    },

    // ========== Отримання даних для аналітики ==========
    getAnalyticsData(days = 30) {
        const messages = this.getAllMessages();
        const now = new Date();
        const cutoff = new Date(now.setDate(now.getDate() - days));
        
        // Фільтруємо за останні N днів
        const recentMessages = messages.filter(msg => 
            new Date(msg.timestamp) > cutoff
        );
        
        // Групуємо по днях
        const dailyStats = {};
        recentMessages.forEach(msg => {
            const date = new Date(msg.timestamp).toISOString().split('T')[0];
            if (!dailyStats[date]) {
                dailyStats[date] = {
                    date,
                    total: 0,
                    byType: { text: 0, voice: 0, video: 0 },
                    sentiments: [],
                    emotions: {},
                    crises: 0
                };
            }
            
            dailyStats[date].total++;
            dailyStats[date].byType.text++;
            dailyStats[date].sentiments.push(msg.sentiment || 0);
            
            if (msg.is_crisis) dailyStats[date].crises++;
            
            // Додаємо емоції
            if (msg.emotions) {
                Object.entries(msg.emotions).forEach(([emotion, value]) => {
                    dailyStats[date].emotions[emotion] = (dailyStats[date].emotions[emotion] || 0) + value;
                });
            }
        });
        
        // Обчислюємо середні
        Object.values(dailyStats).forEach(day => {
            day.avgSentiment = day.sentiments.length > 0 
                ? day.sentiments.reduce((a, b) => a + b, 0) / day.sentiments.length 
                : 0;
        });
        
        // Категорії
        const categories = {};
        recentMessages.forEach(msg => {
            const cat = msg.category || 'general';
            categories[cat] = (categories[cat] || 0) + 1;
        });
        
        return {
            summary: {
                totalMessages: recentMessages.length,
                textMessages: recentMessages.length,
                voiceMessages: 0,
                videoAnalyses: 0,
                crisisEvents: recentMessages.filter(m => m.is_crisis).length,
                dateRange: {
                    first: recentMessages[recentMessages?.length - 1]?.timestamp,
                    last: recentMessages[0]?.timestamp
                }
            },
            daily: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date)),
            categories: Object.entries(categories).map(([cat, count]) => ({ category: cat, count })),
            emotions: this.getTopEmotions(recentMessages),
            allMessages: recentMessages
        };
    },

    getTopEmotions(messages) {
        const emotions = {};
        let total = 0;
        
        messages.forEach(msg => {
            if (msg.emotions) {
                Object.entries(msg.emotions).forEach(([emotion, value]) => {
                    emotions[emotion] = (emotions[emotion] || 0) + value;
                    total += value;
                });
            }
        });
        
        return Object.entries(emotions)
            .map(([emotion, count]) => ({
                emotion,
                count: Math.round(count),
                percentage: total > 0 ? (count / total * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.count - a.count);
    },

    // ========== Користувач ==========
    setCurrentUser(userData) {
        localStorage.setItem(this.STORAGE_KEYS.CURRENT_USER, JSON.stringify(userData));
        localStorage.setItem(this.STORAGE_KEYS.USER_NAME, userData.name);
        localStorage.setItem(this.STORAGE_KEYS.USER_EMAIL, userData.email);
    },

    getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEYS.CURRENT_USER)) || {
                name: localStorage.getItem(this.STORAGE_KEYS.USER_NAME) || 'Катя',
                email: localStorage.getItem(this.STORAGE_KEYS.USER_EMAIL) || 'katyagko2004@gmail.com'
            };
        } catch {
            return {
                name: localStorage.getItem(this.STORAGE_KEYS.USER_NAME) || 'Катя',
                email: localStorage.getItem(this.STORAGE_KEYS.USER_EMAIL) || 'katyagko2004@gmail.com'
            };
        }
    }
};

// Ініціалізуємо
DataService.init();

// Для сумісності зі старим кодом
window.DataService = DataService;