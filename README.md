# 🛡️ Safe Place — Bimodal Psycho-Emotional Support System

[![Python](https://img.shields.io/badge/Python-3.9%2B-blue)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.0-lightgrey)](https://flask.palletsprojects.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Publications](https://img.shields.io/badge/Publications-3-orange)](#publications)

A web-based **bimodal (text + voice)** psycho-emotional support system powered by **generative artificial intelligence**. The system integrates text and voice modalities using a custom **rule-based fusion algorithm** with adaptive weighting, providing **100% interpretability** of all decisions — unlike black-box neural network approaches.

> 🎓 Developed as a **Bachelor's qualification thesis** at Lesya Ukrainka Volyn National University, Department of Computer Science and Cybersecurity (Specialty: 122 — Computer Science).

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Scientific Novelty](#-scientific-novelty)
- [System Architecture](#-system-architecture)
- [Technology Stack](#-technology-stack)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [API Endpoints](#-api-endpoints)
- [Database Schema](#-database-schema)
- [Project Structure](#-project-structure)
- [Experimental Results](#-experimental-results)
- [Publications](#-publications)
- [Author](#-author)

---

## 📖 Overview

**Safe Place** is a web application that provides primary psycho-emotional support through an empathetic AI-powered dialogue. Unlike existing solutions (Woebot, Wysa, Replika, CounselCat, Yana) that operate on text only, Safe Place analyzes **both text and voice modalities**, extracting paralinguistic features to better understand the user's emotional state.

### Why Safe Place?

| Problem with Existing Solutions | Safe Place Solution |
|---------------------------------|---------------------|
| Text-only → 38% emotional info lost | **Bimodal analysis** (text + voice) |
| Neural networks = "black box" | **Rule-based** — 100% interpretable |
| English only | **Ukrainian language** support |
| Closed source | **Open source** (MIT) |
| No voice emotion analysis | **Acoustic analysis** (pitch, energy, tempo) |

---

## ✨ Key Features

### 🧠 Generative AI Dialogue
- Empathetic responses powered by **Google Gemini 2.0 Flash**
- Custom **system prompt** defining role, style, and crisis protocols
- Context-aware conversations with history tracking
- Fallback responses when API is unavailable

### 🎤 Voice Analysis
- **Whisper** (tiny) — speech-to-text transcription
- **librosa** — acoustic feature extraction (pitch, RMS energy, tempo, spectral centroid)
- **7 emotion profiles** for voice classification (anger, sadness, fear, happiness, anxiety, calm, neutral)
- Audio files are **immediately deleted** after processing

### 📝 Text Analysis
- **11 emotion categories** with Ukrainian keyword dictionaries (80+ words)
- **4 severity levels** (critical → high → medium → low)
- **Sentiment scoring** with double-weighted negative markers
- **25+ crisis indicators** in Ukrainian

### 🔗 Rule-Based Bimodal Fusion
- **5-step pipeline**: normalization → confidence → adaptive weighting → weighted fusion → crisis scoring
- **O(1)** time complexity
- **100% interpretability** — every decision traceable to a specific rule
- Adaptive weights based on modality quality

### 🚨 Crisis Detection
- Weighted crisis scoring formula: critical text = +3, voice distress = +2
- Mathematical thresholds: ≥2.5 → CRITICAL, ≥1.5 → HIGH
- Automatic emergency contact display
- Event logging in `crisis_events` table

### 📊 Personalized Analytics
- Daily activity and sentiment trends
- Emotion distribution charts
- Personalized recommendations
- 30-day comprehensive analytics

### 🔐 Security
- **JWT** tokens (7-day expiration)
- **bcrypt** password hashing (12 rounds)
- **HTTPS** (TLS 1.3) support
- Audio files **never stored persistently**
- SQL injection protection (parameterized queries)

---

## 🔬 Scientific Novelty

The scientific contribution of this work consists of three original algorithms:

### 1. Adaptive Modality Weighting
w(m) = β(m) × (0.5 + 0.5 × c_m)

text

| Parameter | Description |
|-----------|-------------|
| β(text) = 0.5 | Base weight (text is more reliable) |
| β(voice) = 0.3 | Base weight (voice is supplementary) |
| c_m ∈ [0, 1] | Confidence score of the modality |

**How it works:** If voice quality is poor (c = 0.3), its weight drops from 0.3 to 0.20. The system automatically trusts text more.

### 2. Weighted Crisis Scoring
C_avg = (s₁ + s₂) / m

text

| Score | Source | Condition |
|:-----:|--------|-----------|
| s₁ = 3 | Text | Critical keywords detected (suicide, self-harm) |
| s₂ = 2 | Voice | Acoustic distress (monotone, extreme energy) |
| m | — | Number of available modalities (1 or 2) |

| C_avg | Level | Action |
|:-----:|:-----:|--------|
| ≥ 2.5 | 🔴 CRITICAL | Immediate help contacts |
| 1.5–2.5 | 🟠 HIGH | Heightened attention |
| < 1.5 | 🟢 LOW/MEDIUM | Normal mode |

### 3. Text Sentiment Scoring
S = (P − 2N) / W, S ∈ [−1, 1]

text

Negative words have **double weight** to amplify distress signals — critical for psychological support applications.

---

## 🏗️ System Architecture
┌─────────────────────────────────────────────────────────┐
│ CLIENT (Browser) │
│ HTML / CSS / JavaScript │
└─────────────────────┬───────────────────────────────────┘
│ HTTPS (TLS 1.3)
┌─────────────────────▼───────────────────────────────────┐
│ FLASK SERVER (app.py) │
│ ┌─────────────┐ ┌──────────────┐ ┌────────────────┐ │
│ │ JWT Auth │ │ Text Analysis │ │ Gemini API │ │
│ │ + bcrypt │ │ 11 categories │ │ Adapter │ │
│ └─────────────┘ └──────────────┘ └────────────────┘ │
│ ┌─────────────────────┐ ┌──────────────────────────┐ │
│ │ voice_processor.py │ │ multimodal_fusion.py │ │
│ │ Whisper + librosa │ │ Rule-based fusion engine │ │
│ └─────────────────────┘ └──────────────────────────┘ │
└─────────────────────┬───────────────────────────────────┘
│
┌─────────────────────▼───────────────────────────────────┐
│ SQLite DATABASE │
│ 9 tables: users, chats, messages, │
│ analytics, voice_analytics, etc. │
└─────────────────────────────────────────────────────────┘

---

## 🛠️ Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Language** | Python | 3.9+ |
| **Framework** | Flask | 3.0 |
| **AI Model** | Google Gemini | 2.0 Flash |
| **Speech-to-Text** | OpenAI Whisper | tiny (39M params) |
| **Audio Analysis** | librosa | 0.10 |
| **Database** | SQLite | 3 |
| **Authentication** | PyJWT + bcrypt | 2.8 / 4.1 |
| **Audio Conversion** | ffmpeg-python | 0.2 |
| **Scientific Computing** | NumPy | 1.24 |
| **Frontend Charts** | Chart.js | 4.x |
| **CORS** | Flask-CORS | 4.0 |

---

## 📥 Installation

### Prerequisites

- **Python 3.9+**
- **pip** (Python package manager)
- **ffmpeg** (for audio format conversion)
- **Google AI API key** ([get free key here](https://aistudio.google.com/apikey))

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/safe-place.git
cd safe-place

# 2. Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create .env file
echo "GOOGLE_AI_API_KEY=your_api_key_here" > .env
echo "SECRET_KEY=your_jwt_secret_here" >> .env

# 5. Run the server
python app.py
The server will start at http://127.0.0.1:5003.

⚙️ Configuration
Create a .env file in the project root:

env
GOOGLE_AI_API_KEY=your_google_ai_api_key_here
SECRET_KEY=your_jwt_secret_key_here
Optional Settings (config.py)
Setting	Default	Description
WHISPER_MODEL	tiny	Whisper size (tiny/base/small/medium/large)
JWT_EXPIRATION_DAYS	7	Token expiration
BCRYPT_ROUNDS	12	Password hashing rounds
MAX_AUDIO_DURATION	300	Max audio length (seconds)
MIN_AUDIO_DURATION	0.5	Min audio length (seconds)
ALLOWED_AUDIO_EXTENSIONS	wav, webm, mp3	Allowed audio formats


🚀 Usage
Web Interface
Open http://127.0.0.1:5003 in a browser

Register an account or continue as guest

Start a text conversation or record a voice message

View personalized analytics (registered users only)

Text Chat
Type your message in the input field

Press Enter or click the send button

Wait for the AI response (shows "Typing..." indicator)

Voice Input
Click the microphone button in the chat

Record your message (minimum 0.5 seconds)

System will transcribe, analyze acoustic features, and fuse with text analysis


Crisis Mode
If the system detects crisis indicators:

🔴 Interface turns red

⚠️ Warning message appears

📞 Ukrainian emergency contacts are displayed

📝 Event is logged in the database


Analytics Dashboard
Activity graph (messages per day)

Emotion distribution (pie chart)

Sentiment trend (line chart)

Personalized recommendations

📡 API Endpoints
Authentication
Method	Endpoint	Auth	Description
POST	/api/register	✕	Register new user
POST	/api/login	✕	Login (returns JWT)
GET	/api/profile	✓	Get user profile
Chats
Method	Endpoint	Auth	Description
GET	/api/chats	✓	List user chats
POST	/api/chat/new	✓	Create new chat
GET	/api/chat/<id>	✓	Get chat with messages
PUT	/api/chat/<id>/rename	✓	Rename chat
DELETE	/api/chat/<id>	✓	Delete chat
DELETE	/api/chat/<id>/message/<mid>	✓	Delete message
GET	/api/chat/<id>/export	✓	Export chat
Messaging
Method	Endpoint	Auth	Description
POST	/api/talk	✕	Send text message
POST	/api/analyze-voice	✕	Analyze voice recording
POST	/api/save-voice-message	✓	Save voice message to DB
POST	/api/analyze-multimodal	✓	Bimodal (text + voice) fusion
Analytics
Method	Endpoint	Auth	Description
GET	/api/analytics/user	✓	Basic user analytics
GET	/api/analytics/advanced	✓	Advanced analytics (30 days)
GET	/api/analytics/global	✕	Global system statistics
System
Method	Endpoint	Auth	Description
GET	/api/health	✕	Health check
GET	/api/debug/messages	✓	Debug message counts


🗄️ Database Schema
9 normalized tables with foreign key constraints and indexes:

#	Table	Description	Key Fields
1	users	User accounts	id, email, password_hash (bcrypt)
2	chats	Chat sessions	id, user_id (FK), title, message_count
3	messages	All messages	id, chat_id (FK), role, content, sentiment_score, is_critical
4	user_analytics	Daily aggregates	id, user_id (FK), date, avg_sentiment
5	user_sessions	Session tracking	id, user_id (FK), duration_seconds
6	crisis_events	Crisis log	id, user_id (FK), level, indicators
7	voice_analytics	Voice results	id, pitch_mean, energy_mean, tempo, transcription
8	video_analytics	Reserved for future	—
9	multimodal_analytics	Fusion results	id, fused_emotions, dominant_emotion, crisis_level


Indexes
idx_analytics_user_date — fast date queries

idx_messages_timestamp — chronological ordering

idx_messages_chat_id — chat message retrieval

idx_chats_user_id — user chat listing

idx_chats_activity — recent activity sorting


📁 Project Structure

safe-place/
├── app.py                      # Main Flask server (~1500 lines)
├── voice_processor.py          # Voice processing (Whisper + librosa)
├── multimodal_fusion.py        # Rule-based bimodal fusion engine
├── config.py                   # Configuration settings
├── requirements.txt            # Python dependencies
├── .env                        # API keys (git-ignored)
├── .gitignore                  # Git ignore rules
├── safeplace.db                # SQLite database (auto-created)
├── safeplace.log               # Application logs
├── index.html                  # Landing page
├── chat.html                   # Chat interface
├── analytics.html              # Analytics dashboard
├── uploads/
│   └── voice/                  # Temporary audio files (auto-deleted)
├── diagrams/                   # UML and architecture diagrams
├── screenshots/                # Application screenshots
└── README.md                   # This file


📊 Experimental Results
Test Dataset
88 messages total (44 user + 44 AI responses)

Synthetic dataset simulating real conversations

Range of emotions from neutral to highly distressed

Key Metrics
Metric	Value
Average sentiment score	−0.01
Critical messages detected	4 (9.1%)
Crisis detection accuracy	100%
False positives	0
Processing time (text)	2–5 sec
Processing time (voice)	3–8 sec

Emotion Distribution
depression   ███████  (7)
work/study   ███      (3)
anxiety      █        (1)
stress       █        (1)
other                (32)

Bimodal vs Text-Only Comparison
+17% improvement in emotion recognition accuracy

Most improvement for ambiguous text with clear emotional voice cues


📚 Publications
This work has been published in 3 scientific papers:

1. Seminar Paper
Havryliuk K., Mamchych T. Development of the "SAFE PLACE" Virtual Companion Web Application Using Generative Artificial Intelligence // XI Interuniversity Scientific-Practical Seminar "Computer Technologies: Modern Realities and Prospects". — Lutsk, 2026. — P. 52-55.

2. Conference Paper
Havryliuk K., Mamchych T. Interpreted Multimodal Rule-Based Fusion for Emotion Recognition // III International Scientific-Practical Conference "Problems of Computer Science, Software Modeling and Security of Digital Systems". — Lutsk–Svitiaz, 2026. — P. 170-171. 🔗 URL

3. Journal Article (Category "B")
Havryliuk K., Mamchych T. SafePlace: An Interpretable Rule-Based Framework for Multimodal Emotion Fusion // Computer-Integrated Technologies: Education, Science, Production. — Lutsk, 2026. — № 56. ISSN 2524-0552. DOI: 10.36910/ef. (accepted for publication, September 2026).


📌 Specialized journal category "B" — Specialty 122 (Computer Science), Ministry of Education and Science of Ukraine.


👩‍💻 Author
Kateryna Havryliuk

🏫 Lesya Ukrainka Volyn National University

📚 Faculty of Information Technologies and Mathematics

💻 Department of Computer Science and Cybersecurity

🎓 Specialty: 122 — Computer Science

📧 katyagko2004@gmail.com

🔗 ORCID: 0009-0006-4507-9885

Supervisor: Tetiana Mamchych, PhD, Associate Professor

🙏 Acknowledgments
Google Generative AI — Gemini API

OpenAI Whisper — Speech recognition model

librosa — Audio analysis library

Chart.js — Data visualization

Flask — Web framework

ffmpeg — Audio conversion
