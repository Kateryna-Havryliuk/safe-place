import os
import logging
import numpy as np
from typing import Dict, Optional, Tuple
import tempfile
import soundfile as sf
from pathlib import Path
import json

# Спроба імпорту з обробкою помилок
try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False
    logging.warning("Whisper не встановлено")

try:
    import librosa
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False
    logging.warning("Librosa не встановлено")

try:
    import soundfile as sf
    SOUNDFILE_AVAILABLE = True
except ImportError:
    SOUNDFILE_AVAILABLE = False
    logging.warning("Soundfile не встановлено")

try:
    import torch
    import torch.nn as nn
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logging.warning("PyTorch не встановлено")

from config import Config


class VoiceProcessor:
    """
    Обробка голосових повідомлень:
    - Розпізнавання мови (Whisper)
    - Аналіз тональності голосу
    - Виділення просодичних характеристик
    """
    
    def __init__(self):
        self.whisper_model = None
        self.sample_rate = 16000
        
        # Ліниве завантаження моделей (тільки коли потрібно)
        self._load_models()
    
    def _load_models(self):
        """Завантажує моделі при першому використанні"""
        if WHISPER_AVAILABLE and self.whisper_model is None:
            try:
                print(f"🔄 Завантаження Whisper моделі (tiny)...")
                self.whisper_model = whisper.load_model("tiny")
                print("✅ Whisper модель завантажена")
            except Exception as e:
                logging.error(f"Помилка завантаження Whisper: {e}")
    
    def transcribe(self, audio_path: str) -> Dict:
        """
        Розпізнає текст з аудіофайлу
        Повертає: текст, мова, впевненість
        """
        if not WHISPER_AVAILABLE:
            print("⚠️ Whisper не встановлено, транскрипція недоступна")
            return {
                'text': '',
                'language': 'uk',
                'confidence': 0,
                'error': 'whisper_not_installed'
            }
        
        # Перевіряємо чи модель завантажена
        if self.whisper_model is None:
            try:
                self._load_models()
                if self.whisper_model is None:
                    return {
                        'text': '',
                        'language': 'uk',
                        'confidence': 0,
                        'error': 'model_load_failed'
                    }
            except Exception as e:
                print(f"❌ Помилка завантаження Whisper: {e}")
                return {
                    'text': '',
                    'language': 'uk',
                    'confidence': 0,
                    'error': 'model_load_failed'
                }
        
        try:
            # Конвертуємо аудіо в потрібний формат
            audio_path = self._ensure_wav_format(audio_path)
            
            # Перевіряємо довжину аудіо
            duration = librosa.get_duration(filename=audio_path)
            if duration < 0.5:
                print(f"⚠️ Аудіо занадто коротке: {duration} сек")
                return {
                    'text': '',
                    'language': 'uk',
                    'confidence': 0,
                    'error': 'audio_too_short'
                }
            
            print(f"🎤 Транскрипція аудіо тривалістю {duration:.1f} сек...")
            
            # Транскрипція (перевіряємо що модель не None)
            if self.whisper_model is None:
                return {
                    'text': '',
                    'language': 'uk',
                    'confidence': 0,
                    'error': 'model_not_loaded'
                }
            
            result = self.whisper_model.transcribe(
                audio_path,
                language='uk',
                task='transcribe',
                fp16=False,
                temperature=0.0,
                compression_ratio_threshold=2.4,
                logprob_threshold=-1.0,
                no_speech_threshold=0.6
            )
            
            text = result['text'].strip()
            
            # Якщо текст порожній, пробуємо без вказання мови
            if not text and self.whisper_model is not None:
                print("🔄 Текст не знайдено, пробуємо автоматичне визначення мови...")
                result = self.whisper_model.transcribe(
                    audio_path,
                    task='transcribe',
                    fp16=False
                )
                text = result['text'].strip()
            
            print(f"📝 Розпізнано: '{text}'")
            
            return {
                'text': text,
                'language': result.get('language', 'uk'),
                'confidence': 0.8 if text else 0,
                'segments': result.get('segments', [])
            }
            
        except Exception as e:
            logging.error(f"Помилка транскрипції: {e}")
            import traceback
            traceback.print_exc()
            return {
                'text': '',
                'language': 'uk',
                'confidence': 0,
                'error': str(e)
            }
    
    def _ensure_wav_format(self, audio_path: str) -> str:
        """Конвертує аудіо в WAV формат використовуючи ffmpeg-python"""
        if audio_path.endswith('.wav'):
            return audio_path
        
        try:
            import ffmpeg
            output_path = audio_path.replace('.webm', '.wav')
            
            ffmpeg.input(audio_path).output(
                output_path, 
                acodec='pcm_s16le', 
                ar='16000', 
                ac=1
            ).run(overwrite_output=True, quiet=True)
            
            return output_path
        except ImportError:
            print("⚠️ ffmpeg-python не встановлено")
            return audio_path
        except Exception as e:
            print(f"Помилка конвертації: {e}")
            return audio_path
    
    def extract_features(self, audio_path: str) -> Dict:
        """
        Виділяє акустичні характеристики голосу:
        - Основна частота (F0)
        - Енергія
        - Спектральні характеристики
        """
        if not LIBROSA_AVAILABLE:
            return {'error': 'Librosa недоступний'}
        
        try:
            # Завантажуємо аудіо
            audio, sr = librosa.load(audio_path, sr=self.sample_rate)
            
            # Основна частота (висота тону)
            f0, voiced_flag, _ = librosa.pyin(
                audio, 
                fmin=librosa.note_to_hz('C2'),
                fmax=librosa.note_to_hz('C7'),
                sr=sr
            )
            f0 = f0[~np.isnan(f0)]
            
            # Енергія (гучність)
            rms = librosa.feature.rms(y=audio)[0]
            
            # Спектральний центроїд (яскравість звуку)
            spectral_centroids = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
            
            # Темп мови (приблизно)
            tempo, _ = librosa.beat.beat_track(y=audio, sr=sr)
            
            features = {
                'pitch_mean': float(np.mean(f0)) if len(f0) > 0 else 0,
                'pitch_std': float(np.std(f0)) if len(f0) > 0 else 0,
                'energy_mean': float(np.mean(rms)),
                'energy_std': float(np.std(rms)),
                'spectral_centroid_mean': float(np.mean(spectral_centroids)),
                'tempo': float(tempo),
                'duration': len(audio) / sr,
                'voiced_ratio': float(len(f0) / len(audio) * sr) if len(audio) > 0 else 0
            }
            
            return features
            
        except Exception as e:
            logging.error(f"Помилка виділення характеристик: {e}")
            return {'error': str(e)}


class VoiceEmotionAnalyzer:
    """
    Аналізує емоції на основі акустичних характеристик голосу
    """
    
    def __init__(self):
        # Словник відповідності характеристик емоціям
        self.emotion_profiles = {
            'anger': {
                'pitch_range': (150, 300),
                'energy': 'high',
                'tempo_range': (120, 200),
                'description': 'Злість, роздратування'
            },
            'sadness': {
                'pitch_range': (80, 150),
                'energy': 'low',
                'tempo_range': (40, 80),
                'description': 'Сум, печаль'
            },
            'fear': {
                'pitch_range': (180, 350),
                'energy': 'medium',
                'tempo_range': (100, 180),
                'description': 'Страх, тривога'
            },
            'happiness': {
                'pitch_range': (120, 250),
                'energy': 'medium-high',
                'tempo_range': (90, 140),
                'description': 'Радість, задоволення'
            },
            'anxiety': {
                'pitch_range': (160, 280),
                'energy': 'medium',
                'tempo_range': (110, 170),
                'description': 'Тривога, неспокій'
            },
            'calm': {
                'pitch_range': (80, 140),
                'energy': 'low',
                'tempo_range': (50, 90),
                'description': 'Спокій, розслаблення'
            },
            'neutral': {
                'pitch_range': (100, 180),
                'energy': 'medium',
                'tempo_range': (70, 120),
                'description': 'Нейтральний стан'
            }
        }
        
        # Енергетичні рівні
        self.energy_levels = {
            'low': (0, 0.3),
            'medium': (0.3, 0.6),
            'medium-high': (0.6, 0.8),
            'high': (0.8, 1.0)
        }
        
        self.processor = None
    
    def extract_features(self, audio_path: str) -> Dict:
        """
        Виділяє акустичні характеристики голосу з аудіофайлу
        """
        try:
            # Створюємо екземпляр VoiceProcessor якщо потрібно
            if self.processor is None:
                self.processor = VoiceProcessor()
            
            # Використовуємо метод VoiceProcessor для виділення характеристик
            features = self.processor.extract_features(audio_path)
            
            return features
            
        except Exception as e:
            logging.error(f"Помилка в extract_features: {e}")
            # Повертаємо значення за замовчуванням при помилці
            return {
                'pitch_mean': 150.0,
                'pitch_std': 25.0,
                'energy_mean': 0.5,
                'energy_std': 0.1,
                'spectral_centroid_mean': 1500.0,
                'tempo': 120.0,
                'duration': 3.0,
                'voiced_ratio': 0.8,
                'error': str(e)
            }
    
    def classify_emotion_from_voice(self, features: Dict) -> Dict:
        """
        Класифікує емоцію на основі акустичних характеристик
        """
        if 'error' in features:
            return {'neutral': 1.0, 'error': features['error']}
        
        # Нормалізуємо енергію
        energy_norm = min(1.0, features.get('energy_mean', 0.5) * 5)
        
        # Визначаємо рівень енергії
        energy_level = 'medium'
        for level, (low, high) in self.energy_levels.items():
            if low <= energy_norm < high:
                energy_level = level
                break
        
        emotions_scores = {}
        
        for emotion, profile in self.emotion_profiles.items():
            score = 0.0
            
            # Оцінка за висотою тону
            pitch = features.get('pitch_mean', 0)
            if pitch > 0:
                pitch_low, pitch_high = profile['pitch_range']
                if pitch_low <= pitch <= pitch_high:
                    score += 0.4
                elif pitch < pitch_low:
                    score += 0.1
                elif pitch > pitch_high:
                    score += 0.2
            
            # Оцінка за енергією
            if profile['energy'] == energy_level:
                score += 0.3
            elif (profile['energy'] == 'medium' and energy_level in ['low', 'medium-high']) or \
                 (profile['energy'] == 'medium-high' and energy_level == 'high') or \
                 (profile['energy'] == 'low' and energy_level == 'medium'):
                score += 0.1
            
            # Оцінка за темпом
            tempo = features.get('tempo', 0)
            tempo_low, tempo_high = profile['tempo_range']
            if tempo_low <= tempo <= tempo_high:
                score += 0.3
            
            emotions_scores[emotion] = round(min(1.0, score), 2)
        
        # Нормалізуємо суму до 1
        total = sum(emotions_scores.values())
        if total > 0:
            emotions_scores = {k: round(v/total, 3) for k, v in emotions_scores.items()}
        else:
            emotions_scores = {'neutral': 1.0}
        
        return emotions_scores


# Функція для тестування (поза класом)
def test_whisper():
    """Тестує чи працює Whisper"""
    print("🧪 Тестування Whisper...")
    
    if not WHISPER_AVAILABLE:
        print("❌ Whisper не встановлено. Встановіть: pip install openai-whisper")
        return False
    
    try:
        import whisper
        print(f"✅ Whisper версія: {whisper.__version__}")
        
        # Спробуємо завантажити модель
        model = whisper.load_model("tiny")
        print("✅ Whisper модель завантажена")
        
        return True
    except Exception as e:
        print(f"❌ Помилка: {e}")
        return False


if __name__ == "__main__":
    test_whisper()