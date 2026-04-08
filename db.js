const { Pool } = require('pg');

// Use Render/Neon connection string
const connectionString = process.env.DATABASE_URL;

let db;

if (connectionString) {
  db = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
} else {
  db = new Pool();
  console.log("WARNING: DATABASE_URL not set. Please set the environment variable.");
}

db.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to PostgreSQL:', err.message);
  } else {
    console.log('Connected to PostgreSQL database.');
    initDb();
    release();
  }
});

function initDb() {
  const initSql = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      member_type VARCHAR(255) DEFAULT 'Member',
      role VARCHAR(255) NOT NULL DEFAULT 'member',
      gender VARCHAR(255) DEFAULT 'Not Specified',
      age INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS books (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      author VARCHAR(255) NOT NULL,
      category VARCHAR(255),
      cover_url TEXT,
      price REAL DEFAULT 0,
      quantity INTEGER DEFAULT 1,
      status VARCHAR(255) NOT NULL DEFAULT 'available',
      borrower_name VARCHAR(255),
      borrower_type VARCHAR(255),
      borrow_date TIMESTAMP,
      borrow_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS book_views (
      id SERIAL PRIMARY KEY,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
      book_title VARCHAR(255),
      borrower_name VARCHAR(255) NOT NULL,
      borrower_type VARCHAR(255),
      borrow_date TIMESTAMP NOT NULL,
      due_date TIMESTAMP,
      return_date TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS book_logs (
      id SERIAL PRIMARY KEY,
      action VARCHAR(255) NOT NULL,
      book_title VARCHAR(255) NOT NULL,
      book_author VARCHAR(255),
      performed_by VARCHAR(255) NOT NULL,
      timestamp TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, book_id)
    );
  `;

  db.query(initSql, (err) => {
    if (err) console.error("Migration error:", err.message);
    else {
      console.log("Database initialized.");
      // Seed Admin
      db.query("SELECT id FROM users WHERE username = 'admin'", (err, res) => {
        if (!err && res.rows.length === 0) {
          db.query(
            "INSERT INTO users (username, password, display_name, member_type, role, gender, age) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            ['admin', 'admin1234', 'Administrator', 'Admin', 'admin', 'Male', 35]
          );
        }
      });
    }
  });
}

module.exports = db;
