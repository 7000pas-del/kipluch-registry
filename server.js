const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// База данных
const db = new sqlite3.Database('./archive.db', (err) => {
  if (err) console.error('Ошибка БД:', err.message);
  else console.log('Подключено к базе данных SQLite.');
});

// Авторизация
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'kipluch2026') {
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Неверный логин или пароль' });
  }
});

// Ваши API эндпоинты (базовые для работы реестра)
app.get('/api/db', (req, res) => {
  db.all("SELECT * FROM folders", [], (err, folders) => {
    db.all("SELECT * FROM items", [], (err2, items) => {
      res.json({ folders: folders || [], items: items || [] });
    });
  });
});

app.get('/api/equipment', (req, res) => {
  db.all("SELECT * FROM equipment", [], (err, rows) => {
    res.json(rows || []);
  });
});

app.post('/api/equipment', (req, res) => {
  const eq = req.body;
  if (eq.id) {
    db.run(`UPDATE equipment SET name=?, serialNumber=?, gsiNumber=?, ownerName=?, location=?, capacity=?, minCapacity=?, discrete=?, adcType=?, sensorType=?, platformCount=?, weighingMode=?, installationDate=?, lastVerification=?, nextVerification=?, certNumber=?, phone=?, email=?, status=?, notes=? WHERE id=?`,
      [eq.name, eq.serialNumber, eq.gsiNumber, eq.ownerName, eq.location, eq.capacity, eq.minCapacity, eq.discrete, eq.adcType, eq.sensorType, eq.platformCount, eq.weighingMode, eq.installationDate, eq.lastVerification, eq.nextVerification, eq.certNumber, eq.phone, eq.email, eq.status, eq.notes, eq.id],
      function(err) { res.json({ success: !err, error: err ? err.message : null }); }
    );
  } else {
    const newId = 'eq_' + Date.now();
    db.run(`INSERT INTO equipment (id, name, serialNumber, gsiNumber, ownerName, location, capacity, minCapacity, discrete, adcType, sensorType, platformCount, weighingMode, installationDate, lastVerification, nextVerification, certNumber, phone, email, status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [newId, eq.name, eq.serialNumber, eq.gsiNumber, eq.ownerName, eq.location, eq.capacity, eq.minCapacity, eq.discrete, eq.adcType, eq.sensorType, eq.platformCount, eq.weighingMode, eq.installationDate, eq.lastVerification, eq.nextVerification, eq.certNumber, eq.phone, eq.email, eq.status, eq.notes],
      function(err) { res.json({ success: !err, error: err ? err.message : null }); }
    );
  }
});

app.delete('/api/equipment/:id', (req, res) => {
  db.run("DELETE FROM equipment WHERE id = ?", [req.params.id], function(err) {
    res.json({ success: !err });
  });
});

app.get('/api/maintenance/:id', (req, res) => {
  db.all("SELECT * FROM maintenance WHERE equipmentId = ?", [req.params.id], (err, rows) => {
    res.json(rows || []);
  });
});

app.post('/api/maintenance', (req, res) => {
  const m = req.body;
  const newId = 'maint_' + Date.now();
  db.run("INSERT INTO maintenance (id, equipmentId, workType, date, description, performedBy) VALUES (?,?,?,?,?,?)",
    [newId, m.equipmentId, m.workType, m.date, m.description, m.performedBy],
    function(err) { res.json({ success: !err }); }
  );
});

app.delete('/api/maintenance/:id', (req, res) => {
  db.run("DELETE FROM maintenance WHERE id = ?", [req.params.id], function(err) {
    res.json({ success: !err });
  });
});

app.get('/api/system/stats', (req, res) => {
  let stats = { dbSizeKB: 0, eqCount: 0, itemsCount: 0, uploadsSizeMB: 0 };
  try {
    const statsStat = fs.statSync('./archive.db');
    stats.dbSizeKB = Math.round(statsStat.size / 1024);
  } catch(e) {}
  db.get("SELECT COUNT(*) as cnt FROM equipment", [], (e, r) => {
    if (r) stats.eqCount = r.cnt;
    db.get("SELECT COUNT(*) as cnt FROM items", [], (e2, r2) => {
      if (r2) stats.itemsCount = r2.cnt;
      res.json(stats);
    });
  });
});

app.get('/api/backup', (req, res) => {
  res.download('./archive.db');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
