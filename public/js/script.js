document.addEventListener('DOMContentLoaded', () => {
    checkAuthUI();
    if (getCurrentUser()) {
        loadEquipment();
        loadArchiveContent();
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
        if (!response.ok) throw new Error(data.error || 'Неверный логин или пароль');

        localStorage.setItem('currentUser', JSON.stringify(data.user));
        usernameInput.value = '';
        passwordInput.value = '';
        if (errorDiv) errorDiv.style.display = 'none';
        
        checkAuthUI();
        loadEquipment();
        loadArchiveContent();
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

window.currentTab = 'doc';
window.currentFolderId = null;

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
            if (!e.target.closest('button')) viewEquipmentPassport(item.id);
        };

        const itemJson = encodeURIComponent(JSON.stringify(item));

        row.innerHTML = `
            <td>${item.name || ''}</td>
            <td>${item.serialNumber || ''}</td>
            <td>${item.location || ''}</td>
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
        console.error(err);
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
        alert('Введите наименование!');
        return;
    }

    const editId = window.currentEditId;
    const isEdit = editId !== null && editId !== undefined && editId !== '';
    const url = isEdit ? `/api/equipment/${editId}` : '/api/equipment';

    try {
        const res = await fetch(url, {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json', 'x-auth-user': JSON.stringify(user) },
            body: JSON.stringify({ name, serialNumber, nextVerificationDate, status, location, notes })
        });
        if (!res.ok) throw new Error('Ошибка сохранения');

        closeEquipmentModal();
        window.currentEditId = null;
        loadEquipment();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteEquipment(event, id) {
    if (event) event.stopPropagation();
    if (!confirm('Удалить запись?')) return;
    const user = getCurrentUser();
    try {
        await fetch(`/api/equipment/${id}`, { method: 'DELETE', headers: { 'x-auth-user': JSON.stringify(user) } });
        loadEquipment();
    } catch (err) {
        alert(err.message);
    }
}

// --- Управление вкладками и контентом ---
function selectTab(tabName) {
    window.currentTab = tabName;
    window.currentFolderId = null;

    const fc = document.getElementById('foldersContainer');
    if (fc) fc.innerHTML = '';
    const fic = document.getElementById('filesContainer');
    if (fic) fic.innerHTML = '';

    const welcomeScreen = document.getElementById('welcomeScreen');
    const adminSection = document.getElementById('adminSection');
    const contentSection = document.getElementById('contentSection');

    if (welcomeScreen) welcomeScreen.style.display = 'none';
    if (adminSection) adminSection.style.display = 'none';
    if (contentSection) contentSection.style.display = 'none';

    const createBtn = document.querySelector('button[onclick*="promptCreateFolder"]');
    if (createBtn) {
        if (tabName === 'note') {
            createBtn.innerHTML = '➕ Создать заметку';
        } else {
            createBtn.innerHTML = '➕ Создать папку';
        }
    }

    if (tabName === 'admin') {
        if (adminSection) adminSection.style.display = 'flex';
    } else if (tabName === 'doc' || tabName === 'image' || tabName === 'note') {
        if (contentSection) contentSection.style.display = 'flex';
        
        const titleEl = document.getElementById('sectionTitle');
        if (titleEl) {
            if (tabName === 'doc') titleEl.textContent = '📄 Документы';
            if (tabName === 'image') titleEl.textContent = '🖼️ Фотографии';
            if (tabName === 'note') titleEl.textContent = '📝 Заметки';
        }

        ensureUploadButtonExists();
        loadArchiveContent();
    } else {
        if (welcomeScreen) welcomeScreen.style.display = 'block';
    }
}

function goHome() {
    selectTab('home');
}

function ensureUploadButtonExists() {
    const actionContainer = document.querySelector('.content-actions') || document.querySelector('#contentSection .actions') || document.querySelector('#contentSection');
    if (!actionContainer) return;

    let uploadBtn = document.getElementById('dynamicUploadBtn');
    if (!uploadBtn) {
        uploadBtn = document.createElement('button');
        uploadBtn.id = 'dynamicUploadBtn';
        uploadBtn.className = 'btn';
        uploadBtn.style.cssText = 'background: #10b981; color: white; padding: 6px 12px; font-size: 13px; border-radius: 6px; margin-right: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;';
        uploadBtn.innerHTML = '📤 Загрузить файл';
        
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'dynamicFileInput';
        fileInput.style.display = 'none';
        fileInput.multiple = true;
        fileInput.onchange = (e) => handleFileUpload(e);

        document.body.appendChild(fileInput);
        uploadBtn.onclick = () => fileInput.click();

        actionContainer.insertBefore(uploadBtn, actionContainer.firstChild);
    }
}

async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const user = getCurrentUser();
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }
    formData.append('type', window.currentTab);
    formData.append('folderId', window.currentFolderId || '');

    try {
        const res = await fetch('/api/files', {
            method: 'POST',
            headers: { 'x-auth-user': JSON.stringify(user) },
            body: formData
        });
        if (!res.ok) throw new Error('Ошибка загрузки файла');

        alert('Файл успешно загружен!');
        event.target.value = '';
        loadArchiveContent();
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
}

async function loadArchiveContent() {
    const user = getCurrentUser();
    if (!user) return;

    if (window.currentTab === 'note') {
        loadNotes();
        return;
    }

    try {
        let url = `/api/folders?type=${window.currentTab}`;
        if (window.currentFolderId) {
            url += `&parentId=${window.currentFolderId}`;
        }

        const res = await fetch(url, { headers: { 'x-auth-user': JSON.stringify(user) } });
        if (res.ok) {
            const folders = await res.json();
            
            let filesUrl = `/api/files?type=${window.currentTab}`;
            if (window.currentFolderId) {
                filesUrl += `&folderId=${window.currentFolderId}`;
            }
            const filesRes = await fetch(filesUrl, { headers: { 'x-auth-user': JSON.stringify(user) } });
            const files = filesRes.ok ? await filesRes.json() : [];

            renderFoldersAndFiles(folders, files);
        }
    } catch (err) {
        console.error('Ошибка загрузки контента:', err);
    }
}

async function promptCreateFolder() {
    if (window.currentTab === 'note') {
        openNoteModal();
        return;
    }

    const folderName = prompt('Введите название новой папки:');
    if (!folderName || !folderName.trim()) return;

    const user = getCurrentUser();
    if (!user) {
        alert('Ошибка: пользователь не авторизован');
        return;
    }

    const payload = { 
        name: folderName.trim(), 
        type: window.currentTab, 
        parentId: window.currentFolderId || null
    };

    try {
        const res = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-auth-user': JSON.stringify(user) },
            body: JSON.stringify(payload)
        });

        const textResponse = await res.text();
        let data = {};
        try {
            data = JSON.parse(textResponse);
        } catch (e) {
            data = { error: textResponse || 'Неизвестный ответ сервера' };
        }

        if (!res.ok) {
            throw new Error(data.error || `Ошибка сервера (код ${res.status})`);
        }
        
        loadArchiveContent();
    } catch (err) {
        alert('Точная ошибка: ' + err.message);
    }
}

function loadFolders() {
    loadArchiveContent();
}

function renderFoldersAndFiles(folders, files) {
    const container = document.getElementById('foldersContainer');
    if (!container) return;

    container.innerHTML = '';

    if (window.currentFolderId) {
        const backDiv = document.createElement('div');
        backDiv.style.cssText = 'background: #334155; border: 1px solid #475569; padding: 12px; border-radius: 8px; margin-bottom: 8px; color: #38bdf8; font-weight: bold; text-align: center; cursor: pointer;';
        backDiv.innerHTML = '⬅️ Назад в корень';
        backDiv.onclick = () => {
            window.currentFolderId = null;
            loadArchiveContent();
        };
        container.appendChild(backDiv);
    }

    if (folders && folders.length > 0) {
        folders.forEach(folder => {
            const div = document.createElement('div');
            div.style.cssText = 'background: #1e293b; border: 1px solid #475569; padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';
            
            const titleSpan = document.createElement('span');
            titleSpan.style.cssText = 'color: #fff; cursor: pointer; flex-grow: 1; font-weight: bold;';
            titleSpan.innerHTML = `📁 ${folder.name}`;
            titleSpan.onclick = () => {
                window.currentFolderId = folder.id;
                loadArchiveContent();
            };

            const btnContainer = document.createElement('div');

            const openBtn = document.createElement('button');
            openBtn.type = 'button';
            openBtn.style.cssText = 'background: #3b82f6; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; margin-right: 6px; font-size: 12px;';
            openBtn.textContent = 'Открыть';
            openBtn.onclick = () => {
                window.currentFolderId = folder.id;
                loadArchiveContent();
            };

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.style.cssText = 'background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;';
            deleteBtn.textContent = 'Удалить';
            deleteBtn.onclick = async () => {
                if (!confirm(`Удалить папку "${folder.name}"?`)) return;
                const user = getCurrentUser();
                try {
                    const res = await fetch(`/api/folders/${folder.id}`, {
                        method: 'DELETE',
                        headers: { 'x-auth-user': JSON.stringify(user) }
                    });
                    if (!res.ok) throw new Error('Ошибка удаления');
                    loadArchiveContent();
                } catch (err) {
                    alert('Не удалось удалить: ' + err.message);
                }
            };

            btnContainer.appendChild(openBtn);
            btnContainer.appendChild(deleteBtn);

            div.appendChild(titleSpan);
            div.appendChild(btnContainer);
            container.appendChild(div);
        });
    }

    // Рендер файлов с кнопкой скачивания и правильной иконкой
    const filesContainer = document.getElementById('filesContainer');
    if (!filesContainer) return;

    filesContainer.innerHTML = '';

    if ((!folders || folders.length === 0) && (!files || files.length === 0)) {
        filesContainer.innerHTML = '<div style="color: #94a3b8; font-size: 13px; padding: 10px; text-align: center;">📭 Папка пуста</div>';
        return;
    }

    if (files && files.length > 0) {
        files.forEach(file => {
            const div = document.createElement('div');
            div.style.cssText = 'background: #1e293b; border: 1px solid #475569; padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';
            
            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
            const isWord = /\.(docx|doc)$/i.test(file.name);
            const isExcel = /\.(xlsx|xls|csv)$/i.test(file.name);
            
            let previewHtml = '';
            if (isImage) {
                previewHtml = `<a href="/uploads/${file.filename}" target="_blank"><img src="/uploads/${file.filename}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; margin-right: 10px;"></a>`;
            } else if (isWord) {
                previewHtml = `<span style="font-size: 24px; margin-right: 10px;">📝</span>`;
            } else if (isExcel) {
                previewHtml = `<span style="font-size: 24px; margin-right: 10px;">📊</span>`;
            } else {
                previewHtml = `<span style="font-size: 24px; margin-right: 10px;">📄</span>`;
            }

            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'display: flex; align-items: center; flex-grow: 1;';
            infoDiv.innerHTML = `
                ${previewHtml}
                <div>
                    <a href="/uploads/${file.filename}" target="_blank" download="${file.name}" style="color: #38bdf8; text-decoration: none; font-weight: bold; font-size: 14px; display: block;">${file.name}</a>
                    <span style="font-size: 11px; color: #94a3b8;">${file.date || ''}</span>
                </div>
            `;

            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.gap = '6px';

            const downloadBtn = document.createElement('a');
            downloadBtn.href = `/uploads/${file.filename}`;
            downloadBtn.download = file.name;
            downloadBtn.className = 'btn';
            downloadBtn.style.cssText = 'background: #3b82f6; color: white; padding: 6px 10px; border-radius: 4px; font-size: 12px; text-decoration: none; display: inline-flex; align-items: center;';
            downloadBtn.textContent = '📥 Скачать';

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.style.cssText = 'background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;';
            deleteBtn.textContent = '🗑️ Удалить';
            deleteBtn.onclick = async () => {
                if (!confirm(`Удалить файл "${file.name}"?`)) return;
                const user = getCurrentUser();
                try {
                    const res = await fetch(`/api/files/${file.id}`, {
                        method: 'DELETE',
                        headers: { 'x-auth-user': JSON.stringify(user) }
                    });
                    if (!res.ok) throw new Error('Ошибка удаления');
                    loadArchiveContent();
                } catch (err) {
                    alert('Не удалось удалить: ' + err.message);
                }
            };

            btnContainer.appendChild(downloadBtn);
            btnContainer.appendChild(deleteBtn);

            div.appendChild(infoDiv);
            div.appendChild(btnContainer);
            filesContainer.appendChild(div);
        });
    }
}

// --- Заметки ---
function openNoteModal(editNote = null) {
    const nameInput = document.getElementById('noteNameInput');
    const contentInput = document.getElementById('noteContentInput');
    
    if (editNote) {
        if (nameInput) nameInput.value = editNote.title || '';
        if (contentInput) contentInput.value = editNote.content || '';
        window.currentEditNoteId = editNote.id;
    } else {
        if (nameInput) nameInput.value = '';
        if (contentInput) contentInput.value = '';
        window.currentEditNoteId = null;
    }

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

    const editId = window.currentEditNoteId;
    const isEdit = editId !== null && editId !== undefined && editId !== '';
    const url = isEdit ? `/api/notes/${editId}` : '/api/notes';
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'x-auth-user': JSON.stringify(user) },
            body: JSON.stringify({ title, content })
        });
        if (!res.ok) throw new Error('Ошибка сохранения');

        window.currentEditNoteId = null;
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
        
        window.allNotes = notes;
        const countNote = document.getElementById('countNote');
        if (countNote) countNote.textContent = notes.length;
    } catch (err) {
        console.error(err);
    }
}

function renderNotes(notes) {
    const container = document.getElementById('filesContainer');
    if (!container) return;

    container.innerHTML = '';
    notes.forEach(note => {
        const card = document.createElement('div');
        card.style.cssText = 'background: #1e293b; border: 1px solid #475569; padding: 12px; border-radius: 8px; margin-bottom: 10px; cursor: pointer;';
        
        card.onclick = (e) => {
            if (!e.target.closest('button')) {
                viewNote(note);
            }
        };

        const noteJson = encodeURIComponent(JSON.stringify(note));

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <strong style="color: #fff;">📝 ${note.title || 'Без названия'}</strong>
                <div>
                    <button class="btn" type="button" style="padding: 2px 6px; font-size: 10px; background: #334155; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 4px;" onclick="editNoteFromButton(event, '${noteJson}')">✏️</button>
                    <button class="btn" type="button" style="padding: 2px 6px; font-size: 10px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;" onclick="deleteNote(event, ${note.id})">🗑️</button>
                </div>
            </div>
            <div style="font-size: 13px; color: #cbd5e1; white-space: pre-wrap; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">${note.content || ''}</div>
            <div style="font-size: 10px; color: #94a3b8;">${note.date || ''}</div>
        `;
        container.appendChild(card);
    });
}

function viewNote(note) {
    alert(`📝 ${note.title || 'Без названия'}\n\n${note.content || ''}\n\nДата: ${note.date || ''}`);
}

function editNoteFromButton(event, encodedNote) {
    if (event) event.stopPropagation();
    try {
        const note = JSON.parse(decodeURIComponent(encodedNote));
        openNoteModal(note);
    } catch (err) {
        console.error(err);
    }
}

async function deleteNote(event, id) {
    if (event) event.stopPropagation();
    if (!confirm('Удалить эту заметку?')) return;
    const user = getCurrentUser();
    try {
        await fetch(`/api/notes/${id}`, { method: 'DELETE', headers: { 'x-auth-user': JSON.stringify(user) } });
        loadNotes();
    } catch (err) {
        alert(err.message);
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

function closeModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
}
