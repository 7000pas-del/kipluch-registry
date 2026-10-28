const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// === НАСТРОЙКИ SUPABASE ===
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://agazwrcwacttmioniqhg.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_EDUVkDHltBA_mfVzK12tXA_VBPA_M94';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Настройка Multer для обработки загружаемых файлов в памяти
const upload = multer({ storage: multer.memoryStorage() });

// База данных SQLite
const db = new sqlite3.Database('./archive.db', (err) => {
  if (err) console.error('Ошибка подключения к БД:', err.message);
  else console.log('Подключено к базе данных SQLite.');
});

// Создание таблиц при запуске
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS scales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    object_name TEXT,
    scale_type TEXT,
    serial_number TEXT,
    passport_file TEXT,
    photo_file TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Настройка сессий
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'kipluch-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // Сессия на 8 часов
}));

// Проверка авторизации (Middleware)
function checkAuth(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Необходима авторизация' });
  }
}

// === МАРШРУТЫ АВТОРИЗАЦИИ ===

// Вход в систему
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Неверный логин или пароль' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      req.session.user = { id: user.id, username: user.username, role: user.role };
      res.json({ success: true, user: req.session.user });
    } else {
      res.status(400).json({ error: 'Неверный логин или пароль' });
    }
  });
});

// Выход
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Проверка статуса входа
app.get('/api/me', (req, res) => {
  if (req.session.user) res.json({ loggedIn: true, user: req.session.user });
  else res.json({ loggedIn: false });
});

// === МАРШРУТЫ РАБОТЫ С ВЕСАМИ (ЗАЩИЩЕННЫЕ) ===

// Получение списка весов
app.get('/api/scales', checkAuth, (req, res) => {
  db.all('SELECT * FROM scales ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Добавление записи и загрузка файлов в Supabase
app.post('/api/scales', checkAuth, upload.fields([{ name: 'passport' }, { name: 'photo' }]), async (req, res) => {
  try {
    const { object_name, scale_type, serial_number } = req.body;
    let passportUrl = '';
    let photoUrl = '';

    // Загрузка паспорта/акта в Supabase Storage
    if (req.files['passport']) {
      const file = req.files['passport'][0];
      const fileName = `passports/${Date.now()}_${file.originalname}`;
      const { data, error } = await supabase.storage.from('uploads').upload(fileName, file.buffer, {
        contentType: file.mimetype
      });
      if (error) throw error;
      passportUrl = `${SUPABASE_URL}/storage/v1/object/public/uploads/${fileName}`;
    }

    // Загрузка фото в Supabase Storage
    if (req.files['photo']) {
      const file = req.files['photo'][0];
      const fileName = `photos/${Date.now()}_${file.originalname}`;
      const { data, error } = await supabase.storage.from('uploads').upload(fileName, file.buffer, {
        contentType: file.mimetype
      });
      if (error) throw error;
      photoUrl = `${SUPABASE_URL}/storage/v1/object/public/uploads/${fileName}`;
    }

    // Сохранение в SQLite
    db.run(
      'INSERT INTO scales (object_name, scale_type, serial_number, passport_file, photo_file) VALUES (?, ?, ?, ?, ?)',
      [object_name, scale_type, serial_number, passportUrl, photoUrl],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, success: true });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Статические файлы
app.use(express.static('public'));

app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));