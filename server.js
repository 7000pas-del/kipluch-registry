const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'archive.db');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

let db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('Ошибка подключения к БД:', err.message);
    else console.log('Успешное подключение к SQLite БД');
});

function initDatabase() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT
        )`);

        // Гарантируем создание правильной таблицы оборудования со всеми полями
        db.run(`CREATE TABLE IF NOT EXISTS equipment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            serialNumber TEXT,
            verificationDate TEXT,
            nextVerificationDate TEXT,
            status TEXT,
            location TEXT,
            notes TEXT,
            files TEXT
        )`, (err) => {
            if (!err) {
                // Если таблица уже существовала со старой структурой, безопасно добавляем недостающие колонки
                const columns = [
                    'serialNumber TEXT',
                    'verificationDate TEXT',
                    'nextVerificationDate TEXT',
                    'status TEXT',
                    'location TEXT',
                    'notes TEXT',
                    'files TEXT'
                ];
                columns.forEach(col => {
                    db.run(`ALTER TABLE equipment ADD COLUMN ${col}`, () => {});
                });
            }
        });

        db.run(`CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            parentId INTEGER,
            type TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            content TEXT,
            date TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            filename TEXT,
            folderId INTEGER,
            type TEXT,
            date TEXT
        )`);

        db.run("DELETE FROM users WHERE username = 'admin'", () => {
            db.run("INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin')", (err) => {
                if (!err) console.log('Пользователь admin успешно инициализирован');
            });
        });
    });
}

initDatabase();

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        res.json({
            success: true,
            user: { id: user.id, username: user.username, role: user.role }
        });
    });
});

const requireAuth = (req, res, next) => {
    const authHeader = req.headers['x-auth-user'];
    if (!authHeader) return res.status(401).json({ error: 'Требуется авторизация' });
    try {
        const user = JSON.parse(authHeader);
        if (user && user.username) return next();
    } catch (e) {}
    res.status(401).json({ error: 'Недействительная сессия' });
};

// --- Оборудование ---
app.get('/api/equipment', requireAuth, (req, res) => {
    db.all("SELECT * FROM equipment", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/equipment', requireAuth, upload.array('files'), (req, res) => {
    const { name, serialNumber, verificationDate, nextVerificationDate, status, location, notes } = req.body;
    const query = `INSERT INTO equipment (name, serialNumber, verificationDate, nextVerificationDate, status, location, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(query, [name || 'Без названия', serialNumber || '', verificationDate || '', nextVerificationDate || '', status || 'В эксплуатации', location || '', notes || ''], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, success: true });
    });
});

app.put('/api/equipment/:id', requireAuth, upload.array('files'), (req, res) => {
    const id = req.params.id;
    const { name, serialNumber, verificationDate, nextVerificationDate, status, location, notes } = req.body;
    
    const query = `UPDATE equipment SET name = ?, serialNumber = ?, verificationDate = ?, nextVerificationDate = ?, status = ?, location = ?, notes = ? WHERE id = ?`;
    db.run(query, [name || 'Без названия', serialNumber || '', verificationDate || '', nextVerificationDate || '', status || 'В эксплуатации', location || '', notes || '', id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/equipment/:id', requireAuth, (req, res) => {
    const eqId = req.params.id;
    db.run("DELETE FROM equipment WHERE id = ?", [eqId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- Папки ---
app.get('/api/folders', requireAuth, (req, res) => {
    const type = req.query.type || 'doc';
    const parentId = req.query.parentId;

    let query = "SELECT * FROM folders WHERE type = ?";
    let params = [type];

    if (parentId && parentId !== 'root' && parentId !== 'null' && parentId !== 'undefined' && parentId !== '' && parentId !== '0') {
        query += " AND parentId = ?";
        params.push(parentId);
    } else {
        query += " AND (parentId IS NULL OR parentId = '' OR parentId = 0)";
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/folders', requireAuth, (req, res) => {
    const { name, parentId, type } = req.body;
    let pId = (!parentId || parentId === 'root' || parentId === 'null' || parentId === 'undefined' || parentId === '' || parentId === 0) ? null : parentId;
    
    db.run("INSERT INTO folders (name, parentId, type) VALUES (?, ?, ?)", [name, pId, type || 'doc'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, success: true });
    });
});

app.delete('/api/folders/:id', requireAuth, (req, res) => {
    const folderId = req.params.id;
    db.serialize(() => {
        db.run("DELETE FROM files WHERE folderId = ?", [folderId], () => {});
        db.run("DELETE FROM folders WHERE id = ?", [folderId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// --- Файлы и Фото ---
app.get('/api/files', requireAuth, (req, res) => {
    const type = req.query.type || 'doc';
    const folderId = req.query.folderId;
    const all = req.query.all;

    let query = "SELECT * FROM files WHERE type = ?";
    let params = [type];

    if (all === 'true') {
        db.all(query, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
        return;
    }

    if (folderId && folderId !== 'null' && folderId !== 'undefined' && folderId !== '' && folderId !== '0') {
        query += " AND folderId = ?";
        params.push(folderId);
    } else {
        query += " AND (folderId IS NULL OR folderId = '' OR folderId = 0)";
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/files', requireAuth, upload.array('files'), (req, res) => {
    const { type, folderId } = req.body;
    const fId = (!folderId || folderId === 'null' || folderId === 'undefined' || folderId === '' || folderId === 0) ? null : folderId;
    const date = new Date().toLocaleDateString('ru-RU');

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Файлы не переданы' });
    }

    let insertedCount = 0;
    req.files.forEach(file => {
        const fixedOriginalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        db.run(`INSERT INTO files (name, filename, folderId, type, date) VALUES (?, ?, ?, ?, ?)`, [fixedOriginalName, file.filename, fId, type || 'doc', date], function(err) {
            if (!err) insertedCount++;
            if (insertedCount === req.files.length) res.json({ success: true });
        });
    });
});

app.delete('/api/files/:id', requireAuth, (req, res) => {
    db.run("DELETE FROM files WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- Заметки ---
app.get('/api/notes', requireAuth, (req, res) => {
    db.all("SELECT * FROM notes", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/notes', requireAuth, (req, res) => {
    const { title, content } = req.body;
    const date = new Date().toLocaleDateString('ru-RU');
    db.run("INSERT INTO notes (title, content, date) VALUES (?, ?, ?)", [title || 'Без названия', content || '', date], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.put('/api/notes/:id', requireAuth, (req, res) => {
    const { title, content } = req.body;
    db.run("UPDATE notes SET title = ?, content = ? WHERE id = ?", [title || 'Без названия', content || '', req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/notes/:id', requireAuth, (req, res) => {
    db.run("DELETE FROM notes WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
