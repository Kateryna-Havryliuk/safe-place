import cv2
import numpy as np
import logging
from typing import Dict, List, Optional, Tuple
from pathlib import Path
import tempfile
import json

# Спроба імпорту
MEDIAPIPE_AVAILABLE = False
DEEPFACE_AVAILABLE = False

try:
    import mediapipe as mp
    MEDIAPIPE_AVAILABLE = True
except ImportError:
    MEDIAPIPE_AVAILABLE = False
    logging.warning("MediaPipe не встановлено")

try:
    from deepface import DeepFace
    DEEPFACE_AVAILABLE = True
except ImportError:
    DEEPFACE_AVAILABLE = False
    logging.warning("DeepFace не встановлено")


class VideoEmotionAnalyzer:
    """
    Аналіз емоцій з відео/фото
    """
    
    def __init__(self):
        self.face_mesh = None
        self.face_detection = None
        self.mp_drawing = None
        self.mp_drawing_styles = None
        self.deepface_working = False  # Чи працює DeepFace
        
        # Ініціалізація MediaPipe
        if MEDIAPIPE_AVAILABLE:
            try:
                import mediapipe as mp
                
                # Старий API (solutions)
                try:
                    self.mp_drawing = mp.solutions.drawing_utils
                    self.mp_drawing_styles = mp.solutions.drawing_styles
                    
                    self.face_mesh = mp.solutions.face_mesh.FaceMesh(
                        static_image_mode=False,
                        max_num_faces=1,
                        refine_landmarks=True,
                        min_detection_confidence=0.5,
                        min_tracking_confidence=0.5
                    )
                    
                    self.face_detection = mp.solutions.face_detection.FaceDetection(
                        model_selection=1,
                        min_detection_confidence=0.5
                    )
                    
                    print("✅ MediaPipe FaceMesh завантажено")
                except (AttributeError, ImportError) as e:
                    print(f"⚠️ MediaPipe solutions API недоступний: {e}")
                    # Спробуємо новий API
                    try:
                        from mediapipe.tasks.python import vision
                        print("✅ MediaPipe нового покоління (0.10+) доступний")
                    except ImportError:
                        pass
                    
            except Exception as e:
                logging.error(f"Помилка ініціалізації MediaPipe: {e}")
        
        # Тестуємо DeepFace
        if DEEPFACE_AVAILABLE:
            self._test_deepface()
        
        # Маппінг ключових точок обличчя
        self.landmark_indices = {
            'left_eyebrow': [46, 53, 52, 65, 55],
            'right_eyebrow': [285, 295, 282, 283, 276],
            'left_eye': [33, 133, 157, 158, 159, 160, 161, 173],
            'right_eye': [362, 263, 387, 386, 385, 384, 398, 466],
            'mouth': [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0],
            'mouth_corners': [61, 291],
            'jaw': [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397]
        }
    
    def _test_deepface(self):
        """Тестуємо чи працює DeepFace"""
        try:
            # Створюємо тестове зображення
            test_img = np.zeros((100, 100, 3), dtype=np.uint8)
            result = DeepFace.analyze(
                test_img, 
                actions=['emotion'],
                enforce_detection=False,
                silent=True
            )
            self.deepface_working = True
            print("✅ DeepFace працює коректно")
        except Exception as e:
            self.deepface_working = False
            print(f"⚠️ DeepFace не працює: {e}")
            print("   Використовуватимемо тільки MediaPipe + fallback")
    
    def process_frame(self, frame: np.ndarray) -> Dict:
        """
        Аналізує один кадр
        """
        if frame is None:
            return {
                'error': 'No frame provided',
                'face_detected': False,
                'emotion_analysis': self._get_default_emotions(),
                'dominant_emotion': 'neutral',
                'confidence': 0
            }
        
        results = {
            'face_detected': False,
            'emotion_analysis': {},
            'facial_landmarks': {},
            'face_quality': 0,
            'dominant_emotion': 'neutral',
            'confidence': 0
        }
        
        try:
            # Конвертуємо BGR в RGB
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # === MediaPipe виявлення обличчя ===
            face_detected_mp = False
            if self.face_detection and MEDIAPIPE_AVAILABLE:
                try:
                    face_results = self.face_detection.process(rgb_frame)
                    if face_results and face_results.detections:
                        face_detected_mp = True
                        results['face_detected'] = True
                        results['face_quality'] = face_results.detections[0].score[0]
                        print(f"👤 Обличчя виявлено (MediaPipe), якість: {results['face_quality']:.2f}")
                except Exception as e:
                    print(f"⚠️ MediaPipe face detection error: {e}")
            
            # === MediaPipe FaceMesh для міміки ===
            landmarks_data = {}
            if self.face_mesh and MEDIAPIPE_AVAILABLE:
                try:
                    mesh_results = self.face_mesh.process(rgb_frame)
                    if mesh_results and mesh_results.multi_face_landmarks:
                        landmarks = mesh_results.multi_face_landmarks[0]
                        landmarks_data = self._analyze_expression(landmarks, frame.shape)
                        results['facial_landmarks'] = landmarks_data
                        print(f"🎭 Міміка проаналізована: посмішка={landmarks_data.get('smile_intensity', 0):.2f}")
                except Exception as e:
                    print(f"⚠️ MediaPipe face mesh error: {e}")
            
            # Якщо MediaPipe не знайшов обличчя, спробуємо DeepFace
            if not results['face_detected']:
                results['face_detected'] = True  # DeepFace сам перевірить
            
            # === DeepFace аналіз емоцій ===
            deepface_success = False
            if DEEPFACE_AVAILABLE and self.deepface_working and results['face_detected']:
                try:
                    print("🔍 Запускаємо DeepFace аналіз...")
                    emotion_result = DeepFace.analyze(
                        frame, 
                        actions=['emotion'],
                        enforce_detection=False,
                        silent=True
                    )
                    
                    if isinstance(emotion_result, list) and len(emotion_result) > 0:
                        emotion_result = emotion_result[0]
                    
                    if 'emotion' in emotion_result:
                        # Нормалізуємо до 0-1 та конвертуємо в звичайні float
                        raw_emotions = {
                            k: float(v)/100.0 for k, v in emotion_result['emotion'].items()
                        }
                        
                        # === МАПІНГ назв емоцій для фронтенду ===
                        emotion_mapping = {
                            'angry': 'anger',      # DeepFace → Frontend
                            'happy': 'happiness',  # DeepFace → Frontend
                            'sad': 'sadness',      # DeepFace → Frontend
                            'fear': 'fear',        # вже правильно
                            'surprise': 'surprise', # вже правильно
                            'neutral': 'neutral',   # вже правильно
                            'disgust': 'disgust'    # вже правильно
                        }
                        
                        # Конвертуємо назви
                        emotions = {}
                        for raw_name, value in raw_emotions.items():
                            frontend_name = emotion_mapping.get(raw_name, raw_name)
                            emotions[frontend_name] = value
                        
                        results['emotion_analysis'] = emotions
                        
                        dominant = max(emotions.items(), key=lambda x: x[1])
                        results['dominant_emotion'] = dominant[0]
                        results['confidence'] = dominant[1]
                        
                        deepface_success = True
                        print(f"✅ DeepFace успішно: {dominant[0]} ({dominant[1]:.2f})")
                        print(f"   Всі емоції: {emotions}")  # Дебаг
                        
                except Exception as e:
                    print(f"⚠️ DeepFace аналіз не вдався: {e}")
            
            # === Fallback: аналіз на основі міміки ===
            if not deepface_success and landmarks_data:
                print("🔄 Використовуємо fallback аналіз міміки...")
                fallback_emotions = self._fallback_emotion_from_landmarks(landmarks_data)
                results['emotion_analysis'] = fallback_emotions
                
                if fallback_emotions:
                    dominant = max(fallback_emotions.items(), key=lambda x: x[1])
                    results['dominant_emotion'] = dominant[0]
                    results['confidence'] = dominant[1]
                    print(f"✅ Fallback аналіз: {dominant[0]} ({dominant[1]:.2f})")
            
            # === Останній fallback: випадкові емоції для демо ===
            if not results['emotion_analysis']:
                print("⚠️ Немає даних про емоції, використовуємо нейтральні")
                results['emotion_analysis'] = self._get_default_emotions()
                results['dominant_emotion'] = 'neutral'
                results['confidence'] = 0.5
            
            return results
            
        except Exception as e:
            logging.error(f"❌ Помилка обробки кадру: {e}")
            return {
                'error': str(e),
                'face_detected': False,
                'emotion_analysis': self._get_default_emotions(),
                'dominant_emotion': 'neutral',
                'confidence': 0
            }
    
    def _get_default_emotions(self) -> Dict[str, float]:
        """Повертає нейтральні емоції за замовчуванням"""
        return {
            'neutral': 0.6,
            'happy': 0.1,
            'sad': 0.1,
            'angry': 0.05,
            'fear': 0.05,
            'surprise': 0.05,
            'disgust': 0.05
        }
    
    def _analyze_expression(self, landmarks, image_shape) -> Dict:
        """
        Аналізує вираз обличчя на основі ключових точок
        """
        h, w = image_shape[:2]
        
        def get_point(idx):
            landmark = landmarks.landmark[idx]
            return np.array([landmark.x * w, landmark.y * h])
        
        expression = {
            'eyebrow_raise': 0.0,
            'eye_openness': 1.0,
            'mouth_openness': 0.0,
            'mouth_width': 0.0,
            'smile_intensity': 0.0
        }
        
        try:
            # Брови
            left_brow_y = np.mean([get_point(p)[1] for p in self.landmark_indices['left_eyebrow']])
            right_brow_y = np.mean([get_point(p)[1] for p in self.landmark_indices['right_eyebrow']])
            brow_y = (left_brow_y + right_brow_y) / 2
            
            # Очі
            left_eye_top = np.min([get_point(p)[1] for p in [159, 158]])
            left_eye_bottom = np.max([get_point(p)[1] for p in [160, 161]])
            eye_height = left_eye_bottom - left_eye_top
            expression['eye_openness'] = min(1.0, max(0.2, eye_height / 20))
            
            # Рот
            mouth_upper = np.min([get_point(p)[1] for p in [13, 14]])
            mouth_lower = np.max([get_point(p)[1] for p in [15, 16]])
            mouth_left = get_point(61)[0]
            mouth_right = get_point(291)[0]
            
            mouth_height = mouth_lower - mouth_upper
            mouth_width = mouth_right - mouth_left
            
            expression['mouth_openness'] = min(1.0, mouth_height / 30)
            expression['mouth_width'] = mouth_width / w
            
            # Посмішка
            mouth_center_y = (mouth_upper + mouth_lower) / 2
            corner_left = get_point(61)[1]
            corner_right = get_point(291)[1]
            
            smile = ((mouth_center_y - corner_left) + (mouth_center_y - corner_right)) / 2
            expression['smile_intensity'] = max(0, min(1, smile / 15))
            
            # Підняття брів
            eye_center_y = np.mean([get_point(159)[1], get_point(386)[1]])
            expression['eyebrow_raise'] = max(0, (eye_center_y - brow_y) / 20)
            
        except Exception as e:
            logging.warning(f"Помилка аналізу виразу: {e}")
        
        return expression
    
    def _fallback_emotion_from_landmarks(self, landmarks: Dict) -> Dict[str, float]:
        """
        Спрощений аналіз емоцій на основі міміки
        """
        emotions = {
            'angry': 0.0,
            'disgust': 0.0,
            'fear': 0.0,
            'happy': 0.0,
            'sad': 0.0,
            'surprise': 0.0,
            'neutral': 0.0
        }
        
        if not landmarks:
            emotions['neutral'] = 1.0
            return emotions
        
        smile = landmarks.get('smile_intensity', 0)
        eyebrow_raise = landmarks.get('eyebrow_raise', 0)
        mouth_open = landmarks.get('mouth_openness', 0)
        mouth_width = landmarks.get('mouth_width', 0)
        
        # Логіка визначення
        if smile > 0.5:
            emotions['happy'] = 0.7 + (smile - 0.5) * 0.6  # 0.7-1.0
            emotions['neutral'] = 1 - emotions['happy']
        
        elif eyebrow_raise > 0.5 and mouth_open > 0.3:
            emotions['surprise'] = 0.6
            emotions['fear'] = 0.2
            emotions['neutral'] = 0.2
        
        elif eyebrow_raise < 0.2 and smile < 0.2:
            emotions['sad'] = 0.5
            emotions['neutral'] = 0.5
        
        elif eyebrow_raise < 0.3 and mouth_width > 0.35:
            emotions['angry'] = 0.5
            emotions['neutral'] = 0.5
        
        else:
            emotions['neutral'] = 0.8
            emotions['happy'] = 0.1
            emotions['sad'] = 0.1
        
        # Нормалізуємо
        total = sum(emotions.values())
        if total > 0:
            emotions = {k: round(v/total, 3) for k, v in emotions.items()}
        
        return emotions
    
    def process_video_file(self, video_path: str, sample_rate: int = 30) -> Dict:
        """
        Аналізує відеофайл
        """
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        sample_interval = max(1, int(fps / sample_rate))
        
        emotions_over_time = []
        frame_count = 0
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            if frame_count % sample_interval == 0:
                result = self.process_frame(frame)
                if result.get('face_detected') and 'emotion_analysis' in result:
                    emotions_over_time.append(result['emotion_analysis'])
            
            frame_count += 1
        
        cap.release()
        
        if not emotions_over_time:
            return {
                'error': 'No faces detected in video',
                'dominant_emotion': 'unknown',
                'emotion_distribution': self._get_default_emotions()
            }
        
        # Усереднення емоцій
        emotion_distribution = {}
        for emotions in emotions_over_time:
            for emotion, score in emotions.items():
                if emotion not in emotion_distribution:
                    emotion_distribution[emotion] = []
                emotion_distribution[emotion].append(score)
        
        avg_emotions = {}
        for emotion, scores in emotion_distribution.items():
            avg_emotions[emotion] = sum(scores) / len(scores)
        
        dominant = max(avg_emotions.items(), key=lambda x: x[1])
        
        return {
            'dominant_emotion': dominant[0],
            'dominant_score': dominant[1],
            'emotion_distribution': avg_emotions,
            'frames_analyzed': len(emotions_over_time),
            'total_frames': total_frames,
            'confidence': min(1.0, len(emotions_over_time) / (total_frames / sample_interval))
        }
    
    def analyze_video(self, video_path: str) -> Dict:
        """
        Головний метод для аналізу відео (використовується з app.py)
        """
        try:
            # Перевіряємо чи це зображення чи відео
            ext = Path(video_path).suffix.lower()
            
            if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.webp']:
                # Це фото - обробляємо як один кадр
                frame = cv2.imread(video_path)
                if frame is None:
                    return {
                        'error': 'Cannot read image file',
                        'emotions': self._get_default_emotions(),
                        'dominant_emotion': 'neutral',
                        'face_detected': False
                    }
                
                result = self.process_frame(frame)
                return {
                    'emotions': result.get('emotion_analysis', self._get_default_emotions()),
                    'dominant_emotion': result.get('dominant_emotion', 'neutral'),
                    'face_detected': result.get('face_detected', False),
                    'confidence': result.get('confidence', 0),
                    'type': 'photo'
                }
            
            # Це відео - обробляємо як файл
            video_result = self.process_video_file(video_path)
            
            return {
                'emotions': video_result.get('emotion_distribution', self._get_default_emotions()),
                'dominant_emotion': video_result.get('dominant_emotion', 'neutral'),
                'face_detected': video_result.get('frames_analyzed', 0) > 0,
                'confidence': video_result.get('confidence', 0),
                'frames_analyzed': video_result.get('frames_analyzed', 0),
                'type': 'video'
            }
            
        except Exception as e:
            logging.error(f"❌ Помилка analyze_video: {e}")
            return {
                'error': str(e),
                'emotions': self._get_default_emotions(),
                'dominant_emotion': 'neutral',
                'face_detected': False,
                'confidence': 0
            }