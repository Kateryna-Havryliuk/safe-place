# check_install.py
import sys
import subprocess

packages = [
    'flask',
    'flask_cors',
    'google.generativeai',
    'cv2',
    'mediapipe',
    'deepface',
    'whisper',
    'librosa',
    'torch',
    'numpy',
    'sklearn'
]

print("🔍 Перевірка встановлених пакетів:\n")

for package in packages:
    try:
        if package == 'cv2':
            import cv2
            print(f"✅ opencv-python: {cv2.__version__}")
        elif package == 'sklearn':
            import sklearn
            print(f"✅ scikit-learn: {sklearn.__version__}")
        else:
            module = __import__(package)
            if hasattr(module, '__version__'):
                print(f"✅ {package}: {module.__version__}")
            else:
                print(f"✅ {package}: встановлено")
    except ImportError as e:
        print(f"❌ {package}: НЕ ВСТАНОВЛЕНО - {e}")

print("\n📋 Всі бібліотеки повинні бути позначені ✅")