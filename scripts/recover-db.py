"""
One-shot recovery for a malformed wist.db.
Works on a COPY, verifies integrity, and only reports — never touches the
original unless --apply is passed (which swaps the repaired copy into place
after backing the corrupt original aside).
"""
import sqlite3, os, sys, shutil, time

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

DB_DIR = r"C:\Users\user\AppData\Roaming\Wist"
LIVE = os.path.join(DB_DIR, "wist.db")
APPLY = "--apply" in sys.argv
TS = time.strftime("%Y%m%d-%H%M%S")

def integrity(con):
    try:
        rows = con.execute("PRAGMA integrity_check").fetchall()
        return [r[0] for r in rows]
    except Exception as e:
        return [f"ERROR: {e}"]

def counts(con):
    out = {}
    for (name,) in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall():
        try:
            out[name] = con.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
        except Exception as e:
            out[name] = f"ERR {e}"
    return out

# 1. work on a copy that folds in the WAL
work = os.path.join(DB_DIR, "wist.recover.db")
for ext in ("", "-wal", "-shm"):
    src = LIVE + ext
    if os.path.exists(src):
        shutil.copy2(src, work + ext)

con = sqlite3.connect(work)
print("=== BEFORE ===")
before = integrity(con)
print("integrity:", before[:12])

# 2. fold WAL into the main db, then rebuild every index (fixes the
#    'wrong # of entries' / 'row missing from index' class of corruption)
try:
    con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
except Exception as e:
    print("checkpoint:", e)
con.execute("PRAGMA writable_schema = OFF")
try:
    con.execute("REINDEX")
    con.commit()
    print("REINDEX ok")
except Exception as e:
    print("REINDEX:", e)

# 3. repair the known bad-data rows the integrity check flagged. Use typeof()
#    so a cell stored as the wrong type (not strict SQL NULL) is also caught.
repairs = [
    "UPDATE vault_files SET tags='[]' WHERE typeof(tags)<>'text'",
    "UPDATE vault_files SET created_at=datetime('now','localtime') WHERE typeof(created_at)<>'text'",
    "UPDATE vault_files SET name='' WHERE typeof(name)<>'text'",
    "UPDATE vault_files SET path='' WHERE typeof(path)<>'text'",
    "UPDATE vault_files SET kind='other' WHERE typeof(kind)<>'text'",
    "UPDATE vault_files SET size=0 WHERE typeof(size)<>'integer'",
]
for sql in repairs:
    try:
        n = con.execute(sql).rowcount
        if n:
            print("repaired:", sql, "->", n)
    except Exception as e:
        print("repair skipped:", sql, e)
con.commit()

# 3b. if any vault_files cell is still bad, rebuild the table cleanly (it holds
#     only disk-file pointers — sanitising NOT-NULL columns loses nothing real).
mid = integrity(con)
if any("vault_files" in m for m in mid):
    print("rebuilding vault_files (residual:", [m for m in mid if 'vault_files' in m][:4], ")")
    con.executescript(
        """
        CREATE TABLE vault_files_fix (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          size INTEGER NOT NULL DEFAULT 0,
          kind TEXT NOT NULL DEFAULT 'other',
          tags TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          parent_id INTEGER
        );
        INSERT INTO vault_files_fix (id,name,path,size,kind,tags,created_at,parent_id)
          SELECT id,
                 CASE WHEN typeof(name)='text' THEN name ELSE '' END,
                 CASE WHEN typeof(path)='text' THEN path ELSE '' END,
                 CASE WHEN typeof(size)='integer' THEN size ELSE 0 END,
                 CASE WHEN typeof(kind)='text' THEN kind ELSE 'other' END,
                 CASE WHEN typeof(tags)='text' THEN tags ELSE '[]' END,
                 CASE WHEN typeof(created_at)='text' THEN created_at ELSE datetime('now','localtime') END,
                 CASE WHEN typeof(parent_id)='integer' THEN parent_id ELSE NULL END
          FROM vault_files;
        DROP TABLE vault_files;
        ALTER TABLE vault_files_fix RENAME TO vault_files;
        CREATE INDEX IF NOT EXISTS idx_vault_parent ON vault_files(parent_id);
        """
    )
    con.commit()
    con.execute("REINDEX")
    con.commit()

# 4. rebuild the file cleanly + re-check
try:
    con.execute("VACUUM")
    con.commit()
    print("VACUUM ok")
except Exception as e:
    print("VACUUM:", e)

print("=== AFTER ===")
after = integrity(con)
print("integrity:", after[:12])
print("row counts:", counts(con))
con.close()

clean = after == ["ok"]
print("\nRESULT:", "CLEAN ✅" if clean else "STILL HAS ISSUES ⚠️")

if APPLY and clean:
    bak = os.path.join(DB_DIR, f"wist.corrupt-{TS}.db")
    # close any wal/shm of the live db by removing them (the repaired copy has none after VACUUM)
    shutil.move(LIVE, bak)
    for ext in ("-wal", "-shm"):
        if os.path.exists(LIVE + ext):
            os.remove(LIVE + ext)
    shutil.move(work, LIVE)
    for ext in ("-wal", "-shm"):
        if os.path.exists(work + ext):
            os.remove(work + ext)
    print(f"APPLIED: corrupt original -> {bak}; repaired db is now live.")
elif APPLY and not clean:
    print("NOT APPLIED: repaired copy still not clean; left original untouched.")
else:
    print("DRY RUN: original untouched. Re-run with --apply once integrity is CLEAN.")
    # leave the work copy for inspection
