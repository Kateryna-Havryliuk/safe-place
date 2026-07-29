"""
Модуль для ф'юзії (об'єднання) результатів з тексту, голосу та відео
Використовує вагове сумування з адаптивними коефіцієнтами довіри
"""

import numpy as np
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class CrisisType(Enum):
    """Типи кризових ситуацій для маркування"""
    SUICIDE = "suicide_risk"
    SELF_HARM = "self_harm"
    VIOLENCE = "violence"
    SEVERE_DEPRESSION = "severe_depression"
    PANIC_ATTACK = "panic_attack"
    SUBSTANCE_ABUSE = "substance_abuse"


@dataclass
class EmotionState:
    """
    Структура для зберігання інтегральної емоційної оцінки
    """
    # Окремі модальності (raw inputs)
    text_emotion: Dict[str, float] = field(default_factory=dict)
    voice_emotion: Dict[str, float] = field(default_factory=dict)
    video_emotion: Dict[str, float] = field(default_factory=dict)
    
    # Об'єднаний результат
    fused_emotion: Dict[str, float] = field(default_factory=dict)
    
    # Метадані
    confidence: float = 0.0  # Загальна впевненість системи
    modality_weights: Dict[str, float] = field(default_factory=dict)
    available_modalities: List[str] = field(default_factory=list)
    
    # Кризові індикатори
    crisis_indicators: List[str] = field(default_factory=list)
    crisis_level: str = "none"  # none, low, medium, high, critical
    
    # Контекст
    timestamp: str = ""
    user_id: Optional[str] = None
    
    def get_dominant_emotion(self) -> Tuple[str, float]:
        """Повертає домінантну емоцію та її вагу"""
        if not self.fused_emotion:
            return ("unknown", 0.0)
        dominant = max(self.fused_emotion, key=self.fused_emotion.get)
        return (dominant, self.fused_emotion[dominant])


class MultimodalFusion:
    """
    Двигун ф'юзії для об'єднання мультимодальних даних
    
    Стратегія:
    1. Нормалізація емоційних просторів (приведення до єдиного словника)
    2. Оцінка якості кожної модальності (confidence)
    3. Адаптивне вагове сумування
    4. Виявлення кризових ситуацій (ensemble detection)
    5. Калібрування впевненості
    """
    
    # Єдиний словник емоцій для всіх модальностей
    UNIFIED_EMOTIONS = [
        "stress", "anxiety", "sadness", "depression",
        "anger", "fear", "happiness", "neutral", "calm",
        "surprise", "disgust", "contempt"
    ]
    
    # Мапінг між різними схемами емоцій
    EMOTION_MAPPING = {
        # Текстові → уніфіковані
        "anxiety": "anxiety",
        "depression": "depression", 
        "stress": "stress",
        "relationships": "stress",
        "self_esteem": "anxiety",
        "work_study": "stress",
        "sleep": "fatigue",
        "health": "anxiety",
        
        # Голосові → уніфіковані
        "calm": "calm",
        "neutral": "neutral",
        
        # Відео → уніфіковані
        "happiness": "happiness",
        "sadness": "sadness",
        "anger": "anger",
        "fear": "fear",
        "surprise": "surprise",
        "disgust": "disgust",
        "contempt": "contempt"
    }
    
    # Кризові патерни (keywords для тексту + емоційні комбінації)
    CRISIS_PATTERNS = {
        CrisisType.SUICIDE: {
            "text_keywords": ["суїцид", "вбити", "померти", "повіситися", "не хочу жити", 
                            "кінець", "покінчити", "забрати життя", "впуститися"],
            "emotion_combo": [("sadness", 0.7), ("depression", 0.6)],
            "voice_indicators": ["monotone", "very_low_energy"],
            "priority": 10
        },
        CrisisType.SELF_HARM: {
            "text_keywords": ["різати", "шкодити", "боляче", "кров", "вени", "порізати"],
            "emotion_combo": [("anger", 0.6), ("sadness", 0.5)],
            "priority": 9
        },
        CrisisType.VIOLENCE: {
            "text_keywords": ["вб'ю", "поб'ю", "знищу", "ненавиджу", "заподіяти біль"],
            "emotion_combo": [("anger", 0.8)],
            "voice_indicators": ["high_energy", "shouting"],
            "video_indicators": ["anger"],
            "priority": 9
        },
        CrisisType.SEVERE_DEPRESSION: {
            "text_keywords": ["безнадія", "порожнеча", "немає сенсу", "втомився", "здався"],
            "emotion_combo": [("depression", 0.8), ("sadness", 0.7)],
            "voice_indicators": ["very_low_pitch", "monotone"],
            "video_indicators": ["sadness"],
            "priority": 8
        },
        CrisisType.PANIC_ATTACK: {
            "text_keywords": ["паніка", "немає повітря", "серце", "задыхаюся", "помру"],
            "emotion_combo": [("anxiety", 0.9), ("fear", 0.8)],
            "voice_indicators": ["rapid_speech", "high_pitch_variation"],
            "video_indicators": ["fear", "surprise"],
            "priority": 7
        }
    }
    
    def __init__(self):
        """Ініціалізація модуля ф'юзії"""
        logger.info("🧠 Мультимодальна ф'юзія: АКТИВОВАНО")
    
    def fuse(self, 
             text_result: Optional[Dict] = None,
             voice_result: Optional[Dict] = None,
             video_result: Optional[Dict] = None,
             text_raw: str = "") -> EmotionState:
        """
        Основний метод ф'юзії
        
        Args:
            text_result: результат EmotionalClassifier + sentiment
            voice_result: результат VoiceEmotionAnalyzer
            video_result: результат VideoEmotionAnalyzer
            text_raw: сирий текст для кризового аналізу
        
        Returns:
            EmotionState — інтегральна оцінка
        """
        state = EmotionState()
        state.available_modalities = []
        state.timestamp = str(np.datetime64('now'))
        
        # Збір доступних модальностей
        modalities_data = {}
        
        if text_result and text_result.get('categories'):
            state.text_emotion = self._normalize_text_emotions(text_result)
            modalities_data['text'] = {
                'emotions': state.text_emotion,
                'confidence': self._calculate_text_confidence(text_result),
                'raw': text_result
            }
            state.available_modalities.append('text')
        
        if voice_result and voice_result.get('emotions'):
            state.voice_emotion = self._normalize_voice_emotions(voice_result)
            modalities_data['voice'] = {
                'emotions': state.voice_emotion,
                'confidence': voice_result.get('confidence', 0.5),
                'raw': voice_result
            }
            state.available_modalities.append('voice')
        
        if video_result and video_result.get('emotions'):
            state.video_emotion = self._normalize_video_emotions(video_result)
            modalities_data['video'] = {
                'emotions': state.video_emotion,
                'confidence': video_result.get('confidence', 0.5),
                'raw': video_result
            }
            state.available_modalities.append('video')
        
        # Якщо немає жодної модальності
        if not modalities_data:
            state.fused_emotion = {"neutral": 1.0}
            state.confidence = 0.0
            return state
        
        # Розрахунок адаптивних ваг
        weights = self._calculate_adaptive_weights(modalities_data)
        state.modality_weights = weights
        
        # Вагове сумування
        fused = self._weighted_fusion(modalities_data, weights)
        state.fused_emotion = fused
        
        # Розрахунок загальної впевненості
        state.confidence = self._calculate_overall_confidence(modalities_data, weights)
        
        # Кризовий аналіз (ensemble)
        state.crisis_indicators = self._detect_crisis(
            text_raw, state.text_emotion, state.voice_emotion, 
            state.video_emotion, modalities_data
        )
        state.crisis_level = self._calculate_crisis_level(state.crisis_indicators)
        
        logger.info(f"🔄 Ф'юзія: {state.available_modalities} | "
                   f"Кризових індикаторів: {len(state.crisis_indicators)}")
        
        return state
    
    def _normalize_text_emotions(self, text_result: Dict) -> Dict[str, float]:
        """Нормалізація текстових емоцій до уніфікованого простору"""
        categories = text_result.get('categories', [])
        severity = text_result.get('severity', 'low')
        
        # Базові значення
        emotions = {e: 0.0 for e in self.UNIFIED_EMOTIONS}
        
        # Мапінг категорій
        for cat in categories:
            mapped = self.EMOTION_MAPPING.get(cat, cat)
            if mapped in emotions:
                emotions[mapped] += 0.6  # Базова вага категорії
        
        # Сила за тяжкістю
        severity_boost = {'low': 0.1, 'medium': 0.3, 'high': 0.5}
        boost = severity_boost.get(severity, 0.1)
        
        for cat in categories:
            mapped = self.EMOTION_MAPPING.get(cat, cat)
            if mapped in emotions:
                emotions[mapped] = min(1.0, emotions[mapped] + boost)
        
        # Нормалізація
        total = sum(emotions.values())
        if total > 0:
            emotions = {k: v/total for k, v in emotions.items()}
        else:
            emotions['neutral'] = 1.0
        
        return emotions
    
    def _normalize_voice_emotions(self, voice_result: Dict) -> Dict[str, float]:
        """Нормалізація голосових емоцій"""
        voice_emotions = voice_result.get('emotions', {})
        
        emotions = {e: 0.0 for e in self.UNIFIED_EMOTIONS}
        
        for emotion, score in voice_emotions.items():
            mapped = self.EMOTION_MAPPING.get(emotion, emotion)
            if mapped in emotions:
                emotions[mapped] = score
        
        # Якщо щось не розпізнано — нейтральний
        if sum(emotions.values()) == 0:
            emotions['neutral'] = 1.0
        
        return emotions
    
    def _normalize_video_emotions(self, video_result: Dict) -> Dict[str, float]:
        """Нормалізація відео емоцій"""
        video_emotions = video_result.get('emotions', {})
        
        emotions = {e: 0.0 for e in self.UNIFIED_EMOTIONS}
        
        for emotion, score in video_emotions.items():
            mapped = self.EMOTION_MAPPING.get(emotion, emotion)
            if mapped in emotions:
                emotions[mapped] = score
        
        return emotions
    
    def _calculate_text_confidence(self, text_result: Dict) -> float:
        """Оцінка якості текстового аналізу"""
        # Довжина тексту корелює з впевненістю (довший = більше контексту)
        text_length = len(text_result.get('text', ''))
        
        # Оптимальна довжина 50-500 символів
        if text_length < 10:
            return 0.3
        elif text_length < 50:
            return 0.5 + (text_length / 100)
        elif text_length < 500:
            return 0.8
        else:
            return 0.9  # Довгі тексти дають більше контексту
    
    def _calculate_adaptive_weights(self, modalities: Dict) -> Dict[str, float]:
        """
        Адаптивне визначення ваг модальностей.
        Логіка:
        - Текст: базова вага 0.5, зростає з довжиною та чіткістю
        - Голос: вага 0.3, зростає при високій енергії/варіативності (емоційний контент)
        - Відео: вага 0.2, зростає при чіткій міміці
        """
        weights = {}
        
        # Базові ваги
        base_weights = {'text': 0.5, 'voice': 0.3, 'video': 0.2}
        
        for modality, data in modalities.items():
            base = base_weights.get(modality, 0.3)
            confidence = data.get('confidence', 0.5)
            
            # Адаптація: вага пропорційна впевненості модальності, але зберігаємо мінімальний поріг, щоб не втратити сигнал
            adapted = base * (0.5 + 0.5 * confidence)
            weights[modality] = adapted
        
        # Нормалізація до суми = 1
        total = sum(weights.values())
        if total > 0:
            weights = {k: v/total for k, v in weights.items()}
        
        return weights
    
    def _weighted_fusion(self, 
                        modalities: Dict[str, Dict], 
                        weights: Dict[str, float]) -> Dict[str, float]:
        """Вагове сумування емоцій"""
        fused = {e: 0.0 for e in self.UNIFIED_EMOTIONS}
        
        for modality, data in modalities.items():
            weight = weights.get(modality, 0.3)
            emotions = data.get('emotions', {})
            
            for emotion, score in emotions.items():
                if emotion in fused:
                    fused[emotion] += score * weight
        
        # Нормалізація
        total = sum(fused.values())
        if total > 0:
            fused = {k: round(v/total, 3) for k, v in fused.items()}
        
        # Фільтрація шуму (занулення дуже малих значень)
        fused = {k: v if v > 0.05 else 0.0 for k, v in fused.items()}
        
        # Повторна нормалізація
        total = sum(fused.values())
        if total > 0:
            fused = {k: round(v/total, 3) for k, v in fused.items()}
        
        return fused
    
    def _calculate_overall_confidence(self, 
                                     modalities: Dict, 
                                     weights: Dict) -> float:
        """Розрахунок загальної впевненості системи"""
        # Залежить від:
        # 1. Кількості модальностей (більше = краще)
        # 2. Якості кожної модальності
        # 3. Згоди між модальностями (consensus)
        
        n_modalities = len(modalities)
        modality_bonus = min(n_modalities / 3, 1.0)  # Макс при 3+ модальностях
        
        # Середня впевненість з вагами
        avg_confidence = sum(
            data.get('confidence', 0.5) * weights.get(mod, 0.3)
            for mod, data in modalities.items()
        )
        
        # Перевірка консенсусу (чи погоджуються модальності?)
        if n_modalities > 1:
            # Отримуємо домінантні емоції
            dominants = []
            for data in modalities.values():
                emo_dict = data.get('emotions', {})
                if emo_dict:
                    dom = max(emo_dict, key=emo_dict.get)
                    dominants.append(dom)
            
            # Рахуємо згоду
            if len(set(dominants)) == 1:
                consensus_boost = 0.2  # Всі погоджуються
            elif len(set(dominants)) == 2:
                consensus_boost = 0.0  # Часткова згода
            else:
                consensus_boost = -0.1  # Розбіжність
        else:
            consensus_boost = 0.0
        
        final_confidence = min(1.0, avg_confidence * modality_bonus + consensus_boost)
        return round(final_confidence, 3)
    
    def _detect_crisis(self, 
                      text_raw: str,
                      text_emotions: Dict,
                      voice_emotions: Dict,
                      video_emotions: Dict,
                      modalities_data: Dict) -> List[str]:
        """
        Ensemble detection кризових ситуацій
        
        Комбінує:
        - Keyword matching (текст)
        - Емоційні патерни (всі модальності)
        - Контекстуальні індикатори
        """
        indicators = []
        text_lower = text_raw.lower()
        
        for crisis_type, patterns in self.CRISIS_PATTERNS.items():
            score = 0
            evidence = []
            
            # 1. Перевірка текстових ключових слів
            keywords = patterns.get('text_keywords', [])
            found_keywords = [kw for kw in keywords if kw in text_lower]
            if found_keywords:
                score += len(found_keywords) * 2
                evidence.extend(found_keywords[:2])  # Макс 2 приклади
            
            # 2. Перевірка емоційних комбінацій
            emotion_combo = patterns.get('emotion_combo', [])
            combo_score = 0
            for emotion, threshold in emotion_combo:
                # Перевіряємо всі модальності
                text_val = text_emotions.get(emotion, 0)
                voice_val = voice_emotions.get(emotion, 0)
                video_val = video_emotions.get(emotion, 0)
                
                max_val = max(text_val, voice_val, video_val)
                if max_val > threshold:
                    combo_score += 1
            
            if combo_score >= len(emotion_combo) * 0.5:  # Хоча б половина
                score += combo_score * 3
            
            # 3. Голосові індикатори (якщо доступно)
            if 'voice' in modalities_data:
                voice_raw = modalities_data['voice'].get('raw', {})
                voice_features = voice_raw.get('features', {})
                
                # Монотонність + низька енергія = депресія/ризик
                if 'monotone' in patterns.get('voice_indicators', []):
                    pitch_std = voice_features.get('pitch_std', 50)
                    if pitch_std < 20:  # Дуже низька варіативність
                        score += 2
                        evidence.append("monotone_voice")
                
                # Висока енергія = агресія/паніка
                if 'high_energy' in patterns.get('voice_indicators', []):
                    energy = voice_features.get('energy_mean', 0.1)
                    if energy > 0.2:
                        score += 2
                        evidence.append("high_energy_voice")
            
            # 4. Відео індикатори
            if 'video' in modalities_data:
                video_raw = modalities_data['video'].get('raw', {})
                dominant = video_raw.get('dominant', 'neutral')
                
                if dominant in patterns.get('video_indicators', []):
                    score += 2
            
            # Поріг спрацювання
            priority = patterns.get('priority', 5)
            threshold = max(3, priority - 2)  # Вищий пріоритет = нижчий поріг
            
            if score >= threshold:
                indicators.append(f"{crisis_type.value}: {', '.join(evidence[:2])}")
        
        return indicators
    
    def _calculate_crisis_level(self, indicators: List[str]) -> str:
        """Визначення рівня кризи за кількістю та типом індикаторів"""
        if not indicators:
            return "none"
        
        n = len(indicators)
        
        # Перевірка на критичні типи
        critical_types = ['suicide_risk', 'self_harm', 'violence']
        has_critical = any(
            any(ct in ind for ct in critical_types) 
            for ind in indicators
        )
        
        if has_critical and n >= 2:
            return "critical"
        elif has_critical or n >= 3:
            return "high"
        elif n == 2:
            return "medium"
        else:
            return "low"
    
    def generate_explanation(self, state: EmotionState) -> str:
        """
        Генерація пояснення для користувача/лікаря
        """
        lines = []
        
        dom_emotion, dom_score = state.get_dominant_emotion()
        lines.append(f"Домінантна емоція: {dom_emotion} ({dom_score:.1%})")
        
        lines.append(f"Впевненість системи: {state.confidence:.1%}")
        lines.append(f"Використано модальностей: {', '.join(state.available_modalities)}")
        
        if state.modality_weights:
            lines.append("Ваги модальностей:")
            for mod, weight in state.modality_weights.items():
                lines.append(f"  - {mod}: {weight:.2f}")
        
        if state.crisis_indicators:
            lines.append(f"⚠️ Кризові індикатори ({state.crisis_level}):")
            for ind in state.crisis_indicators:
                lines.append(f"  - {ind}")
        
        return "\n".join(lines)


# Допоміжні функції для API
def create_mock_results():
    """Створення тестових даних для демонстрації"""
    text_result = {
        "categories": ["anxiety", "stress"],
        "severity": "medium",
        "text": "Я дуже хвилююся через іспити, не можу спати"
    }
    
    voice_result = {
        "emotions": {
            "stress": 0.6,
            "anxiety": 0.3,
            "neutral": 0.1
        },
        "dominant": "stress",
        "confidence": 0.75,
        "features": {
            "pitch_std": 35,
            "energy_mean": 0.12,
            "tempo": 110
        }
    }
    
    video_result = {
        "emotions": {
            "fear": 0.4,
            "surprise": 0.2,
            "neutral": 0.4
        },
        "dominant": "fear",
        "confidence": 0.6
    }
    
    return text_result, voice_result, video_result


# Тестування
if __name__ == "__main__":
    fusion = MultimodalFusion()
    
    # Тест 1: Всі модальності
    text, voice, video = create_mock_results()
    state = fusion.fuse(text, voice, video, text["text"])
    
    print("=" * 50)
    print("ТЕСТ 1: Повна ф'юзія")
    print(fusion.generate_explanation(state))
    
    # Тест 2: Тільки текст (як fallback)
    state2 = fusion.fuse(text_result=text, text_raw=text["text"])
    print("\n" + "=" * 50)
    print("ТЕСТ 2: Тільки текст")
    print(fusion.generate_explanation(state2))
    
    # Тест 3: Кризовий сценарій
    crisis_text = {
        "categories": ["depression"],
        "severity": "high",
        "text": "Я не бачу сенсу жити, хочу покінчити з собою"
    }
    state3 = fusion.fuse(crisis_text, text_raw=crisis_text["text"])
    print("\n" + "=" * 50)
    print("ТЕСТ 3: Кризовий сценарій")
    print(fusion.generate_explanation(state3))