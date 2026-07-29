// Функціонал сторінки акаунта

// Функціонал сторінки акаунта

class AccountApp {
    constructor() {
        this.API_BASE = 'http://127.0.0.1:5003/api';
        this.analyticsData = null;
        this.init();
    }

    init() {
        this.loadElements();
        this.bindEvents();
        this.setupAuthModal();
        this.checkAuthStatus();
        this.setupAvatarUpload();
        console.log('Account app initialized');
    }

    loadElements() {
        this.elements = {
            loginPrompt: document.getElementById('loginPrompt'),
            accountDetails: document.getElementById('accountDetails'),
            userAvatarLarge: document.getElementById('userAvatarLarge'),
            userNameDisplay: document.getElementById('userNameDisplay'),
            userEmailDisplay: document.getElementById('userEmailDisplay'),
            joinDate: document.getElementById('joinDate'),
            totalMessagesStat: document.getElementById('totalMessagesStat'),
            sessionCount: document.getElementById('sessionCount'),
            wellnessScore: document.getElementById('wellnessScore'),
            profileName: document.getElementById('profileName'),
            profileEmail: document.getElementById('profileEmail'),
            updateProfileBtn: document.getElementById('updateProfileBtn'),
            clearHistoryBtn: document.getElementById('clearHistoryBtn'),
            deleteAccountBtn: document.getElementById('deleteAccountBtn'),
            authModal: document.getElementById('authModal'),
            themeToggle: document.getElementById('themeToggle'),
            editAvatarBtn: document.querySelector('.edit-avatar-btn'),
            avatarUpload: null
        };
    }

    // ==================== ОТРИМАННЯ РЕАЛЬНИХ ДАНИХ З API ====================

    async loadRealStats() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.log('No token found');
            return null;
        }
        
        try {
            console.log('🔄 Завантаження реальних даних з API...');
            
            // 1. Отримуємо дані з debug API (найточніші)
            const debugResponse = await fetch(`${this.API_BASE}/debug/messages`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            let debugData = null;
            if (debugResponse.ok) {
                debugData = await debugResponse.json();
                console.log('✅ Debug data:', debugData);
            }
            
            // 2. Отримуємо розширену аналітику
            const analyticsResponse = await fetch(`${this.API_BASE}/analytics/advanced?days=30`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            let analyticsData = null;
            if (analyticsResponse.ok) {
                analyticsData = await analyticsResponse.json();
                console.log('✅ Analytics data:', analyticsData);
                if (analyticsData.success) {
                    this.analyticsData = analyticsData;
                }
            }
            
            // Витягуємо реальні значення
            let totalMessages = 0;
            let criticalMessages = 0;
            let avgSentiment = 0;
            let sessionCount = 0;
            
            // Пріоритет: debug API (найточніше)
            if (debugData && debugData.success) {
                totalMessages = debugData.total_messages || 0;
                criticalMessages = debugData.critical_messages || 0;
                console.log(`📊 Debug API: ${totalMessages} повідомлень, ${criticalMessages} критичних`);
            }
            
            // Якщо debug не дав результатів, беремо з analytics
            if (totalMessages === 0 && analyticsData && analyticsData.success && analyticsData.summary) {
                totalMessages = analyticsData.summary.total_messages || 0;
                criticalMessages = analyticsData.summary.critical_messages || 0;
                avgSentiment = analyticsData.summary.avg_sentiment || 0;
                console.log(`📊 Analytics API: ${totalMessages} повідомлень`);
            }
            
            // Розрахунок кількості сесій (унікальних днів активності)
            if (analyticsData && analyticsData.success && analyticsData.daily_activity) {
                sessionCount = Object.keys(analyticsData.daily_activity).length;
                console.log(`📊 Днів активності: ${sessionCount}`);
            }
            
            // Розрахунок показника благополуччя на основі реальних даних
            let wellnessScore = 65;
            if (totalMessages > 0) {
                const criticalRate = (criticalMessages / totalMessages) * 100;
                // Якщо є середній настрій, використовуємо його
                if (avgSentiment !== 0) {
                    const sentimentScore = (avgSentiment + 1) * 50;
                    const criticalPenalty = Math.min(40, criticalRate);
                    wellnessScore = Math.max(0, Math.min(100, Math.round(sentimentScore - criticalPenalty)));
                } else {
                    // Без настрою, тільки на основі критичних
                    wellnessScore = Math.max(0, Math.min(100, Math.round(80 - criticalRate)));
                }
            }
            
            // ОНОВЛЮЄМО UI
            if (this.elements.totalMessagesStat) {
                this.elements.totalMessagesStat.textContent = totalMessages;
                console.log(`📊 Оновлено totalMessagesStat: ${totalMessages}`);
            }
            
            if (this.elements.sessionCount) {
                this.elements.sessionCount.textContent = sessionCount;
                console.log(`📊 Оновлено sessionCount: ${sessionCount}`);
            }
            
            if (this.elements.wellnessScore) {
                this.elements.wellnessScore.textContent = `${wellnessScore}%`;
                console.log(`📊 Оновлено wellnessScore: ${wellnessScore}%`);
            }
            
            return { totalMessages, criticalMessages, avgSentiment, wellnessScore, sessionCount };
            
        } catch (error) {
            console.error('❌ Error loading real stats:', error);
            return null;
        }
    }

    // ==================== PDF ЕКСПОРТ ====================
    
    async exportToPDF() {
        // Завантажуємо актуальні дані перед експортом
        await this.loadRealStats();
        
        if (!this.analyticsData) {
            this.showAlert('❌ Немає даних для експорту. Зачекайте...', 'error');
            return;
        }
        
        this.showAlert('📄 Підготовка звіту...', 'info');
        
        const printWindow = window.open('', '_blank');
        const daily = this.analyticsData?.daily_activity || {};
        const last30Days = Object.keys(daily).sort().reverse().slice(0, 30);
        
        const formatDate = (date) => {
            const d = new Date(date);
            return d.toLocaleDateString('uk-UA');
        };
        
        const getCategoryName = (cat) => {
            const names = {
                'anxiety': 'Тривога', 'depression': 'Депресія', 'stress': 'Стрес',
                'relationships': 'Відносини', 'work_study': 'Робота/Навчання',
                'self_esteem': 'Самооцінка', 'sleep': 'Сон', 'health': 'Здоров\'я'
            };
            return names[cat] || cat;
        };
        
        const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const totalMessages = this.elements.totalMessagesStat?.textContent || 0;
        const sessionCount = this.elements.sessionCount?.textContent || 0;
        const wellnessScore = this.elements.wellnessScore?.textContent || '0%';
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>SafePlace - Аналітичний звіт</title>
                <style>
                    body {
                        font-family: 'Segoe UI', Arial, sans-serif;
                        padding: 40px;
                        margin: 0;
                        color: #333;
                    }
                    @media print {
                        body { padding: 20px; }
                        .no-print { display: none; }
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 30px;
                        padding-bottom: 20px;
                        border-bottom: 3px solid #667eea;
                    }
                    .header h1 { color: #667eea; margin: 0; }
                    .header p { color: #666; margin: 5px 0 0; }
                    .stats-grid {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 15px;
                        margin-bottom: 30px;
                    }
                    .stat-card {
                        background: #f8f9fa;
                        padding: 15px;
                        border-radius: 10px;
                        text-align: center;
                        border: 1px solid #dee2e6;
                    }
                    .stat-value {
                        font-size: 28px;
                        font-weight: bold;
                        color: #667eea;
                    }
                    .stat-label {
                        font-size: 12px;
                        color: #666;
                        margin-top: 5px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 20px;
                    }
                    th, td {
                        border: 1px solid #dee2e6;
                        padding: 10px;
                        text-align: left;
                    }
                    th {
                        background: #667eea;
                        color: white;
                    }
                    h2 {
                        color: #667eea;
                        margin-top: 30px;
                        margin-bottom: 15px;
                        font-size: 18px;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 50px;
                        padding-top: 20px;
                        border-top: 1px solid #dee2e6;
                        font-size: 12px;
                        color: #999;
                    }
                    .predictions-box {
                        background: #f0f4ff;
                        padding: 20px;
                        border-radius: 10px;
                        margin: 20px 0;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📊 SafePlace - Аналітичний звіт</h1>
                    <p>Користувач: ${user.name || 'Користувач'} | ${user.email || ''}</p>
                    <p>Дата генерації: ${new Date().toLocaleString('uk-UA')}</p>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${totalMessages}</div>
                        <div class="stat-label">Всього повідомлень</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${this.analyticsData?.summary?.critical_messages || 0}</div>
                        <div class="stat-label">Критичних</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${((this.analyticsData?.summary?.avg_sentiment || 0) * 100).toFixed(0)}%</div>
                        <div class="stat-label">Середній настрій</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${sessionCount}</div>
                        <div class="stat-label">Днів активності</div>
                    </div>
                </div>
                
                <h2>📅 Денна активність</h2>
                <table>
                    <thead>
                        <tr><th>Дата</th><th>Повідомлень</th><th>Критичних</th><th>Настрій</th></tr>
                    </thead>
                    <tbody>
                        ${last30Days.map(date => {
                            const d = daily[date];
                            if (!d) return '';
                            return `<tr>
                                <td>${formatDate(date)}</td>
                                <td>${d.messages || 0}</td>
                                <td>${d.critical || 0}</td>
                                <td>${((d.sentiment || 0) * 100).toFixed(0)}%</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                
                <div class="predictions-box">
                    <h2 style="margin-top: 0;">🔮 AI Прогнози</h2>
                    <p><strong>Прогноз активності:</strong> ${this.analyticsData?.predictions?.messages_next_week || 'Немає даних'}</p>
                    <p><strong>Прогноз настрою:</strong> ${this.analyticsData?.predictions?.sentiment_outlook || 'Немає даних'}</p>
                    ${this.analyticsData?.predictions?.crisis_assessment ? `<p><strong>Оцінка ризику:</strong> ${this.analyticsData.predictions.crisis_assessment}</p>` : ''}
                </div>
                
                <h2>🏷️ Теми розмов</h2>
                <tr>
                    <thead><tr><th>Категорія</th><th>Кількість</th></tr></thead>
                    <tbody>
                        ${Object.entries(this.analyticsData?.categories || {})
                            .sort((a,b) => b[1] - a[1])
                            .slice(0, 8)
                            .map(([cat, count]) => `<tr><td>${getCategoryName(cat)}</td><td>${count}</td></tr>`)
                            .join('')}
                    </tbody>
                </table>
                
                <div class="footer">
                    <p>Згенеровано SafePlace - Платформа психологічної підтримки</p>
                </div>
                
                <div class="no-print" style="text-align: center; margin-top: 30px;">
                    <button onclick="window.print(); setTimeout(() => window.close(), 1000);" 
                            style="background: #667eea; color: white; border: none; padding: 12px 30px; 
                                   border-radius: 8px; font-size: 16px; cursor: pointer;">
                        🖨️ Зберегти як PDF
                    </button>
                </div>
            </body>
            </html>
        `;
        
        printWindow.document.write(html);
        printWindow.document.close();
        this.showAlert('✅ Звіт відкрито. Натисніть "Зберегти як PDF"', 'success');
    }

    // ==================== ОНОВЛЕННЯ showExportModal ====================
    
    showExportModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.innerHTML = `
            <div class="modal export-modal">
                <div class="modal-header">
                    <h3 class="modal-title">Експорт даних</h3>
                    <button class="modal-close" id="exportModalClose">&times;</button>
                </div>
                <div class="section-content">
                    <div class="form-group">
                        <label for="exportFormat">Формат експорту</label>
                        <select id="exportFormat" class="profile-input">
                            <option value="json">JSON (повний)</option>
                            <option value="csv">CSV (таблиці)</option>
                            <option value="txt">TXT (текст)</option>
                            <option value="pdf">PDF (звіт)</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>Що експортувати</label>
                        <div class="export-options">
                            <label class="toggle-label">
                                <input type="checkbox" id="exportProfile" checked>
                                <span class="toggle-slider"></span>
                                <span class="toggle-text">Профіль</span>
                            </label>
                            <label class="toggle-label">
                                <input type="checkbox" id="exportStats" checked>
                                <span class="toggle-slider"></span>
                                <span class="toggle-text">Статистика</span>
                            </label>
                            <label class="toggle-label">
                                <input type="checkbox" id="exportChats" checked>
                                <span class="toggle-slider"></span>
                                <span class="toggle-text">Чати</span>
                            </label>
                            <label class="toggle-label">
                                <input type="checkbox" id="exportAnalytics" checked>
                                <span class="toggle-slider"></span>
                                <span class="toggle-text">Аналітика</span>
                            </label>
                        </div>
                    </div>

                    <div class="export-preview">
                        <h4>Попередній перегляд:</h4>
                        <div class="preview-stats">
                            <div class="preview-stat">
                                <span class="stat-value">${this.elements.totalMessagesStat?.textContent || '0'}</span>
                                <span class="stat-label">повід.</span>
                            </div>
                            <div class="preview-stat">
                                <span class="stat-value">${this.elements.sessionCount?.textContent || '0'}</span>
                                <span class="stat-label">сесій</span>
                            </div>
                            <div class="preview-stat">
                                <span class="stat-value">${this.elements.wellnessScore?.textContent || '0%'}</span>
                                <span class="stat-label">здоров'я</span>
                            </div>
                        </div>
                    </div>

                    <div class="modal-actions">
                        <button class="btn-primary" id="startExportBtn">
                            <i class="fas fa-download"></i>
                            Експортувати
                        </button>
                        <button class="btn-login" id="cancelExportBtn">Скасувати</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('exportModalClose').addEventListener('click', () => modal.remove());
        document.getElementById('cancelExportBtn').addEventListener('click', () => modal.remove());
        document.getElementById('startExportBtn').addEventListener('click', async () => {
            const format = document.getElementById('exportFormat').value;
            
            if (format === 'pdf') {
                await this.exportToPDF();
                modal.remove();
                return;
            }
            
            const options = {
                profile: document.getElementById('exportProfile').checked,
                stats: document.getElementById('exportStats').checked,
                chats: document.getElementById('exportChats').checked,
                analytics: document.getElementById('exportAnalytics').checked
            };
            this.performExport(format, options);
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // ==================== Оновлення checkAuthStatus ====================
    
    checkAuthStatus() {
        const user = localStorage.getItem('currentUser');
        const token = localStorage.getItem('authToken');

        if (user && token) {
            this.showAccountDetails(JSON.parse(user));
            // Завантажуємо реальну статистику з БД
            this.loadRealStats();
        } else {
            this.showLoginPrompt();
        }
    }

    // ==================== ІНШІ МЕТОДИ ====================
    
    setupAvatarUpload() {
        this.elements.avatarUpload = document.createElement('input');
        this.elements.avatarUpload.type = 'file';
        this.elements.avatarUpload.accept = 'image/*';
        this.elements.avatarUpload.style.display = 'none';
        document.body.appendChild(this.elements.avatarUpload);

        this.elements.avatarUpload.addEventListener('change', (e) => this.handleAvatarUpload(e));
        
        if (this.elements.editAvatarBtn) {
            this.elements.editAvatarBtn.addEventListener('click', () => {
                this.elements.avatarUpload.click();
            });
        }
    }

    async handleAvatarUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            this.showAlert('Будь ласка, виберіть зображення', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            this.showAlert('Розмір зображення не повинен перевищувати 5MB', 'error');
            return;
        }

        try {
            this.showAlert('Завантаження аватарки...', 'info');
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const imageUrl = e.target.result;
                this.updateAvatarDisplay(imageUrl);
                this.saveAvatarToStorage(imageUrl);
                this.showAlert('Аватарку успішно оновлено!', 'success');
            };
            reader.readAsDataURL(file);
            
        } catch (error) {
            console.error('Error uploading avatar:', error);
            this.showAlert('Помилка завантаження аватарки', 'error');
        }
    }

    updateAvatarDisplay(imageUrl) {
        const avatarImg = document.createElement('img');
        avatarImg.src = imageUrl;
        avatarImg.alt = 'Аватар користувача';
        avatarImg.style.width = '100%';
        avatarImg.style.height = '100%';
        avatarImg.style.borderRadius = '50%';
        avatarImg.style.objectFit = 'cover';

        this.elements.userAvatarLarge.innerHTML = '';
        this.elements.userAvatarLarge.appendChild(avatarImg);
        this.updateHeaderAvatar(imageUrl);
        this.updateMobileAvatar(imageUrl);
    }

    updateHeaderAvatar(imageUrl) {
        const headerAvatar = document.getElementById('headerUserAvatar');
        if (headerAvatar) {
            headerAvatar.innerHTML = '';
            headerAvatar.style.background = 'transparent';
            const headerImg = document.createElement('img');
            headerImg.src = imageUrl;
            headerImg.alt = 'Аватар';
            headerImg.style.width = '100%';
            headerImg.style.height = '100%';
            headerImg.style.borderRadius = '50%';
            headerImg.style.objectFit = 'cover';
            headerAvatar.appendChild(headerImg);
        }
    }

    updateMobileAvatar(imageUrl) {
        const mobileAvatar = document.getElementById('mobileUserAvatar');
        if (mobileAvatar) {
            const avatarDiv = mobileAvatar.querySelector('.user-avatar');
            if (avatarDiv) {
                avatarDiv.innerHTML = '';
                avatarDiv.style.background = 'transparent';
                const mobileImg = document.createElement('img');
                mobileImg.src = imageUrl;
                mobileImg.alt = 'Аватар';
                mobileImg.style.width = '100%';
                mobileImg.style.height = '100%';
                mobileImg.style.borderRadius = '50%';
                mobileImg.style.objectFit = 'cover';
                avatarDiv.appendChild(mobileImg);
            }
        }
    }

    saveAvatarToStorage(imageUrl) {
        const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
        user.avatar = imageUrl;
        localStorage.setItem('currentUser', JSON.stringify(user));
        localStorage.setItem('userAvatar', imageUrl);
        
        // Сповіщаємо інші сторінки
        console.log('💾 Аватар збережено в localStorage');
        window.dispatchEvent(new StorageEvent('storage', {
            key: 'userAvatar',
            newValue: imageUrl
        }));
    }

    loadAvatarFromStorage() {
        const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
        if (user.avatar) {
            this.updateAvatarDisplay(user.avatar);
        }
    }

    async performExport(format, options) {
        try {
            this.showAlert('Підготовка даних для експорту...', 'info');
            
            const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
            
            // Отримуємо реальні дані для експорту
            await this.loadRealStats();
            
            const exportData = {
                metadata: {
                    exportDate: new Date().toISOString(),
                    source: 'SafePlace',
                    user: user.name || 'Користувач'
                },
                profile: options.profile ? {
                    name: user.name,
                    email: user.email,
                    joinDate: this.getJoinDate()
                } : null,
                statistics: options.stats ? {
                    totalMessages: this.elements.totalMessagesStat?.textContent || '0',
                    sessionCount: this.elements.sessionCount?.textContent || '0',
                    wellnessScore: this.elements.wellnessScore?.textContent || '0%'
                } : null,
                analytics: options.analytics && this.analyticsData ? this.analyticsData.summary : null
            };
            
            let dataBlob, filename;

            switch (format) {
                case 'csv':
                    const csvData = this.convertToCSV(exportData);
                    dataBlob = new Blob(['\uFEFF' + csvData], { type: 'text/csv;charset=utf-8;' });
                    filename = `safeplace_data_${user.name || 'user'}_${new Date().toISOString().split('T')[0]}.csv`;
                    break;
                    
                case 'txt':
                    const txtData = this.convertToTXT(exportData);
                    dataBlob = new Blob([txtData], { type: 'text/plain;charset=utf-8' });
                    filename = `safeplace_report_${user.name || 'user'}_${new Date().toISOString().split('T')[0]}.txt`;
                    break;
                    
                case 'json':
                default:
                    const dataStr = JSON.stringify(exportData, null, 2);
                    dataBlob = new Blob([dataStr], { type: 'application/json' });
                    filename = `safeplace_export_${user.name || 'user'}_${new Date().toISOString().split('T')[0]}.json`;
            }

            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 1000);
            
            this.showAlert(`Дані успішно експортовано у форматі ${format.toUpperCase()}!`, 'success');
            
        } catch (error) {
            console.error('Export error:', error);
            this.showAlert('Помилка експорту даних', 'error');
        }
    }

    convertToTXT(data) {
        let txt = '='.repeat(50) + '\n';
        txt += 'SafePlace - Звіт про психологічне благополуччя\n';
        txt += '='.repeat(50) + '\n\n';
        txt += `Дата експорту: ${new Date().toLocaleString('uk-UA')}\n\n`;
        
        if (data.profile) {
            txt += `Ім'я: ${data.profile.name}\n`;
            txt += `Email: ${data.profile.email}\n`;
            txt += `Учасник з: ${data.profile.joinDate}\n\n`;
        }
        
        if (data.statistics) {
            txt += 'СТАТИСТИКА:\n';
            txt += `- Повідомлень: ${data.statistics.totalMessages}\n`;
            txt += `- Сесій: ${data.statistics.sessionCount}\n`;
            txt += `- Благополуччя: ${data.statistics.wellnessScore}\n\n`;
        }
        
        txt += '\n' + '='.repeat(50) + '\n';
        txt += 'Згенеровано SafePlace\n';
        return txt;
    }

    convertToCSV(data) {
        let csv = 'SafePlace - Експорт даних\n\n';
        
        if (data.profile) {
            csv += `Ім'я,${data.profile.name}\n`;
            csv += `Email,${data.profile.email}\n`;
            csv += `Дата реєстрації,${data.profile.joinDate}\n\n`;
        }
        
        if (data.statistics) {
            csv += `Повідомлень,${data.statistics.totalMessages}\n`;
            csv += `Сесій,${data.statistics.sessionCount}\n`;
            csv += `Благополуччя,${data.statistics.wellnessScore}\n`;
        }
        
        return csv;
    }


    setupAuthModal() {
        // Елементи управління модальним вікном автентифікації
        const modalClose = document.getElementById('modalClose');
        const authTabs = document.querySelectorAll('.auth-tab');
        const switchToRegister = document.getElementById('switchToRegister');
        const switchToLogin = document.getElementById('switchToLogin');
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');

        // Закриття модального вікна
        if (modalClose) {
            modalClose.addEventListener('click', () => this.closeAuthModal());
        }

        // Закриття модального вікна по кліку на оверлей
        if (this.elements.authModal) {
            this.elements.authModal.addEventListener('click', (e) => {
                if (e.target === this.elements.authModal) {
                    this.closeAuthModal();
                }
            });
        }

        // Перемикання вкладок
        if (authTabs) {
            authTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const tabId = tab.getAttribute('data-tab');
                    this.switchAuthTab(tabId);
                });
            });
        }

        // Посилання перемикання
        if (switchToRegister) {
            switchToRegister.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchAuthTab('register');
            });
        }

        if (switchToLogin) {
            switchToLogin.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchAuthTab('login');
            });
        }

        // Відправка форм
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        if (registerForm) {
            registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        }
    }

    bindEvents() {
        // Оновлення профілю
        if (this.elements.updateProfileBtn) {
            this.elements.updateProfileBtn.addEventListener('click', (e) => this.updateProfile(e));
        }

        // Дії в зоні небезпеки
        if (this.elements.clearHistoryBtn) {
            this.elements.clearHistoryBtn.addEventListener('click', () => this.clearChatHistory());
        }

        if (this.elements.deleteAccountBtn) {
            this.elements.deleteAccountBtn.addEventListener('click', () => this.deleteAccount());
        }

        // Перемикання теми
        if (this.elements.themeToggle) {
            this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Кнопки автентифікації в підказці входу
        const loginBtns = document.querySelectorAll('.btn-login');
        const registerBtns = document.querySelectorAll('.btn-register');

        loginBtns.forEach(btn => {
            btn.addEventListener('click', () => this.openAuthModal('login'));
        });

        registerBtns.forEach(btn => {
            btn.addEventListener('click', () => this.openAuthModal('register'));
        });
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }

    openAuthModal(tab = 'login') {
        if (this.elements.authModal) {
            this.elements.authModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            this.switchAuthTab(tab);
        }
    }

    closeAuthModal() {
        if (this.elements.authModal) {
            this.elements.authModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    }

    switchAuthTab(tabId) {
        const authTabs = document.querySelectorAll('.auth-tab');
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const modalTitle = document.getElementById('modalTitle');

        authTabs.forEach(t => t.classList.remove('active'));
        if (loginForm) loginForm.classList.remove('active');
        if (registerForm) registerForm.classList.remove('active');

        const activeTab = document.querySelector(`[data-tab="${tabId}"]`);
        if (activeTab) activeTab.classList.add('active');

        if (tabId === 'login') {
            if (loginForm) loginForm.classList.add('active');
            if (modalTitle) modalTitle.textContent = 'Увійти в акаунт';
        } else {
            if (registerForm) registerForm.classList.add('active');
            if (modalTitle) modalTitle.textContent = 'Створити акаунт';
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value.trim().toLowerCase();
        const password = document.getElementById('loginPassword').value;
        const submitBtn = document.getElementById('loginSubmitBtn');

        if (!email || !password) {
            this.showAlert('Будь ласка, заповніть всі поля', 'error');
            return;
        }

        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Вхід...';
        submitBtn.disabled = true;

        try {
            const result = await this.apiRequest('/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            if (result.success) {
                this.handleSuccessfulLogin(result);
            } else {
                this.showAlert(result.message || 'Помилка входу', 'error');
            }
        } catch (error) {
            this.showAlert('Помилка з\'єднання з сервером', 'error');
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const name = document.getElementById('registerName').value.trim();
        const email = document.getElementById('registerEmail').value.trim().toLowerCase();
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirm').value;
        const submitBtn = document.getElementById('registerSubmitBtn');

        // Валідація
        if (!name || !email || !password) {
            this.showAlert('Будь ласка, заповніть всі поля', 'error');
            return;
        }

        if (password !== confirmPassword) {
            this.showAlert('Паролі не співпадають', 'error');
            return;
        }

        if (password.length < 6) {
            this.showAlert('Пароль повинен містити щонайменше 6 символів', 'error');
            return;
        }

        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Реєстрація...';
        submitBtn.disabled = true;

        try {
            const result = await this.apiRequest('/register', {
                method: 'POST',
                body: JSON.stringify({ email, password, name })
            });

            if (result.success) {
                this.showAlert('Реєстрація успішна! Тепер ви можете увійти в систему.', 'success');
                this.switchAuthTab('login');
                document.getElementById('registerForm').reset();
            } else {
                this.showAlert(result.message || 'Помилка реєстрації', 'error');
            }
        } catch (error) {
            this.showAlert('Помилка з\'єднання з сервером', 'error');
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    handleSuccessfulLogin(result) {
        // Збереження даних автентифікації
        localStorage.setItem('authToken', result.token);
        localStorage.setItem('currentUser', JSON.stringify(result.user));
        
        this.showAlert('Вхід успішний!', 'success');
        
        // Оновлення UI
        this.showAccountDetails(result.user);
        
        // Закриття модального вікна після успішного входу
        setTimeout(() => {
            this.closeAuthModal();
        }, 1500);
    }

    checkAuthStatus() {
        const user = localStorage.getItem('currentUser');
        const token = localStorage.getItem('authToken');

        if (user && token) {
            this.showAccountDetails(JSON.parse(user));
        } else {
            this.showLoginPrompt();
        }
    }

    showLoginPrompt() {
        if (this.elements.loginPrompt) {
            this.elements.loginPrompt.style.display = 'block';
        }
        if (this.elements.accountDetails) {
            this.elements.accountDetails.style.display = 'none';
        }
    }

    showAccountDetails(user) {
        if (this.elements.loginPrompt) {
            this.elements.loginPrompt.style.display = 'none';
        }
        if (this.elements.accountDetails) {
            this.elements.accountDetails.style.display = 'block';
        }

        // Оновлення інформації про користувача
        if (this.elements.userAvatarLarge) {
            // Перевірка, чи є у користувача аватарка в сховищі
            this.loadAvatarFromStorage();
        }
        if (this.elements.userNameDisplay) {
            this.elements.userNameDisplay.textContent = user.name;
        }
        if (this.elements.userEmailDisplay) {
            this.elements.userEmailDisplay.textContent = user.email;
        }
        if (this.elements.profileName) {
            this.elements.profileName.value = user.name;
        }
        if (this.elements.profileEmail) {
            this.elements.profileEmail.value = user.email;
        }

        // Встановлення дати приєднання
        if (this.elements.joinDate) {
            this.elements.joinDate.textContent = this.getJoinDate();
        }

        // Завантаження статистики користувача
        this.loadUserStats();
    }

    async loadUserStats() {
        try {
            // Використання реальних даних замість тестових
            const realStats = this.getRealStats();
            
            if (this.elements.totalMessagesStat) {
                this.elements.totalMessagesStat.textContent = realStats.totalMessages;
            }
            if (this.elements.sessionCount) {
                this.elements.sessionCount.textContent = realStats.sessionCount;
            }
            if (this.elements.wellnessScore) {
                this.elements.wellnessScore.textContent = realStats.wellnessScore;
            }
        } catch (error) {
            console.error('Error loading user stats:', error);
            // Запасний варіант з тестовими даними
            if (this.elements.totalMessagesStat) {
                this.elements.totalMessagesStat.textContent = '47';
            }
            if (this.elements.sessionCount) {
                this.elements.sessionCount.textContent = '12';
            }
            if (this.elements.wellnessScore) {
                this.elements.wellnessScore.textContent = '72%';
            }
        }
    }

    async updateProfile(e) {
        e.preventDefault();
        
        const newName = this.elements.profileName.value.trim();
        
        if (!newName) {
            this.showAlert('Будь ласка, введіть ім\'я', 'error');
            return;
        }

        try {
            const result = await this.apiRequest('/profile', {
                method: 'PUT',
                body: JSON.stringify({ name: newName })
            });

            if (result.success) {
                this.showAlert('Профіль оновлено успішно', 'success');
                
                // Оновлення локального сховища
                const user = JSON.parse(localStorage.getItem('currentUser'));
                user.name = newName;
                localStorage.setItem('currentUser', JSON.stringify(user));
                
                // Оновлення UI
                this.elements.userNameDisplay.textContent = newName;
                if (!user.avatar) {
                    this.elements.userAvatarLarge.textContent = newName.charAt(0).toUpperCase();
                }
            } else {
                this.showAlert(result.message || 'Помилка оновлення профілю', 'error');
            }
        } catch (error) {
            this.showAlert('Помилка з\'єднання з сервером', 'error');
        }
    }

    async clearChatHistory() {
        if (!confirm('Ви впевнені, що хочете очистити всю історію чатів? Цю дію не можна скасувати.')) {
            return;
        }

        try {
            const result = await this.apiRequest('/chats/clear', {
                method: 'DELETE'
            });

            if (result.success) {
                this.showAlert('Історію чатів очищено', 'success');
                this.elements.totalMessagesStat.textContent = '0';
                // Очищення локального сховища
                localStorage.removeItem('chatHistory');
                localStorage.removeItem('userSessions');
            } else {
                this.showAlert(result.message || 'Помилка очищення історії', 'error');
            }
        } catch (error) {
            this.showAlert('Помилка з\'єднання з сервером', 'error');
        }
    }

    async deleteAccount() {
        if (!confirm('Ви дійсно хочете видалити акаунт? Всі ваші дані будуть втрачені назавжди. Цю дію не можна скасувати.')) {
            return;
        }

        if (!confirm('ОСТАННЄ ПІДТВЕРДЖЕННЯ: Ви впевнені, що хочете видалити акаунт?')) {
            return;
        }

        try {
            const result = await this.apiRequest('/profile', {
                method: 'DELETE'
            });

            if (result.success) {
                this.showAlert('Акаунт успішно видалено', 'success');
                setTimeout(() => {
                    localStorage.clear();
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                this.showAlert(result.message || 'Помилка видалення акаунту', 'error');
            }
        } catch (error) {
            this.showAlert('Помилка з\'єднання з сервером', 'error');
        }
    }

    getJoinDate() {
        const months = [
            'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
            'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
        ];
        const date = new Date();
        return `${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    showAlert(message, type = 'info') {
        // Видалення існуючих сповіщень
        const existingAlert = document.querySelector('.account-alert');
        if (existingAlert) existingAlert.remove();

        // Створення нового сповіщення
        const alert = document.createElement('div');
        alert.className = `account-alert`;
        
        const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle';
        const bgColor = type === 'error' ? '#fef2f2' : type === 'success' ? '#f0fdf4' : '#fffbeb';
        const textColor = type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#d97706';
        const borderColor = type === 'error' ? '#fecaca' : type === 'success' ? '#bbf7d0' : '#fed7aa';

        alert.innerHTML = `
            <div class="alert-content" style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-${icon}" style="color: ${textColor};"></i>
                <span>${message}</span>
                <button class="alert-close" style="background: none; border: none; font-size: 18px; cursor: pointer; color: ${textColor}; margin-left: auto;">&times;</button>
            </div>
        `;

        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            background: ${bgColor};
            color: ${textColor};
            border: 1px solid ${borderColor};
            padding: 16px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            max-width: 400px;
            animation: slideInRight 0.3s ease;
        `;

        document.body.appendChild(alert);

        // Автоматичне видалення через 5 секунд
        setTimeout(() => {
            if (alert.parentNode) {
                alert.style.animation = 'slideOutRight 0.3s ease';
                setTimeout(() => alert.remove(), 300);
            }
        }, 5000);

        // Закриття по кліку
        alert.querySelector('.alert-close').addEventListener('click', () => {
            alert.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => alert.remove(), 300);
        });
    }

    async apiRequest(endpoint, options = {}) {
        const token = localStorage.getItem('authToken');
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` }),
                ...options.headers
            }
        };
        
        try {
            // Імітація API виклику - замінити на реальний fetch
            console.log('Making API request to:', endpoint);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Тестова успішна відповідь для демо
            if (endpoint === '/login') {
                return { 
                    success: true, 
                    token: 'mock-jwt-token',
                    user: { name: 'Demo User', email: 'demo@example.com' }
                };
            } else if (endpoint === '/register') {
                return { success: true, message: 'Реєстрація успішна' };
            } else {
                return { success: true, message: 'Операція успішна' };
            }
            
        } catch (error) {
            console.error('API Error:', error);
            return { success: false, message: 'Помилка з\'єднання з сервером' };
        }
    }
}

// Глобальні функції
function openAuthModal(tab = 'login') {
    if (window.accountApp) {
        window.accountApp.openAuthModal(tab);
    }
}

function exportData() {
    if (window.accountApp) {
        window.accountApp.showExportModal();
    }
}

// Ініціалізація додатка акаунта
document.addEventListener('DOMContentLoaded', () => {
    window.accountApp = new AccountApp();
});

