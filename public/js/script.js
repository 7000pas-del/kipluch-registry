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

async function loadEquipment() {
    const user = getCurrentUser();
    if (!user) return;

    try {
        const res = await fetch('/api/equipment', {
            headers: { 'x-auth-user': JSON.stringify(user) }
        });
        if (!res.ok) throw new Error('Ошибка загрузки реестра');
        const data = await res.json();
        window.allEquipment = data; 
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
        row.style.cursor = 'pointer';
        row.onclick = (e) => {
            if (!e.target.closest('button')) {
                viewEquipmentPassport(item.id);
            }
        };

        const itemJson = encodeURIComponent(JSON.stringify(item));

        row.innerHTML = `
            <td>${item.name || ''}</td>
            <td>${item.serialNumber || ''}</td>
            <td>${item.ownerName || item.location || ''}</td>
            <td>${item.location || ''}</td>
            <td>${item.nextVerificationDate || ''}</td>
            <td>${item.status || ''}</td>
            <td style="text-align: right; white-space: nowrap;">
                <button class="btn" type="button" style="padding: 4px 8px; font-size: 11px; background: #334155; margin-right: 4px;" onclick="editEquipmentFromButton(event, '${itemJson}')">✏️</button>
                <button class="btn" type="button" style="padding: 4px 8px; font-size: 11px; background: #ef4444;" onclick="deleteEquipment(event, ${item.id})">🗑️</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function viewEquipmentPassport(id) {
    const item = window.allEquipment?.find(eq => eq.id === id);
    if (!item) return;

    document.getElementById('viewEqName').textContent = item.name || '-';
    document.getElementById('viewEqSerial').textContent = item.serialNumber || '-';
    document.getElementById('viewEqLocation').textContent = item.location || '-';
    document.getElementById('viewEqNextVer').textContent = item.nextVerificationDate || '-';
    document.getElementById('viewEqNotes').textContent = item.notes || '-';
    
    const btnEdit = document.getElementById('btnEditFromView');
    if (btnEdit) {
        btnEdit.onclick = () => {
            closeViewEquipmentModal();
            openEquipmentModal(item);
        };
    }

    const modal = document.getElementById('viewEquipmentModal');
    if (modal) modal.style.display = 'flex';
}

function closeViewEquipmentModal() {
    const modal = document.getElementById('viewEquipmentModal');
    if (modal) modal.style.display = 'none';
}

function openEquipmentModal(editData = null) {
    const modal = document.getElementById('equipmentModal');
    const title = document.getElementById('eqModalTitle');

    document.getElementById('eqName').value = editData ? editData.name || '' : '';
    document.getElementById('eqSerial').value = editData ? editData.serialNumber || '' : '';
    document.getElementById('eqLocation').value = editData ? editData.location || '' : '';
    document.getElementById('eqStatus').value = editData ? editData.status || 'В эксплуатации' : 'В эксплуатации';
    document.getElementById('eqNextVer').value = editData ? editData.nextVerificationDate || '' : '';
    document.getElementById('eqNotes').value = editData ? editData.notes || '' : '';

    if (editData && editData.id) {
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

function editEquipmentFromButton(event, encodedItem) {
    if (event) event.stopPropagation();
    try {
        const item = JSON.parse(decodeURIComponent(encodedItem));
        openEquipmentModal(item);
    } catch (err) {
        console.error('Ошибка открытия редактора:', err);
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

    const editId = window.currentEditId;
    const isEdit = editId !== null && editId !== undefined && editId !== '';
    const url = isEdit ? `/api/equipment/${editId}` : '/api/equipment';
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 
                'Content-Type': 'application/json',
                'x-auth-user': JSON.stringify(user)
            },
            body: JSON.stringify({ 
                name, 
                serialNumber, 
                verificationDate: '', 
                nextVerificationDate, 
                status, 
                location, 
                notes 
            })
        });

        const resultData = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(resultData.error || 'Ошибка сохранения на сервере');
        }

        closeEquipmentModal();
        window.currentEditId = null;
        loadEquipment();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteEquipment(event, id) {
    if (event) event.stopPropagation();
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
