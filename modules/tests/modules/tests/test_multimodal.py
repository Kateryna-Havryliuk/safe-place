#!/usr/bin/env python3
"""
Тестування мультимодального пайплайну
"""

import requests
import base64
import json
from pathlib import Path

BASE_URL = "http://127.0.0.1:5000"

def test_health():
    """Перевірка статусу сервера"""
    r = requests.get(f"{BASE_URL}/api/health")
    print("Health:", r.json())
    return r.json().get('google_ai_available', False)

def test_text_only():
    """Тест тільки тексту"""
    print("\n=== ТЕСТ 1: Тільки текст ===")
    r = requests.post(f"{BASE_URL}/api/analyze-multimodal", json={
        "text": "Я дуже стресую через іспити, не можу заснути вже третю ніч",
        "voice": None,
        "video": None
    })
    result = r.json()
    print(f"Success: {result.get('success')}")
    print(f"Emotions: {result.get('emotion_analysis', {}).get('fused')}")
    print(f"Modalities: {result.get('modalities_used')}")
    print(f"Crisis: {result.get('crisis_detected')}")
    return result

def test_with_mock_voice():
    """Тест з моковими голосовими даними"""
    print("\n=== ТЕСТ 2: Текст + голос (mock) ===")
    # Створюємо фейковий base64 аудіо (тихий шум)
    import numpy as np
    import soundfile as sf
    import io
    
    # Генеруємо 2 секунди "емоційного" аудіо
    samples = np.random.normal(0, 0.1, 44100 * 2).astype(np.float32)
    buffer = io.BytesIO()
    sf.write(buffer, samples, 44100, format='WAV')
    audio_b64 = base64.b64encode(buffer.getvalue()).decode()
    
    r = requests.post(f"{BASE_URL}/api/analyze-multimodal", json={
        "text": "Я так злюся! Все йде не так!",
        "voice": f"data:audio/wav;base64,{audio_b64}",
        "video": None
    })
    result = r.json()
    print(f"Success: {result.get('success')}")
    print(f"Modalities: {result.get('modalities_used')}")
    print(f"Weights: {result.get('modality_weights')}")
    return result

def test_crisis_detection():
    """Тест виявлення кризи"""
    print("\n=== ТЕСТ 3: Кризовий сценарій ===")
    r = requests.post(f"{BASE_URL}/api/analyze-multimodal", json={
        "text": "Я не бачу сенсу жити далі, хочу покінчити з собою",
        "debug": True
    })
    result = r.json()
    print(f"Crisis detected: {result.get('crisis_detected')}")
    print(f"Crisis level: {result.get('crisis_level')}")
    print(f"Indicators: {result.get('crisis_indicators')}")
    if result.get('explanation'):
        print(f"\nExplanation:\n{result.get('explanation')}")
    return result

def test_voice_endpoint():
    """Тест прямого завантаження аудіо"""
    print("\n=== ТЕСТ 4: Voice endpoint ===")
    
    # Створюємо тестовий аудіофайл
    import numpy as np
    import soundfile as sf
    import tempfile
    
    # Симулюємо "тривожне" аудіо — висока частота, варіативність
    t = np.linspace(0, 3, 44100 * 3)
    # Частота модуляції (тремтіння голосу)
    freq = 200 + 50 * np.sin(2 * np.pi * 5 * t)  # 200Hz ± 50Hz, 5Hz модуляція
    audio = 0.3 * np.sin(2 * np.pi * freq * t)
    audio += 0.1 * np.random.normal(0, 1, len(audio))  # Шум
    
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        sf.write(f.name, audio.astype(np.float32), 44100)
        
        with open(f.name, 'rb') as audio_file:
            files = {'audio': ('test_anxiety.wav', audio_file, 'audio/wav')}
            r = requests.post(f"{BASE_URL}/api/analyze-voice", files=files)
            result = r.json()
            print(f"Success: {result.get('success')}")
            print(f"Transcription: {result.get('transcription', 'N/A')[:100]}...")
            print(f"Voice emotions: {result.get('voice_emotions', {}).get('emotions')}")
            print(f"Fused dominant: {result.get('fused_dominant')}")

if __name__ == "__main__":
    print("🚀 Запуск тестів мультимодального аналізу")
    
    # Перевірка з'єднання
    try:
        test_health()
    except Exception as e:
        print(f"❌ Сервер недоступний: {e}")
        print("Запустіть спочатку: python app.py")
        exit(1)
    
    # Запуск тестів
    test_text_only()
    # test_with_mock_voice()  # Розкоментуйте якщо є numpy/soundfile
    test_crisis_detection()
    # test_voice_endpoint()   # Розкоментуйте для тесту завантаження файлів
    
    print("\n✅ Тести завершено!")