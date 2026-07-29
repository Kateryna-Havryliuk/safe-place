// analytics.js - ДІАГНОСТИЧНА ВЕРСІЯ

// Глобальні змінні
let currentChart = null;
let analyticsData = null; // Зберігаємо дані для доступу з консолі

// ==================== ДІАГНОСТИКА ====================

function logAnalytics(message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] 📊 Analytics:`;
    if (data) {
        console.log(prefix, message, data);
    } else {
        console.log(prefix, message);
    }
}

// ==================== ІНІЦІАЛІЗАЦІЯ ====================

document.addEventListener('DOMContentLoaded', async () => {
    logAnalytics('Сторінка завантажена, починаємо ініціалізацію...');
    
    // Перевіряємо наявність токена
    const token = localStorage.getItem('authToken');
    logAnalytics('Токен:', token ? `${token.substring(0, 20)}...` : 'ВІДСУТНІЙ');
    
    if (!token) {
        logAnalytics('Користувач не авторизований');
        showAuthMessage();
        return;
    }
    
    // Завантажуємо дані з затримкою для гарантії готовності DOM
    setTimeout(async () => {
        await loadAnalytics();
    }, 100);
});

// ==================== ОСНОВНА ФУНКЦІЯ ЗАВАНТАЖЕННЯ ====================

async function loadAnalytics() {
    const token = localStorage.getItem('authToken');
    logAnalytics('Починаємо завантаження аналітики...');
    
    try {
        showLoading(true);
        
        // 1. ДІАГНОСТИКА - перевіряємо чи працює API взагалі
        logAnalytics('Крок 1: Діагностика повідомлень...');
        let debugData = null;
        try {
            const debugResponse = await fetch('/api/debug/messages', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            logAnalytics('Debug API статус:', debugResponse.status);
            
            if (!debugResponse.ok) {
                throw new Error(`Debug API повернув ${debugResponse.status}`);
            }
            
            debugData = await debugResponse.json();
            logAnalytics('Debug дані:', debugData);
        } catch (debugError) {
            logAnalytics('❌ Помилка debug API:', debugError.message);
            console.error(debugError);
        }
        
        // 2. РОЗШИРЕНА АНАЛІТИКА
        logAnalytics('Крок 2: Розширена аналітика...');
        let data = null;
        try {
            const response = await fetch('/api/analytics/advanced?days=30', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            logAnalytics('Advanced API статус:', response.status);
            
            if (!response.ok) {
                throw new Error(`Advanced API повернув ${response.status}`);
            }
            
            data = await response.json();
            logAnalytics('Advanced дані:', data);
        } catch (advError) {
            logAnalytics('❌ Помилка advanced API:', advError.message);
            console.error(advError);
            showError('Помилка завантаження: ' + advError.message);
            return;
        }
        
        // 3. ОБРОБКА ДАНИХ
        if (data && data.success) {
            logAnalytics('✅ Дані отримано успішно');
            
            // Синхронізація кількості повідомлень
            if (debugData && debugData.success) {
                const realCount = debugData.total_messages;
                const reportedCount = data.summary?.total_messages || 0;
                
                logAnalytics(`Порівняння: Debug=${realCount}, Advanced=${reportedCount}`);
                
                if (realCount !== reportedCount) {
                    logAnalytics('⚠️ Розбіжність! Оновлюємо дані...');
                    data.summary = data.summary || {};
                    data.summary.total_messages = realCount;
                    data.summary._note = 'Синхронізовано з debug API';
                }
            }
            
            // Генерація прогнозів, якщо їх немає
            if (!data.predictions || Object.keys(data.predictions).length === 0) {
                logAnalytics('🧠 Генеруємо прогнози на клієнті...');
                data.predictions = generateClientPredictions(data);
                data.trends = calculateClientTrends(data.daily_activity || {});
            }
            
            // Зберігаємо для доступу з консолі
            analyticsData = data;
            window.analyticsData = data; // Глобальний доступ
            
            renderAnalytics(data);
            logAnalytics('✅ Рендеринг завершено');
            
        } else {
            logAnalytics('❌ Сервер повернув помилку:', data);
            showError(data?.message || 'Невідома помилка сервера');
        }
        
    } catch (error) {
        logAnalytics('❌ Критична помилка:', error.message);
        console.error(error);
        showError('Критична помилка: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// ==================== КЛІЄНТСЬКА ГЕНЕРАЦІЯ ПРОГНОЗІВ ====================

function generateClientPredictions(data) {
    const daily = data.daily_activity || {};
    const days = Object.keys(daily).sort();
    
    logAnalytics('Генерація прогнозів, днів даних:', days.length);
    
    if (days.length === 0) {
        return {
            messages_next_week: "Недостатньо даних - потрібно мінімум 1 день активності",
            sentiment_outlook: "Продовжуйте спілкуватися для отримання прогнозів",
            _source: "client_fallback_no_data"
        };
    }
    
    // Аналіз активності
    const messagesPerDay = days.map(d => daily[d].messages || 0);
    const avgMessages = messagesPerDay.reduce((a, b) => a + b, 0) / days.length;
    const recentAvg = messagesPerDay.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, messagesPerDay.length);
    
    // Тренд
    let trend = "стабільною";
    let prediction = Math.round(avgMessages * 7); // на тиждень
    
    if (recentAvg > avgMessages * 1.3) {
        trend = "зростанням 📈";
        prediction = Math.round(recentAvg * 7 * 1.2);
    } else if (recentAvg < avgMessages * 0.7) {
        trend = "зниженням 📉";
        prediction = Math.round(recentAvg * 7 * 0.8);
    }
    
    // Аналіз настрою
    const sentiments = days.map(d => daily[d].sentiment || 0);
    const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
    const lastSentiment = sentiments[sentiments.length - 1] || 0;
    
    let moodOutlook = "стабільним 😐";
    if (lastSentiment > avgSentiment + 0.15) moodOutlook = "покращенням 😊";
    if (lastSentiment < avgSentiment - 0.15) moodOutlook = "погіршенням 😔";
    
    // Критичні ситуації
    const criticalTotal = Object.values(daily).reduce((sum, d) => sum + (d.critical || 0), 0);
    const totalMessages = data.summary?.total_messages || 1;
    const crisisRate = (criticalTotal / totalMessages * 100).toFixed(1);
    
    return {
        messages_next_week: `~${prediction} повідомлень (тренд: ${trend}, середнє: ${avgMessages.toFixed(1)}/день)`,
        sentiment_outlook: `Очікується ${moodOutlook} (середній настрій: ${(avgSentiment * 100).toFixed(0)}%)`,
        crisis_assessment: crisisRate > 5 ? `⚠️ Увага: ${crisisRate}% критичних повідомлень` : `✅ Ризик в нормі (${crisisRate}%)`,
        confidence: Math.min(0.85, 0.3 + days.length * 0.05),
        _source: "client_generated",
        _days_analyzed: days.length
    };
}

function calculateClientTrends(dailyActivity) {
    const days = Object.keys(dailyActivity).sort();
    
    if (days.length < 2) {
        return {
            message_trend: 'insufficient_data',
            sentiment_trend: 'insufficient_data',
            message_change: 0,
            severity_trend: 'unknown',
            severity_rate: 0,
            _source: 'client_fallback'
        };
    }
    
    // Розділяємо на дві половини
    const mid = Math.floor(days.length / 2);
    const first = days.slice(0, mid);
    const second = days.slice(mid);
    
    const firstMessages = first.reduce((s, d) => s + (dailyActivity[d].messages || 0), 0);
    const secondMessages = second.reduce((s, d) => s + (dailyActivity[d].messages || 0), 0);
    
    let msgTrend = 'stable';
    let msgChange = 0;
    if (firstMessages > 0) {
        msgChange = ((secondMessages - firstMessages) / firstMessages * 100);
        if (msgChange > 25) msgTrend = 'increasing';
        else if (msgChange < -25) msgTrend = 'decreasing';
    }
    
    // Настрій
    const firstSent = first.reduce((s, d) => s + (dailyActivity[d].sentiment || 0), 0) / first.length;
    const secondSent = second.reduce((s, d) => s + (dailyActivity[d].sentiment || 0), 0) / second.length;
    
    let sentTrend = 'stable';
    if (secondSent > firstSent + 0.1) sentTrend = 'improving';
    else if (secondSent < firstSent - 0.1) sentTrend = 'worsening';
    
    // Кризи
    const totalCrit = Object.values(dailyActivity).reduce((s, d) => s + (d.critical || 0), 0);
    const totalMsg = Object.values(dailyActivity).reduce((s, d) => s + (d.messages || 0), 0);
    const sevRate = totalMsg > 0 ? (totalCrit / totalMsg * 100) : 0;
    
    let sevTrend = 'minimal';
    if (sevRate > 10) sevTrend = 'high';
    else if (sevRate > 5) sevTrend = 'medium';
    else if (sevRate > 1) sevTrend = 'low';
    
    return {
        message_trend: msgTrend,
        sentiment_trend: sentTrend,
        message_change: parseFloat(msgChange.toFixed(1)),
        severity_trend: sevTrend,
        severity_rate: parseFloat(sevRate.toFixed(1)),
        _source: 'client_calculated'
    };
}

// ==================== РЕНДЕРИНГ (з покращеною діагностикою) ====================

function renderAnalytics(data) {
    logAnalytics('Починаємо рендеринг...');
    
    try {
        updateStats(data.summary);
        logAnalytics('✅ Статистика оновлена');
        
        renderEmotionChart(data.emotion_profile || []);
        logAnalytics('✅ Графік емоцій');
        
        renderDailyActivity(data.daily_activity || {});
        logAnalytics('✅ Денна активність');
        
        renderHourlyActivity(data.hourly_activity || {});
        logAnalytics('✅ Годинна активність');
        
        renderPredictions(data.predictions || {});
        logAnalytics('✅ Прогнози');
        
        renderTrends(data.trends || {});
        logAnalytics('✅ Тренди');
        
        renderRecommendations(data.recommendations || []);
        logAnalytics('✅ Рекомендації');
        
        renderCategories(data.categories || {});
        logAnalytics('✅ Категорії');
        
    } catch (error) {
        logAnalytics('❌ Помилка рендерингу:', error.message);
        console.error(error);
    }
}

function renderPredictions(predictions) {
    const container = document.getElementById('predictionsContainer');
    logAnalytics('renderPredictions:', predictions);
    
    if (!container) {
        logAnalytics('❌ Контейнер predictionsContainer не знайдено!');
        return;
    }
    
    // Перевіряємо чи є реальні дані
    const hasData = predictions && 
        (predictions.messages_next_week || predictions.sentiment_outlook);
    
    if (!hasData) {
        container.innerHTML = `
            <div class="prediction-card empty">
                <i class="fas fa-chart-line"></i>
                <div>
                    <h4>Недостатньо даних</h4>
                    <p>Мінімум потрібно 2 дні активності для прогнозів</p>
                </div>
            </div>
        `;
        return;
    }
    
    // Відображаємо прогнози
    let html = '';
    
    if (predictions.messages_next_week) {
        html += `
            <div class="prediction-card">
                <i class="fas fa-chart-line"></i>
                <div>
                    <h4>Прогноз активності</h4>
                    <p>${predictions.messages_next_week}</p>
                    ${predictions.confidence ? `<small>Надійність: ${(predictions.confidence * 100).toFixed(0)}%</small>` : ''}
                </div>
            </div>
        `;
    }
    
    if (predictions.sentiment_outlook) {
        html += `
            <div class="prediction-card">
                <i class="fas fa-smile"></i>
                <div>
                    <h4>Прогноз настрою</h4>
                    <p>${predictions.sentiment_outlook}</p>
                </div>
            </div>
        `;
    }
    
    if (predictions.crisis_assessment) {
        html += `
            <div class="prediction-card ${predictions.crisis_assessment.includes('⚠️') ? 'warning' : ''}">
                <i class="fas fa-shield-alt"></i>
                <div>
                    <h4>Оцінка ризику</h4>
                    <p>${predictions.crisis_assessment}</p>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
    logAnalytics('✅ Прогнози відрендерено');
}

// ==================== ІНШІ ФУНКЦІЇ (без змін) ====================

function showAuthMessage() {
    const container = document.getElementById('analyticsContent');
    if (container) {
        container.innerHTML = `
            <div class="auth-message">
                <i class="fas fa-lock" style="font-size: 64px; color: #e74c3c;"></i>
                <h2>Необхідна авторизація</h2>
                <p>Увійдіть в акаунт, щоб переглянути аналітику</p>
                <button onclick="window.location.href='index.html'" class="btn-primary">
                    <i class="fas fa-sign-in-alt"></i> Увійти
                </button>
            </div>
        `;
    }
}

function showLoading(show) {
    const loader = document.getElementById('loadingIndicator');
    if (loader) {
        loader.style.display = show ? 'flex' : 'none';
    }
}

function showError(message) {
    const container = document.getElementById('analyticsContent');
    if (container) {
        container.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle" style="font-size: 64px; color: #e74c3c;"></i>
                <h2>Помилка завантаження</h2>
                <p>${message}</p>
                <button onclick="location.reload()" class="btn-primary">
                    <i class="fas fa-sync-alt"></i> Спробувати знову
                </button>
            </div>
        `;
    }
}

// ==================== ПОКАЗ ПОВІДОМЛЕНЬ ====================

function showAuthMessage() {
    const container = document.getElementById('analyticsContent');
    if (container) {
        container.innerHTML = `
            <div class="auth-message">
                <i class="fas fa-lock" style="font-size: 64px; color: #e74c3c;"></i>
                <h2>Необхідна авторизація</h2>
                <p>Увійдіть в акаунт, щоб переглянути аналітику</p>
                <button onclick="window.location.href='index.html'" class="btn-primary">
                    <i class="fas fa-sign-in-alt"></i> Увійти
                </button>
            </div>
        `;
    }
}

function showLoading(show) {
    const loader = document.getElementById('loadingIndicator');
    if (loader) {
        loader.style.display = show ? 'flex' : 'none';
    }
}

function showError(message) {
    const container = document.getElementById('analyticsContent');
    if (container) {
        container.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle" style="font-size: 64px; color: #e74c3c;"></i>
                <h2>Помилка завантаження</h2>
                <p>${message}</p>
                <button onclick="location.reload()" class="btn-primary">
                    <i class="fas fa-sync-alt"></i> Спробувати знову
                </button>
            </div>
        `;
    }
}

function setupButtons() {
    const exportBtn = document.getElementById('exportDataBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportAnalytics);
    }
    
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadAnalytics());
    }
}

// ==================== ОСНОВНА ФУНКЦІЯ ЗАВАНТАЖЕННЯ ====================

// Оновлена функція завантаження аналітики
async function loadAnalytics() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        showAuthMessage();
        return;
    }
    
    try {
        showLoading(true);
        
        // Спочатку отримуємо діагностичні дані
        const debugResponse = await fetch('/api/debug/messages', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const debugData = await debugResponse.json();
        
        if (debugData.success) {
            console.log('📊 Діагностика:', debugData);
            // Оновлюємо статистику з діагностики
            const totalMessagesEl = document.getElementById('totalMessages');
            if (totalMessagesEl) {
                totalMessagesEl.textContent = debugData.total_messages;
            }
            
            // Показуємо розподіл за ролями
            const roleStatsEl = document.getElementById('roleStats');
            if (roleStatsEl && debugData.by_role) {
                const userMsgs = debugData.by_role.find(r => r.role === 'user')?.count || 0;
                const botMsgs = debugData.by_role.find(r => r.role === 'assistant')?.count || 0;
                roleStatsEl.innerHTML = `
                    <div class="stat-row">
                        <span>👤 Ви:</span>
                        <span><strong>${userMsgs}</strong> повідомлень</span>
                    </div>
                    <div class="stat-row">
                        <span>🤖 AI:</span>
                        <span><strong>${botMsgs}</strong> повідомлень</span>
                    </div>
                    <div class="stat-row">
                        <span>📊 Всього:</span>
                        <span><strong>${debugData.total_messages}</strong> повідомлень</span>
                    </div>
                `;
            }
        }
        
        // Завантажуємо розширену аналітику
        const response = await fetch('/api/analytics/advanced?days=30', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Оновлюємо кількість повідомлень з розширеної аналітики (вона має збігатися)
            if (data.summary && data.summary.total_messages !== debugData.total_messages) {
                console.warn(`⚠️ Розбіжність: advanced.total_messages=${data.summary.total_messages}, debug.total=${debugData.total_messages}`);
                // Використовуємо більшу кількість (з діагностики)
                if (data.summary) {
                    data.summary.total_messages = debugData.total_messages;
                }
            }
            
            renderAnalytics(data);
        } else {
            showError(data.message);
        }
        
    } catch (error) {
        console.error('Помилка завантаження аналітики:', error);
        showError('Помилка з\'єднання з сервером');
    } finally {
        showLoading(false);
    }
}

// ==================== РЕНДЕРИНГ АНАЛІТИКИ ====================

function renderAnalytics(data) {
    console.log('📊 Рендеринг аналітики:', data);
    
    // Оновлюємо загальну статистику
    updateStats(data.summary);
    
    // Відображаємо графік емоцій
    renderEmotionChart(data.emotion_profile || []);
    
    // Відображаємо денну активність
    renderDailyActivity(data.daily_activity || {});
    
    // Відображаємо часову активність
    renderHourlyActivity(data.hourly_activity || {});
    
    // Відображаємо прогнози
    renderPredictions(data.predictions || {});
    
    // Відображаємо тренди
    renderTrends(data.trends || {});
    
    // Відображаємо рекомендації
    renderRecommendations(data.recommendations || []);
    
    // Відображаємо категорії
    renderCategories(data.categories || {});
}

// ==================== ОНОВЛЕННЯ СТАТИСТИКИ ====================

function updateStats(summary) {
    const totalMessages = document.getElementById('totalMessages');
    const criticalMessages = document.getElementById('criticalMessages');
    const avgSentiment = document.getElementById('avgSentiment');
    const periodDays = document.getElementById('periodDays');
    
    if (totalMessages) totalMessages.textContent = summary.total_messages || 0;
    if (criticalMessages) criticalMessages.textContent = summary.critical_messages || 0;
    
    if (avgSentiment) {
        const sentiment = summary.avg_sentiment || 0;
        avgSentiment.textContent = sentiment.toFixed(2);
        
        // Додаємо клас для кольору
        if (sentiment > 0.2) {
            avgSentiment.className = 'positive';
        } else if (sentiment < -0.2) {
            avgSentiment.className = 'negative';
        } else {
            avgSentiment.className = 'neutral';
        }
    }
    
    if (periodDays) periodDays.textContent = summary.period_days || 30;
}

// ==================== ГРАФІК ЕМОЦІЙ ====================

function renderEmotionChart(emotionProfile) {
    const canvas = document.getElementById('emotionChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Підготовка даних
    const emotions = emotionProfile.map(e => e.emotion);
    const counts = emotionProfile.map(e => e.count);
    const intensities = emotionProfile.map(e => e.avg_intensity);
    
    // Українські назви емоцій
    const emotionNames = {
        'happy': 'Радість',
        'happiness': 'Радість',
        'joy': 'Радість',
        'sad': 'Сум',
        'sadness': 'Сум',
        'angry': 'Гнів',
        'anger': 'Гнів',
        'fear': 'Страх',
        'scared': 'Страх',
        'anxiety': 'Тривога',
        'anxious': 'Тривога',
        'stress': 'Стрес',
        'depression': 'Депресія',
        'neutral': 'Нейтрально',
        'calm': 'Спокій'
    };
    
    const labels = emotions.map(e => emotionNames[e] || e);
    
    // Якщо є старий графік - знищуємо
    if (currentChart) {
        currentChart.destroy();
    }
    
    // Створюємо новий графік
    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Кількість згадувань',
                    data: counts,
                    backgroundColor: 'rgba(52, 152, 219, 0.7)',
                    borderColor: '#3498db',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: 'Середня інтенсивність',
                    data: intensities,
                    type: 'line',
                    backgroundColor: 'rgba(231, 76, 60, 0)',
                    borderColor: '#e74c3c',
                    borderWidth: 2,
                    pointBackgroundColor: '#e74c3c',
                    pointBorderColor: 'white',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            let value = context.raw;
                            if (context.dataset.label === 'Середня інтенсивність') {
                                return `${label}: ${(value * 100).toFixed(0)}%`;
                            }
                            return `${label}: ${value}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Кількість згадувань'
                    }
                },
                y1: {
                    position: 'right',
                    beginAtZero: true,
                    max: 1,
                    title: {
                        display: true,
                        text: 'Інтенсивність'
                    },
                    ticks: {
                        callback: function(value) {
                            return (value * 100) + '%';
                        }
                    }
                }
            }
        }
    });
}

// ==================== ДЕННА АКТИВНІСТЬ ====================

function renderDailyActivity(dailyActivity) {
    const container = document.getElementById('dailyActivity');
    if (!container) return;
    
    const dates = Object.keys(dailyActivity).sort();
    const last7Days = dates.slice(-7);
    
    if (last7Days.length === 0) {
        container.innerHTML = '<p class="no-data">Недостатньо даних для відображення</p>';
        return;
    }
    
    const maxMessages = Math.max(...last7Days.map(d => dailyActivity[d].messages || 0), 1);
    
    const html = `
        <div class="daily-activity-bars">
            ${last7Days.map(date => {
                const dayData = dailyActivity[date];
                const messages = dayData?.messages || 0;
                const height = (messages / maxMessages * 100).toFixed(0);
                const critical = dayData?.critical || 0;
                const sentiment = dayData?.sentiment || 0;
                
                let sentimentIcon = '😐';
                if (sentiment > 0.2) sentimentIcon = '😊';
                else if (sentiment > 0) sentimentIcon = '🙂';
                else if (sentiment < -0.2) sentimentIcon = '😔';
                else if (sentiment < -0.5) sentimentIcon = '😢';
                
                const dateObj = new Date(date);
                const dayName = dateObj.toLocaleDateString('uk-UA', { weekday: 'short' });
                const dayNum = dateObj.getDate();
                
                return `
                    <div class="day-bar" title="${date}: ${messages} повідомлень, ${critical} критичних">
                        <div class="bar-fill" style="height: ${height}px; background: ${critical > 0 ? '#e74c3c' : '#3498db'}"></div>
                        <div class="day-label">
                            <span class="day-name">${dayName}</span>
                            <span class="day-num">${dayNum}</span>
                        </div>
                        <div class="sentiment-icon">${sentimentIcon}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    container.innerHTML = html;
}

// ==================== ГОДИННА АКТИВНІСТЬ ====================

function renderHourlyActivity(hourlyActivity) {
    const container = document.getElementById('hourlyActivity');
    if (!container) return;
    
    const hours = Array.from({length: 24}, (_, i) => {
        const hourKey = `${i.toString().padStart(2, '0')}:00`;
        return {
            hour: hourKey,
            count: hourlyActivity[hourKey] || 0
        };
    });
    
    const maxCount = Math.max(...hours.map(h => h.count), 1);
    
    const html = `
        <div class="hourly-bars">
            ${hours.map(({hour, count}) => {
                const height = (count / maxCount * 80).toFixed(0);
                const isActive = count > 0;
                
                return `
                    <div class="hour-bar" title="${hour}: ${count} повідомлень">
                        <div class="bar-fill" style="height: ${height}px; ${isActive ? 'background: #3498db;' : 'background: #ecf0f1;'}"></div>
                        <span class="hour-label">${hour}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    container.innerHTML = html;
}

// ==================== ПРОГНОЗИ ====================

function renderPredictions(predictions) {
    const container = document.getElementById('predictionsContainer');
    if (!container) return;
    
    if (Object.keys(predictions).length === 0) {
        container.innerHTML = `
            <div class="prediction-card empty">
                <i class="fas fa-chart-line"></i>
                <div>
                    <h4>Недостатньо даних</h4>
                    <p>Продовжуйте спілкуватися, щоб отримувати прогнози</p>
                </div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="prediction-card">
            <i class="fas fa-chart-line"></i>
            <div>
                <h4>Прогноз активності</h4>
                <p>${predictions.messages_next_week || 'Аналіз триває...'}</p>
            </div>
        </div>
        <div class="prediction-card">
            <i class="fas fa-smile"></i>
            <div>
                <h4>Прогноз настрою</h4>
                <p>${predictions.sentiment_outlook || 'Аналіз триває...'}</p>
            </div>
        </div>
    `;
}

// ==================== ТРЕНДИ ====================

function renderTrends(trends) {
    const container = document.getElementById('trendsContainer');
    if (!container) return;
    
    // Визначаємо класи та іконки
    const messageTrend = {
        'increasing': { icon: '📈', text: 'Зростає', class: 'positive' },
        'decreasing': { icon: '📉', text: 'Спадає', class: 'negative' },
        'stable': { icon: '➡️', text: 'Стабільна', class: 'neutral' },
        'insufficient_data': { icon: '❓', text: 'Недостатньо даних', class: 'neutral' }
    };
    
    const sentimentTrend = {
        'improving': { icon: '😊', text: 'Покращується', class: 'positive' },
        'worsening': { icon: '😟', text: 'Погіршується', class: 'negative' },
        'stable': { icon: '😐', text: 'Стабільний', class: 'neutral' },
        'insufficient_data': { icon: '❓', text: 'Недостатньо даних', class: 'neutral' }
    };
    
    const severityTrend = {
        'high': { icon: '⚠️', text: 'Високий', class: 'critical' },
        'medium': { icon: '⚠️', text: 'Середній', class: 'warning' },
        'low': { icon: '🔸', text: 'Низький', class: 'info' },
        'minimal': { icon: '✅', text: 'Мінімальний', class: 'success' }
    };
    
    const msgTrend = messageTrend[trends.message_trend] || messageTrend['insufficient_data'];
    const sentTrend = sentimentTrend[trends.sentiment_trend] || sentimentTrend['insufficient_data'];
    const sevTrend = severityTrend[trends.severity_trend] || severityTrend['minimal'];
    
    const messageChange = trends.message_change ? ` (${trends.message_change > 0 ? '+' : ''}${trends.message_change}%)` : '';
    const severityRate = trends.severity_rate ? ` (${trends.severity_rate}%)` : '';
    
    container.innerHTML = `
        <div class="trend-item ${msgTrend.class}">
            <span class="trend-icon">${msgTrend.icon}</span>
            <span class="trend-label">Активність:</span>
            <span class="trend-value">${msgTrend.text}${messageChange}</span>
        </div>
        <div class="trend-item ${sentTrend.class}">
            <span class="trend-icon">${sentTrend.icon}</span>
            <span class="trend-label">Настрій:</span>
            <span class="trend-value">${sentTrend.text}</span>
        </div>
        <div class="trend-item ${sevTrend.class}">
            <span class="trend-icon">${sevTrend.icon}</span>
            <span class="trend-label">Рівень криз:</span>
            <span class="trend-value">${sevTrend.text}${severityRate}</span>
        </div>
    `;
}

// ==================== РЕКОМЕНДАЦІЇ ====================

function renderRecommendations(recommendations) {
    const container = document.getElementById('recommendationsContainer');
    if (!container) return;
    
    if (!recommendations || recommendations.length === 0) {
        container.innerHTML = `
            <div class="recommendation-card general">
                <div class="recommendation-icon">💡</div>
                <div class="recommendation-content">
                    <h4>Почніть розмову</h4>
                    <p>Поділіться своїми почуттями, щоб отримувати персоналізовані рекомендації</p>
                </div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = recommendations.map(rec => `
        <div class="recommendation-card ${rec.type}">
            <div class="recommendation-icon">${rec.icon || '💡'}</div>
            <div class="recommendation-content">
                <h4>${rec.title}</h4>
                <p>${rec.description}</p>
                ${rec.priority === 'high' ? '<span class="priority-badge">⚠️ Терміново</span>' : ''}
            </div>
        </div>
    `).join('');
}

// ==================== КАТЕГОРІЇ ====================

function renderCategories(categories) {
    const container = document.getElementById('categoriesContainer');
    if (!container) return;
    
    const categoryNames = {
        'anxiety': { name: 'Тривога', icon: '😰', color: '#e67e22' },
        'depression': { name: 'Депресія', icon: '😔', color: '#3498db' },
        'stress': { name: 'Стрес', icon: '😫', color: '#e74c3c' },
        'relationships': { name: 'Відносини', icon: '💔', color: '#9b59b6' },
        'self_esteem': { name: 'Самооцінка', icon: '🌟', color: '#f1c40f' },
        'work_study': { name: 'Робота/Навчання', icon: '💼', color: '#2ecc71' },
        'sleep': { name: 'Сон', icon: '😴', color: '#1abc9c' },
        'health': { name: 'Здоров\'я', icon: '🏥', color: '#e84393' }
    };
    
    const sortedCategories = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
    
    if (sortedCategories.length === 0) {
        container.innerHTML = '<p class="no-data">Поки немає даних про категорії</p>';
        return;
    }
    
    const maxCount = sortedCategories[0][1];
    
    container.innerHTML = sortedCategories.map(([cat, count]) => {
        const catInfo = categoryNames[cat] || { name: cat, icon: '📌', color: '#95a5a6' };
        const percentage = (count / maxCount * 100).toFixed(0);
        
        return `
            <div class="category-item">
                <div class="category-header">
                    <span class="category-icon">${catInfo.icon}</span>
                    <span class="category-name">${catInfo.name}</span>
                    <span class="category-count">${count}</span>
                </div>
                <div class="category-bar-container">
                    <div class="category-bar" style="width: ${percentage}%; background: ${catInfo.color}"></div>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== РОЗШИРЕНИЙ ЕКСПОРТ ДАНИХ ====================

function setupExportButtons() {
    const exportJson = document.getElementById('exportJsonBtn');
    const exportCsv = document.getElementById('exportCsvBtn');
    const exportPdf = document.getElementById('exportPdfBtn');
    const exportExcel = document.getElementById('exportExcelBtn');
    
    if (exportJson) exportJson.addEventListener('click', () => exportAnalyticsData('json'));
    if (exportCsv) exportCsv.addEventListener('click', () => exportAnalyticsData('csv'));
    if (exportPdf) exportPdf.addEventListener('click', () => exportAnalyticsData('pdf'));
    if (exportExcel) exportExcel.addEventListener('click', () => exportAnalyticsData('excel'));
}

async function exportAnalyticsData(format) {
    if (!analyticsData) {
        showNotification('❌ Немає даних для експорту', 'error');
        return;
    }
    
    try {
        showNotification('📊 Підготовка даних...', 'info');
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `safeplace-analytics-${timestamp}`;
        
        switch(format) {
            case 'json':
                exportToJSON(analyticsData, filename);
                break;
            case 'csv':
                exportToCSV(analyticsData, filename);
                break;
            case 'pdf':
                await exportToPDF(analyticsData, filename);
                break;
            case 'excel':
                exportToExcel(analyticsData, filename);
                break;
            default:
                showNotification('❌ Невідомий формат', 'error');
        }
    } catch (error) {
        console.error('Помилка експорту:', error);
        showNotification('❌ Помилка: ' + error.message, 'error');
    }
}

function exportToJSON() {
    if (!analyticsData) {
        showNotification('❌ Немає даних для експорту', 'error');
        return;
    }
    
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}_${now.getHours()}-${now.getMinutes()}`;
    const filename = `safeplace_analytics_${timestamp}.json`;
    
    const exportData = {
        metadata: {
            exportDate: now.toISOString(),
            source: 'SafePlace',
            period: '30 днів'
        },
        summary: analyticsData.summary || {},
        daily_stats: analyticsData.daily_activity || {},
        categories: analyticsData.categories || {},
        predictions: analyticsData.predictions || {}
    };
    
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    downloadFile(blob, filename);  // Використовуємо downloadFile
    showNotification('✅ JSON експортовано', 'success');
}

function exportToCSV() {
    if (!analyticsData) {
        showNotification('❌ Немає даних для експорту', 'error');
        return;
    }
    
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
    const filename = `safeplace_analytics_${timestamp}.csv`;
    
    let csvRows = [['Дата', 'Повідомлень', 'Критичних', 'Настрій (%)']];
    
    const daily = analyticsData.daily_activity || {};
    const dates = Object.keys(daily).sort().reverse();
    
    for (const date of dates) {
        const dayData = daily[date];
        const sentimentPercent = ((dayData.sentiment || 0) * 100).toFixed(0);
        csvRows.push([date, dayData.messages || 0, dayData.critical || 0, sentimentPercent + '%']);
    }
    
    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadFile(blob, filename);  // Використовуємо downloadFile
    showNotification('✅ CSV експортовано', 'success');
}

// ==================== ВИПРАВЛЕНА ФУНКЦІЯ EXCEL ====================

function exportToExcel() {
    console.log('📊 Запуск експорту в Excel...');
    
    if (!analyticsData) {
        showNotification('❌ Немає даних для експорту', 'error');
        return;
    }
    
    try {
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
        const filename = `safeplace_analytics_${timestamp}.xls`;
        
        const daily = analyticsData.daily_activity || {};
        const dates = Object.keys(daily).sort().reverse();
        
        // Створюємо HTML для Excel
        let html = `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>SafePlace Analytics Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #667eea; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                th { background: #667eea; color: white; padding: 10px; border: 1px solid #ddd; }
                td { padding: 8px; border: 1px solid #ddd; }
            </style>
        </head>
        <body>
            <h1>📊 SafePlace - Аналітичний звіт</h1>
            <p><strong>Дата генерації:</strong> ${new Date().toLocaleString('uk-UA')}</p>
            
            <h2>Загальна статистика</h2>
            <table border="1">
                <tr><th>Показник</th><th>Значення</th></tr>
                <tr><td>Всього повідомлень</td><td><b>${analyticsData.summary?.total_messages || 0}</b></td></tr>
                <tr><td>Критичних повідомлень</td><td><b>${analyticsData.summary?.critical_messages || 0}</b></td></tr>
                <tr><td>Середній настрій</td><td><b>${((analyticsData.summary?.avg_sentiment || 0) * 100).toFixed(0)}%</b></td></tr>
                <tr><td>Днів активності</td><td><b>${Object.keys(daily).length}</b></td></tr>
            </table>
            
            <h2>Денна активність</h2>
            <table border="1">
                <thead>
                    <tr><th>Дата</th><th>Повідомлень</th><th>Критичних</th><th>Настрій</th></tr>
                </thead>
                <tbody>`;
        
        for (const date of dates.slice(0, 30)) {
            const dayData = daily[date];
            if (dayData) {
                const sentimentPercent = ((dayData.sentiment || 0) * 100).toFixed(0);
                html += `<tr>
                            <td>${date}</td>
                            <td>${dayData.messages || 0}</td>
                            <td>${dayData.critical || 0}</td>
                            <td>${sentimentPercent}%</td>
                         </tr>`;
            }
        }
        
        html += `</tbody>
            </table>
            
            <h2>Теми розмов</h2>
            <table border="1">
                <thead><tr><th>Категорія</th><th>Кількість</th></tr></thead>
                <tbody>`;
        
        const categories = analyticsData.categories || {};
        for (const [cat, count] of Object.entries(categories).sort((a,b) => b[1] - a[1])) {
            html += `<tr><td>${cat}</td><td>${count}</td></tr>`;
        }
        
        html += `</tbody>
            </table>
            
            <h2>Прогнози AI</h2>
            <table border="1">
                <tr><td><b>Прогноз активності</b></td><td>${analyticsData.predictions?.messages_next_week || 'Н/Д'}</td></tr>
                <tr><td><b>Прогноз настрою</b></td><td>${analyticsData.predictions?.sentiment_outlook || 'Н/Д'}</td></tr>
                <tr><td><b>Оцінка ризику</b></td><td>${analyticsData.predictions?.crisis_risk || 'Н/Д'}</td></tr>
            </table>
            
            <p style="margin-top: 30px; color: #666;">Згенеровано SafePlace</p>
        </body>
        </html>`;
        
        // Завантажуємо файл
        const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
        downloadFile(blob, filename);  // Використовуємо downloadFile
        showNotification('✅ Excel файл завантажено!', 'success');
        
    } catch (error) {
        console.error('Excel помилка:', error);
        showNotification('❌ Помилка: ' + error.message, 'error');
    }
}

// ==================== СПОВІЩЕННЯ ====================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#2ecc71' : '#e74c3c'};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== ФУНКЦІЯ ДЛЯ ЗАВАНТАЖЕННЯ ФАЙЛІВ ====================

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ==================== ФУНКЦІЯ ДЛЯ СПОВІЩЕНЬ ====================

function showNotification(message, type = 'info') {
    const colors = { success: '#2ecc71', error: '#e74c3c', info: '#3498db' };
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${colors[type] || colors.info};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        font-size: 14px;
        animation: slideIn 0.3s ease;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}