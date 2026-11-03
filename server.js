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

if (process.env.DATABASE_URL) {
    console.log("==> Найдена переменная DATABASE_URL. Подключаемся к Supabase PostgreSQL...");
    isPg = true;
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        family: 4
    });
} else {
    console.log("⚠️ Переменная DATABASE_URL не найдена! Используем локальный SQLite...");
    db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) console.error('Ошибка подключения к БД:', err.message);
        else console.log('Успешное подключение к SQLite БД');
    });
}

async function runQuery(sql, params = [], mode = 'all') {
    if (isPg) {
        let paramIndex = 1;
        const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
        const res = await db.query(pgSql, params);
        if (mode === 'get') return res.rows[0];
        if (mode === 'insert') return { lastID: res.rows[0] ? res.rows[0].id : null, changes: res.rowCount };
        if (mode === 'run') return { changes: res.rowCount };
        return res.rows;
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
                    description TEXT,
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
            await db.query("DELETE FROM users WHERE username = 'admin'");
            await db.query("INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin')");
            console.log('✅ Таблицы и пользователь admin успешно инициализированы в Supabase PostgreSQL');
        } catch (err) {
            console.error('❌ Ошибка инициализации PostgreSQL:', err.message);
        }
    } else {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, role TEXT)`);
            db.run(`CREATE TABLE IF NOT EXISTS equipment (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT, serialNumber TEXT, gsiNumber TEXT, ownerName TEXT,
                status TEXT, location TEXT, installationDate TEXT, capacity TEXT,
                minCapacity TEXT, discrete TEXT, adcType TEXT, sensorType TEXT,
                platformCount TEXT, weighingMode TEXT, certNumber TEXT, lastVer TEXT,
                nextVer TEXT, phone TEXT, email TEXT, notes TEXT
            )`);
            db.run(`CREATE TABLE IF NOT EXISTS maintenance (id INTEGER PRIMARY KEY AUTOINCREMENT, equipmentId INTEGER, workType TEXT, maintDate TEXT, description TEXT, performedBy TEXT)`);
            db.run(`CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, parentId INTEGER, type TEXT)`);
            db.run(`CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, date TEXT)`);
            db.run(`CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, filename TEXT, folderId INTEGER, type TEXT, date TEXT)`);

            db.run("DELETE FROM users WHERE username = 'admin'", () => {
                db.run("INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin')", () => {});
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
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
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

    const query = isPg 
        ? `INSERT INTO equipment (name, serialNumber, gsiNumber, ownerName, location, installationDate, capacity, minCapacity, discrete, adcType, sensorType, platformCount, weighingMode, certNumber, lastVer, nextVer, status, phone, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
        : `INSERT INTO equipment (name, serialNumber, gsiNumber, ownerName, location, installationDate, capacity, minCapacity, discrete, adcType, sensorType, platformCount, weighingMode, certNumber, lastVer, nextVer, status, phone, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
        name || 'Без названия', serialNumber || '', gsiNumber || '', ownerName || '', 
        location || '', installationDate || '', capacity || '', minCapacity || '', 
        discrete || '', adcType || '', sensorType || '', platformCount || '', 
        weighingMode || '', certNumber || '', lastVer || '', nextVer || '', 
        status || 'В эксплуатации', phone || '', email || '', notes || ''
    ];

    try {
        const result = await runQuery(query, params, isPg ? 'get' : 'insert');
        res.json({ id: isPg ? result.id : result.lastID, success: true });
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
        query += " AND (parentId IS NULL)";
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
    
    const query = isPg
        ? "INSERT INTO folders (name, parentId, type) VALUES (?, ?, ?) RETURNING id"
        : "INSERT INTO folders (name, parentId, type) VALUES (?, ?, ?)";

    try {
        const result = await runQuery(query, [name, pId, type || 'doc'], isPg ? 'get' : 'insert');
        res.json({ id: isPg ? result.id : result.lastID, success: true });
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

// --- Журнал обслуживания, Файлы, Заметки и Бэкапы ---
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
    const { equipmentId, workType, maintDate, desc, description, performedBy } = req.body;
    const finalDesc = description || desc || '';
    const query = isPg
        ? "INSERT INTO maintenance (equipmentId, workType, maintDate, description, performedBy) VALUES (?, ?, ?, ?, ?) RETURNING id"
        : "INSERT INTO maintenance (equipmentId, workType, maintDate, description, performedBy) VALUES (?, ?, ?, ?, ?)";
    const params = [equipmentId, workType || 'Обслуживание', maintDate || '', finalDesc, performedBy || ''];
    try {
        const result = await runQuery(query, params, isPg ? 'get' : 'insert');
        res.json({ id: isPg ? result.id : result.lastID, success: true });
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
            query += " AND (folderId IS NULL)";
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
        const query = isPg ? "INSERT INTO notes (title, content, date) VALUES (?, ?, ?) RETURNING id" : "INSERT INTO notes (title, content, date) VALUES (?, ?, ?)";
        const result = await runQuery(query, [title || 'Без названия', content || '', date], isPg ? 'get' : 'insert');
        res.json({ id: isPg ? result.id : result.lastID });
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

app.delete('/api/notes/:id', requireAuth, async (resId, res) => {
    try {
        await runQuery("DELETE FROM notes WHERE id = ?", [resId.params.id], 'run');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/backup', requireAuth, (req, res) => {
    if (isPg) {
        return res.status(400).json({ error: 'Резервное копирование недоступно при использовании PostgreSQL' });
    }
    res.download(DB_PATH);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
