const express = require('express');
const { Pool } = require('pg');
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

let db = null;
let isPg = false;

// Подключение к БД: PostgreSQL (Supabase) или локальный SQLite
if (process.env.DATABASE_URL) {
    console.log("==> Найдена переменная DATABASE_URL. Подключаемся к Supabase PostgreSQL...");
    isPg = true;
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        family: 4 // Принудительно используем IPv4 для обхода сетевых ограничений Render
    });
} else {
    console.log("⚠️ Переменная DATABASE_URL не найдена! Используем локальный SQLite...");
    db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) console.error('Ошибка подключения к БД:', err.message);
        else console.log('Успешное подключение к SQLite БД');
    });
}

// Универсальный хелпер для выполнения запросов к любой БД (PostgreSQL / SQLite)
async function runQuery(sql, params = [], mode = 'all') {
    if (isPg) {
        // Конвертируем знаки вопросов (?) в долларовые параметры ($1, $2, ...) для Postgres
        let paramIndex = 1;
        const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
        
        const res = await db.query(pgSql, params);
        if (mode === 'get') return res.rows[0];
        if (mode === 'insert') return { lastID: res.rows[0] ? res.rows[0].id : null, changes: res.rowCount };
        if (mode === 'run') return { changes: res.rowCount };
        return res.rows; // mode === 'all'
    } else {
        return new Promise((resolve, reject) => {
            if (mode === 'get') {
                db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
            } else if (mode === 'all') {
                db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
            } else {
                db.run(sql, params, function (err) {
                    if (err) reject(err);
                    else resolve({ lastID: this.lastID, changes: this.changes });
                });
            }
        });
    }
}

async function initDatabase() {
    if (isPg) {
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username TEXT UNIQUE,
                    password TEXT,
                    role TEXT
                );
                CREATE TABLE IF NOT EXISTS equipment (
                    id SERIAL PRIMARY KEY,
                    name TEXT,
                    serialNumber TEXT,
                    gsiNumber TEXT,
                    ownerName TEXT,
                    status TEXT,
                    location TEXT,
                    installationDate TEXT,
                    capacity TEXT,
                    minCapacity TEXT,
                    discrete TEXT,
                    adcType TEXT,
                    sensorType TEXT,
                    platformCount TEXT,
                    weighingMode TEXT,
                    certNumber TEXT,
                    lastVer TEXT,
                    nextVer TEXT,
                    phone TEXT,
                    email TEXT,
                    notes TEXT
                );
                CREATE TABLE IF NOT EXISTS maintenance (
                    id SERIAL PRIMARY KEY,
                    equipmentId INTEGER,
                    workType TEXT,
                    maintDate TEXT,
                    desc TEXT,
                    performedBy TEXT
                );
                CREATE TABLE IF NOT EXISTS folders (
                    id SERIAL PRIMARY KEY,
                    name TEXT,
                    parentId INTEGER,
                    type TEXT
                );
                CREATE TABLE IF NOT EXISTS notes (
                    id SERIAL PRIMARY KEY,
                    title TEXT,
                    content TEXT,
                    date TEXT
                );
                CREATE TABLE IF NOT EXISTS files (
                    id SERIAL PRIMARY KEY,
                    name TEXT,
                    filename TEXT,
                    folderId INTEGER,
                    type TEXT,
                    date TEXT
                );
            `);

            // Инициализация дефолтного администратора в PostgreSQL
            await db.query("DELETE FROM users WHERE username = 'admin'");
            await db.query("INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin')");
            console.log('✅ Таблицы и пользователь admin успешно инициализированы в Supabase PostgreSQL');
        } catch (err) {
            console.error('❌ Ошибка инициализации PostgreSQL:', err.message);
        }
    } else {
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
                serialNumber TEXT,
                status TEXT,
                location TEXT,
                notes TEXT
            )`, () => {
                const columnsToAdd = [
                    'gsiNumber TEXT', 'ownerName TEXT', 'installationDate TEXT',
                    'capacity TEXT', 'minCapacity TEXT', 'discrete TEXT',
                    'adcType TEXT', 'sensorType TEXT', 'platformCount TEXT',
                    'weighingMode TEXT', 'certNumber TEXT', 'lastVer TEXT',
                    'nextVer TEXT', 'phone TEXT', 'email TEXT', 'files TEXT'
                ];
                db.all("PRAGMA table_info(equipment)", [], (err, rows) => {
                    if (!err && rows) {
                        const existing = rows.map(r => r.name);
                        columnsToAdd.forEach(colDef => {
                            const colName = colDef.split(' ')[0];
                            if (!existing.includes(colName)) {
                                db.run(`ALTER TABLE equipment ADD COLUMN ${colDef}`, () => {});
                            }
                        });
                    }
                });
            });

            db.run(`CREATE TABLE IF NOT EXISTS maintenance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                equipmentId INTEGER,
                workType TEXT,
                maintDate TEXT,
                desc TEXT,
                performedBy TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                parentId INTEGER,
                type TEXT
            )`, () => {
                db.all("PRAGMA table_info(folders)", [], (err, rows) => {
                    if (!err && rows) {
                        const existing = rows.map(r => r.name);
                        if (!existing.includes('type')) db.run("ALTER TABLE folders ADD COLUMN type TEXT");
                        if (!existing.includes('parentId')) db.run("ALTER TABLE folders ADD COLUMN parentId INTEGER");
                    }
                });
            });

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
            )`, () => {
                db.all("PRAGMA table_info(files)", [], (err, rows) => {
                    if (!err && rows) {
                        const existing = rows.map(r => r.name);
                        if (!existing.includes('folderId')) db.run("ALTER TABLE files ADD COLUMN folderId INTEGER");
                        if (!existing.includes('type')) db.run("ALTER TABLE files ADD COLUMN type TEXT");
                    }
                });
            });

            db.run("DELETE FROM users WHERE username = 'admin'", () => {
                db.run("INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin')", (err) => {
                    if (!err) console.log('Пользователь admin успешно инициализирован в SQLite');
                });
            });
        });
    }
}

initDatabase();

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await runQuery("SELECT * FROM users WHERE username = ?", [username], 'get');
        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        res.json({
            success: true,
            user: { id: user.id, username: user.username, role: user.role }
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
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

// --- Админ-панель (пользователи) ---
app.get('/api/users', requireAuth, async (req, res) => {
    try {
        const rows = await runQuery("SELECT id, username, role FROM users", [], 'all');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', requireAuth, async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Заполните логин и пароль' });

    try {
        const result = await runQuery("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [username, password, role || 'user'], 'insert');
        res.json({ id: result.lastID, success: true });
    } catch (err) {
        res.status(500).json({ error: 'Пользователь уже существует' });
    }
});

app.delete('/api/users/:id', requireAuth, async (req, res) => {
    try {
        await runQuery("DELETE FROM users WHERE id = ?", [req.params.id], 'run');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Оборудование ---
app.get('/api/equipment', requireAuth, async (req, res) => {
    try {
        const rows = await runQuery("SELECT * FROM equipment", [], 'all');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/equipment', requireAuth, upload.array('files'), async (req, res) => {
    const { 
        name, serialNumber, gsiNumber, ownerName, location, installationDate, 
        capacity, minCapacity, discrete, adcType, sensorType, platformCount, 
        weighingMode, certNumber, lastVer, nextVer, status, phone, email, notes 
    } = req.body;

    const query = `INSERT INTO equipment (
        name, serialNumber, gsiNumber, ownerName, location, installationDate, 
        capacity, minCapacity, discrete, adcType, sensorType, platformCount, 
        weighingMode, certNumber, lastVer, nextVer, status, phone, email, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
        name || 'Без названия', serialNumber || '', gsiNumber || '', ownerName || '', 
        location || '', installationDate || '', capacity || '', minCapacity || '', 
        discrete || '', adcType || '', sensorType || '', platformCount || '', 
        weighingMode || '', certNumber || '', lastVer || '', nextVer || '', 
        status || 'В эксплуатации', phone || '', email || '', notes || ''
    ];

    try {
        const result = await runQuery(query, params, 'insert');
        res.json({ id: result.lastID, success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/equipment/:id', requireAuth, upload.array('files'), async (req, res) => {
    const id = req.params.id;
    const { 
        name, serialNumber, gsiNumber, ownerName, location, installationDate, 
        capacity, minCapacity, discrete, adcType, sensorType, platformCount, 
        weighingMode, certNumber, lastVer, nextVer, status, phone, email, notes 
    } = req.body;
    
    const query = `UPDATE equipment SET 
        name = ?, serialNumber = ?, gsiNumber = ?, ownerName = ?, location = ?, installationDate = ?, 
        capacity = ?, minCapacity = ?, discrete = ?, adcType = ?, sensorType = ?, platformCount = ?, 
        weighingMode = ?, certNumber = ?, lastVer = ?, nextVer = ?, status = ?, phone = ?, email = ?, notes = ? 
        WHERE id = ?`;

    const params = [
        name || 'Без названия', serialNumber || '', gsiNumber || '', ownerName || '', 
        location || '', installationDate || '', capacity || '', minCapacity || '', 
        discrete || '', adcType || '', sensorType || '', platformCount || '', 
        weighingMode || '', certNumber || '', lastVer || '', nextVer || '', 
        status || 'В эксплуатации', phone || '', email || '', notes || '', id
    ];

    try {
        await runQuery(query, params, 'run');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/equipment/:id', requireAuth, async (req, res) => {
    const eqId = req.params.id;
    try {
        await runQuery("DELETE FROM maintenance WHERE equipmentId = ?", [eqId], 'run');
        await runQuery("DELETE FROM equipment WHERE id = ?", [eqId], 'run');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Журнал обслуживания ---
app.get('/api/maintenance', requireAuth, async (req, res) => {
    const equipmentId = req.query.equipmentId;
    let query = "SELECT * FROM maintenance";
    let params = [];
    if (equipmentId) {
        query += " WHERE equipmentId = ?";
        params.push(equipmentId);
    }
    try {
        const rows = await runQuery(query, params, 'all');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/maintenance', requireAuth, async (req, res) => {
    const { equipmentId, workType, maintDate, desc, performedBy } = req.body;
    const query = `INSERT INTO maintenance (equipmentId, workType, maintDate, desc, performedBy) VALUES (?, ?, ?, ?, ?)`;
    const params = [equipmentId, workType || 'Обслуживание', maintDate || '', desc || '', performedBy || ''];
    try {
        const result = await runQuery(query, params, 'insert');
        res.json({ id: result.lastID, success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/maintenance/:id', requireAuth, async (req, res) => {
    try {
        await runQuery("DELETE FROM maintenance WHERE id = ?", [req.params.id], 'run');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Папки ---
app.get('/api/folders', requireAuth, async (req, res) => {
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

    try {
        const rows = await runQuery(query, params, 'all');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/folders', requireAuth, async (req, res) => {
    const { name, parentId, type } = req.body;
    let pId = (!parentId || parentId === 'root' || parentId === 'null' || parentId === 'undefined' || parentId === '' || parentId === 0) ? null : parentId;
    
    try {
        const result = await runQuery("INSERT INTO folders (name, parentId, type) VALUES (?, ?, ?)", [name, pId, type || 'doc'], 'insert');
        res.json({ id: result.lastID, success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/folders/:id', requireAuth, async (req, res) => {
    const folderId = req.params.id;
    try {
        await runQuery("DELETE FROM files WHERE folderId = ?", [folderId], 'run');
        await runQuery("DELETE FROM folders WHERE id = ?", [folderId], 'run');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Файлы и Фото ---
app.get('/api/files', requireAuth, async (req, res) => {
    const type = req.query.type || 'doc';
    const folderId = req.query.folderId;
    const all = req.query.all;

    let query = "SELECT * FROM files WHERE type = ?";
    let params = [type];

    try {
        if (all === 'true') {
            const rows = await runQuery(query, params, 'all');
            return res.json(rows);
        }

        if (folderId && folderId !== 'null' && folderId !== 'undefined' && folderId !== '' && folderId !== '0') {
            query += " AND folderId = ?";
            params.push(folderId);
        } else {
            query += " AND (folderId IS NULL OR folderId = '' OR folderId = 0)";
        }

        const rows = await runQuery(query, params, 'all');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/files', requireAuth, upload.array('files'), async (req, res) => {
    const { type, folderId } = req.body;
    const fId = (!folderId || folderId === 'null' || folderId === 'undefined' || folderId === '' || folderId === 0) ? null : folderId;
    const date = new Date().toLocaleDateString('ru-RU');

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Файлы не переданы' });
    }

    try {
        for (const file of req.files) {
            const fixedOriginalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
            await runQuery(`INSERT INTO files (name, filename, folderId, type, date) VALUES (?, ?, ?, ?, ?)`, [fixedOriginalName, file.filename, fId, type || 'doc', date], 'run');
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/files/:id', requireAuth, async (req, res) => {
    try {
        await runQuery("DELETE FROM files WHERE id = ?", [req.params.id], 'run');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Заметки ---
app.get('/api/notes', requireAuth, async (req, res) => {
    try {
        const rows = await runQuery("SELECT * FROM notes", [], 'all');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notes', requireAuth, async (req, res) => {
    const { title, content } = req.body;
    const date = new Date().toLocaleDateString('ru-RU');
    try {
        const result = await runQuery("INSERT INTO notes (title, content, date) VALUES (?, ?, ?)", [title || 'Без названия', content || '', date], 'insert');
        res.json({ id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notes/:id', requireAuth, async (req, res) => {
    const { title, content } = req.body;
    try {
        await runQuery("UPDATE notes SET title = ?, content = ? WHERE id = ?", [title || 'Без названия', content || '', req.params.id], 'run');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/notes/:id', requireAuth, async (req, res) => {
    try {
        await runQuery("DELETE FROM notes WHERE id = ?", [req.params.id], 'run');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Бэкапы ---
app.get('/api/backup', requireAuth, (req, res) => {
    if (isPg) {
        return res.status(400).json({ error: 'Резервное копирование SQLite-файла недоступно при использовании PostgreSQL' });
    }
    res.download(DB_PATH);
});

app.post('/api/restore', requireAuth, upload.single('backup'), (req, res) => {
    if (isPg) {
        return res.status(400).json({ error: 'Восстановление SQLite-файла недоступно при использовании PostgreSQL' });
    }
    if (!req.file) return res.status(400).json({ error: 'Файл бэкапа не передан' });
    const tempPath = req.file.path;
    fs.copyFile(tempPath, DB_PATH, (err) => {
        if (err) return res.status(500).json({ error: 'Ошибка восстановления базы данных' });
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
