const API_URL = 'http://localhost:3000/api';

// ========== STATE ==========
let currentUser = null; // { id, username, display_name, member_type, role }
let books = [];
let cart = []; // [{ book_id, title, price, cover_url }]
let favoriteIds = new Set(); // Set of book IDs
let currentCategory = 'all';
let searchTimeout = null;

// ========== AUTH ==========
function showLogin() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-error').textContent = '';
}

function showRegister() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('register-error').textContent = '';
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) {
            errorEl.textContent = data.error;
            return;
        }
        currentUser = data.user;
        localStorage.setItem('libraryUser', JSON.stringify(currentUser));
        enterApp();
    } catch {
        errorEl.textContent = 'Connection error.';
    }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    const display_name = document.getElementById('reg-display-name').value;
    const member_type = document.getElementById('reg-member-type').value;
    const gender = document.getElementById('reg-gender').value;
    const age = document.getElementById('reg-age').value;
    const errorEl = document.getElementById('register-error');

    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, display_name, member_type, gender, age })
        });
        const data = await res.json();
        if (!res.ok) {
            errorEl.textContent = data.error;
            return;
        }
        currentUser = data.user;
        localStorage.setItem('libraryUser', JSON.stringify(currentUser));
        enterApp();
    } catch {
        errorEl.textContent = 'Connection error.';
    }
});

function logout() {
    currentUser = null;
    cart = [];
    favoriteIds = new Set();
    localStorage.removeItem('libraryUser');
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
    showLogin();
}

function enterApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';

    const isAdmin = currentUser.role === 'admin';

    document.getElementById('welcome-text').textContent =
        `Welcome, ${currentUser.display_name}! (${isAdmin ? '👑 Admin' : currentUser.member_type})`;

    // Show/hide admin-only elements
    document.getElementById('btn-add-book').style.display = isAdmin ? 'inline-block' : 'none';
    document.getElementById('tab-dashboard').style.display = isAdmin ? 'inline-block' : 'none';

    updateCartCount();
    loadFavoriteIds();
    fetchCategories();
    fetchNewBooks();
    fetchPopularBooks();
    fetchBooks();
}

// Auto-login from localStorage
document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('libraryUser');
    if (saved) {
        currentUser = JSON.parse(saved);
        enterApp();
    }
});

// ========== TAB SWITCHING ==========
const viewLibrary = document.getElementById('library-view');
const viewFavorites = document.getElementById('favorites-view');
const viewDashboard = document.getElementById('dashboard-view');

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    viewLibrary.style.display = tabId === 'library' ? 'block' : 'none';
    viewFavorites.style.display = tabId === 'favorites' ? 'block' : 'none';
    viewDashboard.style.display = tabId === 'dashboard' ? 'block' : 'none';

    if (tabId === 'library') {
        fetchBooks();
    } else if (tabId === 'favorites') {
        fetchFavorites();
    } else if (tabId === 'dashboard') {
        fetchDashboard();
        fetchBorrowStats();
    }
}

// ========== SEARCH ==========
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchClear.style.display = searchInput.value ? 'flex' : 'none';
    searchTimeout = setTimeout(() => {
        fetchBooks();
    }, 350);
});

searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    fetchBooks();
});

// ========== CATEGORIES ==========
async function fetchCategories() {
    try {
        const response = await fetch(`${API_URL}/categories`);
        const result = await response.json();
        if (response.ok) {
            renderCategoryChips(result.data);
        }
    } catch {}
}

function renderCategoryChips(categories) {
    const container = document.getElementById('category-chips');
    const categoryIcons = {
        'Programming': '💻',
        'Software Engineering': '⚙️',
        'Fiction': '📖',
        'History': '🏛️',
        'Sci-Fi': '🚀',
        'Science': '🔬',
        'Business': '💼',
        'Art': '🎨',
        'Music': '🎵',
        'Travel': '✈️',
        'Cooking': '🍳',
        'Health': '🏥',
        'Education': '🎓',
        'Technology': '🔧',
        'Uncategorized': '📂'
    };

    container.innerHTML = `<button class="category-chip ${currentCategory === 'all' ? 'active' : ''}" data-category="all" onclick="selectCategory('all')">📚 ทั้งหมด</button>`;

    categories.forEach(cat => {
        const icon = categoryIcons[cat] || '📁';
        container.innerHTML += `<button class="category-chip ${currentCategory === cat ? 'active' : ''}" data-category="${cat}" onclick="selectCategory('${cat}')">${icon} ${cat}</button>`;
    });
}

function selectCategory(category) {
    currentCategory = category;
    document.querySelectorAll('.category-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.category === category);
    });
    fetchBooks();
}

// ========== NEW BOOKS ==========
async function fetchNewBooks() {
    try {
        const response = await fetch(`${API_URL}/books/new`);
        const result = await response.json();
        if (response.ok) {
            renderNewBooks(result.data);
        }
    } catch {}
}

function renderNewBooks(newBooks) {
    const section = document.getElementById('new-books-section');
    const container = document.getElementById('new-books-scroll');

    if (!newBooks || newBooks.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    container.innerHTML = newBooks.map(book => {
        const isFav = favoriteIds.has(book.id);
        const priceDisplay = book.price ? `฿${Number(book.price).toLocaleString()}` : 'Free';
        const daysAgo = Math.floor((Date.now() - new Date(book.created_at).getTime()) / 86400000);
        const timeLabel = daysAgo === 0 ? 'วันนี้' : daysAgo === 1 ? 'เมื่อวาน' : `${daysAgo} วันที่แล้ว`;

        return `
            <div class="new-book-card glass-panel" onclick="openBookDetail(${book.id})">
                <div class="new-ribbon">NEW</div>
                <img src="${book.cover_url}" alt="${book.title}" class="new-book-cover" onerror="this.src='https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80'">
                <div class="new-book-info">
                    <div class="new-book-title">${book.title}</div>
                    <div class="new-book-author">${book.author}</div>
                    <div class="new-book-meta">
                        <span class="new-book-time">🕐 ${timeLabel}</span>
                        <span class="new-book-price">${priceDisplay}</span>
                    </div>
                </div>
                <button class="btn-fav-mini ${isFav ? 'is-fav' : ''}" onclick="event.stopPropagation(); toggleFavorite(${book.id})" title="${isFav ? 'ลบออกจากรายการโปรด' : 'เพิ่มในรายการโปรด'}">
                    ${isFav ? '❤️' : '🤍'}
                </button>
            </div>
        `;
    }).join('');
}

// ========== POPULAR BOOKS ==========
async function fetchPopularBooks() {
    try {
        const response = await fetch(`${API_URL}/books/popular`);
        const result = await response.json();
        if (response.ok) {
            renderPopularBooks(result.data);
        }
    } catch {}
}

function renderPopularBooks(popularBooks) {
    const container = document.getElementById('popular-scroll');
    if (!popularBooks || popularBooks.length === 0) {
        document.getElementById('popular-section').style.display = 'none';
        return;
    }

    document.getElementById('popular-section').style.display = 'block';

    container.innerHTML = popularBooks.map((book, index) => {
        const isFav = favoriteIds.has(book.id);
        const priceDisplay = book.price ? `฿${Number(book.price).toLocaleString()}` : 'Free';
        const rankBadge = index < 3 ? ['🥇', '🥈', '🥉'][index] : `#${index + 1}`;
        return `
            <div class="popular-card glass-panel" onclick="openBookDetail(${book.id})">
                <div class="popular-rank">${rankBadge}</div>
                <img src="${book.cover_url}" alt="${book.title}" class="popular-cover" onerror="this.src='https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80'">
                <div class="popular-info">
                    <div class="popular-title">${book.title}</div>
                    <div class="popular-author">${book.author}</div>
                    <div class="popular-stats">
                        <span class="popular-borrows">📊 ยืม ${book.borrow_count || 0} ครั้ง</span>
                        <span class="popular-price">${priceDisplay}</span>
                    </div>
                </div>
                <button class="btn-fav-mini ${isFav ? 'is-fav' : ''}" onclick="event.stopPropagation(); toggleFavorite(${book.id})" title="${isFav ? 'ลบออกจากรายการโปรด' : 'เพิ่มในรายการโปรด'}">
                    ${isFav ? '❤️' : '🤍'}
                </button>
            </div>
        `;
    }).join('');
}

// function scrollToBook(bookId) { ... removed in favor of openBookDetail ... }

// ========== LIBRARY VIEW ==========
const bookGrid = document.getElementById('book-grid');

async function fetchBooks() {
    try {
        bookGrid.innerHTML = '<div class="loading">Loading library...</div>';
        const searchQuery = searchInput.value.trim();
        let url = `${API_URL}/books?`;
        if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}&`;
        if (currentCategory !== 'all') url += `category=${encodeURIComponent(currentCategory)}`;

        const response = await fetch(url);
        const result = await response.json();

        if (response.ok) {
            books = result.data;
            renderBooks();
        } else {
            bookGrid.innerHTML = '<div class="loading">Error loading books.</div>';
        }
    } catch {
        bookGrid.innerHTML = '<div class="loading">Connection error.</div>';
    }
}

function isNewBook(book) {
    if (!book.created_at) return false;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return new Date(book.created_at).getTime() >= sevenDaysAgo;
}

function renderBooks() {
    if (books.length === 0) {
        bookGrid.innerHTML = '<div class="loading">ไม่พบหนังสือที่ค้นหา (No books found)</div>';
        return;
    }

    const isAdmin = currentUser && currentUser.role === 'admin';

    bookGrid.innerHTML = books.map(book => {
        const isAvailable = book.status === 'available';
        const inCart = cart.some(c => c.book_id === book.id);
        const isFav = favoriteIds.has(book.id);
        const priceDisplay = book.price ? `฿${Number(book.price).toLocaleString()}` : 'Free';
        const isNew = isNewBook(book);
        const quantityDisplay = book.quantity ? `${book.quantity} เล่ม` : '';

        return `
            <div class="book-card glass-panel ${inCart ? 'in-cart' : ''}" data-book-id="${book.id}" onclick="openBookDetail(${book.id})">
                <div class="book-cover-wrapper">
                    <img src="${book.cover_url}" alt="Cover" class="book-cover" onerror="this.src='https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80'">
                    <button class="btn-favorite ${isFav ? 'is-fav' : ''}" onclick="event.stopPropagation(); toggleFavorite(${book.id})" title="${isFav ? 'ลบออกจากรายการโปรด' : 'เพิ่มในรายการโปรด'}">
                        ${isFav ? '❤️' : '🤍'}
                    </button>
                    ${isNew ? '<span class="new-badge">✨ NEW</span>' : ''}
                    ${book.borrow_count >= 10 ? '<span class="hot-badge">🔥 HOT</span>' : ''}
                </div>
                <div class="book-info-container">
                    <div class="book-category">${book.category || 'Uncategorized'}</div>
                    <h3 class="book-title">${book.title}</h3>
                    <p class="book-author">by ${book.author}</p>

                    <div class="book-price-row">
                        <span class="book-price-tag">${priceDisplay}</span>
                        ${quantityDisplay ? `<span class="book-quantity">📦 ${quantityDisplay}</span>` : ''}
                    </div>

                    <div class="book-meta">
                        <span class="status-badge ${isAvailable ? 'status-available' : 'status-borrowed'}">
                            ${isAvailable ? 'Available' : 'Borrowed'}
                        </span>

                        ${isAvailable ? `
                            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end;">
                                ${inCart ? `
                                    <button class="btn btn-in-cart" onclick="event.stopPropagation(); removeFromCart(${book.id})">
                                        ✅ In Cart
                                    </button>
                                ` : `
                                    <button class="btn btn-add-cart" onclick="event.stopPropagation(); addToCart(${book.id}, '${book.title.replace(/'/g, "\\'")}', ${book.price || 0}, '${(book.cover_url || '').replace(/'/g, "\\'")}')">
                                        🛒 Add to Cart
                                    </button>
                                `}
                                ${isAdmin ? `
                                    <button class="btn btn-edit" onclick="event.stopPropagation(); openEditBookModal(${book.id})" title="Edit Book">
                                        ✏️
                                    </button>
                                    <button class="btn btn-delete" onclick="event.stopPropagation(); deleteBook(${book.id})">
                                        🗑️
                                    </button>
                                ` : ''}
                            </div>
                        ` : `
                            <div>
                                <div class="borrower-info">
                                    <div>${book.borrower_name || ''}</div>
                                </div>
                                ${isAdmin ? `
                                    <div style="display: flex; gap: 0.5rem; margin-top: 8px;">
                                        <button class="btn btn-return" onclick="event.stopPropagation(); returnBook(${book.id})" style="flex:1">
                                            Return Book
                                        </button>
                                        <button class="btn btn-edit" onclick="event.stopPropagation(); openEditBookModal(${book.id})" title="Edit Book">
                                            ✏️
                                        </button>
                                    </div>
                                ` : ''}
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ========== FAVORITES ==========
async function loadFavoriteIds() {
    if (!currentUser) return;
    try {
        const response = await fetch(`${API_URL}/favorites/${currentUser.id}/ids`);
        const result = await response.json();
        if (response.ok) {
            favoriteIds = new Set(result.data);
        }
    } catch {}
}

async function toggleFavorite(bookId) {
    if (!currentUser) return;
    try {
        const response = await fetch(`${API_URL}/favorites/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, book_id: bookId })
        });
        const result = await response.json();
        if (response.ok) {
            if (result.favorited) {
                favoriteIds.add(bookId);
            } else {
                favoriteIds.delete(bookId);
            }
            renderBooks();
            fetchPopularBooks();
            fetchNewBooks();
            // If on favorites tab, refresh it
            if (viewFavorites.style.display !== 'none') {
                fetchFavorites();
            }
        }
    } catch {}
}

async function fetchFavorites() {
    if (!currentUser) return;
    const favGrid = document.getElementById('favorites-grid');
    favGrid.innerHTML = '<div class="loading">Loading favorites...</div>';

    try {
        const response = await fetch(`${API_URL}/favorites/${currentUser.id}`);
        const result = await response.json();
        if (response.ok) {
            renderFavorites(result.data);
        }
    } catch {
        favGrid.innerHTML = '<div class="loading">Connection error.</div>';
    }
}

function renderFavorites(favBooks) {
    const favGrid = document.getElementById('favorites-grid');
    if (!favBooks || favBooks.length === 0) {
        favGrid.innerHTML = `
            <div class="empty-favorites">
                <div class="empty-icon">💔</div>
                <h3>ยังไม่มีรายการโปรด</h3>
                <p>กดปุ่ม 🤍 บนหนังสือเพื่อเพิ่มในรายการโปรดของคุณ</p>
            </div>
        `;
        return;
    }

    const isAdmin = currentUser && currentUser.role === 'admin';

    favGrid.innerHTML = favBooks.map(book => {
        const isAvailable = book.status === 'available';
        const inCart = cart.some(c => c.book_id === book.id);
        const priceDisplay = book.price ? `฿${Number(book.price).toLocaleString()}` : 'Free';

        return `
            <div class="book-card glass-panel ${inCart ? 'in-cart' : ''}" data-book-id="${book.id}" onclick="openBookDetail(${book.id})">
                <div class="book-cover-wrapper">
                    <img src="${book.cover_url}" alt="Cover" class="book-cover" onerror="this.src='https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80'">
                    <button class="btn-favorite is-fav" onclick="event.stopPropagation(); toggleFavorite(${book.id})" title="ลบออกจากรายการโปรด">
                        ❤️
                    </button>
                </div>
                <div class="book-info-container">
                    <div class="book-category">${book.category || 'Uncategorized'}</div>
                    <h3 class="book-title">${book.title}</h3>
                    <p class="book-author">by ${book.author}</p>
                    <div class="book-price-tag">${priceDisplay}</div>
                    <div class="book-meta">
                        <span class="status-badge ${isAvailable ? 'status-available' : 'status-borrowed'}">
                            ${isAvailable ? 'Available' : 'Borrowed'}
                        </span>
                        ${isAvailable && !inCart ? `
                            <button class="btn btn-add-cart" onclick="event.stopPropagation(); addToCart(${book.id}, '${book.title.replace(/'/g, "\\'")}', ${book.price || 0}, '${(book.cover_url || '').replace(/'/g, "\\'")}')">
                                🛒 Add to Cart
                            </button>
                        ` : ''}
                        ${inCart ? `
                            <button class="btn btn-in-cart" onclick="event.stopPropagation(); removeFromCart(${book.id})">
                                ✅ In Cart
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ========== CART ==========
function addToCart(book_id, title, price, cover_url) {
    if (cart.some(c => c.book_id === book_id)) return;
    cart.push({ book_id, title, price, cover_url });
    updateCartCount();
    renderBooks();
}

function removeFromCart(book_id) {
    cart = cart.filter(c => c.book_id !== book_id);
    updateCartCount();
    renderBooks();
    renderCartItems();
}

function updateCartCount() {
    document.getElementById('cart-count').textContent = cart.length;
    const cartBtn = document.getElementById('btn-cart');
    if (cart.length > 0) {
        cartBtn.classList.add('has-items');
    } else {
        cartBtn.classList.remove('has-items');
    }
}

function openCartModal() {
    renderCartItems();
    document.getElementById('cart-modal').classList.add('active');
}

function closeCartModal() {
    document.getElementById('cart-modal').classList.remove('active');
}

function renderCartItems() {
    const container = document.getElementById('cart-items-container');
    const totalEl = document.getElementById('cart-total');

    if (cart.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 2rem;">Your cart is empty.</p>';
        totalEl.innerHTML = '';
        document.getElementById('btn-checkout').style.display = 'none';
        return;
    }

    document.getElementById('btn-checkout').style.display = 'inline-block';

    container.innerHTML = cart.map(item => `
        <div class="cart-item">
            <img src="${item.cover_url}" alt="" class="cart-item-cover" onerror="this.src='https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80'">
            <div class="cart-item-info">
                <div class="cart-item-title">${item.title}</div>
                <div class="cart-item-price">${item.price ? '฿' + Number(item.price).toLocaleString() : 'Free'}</div>
            </div>
            <button class="btn btn-delete" onclick="removeFromCart(${item.book_id})">✕</button>
        </div>
    `).join('');

    const total = cart.reduce((sum, item) => sum + (item.price || 0), 0);
    totalEl.innerHTML = `<strong>Total: ฿${total.toLocaleString()}</strong>`;
}

async function checkout() {
    if (cart.length === 0) return;

    const borrow_duration = document.getElementById('checkout-duration').value;

    const payload = {
        user_id: currentUser.id,
        display_name: currentUser.display_name,
        member_type: currentUser.member_type,
        items: cart.map(c => ({ book_id: c.book_id, borrow_duration }))
    };

    try {
        const res = await fetch(`${API_URL}/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok || res.status === 207) {
            cart = [];
            updateCartCount();
            closeCartModal();
            fetchBooks();
            fetchPopularBooks();
            fetchNewBooks();
            alert(data.message + (data.errors ? '\n\nWarnings:\n' + data.errors.join('\n') : ''));
        } else {
            alert('Checkout failed: ' + data.error);
        }
    } catch {
        alert('Network error during checkout.');
    }
}

// Click outside cart modal to close
document.getElementById('cart-modal').addEventListener('click', (e) => {
    if (e.target.id === 'cart-modal') closeCartModal();
});

// ========== DASHBOARD ==========
async function fetchDashboard() {
    try {
        const historyTbody = document.getElementById('history-tbody');
        const logsTbody = document.getElementById('logs-tbody');
        historyTbody.innerHTML = '<tr><td colspan="7" class="loading">Loading stats...</td></tr>';
        logsTbody.innerHTML = '<tr><td colspan="5" class="loading">Loading...</td></tr>';

        const response = await fetch(`${API_URL}/dashboard`);
        const result = await response.json();

        if (response.ok) {
            document.getElementById('stat-total').textContent = result.stats.total;
            document.getElementById('stat-available').textContent = result.stats.available;
            document.getElementById('stat-borrowed').textContent = result.stats.borrowed;

            // Render borrower history
            if (result.transactions.length === 0) {
                historyTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No borrowing history yet.</td></tr>';
            } else {
                historyTbody.innerHTML = result.transactions.map(t => {
                    const isReturned = t.return_date !== null;
                    return `
                        <tr>
                            <td>#${t.book_id}</td>
                            <td><strong>${t.book_title}</strong></td>
                            <td>${t.borrower_name}</td>
                            <td><span class="type-badge">${t.borrower_type || '-'}</span></td>
                            <td>${formatFullDateTime(t.borrow_date)}</td>
                            <td>${isReturned ? formatFullDateTime(t.return_date) : '-'}</td>
                            <td>
                                <span class="status-badge ${isReturned ? 'status-available' : 'status-borrowed'}">
                                    ${isReturned ? 'Returned' : 'Active'}
                                </span>
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            // Render book activity logs
            if (!result.book_logs || result.book_logs.length === 0) {
                logsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No activity logs yet.</td></tr>';
            } else {
                logsTbody.innerHTML = result.book_logs.map(log => {
                    const actionMap = {
                        'ADD': { icon: '➕ Added', cls: 'status-available' },
                        'DELETE': { icon: '🗑️ Deleted', cls: 'status-deleted' },
                        'EDIT': { icon: '✏️ Edited', cls: 'status-edited' }
                    };
                    const action = actionMap[log.action] || { icon: log.action, cls: '' };
                    return `
                        <tr>
                            <td>
                                <span class="status-badge ${action.cls}">
                                    ${action.icon}
                                </span>
                            </td>
                            <td><strong>${log.book_title}</strong></td>
                            <td>${log.book_author || '-'}</td>
                            <td>${log.performed_by}</td>
                            <td>${formatFullDateTime(log.timestamp)}</td>
                        </tr>
                    `;
                }).join('');
            }
        }
    } catch (error) {
        console.error("Dashboard error:", error);
    }
}

// ========== BORROW STATS CHART (3-month history) ==========
let borrowChart = null;

async function fetchBorrowStats() {
    try {
        const response = await fetch(`${API_URL}/stats/borrows`);
        const result = await response.json();
        if (response.ok) {
            renderBorrowChart(result.data);
        }
    } catch (error) {
        console.error("Chart error:", error);
    }
}

function renderBorrowChart(data) {
    const canvas = document.getElementById('borrow-chart');
    const container = document.getElementById('borrow-chart-container');
    const legendEl = document.getElementById('chart-legend');

    if (!data || data.length === 0) {
        container.innerHTML = '<div class="chart-empty">📊 ยังไม่มีข้อมูลการยืมหนังสือ</div>';
        legendEl.innerHTML = '';
        return;
    }

    // Restore the canvas if it was replaced
    if (!canvas || canvas.tagName !== 'CANVAS') {
        container.innerHTML = '<canvas id="borrow-chart"></canvas>';
    }
    const ctx = document.getElementById('borrow-chart').getContext('2d');

    // Find max for scaling
    const maxCount = Math.max(...data.map(d => d.count), 1);
    const peakDay = data.reduce((a, b) => a.count > b.count ? a : b);

    // Canvas dimensions
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = container.clientWidth - 40;
    const displayHeight = 280;
    const cvs = document.getElementById('borrow-chart');
    cvs.width = displayWidth * dpr;
    cvs.height = displayHeight * dpr;
    cvs.style.width = displayWidth + 'px';
    cvs.style.height = displayHeight + 'px';
    ctx.scale(dpr, dpr);

    // Drawing constants
    const padding = { top: 30, right: 20, bottom: 60, left: 50 };
    const chartW = displayWidth - padding.left - padding.right;
    const chartH = displayHeight - padding.top - padding.bottom;
    const barGap = Math.max(2, Math.floor(chartW / data.length * 0.2));
    const barWidth = Math.max(4, (chartW / data.length) - barGap);

    // Clear
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Draw grid lines
    const gridLines = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.font = '11px Outfit';
    ctx.fillStyle = 'rgba(148,163,184,0.7)';
    ctx.textAlign = 'right';

    for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (chartH / gridLines) * i;
        const val = Math.round(maxCount - (maxCount / gridLines) * i);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartW, y);
        ctx.stroke();
        ctx.fillText(val, padding.left - 8, y + 4);
    }

    // Draw bars
    data.forEach((d, i) => {
        const x = padding.left + i * (barWidth + barGap) + barGap / 2;
        const barH = (d.count / maxCount) * chartH;
        const y = padding.top + chartH - barH;

        const isPeak = d.borrow_day === peakDay.borrow_day;

        // Bar gradient
        const grad = ctx.createLinearGradient(x, y, x, padding.top + chartH);
        if (isPeak) {
            grad.addColorStop(0, '#f97316');
            grad.addColorStop(1, '#ef4444');
        } else {
            grad.addColorStop(0, '#818cf8');
            grad.addColorStop(1, '#6366f1');
        }

        // Bar shadow for peak
        if (isPeak) {
            ctx.shadowColor = 'rgba(249,115,22,0.4)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 4;
        }

        // Rounded bar top
        const radius = Math.min(barWidth / 2, 6);
        ctx.beginPath();
        ctx.moveTo(x, padding.top + chartH);
        ctx.lineTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.arcTo(x + barWidth, y, x + barWidth, y + radius, radius);
        ctx.lineTo(x + barWidth, padding.top + chartH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Value label on top (only for peak or if few bars)
        if (isPeak || data.length <= 15) {
            ctx.fillStyle = isPeak ? '#f97316' : 'rgba(148,163,184,0.8)';
            ctx.font = isPeak ? 'bold 12px Outfit' : '10px Outfit';
            ctx.textAlign = 'center';
            ctx.fillText(d.count, x + barWidth / 2, y - 8);
        }

        // X-axis date label (show selectively)
        if (data.length <= 20 || i % Math.ceil(data.length / 15) === 0 || isPeak) {
            ctx.save();
            ctx.translate(x + barWidth / 2, padding.top + chartH + 10);
            ctx.rotate(-Math.PI / 4);
            ctx.fillStyle = isPeak ? '#f97316' : 'rgba(148,163,184,0.6)';
            ctx.font = isPeak ? 'bold 10px Outfit' : '9px Outfit';
            ctx.textAlign = 'right';
            const dateStr = formatChartDate(d.borrow_day);
            ctx.fillText(dateStr, 0, 0);
            ctx.restore();
        }
    });

    // Legend
    legendEl.innerHTML = `
        <div class="chart-legend-item">
            <span class="chart-legend-color" style="background: linear-gradient(135deg, #818cf8, #6366f1);"></span>
            <span>วันปกติ</span>
        </div>
        <div class="chart-legend-item">
            <span class="chart-legend-color" style="background: linear-gradient(135deg, #f97316, #ef4444);"></span>
            <span>วันที่ยืมเยอะสุด: ${formatChartDate(peakDay.borrow_day)} (${peakDay.count} ครั้ง)</span>
        </div>
    `;
}

function formatChartDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}`;
    }
    return dateStr;
}

// ========== FORMATTERS ==========
function formatFullDateTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// ========== ADD BOOK MODAL (Admin) ==========
const addBookModal = document.getElementById('add-book-modal');
const addBookForm = document.getElementById('add-book-form');

function openAddBookModal() {
    addBookModal.classList.add('active');
    document.getElementById('book-title').focus();
}

function closeAddBookModal() {
    addBookModal.classList.remove('active');
    addBookForm.reset();
}

addBookForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        title: document.getElementById('book-title').value,
        author: document.getElementById('book-author').value,
        category: document.getElementById('book-category').value,
        price: document.getElementById('book-price').value,
        quantity: document.getElementById('book-quantity').value,
        cover_url: document.getElementById('book-cover').value,
        performed_by: currentUser ? currentUser.display_name : 'Admin'
    };

    try {
        const response = await fetch(`${API_URL}/books`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            closeAddBookModal();
            fetchBooks();
            fetchCategories();
            fetchPopularBooks();
            fetchNewBooks();
        }
    } catch {}
});

addBookModal.addEventListener('click', (e) => { if (e.target === addBookModal) closeAddBookModal(); });

// ========== EDIT BOOK MODAL (Admin) ==========
const editBookModal = document.getElementById('edit-book-modal');
const editBookForm = document.getElementById('edit-book-form');

function openEditBookModal(bookId) {
    const book = books.find(b => b.id === bookId);
    if (!book) return;

    document.getElementById('edit-book-id').value = book.id;
    document.getElementById('edit-book-title').value = book.title;
    document.getElementById('edit-book-author').value = book.author;
    document.getElementById('edit-book-category').value = book.category || '';
    document.getElementById('edit-book-price').value = book.price || 0;
    document.getElementById('edit-book-quantity').value = book.quantity || 1;
    document.getElementById('edit-book-cover').value = book.cover_url || '';
    document.getElementById('edit-cover-preview-img').src = book.cover_url || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80';

    editBookModal.classList.add('active');
}

function closeEditBookModal() {
    editBookModal.classList.remove('active');
    editBookForm.reset();
}

// Live preview cover image
document.getElementById('edit-book-cover').addEventListener('input', (e) => {
    const url = e.target.value;
    if (url) {
        document.getElementById('edit-cover-preview-img').src = url;
    }
});

editBookForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bookId = document.getElementById('edit-book-id').value;
    const payload = {
        title: document.getElementById('edit-book-title').value,
        author: document.getElementById('edit-book-author').value,
        category: document.getElementById('edit-book-category').value,
        price: document.getElementById('edit-book-price').value,
        quantity: document.getElementById('edit-book-quantity').value,
        cover_url: document.getElementById('edit-book-cover').value,
        performed_by: currentUser ? currentUser.display_name : 'Admin'
    };

    try {
        const response = await fetch(`${API_URL}/books/${bookId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            closeEditBookModal();
            fetchBooks();
            fetchCategories();
            fetchPopularBooks();
            fetchNewBooks();
            showToast('✅ Book updated successfully!');
        } else {
            const data = await response.json();
            alert('Update failed: ' + data.error);
        }
    } catch {
        alert('Network error during update.');
    }
});

editBookModal.addEventListener('click', (e) => { if (e.target === editBookModal) closeEditBookModal(); });

// ========== TOAST NOTIFICATION ==========
function showToast(message) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// ========== RETURN BOOK ==========
async function returnBook(book_id) {
    try {
        const response = await fetch(`${API_URL}/return`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ book_id })
        });
        if (response.ok) {
            fetchBooks();
        } else {
            const data = await response.json();
            alert("Return Failed: " + data.error);
        }
    } catch {
        alert("Network error.");
    }
}

// ========== DELETE BOOK ==========
async function deleteBook(book_id) {
    const performedBy = currentUser ? currentUser.display_name : 'Admin';
    try {
        const response = await fetch(`${API_URL}/books/${book_id}?performed_by=${encodeURIComponent(performedBy)}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (response.ok) {
            showToast('🗑️ Book deleted successfully!');
            fetchBooks();
            fetchCategories();
            fetchPopularBooks();
            fetchNewBooks();
        } else {
            alert("Delete Failed: " + data.error);
        }
    } catch (err) {
        console.error("Delete error:", err);
        alert("Network error: " + err.message);
    }
}

// ========== BOOK DETAIL MODAL ==========
function openBookDetail(bookId) {
    const book = books.find(b => b.id === bookId);
    if (!book) return;

    document.getElementById('bd-cover').src = book.cover_url || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80';
    document.getElementById('bd-category').textContent = book.category || 'Uncategorized';
    document.getElementById('bd-title').textContent = book.title;
    document.getElementById('bd-author').textContent = `by ${book.author}`;
    document.getElementById('bd-price').textContent = book.price ? `฿${Number(book.price).toLocaleString()}` : 'Free';
    
    const isAvailable = book.status === 'available';
    const statusEl = document.getElementById('bd-status');
    statusEl.className = `status-badge ${isAvailable ? 'status-available' : 'status-borrowed'}`;
    statusEl.textContent = isAvailable ? 'Available' : 'Borrowed';

    const actions = document.getElementById('bd-actions');
    const inCart = cart.some(c => c.book_id === book.id);
    if (isAvailable) {
        if (inCart) {
            actions.innerHTML = `<button class="btn btn-in-cart" style="width:100%" onclick="removeFromCart(${book.id})">✅ In Cart</button>`;
        } else {
            actions.innerHTML = `<button class="btn btn-add-cart" style="width:100%" onclick="addToCart(${book.id}, '${book.title.replace(/'/g, "\\'")}', ${book.price || 0}, '${(book.cover_url || '').replace(/'/g, "\\'")}')">🛒 Add to Cart</button>`;
        }
    } else {
        actions.innerHTML = '';
    }

    document.getElementById('book-detail-modal').classList.add('active');

    // Record view if logged in
    if (currentUser) {
        fetch(`${API_URL}/books/${book.id}/view`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id })
        }).catch(err => console.error(err));
    }

    // Fetch demographics
    fetchBookDemographics(book.id);
}

function closeBookDetailModal() {
    document.getElementById('book-detail-modal').classList.remove('active');
}

document.getElementById('book-detail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'book-detail-modal') closeBookDetailModal();
});

async function fetchBookDemographics(bookId) {
    document.getElementById('bd-fav-count-text').textContent = '...';
    document.getElementById('age-bars-container').innerHTML = '<div style="color:var(--text-secondary); text-align:center;">Loading...</div>';
    
    // Clear pie chart
    const canvas = document.getElementById('gender-pie-chart');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    document.getElementById('gender-empty').style.display = 'none';

    try {
        const res = await fetch(`${API_URL}/books/${bookId}/stats`);
        const result = await res.json();
        if (res.ok) {
            renderDemographics(result.data);
        }
    } catch {}
}

function renderDemographics(stats) {
    document.getElementById('bd-fav-count-text').textContent = stats.favorites;
    
    // Gender Pie Chart
    const canvas = document.getElementById('gender-pie-chart');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    
    const colors = {
        'Male': '#3b82f6',
        'Female': '#ec4899',
        'Other': '#8b5cf6',
        'Not Specified': '#94a3b8'
    };
    
    let totalGender = 0;
    for (let k in stats.gender) totalGender += stats.gender[k];
    
    if (totalGender === 0) {
        document.getElementById('gender-empty').style.display = 'block';
        document.getElementById('gender-pie-legend').innerHTML = '';
    } else {
        document.getElementById('gender-empty').style.display = 'none';
        let currentAngle = -Math.PI / 2;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 5;
        
        let legendHTML = '';
        
        for (let g in stats.gender) {
            const count = stats.gender[g];
            if (count > 0) {
                const sliceAngle = (count / totalGender) * 2 * Math.PI;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
                ctx.closePath();
                ctx.fillStyle = colors[g] || '#ccc';
                ctx.fill();
                currentAngle += sliceAngle;
                
                const percent = Math.round((count / totalGender)*100);
                legendHTML += `<div style="display:flex; align-items:center; gap:0.2rem;"><span style="display:inline-block;width:10px;height:10px;background:${colors[g]};border-radius:2px;"></span> ${g} (${percent}%)</div>`;
            }
        }
        document.getElementById('gender-pie-legend').innerHTML = legendHTML;
    }
    
    // Age Bars
    const ageLabels = ['<18', '18-24', '25-34', '35-44', '45+'];
    let totalAge = 0;
    for (let k of ageLabels) totalAge += stats.age[k] || 0;
    
    if (totalAge === 0) {
        document.getElementById('age-bars-container').innerHTML = '<div style="color:var(--text-secondary); text-align:center; margin-top:2rem;">No Data</div>';
    } else {
        const maxAge = Math.max(...Object.values(stats.age), 1);
        document.getElementById('age-bars-container').innerHTML = ageLabels.map(label => {
            const count = stats.age[label] || 0;
            const pct = (count / maxAge) * 100;
            return `
                <div class="age-bar-wrapper">
                    <div class="age-bar-label">${label}</div>
                    <div class="age-bar-track">
                        <div class="age-bar-fill" style="width: ${pct}%"></div>
                    </div>
                    <div class="age-bar-val">${count}</div>
                </div>
            `;
        }).join('');
    }
}
