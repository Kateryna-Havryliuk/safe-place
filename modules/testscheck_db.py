import sqlite3

conn = sqlite3.connect('safeplace.db')
cursor = conn.cursor()

# 1. Перевіряємо критичні повідомлення в таблиці messages
print("=" * 50)
print("КРИТИЧНІ ПОВІДОМЛЕННЯ В ТАБЛИЦІ messages:")
print("=" * 50)

cursor.execute("SELECT id, content, is_critical, timestamp FROM messages WHERE is_critical = 1")
critical_msgs = cursor.fetchall()

if critical_msgs:
    for msg in critical_msgs:
        print(f"ID: {msg[0]}")
        print(f"Текст: {msg[1][:100]}")
        print(f"Критичність: {msg[2]}")
        print(f"Час: {msg[3]}")
        print("-" * 30)
else:
    print("❌ Критичних повідомлень НЕМАЄ в таблиці messages!")
    print("   (або жодне повідомлення не помічено як is_critical=1)")

# 2. Перевіряємо аналітику
print("\n" + "=" * 50)
print("АНАЛІТИКА (user_analytics):")
print("=" * 50)

cursor.execute("SELECT user_id, date, message_count, critical_count FROM user_analytics")
analytics = cursor.fetchall()

if analytics:
    for row in analytics:
        print(f"Користувач: {row[0]}")
        print(f"Дата: {row[1]}")
        print(f"Повідомлень: {row[2]}")
        print(f"Критичних: {row[3]}")
        print("-" * 30)
else:
    print("❌ Немає даних в user_analytics!")

# 3. Перевіряємо скільки всього повідомлень
print("\n" + "=" * 50)
print("ЗАГАЛЬНА СТАТИСТИКА:")
print("=" * 50)

cursor.execute("SELECT COUNT(*) FROM messages")
total = cursor.fetchone()[0]
print(f"Всього повідомлень: {total}")

cursor.execute("SELECT COUNT(*) FROM messages WHERE is_critical = 1")
critical_total = cursor.fetchone()[0]
print(f"З них критичних: {critical_total}")

conn.close()
