document.addEventListener('DOMContentLoaded', () => {
    checkAuthUI();
    if (getCurrentUser()) {
        loadEquipment();
    }

    const authForm = document.getElementById('authForm');
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await performLogin();
        });
    }
});

async function performLogin() {
    const usernameInput = document.getElementById('authLogin');
    const passwordInput = document.getElementById('authPassword');
    const errorDiv = document.getElementById('authError');

    if (!usernameInput || !passwordInput) return;

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = 'Введите логин и пароль!';
        }
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Неверный логин или пароль');
        }

        localStorage.setItem('currentUser', JSON.stringify(data.user));
        
        usernameInput.value = '';
        passwordInput.value = '';
        if (errorDiv) errorDiv.style.display = 'none';
        
        checkAuthUI();
        loadEquipment();
    } catch (err) {
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = err.message;
        }
    }
}

function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem('currentUser') || 'null');
    } catch (e) {
        return null;
    }
}

function checkAuthUI() {
    const user = getCurrentUser();
    const authOverlay = document.getElementById('authOverlay');
    const currentUserBadge = document.getElementById('currentUserBadge');

    if (user) {
        if (authOverlay) authOverlay.style.display = 'none';
        if (currentUserBadge) currentUserBadge.textContent = `👤 ${user.username} (${user.role})`;
    } else {
        if (authOverlay) authOverlay.style.display = 'flex';
    }
}

function logoutSystem() {
    localStorage.removeItem('currentUser');
    checkAuthUI();
    location.reload();
}

// Загрузка оборудования
async function loadEquipment() {
    const user = getCurrentUser();
    if (!user) return;

    try {
        const res = await fetch('/api/equipment', {
            headers: { 'x-auth-user': JSON.stringify(user) }
        });
        if (!res.ok) throw new Error('Ошибка загрузки реестра');
        const data = await res.json();
        renderEquipment(data);
    } catch (err) {
        console.error(err);
    }
}

function renderEquipment(data) {
    const tableBody = document.getElementById('equipmentTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.name || ''}</td>
            <td>${item.serialNumber || ''}</td>
            <td>${item.location || ''}</td>
            <td>${item.location || ''}</td>
            <td>${item.nextVerificationDate || ''}</td>
            <td>${item.status || ''}</td>
            <td style="text-align: right;"><button class="btn" style="padding: 4px 8px; font-size: 11px; background: #ef4444;" onclick="deleteEquipment(${item.id})">🗑️</button></td>
        `;
        tableBody.appendChild(row);
    });
}

// Управление модальными окнами
function openEquipmentModal() {
    const modal = document.getElementById('equipmentModal');
    if (modal) modal.style.display = 'flex';
}

function closeEquipmentModal() {
    const modal = document.getElementById('equipmentModal');
    if (modal) modal.style.display = 'none';
}

function openBackupModal() {
    const modal = document.getElementById('backupModal');
    if (modal) modal.style.display = 'flex';
}

function closeBackupModal() {
    const modal = document.getElementById('backupModal');
    if (modal) modal.style.display = 'none';
}

function openNoteModal() {
    const modal = document.getElementById('noteModal');
    if (modal) modal.style.display = 'flex';
}

function closeModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
}

// Сохранение оборудования
async function saveEquipment(event) {
    if (event) event.preventDefault();
    const user = getCurrentUser();

    const name = document.getElementById('eqName')?.value || '';
    const serialNumber = document.getElementById('eqSerial')?.value || '';
    const location = document.getElementById('eqLocation')?.value || '';
    const status = document.getElementById('eqStatus')?.value || 'В эксплуатации';
    const nextVerificationDate = document.getElementById('eqNextVer')?.value || '';
    const notes = document.getElementById('eqNotes')?.value || '';

    if (!name) {
        alert('Введите наименование оборудования!');
        return;
    }

    try {
        const res = await fetch('/api/equipment', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-auth-user': JSON.stringify(user)
            },
            body: JSON.stringify({ name, serialNumber, location, status, nextVerificationDate, notes })
        });

        if (!res.ok) throw new Error('Ошибка сохранения');

        closeEquipmentModal();
        loadEquipment();
    } catch (err) {
        alert(err.message);
    }
}

// Удаление записи
async function deleteEquipment(id) {
    if (!confirm('Удалить эту запись?')) return;
    const user = getCurrentUser();
    try {
        const res = await fetch(`/api/equipment/${id}`, { 
            method: 'DELETE',
            headers: { 'x-auth-user': JSON.stringify(user) }
        });
        if (!res.ok) throw new Error('Ошибка удаления');
        loadEquipment();
    } catch (err) {
        alert(err.message);
    }
}

// Переключение вкладок (Главная / Админ / Архив)
function selectTab(tabName) {
    const welcomeScreen = document.getElementById('welcomeScreen');
    const adminSection = document.getElementById('adminSection');
    const contentSection = document.getElementById('contentSection');

    // Сбрасываем всё
    if (welcomeScreen) welcomeScreen.style.display = 'none';
    if (adminSection) adminSection.style.display = 'none';
    if (contentSection) contentSection.style.display = 'none';

    if (tabName === 'admin') {
        if (adminSection) adminSection.style.display = 'flex';
    } else if (tabName === 'doc' || tabName === 'image' || tabName === 'note') {
        if (contentSection) contentSection.style.display = 'flex';
    } else {
        if (welcomeScreen) welcomeScreen.style.display = 'block';
    }
}

function goHome() {
    selectTab('home');
}
