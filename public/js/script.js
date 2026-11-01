document.addEventListener('DOMContentLoaded', () => {
    checkAuthUI();
    if (getCurrentUser()) {
        loadEquipment();
        loadFolders();
        loadNotes();
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
        loadFolders();
        loadNotes();
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

// --- Оборудование ---
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

// --- Папки ---
async function promptCreateFolder() {
    const folderName = prompt('Введите название новой папки:');
    if (!folderName || !folderName.trim()) return;

    const user = getCurrentUser();
    try {
        const res = await fetch('/api/folders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-user': JSON.stringify(user)
            },
            body: JSON.stringify({ name: folderName.trim() })
        });
        if (!res.ok) throw new Error('Ошибка создания папки');
        loadFolders();
    } catch (err) {
        alert(err.message);
    }
}

async function loadFolders() {
    const user = getCurrentUser();
    if (!user) return;

    try {
        const res = await fetch('/api/folders', {
            headers: { 'x-auth-user': JSON.stringify(user) }
        });
        if (!res.ok) return;
        const folders = await res.json();
        renderFolders(folders);
    } catch (err) {
        console.error(err);
    }
}

function renderFolders(folders) {
    const container = document.getElementById('foldersContainer');
    if (!container) return;

    container.innerHTML = '';
    folders.forEach(folder => {
        const div = document.createElement('div');
        div.className = 'folder-card';
        div.style.cssText = 'background: #1e293b; border: 1px solid var(--border); padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; cursor: pointer;';
        div.innerHTML = `
            <span>📁 ${folder.name}</span>
            <button class="btn" style="padding: 2px 6px; font-size: 10px; background: #ef4444;" onclick="deleteFolder(event, ${folder.id})">🗑️</button>
        `;
        container.appendChild(div);
    });
}

async function deleteFolder(event, id) {
    if (event) event.stopPropagation();
    if (!confirm('Удалить эту папку?')) return;
    const user = getCurrentUser();
    try {
        const res = await fetch(`/api/folders/${id}`, {
            method: 'DELETE',
            headers: { 'x-auth-user': JSON.stringify(user) }
        });
        if (!res.ok) throw new Error('Ошибка удаления папки');
        loadFolders();
    } catch (err) {
        alert(err.message);
    }
}

// --- Заметки ---
function openNoteModal() {
    const nameInput = document.getElementById('noteNameInput');
    const contentInput = document.getElementById('noteContentInput');
    if (nameInput) nameInput.value = '';
    if (contentInput) contentInput.value = '';

    const modal = document.getElementById('noteModal');
    if (modal) modal.style.display = 'flex';
}

async function saveNote(event) {
    if (event) event.preventDefault();
    const user = getCurrentUser();

    const title = document.getElementById('noteNameInput')?.value || '';
    const content = document.getElementById('noteContentInput')?.value || '';

    if (!title && !content) {
        alert('Заполните название или текст заметки!');
        return;
    }

    try {
        const res = await fetch('/api/notes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-user': JSON.stringify(user)
            },
            body: JSON.stringify({ title, content })
        });

        if (!res.ok) throw new Error('Ошибка сохранения заметки');

        closeModals();
        loadNotes();
    } catch (err) {
        alert(err.message);
    }
}

async function loadNotes() {
    const user = getCurrentUser();
    if (!user) return;

    try {
        const res = await fetch('/api/notes', {
            headers: { 'x-auth-user': JSON.stringify(user) }
        });
        if (!res.ok) return;
        const notes = await res.json();
        renderNotes(notes);
        
        const countNote = document.getElementById('countNote');
        if (countNote) countNote.textContent = notes.length;
    } catch (err) {
        console.error(err);
    }
}

function renderNotes(notes) {
    const container = document.getElementById('filesContainer');
    if (!container) return;

    // Проверяем, активна ли вкладка заметок
    const contentSection = document.getElementById('contentSection');
    if (!contentSection || contentSection.style.display === 'none') return;

    container.innerHTML = '';
    notes.forEach(note => {
        const card = document.createElement('div');
        card.style.cssText = 'background: #1e293b; border: 1px solid var(--border); padding: 12px; border-radius: 8px; margin-bottom: 10px;';
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <strong style="color: #fff;">📝 ${note.title || 'Без названия'}</strong>
                <button class="btn" style="padding: 2px 6px; font-size: 10px; background: #ef4444;" onclick="deleteNote(${note.id})">🗑️</button>
            </div>
            <div style="font-size: 13px; color: var(--text-main); white-space: pre-wrap; margin-bottom: 6px;">${note.content || ''}</div>
            <div style="font-size: 10px; color: var(--text-muted);">${note.date || ''}</div>
        `;
        container.appendChild(card);
    });
}

async function deleteNote(id) {
    if (!confirm('Удалить эту заметку?')) return;
    const user = getCurrentUser();
    try {
        const res = await fetch(`/api/notes/${id}`, {
            method: 'DELETE',
            headers: { 'x-auth-user': JSON.stringify(user) }
        });
        if (!res.ok) throw new Error('Ошибка удаления');
        loadNotes();
    } catch (err) {
        alert(err.message);
    }
}

// --- Управление модалками и вкладками ---
function openBackupModal() {
    const modal = document.getElementById('backupModal');
    if (modal) modal.style.display = 'flex';
}

function closeBackupModal() {
    const modal = document.getElementById('backupModal');
    if (modal) modal.style.display = 'none';
}

function closeModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
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
        if (tabName === 'note') {
            loadNotes();
        }
    } else {
        if (welcomeScreen) welcomeScreen.style.display = 'block';
    }
}

function goHome() {
    selectTab('home');
}
