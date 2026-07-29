def check_imports():
    """Перевіряє наявність всіх необхідних бібліотек"""
    
    required_packages = {
        'cv2': 'opencv-python',
        'mediapipe': 'mediapipe',
        'deepface': 'deepface',
        'whisper': 'openai-whisper',
        'librosa': 'librosa',
        'soundfile': 'soundfile',
        'torch': 'torch',
        'numpy': 'numpy',
        'flask': 'flask',
        'google.generativeai': 'google-generativeai'
    }
    
    missing = []
    working = []
    
    for package, pip_name in required_packages.items():
        try:
            if package == 'google.generativeai':
                import google.generativeai as genai
            else:
                __import__(package)
            working.append(package)
            print(f"✅ {package} - встановлено")
        except ImportError as e:
            missing.append(pip_name)
            print(f"❌ {package} - НЕ встановлено")
    
    if missing:
        print("\n" + "="*50)
        print("🚨 Відсутні бібліотеки. Встановіть командою:")
        print("="*50)
        print(f"pip install {' '.join(missing)}")
    else:
        print("\n" + "="*50)
        print("🎉 Всі бібліотеки успішно встановлені!")
        print("="*50)
    
    return len(missing) == 0

if __name__ == "__main__":
    check_imports()