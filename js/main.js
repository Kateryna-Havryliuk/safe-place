// main.js - Простий та ефективний
class MainApp {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
        console.log('Main app initialized');
    }

    bindEvents() {
        this.bindSendMessage();
        this.bindBurgerMenu();
        this.bindSmoothScrolling();
    }

    bindSendMessage() {
        const sendButton = document.getElementById('sendInitialBtn');
        const messageInput = document.getElementById('initialMessage');

        if (sendButton && messageInput) {
            sendButton.addEventListener('click', () => {
                this.sendToChat();
            });

            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendToChat();
                }
            });
        }
    }

    sendToChat() {
        const messageInput = document.getElementById('initialMessage');
        const message = messageInput.value.trim();

        if (message) {
            localStorage.setItem('initialMessage', message);
        }
        
        // Просто переходимо до чату
        window.location.href = 'chat.html';
    }

    bindBurgerMenu() {
        
    const burgerMenu = document.getElementById('burgerMenu');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const closeMobileMenu = document.getElementById('closeMobileMenu');

    if (!burgerMenu || !mobileMenu) return;

    function toggleMenu() {
        const isActive = mobileMenu.classList.contains('active');
        
        if (isActive) {
            // Закриваємо меню
            mobileMenu.classList.remove('active');
            if (mobileOverlay) mobileOverlay.classList.remove('active');
            document.body.classList.remove('menu-open');
        } else {
            // Відкриваємо меню
            mobileMenu.classList.add('active');
            if (mobileOverlay) mobileOverlay.classList.add('active');
            document.body.classList.add('menu-open');
        }
        
        burgerMenu.classList.toggle('active');
    }

    // Події для відкриття/закриття
    burgerMenu.addEventListener('click', toggleMenu);
    
    if (closeMobileMenu) {
        closeMobileMenu.addEventListener('click', toggleMenu);
    }

    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', toggleMenu);
    }

    // Закриття при кліку на посилання
    const mobileLinks = document.querySelectorAll('.mobile-nav-link');
    mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Затримка для плавного переходу до секції
            setTimeout(() => {
                toggleMenu();
            }, 150);
        });
    });

    // Закриття при зміні розміру вікна на десктоп
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            mobileMenu.classList.remove('active');
            mobileOverlay?.classList.remove('active');
            burgerMenu.classList.remove('active');
            document.body.classList.remove('menu-open');
        }
    });

    // Закриття при натисканні ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
            toggleMenu();
        }
    });
}
    bindSmoothScrolling() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }
}

(function initMainPageTheme() {
    // Головна сторінка - світла тема за замовчуванням
    const saved = localStorage.getItem('theme');
    if (!saved) {
        localStorage.setItem('theme', 'light');
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', saved);
    }
})();

// Функція для відкриття чату з передачею даних авторизації
function openChatWithAuth(url = 'chat.html') {
    // Перевіряємо, чи користувач авторизований
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('currentUser');
    
    // Зберігаємо позначку, що ми переходимо з головної сторінки
    localStorage.setItem('comingFromMainPage', 'true');
    localStorage.setItem('mainPageTimestamp', Date.now().toString());
    
    // Відкриваємо чат
    window.open(url, '_blank');
}

// Оновлюємо всі кнопки, які відкривають чат
document.addEventListener('DOMContentLoaded', function() {
    // Знаходимо всі кнопки з onclick="window.open('chat.html', '_blank')"
    const chatButtons = document.querySelectorAll('button[onclick*="chat.html"]');
    
    chatButtons.forEach(button => {
        // Замінюємо inline onclick на наш обробник
        button.removeAttribute('onclick');
        button.addEventListener('click', function(e) {
            e.preventDefault();
            openChatWithAuth('chat.html');
        });
    });
    
    // Також обробляємо посилання на чат
    const chatLinks = document.querySelectorAll('a[href="chat.html"]');
    chatLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            // Якщо це не звичайний перехід, а відкриття в новій вкладці
            if (e.ctrlKey || e.metaKey || e.button === 1) {
                return; // Дозволяємо стандартну поведінку
            }
            e.preventDefault();
            openChatWithAuth('chat.html');
        });
    });
});

// Запуск додатка
document.addEventListener('DOMContentLoaded', () => {
    window.mainApp = new MainApp();
});