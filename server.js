const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_VERCEL = !!process.env.VERCEL;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// --- JSON file storage (CloudPanel / VPS) ---
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  if (IS_VERCEL) return {}; // Vercel: no persistent filesystem
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading data:', e.message);
  }
  return {};
}

function saveData(data) {
  if (IS_VERCEL) return; // Vercel: no persistent filesystem
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));

// --- Auth middleware ---
function requireAuth(req, res, next) {
  if (!req.session.userName) {
    return res.status(401).json({ error: 'Non connecté' });
  }
  next();
}

// --- Routes ---

// Login
app.post('/api/login', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name || name.length > 100) {
    return res.status(400).json({ error: 'Nom invalide' });
  }

  req.session.userName = name;

  // Ensure user entry exists
  const data = loadData();
  if (!data[name]) {
    data[name] = {};
    saveData(data);
  }

  res.json({ name });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// Get current user
app.get('/api/me', (req, res) => {
  if (!req.session.userName) {
    return res.json({ loggedIn: false });
  }
  res.json({ loggedIn: true, name: req.session.userName });
});

// Get all todos for user
app.get('/api/todos', requireAuth, (req, res) => {
  if (IS_VERCEL) {
    return res.json(req.session.todos || {});
  }
  const data = loadData();
  const todos = data[req.session.userName] || {};
  res.json(todos);
});

// Toggle a todo
app.post('/api/todos/toggle', requireAuth, (req, res) => {
  const key = (req.body.key || '').trim();
  if (!key || !/^(is|soc|ar|fr)\d{2}$/.test(key)) {
    return res.status(400).json({ error: 'Clé invalide' });
  }
  const done = !!req.body.done;

  if (IS_VERCEL) {
    if (!req.session.todos) req.session.todos = {};
    if (done) { req.session.todos[key] = true; } else { delete req.session.todos[key]; }
    return res.json({ ok: true });
  }

  const data = loadData();
  if (!data[req.session.userName]) data[req.session.userName] = {};

  if (done) {
    data[req.session.userName][key] = true;
  } else {
    delete data[req.session.userName][key];
  }

  saveData(data);
  res.json({ ok: true });
});

// Reset a subject
app.post('/api/todos/reset', requireAuth, (req, res) => {
  const subj = (req.body.subj || '').trim();
  const allowed = ['is', 'soc', 'ar', 'fr'];
  if (!allowed.includes(subj)) {
    return res.status(400).json({ error: 'Matière invalide' });
  }

  if (IS_VERCEL) {
    if (req.session.todos) {
      for (const key of Object.keys(req.session.todos)) {
        if (key.startsWith(subj)) delete req.session.todos[key];
      }
    }
    return res.json({ ok: true });
  }

  const data = loadData();
  const userTodos = data[req.session.userName] || {};
  for (const key of Object.keys(userTodos)) {
    if (key.startsWith(subj)) {
      delete userTodos[key];
    }
  }
  data[req.session.userName] = userTodos;
  saveData(data);
  res.json({ ok: true });
});

// Serve app page
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// Redirect root to login
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server only when not on Vercel (Vercel uses the export)
if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
  });
}

module.exports = app;
