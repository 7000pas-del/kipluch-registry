const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });
const dbUpload = multer({ dest: 'temp/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const dbPath = './archive.db';
let db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Ошибка БД:', err.message);
  else console.log('Подключено к базе данных SQLite.');
});

function initDb() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS equipment (id TEXT PRIMARY KEY)`);
    
    const columns = [
      "name TEXT", "serialNumber TEXT", "gsiNumber TEXT", "ownerName TEXT", 
      "location TEXT", "installationDate TEXT", "capacity TEXT", "minCapacity TEXT", 
      "discrete TEXT", "adcType TEXT", "sensorType TEXT", "platformCount TEXT", 
      "weighingMode TEXT", "lastVerification TEXT", "nextVerification TEXT", 
      "certNumber TEXT", "phone TEXT", "email TEXT", "status TEXT", "notes TEXT"
    ];
    
    columns.forEach(col => {
      db.run(`ALTER TABLE equipment ADD COLUMN ${col}`, () => {});
    });

    db.run(`CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, type TEXT, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, type TEXT, name TEXT, filePath TEXT, size TEXT, date TEXT, folderId TEXT, equipmentId TEXT, content TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS maintenance (id TEXT PRIMARY KEY, equipmentId TEXT, workType TEXT, date TEXT, description TEXT, performedBy TEXT)`);
  });
}
initDb();

// Авторизация
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'kipluch2026') {
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Неверный логин или пароль' });
  }
});

// Скачивание бэкапа archive.db
app.get('/api/admin/backup', (req, res) => {
  if (fs.existsSync(dbPath)) {
    res.download(dbPath, `archive_backup_${Date.now()}.db`);
  } else {
    res.status(404).json({ error: 'Файл базы данных не найден' });
  }
});

// Загрузка/восстановление бэкапа archive.db
app.post('/api/admin/restore', dbUpload.single('dbfile'), (req, res) => {
  if (!req.file) {
    return res.json({ success: false, error: 'Файл не выбран' });
  }

  const uploadedPath = req.file.path;

  // Закрываем подключение к текущей БД перед заменой файла
  db.close((err) => {
    if (err) {
      console.error('Ошибка при закрытии БД:', err.message);
      return res.json({ success: false, error: 'Не удалось закрыть текущую БД' });
    }

    try {
      fs.copyFileSync(uploadedPath, dbPath);
      fs.unlinkSync(uploadedPath);

      // Переподключаемся к обновленной БД
      db = new sqlite3.Database(dbPath, (err2) => {
        if (err2) {
          console.error('Ошибка при переподключении БД:', err2.message);
          return res.json({ success: false, error: 'Ошибка подключение к восстановленной БД' });
        }
        initDb();
        res.json({ success: true });
      });
    } catch (e) {
      console.error('Ошибка при замене файла БД:', e);
      res.json({ success: false, error: 'Ошибка сохранения файла БД' });
    }
  });
});

// Получение данных архива
app.get('/api/db', (req, res) => {
  db.all("SELECT * FROM folders", [], (err, folders) => {
    db.all("SELECT * FROM items", [], (err2, items) => {
      res.json({ folders: folders || [], items: items || [] });
    });
  });
});

// Оборудование
app.get('/api/equipment', (req, res) => {
  db.all("SELECT * FROM equipment", [], (err, rows) => {
    res.json(rows || []);
  });
});

app.post('/api/equipment', (req, res) => {
  const eq = req.body;
  if (eq.id) {
    db.run(`UPDATE equipment SET name=?, serialNumber=?, gsiNumber=?, ownerName=?, location=?, installationDate=?, capacity=?, minCapacity=?, discrete=?, adcType=?, sensorType=?, platformCount=?, weighingMode=?, lastVerification=?, nextVerification=?, certNumber=?, phone=?, email=?, status=?, notes=? WHERE id=?`,
      [eq.name, eq.serialNumber, eq.gsiNumber, eq.ownerName, eq.location, eq.installationDate, eq.capacity, eq.minCapacity, eq.discrete, eq.adcType, eq.sensorType, eq.platformCount, eq.weighingMode, eq.lastVerification, eq.nextVerification, eq.certNumber, eq.phone, eq.email, eq.status, eq.notes, eq.id],
      function(err) { 
        res.json({ success: !err, error: err ? err.message : null }); 
      }
    );
  } else {
    const newId = 'eq_' + Date.now();
    db.run(`INSERT INTO equipment (id, name, serialNumber, gsiNumber, ownerName, location, installationDate, capacity, minCapacity, discrete, adcType, sensorType, platformCount, weighingMode, lastVerification, nextVerification, certNumber, phone, email, status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [newId, eq.name, eq.serialNumber, eq.gsiNumber, eq.ownerName, eq.location, eq.installationDate, eq.capacity, eq.minCapacity, eq.discrete, eq.adcType, eq.sensorType, eq.platformCount, eq.weighingMode, eq.lastVerification, eq.nextVerification, eq.certNumber, eq.phone, eq.email, eq.status, eq.notes],
      function(err) { 
        res.json({ success: !err, error: err ? err.message : null }); 
      }
    );
  }
});

app.delete('/api/equipment/:id', (req, res) => {
  db.run("DELETE FROM equipment WHERE id = ?", [req.params.id], function(err) {
    res.json({ success: !err });
  });
});

// Папки
app.post('/api/folders', (req, res) => {
  const { id, type, name } = req.body;
  db.run("INSERT INTO folders (id, type, name) VALUES (?,?,?)", [id, type, name], function(err) {
    res.json({ success: !err });
  });
});

app.delete('/api/folders/:id', (req, res) => {
  const folderId = req.params.id;
  db.run("DELETE FROM folders WHERE id = ?", [folderId], function(err) {
    db.run("DELETE FROM items WHERE folderId = ?", [folderId], function() {
      res.json({ success: !err });
    });
  });
});

// Загрузка файлов
app.post('/api/upload', upload.array('files'), (req, res) => {
  const files = req.files;
  const folderId = req.body.folderId || null;
  const equipmentId = req.body.equipmentId || null;

  if (!files || files.length === 0) return res.json({ success: false, error: 'Нет файлов' });

  let completed = 0;
  files.forEach(file => {
    const ext = path.extname(file.originalname).toLowerCase();
    let type = 'doc';
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) type = 'image';

    const newPath = 'uploads/' + file.filename + ext;
    fs.renameSync(file.path, newPath);

    const sizeKB = Math.round(file.size / 1024) + ' KB';
    const dateStr = new Date().toISOString().slice(0, 10);
    const itemId = 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

    db.run("INSERT INTO items (id, type, name, filePath, size, date, folderId, equipmentId) VALUES (?,?,?,?,?,?,?,?)",
      [itemId, type, file.originalname, '/' + newPath, sizeKB, dateStr, folderId, equipmentId],
      () => {
        completed++;
        if (completed === files.length) res.json({ success: true });
      }
    );
  });
});

app.delete('/api/items/:id', (req, res) => {
  const itemId = req.params.id;
  db.get("SELECT filePath FROM items WHERE id = ?", [itemId], (err, row) => {
    if (row && row.filePath) {
      try { fs.unlinkSync('.' + row.filePath); } catch (e) {}
    }
    db.run("DELETE FROM items WHERE id = ?", [itemId], function(err2) {
      res.json({ success: !err2 });
    });
  });
});

// Заметки
app.post('/api/notes', (req, res) => {
  const { id, name, content, folderId } = req.body;
  const dateStr = new Date().toISOString().slice(0, 10);

  if (id) {
    db.run("UPDATE items SET name = ?, content = ? WHERE id = ?", [name, content, id], function(err) {
      res.json({ success: !err });
    });
  } else {
    const newId = 'note_' + Date.now();
    db.run("INSERT INTO items (id, type, name, content, date, folderId) VALUES (?, 'note', ?, ?, ?, ?)",
      [newId, name, content, dateStr, folderId],
      function(err) { res.json({ success: !err }); }
    );
  }
});

// Обслуживание
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
