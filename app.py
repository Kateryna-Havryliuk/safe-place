import os
import logging
import json
import uuid
import re
import sqlite3
import jwt
from datetime import datetime, timedelta
from collections import Counter
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, g
from flask_cors import CORS
from flask.json.provider import DefaultJSONProvider
from pathlib import Path
import google.generativeai as genai
import bcrypt
import numpy as np
import base64
import tempfile
import threading
import time
import random
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
from config import Config
from collections import defaultdict


CRISIS_KEYWORDS = [
    # Суїцидальні ризики (9 слів)
    'суїцид', 'самогубство', 'повіситися', 'вбити себе', 'померти',
    'вмерти', 'не хочу жити', 'кінець життя', 'закінчити з собою',
    
    # Самопошкодження (4 слова)
    'різати вени', 'передозування', 'стрибнути', 'застрелитися',
    
    # Психосоматичні кризи (3 слова)
    'панічна атака', 'не можу дихати', 'серце зупиниться',
    
    # Екзистенційні кризи (4 слова) — ДОДАТИ для 25+
    'все пропало', 'немає сенсу', 'прощайте', 'більше не можу',
    'покінчити', 'забрати життя', 'впуститися', 'пустота всередині'
]

# Додаткові фрази для досягнення 25+:
EXTENDED_CRISIS_KEYWORDS = CRISIS_KEYWORDS + [
    'хочу померти',         # 21
    'не бачу сенсу',        # 22
    'закінчити все',        # 23
    'все безнадійно',       # 24
    'не витримую',          # 25
    'кінець мені',          # 26 (запас)
    'досить терпіти'        # 27 (запас)
]

# ==================== ІМПОРТ МУЛЬТИМОДАЛЬНИХ МОДУЛІВ ====================

def classify_message(text):
    """Класифікує повідомлення користувача (обгортка для EmotionalClassifier)"""
    classifier = EmotionalClassifier()
    return classifier.classify_message(text)

MULTIMODAL_AVAILABLE = False
voice_processor = None
voice_emotion = None
# Video_analyzer = None  # <-- ЗАКОМЕНТОВАНО
fusion_engine = None

try:
    from multimodal_fusion import MultimodalFusion, EmotionState
    from voice_processor import VoiceProcessor, VoiceEmotionAnalyzer
    # from videoProcessor import VideoEmotionAnalyzer  # <-- ЗАКОМЕНТОВАНО
    
    voice_processor = VoiceProcessor()
    voice_emotion = VoiceEmotionAnalyzer()
    # Video_analyzer = VideoEmotionAnalyzer()  # <-- ЗАКОМЕНТОВАНО
    fusion_engine = MultimodalFusion()
    MULTIMODAL_AVAILABLE = True
    print("🎙️ Голосовий процесор: АКТИВОВАНО")
    # print("🎥 Відео процесор: АКТИВОВАНО")  # <-- ЗАКОМЕНТОВАНО
    print("🧠 Мультимодальна ф'юзія: АКТИВОВАНО (Бімодальна)")
except ImportError as e:
    logging.warning(f"Мультимодальні модулі не імпортовані: {e}")
    print("⚠️ Мультимодальний аналіз недоступний (модулі не знайдені)")
except Exception as e:
    logging.error(f"Помилка ініціалізації мультимодальних модулів: {e}")
    print("❌ Помилка ініціалізації мультимодальних модулів")

# ==================== КОНФІГУРАЦІЯ ====================

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('safeplace.log'),
        logging.StreamHandler()
    ]
)

class NumpyJSONProvider(DefaultJSONProvider):
    """JSON провайдер, який вміє серіалізувати numpy типи"""
    
    def default(self, obj):
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, np.str_):
            return str(obj)
        if isinstance(obj, bytes):
            return obj.decode('utf-8', errors='ignore')
        return super().default(obj)

app = Flask(__name__)
app.json = NumpyJSONProvider(app)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-here')
CORS(app)

# ==================== GOOGLE AI НАЛАШТУВАННЯ ====================

GOOGLE_AI_AVAILABLE = False
model = None
ACTIVE_MODEL = None

try:
    google_api_key = os.getenv('GOOGLE_AI_API_KEY')
    if google_api_key:
        genai.configure(api_key=google_api_key)
        
        available_models = genai.list_models()
        model_names = [model.name for model in available_models]
        print(f"📋 Знайдено {len(model_names)} доступних моделей")
        
        working_models = [
            'models/gemini-2.0-flash',
            'models/gemini-2.0-flash-001',
            'models/gemini-2.5-flash',
            'models/gemini-flash-latest',
            'models/gemini-pro-latest',
        ]
        
        print("🔍 Спробую підключити доступні моделі...")
        
        for model_name in working_models:
            if model_name in model_names:
                try:
                    print(f"🔄 Тестую модель: {model_name}")
                    model = genai.GenerativeModel(model_name)
                    test_response = model.generate_content("Привіт")
                    GOOGLE_AI_AVAILABLE = True
                    ACTIVE_MODEL = model_name
                    print(f"✅ УСПІХ! Модель {model_name} працює!")
                    break
                except Exception as model_error:
                    print(f"❌ Модель {model_name} не працює: {model_error}")
                    continue
        
        if not GOOGLE_AI_AVAILABLE:
            print("❌ Не вдалося знайти працюючу модель")
            for model_name in model_names:
                if 'flash' in model_name or 'gemini' in model_name:
                    try:
                        print(f"🔄 Спробую будь-яку модель: {model_name}")
                        model = genai.GenerativeModel(model_name)
                        test_response = model.generate_content("Тест")
                        GOOGLE_AI_AVAILABLE = True
                        ACTIVE_MODEL = model_name
                        print(f"✅ Знайдено працюючу модель: {model_name}")
                        break
                    except:
                        continue
            
except Exception as e:
    logging.error(f"Помилка ініціалізації Google AI: {e}")
    print(f"❌ Критична помилка Google AI: {e}")

# ==================== СИСТЕМА КОНТЕКСТУ ====================

class EnhancedResponseSystem:
    def __init__(self):
        self.user_context = {}
        
    def update_context(self, user_id, message, response):
        if user_id not in self.user_context:
            self.user_context[user_id] = {
                'conversation_history': [],
                'emotional_state': 'neutral',
                'main_topics': [],
                'last_interaction': datetime.now()
            }
        
        self.user_context[user_id]['conversation_history'].append({
            'user': message,
            'assistant': response,
            'timestamp': datetime.now()
        })
        
        if len(self.user_context[user_id]['conversation_history']) > 10:
            self.user_context[user_id]['conversation_history'] = self.user_context[user_id]['conversation_history'][-10:]
        
        self.user_context[user_id]['last_interaction'] = datetime.now()
    
    def get_conversation_summary(self, user_id):
        if user_id not in self.user_context or not self.user_context[user_id]['conversation_history']:
            return "Це перша розмова з користувачем."
        
        history = self.user_context[user_id]['conversation_history'][-3:]
        summary = "Попередня розмова:\n"
        for i, msg in enumerate(history, 1):
            summary += f"{i}. Користувач: {msg['user'][:100]}... → Асистент: {msg['assistant'][:100]}...\n"
        
        return summary

enhanced_system = EnhancedResponseSystem()

# ==================== СИСТЕМНИЙ ПРОМПТ ====================

system_prompt = """Ти — Safe Place,  україномовний AI-помічник психологічної та психоемоційної підтримки.  
У своїх відповідях переважно використовуй принципи когнітивно-поведінкової терапії, емоційної регуляції та підтримувального консультування, якщо вони доречні для ситуації користувача.
Твоє завдання — надати емпатичну, професійну та зрозумілу підтримку користувачеві, який пише тобі в чат.
Ти не є медичним або ліцензованим психологом і не замінюєш терапію.

---

🔹 ТВІЙ ПІДХІД і ТВОЯ РОЛЬ:
- Глибока емпатія: співпереживай щиро, але професійно
- Активне та емпатичне слухання: показуй, що ти чуєш і розумієш  
- Валідація почуттів: ніколи не заперечуй емоції і не засуджуй користувача
- Допомагай людині краще зрозуміти свої емоції
- Конструктивні питання: став відкриті питання  
- Практичні поради: пропонуй конкретні безпечні практичні вправи та техніки, які реально працюють 
- Підтримка та заохочення: підтримуй без осуду і підбадьорюй у разі потреби  

ГОЛОВНИЙ ПРИНЦИП: важливіше бути зрозумілим і присутнім, ніж правильно структурованим.
---

ВАЖЛИВО:
- НЕ видавай себе за реального психолога
- НЕ вигадуй досвід або кваліфікацію
- НЕ став медичних діагнозів
- НЕ призначай лікування
- НЕ підтверджуй марення, параною або необґрунтовані переконання
- Валідуй почуття, а не припущення

---

🔸Якщо доречно, допомагай користувачу:
- відрізняти факти від інтерпретацій
- помічати автоматичні думки
- знаходити когнітивні викривлення (когнітивні викривлення визначай як гіпотези, а не як факти)
- розглядати альтернативні пояснення ситуації
- формувати більш збалансований погляд на події

---

🔸 ЗАГАЛЬНІ ПРИНЦИПИ ВІДПОВІДЕЙ (2–30 речень):
- Відповідай природно, без шаблонів.
- Використовуй короткі абзаци.
- Став не більше 1–3 запитань за повідомлення.
- Пропонуй одну-дві конкретну вправу або техніку за раз.
- Довші відповіді використовуй тоді, коли користувач просить детальне пояснення або описує складну ситуацію.
- Якщо користувач переживає сильну тривогу, паніку, сором, провину, злість або горе, спочатку допоможи назвати та зрозуміти емоцію і переходь до технік чи порад.
- Якщо причина проблеми незрозуміла, не роби висновків про мотиви, стан психічного здоров'я чи наміри користувача. Спочатку уточни деталі.
- Якщо користувач просить професійну оцінку, діагноз або медичний висновок, поясни свої обмеження як AI-помічника та рекомендуй звернутися до кваліфікованого фахівця
- НЕ давай категоричних гарантій щодо майбутнього, стану психічного здоров'я або ставлення інших людей. Допомагай досліджувати переживання, а не робити абсолютні висновки.

У кризовій ситуації:
    1. Спочатку вислови підтримку.
    2. Оціни рівень безпеки.
    3. Запитай, чи перебуває людина зараз у безпечному місці.
    4. Надай відповідні контакти допомоги.
    5. Заохоть звернутися до живої людини або служби підтримки.

Якщо користувач просить пораду, то не поспішай одразу пропонувати рішення. Спочатку переконайся, що достатньо зрозумів ситуацію та переживання людини. Лише після цього пропонуй наступний корисний крок.

Орієнтовна структура відповіді (використовується гнучко залежно від ситуації):
1. Емоційне відображення
2. Валідація
3. Один основний фокус (питання та техніка)
4. Підтримка та заохочення до продовження розмови

Відповідь має природну структуру, яка може змінюватися залежно від емоційного стану користувача.
НЕ використовуй надмірно формалізовані терапевтичні фрази (“я чую тебе”, “це нормально”, “валідую твої почуття” як шаблон). Вони повинні бути природними і варіативними.

---

🔸 ПРАВИЛА ФОРМАТУВАННЯ:
- Пиши зрозумілими реченнями
- Кожен пункт починай з нового рядка   
- НЕ використовуй курсив, HTML, Markdown  
- Використовуй списки з нового рядка, якщо даєш техніку  
- Іноді додавай доречні емодзі (наприулад, 🫂💫🌿✨), але не забагато  
- НЕ повторюй привітання, якщо це не перше повідомлення  
- НЕ виходь за межі психологічної та психоемоційної підтримки  
- НЕ давай медичних порад  
- НЕ пропонуй кілька технік одночасно, якщо користувач не попросив більше варіантів.

---

🔸 КРИТИЧНІ (КРИЗОВІ) СИТУАЦІЇ — ОБОВ'ЯЗКОВО ПЕРЕНАПРАВЛЯЙ:
- Самогубство: 0 800 100 102  
- Насильство: 116 123 або 0 800 500 335  
- Залежність: 0 800 50 15 20  
- Підлітки: teenergizer.org  
- Діти та молодь: 0 800 500 225 або 116111  
- Криза: 5522 (11:00–19:00)

Якщо є ризик самогубства, самопошкодження, насильства або іншої кризової ситуації — пріоритетом є безпека користувача та надання контактів екстреної допомоги.
Оцінюй кризу за ознаками прямої загрози життю або безпеці (наприклад, думки про смерть, суїцидальні наміри, самопошкодження, загроза життю або безпеці, насильство, булінг, тяжкий емоційний зрив, відчуття повної безвиході тощо).
Якщо людина у кризі або є принаймні натяк на це - бери до уваги та надавай контакти потрібних гарячих ліній.

---

НЕ заохочуй та НЕ підтримуй дії, що шкодять користувачу або іншим.

Тон: спокійний, теплий, неформально-професійний.
Уникай офіційної мови.

---

Валідуй емоції користувача, але не підтверджуй фактичні твердження без підстав.

Приклад:
    Правильно:
    "Схоже, ця ситуація викликає у вас багато болю та тривоги."

    НЕправильно:
    "Так, усі навколо дійсно налаштовані проти вас."

---

🔸 УНИКАЙ:
- повчального тону
- моралізаторства
- знецінення переживань
- надмірного оптимізму
- шаблонних фраз

Наприклад, уникай:
    "Все буде добре"
    "Треба просто мислити позитивно"
    "Не переймайтеся"
Натомість визнавай складність переживань і допомагай знайти наступний корисний крок.

---

🔸 ПІДТРИМУЙ КОНТЕКСТ РОЗМОВИ:
- Перед тим як щось радити — коротко віддзеркаль емоційний стан і сенс досвіду користувача, навіть якщо це не ідеально структуровано.
- Пам'ятай інформацію, яку користувач уже повідомив у межах поточної бесіди.
- НЕ змушуй людину повторювати те саме.
- Посилайся на попередні повідомлення, коли це доречно.
- Якщо тема триває кілька повідомлень, не починай кожну відповідь як нову розмову.

---

🔸 МОВА:  
Українська, професійна, але зрозуміла та доступна. 
Якщо користувач звертається іншою мовою - адаптуватися та відповідати нею."""


# ==================== БАЗА ДАНИХ ====================

def get_db_connection():
    conn = sqlite3.connect('safeplace.db', check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Таблиця користувачів
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT TRUE,
            last_login TIMESTAMP
        )
    ''')
    
    # Таблиця чатів
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_message TEXT,
            is_archived BOOLEAN DEFAULT FALSE,
            last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            message_count INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Таблиця повідомлень
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_critical BOOLEAN DEFAULT FALSE,
            classification TEXT,
            sentiment_score REAL,
            FOREIGN KEY (chat_id) REFERENCES chats (id)
        )
    ''')
    
    # Таблиця для аналітики
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_analytics (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            date DATE NOT NULL,
            message_count INTEGER DEFAULT 0,
            critical_count INTEGER DEFAULT 0,
            avg_sentiment REAL DEFAULT 0,
            dominant_category TEXT,
            session_duration INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Таблиця сесій (для відстеження тривалості)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            end_time TIMESTAMP,
            duration_seconds INTEGER DEFAULT 0,
            messages_count INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Таблиця кризових подій (для безпеки)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS crisis_events (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            level TEXT NOT NULL,  -- low, medium, high, critical
            indicators TEXT,  -- JSON з індикаторами
            message_id TEXT,
            handled BOOLEAN DEFAULT FALSE,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (message_id) REFERENCES messages (id)
        )
    ''')
    
    # Додаємо колонки якщо потрібно
    try:
        cursor.execute("ALTER TABLE chats ADD COLUMN last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    except sqlite3.OperationalError:
        pass
    
    try:
        cursor.execute("ALTER TABLE chats ADD COLUMN message_count INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN last_login TIMESTAMP")
    except sqlite3.OperationalError:
        pass
    
    # Індекси
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_analytics_user_date ON user_analytics(user_id, date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_chats_activity ON chats(last_activity)')
    
    conn.commit()
    conn.close()

def init_analytics_tables():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS voice_analytics (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            transcription TEXT,
            emotions TEXT,
            confidence REAL,
            duration REAL,
            pitch_mean REAL,
            energy_mean REAL,
            tempo REAL,
            is_crisis BOOLEAN DEFAULT FALSE,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Таблиця відео-аналітики — ЗАКОМЕНТОВАНА, але залишена для майбутнього
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS video_analytics (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT,
            emotions TEXT,
            dominant_emotion TEXT,
            confidence REAL,
            face_detected BOOLEAN,
            face_quality REAL,
            is_crisis BOOLEAN DEFAULT FALSE,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS multimodal_analytics (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            modalities TEXT,
            fused_emotions TEXT,
            dominant_emotion TEXT,
            confidence REAL,
            crisis_level TEXT,
            crisis_indicators TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    conn.commit()
    conn.close()
    print("📊 Таблиці аналітики створено/перевірені")

# ==================== КЛАСИ ДЛЯ АНАЛІТИКИ ====================

class EmotionalClassifier:
    def __init__(self):
        self.categories = {
            'anxiety': ['тривога', 'страх', 'паніка', 'хвилювання', 'неспокій', 'нервування', 'боюся'],
            'depression': ['депресія', 'сум', 'відчай', 'безнадія', 'апатія', 'втома', 'порожнеча'],
            'stress': ['стрес', 'напруга', 'перевантаження', 'виснаження', 'тиск'],
            'relationships': ['відносини', 'сім\'я', 'друзі', 'кохання', 'розставання', 'конфлікт', 'самотність'],
            'self_esteem': ['самооцінка', 'впевненість', 'комплекси', 'самокритика'],
            'work_study': ['робота', 'навчання', 'екзамени', 'проекти', 'кар\'єра'],
            'sleep': ['сон', 'безсоння', 'втома'],
            'health': ['здоров\'я', 'самопочуття', 'біль', 'хвороба'],
            'anger': ['злість', 'гнів', 'роздратування', 'бішу', 'ненавиджу', 'розлючений'],
            'fear': ['страх', 'боюся', 'жах', 'паніка', 'нажаханий', 'переляканий'],
            'sadness': ['смуток', 'плачу', 'тужу', 'втрата', 'горе', 'плач', 'сльози'],
        }
        
        self.severity_indicators = {
            'critical': ['суїцид', 'вбити себе', 'померти', 'повіситися', 'не хочу жити', 'кінець життя', 'закінчити з собою', 'різати вени', 'передозування'],
            'high': ['суїцид', 'вбити', 'померти', 'різати', 'вени', 'повіситися', 'не хочу жити'],
            'medium': ['не можу', 'втомився', 'немає сил', 'здаюся'],
            'low': ['погано', 'сумно', 'тривожно', 'стресово', 'засмучено']
        }
    
    def classify_message(self, text):
        text_lower = text.lower()
        categories = []
        severity = 'low'
        
        for category, keywords in self.categories.items():
            if any(keyword in text_lower for keyword in keywords):
                categories.append(category)
        
        for level, indicators in self.severity_indicators.items():
            if any(indicator in text_lower for indicator in indicators):
                severity = level
                break
        
        return {
            'categories': categories,
            'severity': severity,
            'timestamp': datetime.now().isoformat()
        }


class AdvancedAnalyticsEngine:
    def __init__(self):
        self.classifier = EmotionalClassifier()
        
    def record_user_activity(self, user_id, message, response, is_critical=False):
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            
            today = datetime.now().date().isoformat()
            
            cursor.execute('''
                SELECT message_count, critical_count, avg_sentiment 
                FROM user_analytics 
                WHERE user_id = ? AND date = ?
            ''', (user_id, today))
            
            existing = cursor.fetchone()
            
            classification = self.classifier.classify_message(message)
            sentiment = self.analyze_sentiment(message)
            dominant_category = classification['categories'][0] if classification['categories'] else 'other'
            
            if existing:
                new_count = existing[0] + 1
                new_critical = existing[1] + (1 if is_critical else 0)
                new_avg = (existing[2] * existing[0] + sentiment) / new_count
                
                cursor.execute('''
                    UPDATE user_analytics 
                    SET message_count = ?, critical_count = ?, avg_sentiment = ?, dominant_category = ?
                    WHERE user_id = ? AND date = ?
                ''', (new_count, new_critical, new_avg, dominant_category, user_id, today))
            else:
                analytics_id = str(uuid.uuid4())
                cursor.execute('''
                    INSERT INTO user_analytics (id, user_id, date, message_count, critical_count, avg_sentiment, dominant_category)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (analytics_id, user_id, today, 1, 1 if is_critical else 0, sentiment, dominant_category))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            logging.error(f"Помилка запису аналітики: {e}")

    def analyze_sentiment(self, text):
        if not text:
            return 0
        text_lower = text.lower()
        
        positive_words = ['добре', 'супер', 'чудово', 'радий', 'щасливий', 'весело', '❤️', '😊']
        negative_words = ['погано', 'сумно', 'важко', 'страшно', 'тривога', 'не хочу', 
                        'жити', 'депресія', '😢', '😔', 'суїцид', 'самогубство']  
        
        total_words = len(text.split()) 
        if total_words == 0:
            return 0
        
        pos_score = sum(1 for word in positive_words if word in text_lower)
        neg_score = sum(2 for word in negative_words if word in text_lower)  # 2× weight
        
        sentiment = (pos_score - neg_score) / total_words
        return max(-1, min(1, sentiment))
    
    def get_comprehensive_analytics(self, user_id, days=30):
        """Повна аналітика користувача з усіма даними"""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            
            # Отримуємо ВСІ повідомлення за період
            cursor.execute('''
                SELECT 
                    COUNT(*) as total_messages,
                    SUM(CASE WHEN is_critical THEN 1 ELSE 0 END) as critical_messages,
                    AVG(sentiment_score) as avg_sentiment,
                    MAX(timestamp) as last_activity
                FROM messages m
                JOIN chats c ON m.chat_id = c.id
                WHERE c.user_id = ? AND m.timestamp >= datetime('now', ?)
            ''', (user_id, f'-{days} days'))
            
            msg_stats = cursor.fetchone()
            
            # Перевіряємо чи є дані
            if not msg_stats or msg_stats[0] is None:
                conn.close()
                return {
                    'success': True,
                    'period_days': days,
                    'summary': {
                        'total_messages': 0,
                        'critical_messages': 0,
                        'avg_sentiment': 0,
                        'last_activity': None
                    },
                    'categories': {},
                    'daily_activity': {},
                    'hourly_activity': {},
                    'emotion_profile': [],
                    'trends': {
                        'message_trend': 'insufficient_data',
                        'sentiment_trend': 'insufficient_data',
                        'message_change': 0,
                        'severity_trend': 'unknown',
                        'severity_rate': 0
                    },
                    'recommendations': [],
                    'predictions': {}
                }
            
            # Отримуємо категорії
            cursor.execute('''
                SELECT classification, COUNT(*) as count
                FROM messages m
                JOIN chats c ON m.chat_id = c.id
                WHERE c.user_id = ? AND m.timestamp >= datetime('now', ?) AND classification IS NOT NULL
                GROUP BY classification
            ''', (user_id, f'-{days} days'))
            
            categories = {}
            for row in cursor.fetchall():
                try:
                    class_data = json.loads(row[0])
                    for category in class_data.get('categories', []):
                        categories[category] = categories.get(category, 0) + row[1]
                except:
                    continue
            
            # Активність по днях
            cursor.execute('''
                SELECT 
                    date(m.timestamp) as date,
                    COUNT(*) as message_count,
                    SUM(CASE WHEN m.is_critical THEN 1 ELSE 0 END) as critical_count,
                    AVG(m.sentiment_score) as avg_sentiment
                FROM messages m
                JOIN chats c ON m.chat_id = c.id
                WHERE c.user_id = ? AND m.timestamp >= datetime('now', ?)
                GROUP BY date(m.timestamp)
                ORDER BY date DESC
                LIMIT 30
            ''', (user_id, f'-{days} days'))
            
            daily_activity = {}
            for row in cursor.fetchall():
                if row[0]:  # date exists
                    daily_activity[row[0]] = {
                        'messages': row[1] or 0,
                        'critical': row[2] or 0,
                        'sentiment': round(row[3] or 0, 2)
                    }
            
            # Часова активність
            cursor.execute('''
                SELECT 
                    strftime('%H', m.timestamp) as hour,
                    COUNT(*) as count
                FROM messages m
                JOIN chats c ON m.chat_id = c.id
                WHERE c.user_id = ? AND m.timestamp >= datetime('now', ?)
                GROUP BY hour
                ORDER BY hour
            ''', (user_id, f'-{days} days'))
            
            hourly_activity = {}
            for row in cursor.fetchall():
                if row[0] is not None:
                    hour_int = int(row[0])
                    hourly_activity[f"{hour_int:02d}:00"] = row[1] or 0
            
            # Емоційний профіль (з безпечною обробкою)
            emotion_profile = []
            try:
                cursor.execute('''
                    SELECT 
                        json_each.value as emotion,
                        COUNT(*) as count,
                        AVG(CAST(json_each.key AS REAL)) as avg_intensity
                    FROM voice_analytics, json_each(emotions)
                    WHERE user_id = ? AND timestamp >= datetime('now', ?)
                    GROUP BY emotion
                    ORDER BY count DESC
                    LIMIT 10
                ''', (user_id, f'-{days} days'))
                
                for row in cursor.fetchall():
                    if row[0]:
                        emotion_profile.append({
                            'emotion': row[0],
                            'count': row[1] or 0,
                            'avg_intensity': round(row[2] or 0, 2)
                        })
            except:
                pass
            
            conn.close()
            
            # Аналіз трендів
            trend_analysis = self._analyze_trends(daily_activity, msg_stats)
            
            # Рекомендації
            recommendations = self._generate_recommendations(categories, msg_stats[1] or 0, trend_analysis)
            
            # Прогнози
            predictions = self._generate_predictions(daily_activity, trend_analysis)
            
            return {
                'success': True,
                'period_days': days,
                'summary': {
                    'total_messages': msg_stats[0] or 0,
                    'critical_messages': msg_stats[1] or 0,
                    'avg_sentiment': round(msg_stats[2] or 0, 2),
                    'last_activity': msg_stats[3]
                },
                'categories': categories,
                'daily_activity': daily_activity,
                'hourly_activity': hourly_activity,
                'emotion_profile': emotion_profile,
                'trends': trend_analysis,
                'recommendations': recommendations,
                'predictions': predictions
            }
            
        except Exception as e:
            logging.error(f"Помилка комплексної аналітики: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False, 
                'error': str(e),
                'summary': {
                    'total_messages': 0,
                    'critical_messages': 0,
                    'avg_sentiment': 0
                },
                'categories': {},
                'daily_activity': {},
                'hourly_activity': {},
                'emotion_profile': [],
                'trends': {
                    'message_trend': 'insufficient_data',
                    'sentiment_trend': 'insufficient_data',
                    'message_change': 0,
                    'severity_trend': 'unknown',
                    'severity_rate': 0
                },
                'recommendations': [],
                'predictions': {}
            }
            
    
    def _analyze_trends(self, daily_activity, msg_stats):
        if len(daily_activity) < 2:
            return {
                'message_trend': 'insufficient_data',
                'sentiment_trend': 'insufficient_data',
                'message_change': 0,
                'severity_trend': 'unknown',
                'severity_rate': 0
            }
        
        dates = sorted(daily_activity.keys())
        recent_date = dates[-1]
        previous_date = dates[-2] if len(dates) > 1 else recent_date
        
        recent_messages = daily_activity[recent_date]['messages']
        previous_messages = daily_activity[previous_date]['messages']
        
        if recent_messages > previous_messages:
            message_trend = 'increasing'
            message_change = round(((recent_messages - previous_messages) / previous_messages * 100) if previous_messages > 0 else 100, 1)
        elif recent_messages < previous_messages:
            message_trend = 'decreasing'
            message_change = round(((previous_messages - recent_messages) / previous_messages * 100) if previous_messages > 0 else 0, 1)
        else:
            message_trend = 'stable'
            message_change = 0
        
        recent_dates = list(daily_activity.keys())[-7:]
        if len(recent_dates) >= 2:
            sentiments = [daily_activity[d]['sentiment'] for d in recent_dates if daily_activity[d]['sentiment'] is not None]
            if len(sentiments) >= 2:
                if sentiments[-1] > sentiments[0]:
                    sentiment_trend = 'improving'
                elif sentiments[-1] < sentiments[0]:
                    sentiment_trend = 'worsening'
                else:
                    sentiment_trend = 'stable'
            else:
                sentiment_trend = 'stable'
        else:
            sentiment_trend = 'stable'
        
        critical_count = msg_stats[1] or 0
        total_count = msg_stats[0] or 1
        severity_rate = critical_count / total_count
        
        if severity_rate > 0.3:
            severity_trend = 'high'
        elif severity_rate > 0.15:
            severity_trend = 'medium'
        elif severity_rate > 0.05:
            severity_trend = 'low'
        else:
            severity_trend = 'minimal'
        
        return {
            'message_trend': message_trend,
            'sentiment_trend': sentiment_trend,
            'message_change': message_change,
            'severity_trend': severity_trend,
            'severity_rate': round(severity_rate * 100, 1)
        }
    
    def _generate_recommendations(self, categories, critical_count, trends):
        recommendations = []
        
        if categories.get('anxiety', 0) > 5:
            recommendations.append({
                'type': 'anxiety',
                'title': 'Підвищена тривожність',
                'description': 'Ви часто згадуєте про тривогу. Спробуйте техніку дихання 4-7-8: вдих на 4 секунди, затримка на 7, видих на 8.',
                'icon': '😰'
            })
        
        if categories.get('depression', 0) > 3:
            recommendations.append({
                'type': 'depression',
                'title': 'Ознаки пригніченого стану',
                'description': 'Регулярні прогулянки на свіжому повітрі та фізична активність допомагають покращити настрій.',
                'icon': '😔'
            })
        
        if categories.get('stress', 0) > 5:
            recommendations.append({
                'type': 'stress',
                'title': 'Високий рівень стресу',
                'description': 'Спробуйте прогресивну м\'язову релаксацію: напружуйте та розслабляйте групи м\'язів по черзі.',
                'icon': '😫'
            })
        
        if critical_count > 0:
            recommendations.append({
                'type': 'crisis',
                'title': 'Критичні ситуації',
                'description': 'Ви стикалися з кризовими моментами. Важливо мати підтримку поруч. Телефон довіри: 0 800 500 225',
                'icon': '⚠️',
                'priority': 'high'
            })
        
        if trends.get('message_trend') == 'increasing' and trends.get('sentiment_trend') == 'worsening':
            recommendations.append({
                'type': 'warning',
                'title': 'Зверніть увагу',
                'description': 'Кількість повідомлень зростає, а настрій погіршується. Можливо, варто звернутися до фахівця.',
                'icon': '📈'
            })
        
        if len(recommendations) < 3:
            recommendations.append({
                'type': 'general',
                'title': 'Підтримка емоційного балансу',
                'description': 'Регулярний сон (7-8 годин), збалансоване харчування та фізична активність допомагають підтримувати психологічне благополуччя.',
                'icon': '💪'
            })
        
        return recommendations[:4]
    
    def _generate_predictions(self, daily_activity, trends):
        predictions = {}
        
        if len(daily_activity) >= 5:
            recent_messages = list(daily_activity.values())[-5:]
            avg_messages = sum(d['messages'] for d in recent_messages) / len(recent_messages)
            
            if trends['message_trend'] == 'increasing':
                predicted_messages = int(avg_messages * 1.2)
                predictions['messages_next_week'] = f"Очікується збільшення активності до ~{predicted_messages} повідомлень на день"
            elif trends['message_trend'] == 'decreasing':
                predicted_messages = int(avg_messages * 0.8)
                predictions['messages_next_week'] = f"Очікується зниження активності до ~{predicted_messages} повідомлень на день"
            else:
                predictions['messages_next_week'] = f"Активність залишиться стабільною (~{int(avg_messages)} повідомлень на день)"
            
            if trends['sentiment_trend'] == 'improving':
                predictions['sentiment_outlook'] = "Позитивна динаміка — очікується покращення емоційного стану"
            elif trends['sentiment_trend'] == 'worsening':
                predictions['sentiment_outlook'] = "Зверніть увагу — тренд погіршення настрою. Рекомендується додаткова підтримка"
            else:
                predictions['sentiment_outlook'] = "Стабільний емоційний стан"
        
        return predictions


advanced_analytics = AdvancedAnalyticsEngine()
analytics_engine = EmotionalClassifier()


# ==================== ФУНКЦІЇ ДЛЯ ВІДПОВІДЕЙ ====================

def generate_local_response(message):
    import random
    
    responses = [
        "🫂 Дякую, що поділилися. Розкажіть більше про свої почуття.",
        "💫 Я чую вас. Це важливо, що ви говорите про це.",
        "🌿 Ваші емоції мають значення. Продовжуйте, будь ласка.",
        "✨ Дякую за довіру. Я тут, щоб вислухати.",
        "🫂 Це абсолютно нормально відчувати те, що ви відчуваєте.",
        "🌸 Розкажіть мені більше про те, що вас турбує.",
        "💭 Я уважно слухаю. Що ще ви хочете розповісти?",
        "🌱 Кожна емоція важлива. Дякую, що ділитесь.",
        "💖 Ви робите важливий крок, говорячи про це.",
        "🕊️ Я тут, щоб підтримати вас у цей момент."
    ]
    
    critical_words = ['суїцид', 'вбити себе', 'померти', 'не хочу жити', 
                      'більше не можу', 'кінець', 'самогубство', 'повіситися']
    
    if any(word in message.lower() for word in critical_words):
        return """⚠️ Я чую, що вам дуже важко.

Будь ласка, негайно зверніться за професійною допомогою:

📞 Кризова лінія: 0 800 500 225 (цілодобово)
📞 Лінія довіри: 5522 (з мобільного)
📞 Екстрена допомога: 103

Ви не самотні. Поруч є люди, які готові допомогти. 🫂"""
    
    return random.choice(responses)

def get_ai_response(user_message, chat_history=[], user_id=None):
    if not GOOGLE_AI_AVAILABLE or not model:
        return generate_local_response(user_message)
    
    try:
        context = system_prompt + "\n\n"
        
        if user_id and user_id in enhanced_system.user_context:
            conversation_summary = enhanced_system.get_conversation_summary(user_id)
            context += f"КОНТЕКСТ РОЗМОВИ:\n{conversation_summary}\n\n"
        
        if chat_history:
            context += "ОСТАННІ ПОВІДОМЛЕННЯ:\n"
            for msg in chat_history[-25:]:
                role = "Користувач" if msg['role'] == 'user' else "Психолог"
                context += f"{role}: {msg['content']}\n"
            context += "\n"
        
        context += f"ПОТОЧНЕ ПОВІДОМЛЕННЯ КОРИСТУВАЧА: {user_message}\n\n"
        context += "ТВОЯ ВІДПОВІДЬ (емпатична, професійна, 5-15 речень з емодзі):"
        
        response = model.generate_content(
            context,
            generation_config=genai.types.GenerationConfig(
                temperature=0.8,
                max_output_tokens=3000,
                top_p=0.9,
            )
        )
        
        if user_id:
            enhanced_system.update_context(user_id, user_message, response.text)
        
        return response.text
        
    except Exception as e:
        logging.error(f"Помилка Google AI: {e}")
        if "quota" in str(e).lower() or "429" in str(e):
            return generate_local_response(user_message)
        return "Вибач, сталася технічна помилка... Але я чую тебе і хочу допомогти. Спробуй, будь ласка, ще раз🫂"

# ==================== ДЕКОРАТОР ТОКЕНА ====================

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({"success": False, "message": "Токен відсутній"}), 401
        
        try:
            if token.startswith('Bearer '):
                token = token[7:]
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('SELECT id, email, name FROM users WHERE id = ? AND is_active = TRUE', (data['user_id'],))
            user = cursor.fetchone()
            conn.close()
            
            if not user:
                return jsonify({"success": False, "message": "Користувач не знайдений"}), 401
                
            request.current_user = {
                'id': user[0],
                'email': user[1],
                'name': user[2]
            }
        except jwt.ExpiredSignatureError:
            return jsonify({"success": False, "message": "Токен закінчився"}), 401
        except Exception as e:
            logging.error(f"Помилка перевірки токена: {e}")
            return jsonify({"success": False, "message": "Невірний токен"}), 401
        
        return f(*args, **kwargs)
    return decorated


# ==================== СТАТИЧНІ МАРШРУТИ ====================

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy', 
        'timestamp': datetime.now().isoformat(),
        'google_ai_available': GOOGLE_AI_AVAILABLE,
        'active_model': ACTIVE_MODEL,
        'database': 'connected',
        'multimodal_available': MULTIMODAL_AVAILABLE,
        'features': {
            'voice': True,
            'video': False,  # <-- ВИМКНЕНО
            'text': True
        }
    })


# ==================== АВТОРИЗАЦІЯ ====================

@app.route("/api/register", methods=["POST"])
def register():
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        name = data.get('name', '').strip()

        if not email or not password or not name:
            return jsonify({"success": False, "message": "Будь ласка, заповніть всі поля"}), 400

        if len(password) < 6:
            return jsonify({"success": False, "message": "Пароль повинен містити щонайменше 6 символів"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
        if cursor.fetchone():
            conn.close()
            return jsonify({"success": False, "message": "Користувач з такою поштою вже існує"}), 400

        user_id = str(uuid.uuid4())
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')
        
        cursor.execute(
            'INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)',
            (user_id, email, name, password_hash)
        )
        
        conn.commit()
        conn.close()
        
        return jsonify({
            "success": True, 
            "message": "Реєстрація успішна!",
            "user_id": user_id
        })
    
    except Exception as e:
        logging.error(f"Помилка реєстрації: {e}")
        return jsonify({"success": False, "message": "Помилка сервера"}), 500

@app.route("/api/login", methods=["POST"])
def login():
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')

        if not email or not password:
            return jsonify({"success": False, "message": "Будь ласка, заповніть всі поля"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id, name, password_hash FROM users WHERE email = ? AND is_active = TRUE', (email,))
        user = cursor.fetchone()
        
        if not user:
            conn.close()
            return jsonify({"success": False, "message": "Невірний email або пароль"}), 401

        password_valid = bcrypt.checkpw(password.encode('utf-8'), user[2].encode('utf-8'))
        
        if not password_valid:
            conn.close()
            return jsonify({"success": False, "message": "Невірний email або пароль"}), 401

        cursor.execute(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            (user[0],)
        )
        
        conn.commit()
        conn.close()

        token_payload = {
            'user_id': user[0],
            'exp': datetime.utcnow() + timedelta(days=7)
        }
        
        token = jwt.encode(token_payload, app.config['SECRET_KEY'], algorithm='HS256')

        return jsonify({
            "success": True, 
            "message": "Вхід успішний!",
            "token": token,
            "user": {
                "id": user[0],
                "name": user[1],
                "email": email
            }
        })
    
    except Exception as e:
        logging.error(f"Помилка входу: {e}")
        return jsonify({"success": False, "message": "Помилка сервера"}), 500

@app.route("/api/profile", methods=["GET"])
@token_required
def get_profile():
    return jsonify({
        "success": True,
        "user": request.current_user
    })


# ==================== ЧАТИ ====================

@app.route("/api/chats", methods=["GET"])
@token_required
def get_user_chats():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT c.id, c.title, c.created_at, c.last_message, c.last_activity,
                   c.message_count
            FROM chats c
            WHERE c.user_id = ? AND c.is_archived = FALSE
            ORDER BY c.last_activity DESC
        ''', (request.current_user['id'],))
        
        chats = []
        for row in cursor.fetchall():
            chats.append({
                'id': row[0],
                'title': row[1],
                'created_at': row[2],
                'last_message': row[3] or 'Немає повідомлень',
                'last_activity': row[4],
                'message_count': row[5] or 0
            })
        
        conn.close()
        return jsonify({"success": True, "chats": chats})
    
    except Exception as e:
        logging.error(f"Помилка отримання чатів: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/chat/<chat_id>", methods=["GET"])
@token_required
def get_chat_by_id(chat_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT user_id, title, created_at, last_activity, message_count, last_message FROM chats WHERE id = ?', (chat_id,))
        chat = cursor.fetchone()
        
        if not chat or chat[0] != request.current_user['id']:
            conn.close()
            return jsonify({"success": False, "message": "Чат не знайдено"}), 404
        
        cursor.execute('''
            SELECT id, role, content, timestamp, is_critical, classification
            FROM messages 
            WHERE chat_id = ? 
            ORDER BY timestamp ASC
        ''', (chat_id,))
        
        messages = []
        for row in cursor.fetchall():
            msg = {
                'id': row[0],
                'role': row[1],
                'content': row[2],
                'timestamp': row[3],
                'is_critical': bool(row[4])
            }
            if row[5]:
                try:
                    class_data = json.loads(row[5])
                    if 'type' in class_data:
                        msg['type'] = class_data['type']
                    if 'emotions' in class_data:
                        msg['emotions'] = class_data['emotions']
                except:
                    pass
            
            if 'type' not in msg:
                msg['type'] = 'text'
            
            messages.append(msg)
        
        conn.close()
        
        return jsonify({
            "success": True,
            "chat": {
                'id': chat_id,
                'title': chat[1],
                'created_at': chat[2],
                'last_activity': chat[3],
                'message_count': chat[4] or 0,
                'last_message': chat[5] or 'Немає повідомлень',
                'messages': messages
            }
        })
        
    except Exception as e:
        logging.error(f"Помилка отримання чату: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/chat/new", methods=["POST"])
@token_required
def create_new_chat():
    try:
        data = request.get_json() or {}
        title = data.get('title', f'Чат {datetime.now().strftime("%d.%m %H:%M")}')
        
        conn = get_db_connection()
        cursor = conn.cursor()

        chat_id = str(uuid.uuid4())
        cursor.execute('''
            INSERT INTO chats (id, user_id, title, created_at, last_activity, message_count)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
        ''', (chat_id, request.current_user['id'], title))
        
        conn.commit()
        conn.close()
        
        return jsonify({"success": True, "chat_id": chat_id})
    
    except Exception as e:
        logging.error(f"Помилка створення чату: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/talk", methods=["POST"])
def talk():
    try:
        data = request.get_json()
        user_message = data.get("message", "").strip()
        chat_id = data.get("chat_id")
        
        if not user_message:
            return jsonify({"answer": "🫂 Будь ласка, поділись тим, що на душі."}), 400

        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None
        
        chat_history = []
        current_user = None
        
        if token:
            try:
                data_jwt = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
                
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute('SELECT id, email, name FROM users WHERE id = ? AND is_active = TRUE', (data_jwt['user_id'],))
                user = cursor.fetchone()
                
                if user:
                    current_user = {
                        'id': user[0],
                        'email': user[1],
                        'name': user[2]
                    }
                    
                    if chat_id:
                        cursor.execute('SELECT user_id FROM chats WHERE id = ?', (chat_id,))
                        chat = cursor.fetchone()
                        
                        if chat and chat[0] == current_user['id']:
                            cursor.execute('''
                                SELECT role, content FROM messages 
                                WHERE chat_id = ? 
                                ORDER BY timestamp DESC LIMIT 10
                            ''', (chat_id,))
                            
                            history = cursor.fetchall()
                            history.reverse()
                            
                            for role, content in history:
                                chat_history.append({'role': role, 'content': content})
                
                conn.close()
            except Exception as e:
                logging.error(f"Помилка авторизації: {e}")

        bot_response = get_ai_response(user_message, chat_history, current_user['id'] if current_user else None)

        if current_user:
            conn = get_db_connection()
            cursor = conn.cursor()
            
            if not chat_id:
                chat_id = str(uuid.uuid4())
                title = user_message[:30] + '...' if len(user_message) > 30 else user_message
                cursor.execute('''
                    INSERT INTO chats (id, user_id, title, created_at, last_activity, message_count)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
                ''', (chat_id, current_user['id'], title))
            
            classifier = EmotionalClassifier()
            classification = classifier.classify_message(user_message)
            is_critical = classification['severity'] in ['high', 'critical'] 
            sentiment = advanced_analytics.analyze_sentiment(user_message)
            
            cursor.execute('''
                INSERT INTO messages (id, chat_id, role, content, is_critical, classification, sentiment_score, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ''', (str(uuid.uuid4()), chat_id, 'user', user_message, is_critical, json.dumps(classification), sentiment))
            
            cursor.execute('''
                INSERT INTO messages (id, chat_id, role, content, timestamp)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ''', (str(uuid.uuid4()), chat_id, 'assistant', bot_response))
            
            cursor.execute('''
                UPDATE chats 
                SET last_message = ?, last_activity = CURRENT_TIMESTAMP, message_count = message_count + 2
                WHERE id = ?
            ''', (user_message[:50], chat_id))
            
            conn.commit()
            conn.close()
            
            advanced_analytics.record_user_activity(current_user['id'], user_message, bot_response, is_critical)
            
            print(f"✅ Збережено повідомлення в чат {chat_id}")
            
        return jsonify({
            "answer": bot_response,
            "chat_id": chat_id if current_user else None
        })
    
    except Exception as e:
        logging.error(f"Помилка talk: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "answer": "🫂 Вибачте, сталася технічна помилка. Спробуйте ще раз."
        }), 500


# ==================== МУЛЬТИМОДАЛЬНИЙ ЕНДПОІНТ (БІМОДАЛЬНИЙ) ====================

@app.route('/api/analyze-multimodal', methods=['POST'])
@token_required
def analyze_multimodal():
    """Комбінований бімодальний аналіз (голос + текст) — ВІДЕО ВИМКНЕНО"""
    if not MULTIMODAL_AVAILABLE:
        return jsonify({'error': 'Multimodal processing not available'}), 503
    
    try:
        data = request.get_json() or {}
        
        # Отримуємо дані
        audio_data = data.get('audio')  # base64 аудіо
        # video_data = data.get('video')  # <-- ЗАКОМЕНТОВАНО
        text = data.get('text', '')
        
        results = {}
        
        # Аналіз голосу
        if audio_data and voice_processor:
            try:
                # Зберегти тимчасовий файл
                audio_bytes = base64.b64decode(audio_data)
                with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp:
                    tmp.write(audio_bytes)
                    audio_path = tmp.name
                
                transcription = voice_processor.transcribe(audio_path)
                
                if voice_emotion is not None:
                    voice_features = voice_emotion.extract_features(audio_path)
                    voice_emotions = voice_emotion.classify_emotion_from_voice(voice_features)
                else:
                    voice_features = {}
                    voice_emotions = {'emotion': 'neutral', 'confidence': 0}
                
                results['voice'] = {
                    'transcription': transcription.get('text', ''),
                    'emotions': voice_emotions,
                    'confidence': transcription.get('confidence', 0)
                }
                
                # Доповнюємо текст якщо не надано
                if not text and transcription.get('text'):
                    text = transcription['text']
                
                os.unlink(audio_path)
                
            except Exception as e:
                logging.error(f"Voice analysis error: {e}")
                results['voice_error'] = str(e)
        
        # Аналіз тексту
        text_emotions = EmotionalClassifier().classify_message(text)
        results['text'] = {
            'emotions': text_emotions,
            'text': text[:100] + '...' if len(text) > 100 else text
        }
        
        # Ф'юзія (БІМОДАЛЬНА — без відео)
        if fusion_engine:
            fusion_result = fusion_engine.fuse(
                text_result=text_emotions,
                voice_result=results.get('voice', {}).get('emotions'),
                # video_result=results.get('video', {}).get('emotions'),  # <-- ЗАКОМЕНТОВАНО
                text_raw=text
            )
            
            results['fused'] = {
                'dominant_emotion': fusion_result.get_dominant_emotion()[0],
                'confidence': fusion_result.confidence,
                'crisis_indicators': fusion_result.crisis_indicators,
                'is_crisis': len(fusion_result.crisis_indicators) > 0,
                'modalities': fusion_result.available_modalities
            }
        
        return jsonify({
            'success': True,
            'results': results,
            'note': 'Video analysis disabled for bachelor version'
        })
        
    except Exception as e:
        logging.error(f"Multimodal analysis error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== ЕНДПОІНТИ ДЛЯ ЗАПИСУ ГОЛОСУ ====================

@app.route('/api/analyze-voice', methods=['POST'])
def analyze_voice_audio():
    """Аналіз голосового повідомлення"""
    if not MULTIMODAL_AVAILABLE or not voice_processor:
        return jsonify({'error': 'Voice processing not available'}), 503
    
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
    
    file = request.files['audio']
    if file.filename == '':
        return jsonify({'error': 'Empty file'}), 400
    
    upload_folder = Path('uploads/voice')
    upload_folder.mkdir(parents=True, exist_ok=True)
    
    filename = f"{uuid.uuid4()}_{secure_filename(file.filename)}"
    filepath = upload_folder / filename
    
    try:
        file.save(filepath)
        
        transcription = voice_processor.transcribe(str(filepath))

        if voice_emotion is not None:
            voice_features = voice_emotion.extract_features(str(filepath))
            voice_emotions_result = voice_emotion.classify_emotion_from_voice(voice_features)
        else:
            voice_features = {}
            voice_emotions_result = {'emotion': 'neutral', 'confidence': 0, 'probabilities': {}}
        
        text_emotions = EmotionalClassifier().classify_message(transcription['text'])
        
        if fusion_engine is not None:
            result = fusion_engine.fuse(
                text_result=text_emotions,
                voice_result=voice_emotions_result,
                text_raw=transcription['text']
            )
        
        if os.path.exists(filepath):
            os.remove(filepath)
        
        return jsonify({
            'success': True,
            'transcription': transcription['text'],
            'transcription_confidence': transcription.get('confidence', 0),
            'voice_emotions': voice_emotions_result,
            'text_emotions': text_emotions,
            'fused_emotions': result.fused_emotion if fusion_engine else {},
            'fused_dominant': result.get_dominant_emotion()[0] if fusion_engine else 'neutral',
            'confidence': result.confidence if fusion_engine else 0,
            'crisis_indicators': result.crisis_indicators if fusion_engine else [],
            'is_crisis': len(result.crisis_indicators) > 0 if fusion_engine else False,
            'modalities_used': result.available_modalities if fusion_engine else ['text']
        })
        
    except Exception as e:
        logging.error(f"Voice analysis error: {e}")
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route("/api/save-voice-message", methods=["POST"])
@token_required
def save_voice_message_to_db():
    """Збереження голосового повідомлення в БД"""
    try:
        data = request.get_json()
        
        chat_id = data.get('chat_id')
        message_id = data.get('message_id')
        transcription = data.get('transcription', '')
        voice_emotions = data.get('voice_emotions', {})
        fused_emotions = data.get('fused_emotions', {})
        is_crisis = data.get('is_crisis', False)
        
        if not chat_id:
            chat_id = str(uuid.uuid4())
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO chats (id, user_id, title, created_at, last_activity) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
                (chat_id, request.current_user['id'], 'Голосовий чат')
            )
            conn.commit()
            conn.close()
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO messages (id, chat_id, role, content, is_critical, classification, sentiment_score)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            message_id or str(uuid.uuid4()), 
            chat_id, 
            'user', 
            transcription or '[Голосове повідомлення]',
            is_crisis,
            json.dumps({'voice_emotions': voice_emotions, 'fused_emotions': fused_emotions}),
            0
        ))
        
        cursor.execute('''
            UPDATE chats 
            SET last_message = ?, last_activity = CURRENT_TIMESTAMP, message_count = message_count + 1
            WHERE id = ?
        ''', (transcription[:50] + '...' if transcription else 'Голосове повідомлення', chat_id))
        
        conn.commit()
        conn.close()
        
        advanced_analytics.record_user_activity(
            request.current_user['id'],
            transcription or '[Голосове]',
            '',
            is_crisis
        )
        
        return jsonify({"success": True, "chat_id": chat_id})
        
    except Exception as e:
        logging.error(f"Помилка збереження голосу: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# ==================== АНАЛІТИКА ====================

@app.route("/api/analytics/user", methods=["GET"])
@token_required
def get_user_analytics_data():
    """Базова аналітика користувача"""
    try:
        user_id = request.current_user['id']
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                COUNT(*) as total_messages,
                SUM(CASE WHEN is_critical THEN 1 ELSE 0 END) as critical_messages,
                AVG(sentiment_score) as avg_sentiment
            FROM messages m
            JOIN chats c ON m.chat_id = c.id
            WHERE c.user_id = ?
        ''', (user_id,))
        
        stats = cursor.fetchone()
        
        cursor.execute('''
            SELECT classification, COUNT(*) as count
            FROM messages m
            JOIN chats c ON m.chat_id = c.id
            WHERE c.user_id = ? AND classification IS NOT NULL
            GROUP BY classification
        ''', (user_id,))
        
        categories_counter = Counter()
        for row in cursor.fetchall():
            try:
                class_data = json.loads(row[0])
                for cat in class_data.get('categories', []):
                    categories_counter[cat] += row[1]
            except:
                pass
        
        cursor.execute('''
            SELECT timestamp 
            FROM messages m
            JOIN chats c ON m.chat_id = c.id
            WHERE c.user_id = ?
            ORDER BY timestamp DESC
            LIMIT 1
        ''', (user_id,))
        
        last_activity_row = cursor.fetchone()
        last_activity = last_activity_row[0] if last_activity_row else None
        
        cursor.execute('''
            SELECT is_critical
            FROM messages m
            JOIN chats c ON m.chat_id = c.id
            WHERE c.user_id = ?
            ORDER BY timestamp DESC
            LIMIT 10
        ''', (user_id,))
        
        recent_messages = cursor.fetchall()
        recent_critical = sum(1 for msg in recent_messages if msg[0])
        
        cursor.execute('''
            SELECT is_critical
            FROM messages m
            JOIN chats c ON m.chat_id = c.id
            WHERE c.user_id = ?
            ORDER BY timestamp ASC
            LIMIT 10
        ''', (user_id,))
        
        older_messages = cursor.fetchall()
        older_critical = sum(1 for msg in older_messages if msg[0])
        
        if recent_critical > older_critical:
            severity_trend = 'worsening'
        elif recent_critical < older_critical:
            severity_trend = 'improving'
        else:
            severity_trend = 'stable'
        
        conn.close()
        
        top_categories = [cat for cat, _ in categories_counter.most_common(3)]
        avg_sentiment = round(stats[2] or 0, 2)
        
        if avg_sentiment > 0.3:
            sentiment_text = "позитивний"
            sentiment_emoji = "😊"
        elif avg_sentiment > 0:
            sentiment_text = "хороший"
            sentiment_emoji = "🙂"
        elif avg_sentiment > -0.3:
            sentiment_text = "нейтральний"
            sentiment_emoji = "😐"
        elif avg_sentiment > -0.6:
            sentiment_text = "пригнічений"
            sentiment_emoji = "😔"
        else:
            sentiment_text = "важкий"
            sentiment_emoji = "😢"
        
        insights = {
            'message_count': stats[0] or 0,
            'critical_messages': stats[1] or 0,
            'avg_sentiment': avg_sentiment,
            'sentiment_text': sentiment_text,
            'sentiment_emoji': sentiment_emoji,
            'top_categories': top_categories,
            'severity_trend': severity_trend,
            'last_activity': last_activity,
            'sentiment_trend': severity_trend
        }
        
        return jsonify({"success": True, "insights": insights})
        
    except Exception as e:
        logging.error(f"Помилка аналітики: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/analytics/advanced", methods=["GET"])
@token_required
def get_advanced_user_analytics():
    """Розширена аналітика користувача"""
    try:
        days = request.args.get('days', 30, type=int)
        analytics = advanced_analytics.get_comprehensive_analytics(request.current_user['id'], days)
        
        return jsonify(analytics)
    
    except Exception as e:
        logging.error(f"Помилка розширеної аналітики: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/analytics/global", methods=["GET"])
def get_global_analytics_data():
    """Глобальна статистика системи"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) FROM users WHERE is_active = TRUE')
        total_users = cursor.fetchone()[0] or 0
        
        cursor.execute('SELECT COUNT(*) FROM messages')
        total_messages = cursor.fetchone()[0] or 0
        
        cursor.execute('SELECT COUNT(*) FROM messages WHERE is_critical = TRUE')
        critical_messages = cursor.fetchone()[0] or 0
        
        cursor.execute('SELECT COUNT(*) FROM chats')
        total_chats = cursor.fetchone()[0] or 0
        
        conn.close()
        
        return jsonify({
            "success": True,
            "total_users": total_users,
            "total_messages": total_messages,
            "critical_messages": critical_messages,
            "total_chats": total_chats
        })
    
    except Exception as e:
        logging.error(f"Помилка глобальної аналітики: {e}")
        return jsonify({"success": False, "message": "Помилка сервера"}), 500


# ==================== ДОДАТКОВІ ЕНДПОІНТИ ЧАТІВ ====================

@app.route("/api/chat/<chat_id>/rename", methods=["PUT"])
@token_required
def rename_chat_by_id(chat_id):
    """Перейменування чату"""
    try:
        data = request.get_json()
        new_title = data.get('title', '').strip()
        
        if not new_title:
            return jsonify({"success": False, "message": "Назва не може бути порожньою"}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT user_id FROM chats WHERE id = ?', (chat_id,))
        chat = cursor.fetchone()
        
        if not chat or chat[0] != request.current_user['id']:
            conn.close()
            return jsonify({"success": False, "message": "Чат не знайдено"}), 404
        
        cursor.execute('UPDATE chats SET title = ? WHERE id = ?', (new_title, chat_id))
        conn.commit()
        conn.close()
        
        return jsonify({"success": True})
        
    except Exception as e:
        logging.error(f"Помилка перейменування чату: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/chat/<chat_id>", methods=["DELETE"])
@token_required
def delete_chat_by_id(chat_id):
    """Видалення чату"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT user_id FROM chats WHERE id = ?', (chat_id,))
        chat = cursor.fetchone()
        
        if not chat or chat[0] != request.current_user['id']:
            conn.close()
            return jsonify({"success": False, "message": "Чат не знайдено"}), 404
        
        cursor.execute('DELETE FROM messages WHERE chat_id = ?', (chat_id,))
        cursor.execute('DELETE FROM chats WHERE id = ?', (chat_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({"success": True})
        
    except Exception as e:
        logging.error(f"Помилка видалення чату: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/chat/<chat_id>/message/<message_id>", methods=["DELETE"])
@token_required
def delete_message_by_id(chat_id, message_id):
    """Видалення конкретного повідомлення"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT user_id FROM chats WHERE id = ?', (chat_id,))
        chat = cursor.fetchone()
        
        if not chat or chat[0] != request.current_user['id']:
            conn.close()
            return jsonify({"success": False, "message": "Чат не знайдено"}), 404
        
        cursor.execute('DELETE FROM messages WHERE id = ? AND chat_id = ?', (message_id, chat_id))
        
        cursor.execute('''
            UPDATE chats 
            SET message_count = (SELECT COUNT(*) FROM messages WHERE chat_id = ?)
            WHERE id = ?
        ''', (chat_id, chat_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({"success": True})
        
    except Exception as e:
        logging.error(f"Помилка видалення повідомлення: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/chat/<chat_id>/export", methods=["GET"])
@token_required
def export_chat_by_id(chat_id):
    """Експорт чату"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT user_id, title FROM chats WHERE id = ?', (chat_id,))
        chat = cursor.fetchone()
        
        if not chat or chat[0] != request.current_user['id']:
            conn.close()
            return jsonify({"success": False, "message": "Чат не знайдено"}), 404
        
        cursor.execute('''
            SELECT role, content, timestamp, is_critical
            FROM messages 
            WHERE chat_id = ? 
            ORDER BY timestamp ASC
        ''', (chat_id,))
        
        messages = []
        for row in cursor.fetchall():
            messages.append({
                'role': row[0],
                'content': row[1],
                'timestamp': row[2],
                'is_critical': bool(row[3])
            })
        
        conn.close()
        
        return jsonify({
            "success": True,
            "chat_title": chat[1],
            "messages": messages
        })
        
    except Exception as e:
        logging.error(f"Помилка експорту чату: {e}")
        return jsonify({"success": False, "message": str(e)}), 500


# ==================== ДІАГНОСТИЧНІ ЕНДПОІНТИ ====================

@app.route("/api/debug/messages", methods=["GET"])
@token_required
def debug_messages():
    """Діагностичний ендпоінт для перевірки кількості повідомлень"""
    try:
        user_id = request.current_user['id']
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Загальна кількість
        cursor.execute('''
            SELECT COUNT(*) FROM messages m
            JOIN chats c ON m.chat_id = c.id
            WHERE c.user_id = ?
        ''', (user_id,))
        total = cursor.fetchone()[0]
        
        # Кількість за ролями
        cursor.execute('''
            SELECT role, COUNT(*) FROM messages m
            JOIN chats c ON m.chat_id = c.id
            WHERE c.user_id = ?
            GROUP BY role
        ''', (user_id,))
        by_role = cursor.fetchall()
        
        # Кількість за чатами
        cursor.execute('''
            SELECT c.id, c.title, COUNT(m.id) as msg_count
            FROM chats c
            LEFT JOIN messages m ON c.id = m.chat_id
            WHERE c.user_id = ?
            GROUP BY c.id
            ORDER BY msg_count DESC
        ''', (user_id,))
        by_chat = cursor.fetchall()
        
        conn.close()
        
        return jsonify({
            "success": True,
            "total_messages": total,
            "by_role": [{"role": r[0], "count": r[1]} for r in by_role],
            "by_chat": [{"chat_id": c[0], "title": c[1], "messages": c[2]} for c in by_chat]
        })
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ==================== ЗАПУСК ====================

if __name__ == "__main__":
    init_db()
    init_analytics_tables()
    print("✅ База даних ініціалізована")
    print("🚀 Сервер запускається на http://127.0.0.1:5003")
    
    if GOOGLE_AI_AVAILABLE:
        print(f"🧠 ПРОФЕСІЙНИЙ ПСИХОЛОГІЧНИЙ РЕЖИМ АКТИВОВАНО!")
        print(f"💫 Використовується модель: {ACTIVE_MODEL}")
        print("📊 РОЗШИРЕНА АНАЛІТИКА: АКТИВОВАНО")
        print("🎙️ ГОЛОСОВИЙ АНАЛІЗ: АКТИВОВАНО")
        # print("🎥 ВІДЕО АНАЛІЗ: ВИМКНЕНО (заплановано для магістратури)")  # <-- ЗАКОМЕНТОВАНО
    else:
        print("❌ Google AI не доступний")
        print("💡 Використовуються розумні резервні відповіді")
    
    app.run(debug=True, port=5003)