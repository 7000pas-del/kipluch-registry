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
        window.allEquipment = data; // Сохраняем в глобальную переменную для просмотра/редактирования
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
        // Клик по строке открывает паспорт/карточку прибора
        row.style.cursor = 'pointer';
        row.onclick = (e) => {
            // Если кликнули не по кнопке удаления или редактирования, открываем карточку
            if (!e.target.closest('button')) {
                viewEquipmentPassport(item.id);
            }
        };

        row.innerHTML = `
            <td>${item.name || ''}</td>
            <td>${item.serialNumber || ''}</td>
            <td>${item.ownerName || item.location || ''}</td>
            <td>${item.location || ''}</td>
            <td>${item.nextVerificationDate || ''}</td>
            <td>${item.status || ''}</td>
            <td style="text-align: right; white-space: nowrap;">
                <button class="btn" style="padding: 4px 8px; font-size: 11px; background: #334155; margin-right: 4px;" onclick="editEquipment(${item.id})">✏️</button>
                <button class="btn" style="padding: 4px 8px; font-size: 11px; background: #ef4444;" onclick="deleteEquipment(${item.id})">🗑️</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Открытие паспорта/карточки прибора
function viewEquipmentPassport(id) {
    const item = window.allEquipment?.find(eq => eq.id === id);
    if (!item) return;

    // Заполняем поля модального окна просмотра
    document.getElementById('viewEqName').textContent = item.name || '-';
    document.getElementById('viewEqSerial').textContent = item.serialNumber || '-';
    document.getElementById('viewEqLocation').textContent = item.location || '-';
    document.getElementById('viewEqNextVer').textContent = item.nextVerificationDate || '-';
    document.getElementById('viewEqNotes').textContent = item.notes || '-';
    
    // Кнопка «Изменить» прямо из карточки
    const btnEdit = document.getElementById('btnEditFromView');
    if (btnEdit) {
        btnEdit.onclick = () => {
            closeViewEquipmentModal();
            editEquipment(item.id);
        };
    }

    const modal = document.getElementById('viewEquipmentModal');
    if (modal) modal.style.display = 'flex';
}

function closeViewEquipmentModal() {
    const modal = document.getElementById('viewEquipmentModal');
    if (modal) modal.style.display = 'none';
}

// Управление модальными окнами
function openEquipmentModal(editData = null) {
    const modal = document.getElementById('equipmentModal');
    const title = document.getElementById('eqModalTitle');

    // Очищаем или заполняем форму
    document.getElementById('eqName').value = editData ? editData.name || '' : '';
    document.getElementById('eqSerial').value = editData ? editData.serialNumber || '' : '';
    document.getElementById('eqLocation').value = editData ? editData.location || '' : '';
    document.getElementById('eqStatus').value = editData ? editData.status || 'В эксплуатации' : 'В эксплуатации';
    document.getElementById('eqNextVer').value = editData ? editData.nextVerificationDate || '' : '';
    document.getElementById('eqNotes').value = editData ? editData.notes || '' : '';

    if (editData) {
        if (title) title.textContent = '✏️ Редактировать оборудование';
        window.currentEditId = editData.id;
    } else {
        if (title) title.textContent = '➕ Добавить оборудование';
        window.currentEditId = null;
    }

    if (modal) modal.style.display = 'flex';
}

function closeEquipmentModal() {
    const modal = document.getElementById('equipmentModal');
    if (modal) modal.style.display = 'none';
    window.currentEditId = null;
}

function editEquipment(id) {
    const item = window.allEquipment?.find(eq => eq.id === id);
    if (item) {
        openEquipmentModal(item);
    }
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

// Сохранение (создание или обновление) оборудования
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

    const isEdit = window.currentEditId !== null && window.currentEditId !== undefined;
    const url = isEdit ? `/api/equipment/${window.currentEditId}` : '/api/equipment';
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
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

// Переключение вкладок
function selectTab(tabName) {
    const welcomeScreen = document.getElementById('welcomeScreen');
    const adminSection = document.getElementById('adminSection');
    const contentSection = document.getElementById('contentSection');

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
