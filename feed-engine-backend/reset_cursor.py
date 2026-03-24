import sqlite3

conn = sqlite3.connect('prisma/dev.db')
cur = conn.cursor()

# 检查 KeyValue 表是否存在
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='KeyValue'")
table_exists = cur.fetchone()

if table_exists:
    cur.execute("SELECT key, value FROM KeyValue WHERE key='event_listener_block'")
    row = cur.fetchone()
    if row:
        print(f"Current cursor block: {row[1]}")
        cur.execute("DELETE FROM KeyValue WHERE key='event_listener_block'")
        conn.commit()
        print("Cursor deleted. FeedEngine will re-scan from STARTUP_LOOKBACK (5000) blocks.")
    else:
        print("No cursor found (KeyValue table exists but no event_listener_block key).")
else:
    print("KeyValue table does not exist yet.")

conn.close()
print("Done.")
