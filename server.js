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

        db.run(`CREATE TABLE IF NOT EXISTS equipment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            type TEXT,
            serialNumber TEXT,
            verificationDate TEXT,
            nextVerificationDate TEXT,
            status TEXT,
            location TEXT,
            notes TEXT,
            files TEXT
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
    if (!authHeader) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    try {
        const user = JSON.parse(authHeader);
        if (user && user.username) {
            return next();
        }
    } catch (e) {}
    res.status(401).json({ error: 'Недействительная сессия' });
};

app.get('/api/equipment', requireAuth, (req, res) => {
    db.all("SELECT * FROM equipment", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/equipment', requireAuth, upload.array('files'), (req, res) => {
    const { name, type, serialNumber, verificationDate, nextVerificationDate, status, location, notes } = req.body;
    const files = req.files ? req.files.map(f => f.filename) : [];
    
    const query = `INSERT INTO equipment (name, type, serialNumber, verificationDate, nextVerificationDate, status, location, notes, files) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                   
    db.run(query, [name, type, serialNumber, verificationDate, nextVerificationDate, status, location, notes, JSON.stringify(files)], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.put('/api/equipment/:id', requireAuth, (req, res) => {
    const { name, type, serialNumber, verificationDate, nextVerificationDate, status, location, notes } = req.body;
    const query = `UPDATE equipment SET name = ?, type = ?, serialNumber = ?, verificationDate = ?, nextVerificationDate = ?, status = ?, location = ?, notes = ? WHERE id = ?`;
    
    db.run(query, [name, type || '', serialNumber, verificationDate || '', nextVerificationDate, status, location, notes, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/equipment/:id', requireAuth, (req, res) => {
    db.run("DELETE FROM equipment WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
