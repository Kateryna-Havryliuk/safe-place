import sqlite3
from datetime import datetime

conn = sqlite3.connect('safeplace.db')
cursor = conn.cursor()

today = datetime.now().date().isoformat()
print(f"Сьогодні: {today}")
print("=" * 50)

# 1. Всі повідомлення за сьогодні
cursor.execute("""
    SELECT id, content, is_critical, timestamp 
    FROM messages 
    WHERE date(timestamp) = ?
    ORDER BY timestamp DESC
""", (today,))

today_msgs = cursor.fetchall()

if today_msgs:
    print(f"📝 Знайдено {len(today_msgs)} повідомлень за сьогодні:")
    for msg in today_msgs:
        print(f"   Текст: {msg[1][:50]}")
        print(f"   Критичність: {msg[2]}")
        print(f"   Час: {msg[3]}")
        print("   ---")
else:
    print("❌ Немає жодного повідомлення за сьогодні!")

# 2. Перевіряємо, чи є критичні взагалі (будь-якої дати)
print("\n" + "=" * 50)
print("ВСІ КРИТИЧНІ ПОВІДОМЛЕННЯ (будь-якої дати):")
print("=" * 50)

cursor.execute("""
    SELECT content, is_critical, date(timestamp) 
    FROM messages 
    WHERE is_critical = 1
""")
all_critical = cursor.fetchall()

if all_critical:
    for crit in all_critical:
        print(f"   Текст: {crit[0][:50]}, Дата: {crit[2]}")
else:
    print("❌ Немає жодного критичного повідомлення взагалі!")

conn.close()