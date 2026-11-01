// --- АВТОРИЗАЦИЯ И СЕССИЯ ---
function getCurrentUser() {
    return JSON.parse(localStorage.getItem('currentUser') || 'null');
}

function getAuthHeaders(extraHeaders = {}) {
    const user = getCurrentUser() || {};
    return {
        'Content-Type': 'application/json',
        'X-User-Role': user.role || '',
        'X-User-Name': user.username || '',
        ...extraHeaders
    };
}

let equipmentList = [];

// При загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    checkAuthUI();
    if (getCurrentUser()) {
        loadEquipment();
    }
});

// Обновление интерфейса в зависимости от авторизации
function checkAuthUI() {
    const user = getCurrentUser();
    const authPanel = document.getElementById('auth-panel');
    const userDisplay = document.getElementById('user-display');
    const adminTab = document.getElementById('admin-tab');

    if (user) {
        if (authPanel) authPanel.style.display = 'none';
        if (userDisplay) {
            userDisplay.style.display = 'block';
            userDisplay.textContent = user.username; // Отображаем только имя
        }
        if (adminTab) {
            adminTab.style.display = user.role === 'admin' ? 'block' : 'none';
        }
    } else {
        if (authPanel) authPanel.style.display = 'block';
        if (userDisplay) userDisplay.style.display = 'none';
        if (adminTab) adminTab.style.display = 'none';
    }
}

// Вход в систему
async function login(username, password) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Ошибка входа');

        localStorage.setItem('currentUser', JSON.stringify(data));
        checkAuthUI();
        loadEquipment();
        alert('Успешный вход');
    } catch (err) {
        alert(err.message);
    }
}

// Выход из системы
function logout() {
    localStorage.removeItem('currentUser');
    checkAuthUI();
    equipmentList = [];
    renderEquipment([]);
}

// Загрузка реестра оборудования
async function loadEquipment() {
    try {
        const res = await fetch('/api/equipment', {
            headers: getAuthHeaders()
        });
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Ошибка загрузки данных');
        }
        equipmentList = await res.json();
        renderEquipment(equipmentList);
    } catch (err) {
        console.error(err);
        alert('Не удалось загрузить реестр: ' + err.message);
    }
}

// Отображение оборудования
function renderEquipment(data) {
    const tableBody = document.getElementById('equipment-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.id}</td>
            <td>${item.name || ''}</td>
            <td>${item.type || ''}</td>
            <td>${item.serialNumber || ''}</td>
            <td>${item.verificationDate || ''}</td>
            <td>${item.nextVerificationDate || ''}</td>
            <td>${item.status || ''}</td>
            <td>${item.location || ''}</td>
            <td>
                <button onclick="editEquipment(${item.id})">✏️</button>
                <button onclick="deleteEquipment(${item.id})">🗑️</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Сохранение или добавление оборудования
async function saveEquipment(equipmentData, id = null) {
    const url = id ? `/api/equipment/${id}` : '/api/equipment';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(equipmentData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка сохранения');
        
        alert('Данные успешно сохранены');
        loadEquipment();
    } catch (err) {
        alert('Ошибка при сохранении: ' + err.message);
    }
}

// Удаление оборудования
async function deleteEquipment(id) {
    if (!confirm('Вы уверены, что хотите удалить эту запись?')) return;

    try {
        const res = await fetch(`/api/equipment/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка удаления');

        loadEquipment();
    } catch (err) {
        alert('Не удалось удалить запись: ' + err.message);
    }
}

// Загрузка файлов на сервер
async function uploadFiles(fileInput) {
    const files = fileInput.files;
    if (!files || files.length === 0) return [];

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }

    const currentUser = getCurrentUser() || {};
    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'X-User-Role': currentUser.role || '',
                'X-User-Name': currentUser.username || ''
            },
            body: formData
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки файлов');
        return data.paths;
    } catch (err) {
        alert('Ошибка при загрузке файлов: ' + err.message);
        return [];
    }
}

// Скачивание бэкапа (только для admin)
async function downloadBackup() {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
        alert('Недостаточно прав для скачивания бэкапа');
        return;
    }
    
    window.location.href = `/api/backup/download?role=${currentUser.role}`;
}

// Восстановление базы из файла бэкапа
async function restoreBackup(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('backup', file);

    const currentUser = getCurrentUser() || {};
    try {
        const res = await fetch('/api/backup/upload', {
            method: 'POST',
            headers: {
                'X-User-Role': currentUser.role || '',
                'X-User-Name': currentUser.username || ''
            },
            body: formData
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка восстановления');

        alert(data.message || 'База данных успешно восстановлена!');
        loadEquipment();
    } catch (err) {
        alert('Не удалось восстановить бэкап: ' + err.message);
    }
}
