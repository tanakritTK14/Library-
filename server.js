const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== AUTH ENDPOINTS ==========

// Register
app.post('/api/register', (req, res) => {
  const { username, password, display_name, member_type, gender, age } = req.body;
  if (!username || !password || !display_name || !member_type) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const finalGender = gender || 'Not Specified';
  const finalAge = parseInt(age, 10) || 0;

  db.run(
    'INSERT INTO users (username, password, display_name, member_type, role, gender, age) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [username, password, display_name, member_type, 'member', finalGender, finalAge],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Username already exists' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({
        message: 'Registration successful',
        user: { id: this.lastID, username, display_name, member_type, role: 'member', gender: finalGender, age: finalAge }
      });
    }
  );
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        member_type: user.member_type,
        role: user.role,
        gender: user.gender,
        age: user.age
      }
    });
  });
});

// ========== BOOKS ENDPOINTS ==========

// Get all books (with search & category filter)
app.get('/api/books', (req, res) => {
  const { search, category } = req.query;
  let sql = 'SELECT * FROM books';
  const params = [];
  const conditions = [];

  if (search) {
    conditions.push('(title LIKE ? OR author LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category && category !== 'all') {
    conditions.push('category = ?');
    params.push(category);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY created_at DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'success', data: rows });
  });
});

// Get popular books (top 5 by borrow_count)
app.get('/api/books/popular', (req, res) => {
  db.all('SELECT * FROM books ORDER BY borrow_count DESC LIMIT 5', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'success', data: rows });
  });
});

// Get new books (added in the last 7 days)
app.get('/api/books/new', (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  db.all(
    'SELECT * FROM books WHERE created_at >= ? ORDER BY created_at DESC',
    [sevenDaysAgo],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', data: rows });
    }
  );
});

// Get all distinct categories
app.get('/api/categories', (req, res) => {
  db.all('SELECT DISTINCT category FROM books WHERE category IS NOT NULL AND category != "" ORDER BY category', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const categories = rows.map(r => r.category);
    res.json({ message: 'success', data: categories });
  });
});

// Add a new book (Admin only)
app.post('/api/books', (req, res) => {
  const { title, author, category, cover_url, price, quantity, performed_by } = req.body;
  if (!title || !author) {
    return res.status(400).json({ error: 'Please provide title and author' });
  }

  const finalCover = cover_url || "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80";
  const finalPrice = parseFloat(price) || 0;
  const finalQuantity = parseInt(quantity) || 1;
  const now = new Date().toISOString();

  db.run(
    'INSERT INTO books (title, author, category, cover_url, price, quantity, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [title, author, category || 'Uncategorized', finalCover, finalPrice, finalQuantity, 'available', now],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      // Log the addition
      db.run(
        'INSERT INTO book_logs (action, book_title, book_author, performed_by, timestamp) VALUES (?, ?, ?, ?, ?)',
        ['ADD', title, author, performed_by || 'Admin', now]
      );

      res.status(201).json({ message: 'Book added', id: this.lastID });
    }
  );
});

// Update a book (Admin only)
app.put('/api/books/:id', (req, res) => {
  const { id } = req.params;
  const { title, author, category, cover_url, price, quantity, performed_by } = req.body;

  db.get('SELECT * FROM books WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Book not found' });

    const updatedTitle = title || row.title;
    const updatedAuthor = author || row.author;
    const updatedCategory = category !== undefined ? category : row.category;
    const updatedCover = cover_url !== undefined ? cover_url : row.cover_url;
    const updatedPrice = price !== undefined ? parseFloat(price) : row.price;
    const updatedQuantity = quantity !== undefined ? parseInt(quantity) : (row.quantity || 1);

    db.run(
      'UPDATE books SET title = ?, author = ?, category = ?, cover_url = ?, price = ?, quantity = ? WHERE id = ?',
      [updatedTitle, updatedAuthor, updatedCategory, updatedCover, updatedPrice, updatedQuantity, id],
      function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });

        // Log the edit
        db.run(
          'INSERT INTO book_logs (action, book_title, book_author, performed_by, timestamp) VALUES (?, ?, ?, ?, ?)',
          ['EDIT', updatedTitle, updatedAuthor, performed_by || 'Admin', new Date().toISOString()]
        );

        res.json({ message: 'Book updated successfully' });
      }
    );
  });
});

// Delete a book (Admin only)
app.delete('/api/books/:id', (req, res) => {
  const { id } = req.params;
  const performed_by = req.query.performed_by || 'Admin';

  db.get('SELECT title, author, status FROM books WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Book not found' });
    if (row.status === 'borrowed') return res.status(400).json({ error: 'Cannot delete a borrowed book.' });

    db.run('DELETE FROM books WHERE id = ?', [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // Log the deletion
      db.run(
        'INSERT INTO book_logs (action, book_title, book_author, performed_by, timestamp) VALUES (?, ?, ?, ?, ?)',
        ['DELETE', row.title, row.author, performed_by, new Date().toISOString()]
      );

      // Also remove favorites for deleted book
      db.run('DELETE FROM favorites WHERE book_id = ?', [id]);

      res.json({ message: 'Book deleted successfully' });
    });
  });
});

// ========== FAVORITES ENDPOINTS ==========

// Get user favorites
app.get('/api/favorites/:user_id', (req, res) => {
  const { user_id } = req.params;
  db.all(
    `SELECT b.*, f.created_at as favorited_at FROM favorites f
     JOIN books b ON f.book_id = b.id
     WHERE f.user_id = ?
     ORDER BY f.created_at DESC`,
    [user_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', data: rows });
    }
  );
});

// Get favorite IDs for a user (lightweight)
app.get('/api/favorites/:user_id/ids', (req, res) => {
  const { user_id } = req.params;
  db.all('SELECT book_id FROM favorites WHERE user_id = ?', [user_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const ids = rows.map(r => r.book_id);
    res.json({ message: 'success', data: ids });
  });
});

// Toggle favorite (add or remove)
app.post('/api/favorites/toggle', (req, res) => {
  const { user_id, book_id } = req.body;
  if (!user_id || !book_id) {
    return res.status(400).json({ error: 'user_id and book_id are required' });
  }

  db.get('SELECT id FROM favorites WHERE user_id = ? AND book_id = ?', [user_id, book_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (row) {
      // Remove from favorites
      db.run('DELETE FROM favorites WHERE user_id = ? AND book_id = ?', [user_id, book_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Removed from favorites', favorited: false });
      });
    } else {
      // Add to favorites
      db.run('INSERT INTO favorites (user_id, book_id) VALUES (?, ?)', [user_id, book_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Added to favorites', favorited: true });
      });
    }
  });
});

// ========== BOOK DEMOGRAPHICS ==========

app.post('/api/books/:id/view', (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  if (!user_id) return res.json({ message: 'skipped' });

  db.run('INSERT INTO book_views (book_id, user_id) VALUES (?, ?)', [id, user_id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'View recorded' });
  });
});

app.get('/api/books/:id/stats', (req, res) => {
  const { id } = req.params;
  const stats = {
      favorites: 0,
      gender: { Male: 0, Female: 0, Other: 0, 'Not Specified': 0 },
      age: { '<18': 0, '18-24': 0, '25-34': 0, '35-44': 0, '45+': 0 },
      totalViews: 0
  };

  db.get('SELECT COUNT(*) as count FROM favorites WHERE book_id = ?', [id], (err, row) => {
      if (row) stats.favorites = row.count;

      db.all(`
          SELECT u.gender, u.age FROM book_views v
          JOIN users u ON v.user_id = u.id
          WHERE v.book_id = ?
      `, [id], (err, rows) => {
          if (rows) {
              stats.totalViews = rows.length;
              rows.forEach(r => {
                  const g = r.gender || 'Not Specified';
                  if (stats.gender[g] !== undefined) {
                      stats.gender[g]++;
                  } else {
                      stats.gender['Not Specified']++;
                  }

                  if (r.age > 0) {
                      if (r.age < 18) stats.age['<18']++;
                      else if (r.age <= 24) stats.age['18-24']++;
                      else if (r.age <= 34) stats.age['25-34']++;
                      else if (r.age <= 44) stats.age['35-44']++;
                      else stats.age['45+']++;
                  }
              });
          }
          res.json({ message: 'success', data: stats });
      });
  });
});

// ========== CART CHECKOUT (Borrow multiple books) ==========
app.post('/api/checkout', (req, res) => {
  const { user_id, display_name, member_type, items } = req.body;
  // items = [{ book_id, borrow_duration }]

  if (!user_id || !display_name || !items || items.length === 0) {
    return res.status(400).json({ error: 'Invalid checkout data' });
  }

  const borrowDateObj = new Date();
  const borrowDate = borrowDateObj.toISOString();
  const errors = [];
  let processed = 0;

  items.forEach(item => {
    const { book_id, borrow_duration } = item;

    db.get('SELECT title, status FROM books WHERE id = ?', [book_id], (err, row) => {
      if (err || !row || row.status !== 'available') {
        errors.push(`Book #${book_id}: ${err ? err.message : (!row ? 'Not found' : 'Already borrowed')}`);
        processed++;
        if (processed === items.length) finishCheckout();
        return;
      }

      let dueDate = null;
      if (borrow_duration) {
        const dd = new Date(borrowDate);
        dd.setDate(dd.getDate() + parseInt(borrow_duration, 10));
        dueDate = dd.toISOString();
      }

      // Update book status + increment borrow_count
      db.run(
        'UPDATE books SET status = ?, borrower_name = ?, borrower_type = ?, borrow_date = ?, borrow_count = COALESCE(borrow_count, 0) + 1 WHERE id = ?',
        ['borrowed', display_name, member_type || '', borrowDate, book_id],
        function(err2) {
          if (err2) {
            errors.push(`Book #${book_id}: ${err2.message}`);
          } else {
            // Record transaction
            db.run(
              'INSERT INTO transactions (book_id, book_title, borrower_name, borrower_type, borrow_date, due_date) VALUES (?, ?, ?, ?, ?, ?)',
              [book_id, row.title, display_name, member_type || '', borrowDate, dueDate]
            );
          }
          processed++;
          if (processed === items.length) finishCheckout();
        }
      );
    });
  });

  function finishCheckout() {
    if (errors.length > 0) {
      res.status(207).json({ message: 'Checkout partially complete', errors });
    } else {
      res.json({ message: 'Checkout successful! All books borrowed.' });
    }
  }
});

// ========== RETURN ==========
app.post('/api/return', (req, res) => {
  const { book_id } = req.body;
  if (!book_id) return res.status(400).json({ error: 'Please provide book_id' });

  db.get('SELECT status FROM books WHERE id = ?', [book_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Book not found' });
    if (row.status !== 'borrowed') return res.status(400).json({ error: 'Book is not currently borrowed' });

    const returnDate = new Date().toISOString();

    db.run(
      'UPDATE books SET status = ?, borrower_name = NULL, borrower_type = NULL, borrow_date = NULL WHERE id = ?',
      ['available', book_id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        db.run(
          'UPDATE transactions SET return_date = ? WHERE book_id = ? AND return_date IS NULL',
          [returnDate, book_id]
        );

        res.json({ message: 'Book returned successfully' });
      }
    );
  });
});

// ========== DASHBOARD ==========
app.get('/api/dashboard', (req, res) => {
  const stats = { total: 0, available: 0, borrowed: 0 };

  db.all('SELECT status FROM books', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    rows.forEach(r => {
      stats.total++;
      if (r.status === 'available') stats.available++;
      if (r.status === 'borrowed') stats.borrowed++;
    });

    db.all('SELECT * FROM transactions ORDER BY borrow_date DESC', [], (err, tRows) => {
      if (err) return res.status(500).json({ error: err.message });

      db.all('SELECT * FROM book_logs ORDER BY timestamp DESC', [], (err, logs) => {
        if (err) return res.status(500).json({ error: err.message });

        res.json({ message: 'success', stats, transactions: tRows, book_logs: logs || [] });
      });
    });
  });
});

// ========== BORROW STATS (3-month history for chart) ==========
app.get('/api/stats/borrows', (req, res) => {
  // Get borrow counts grouped by date for the last 3 months
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const fromDate = threeMonthsAgo.toISOString().split('T')[0]; // YYYY-MM-DD

  db.all(
    `SELECT DATE(borrow_date) as borrow_day, COUNT(*) as count
     FROM transactions
     WHERE DATE(borrow_date) >= ?
     GROUP BY DATE(borrow_date)
     ORDER BY borrow_day ASC`,
    [fromDate],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', data: rows || [] });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
