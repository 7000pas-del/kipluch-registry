const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

const dbPath = path.join(__dirname, 'archive.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Ошибка подключения к SQLite:', err.message);
    else console.log('Подключено к базе данных SQLite.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        type TEXT,
        name TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        type TEXT,
        name TEXT,
        filePath TEXT,
        folderId TEXT,
        content TEXT,
        date TEXT,
        equipmentId TEXT
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
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS maintenance (
        id TEXT PRIMARY KEY,
        equipmentId TEXT,
        workType TEXT,
        date TEXT,
        description TEXT,
        performedBy TEXT
    )`);
});

const upload = multer({ dest: 'uploads/' });

// API Авторизации
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Получение всей структуры БД
app.get('/api/db', (req, res) => {
    db.all(`SELECT * FROM folders`, [], (err, folders) => {
        db.all(`SELECT * FROM items`, [], (err2, items) => {
            res.json({ folders: folders || [], items: items || [] });
        });
    });
});

// Оборудование (Весы)
app.get('/api/equipment', (req, res) => {
    db.all(`SELECT * FROM equipment`, [], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/equipment', (req, res) => {
    const eq = req.body;
    const id = eq.id && eq.id.trim() !== '' ? eq.id : 'eq_' + Date.now();
    
    const query = `INSERT INTO equipment (id, name, serialNumber, gsiNumber, ownerName, location, installationDate, capacity, minCapacity, discrete, adcType, sensorType, platformCount, weighingMode, lastVerification, nextVerification, certNumber, phone, email, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, serialNumber=excluded.serialNumber, gsiNumber=excluded.gsiNumber,
        ownerName=excluded.ownerName, location=excluded.location, installationDate=excluded.installationDate,
        capacity=excluded.capacity, minCapacity=excluded.minCapacity, discrete=excluded.discrete,
        adcType=excluded.adcType, sensorType=excluded.sensorType, platformCount=excluded.platformCount,
        weighingMode=excluded.weighingMode, lastVerification=excluded.lastVerification,
        nextVerification=excluded.nextVerification, certNumber=excluded.certNumber,
        phone=excluded.phone, email=excluded.email, status=excluded.status, notes=excluded.notes`;

    db.run(query, [
        id, eq.name, eq.serialNumber, eq.gsiNumber, eq.ownerName, eq.location,
        eq.installationDate, eq.capacity, eq.minCapacity, eq.discrete,
        eq.adcType, eq.sensorType, eq.platformCount, eq.weighingMode,
        eq.lastVerification, eq.nextVerification, eq.certNumber,
        eq.phone, eq.email, eq.status || 'В эксплуатации', eq.notes
    ], (err) => {
        res.json({ success: !err, error: err ? err.message : null });
    });
});

app.delete('/api/equipment/:id', (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM equipment WHERE id = ?`, [id], (err) => {
        db.run(`DELETE FROM maintenance WHERE equipmentId = ?`, [id], () => {
            res.json({ success: !err });
        });
    });
});

// Обслуживание
app.get('/api/maintenance/:eqId', (req, res) => {
    db.all(`SELECT * FROM maintenance WHERE equipmentId = ?`, [req.params.eqId], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/maintenance', (req, res) => {
    const m = req.body;
    const id = 'maint_' + Date.now();
    db.run(`INSERT INTO maintenance (id, equipmentId, workType, date, description, performedBy) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, m.equipmentId, m.workType, m.date, m.description, m.performedBy], (err) => {
            res.json({ success: !err });
        });
});

app.delete('/api/maintenance/:id', (req, res) => {
    db.run(`DELETE FROM maintenance WHERE id = ?`, [req.params.id], (err) => {
        res.json({ success: !err });
    });
});

// Папки и файлы
app.post('/api/folders', (req, res) => {
    const { id, type, name } = req.body;
    db.run(`INSERT INTO folders (id, type, name) VALUES (?, ?, ?)`, [id, type, name], (err) => {
        res.json({ success: !err });
    });
});

app.delete('/api/folders/:id', (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM folders WHERE id = ?`, [id], () => {
        db.run(`DELETE FROM items WHERE folderId = ?`, [id], () => {
            res.json({ success: true });
        });
    });
});

app.post('/api/upload', upload.array('files'), (req, res) => {
    const folderId = req.body.folderId || null;
    const files = req.files;
    if (!files || files.length === 0) return res.json({ success: false });

    db.serialize(() => {
        const stmt = db.prepare(`INSERT INTO items (id, type, name, filePath, folderId, date) VALUES (?, ?, ?, ?, ?, ?)`);
        files.forEach(file => {
            const id = 'item_' + Date.now() + Math.random().toString(36).substr(2, 5);
            const type = file.mimetype.startsWith('image/') ? 'image' : 'doc';
            const filePath = `/uploads/${file.filename}`;
            const date = new Date().toISOString().slice(0, 10);
            stmt.run(id, type, file.originalname, filePath, folderId, date);
        });
        stmt.finalize((err) => {
            res.json({ success: !err });
        });
    });
});

app.post('/api/notes', (req, res) => {
    const { id, name, content, folderId } = req.body;
    const noteId = id || ('note_' + Date.now());
    const date = new Date().toISOString().slice(0, 10);

    if (id) {
        db.run(`UPDATE items SET name = ?, content = ? WHERE id = ?`, [name, content, id], (err) => {
            res.json({ success: !err });
        });
    } else {
        db.run(`INSERT INTO items (id, type, name, folderId, content, date) VALUES (?, 'note', ?, ?, ?, ?)`,
            [noteId, name, folderId || null, content, date], (err) => {
                res.json({ success: !err });
            });
    }
});

app.delete('/api/items/:id', (req, res) => {
    db.run(`DELETE FROM items WHERE id = ?`, [req.params.id], (err) => {
        res.json({ success: !err });
    });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
