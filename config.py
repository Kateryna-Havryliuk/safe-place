# config.py
import os
from pathlib import Path

BASE_DIR = Path(__file__).parent

class Config:
    # Існуюче (з твого app.py перенести сюди)
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key')
    DATABASE_PATH = BASE_DIR / 'safeplace.db'
    
    # НОВЕ: Google AI
    GOOGLE_API_KEY = os.getenv('GOOGLE_AI_API_KEY')
    
    # НОВЕ: Налаштування голосу
    VOICE_UPLOAD_FOLDER = BASE_DIR / 'uploads' / 'voice'
    VOICE_MAX_DURATION = 60  # секунд
    ALLOWED_VOICE_EXTENSIONS = {'wav', 'mp3', 'ogg', 'm4a'}
    
    # НОВЕ: Налаштування відео
    VIDEO_UPLOAD_FOLDER = BASE_DIR / 'uploads' / 'video'
    VIDEO_MAX_DURATION = 30  # секунд (короткі відео для емоцій)
    
    # НОВЕ: Шляхи до моделей
    MODELS_DIR = BASE_DIR / 'static' / 'models'
    VOICE_MODEL_PATH = MODELS_DIR / 'voice_emotion_model.pkl'
    FACE_MODEL_PATH = MODELS_DIR / 'face_emotion_model.pth'
    
    # НОВЕ: Пороги для кризових ситуацій
    CRISIS_VOICE_THRESHOLD = 0.7
    CRISIS_VIDEO_THRESHOLD = 0.8

    # Налаштування моделей
    FACEMESH_CONFIDENCE = 0.5
    WHISPER_MODEL = "tiny"  # або "base", "small", "medium", "large"

# Створення папок
Config.VOICE_UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
Config.VIDEO_UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
Config.MODELS_DIR.mkdir(parents=True, exist_ok=True)