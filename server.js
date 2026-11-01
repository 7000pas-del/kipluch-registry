const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'archive.db');

// --- НАСТРОЙКА ХРАНИЛИЩА И ЛИМИТОВ (MULTER) ---
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

// Защита от переполнения: ограничение размера файла до 10 МБ
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- ИНИЦИАЛИЗАЦИЯ И МИГРАЦИЯ БАЗЫ ДАННЫХ ---
let db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('Ошибка подключения к БД:', err.message);
    else console.log('Успешное подключение к SQLite БД');
});

function initDatabase() {
    db.serialize(() => {
        // Таблица пользователей
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT
        )`);

        // Таблица оборудования
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

        // Создание стандартного администратора, если его нет
        db.get("SELECT * FROM users WHERE username = 'admin'", async (err, row) => {
            if (!row) {
                const hashedPassword = await bcrypt.hash('admin123', 10);
                db.run("INSERT INTO users (username, password, role) VALUES ('admin', ?, 'admin')", [hashedPassword]);
                console.log('Создан дефолтный администратор (admin / admin123)');
            }
        });

        // Автоматическое захеширование старых паролей открытого текста
        db.all("SELECT id, password FROM users", async (err, users) => {
            if (users) {
                for (const user of users) {
                    if (user.password && !user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
                        const hashed = await bcrypt.hash(user.password, 10);
                        db.run("UPDATE users SET password = ? WHERE id = ?", [hashed, user.id]);
                        console.log(`Пароль пользователя ID ${user.id} захеширован.`);
                    }
                }
            }
        });
    });
}

initDatabase();

// --- MIDDLEWARE ПРОВЕРКИ АВТОРИЗАЦИИ И ПРАВ НА СЕРВЕРЕ ---
const requireAuth = (req, res, next) => {
    const userRole = req.headers['x-user-role'];
    if (!userRole) {
        return res.status(401).json({ error: 'Необходима авторизация' });
    }
    next();
};

const requireAdmin = (req, res, next) => {
    const userRole = req.headers['x-user-role'];
    if (userRole !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен. Требуются права администратора' });
    }
    next();
};

// --- AUTH API ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Неверный логин или пароль' });

        res.json({
            id: user.id,
            username: user.username,
            role: user.role
        });
    });
});

// --- USERS API ---
app.get('/api/users', requireAdmin, (req, res) => {
    db.all("SELECT id, username, role FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users', requireAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Укажите логин и пароль' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
            [username, hashedPassword, role || 'user'],
            function(err) {
                if (err) return res.status(400).json({ error: 'Пользователь уже существует' });
                res.json({ id: this.lastID, username, role });
            }
        );
    } catch (e) {
        res.status(500).json({ error: 'Ошибка хеширования пароля' });
    }
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
    db.run("DELETE FROM users WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- EQUIPMENT API ---
app.get('/api/equipment', requireAuth, (req, res) => {
    db.all("SELECT * FROM equipment", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/equipment', requireAuth, (req, res) => {
    const { name, type, serialNumber, verificationDate, nextVerificationDate, status, location, notes, files } = req.body;
    const query = `INSERT INTO equipment (name, type, serialNumber, verificationDate, nextVerificationDate, status, location, notes, files) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(query, [name, type, serialNumber, verificationDate, nextVerificationDate, status, location, notes, JSON.stringify(files || [])], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.put('/api/equipment/:id', requireAuth, (req, res) => {
    const { name, type, serialNumber, verificationDate, nextVerificationDate, status, location, notes, files } = req.body;
    const query = `UPDATE equipment SET name=?, type=?, serialNumber=?, verificationDate=?, nextVerificationDate=?, status=?, location=?, notes=?, files=? WHERE id=?`;
    db.run(query, [name, type, serialNumber, verificationDate, nextVerificationDate, status, location, notes, JSON.stringify(files || []), req.params.id], function(err) {
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

// --- UPLOAD API ---
app.post('/api/upload', requireAuth, upload.array('files'), (req, res) => {
    const filePaths = req.files.map(f => `/uploads/${f.filename}`);
    res.json({ paths: filePaths });
});

// --- BACKUP & RESTORE API ---
app.get('/api/backup/download', requireAdmin, (req, res) => {
    res.download(DB_PATH, 'archive.db');
});

const backupUpload = multer({ dest: 'temp/' });
app.post('/api/backup/upload', requireAdmin, backupUpload.single('backup'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл бэкапа не выбран' });

    const tempPath = req.file.path;

    // Корректно закрываем текущую БД во избежание ошибки EBUSY на Windows
    db.close((err) => {
        if (err) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            return res.status(500).json({ error: 'Не удалось освободить файл базы данных' });
        }

        fs.copyFile(tempPath, DB_PATH, (copyErr) => {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

            // Переподключаем сервер к обновленной базе данных
            db = new sqlite3.Database(DB_PATH, (reconnectErr) => {
                if (copyErr || reconnectErr) {
                    return res.status(500).json({ error: 'Ошибка восстановления базы данных' });
                }
                initDatabase();
                res.json({ success: true, message: 'База данных успешно восстановлена' });
            });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
