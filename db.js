const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'library.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to the database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initDb();
  }
});

function initDb() {
  db.serialize(() => {
    // Users table (authentication)
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        display_name TEXT NOT NULL,
        member_type TEXT DEFAULT 'Member',
        role TEXT NOT NULL DEFAULT 'member',
        gender TEXT DEFAULT 'Not Specified',
        age INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.run("ALTER TABLE users ADD COLUMN gender TEXT DEFAULT 'Not Specified'", (err) => {});
    db.run("ALTER TABLE users ADD COLUMN age INTEGER DEFAULT 0", (err) => {});

    // Book views table
    db.run(`
      CREATE TABLE IF NOT EXISTS book_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Books table
    db.run(`
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        category TEXT,
        cover_url TEXT,
        price REAL DEFAULT 0,
        quantity INTEGER DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'available',
        borrower_name TEXT,
        borrower_type TEXT,
        borrow_date TEXT,
        borrow_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Add columns for existing databases (safe migrations)
    db.run("ALTER TABLE books ADD COLUMN price REAL DEFAULT 0", (err) => { /* ignore */ });
    db.run("ALTER TABLE books ADD COLUMN borrower_type TEXT", (err) => { /* ignore */ });
    db.run("ALTER TABLE books ADD COLUMN borrow_count INTEGER DEFAULT 0", (err) => { /* ignore */ });
    db.run("ALTER TABLE books ADD COLUMN quantity INTEGER DEFAULT 1", (err) => { /* ignore */ });
    db.run("ALTER TABLE books ADD COLUMN created_at TEXT DEFAULT '2026-01-01T00:00:00.000Z'", (err) => { /* ignore */ });

    // Transactions table
    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER,
        book_title TEXT,
        borrower_name TEXT NOT NULL,
        borrower_type TEXT,
        borrow_date TEXT NOT NULL,
        due_date TEXT,
        return_date TEXT,
        FOREIGN KEY (book_id) REFERENCES books(id)
      )
    `);

    db.run("ALTER TABLE transactions ADD COLUMN borrower_type TEXT", (err) => { /* ignore */ });
    db.run("ALTER TABLE transactions ADD COLUMN due_date TEXT", (err) => { /* ignore */ });

    // Members table (legacy, kept for compatibility)
    db.run(`
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        member_type TEXT NOT NULL
      )
    `);

    // Book activity logs table
    db.run(`
      CREATE TABLE IF NOT EXISTS book_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        book_title TEXT NOT NULL,
        book_author TEXT,
        performed_by TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);

    // Favorites table
    db.run(`
      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        book_id INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (book_id) REFERENCES books(id),
        UNIQUE(user_id, book_id)
      )
    `);

    // Seed default admin account (admin / admin1234)
    db.get("SELECT id FROM users WHERE username = 'admin'", (err, row) => {
      if (!row) {
        console.log('Creating default admin account...');
        db.run(
          "INSERT INTO users (username, password, display_name, member_type, role, gender, age) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ['admin', 'admin1234', 'Administrator', 'Admin', 'admin', 'Male', 35]
        );
      }
    });

    // Seed mock users for demographics
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (row && row.count < 5) {
        const mockUsers = [
          ['user_f1', '1234', 'Anna Smith', 'Student', 'member', 'Female', 20],
          ['user_m1', '1234', 'John Doe', 'Working Professional', 'member', 'Male', 28],
          ['user_f2', '1234', 'Emma Watson', 'Student', 'member', 'Female', 22],
          ['user_o1', '1234', 'Alex Taylor', 'Working Professional', 'member', 'Other', 30]
        ];
        const stmt = db.prepare("INSERT OR IGNORE INTO users (username, password, display_name, member_type, role, gender, age) VALUES (?, ?, ?, ?, ?, ?, ?)");
        mockUsers.forEach(u => stmt.run(u));
        stmt.finalize();
      }
    });

    // Insert sample books with prices and created_at dates
    db.get('SELECT COUNT(*) AS count FROM books', (err, row) => {
      if (err) {
        console.error('Error checking books:', err.message);
        return;
      }
      if (row.count === 0) {
        console.log('Inserting sample books...');
        const stmt = db.prepare('INSERT INTO books (title, author, category, cover_url, price, quantity, status, borrow_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

        const now = new Date();
        const sampleBooks = [
          { title: "The Pragmatic Programmer", author: "Andrew Hunt & David Thomas", category: "Programming", cover_url: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400&q=80", price: 450, quantity: 3, status: "available", borrow_count: 12, created_at: new Date(now - 30 * 86400000).toISOString() },
          { title: "Clean Architecture", author: "Robert C. Martin", category: "Software Engineering", cover_url: "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400&q=80", price: 520, quantity: 2, status: "available", borrow_count: 8, created_at: new Date(now - 60 * 86400000).toISOString() },
          { title: "To Kill a Mockingbird", author: "Harper Lee", category: "Fiction", cover_url: "https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=400&q=80", price: 299, quantity: 5, status: "available", borrow_count: 25, created_at: new Date(now - 7 * 86400000).toISOString() },
          { title: "Sapiens: A Brief History", author: "Yuval Noah Harari", category: "History", cover_url: "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=400&q=80", price: 385, quantity: 4, status: "available", borrow_count: 18, created_at: new Date(now - 2 * 86400000).toISOString() },
          { title: "Dune", author: "Frank Herbert", category: "Sci-Fi", cover_url: "https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=400&q=80", price: 350, quantity: 2, status: "available", borrow_count: 15, created_at: new Date(now - 1 * 86400000).toISOString() }
        ];

        sampleBooks.forEach(b => {
          stmt.run([b.title, b.author, b.category, b.cover_url, b.price, b.quantity, b.status, b.borrow_count || 0, b.created_at]);
        });

        stmt.finalize();
      }
    });

    // Seed mock views
    db.get('SELECT COUNT(*) AS count FROM book_views', (err, row) => {
       if (row && row.count === 0) {
           console.log('Seeding mock views...');
           db.all('SELECT id FROM books', (err, books) => {
               db.all('SELECT id FROM users', (err, users) => {
                   if (books && users && books.length > 0 && users.length > 0) {
                       const stmt = db.prepare('INSERT INTO book_views (book_id, user_id) VALUES (?, ?)');
                       books.forEach(b => {
                           // Random 5-15 views per book
                           const viewCount = Math.floor(Math.random() * 10) + 5;
                           for(let i=0; i<viewCount; i++) {
                               const randomUser = users[Math.floor(Math.random() * users.length)];
                               stmt.run([b.id, randomUser.id]);
                           }
                       });
                       stmt.finalize();
                   }
               });
           });
       }
    });
  });
}

module.exports = db;
