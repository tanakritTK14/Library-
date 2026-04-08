const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('library.sqlite');
db.run("ALTER TABLE books ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP", (err) => {
  if (err) {
    console.error("ALTER ERROR:", err);
  } else {
    console.log("Column added.");
  }
});
