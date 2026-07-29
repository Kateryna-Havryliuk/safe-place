import sqlite3
import json

# Підключення до бази
conn = sqlite3.connect('safeplace.db')
cursor = conn.cursor()

# 1. Загальна кількість повідомлень
cursor.execute('SELECT COUNT(*) FROM messages')
total_messages = cursor.fetchone()[0]
print(f"📊 Всього повідомлень: {total_messages}")

# 2. Кількість за ролями
cursor.execute('SELECT role, COUNT(*) FROM messages GROUP BY role')
print("\n👥 За ролями:")
for role, count in cursor.fetchall():
    print(f"   {role}: {count}")

# 3. Аналіз емоцій (якщо є)
cursor.execute('SELECT classification FROM messages WHERE classification IS NOT NULL')
classifications = cursor.fetchall()

emotions = {}
for row in classifications:
    try:
        data = json.loads(row[0])
        for cat in data.get('categories', []):
            emotions[cat] = emotions.get(cat, 0) + 1
    except:
        pass

print("\n🎭 Емоції:")
for emo, count in sorted(emotions.items(), key=lambda x: x[1], reverse=True)[:10]:
    print(f"   {emo}: {count}")

# 4. Критичні повідомлення
cursor.execute('SELECT COUNT(*) FROM messages WHERE is_critical = 1')
critical = cursor.fetchone()[0]
print(f"\n⚠️ Критичних повідомлень: {critical}")

# 5. Середня тональність
cursor.execute('SELECT AVG(sentiment_score) FROM messages WHERE sentiment_score IS NOT NULL')
avg_sentiment = cursor.fetchone()[0] or 0
print(f"😊 Середня тональність: {avg_sentiment:.2f}")

# 6. Час останньої активності
cursor.execute('SELECT MAX(timestamp) FROM messages')
last = cursor.fetchone()[0]
print(f"🕐 Останнє повідомлення: {last}")

conn.close()