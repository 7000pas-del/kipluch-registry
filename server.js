const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Настройка папки для загрузок
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Инициализация базы данных SQLite
const dbFile = path.join(__dirname, 'archive.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) console.error('Ошибка открытия БД:', err.message);
    else console.log('Подключено к базе данных SQLite.');
});

// Создание таблиц при запуске
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        permissions TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS equipment (
        id TEXT PRIMARY KEY,
        name TEXT,
        serialNumber TEXT,
        gsiNumber TEXT,
        ownerName TEXT,
        location TEXT,
        installationDate TEXT,
        capacity TEXT,
        minCapacity TEXT,
        discrete TEXT,
        adcType TEXT,
        sensorType TEXT,
        platformCount TEXT,
        weighingMode TEXT,
        lastVerification TEXT,
        nextVerification TEXT,
        certNumber TEXT,
        phone TEXT,
        email TEXT,
        status TEXT,
        notes TEXT
    )`, () => {
        // Автоматически добавляем колонку gsiNumber, если таблица была создана ранее без неё
        db.run(`ALTER TABLE equipment ADD COLUMN gsiNumber TEXT`, () => {});
    });

    db.run(`CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        type TEXT,
        name TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        type TEXT,
        name TEXT,
        content TEXT,
        filePath TEXT,
        folderId TEXT,
        equipmentId TEXT,
        date TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS maintenance (
        id TEXT PRIMARY KEY,
        equipmentId TEXT,
        workType TEXT,
        date TEXT,
        description TEXT,
        performedBy TEXT
    )`);

    // Создаем админа по умолчанию, если его нет
    db.get(`SELECT * FROM users WHERE username = ?`, ['admin'], (err, row) => {
        if (!row) {
            const adminId = 'user_' + Date.now();
            db.run(
                `INSERT INTO users (id, username, password, role, permissions) VALUES (?, ?, ?, ?, ?)`,
                [adminId, 'admin', 'admin', 'admin', 'all'],
                (e) => {
                    if (!e) console.log('Создан дефолтный администратор (логин: admin, пароль: admin)');
                }
            );
        }
    });
});

// --- API АВТОРИЗАЦИИ ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
        if (err || !user) {
            return res.json({ success: false, error: 'Неверный логин или пароль' });
        }
        res.json({
            success: true,
            role: user.role,
            permissions: user.permissions
        });
    });
});

// --- API ПОЛЬЗОВАТЕЛЕЙ ---
app.get('/api/users', (req, res) => {
    db.all(`SELECT id, username, role, permissions FROM users`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users', (req, res) => {
    let { id, username, password, role, permissions } = req.body;
    const permString = Array.isArray(permissions) ? permissions.join(',') : (permissions || '');

    if (!id) {
        id = 'user_' + Date.now();
        db.run(
            `INSERT INTO users (id, username, password, role, permissions) VALUES (?, ?, ?, ?, ?)`,
            [id, username, password, role, permString],
            (err) => {
                if (err) return res.json({ success: false, error: 'Пользователь уже существует' });
                res.json({ success: true });
            }
        );
    } else {
        if (password) {
            db.run(
                `UPDATE users SET username = ?, password = ?, role = ?, permissions = ? WHERE id = ?`,
                [username, password, role, permString, id],
                (err) => {
                    if (err) return res.json({ success: false, error: err.message });
                    res.json({ success: true });
                }
            );
        } else {
            db.run(
                `UPDATE users SET username = ?, role = ?, permissions = ? WHERE id = ?`,
                [username, role, permString, id],
                (err) => {
                    if (err) return res.json({ success: false, error: err.message });
                    res.json({ success: true });
                }
            );
        }
    }
});

app.delete('/api/users/:id', (req, res) => {
    db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// --- API БАЗЫ ДАННЫХ И ОБОРУДОВАНИЯ ---
app.get('/api/db', (req, res) => {
    db.all(`SELECT * FROM folders`, [], (err, folders) => {
        if (err) return res.status(500).json({ error: err.message });
        db.all(`SELECT * FROM items`, [], (err2, items) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ folders, items });
        });
    });
});

app.get('/api/equipment', (req, res) => {
    db.all(`SELECT * FROM equipment`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/equipment', (req, res) => {
    const eq = req.body;
    const id = eq.id || ('eq_' + Date.now());

    const query = `INSERT INTO equipment (
        id, name, serialNumber, gsiNumber, ownerName, location, installationDate,
        capacity, minCapacity, discrete, adcType, sensorType, platformCount,
        weighingMode, lastVerification, nextVerification, certNumber, phone, email, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, serialNumber=excluded.serialNumber, gsiNumber=excluded.gsiNumber,
        ownerName=excluded.ownerName, location=excluded.location, installationDate=excluded.installationDate,
        capacity=excluded.capacity, minCapacity=excluded.minCapacity, discrete=excluded.discrete,
        adcType=excluded.adcType, sensorType=excluded.sensorType, platformCount=excluded.platformCount,
        weighingMode=excluded.weighingMode, lastVerification=excluded.lastVerification,
        nextVerification=excluded.nextVerification, certNumber=excluded.certNumber,
        phone=excluded.phone, email=excluded.email, status=excluded.status, notes=excluded.notes`;

    db.run(query, [
        id, eq.name, eq.serialNumber, eq.gsiNumber, eq.ownerName, eq.location, eq.installationDate,
        eq.capacity, eq.minCapacity, eq.discrete, eq.adcType, eq.sensorType, eq.platformCount,
        eq.weighingMode, eq.lastVerification, eq.nextVerification, eq.certNumber, eq.phone, eq.email, eq.status, eq.notes
    ], (err) => {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true, id });
    });
});

app.delete('/api/equipment/:id', (req, res) => {
    db.run(`DELETE FROM equipment WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// --- API ОБСЛУЖИВАНИЯ ---
app.get('/api/maintenance/:eqId', (req, res) => {
    db.all(`SELECT * FROM maintenance WHERE equipmentId = ?`, [req.params.eqId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/maintenance', (req, res) => {
    const m = req.body;
    const id = 'maint_' + Date.now();
    db.run(
        `INSERT INTO maintenance (id, equipmentId, workType, date, description, performedBy) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, m.equipmentId, m.workType, m.date, m.description, m.performedBy],
        (err) => {
            if (err) return res.json({ success: false, error: err.message });
            res.json({ success: true });
        }
    );
});

app.delete('/api/maintenance/:id', (req, res) => {
    db.run(`DELETE FROM maintenance WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// --- API ПАПОК, ФАЙЛОВ И ЗАМЕТОК ---
app.post('/api/folders', (req, res) => {
    const { id, type, name } = req.body;
    db.run(`INSERT INTO folders (id, type, name) VALUES (?, ?, ?)`, [id, type, name], (err) => {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/folders/:id', (req, res) => {
    db.run(`DELETE FROM folders WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/upload', upload.array('files'), (req, res) => {
    const folderId = req.body.folderId || null;
    const files = req.files;
    if (!files || files.length === 0) return res.json({ success: false, error: 'Файлы не загружены' });

    db.serialize(() => {
        const stmt = db.prepare(`INSERT INTO items (id, type, name, content, filePath, folderId, date) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        files.forEach(file => {
            const id = 'item_' + Date.now() + Math.random().toString(36).substring(2, 7);
            const isImage = file.mimetype.startsWith('image/');
            const type = isImage ? 'image' : 'doc';
            const filePath = `/uploads/${file.filename}`;
            const dateStr = new Date().toISOString().slice(0, 10);
            stmt.run(id, type, file.originalname, '', filePath, folderId, dateStr);
        });
        stmt.finalize((err) => {
            if (err) return res.json({ success: false, error: err.message });
            res.json({ success: true });
        });
    });
});

app.post('/api/notes', (req, res) => {
    const { id, name, content, folderId } = req.body;
    const dateStr = new Date().toISOString().slice(0, 10);

    if (!id) {
        const newId = 'item_' + Date.now();
        db.run(
            `INSERT INTO items (id, type, name, content, filePath, folderId, date) VALUES (?, 'note', ?, ?, '', ?, ?)`,
            [newId, name, content, folderId || null, dateStr],
            (err) => {
                if (err) return res.json({ success: false, error: err.message });
                res.json({ success: true });
            }
        );
    } else {
        db.run(
            `UPDATE items SET name = ?, content = ? WHERE id = ?`,
            [name, content, id],
            (err) => {
                if (err) return res.json({ success: false, error: err.message });
                res.json({ success: true });
            }
        );
    }
});

app.delete('/api/items/:id', (req, res) => {
    db.run(`DELETE FROM items WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// --- API БЭКАПА ---
app.get('/api/backup/download', (req, res) => {
    res.download(dbFile, 'archive.db');
});

const backupUpload = multer({ dest: path.join(__dirname, 'temp') });
app.post('/api/backup/upload', backupUpload.single('backup'), (req, res) => {
    if (!req.file) return res.json({ success: false, error: 'Файл бэкапа не передан' });
    
    fs.copyFile(req.file.path, dbFile, (err) => {
        fs.unlink(req.file.path, () => {}); // удалить временный файл
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
