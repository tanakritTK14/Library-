require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper for sending error
const handleError = (res, err) => {
  console.error("API Error: ", err);
  res.status(500).json({ error: err.message });
};

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, display_name, member_type, gender, age } = req.body;
    if (!username || !password || !display_name || !member_type) return res.status(400).json({ error: 'All fields are required' });
    const result = await db.query(
      'INSERT INTO users (username, password, display_name, member_type, role, gender, age) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [username, password, display_name, member_type, 'member', gender || 'Not Specified', parseInt(age, 10) || 0]
    );
    res.status(201).json({ message: 'Registration successful', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Username already exists' });
    handleError(res, err);
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await db.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid username or password' });
    res.json({ message: 'Login successful', user: result.rows[0] });
  } catch (err) { handleError(res, err); }
});

app.get('/api/books', async (req, res) => {
  try {
    const { search, category } = req.query;
    let sql = 'SELECT * FROM books';
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(title ILIKE $${params.length} OR author ILIKE $${params.length})`);
    }
    if (category && category !== 'all') {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY created_at DESC';

    const result = await db.query(sql, params);
    res.json({ message: 'success', data: result.rows });
  } catch (err) { handleError(res, err); }
});

app.get('/api/books/popular', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM books ORDER BY borrow_count DESC LIMIT 5');
    res.json({ message: 'success', data: result.rows });
  } catch (err) { handleError(res, err); }
});

app.get('/api/books/new', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM books WHERE created_at >= NOW() - INTERVAL \'7 days\' ORDER BY created_at DESC');
    res.json({ message: 'success', data: result.rows });
  } catch (err) { handleError(res, err); }
});

app.get('/api/categories', async (req, res) => {
  try {
    const result = await db.query('SELECT DISTINCT category FROM books WHERE category IS NOT NULL AND category != \'\' ORDER BY category');
    res.json({ message: 'success', data: result.rows.map(r => r.category) });
  } catch (err) { handleError(res, err); }
});

app.post('/api/books', async (req, res) => {
  try {
    const { title, author, category, cover_url, price, quantity, performed_by } = req.body;
    if (!title || !author) return res.status(400).json({ error: 'Please provide title and author' });
    
    await db.query('BEGIN');
    const result = await db.query(
      'INSERT INTO books (title, author, category, cover_url, price, quantity, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [title, author, category || 'Uncategorized', cover_url || "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80", parseFloat(price)||0, parseInt(quantity)||1, 'available']
    );
    await db.query(
      'INSERT INTO book_logs (action, book_title, book_author, performed_by, timestamp) VALUES ($1, $2, $3, $4, NOW())',
      ['ADD', title, author, performed_by || 'Admin']
    );
    await db.query('COMMIT');
    res.status(201).json({ message: 'Book added', id: result.rows[0].id });
  } catch (err) {
    await db.query('ROLLBACK');
    handleError(res, err);
  }
});

app.put('/api/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, author, category, cover_url, price, quantity, performed_by } = req.body;
    
    const bReq = await db.query('SELECT * FROM books WHERE id = $1', [id]);
    if (bReq.rows.length === 0) return res.status(404).json({ error: 'Book not found' });
    const row = bReq.rows[0];

    const upTitle = title || row.title;
    const upAuthor = author || row.author;
    const upCat = category !== undefined ? category : row.category;
    const upCover = cover_url !== undefined ? cover_url : row.cover_url;
    const upPrice = price !== undefined ? parseFloat(price) : row.price;
    const upQty = quantity !== undefined ? parseInt(quantity) : row.quantity;

    await db.query('BEGIN');
    await db.query(
      'UPDATE books SET title = $1, author = $2, category = $3, cover_url = $4, price = $5, quantity = $6 WHERE id = $7',
      [upTitle, upAuthor, upCat, upCover, upPrice, upQty, id]
    );
    await db.query(
      'INSERT INTO book_logs (action, book_title, book_author, performed_by, timestamp) VALUES ($1, $2, $3, $4, NOW())',
      ['EDIT', upTitle, upAuthor, performed_by || 'Admin']
    );
    await db.query('COMMIT');
    res.json({ message: 'Book updated successfully' });
  } catch (err) {
    await db.query('ROLLBACK');
    handleError(res, err);
  }
});

app.delete('/api/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const performed_by = req.query.performed_by || 'Admin';

    const bReq = await db.query('SELECT title, author, status FROM books WHERE id = $1', [id]);
    if (bReq.rows.length === 0) return res.status(404).json({ error: 'Book not found' });
    if (bReq.rows[0].status === 'borrowed') return res.status(400).json({ error: 'Cannot delete a borrowed book.' });

    await db.query('BEGIN');
    await db.query('DELETE FROM favorites WHERE book_id = $1', [id]);
    await db.query('DELETE FROM book_views WHERE book_id = $1', [id]);
    await db.query('DELETE FROM books WHERE id = $1', [id]);
    await db.query(
      'INSERT INTO book_logs (action, book_title, book_author, performed_by, timestamp) VALUES ($1, $2, $3, $4, NOW())',
      ['DELETE', bReq.rows[0].title, bReq.rows[0].author, performed_by]
    );
    await db.query('COMMIT');
    res.json({ message: 'Book deleted successfully' });
  } catch (err) {
    await db.query('ROLLBACK');
    handleError(res, err);
  }
});

app.get('/api/favorites/:user_id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT b.*, f.created_at as favorited_at FROM favorites f
       JOIN books b ON f.book_id = b.id
       WHERE f.user_id = $1 ORDER BY f.created_at DESC`,
      [req.params.user_id]
    );
    res.json({ message: 'success', data: result.rows });
  } catch (err) { handleError(res, err); }
});

app.get('/api/favorites/:user_id/ids', async (req, res) => {
  try {
    const result = await db.query('SELECT book_id FROM favorites WHERE user_id = $1', [req.params.user_id]);
    res.json({ message: 'success', data: result.rows.map(r => r.book_id) });
  } catch (err) { handleError(res, err); }
});

app.post('/api/favorites/toggle', async (req, res) => {
  try {
    const { user_id, book_id } = req.body;
    if (!user_id || !book_id) return res.status(400).json({ error: 'user_id and book_id are required' });

    const check = await db.query('SELECT id FROM favorites WHERE user_id = $1 AND book_id = $2', [user_id, book_id]);
    if (check.rows.length > 0) {
      await db.query('DELETE FROM favorites WHERE id = $1', [check.rows[0].id]);
      res.json({ message: 'Removed from favorites', favorited: false });
    } else {
      await db.query('INSERT INTO favorites (user_id, book_id) VALUES ($1, $2)', [user_id, book_id]);
      res.json({ message: 'Added to favorites', favorited: true });
    }
  } catch (err) { handleError(res, err); }
});

app.post('/api/books/:id/view', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.json({ message: 'skipped' });
    await db.query('INSERT INTO book_views (book_id, user_id) VALUES ($1, $2)', [req.params.id, user_id]);
    res.json({ message: 'View recorded' });
  } catch (err) { handleError(res, err); }
});

app.get('/api/books/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const stats = {
      favorites: 0,
      gender: { Male: 0, Female: 0, Other: 0, 'Not Specified': 0 },
      age: { '<18': 0, '18-24': 0, '25-34': 0, '35-44': 0, '45+': 0 },
      totalViews: 0
    };

    const favRes = await db.query('SELECT COUNT(*) as count FROM favorites WHERE book_id = $1', [id]);
    stats.favorites = parseInt(favRes.rows[0].count, 10);

    const viewRes = await db.query(
      'SELECT u.gender, u.age FROM book_views v JOIN users u ON v.user_id = u.id WHERE v.book_id = $1',
      [id]
    );
    stats.totalViews = viewRes.rows.length;
    
    viewRes.rows.forEach(r => {
      const g = r.gender || 'Not Specified';
      if (stats.gender[g] !== undefined) stats.gender[g]++;
      else stats.gender['Not Specified']++;

      if (r.age > 0) {
        if (r.age < 18) stats.age['<18']++;
        else if (r.age <= 24) stats.age['18-24']++;
        else if (r.age <= 34) stats.age['25-34']++;
        else if (r.age <= 44) stats.age['35-44']++;
        else stats.age['45+']++;
      }
    });

    res.json({ message: 'success', data: stats });
  } catch (err) { handleError(res, err); }
});

app.post('/api/checkout', async (req, res) => {
  try {
    const { user_id, display_name, member_type, items } = req.body;
    if (!user_id || !display_name || !items || items.length === 0) return res.status(400).json({ error: 'Invalid checkout data' });

    const borrowDateArgs = new Date();
    const errors = [];
    
    await db.query('BEGIN');
    for (const item of items) {
      const { book_id, borrow_duration } = item;
      const bReq = await db.query('SELECT title, status FROM books WHERE id = $1 FOR UPDATE', [book_id]);
      
      if (bReq.rows.length === 0 || bReq.rows[0].status !== 'available') {
        errors.push(`Book #${book_id}: ${bReq.rows.length===0 ? 'Not found' : 'Already borrowed'}`);
        continue;
      }

      let dueDate = null;
      if (borrow_duration) {
        const dd = new Date(borrowDateArgs);
        dd.setDate(dd.getDate() + parseInt(borrow_duration, 10));
        dueDate = dd;
      }

      await db.query(
        'UPDATE books SET status = $1, borrower_name = $2, borrower_type = $3, borrow_date = $4, borrow_count = COALESCE(borrow_count, 0) + 1 WHERE id = $5',
        ['borrowed', display_name, member_type || '', borrowDateArgs, book_id]
      );

      await db.query(
        'INSERT INTO transactions (book_id, book_title, borrower_name, borrower_type, borrow_date, due_date) VALUES ($1, $2, $3, $4, $5, $6)',
        [book_id, bReq.rows[0].title, display_name, member_type || '', borrowDateArgs, dueDate]
      );
    }
    await db.query('COMMIT');
    
    if (errors.length > 0 && errors.length === items.length) {
      res.status(400).json({ message: 'Checkout failed', errors });
    } else if (errors.length > 0) {
      res.status(207).json({ message: 'Checkout partially complete', errors });
    } else {
      res.json({ message: 'Checkout successful! All books borrowed.' });
    }
  } catch (err) {
    await db.query('ROLLBACK');
    handleError(res, err);
  }
});

app.post('/api/return', async (req, res) => {
  try {
    const { book_id } = req.body;
    if (!book_id) return res.status(400).json({ error: 'Please provide book_id' });

    await db.query('BEGIN');
    const bReq = await db.query('SELECT status FROM books WHERE id = $1 FOR UPDATE', [book_id]);
    if (bReq.rows.length === 0) throw new Error('Book not found');
    if (bReq.rows[0].status !== 'borrowed') throw new Error('Book is not currently borrowed');

    await db.query(
      'UPDATE books SET status = $1, borrower_name = NULL, borrower_type = NULL, borrow_date = NULL WHERE id = $2',
      ['available', book_id]
    );
    await db.query(
      'UPDATE transactions SET return_date = NOW() WHERE book_id = $1 AND return_date IS NULL',
      [book_id]
    );
    await db.query('COMMIT');
    res.json({ message: 'Book returned successfully' });
  } catch (err) {
    await db.query('ROLLBACK');
    handleError(res, err);
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const stats = { total: 0, available: 0, borrowed: 0 };
    const bReq = await db.query('SELECT status FROM books');
    bReq.rows.forEach(r => {
      stats.total++;
      if (r.status === 'available') stats.available++;
      if (r.status === 'borrowed') stats.borrowed++;
    });

    const tReq = await db.query('SELECT * FROM transactions ORDER BY borrow_date DESC');
    const lReq = await db.query('SELECT * FROM book_logs ORDER BY timestamp DESC');

    res.json({ message: 'success', stats, transactions: tReq.rows, book_logs: lReq.rows });
  } catch (err) { handleError(res, err); }
});

app.get('/api/stats/borrows', async (req, res) => {
  try {
    const query = `
      SELECT DATE(borrow_date) as borrow_day, COUNT(*) as count
      FROM transactions
      WHERE borrow_date >= NOW() - INTERVAL '3 months'
      GROUP BY DATE(borrow_date)
      ORDER BY DATE(borrow_date) ASC
    `;
    const result = await db.query(query);
    res.json({ message: 'success', data: result.rows });
  } catch (err) { handleError(res, err); }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
