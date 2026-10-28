const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Подключение базы данных SQLite
const db = new sqlite3.Database('./archive.db', (err) => {
  if (err) {
    console.error('Ошибка подключения к БД:', err.message);
  } else {
    console.log('Подключено к базе данных SQLite.');
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Маршрут для проверки логина и пароля
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  // Логин и пароль для входа:
  const ADMIN_USER = "admin";
  const ADMIN_PASS = "kipluch2026"; // При необходимости измените пароль на свой

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ success: true });
  } else {
    res.json({ success: false, message: "Неверный логин или пароль" });
  }
});

// Порт для Render.com
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
