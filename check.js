const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('library.sqlite');
db.all("PRAGMA table_info(books)", (err, rows) => {
  console.log(rows);
});
