document.addEventListener('DOMContentLoaded', () => {
    checkAuthUI();
    if (getCurrentUser()) {
        loadEquipment();
        loadArchiveContent();
        updateCounters();
        loadUsersList();
    }

    const authForm = document.getElementById('authForm');
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await performLogin();
        });
    }

    const searchInput = document.querySelector('.real-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (window.allEquipment) {
                const filtered = window.allEquipment.filter(item => 
                    ((item.name || item.model) && (item.name || item.model).toLowerCase().includes(query)) ||
                    ((item.serialnumber || item.serialNumber) && (item.serialnumber || item.serialNumber).toLowerCase().includes(query)) ||
                    ((item.ownername || item.ownerName) && (item.ownername || item.ownerName).toLowerCase().includes(query)) ||
                    (item.location && item.location.toLowerCase().includes(query))
                );
                renderEquipment(filtered);
            }
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
        updateCounters();
        loadUsersList();
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
window.currentEquipmentId = null;
window.currentEditingNoteId = null;

// --- Счетчики ---
async function updateCounters() {
    const user = getCurrentUser();
    if (!user) return;

    try {
        const docRes = await fetch('/api/files?type=doc&all=true', { headers: { 'x-auth-user': JSON.stringify(user) } });
        if (docRes.ok) {
            const docs = await docRes.json();
            const countDoc = document.getElementById('countDoc');
            if (countDoc) countDoc.textContent = docs.length;
        }

        const imgRes = await fetch('/api/files?type=image&all=true', { headers: { 'x-auth-user': JSON.stringify(user) } });
        if (imgRes.ok) {
            const images = await imgRes.json();
            const countImage = document.getElementById('countImage');
            if (countImage) countImage.textContent = images.length;
        }

        const noteRes = await fetch('/api/notes', { headers: { 'x-auth-user': JSON.stringify(user) } });
        if (noteRes.ok) {
            const notes = await noteRes.json();
            const countNote = document.getElementById('countNote');
            if (countNote) countNote.textContent = notes.length;
        }
    } catch (err) {
        console.error('Ошибка счетчиков:', err);
    }
}

// --- Управление пользователями (Админ-панель) ---
async function loadUsersList() {
    const user = getCurrentUser();
    if (!user) return;

    try {
        const res = await fetch('/api/users', {
            headers: { 'x-auth-user': JSON.stringify(user) }
        });
        if (!res.ok) throw new Error('Не удалось загрузить список пользователей');
        const users = await res.json();
        console.log("Загруженные пользователи с сервера:", users);
        renderUsersTable(users);
    } catch (err) {
        console.error('Ошибка загрузки пользователей:', err);
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Нет пользователей</td></tr>';
        return;
    }

    users.forEach(u => {
        const tr = document.createElement('tr');
        const roleBadge = u.role === 'admin' ? '<span style="color: #38bdf8; font-weight: 700;">Администратор</span>' : 'Пользователь';
        
        let permissionsText = 'Полный доступ';
        if (u.role !== 'admin') {
            try {
                const perms = JSON.parse(u.permissions || '[]');
                permissionsText = perms.length > 0 ? perms.join(', ') : 'Нет прав';
            } catch (e) {
                permissionsText = '-';
            }
        }

        const userJson = encodeURIComponent(JSON.stringify(u));

        tr.innerHTML = `
            <td><strong>${u.username}</strong></td>
            <td>${roleBadge}</td>
            <td style="font-size: 11px; color: var(--text-muted);">${permissionsText}</td>
            <td style="text-align: right; white-space: nowrap;">
                <button class="btn" type="button" style="padding: 4px 8px; font-size: 11px; background: #334155; margin-right: 4px;" onclick="editUserFromButton('${userJson}')">✏️</button>
                <button class="btn" type="button" style="padding: 4px 8px; font-size: 11px; background: #ef4444;" onclick="deleteUser(${u.id})">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openUserModal(editData = null) {
    const modal = document.getElementById('userModal');
    const title = document.getElementById('userModalTitle');
    const idInput = document.getElementById('userIdInput');
    const loginInput = document.getElementById('userLoginInput');
    const passwordInput = document.getElementById('userPasswordInput');
    const passwordLabel = document.getElementById('userPasswordLabel');
    const roleInput = document.getElementById('userRoleInput');
    const permCheckboxes = document.querySelectorAll('.perm-checkbox');

    // Жестко очищаем ID при каждом открытии модального окна
    if (idInput) {
        idInput.value = "";
    }

    if (editData && editData.id) {
        if (title) title.textContent = '✏️ Редактировать пользователя';
        if (idInput) idInput.value = String(editData.id); // Записываем ID только при редактировании
        if (loginInput) loginInput.value = editData.username || '';
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.placeholder = 'Оставьте пустым, чтобы не менять';
        }
        if (passwordLabel) passwordLabel.textContent = 'Новый пароль (опционально):';
        if (roleInput) roleInput.value = editData.role || 'user';

        let userPerms = [];
        try {
            userPerms = JSON.parse(editData.permissions || '[]');
        } catch (e) {}

        permCheckboxes.forEach(cb => {
            cb.checked = userPerms.includes(cb.value);
        });
    } else {
        if (title) title.textContent = '➕ Новый пользователь';
        if (idInput) idInput.value = ""; // Гарантированно пустая строка для создания (POST)
        if (loginInput) loginInput.value = '';
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.placeholder = '••••••••';
        }
        if (passwordLabel) passwordLabel.textContent = 'Пароль:*';
        if (roleInput) roleInput.value = 'user';
        permCheckboxes.forEach(cb => cb.checked = true);
    }

    onRoleChangeSelect();
    if (modal) modal.style.display = 'flex';
}

function closeUserModal() {
    const modal = document.getElementById('userModal');
    const idInput = document.getElementById('userIdInput');
    if (idInput) idInput.value = '';
    if (modal) modal.style.display = 'none';
}

function onRoleChangeSelect() {
    const role = document.getElementById('userRoleInput')?.value;
    const permGroup = document.getElementById('permissionsGroup');
    if (permGroup) {
        permGroup.style.display = role === 'admin' ? 'none' : 'block';
    }
}

function editUserFromButton(encodedUser) {
    try {
        const user = JSON.parse(decodeURIComponent(encodedUser));
        openUserModal(user);
    } catch (e) {
        console.error(e);
    }
}

async function saveUser(event) {
    if (event) event.preventDefault();
    const currentUser = getCurrentUser();

    const idInput = document.getElementById('userIdInput');
    const id = idInput ? idInput.value.trim() : '';
    const username = document.getElementById('userLoginInput')?.value.trim();
    const password = document.getElementById('userPasswordInput')?.value.trim();
    const role = document.getElementById('userRoleInput')?.value || 'user';

    const permissions = [];
    document.querySelectorAll('.perm-checkbox:checked').forEach(cb => {
        permissions.push(cb.value);
    });

    if (!username) {
        alert('Введите логин пользователя!');
        return;
    }

    const isEdit = !!id && id !== '';
    const url = isEdit ? `/api/users/${id}` : '/api/users';
    const method = isEdit ? 'PUT' : 'POST';

    const payload = { username, password, role, permissions };

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'x-auth-user': JSON.stringify(currentUser) },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка сохранения пользователя');

        closeUserModal();
        loadUsersList();
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
}

async function deleteUser(id) {
    if (!confirm('Удалить этого пользователя?')) return;
    const currentUser = getCurrentUser();

    try {
        const res = await fetch(`/api/users/${id}`, {
            method: 'DELETE',
            headers: { 'x-auth-user': JSON.stringify(currentUser) }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка удаления');

        loadUsersList();
    } catch (err) {
        alert('Не удалось удалить: ' + err.message);
    }
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
    const mobileContainer = document.getElementById('mobileEquipmentList');
    if (tableBody) tableBody.innerHTML = '';
    if (mobileContainer) mobileContainer.innerHTML = '';

    if (!data || data.length === 0) return;

    data.forEach(item => {
        const name = item.name || item.model || item.title || 'Без названия';
        const serial = item.serialnumber || item.serialNumber || item.serial || '-';
        const owner = item.ownername || item.ownerName || item.owner || '-';
        const location = item.location || item.object || item.mesto || '-';
        const nextVer = item.nextver || item.nextVer || item.nextVerification || '-';
        const status = item.status || 'В эксплуатации';

        const statusClass = status.toLowerCase().includes('выведен') || status.toLowerCase().includes('ремонт') ? 'badge-status badge-warning' : 'badge-status badge-ok';

        if (tableBody) {
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.onclick = (e) => {
                if (!e.target.closest('button')) viewEquipmentPassport(item.id);
            };

            const itemJson = encodeURIComponent(JSON.stringify(item));

            row.innerHTML = `
                <td><strong>${name}</strong></td>
                <td>${serial}</td>
                <td>${owner}</td>
                <td>${location}</td>
                <td>${nextVer}</td>
                <td><span class="${statusClass}" style="padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; text-align: center; white-space: nowrap; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);">${status}</span></td>
                <td style="text-align: right; white-space: nowrap;">
                    <button class="btn" type="button" style="padding: 4px 8px; font-size: 11px; background: #334155; margin-right: 4px;" onclick="editEquipmentFromButton(event, '${itemJson}')">✏️</button>
                    <button class="btn" type="button" style="padding: 4px 8px; font-size: 11px; background: #ef4444;" onclick="deleteEquipment(event, ${item.id})">🗑️</button>
                </td>
            `;
            tableBody.appendChild(row);
        }

        if (mobileContainer) {
            const card = document.createElement('div');
            card.className = 'mobile-eq-card';
            card.onclick = (e) => {
                if (!e.target.closest('button')) viewEquipmentPassport(item.id);
            };
            card.innerHTML = `
                <div style="font-weight: 700; color: #fff; font-size: 14px;">${name}</div>
                <div style="font-size: 12px; color: var(--text-muted);">Зав. №: ${serial} | Объект: ${location}</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                    <span style="padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);">${status}</span>
                    <div>
                        <button class="btn" type="button" style="padding: 4px 8px; font-size: 11px; background: #334155;" onclick="editEquipmentFromButton(event, '${encodeURIComponent(JSON.stringify(item))}')">✏️</button>
                        <button class="btn" type="button" style="padding: 4px 8px; font-size: 11px; background: #ef4444;" onclick="deleteEquipment(event, ${item.id})">🗑️</button>
                    </div>
                </div>
            `;
            mobileContainer.appendChild(card);
        }
    });
}

async function viewEquipmentPassport(id) {
    const item = window.allEquipment?.find(eq => eq.id === id);
    if (!item) return;

    window.currentEquipmentId = item.id;

    document.getElementById('viewEqName').textContent = item.name || '-';
    document.getElementById('viewEqSerial').textContent = item.serialnumber || item.serialNumber || '-';
    document.getElementById('viewEqGsiNumber').textContent = item.gsinumber || item.gsiNumber || '-';
    document.getElementById('viewEqOwnerName').textContent = item.ownername || item.ownerName || '-';
    document.getElementById('viewEqLocation').textContent = item.location || '-';
    document.getElementById('viewEqInstallationDate').textContent = item.installationdate || item.installationDate || '-';
    document.getElementById('viewEqCapacity').textContent = item.capacity || '-';
    document.getElementById('viewEqMinCapacity').textContent = item.mincapacity || item.minCapacity || '-';
    document.getElementById('viewEqDiscrete').textContent = item.discrete || '-';
    document.getElementById('viewEqAdcType').textContent = item.adctype || item.adcType || '-';
    document.getElementById('viewEqSensorType').textContent = item.sensortype || item.sensorType || '-';
    document.getElementById('viewEqPlatformCount').textContent = item.platformcount || item.platformCount || '-';
    document.getElementById('viewEqWeighingMode').textContent = item.weighingmode || item.weighingMode || '-';
    document.getElementById('viewEqCertNumber').textContent = item.certnumber || item.certNumber || '-';
    document.getElementById('viewEqLastVer').textContent = item.lastver || item.lastVer || '-';
    document.getElementById('viewEqNextVer').textContent = item.nextver || item.nextVer || '-';
    document.getElementById('viewEqPhone').textContent = item.phone || '-';
    document.getElementById('viewEqEmail').textContent = item.email || '-';
    document.getElementById('viewEqNotes').textContent = item.notes || '-';
    
    const badge = document.getElementById('viewEqBadge');
    if (badge) badge.textContent = item.status || 'В эксплуатации';

    await loadMaintenanceRecords(item.id);

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
    document.getElementById('eqSerial').value = editData ? editData.serialnumber || editData.serialNumber || '' : '';
    document.getElementById('eqGsiNumber').value = editData ? editData.gsinumber || editData.gsiNumber || '' : '';
    document.getElementById('eqOwnerName').value = editData ? editData.ownername || editData.ownerName || '' : '';
    document.getElementById('eqLocation').value = editData ? editData.location || '' : '';
    document.getElementById('eqInstallationDate').value = editData ? editData.installationdate || editData.installationDate || '' : '';
    document.getElementById('eqCapacity').value = editData ? editData.capacity || '' : '';
    document.getElementById('eqMinCapacity').value = editData ? editData.mincapacity || editData.minCapacity || '' : '';
    document.getElementById('eqDiscrete').value = editData ? editData.discrete || '' : '';
    document.getElementById('eqAdcType').value = editData ? editData.adctype || editData.adcType || '' : '';
    document.getElementById('eqSensorType').value = editData ? editData.sensortype || editData.sensorType || '' : '';
    document.getElementById('eqPlatformCount').value = editData ? editData.platformcount || editData.platformCount || '' : '';
    document.getElementById('eqWeighingMode').value = editData ? editData.weighingmode || editData.weighingMode || '' : '';
    document.getElementById('eqCertNumber').value = editData ? editData.certnumber || editData.certNumber || '' : '';
    document.getElementById('eqLastVer').value = editData ? editData.lastver || editData.lastVer || '' : '';
    document.getElementById('eqNextVer').value = editData ? editData.nextver || editData.nextVer || '' : '';
    document.getElementById('eqStatus').value = editData ? editData.status || 'В эксплуатации' : 'В эксплуатации';
    document.getElementById('eqPhone').value = editData ? editData.phone || '' : '';
    document.getElementById('eqEmail').value = editData ? editData.email || '' : '';
    document.getElementById('eqNotes').value = editData ? editData.notes || '' : '';

    if (modal) {
        if (editData && editData.id) {
            if (title) title.textContent = '✏️ Редактировать оборудование';
            modal.dataset.editId = String(editData.id);
        } else {
            if (title) title.textContent = '➕ Добавить оборудование';
            delete modal.dataset.editId;
        }
        modal.style.display = 'flex';
    }
}

function closeEquipmentModal() {
    const modal = document.getElementById('equipmentModal');
    if (modal) {
        modal.style.display = 'none';
        delete modal.dataset.editId;
    }
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

    const payload = {
        name: document.getElementById('eqName')?.value || '',
        serialNumber: document.getElementById('eqSerial')?.value || '',
        gsiNumber: document.getElementById('eqGsiNumber')?.value || '',
        ownerName: document.getElementById('eqOwnerName')?.value || '',
        location: document.getElementById('eqLocation')?.value || '',
        installationDate: document.getElementById('eqInstallationDate')?.value || '',
        capacity: document.getElementById('eqCapacity')?.value || '',
        minCapacity: document.getElementById('eqMinCapacity')?.value || '',
        discrete: document.getElementById('eqDiscrete')?.value || '',
        adcType: document.getElementById('eqAdcType')?.value || '',
        sensorType: document.getElementById('eqSensorType')?.value || '',
        platformCount: document.getElementById('eqPlatformCount')?.value || '',
        weighingMode: document.getElementById('eqWeighingMode')?.value || '',
        certNumber: document.getElementById('eqCertNumber')?.value || '',
        lastVer: document.getElementById('eqLastVer')?.value || '',
        nextVer: document.getElementById('eqNextVer')?.value || '',
        status: document.getElementById('eqStatus')?.value || 'В эксплуатации',
        phone: document.getElementById('eqPhone')?.value || '',
        email: document.getElementById('eqEmail')?.value || '',
        notes: document.getElementById('eqNotes')?.value || ''
    };

    if (!payload.name) {
        alert('Введите наименование!');
        return;
    }

    const modal = document.getElementById('equipmentModal');
    const editId = modal ? modal.dataset.editId : null;
    const isEdit = editId !== null && editId !== undefined && editId !== '' && editId !== 'undefined' && editId !== 'null';
    const url = isEdit ? `/api/equipment/${editId}` : '/api/equipment';
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'x-auth-user': JSON.stringify(user) },
            body: JSON.stringify(payload)
        });
        
        const responseData = await res.json();
        if (!res.ok) throw new Error(responseData.error || 'Ошибка сохранения');

        closeEquipmentModal();
        loadEquipment();
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
}

async function deleteEquipment(event, id) {
    if (event) event.stopPropagation();
    
    if (!id || isNaN(Number(id))) {
        alert('Ошибка: неверный ID записи для удаления');
        return;
    }

    if (!confirm('Удалить эту запись оборудования?')) return;
    const user = getCurrentUser();
    
    try {
        const res = await fetch(`/api/equipment/${id}`, { 
            method: 'DELETE', 
            headers: { 'x-auth-user': JSON.stringify(user) } 
        });
        
        if (!res.ok) throw new Error('Ошибка удаления с сервера');
        loadEquipment();
    } catch (err) {
        alert('Не удалось удалить: ' + err.message);
    }
}

// --- Журнал обслуживания ---
async function loadMaintenanceRecords(equipmentId) {
    const user = getCurrentUser();
    const container = document.getElementById('maintenanceListContainer');
    if (!container) return;
    container.innerHTML = '';

    try {
        const res = await fetch(`/api/maintenance?equipmentId=${equipmentId}`, {
            headers: { 'x-auth-user': JSON.stringify(user) }
        });
        if (!res.ok) return;
        const records = await res.json();

        if (records.length === 0) {
            container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 4px;">Записей обслуживания нет.</div>';
            return;
        }

        records.forEach(rec => {
            const workType = rec.workType || rec.worktype || 'Работа';
            const maintDate = rec.maintDate || rec.maintdate || rec.date || '';
            const description = rec.description || rec.desc || '';
            const performedBy = rec.performedBy || rec.performedby || '-';

            const div = document.createElement('div');
            div.style.cssText = 'background: #0f172a; border: 1px solid var(--border); padding: 8px; border-radius: 6px; display: flex; justify-content: space-between; align-items: flex-start; font-size: 12px;';
            div.innerHTML = `
                <div>
                    <strong style="color: #fff;">${workType}</strong> <span style="color: var(--text-muted);">(${maintDate})</span>
                    <div style="color: var(--text-main); margin-top: 2px;">${description}</div>
                    <div style="color: #38bdf8; font-size: 11px; margin-top: 2px;">Исполнитель: ${performedBy}</div>
                </div>
                <button class="btn" type="button" style="padding: 2px 6px; font-size: 10px; background: #ef4444;" onclick="deleteMaintenance(${rec.id})">🗑️</button>
            `;
            container.appendChild(div);
        });
    } catch (err) {
        console.error(err);
    }
}

function openMaintenanceModal() {
    document.getElementById('maintWorkType').value = '';
    document.getElementById('maintDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('maintDesc').value = '';
    document.getElementById('maintPerformedBy').value = '';

    const modal = document.getElementById('maintenanceModal');
    if (modal) modal.style.display = 'flex';
}

function closeMaintenanceModal() {
    const modal = document.getElementById('maintenanceModal');
    if (modal) modal.style.display = 'none';
}

async function saveMaintenance(event) {
    if (event) event.preventDefault();
    const user = getCurrentUser();

    const workType = document.getElementById('maintWorkType')?.value || '';
    const maintDate = document.getElementById('maintDate')?.value || '';
    const desc = document.getElementById('maintDesc')?.value || '';
    const performedBy = document.getElementById('maintPerformedBy')?.value || '';

    if (!window.currentEquipmentId) {
        alert('Ошибка: не определено оборудование');
        return;
    }

    try {
        const res = await fetch('/api/maintenance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-auth-user': JSON.stringify(user) },
            body: JSON.stringify({ equipmentId: window.currentEquipmentId, workType, maintDate, desc, description: desc, performedBy })
        });
        if (!res.ok) throw new Error('Ошибка добавления записи');

        closeMaintenanceModal();
        loadMaintenanceRecords(window.currentEquipmentId);
    } catch (err) {
        alert(err.message);
    }
}

async function deleteMaintenance(id) {
    if (!confirm('Удалить эту запись обслуживания?')) return;
    const user = getCurrentUser();
    try {
        const res = await fetch(`/api/maintenance/${id}`, {
            method: 'DELETE',
            headers: { 'x-auth-user': JSON.stringify(user) }
        });
        if (!res.ok) throw new Error('Ошибка удаления');
        loadMaintenanceRecords(window.currentEquipmentId);
    } catch (err) {
        alert(err.message);
    }
}

function printPassport() {
    window.print();
}

// --- Вкладки архива, папки и файлы ---
function selectTab(tabName) {
    window.currentTab = tabName;
    window.currentFolderId = null;

    document.querySelectorAll('.nav-card').forEach(card => card.classList.remove('active'));
    
    if (tabName === 'doc') document.getElementById('navDoc')?.classList.add('active');
    if (tabName === 'image') document.getElementById('navImage')?.classList.add('active');
    if (tabName === 'note') document.getElementById('navNote')?.classList.add('active');
    if (tabName === 'admin') document.getElementById('navAdmin')?.classList.add('active');

    const welcomeScreen = document.getElementById('welcomeScreen');
    const adminSection = document.getElementById('adminSection');
    const contentSection = document.getElementById('contentSection');

    if (welcomeScreen) welcomeScreen.style.display = 'none';
    if (adminSection) adminSection.style.display = 'none';
    if (contentSection) contentSection.style.display = 'none';

    const btnFolder = document.getElementById('btnCreateFolder');
    const btnPhoto = document.getElementById('btnUploadPhoto');
    const btnDoc = document.getElementById('btnUploadDoc');

    if (btnFolder) btnFolder.style.display = 'inline-flex';
    if (btnPhoto) btnPhoto.style.display = 'none';
    if (btnDoc) btnDoc.style.display = 'none';

    if (tabName === 'admin') {
        if (adminSection) adminSection.style.display = 'flex';
        loadUsersList();
    } else if (tabName === 'doc' || tabName === 'image' || tabName === 'note') {
        if (contentSection) contentSection.style.display = 'flex';
        
        const titleEl = document.getElementById('sectionTitle');
        if (titleEl) {
            if (tabName === 'doc') {
                titleEl.textContent = '📄 Документы';
                if (btnDoc) btnDoc.style.display = 'inline-flex';
            }
            if (tabName === 'image') {
                titleEl.textContent = '🖼️ Фотографии';
                if (btnPhoto) btnPhoto.style.display = 'inline-flex';
            }
            if (tabName === 'note') {
                titleEl.textContent = '📝 Заметки';
                if (btnFolder) btnFolder.style.display = 'none';
            }
        }
        loadArchiveContent();
    } else {
        if (welcomeScreen) welcomeScreen.style.display = 'block';
    }
}

function goHome() {
    selectTab('home');
    updateCounters();
}

async function uploadFiles(files) {
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
        if (!res.ok) throw new Error('Ошибка загрузки файлов');

        loadArchiveContent();
        updateCounters();
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
}

async function loadArchiveContent() {
    const user = getCurrentUser();
    if (!user) return;

    if (window.currentTab === 'note') {
        const foldersContainer = document.getElementById('foldersContainer');
        if (foldersContainer) foldersContainer.innerHTML = '';
        loadNotes();
        return;
    }

    try {
        let url = `/api/folders?type=${window.currentTab}`;
        if (window.currentFolderId) url += `&parentId=${window.currentFolderId}`;

        const res = await fetch(url, { headers: { 'x-auth-user': JSON.stringify(user) } });
        if (res.ok) {
            const folders = await res.json();
            
            let filesUrl = `/api/files?type=${window.currentTab}`;
            if (window.currentFolderId) filesUrl += `&folderId=${window.currentFolderId}`;
            const filesRes = await fetch(filesUrl, { headers: { 'x-auth-user': JSON.stringify(user) } });
            const files = filesRes.ok ? await filesRes.json() : [];

            renderFoldersAndFiles(folders, files);
        }
    } catch (err) {
        console.error('Ошибка архива:', err);
    }
}

async function promptCreateFolder() {
    if (window.currentTab === 'note') {
        openNoteModal();
        return;
    }

    const folderName = prompt('Введите название новой папки:');
    if (!folderName || !folderName.trim()) return;

    let folderType = window.currentTab;
    if (!folderType || folderType === 'home' || folderType === 'admin') {
        folderType = 'doc';
    }

    const user = getCurrentUser();
    const payload = { 
        name: folderName.trim(), 
        type: folderType, 
        parentId: (window.currentFolderId && window.currentFolderId !== 'null' && window.currentFolderId !== 'undefined') ? Number(window.currentFolderId) : null
    };

    try {
        const res = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-auth-user': JSON.stringify(user) },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка создания папки');
        
        loadArchiveContent();
    } catch (err) {
        alert('Ошибка создания папки: ' + err.message);
    }
}

function renderFoldersAndFiles(folders, files) {
    const container = document.getElementById('foldersContainer');
    const filesContainer = document.getElementById('filesContainer');
    if (!container || !filesContainer) return;

    container.innerHTML = '';
    filesContainer.innerHTML = '';

    const banner = document.getElementById('folderBanner');
    if (window.currentFolderId) {
        if (banner) banner.style.display = 'flex';
    } else {
        if (banner) banner.style.display = 'none';
    }

    if (window.currentTab === 'doc') {
        const hintDiv = document.createElement('div');
        hintDiv.style.cssText = 'background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.2); padding: 8px 12px; border-radius: 6px; font-size: 12px; color: #38bdf8; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;';
        hintDiv.innerHTML = 'ℹ️ <strong>Подсказка:</strong> PDF-файлы и фото можно открывать для просмотра на сайте. Документы Word и Excel доступны для скачивания.';
        filesContainer.appendChild(hintDiv);
    }

    if (folders && folders.length > 0) {
        folders.forEach(folder => {
            const div = document.createElement('div');
            div.style.cssText = 'background: #1e293b; border: 1px solid var(--border); padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';
            div.innerHTML = `
                <span style="color: #fff; cursor: pointer; font-weight: 600;" onclick="openFolder(${folder.id})">📁 ${folder.name}</span>
                <button class="btn" type="button" style="background: #ef4444; padding: 4px 8px; font-size: 11px;" onclick="deleteFolder(${folder.id})">🗑️</button>
            `;
            container.appendChild(div);
        });
    }

    if (files && files.length > 0) {
        files.forEach(file => {
            const div = document.createElement('div');
            div.style.cssText = 'background: #1e293b; border: 1px solid var(--border); padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';
            
            const ext = file.name.split('.').pop().toLowerCase();
            const canViewOnline = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
            const actionText = canViewOnline ? '👁️ Просмотр' : '📥 Скачать';
            const actionBg = canViewOnline ? '#334155' : '#047857';

            const actionHtml = canViewOnline 
                ? `<button class="btn" type="button" style="background: ${actionBg}; padding: 4px 8px; font-size: 11px;" onclick="window.open('/uploads/${file.filename}', '_blank')">${actionText}</button>`
                : `<a href="/uploads/${file.filename}" download="${file.name}" class="btn" style="background: ${actionBg}; padding: 4px 8px; font-size: 11px; text-decoration: none; color: #fff; display: inline-flex; align-items: center;">${actionText}</a>`;

            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; flex-grow: 1;">
                    <span style="color: #38bdf8; font-weight: 500;">📄 ${file.name}</span>
                </div>
                <div style="display: flex; gap: 6px; align-items: center;">
                    ${actionHtml}
                    <button class="btn" type="button" style="background: #ef4444; padding: 4px 8px; font-size: 11px;" onclick="deleteFile(${file.id})">🗑️</button>
                </div>
            `;
            filesContainer.appendChild(div);
        });
    }
}

function openFolder(id) {
    window.currentFolderId = id;
    loadArchiveContent();
}

function exitFolder() {
    window.currentFolderId = null;
    loadArchiveContent();
}

async function deleteFolder(id) {
    if (!confirm('Удалить папку?')) return;
    const user = getCurrentUser();
    try {
        await fetch(`/api/folders/${id}`, { method: 'DELETE', headers: { 'x-auth-user': JSON.stringify(user) } });
        loadArchiveContent();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteFile(id) {
    if (!confirm('Удалить файл?')) return;
    const user = getCurrentUser();
    try {
        await fetch(`/api/files/${id}`, { method: 'DELETE', headers: { 'x-auth-user': JSON.stringify(user) } });
        loadArchiveContent();
        updateCounters();
    } catch (err) {
        alert(err.message);
    }
}

// --- Заметки ---
function openNoteModal() {
    document.getElementById('noteNameInput').value = '';
    document.getElementById('noteContentInput').value = '';
    const modal = document.getElementById('noteModal');
    if (modal) modal.style.display = 'flex';
}

async function saveNote(event) {
    if (event) event.preventDefault();
    const user = getCurrentUser();
    const title = document.getElementById('noteNameInput')?.value || '';
    const content = document.getElementById('noteContentInput')?.value || '';

    try {
        const res = await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-auth-user': JSON.stringify(user) },
            body: JSON.stringify({ title, content })
        });
        if (!res.ok) throw new Error('Ошибка сохранения');

        closeModals();
        loadNotes();
        updateCounters();
    } catch (err) {
        alert(err.message);
    }
}

async function loadNotes() {
    const user = getCurrentUser();
    try {
        const res = await fetch('/api/notes', { headers: { 'x-auth-user': JSON.stringify(user) } });
        if (!res.ok) return;
        const notes = await res.json();
        renderNotes(notes);
    } catch (err) {
        console.error(err);
    }
}

function renderNotes(notes) {
    const container = document.getElementById('filesContainer');
    if (!container) return;
    container.innerHTML = '';

    notes.forEach(note => {
        const div = document.createElement('div');
        div.style.cssText = 'background: #1e293b; border: 1px solid var(--border); padding: 12px; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: border-color 0.2s;';
        div.onmouseover = () => div.style.borderColor = 'var(--accent)';
        div.onmouseout = () => div.style.borderColor = 'var(--border)';
        
        div.onclick = (e) => {
            if (!e.target.closest('button')) {
                openViewNoteModal(note);
            }
        };

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong style="color: #fff;">📝 ${note.title || 'Без названия'}</strong>
                <button class="btn" type="button" style="background: #ef4444; padding: 2px 6px; font-size: 10px;" onclick="deleteNote(event, ${note.id})">🗑️</button>
            </div>
            <div style="font-size: 13px; color: var(--text-main); white-space: pre-wrap; max-height: 80px; overflow: hidden; text-overflow: ellipsis;">${note.content || ''}</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">📅 ${note.date || ''}</div>
        `;
        container.appendChild(div);
    });
}

function openViewNoteModal(note) {
    window.currentEditingNoteId = note.id;
    const titleInput = document.getElementById('viewNoteNameInput');
    const contentInput = document.getElementById('viewNoteContentInput');
    const dateDiv = document.getElementById('viewNoteDate');

    if (titleInput) titleInput.value = note.title || '';
    if (contentInput) contentInput.value = note.content || '';
    if (dateDiv) dateDiv.textContent = `Дата сохранения: ${note.date || '-'}`;

    const modal = document.getElementById('viewNoteModal');
    if (modal) modal.style.display = 'flex';
}

function closeViewNoteModal() {
    const modal = document.getElementById('viewNoteModal');
    if (modal) modal.style.display = 'none';
    window.currentEditingNoteId = null;
}

async function updateExistingNote() {
    if (!window.currentEditingNoteId) return;
    const user = getCurrentUser();
    const title = document.getElementById('viewNoteNameInput')?.value || '';
    const content = document.getElementById('viewNoteContentInput')?.value || '';

    try {
        const res = await fetch(`/api/notes/${window.currentEditingNoteId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-auth-user': JSON.stringify(user) },
            body: JSON.stringify({ title, content })
        });
        if (!res.ok) throw new Error('Ошибка обновления заметки');

        closeViewNoteModal();
        loadNotes();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteNote(event, id) {
    if (event) event.stopPropagation();
    if (!confirm('Удалить заметку?')) return;
    const user = getCurrentUser();
    try {
        await fetch(`/api/notes/${id}`, { method: 'DELETE', headers: { 'x-auth-user': JSON.stringify(user) } });
        loadNotes();
        updateCounters();
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

function toggleMobileSearch() {
    const searchBox = document.getElementById('searchBoxContainer');
    if (searchBox) searchBox.classList.toggle('search-active');
}
