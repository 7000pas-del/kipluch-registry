let db = { folders: [], items: [] };
    let equipmentList = [];
    let activeTab = null;
    let currentFolderId = null;
    let viewingNoteId = null;
    let viewingEqId = null;
    let editingEqId = null;

    function openBackupModal() { document.getElementById('backupModal').style.display = 'flex'; }
    function closeBackupModal() { document.getElementById('backupModal').style.display = 'none'; }

    async function uploadBackupFile() {
        const fileInput = document.getElementById('backupFileInput');
        if (!fileInput.files || fileInput.files.length === 0) {
            alert('Выберите файл бэкапа (.db)');
            return;
        }
        const formData = new FormData();
        formData.append('backup', fileInput.files[0]);

        try {
            const res = await fetch('/api/backup/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                alert('База данных успешно восстановлена!');
                location.reload();
            } else {
                alert('Ошибка восстановления: ' + (data.error || 'неизвестно'));
            }
        } catch(err) {
            alert('Ошибка соединения с сервером');
        }
    }

    let usersList = [];

    async function loadUsers() {
        try {
            const res = await fetch('/api/users');
            usersList = await res.json();
            renderUsersTable();
        } catch(e) {}
    }

    function renderUsersTable() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        if (!usersList.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Нет пользователей</td></tr>`;
            return;
        }
        tbody.innerHTML = usersList.map(u => {
            let pText = u.permissions === 'all' ? '✨ Полные права (Админ)' : (u.permissions ? u.permissions.split(',').join(', ') : 'Нет прав');
            return `
                <tr>
                    <td><b>${u.username}</b></td>
                    <td>${u.role === 'admin' ? '⚙️ Администратор' : '👤 Пользователь'}</td>
                    <td style="font-size: 11px; color: var(--text-muted);">${pText}</td>
                    <td style="text-align: right;">
                        <button class="btn" type="button" style="padding: 4px 8px; font-size: 11px;" onclick="editUser('${u.id}')">✏️ Настроить</button>
                        ${u.username.toLowerCase() !== 'admin' ? `<button class="btn" type="button" style="padding: 4px 8px; font-size: 11px; background: var(--danger);" onclick="deleteUser('${u.id}')">🗑️</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }

    function openUserModal() {
        document.getElementById('userIdInput').value = '';
        document.getElementById('userLoginInput').value = '';
        document.getElementById('userPasswordInput').value = '';
        document.getElementById('userRoleInput').value = 'user';
        document.querySelectorAll('.perm-checkbox').forEach(cb => cb.checked = false);
        document.getElementById('permissionsGroup').style.display = 'block';
        document.getElementById('userModalTitle').textContent = '➕ Новый пользователь';
        document.getElementById('userModal').style.display = 'flex';
    }

    function onRoleChangeSelect() {
        const role = document.getElementById('userRoleInput').value;
        const group = document.getElementById('permissionsGroup');
        if (role === 'admin') {
            group.style.display = 'none';
        } else {
            group.style.display = 'block';
        }
    }

    function editUser(id) {
        const u = usersList.find(x => x.id === id);
        if (!u) return;
        document.getElementById('userIdInput').value = u.id;
        document.getElementById('userLoginInput').value = u.username;
        document.getElementById('userPasswordInput').value = '';
        document.getElementById('userRoleInput').value = u.role;
        
        const group = document.getElementById('permissionsGroup');
        if (u.role === 'admin') {
            group.style.display = 'none';
        } else {
            group.style.display = 'block';
            const perms = u.permissions ? u.permissions.split(',') : [];
            document.querySelectorAll('.perm-checkbox').forEach(cb => {
                cb.checked = perms.includes(cb.value);
            });
        }
        document.getElementById('userModalTitle').textContent = '✏️ Изменить пользователя / права';
        document.getElementById('userModal').style.display = 'flex';
    }

    function closeUserModal() { document.getElementById('userModal').style.display = 'none'; }

    async function saveUser(e) {
        e.preventDefault();
        const id = document.getElementById('userIdInput').value;
        const username = document.getElementById('userLoginInput').value.trim();
        const password = document.getElementById('userPasswordInput').value.trim();
        const role = document.getElementById('userRoleInput').value;
        
        let permissions = [];
        if (role === 'admin') {
            permissions = ['all'];
        } else {
            document.querySelectorAll('.perm-checkbox:checked').forEach(cb => {
                permissions.push(cb.value);
            });
        }

        if (!username) { alert('Введите логин'); return; }
        if (!id && !password) { alert('Введите пароль для нового пользователя'); return; }

        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, username, password, role, permissions })
            });
            const data = await res.json();
            if (data.success) {
                closeUserModal();
                loadUsers();
            } else {
                alert('Ошибка: ' + (data.error || 'не удалось сохранить'));
            }
        } catch(err) { alert('Ошибка соединения'); }
    }

    async function deleteUser(id) {
        if (!confirm('Удалить этого пользователя?')) return;
        try {
            const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                loadUsers();
            } else {
                alert(data.error || 'Ошибка удаления');
            }
        } catch(e) {}
    }

    function printPassport() {
        const oldTitle = document.title;
        document.title = ""; 
        window.print();
        setTimeout(() => {
            document.title = oldTitle;
        }, 1000);
    }

    document.getElementById('authForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('authLogin').value.trim();
        const password = document.getElementById('authPassword').value.trim();

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('currentUser', username);
                localStorage.setItem('currentUserRole', data.role || 'user');
                localStorage.setItem('currentUserPerms', data.permissions || '');
                
                document.getElementById('authOverlay').style.display = 'none';
                applyUserRoleUI();
                loadDB();
            } else {
                document.getElementById('authError').style.display = 'block';
            }
        } catch(err) { alert('Ошибка соединения'); }
    });

    function logoutSystem() {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('currentUserRole');
        localStorage.removeItem('currentUserPerms');
        location.reload();
    }

    function checkPermission(perm) {
        const role = localStorage.getItem('currentUserRole');
        const perms = localStorage.getItem('currentUserPerms') || '';
        if (role === 'admin' || perms === 'all') return true;
        return perms.split(',').includes(perm);
    }

    function applyUserRoleUI() {
        const role = localStorage.getItem('currentUserRole') || 'user';
        const username = localStorage.getItem('currentUser') || 'Пользователь';
        
        const badge = document.getElementById('currentUserBadge');
        if (badge) {
            badge.textContent = `👤 ${username} (${role === 'admin' ? 'Админ' : 'Пользователь'})`;
        }

        const navAdmin = document.getElementById('navAdmin');
        const navGrid = document.getElementById('navGridContainer');
        if (navAdmin && navGrid) {
            if (role === 'admin') {
                navAdmin.style.display = 'flex';
                navGrid.style.gridTemplateColumns = 'repeat(4, 1fr)';
            } else {
                navAdmin.style.display = 'none';
                navGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
                if (activeTab === 'admin') selectTab(null);
            }
        }

        const btnAddEq = document.getElementById('btnAddEquipment');
        if (btnAddEq) btnAddEq.style.display = checkPermission('equipment') ? 'inline-flex' : 'none';

        const btnBackup = document.getElementById('btnBackup');
        if (btnBackup) btnBackup.style.display = checkPermission('backup') ? 'inline-flex' : 'none';

        const btnCreateFolderArchive = document.getElementById('btnCreateFolderInArchive');
        if (btnCreateFolderArchive) btnCreateFolderArchive.style.display = checkPermission('folders') ? 'inline-flex' : 'none';

        const btnNewNote = document.getElementById('btnNewNote');
        if (btnNewNote) btnNewNote.style.display = checkPermission('notes') ? 'inline-flex' : 'none';
    }

    if (localStorage.getItem('isLoggedIn') === 'true') {
        document.getElementById('authOverlay').style.display = 'none';
        applyUserRoleUI();
    }

    function toggleMobileSearch() {
        const container = document.getElementById('searchBoxContainer');
        const input = document.getElementById('searchInput');
        container.classList.toggle('search-active');
        if (container.classList.contains('search-active')) input.focus();
    }

    function onSearchInput() { render(); }

    function parseHash() {
        try {
            const hash = (window.location.hash || '').replace('#', '').trim();
            if (!hash) { activeTab = null; currentFolderId = null; return; }
            const parts = hash.split('/');
            activeTab = parts[0] || null;
            currentFolderId = parts[1] || null;
        } catch(e) { activeTab = null; currentFolderId = null; }
    }

    function updateHash() {
        try {
            if (!activeTab) history.replaceState("", document.title, window.location.pathname + window.location.search);
            else if (currentFolderId) window.location.hash = `${activeTab}/${currentFolderId}`;
            else window.location.hash = `${activeTab}`;
        } catch(e) {}
    }

    window.addEventListener('hashchange', () => { parseHash(); updateNavUI(); render(); });

    async function loadDB() {
        if (localStorage.getItem('isLoggedIn') !== 'true') return;
        try {
            const res = await fetch('/api/db');
            db = await res.json();
            await loadEquipment();
            parseHash();
            updateNavUI();
            render();
        } catch (e) { console.error('Ошибка БД:', e); }
    }

    async function loadEquipment() {
        try {
            const res = await fetch('/api/equipment');
            equipmentList = await res.json();
            renderEquipmentTable();
            if (viewingEqId) viewEquipment(viewingEqId);
        } catch (e) {}
    }

    function renderEquipmentTable() {
        const tbody = document.getElementById('equipmentTableBody');
        const mobileList = document.getElementById('mobileEquipmentList');
        if (!tbody || !mobileList) return;

        const canEq = checkPermission('equipment');

        if (!equipmentList || equipmentList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">Реестр пуст.</td></tr>`;
            mobileList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px;">Реестр пуст.</div>`;
            return;
        }

        tbody.innerHTML = equipmentList.map(eq => `
            <tr onclick="viewEquipment('${eq.id}')">
                <td><b>${eq.name || '-'}</b></td>
                <td>${eq.serialNumber || '-'}</td>
                <td>${eq.ownerName || '-'}</td>
                <td>${eq.location || '-'}</td>
                <td>${eq.nextVerification || '-'}</td>
                <td><span class="badge-status status-ok">${eq.status || 'В эксплуатации'}</span></td>
                <td style="text-align: right;" onclick="event.stopPropagation()">
                    ${canEq ? `<button class="btn" type="button" style="padding: 6px 10px; font-size: 12px;" onclick="editEquipment('${eq.id}')">✏️</button>
                    <button class="btn" type="button" style="padding: 6px 10px; font-size: 12px; background: var(--danger);" onclick="deleteEquipment('${eq.id}')">🗑️</button>` : '<span style="font-size:11px; color:var(--text-muted);">Просмотр</span>'}
                </td>
            </tr>
        `).join('');

        mobileList.innerHTML = equipmentList.map(eq => `
            <div class="mobile-eq-card" onclick="viewEquipment('${eq.id}')">
                <div style="font-weight: 700; font-size: 14px; color: var(--primary);">${eq.name || '-'}</div>
                <div style="font-size: 11px; color: var(--text-muted);">Зав. №: ${eq.serialNumber || '-'} | Поверка: ${eq.nextVerification || '-'}</div>
            </div>
        `).join('');
    }

    async function viewEquipment(id) {
        const eq = equipmentList.find(e => e.id === id);
        if (!eq) return;
        viewingEqId = id;
        document.getElementById('viewEqName').textContent = eq.name || '-';
        document.getElementById('viewEqSerial').textContent = eq.serialNumber || '-';
        document.getElementById('viewEqGsiNumber').textContent = eq.gsiNumber || '-';
        document.getElementById('viewEqOwnerName').textContent = eq.ownerName || '-';
        document.getElementById('viewEqLocation').textContent = eq.location || '-';
        document.getElementById('viewEqInstallationDate').textContent = eq.installationDate || '-';
        document.getElementById('viewEqCapacity').textContent = eq.capacity || '-';
        document.getElementById('viewEqMinCapacity').textContent = eq.minCapacity || '-';
        document.getElementById('viewEqDiscrete').textContent = eq.discrete || '-';
        document.getElementById('viewEqAdcType').textContent = eq.adcType || '-';
        document.getElementById('viewEqSensorType').textContent = eq.sensorType || '-';
        document.getElementById('viewEqPlatformCount').textContent = eq.platformCount || '-';
        document.getElementById('viewEqWeighingMode').textContent = eq.weighingMode || '-';
        document.getElementById('viewEqLastVer').textContent = eq.lastVerification || '-';
        document.getElementById('viewEqNextVer').textContent = eq.nextVerification || '-';
        document.getElementById('viewEqCertNumber').textContent = eq.certNumber || '-';
        document.getElementById('viewEqPhone').textContent = eq.phone || '-';
        document.getElementById('viewEqEmail').textContent = eq.email || '-';
        document.getElementById('viewEqNotes').textContent = eq.notes || '-';

        const btnEditFromView = document.getElementById('btnEditFromView');
        if (btnEditFromView) {
            btnEditFromView.style.display = checkPermission('equipment') ? 'inline-flex' : 'none';
            btnEditFromView.onclick = function() {
                closeViewEquipmentModal();
                editEquipment(eq.id);
            };
        }
        document.getElementById('viewEquipmentModal').style.display = 'flex';
        loadMaintenance(id);
    }

    function closeViewEquipmentModal() { document.getElementById('viewEquipmentModal').style.display = 'none'; viewingEqId = null; }

    async function loadMaintenance(eqId) {
        const container = document.getElementById('maintenanceListContainer');
        const canMaint = checkPermission('maintenance');
        const btnAddMaint = document.getElementById('btnAddMaintenance');
        if (btnAddMaint) btnAddMaint.style.display = canMaint ? 'inline-flex' : 'none';

        try {
            const res = await fetch(`/api/maintenance/${eqId}`);
            const list = await res.json();
            if (!list || list.length === 0) {
                container.innerHTML = `<div style="color: var(--text-muted); font-size: 11px;">Записей обслуживания нет.</div>`;
                return;
            }
            container.innerHTML = list.map(m => `
                <div class="maint-row">
                    <div>
                        <div style="font-weight: 700; font-size: 12px; color: var(--primary);">${m.workType} <span style="font-weight: 400; color: var(--text-muted);">(${m.date})</span></div>
                        <div style="font-size: 11px; color: var(--text-main); margin-top: 2px;">${m.description || ''}</div>
                        <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Исполнитель: ${m.performedBy || '-'}</div>
                    </div>
                    ${canMaint ? `<button class="btn" type="button" style="background: var(--danger); padding: 4px 6px; font-size: 10px;" onclick="deleteMaintenance('${m.id}', '${eqId}')">🗑️</button>` : ''}
                </div>
            `).join('');
        } catch(e) {}
    }

    function openMaintenanceModal() {
        if (!checkPermission('maintenance')) { alert('У вас нет прав на обслуживание весов'); return; }
        document.getElementById('maintWorkType').value = '';
        document.getElementById('maintDate').value = new Date().toISOString().slice(0, 10);
        document.getElementById('maintDesc').value = '';
        document.getElementById('maintPerformedBy').value = '';
        document.getElementById('maintenanceModal').style.display = 'flex';
    }

    function closeMaintenanceModal() { document.getElementById('maintenanceModal').style.display = 'none'; }

    async function saveMaintenance(e) {
        e.preventDefault();
        if (!viewingEqId) return;
        const workType = document.getElementById('maintWorkType').value.trim();
        if (!workType) { alert('Введите вид работы'); return; }

        const payload = {
            equipmentId: viewingEqId,
            workType,
            date: document.getElementById('maintDate').value,
            description: document.getElementById('maintDesc').value.trim(),
            performedBy: document.getElementById('maintPerformedBy').value.trim()
        };

        try {
            const res = await fetch('/api/maintenance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if ((await res.json()).success) {
                closeMaintenanceModal();
                loadMaintenance(viewingEqId);
            }
        } catch(e) {}
    }

    async function deleteMaintenance(mId, eqId) {
        if (!confirm('Удалить запись обслуживания?')) return;
        try {
            await fetch(`/api/maintenance/${mId}`, { method: 'DELETE' });
            loadMaintenance(eqId);
        } catch(e) {}
    }

    function openEquipmentModal() {
        if (!checkPermission('equipment')) { alert('У вас нет прав на добавление оборудования'); return; }
        editingEqId = null;
        document.getElementById('eqModalTitle').textContent = '➕ Добавить весы';
        ['eqName', 'eqSerial', 'eqGsiNumber', 'eqOwnerName', 'eqLocation', 'eqInstallationDate', 'eqCapacity', 'eqMinCapacity', 'eqDiscrete', 'eqAdcType', 'eqSensorType', 'eqPlatformCount', 'eqWeighingMode', 'eqLastVer', 'eqNextVer', 'eqCertNumber', 'eqPhone', 'eqEmail', 'eqNotes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('equipmentModal').style.display = 'flex';
    }

    function editEquipment(id) {
        if (!checkPermission('equipment')) { alert('У вас нет прав на редактирование оборудования'); return; }
        const eq = equipmentList.find(e => e.id === id);
        if (!eq) return;
        editingEqId = id;
        document.getElementById('eqModalTitle').textContent = '✏️ Изменить паспорт';
        document.getElementById('eqName').value = eq.name || '';
        document.getElementById('eqSerial').value = eq.serialNumber || '';
        document.getElementById('eqGsiNumber').value = eq.gsiNumber || '';
        document.getElementById('eqOwnerName').value = eq.ownerName || '';
        document.getElementById('eqLocation').value = eq.location || '';
        document.getElementById('eqInstallationDate').value = eq.installationDate || '';
        document.getElementById('eqCapacity').value = eq.capacity || '';
        document.getElementById('eqMinCapacity').value = eq.minCapacity || '';
        document.getElementById('eqDiscrete').value = eq.discrete || '';
        document.getElementById('eqAdcType').value = eq.adcType || '';
        document.getElementById('eqSensorType').value = eq.sensorType || '';
        document.getElementById('eqPlatformCount').value = eq.platformCount || '';
        document.getElementById('eqWeighingMode').value = eq.weighingMode || '';
        document.getElementById('eqLastVer').value = eq.lastVerification || '';
        document.getElementById('eqNextVer').value = eq.nextVerification || '';
        document.getElementById('eqCertNumber').value = eq.certNumber || '';
        document.getElementById('eqPhone').value = eq.phone || '';
        document.getElementById('eqEmail').value = eq.email || '';
        document.getElementById('eqStatus').value = eq.status || 'В эксплуатации';
        document.getElementById('eqNotes').value = eq.notes || '';
        document.getElementById('equipmentModal').style.display = 'flex';
    }

    function closeEquipmentModal() { document.getElementById('equipmentModal').style.display = 'none'; editingEqId = null; }

    async function saveEquipment(e) {
        e.preventDefault();
        const name = document.getElementById('eqName').value.trim();
        if (!name) { alert('Введите наименование!'); return; }

        const payload = {
            id: editingEqId || '',
            name,
            serialNumber: document.getElementById('eqSerial').value.trim(),
            gsiNumber: document.getElementById('eqGsiNumber').value.trim(),
            ownerName: document.getElementById('eqOwnerName').value.trim(),
            location: document.getElementById('eqLocation').value.trim(),
            installationDate: document.getElementById('eqInstallationDate').value,
            capacity: document.getElementById('eqCapacity').value.trim(),
            minCapacity: document.getElementById('eqMinCapacity').value.trim(),
            discrete: document.getElementById('eqDiscrete').value.trim(),
            adcType: document.getElementById('eqAdcType').value.trim(),
            sensorType: document.getElementById('eqSensorType').value.trim(),
            platformCount: document.getElementById('eqPlatformCount').value.trim(),
            weighingMode: document.getElementById('eqWeighingMode').value.trim(),
            lastVerification: document.getElementById('eqLastVer').value,
            nextVerification: document.getElementById('eqNextVer').value,
            certNumber: document.getElementById('eqCertNumber').value.trim(),
            phone: document.getElementById('eqPhone').value.trim(),
            email: document.getElementById('eqEmail').value.trim(),
            status: document.getElementById('eqStatus').value,
            notes: document.getElementById('eqNotes').value.trim()
        };

        try {
            const res = await fetch('/api/equipment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) { 
                closeEquipmentModal(); 
                loadEquipment(); 
            } else {
                alert('Ошибка сохранения на сервере: ' + (data.error || 'неизвестная ошибка'));
            }
        } catch (err) { 
            alert('Ошибка соединения с сервером'); 
        }
    }

    async function deleteEquipment(id) {
        if (!checkPermission('equipment')) { alert('У вас нет прав на удаление оборудования'); return; }
        if (!confirm('Удалить весы?')) return;
        try {
            await fetch(`/api/equipment/${id}`, { method: 'DELETE' });
            loadEquipment();
        } catch (e) {}
    }

    function selectTab(tab) {
        if (tab === 'admin' && localStorage.getItem('currentUserRole') !== 'admin') return;
        activeTab = tab;
        currentFolderId = null;
        updateHash();
        updateNavUI();
        if (tab === 'admin') loadUsers();
        render();
    }

    function goHome() { activeTab = null; currentFolderId = null; document.getElementById('searchInput').value = ''; updateHash(); updateNavUI(); render(); }
    function openFolder(id) { currentFolderId = id; updateHash(); updateNavUI(); render(); }
    function exitFolder() { currentFolderId = null; updateHash(); updateNavUI(); render(); }

    async function promptCreateFolder() {
        if (!checkPermission('folders')) { alert('У вас нет прав на создание папок'); return; }
        if (!activeTab || activeTab === 'admin') return;
        const name = prompt('Название папки:');
        if (!name || !name.trim()) return;
        try {
            const res = await fetch('/api/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: 'folder_' + Date.now(), type: activeTab, name: name.trim() })
            });
            if ((await res.json()).success) loadDB();
        } catch (e) {}
    }

    async function deleteFolder(id) {
        if (!checkPermission('folders')) { alert('У вас нет прав на удаление папок'); return; }
        if (!confirm('Удалить папку?')) return;
        try {
            const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' });
            if ((await res.json()).success) { if (currentFolderId === id) currentFolderId = null; updateHash(); loadDB(); }
        } catch (e) {}
    }

    async function uploadFiles(files) {
        if (!checkPermission('upload')) { alert('У вас нет прав на загрузку файлов'); return; }
        if (!files || files.length === 0) return;
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) formData.append('files', files[i]);
        if (currentFolderId) formData.append('folderId', currentFolderId);
        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            if ((await res.json()).success) loadDB();
        } catch (e) {}
    }

    function openNoteModal() {
        if (!checkPermission('notes')) { alert('У вас нет прав на создание заметок'); return; }
        document.getElementById('noteNameInput').value = '';
        document.getElementById('noteContentInput').value = '';
        document.getElementById('noteModal').style.display = 'flex';
    }

    function openNoteModalView(id) {
        const item = db.items.find(i => i.id === id);
        if (!item) return;
        viewingNoteId = id;
        document.getElementById('viewNoteNameInput').value = item.name || '';
        document.getElementById('viewNoteContentInput').value = item.content || '';
        document.getElementById('viewNoteDate').textContent = `Создано: ${item.date || ''}`;
        
        const btnSave = document.getElementById('btnSaveNoteChanges');
        if (btnSave) btnSave.style.display = checkPermission('notes') ? 'inline-flex' : 'none';

        document.getElementById('viewNoteModal').style.display = 'flex';
    }

    function closeViewNoteModal() { document.getElementById('viewNoteModal').style.display = 'none'; viewingNoteId = null; }

    async function updateExistingNote() {
        if (!checkPermission('notes')) { alert('У вас нет прав на изменение заметок'); return; }
        if (!viewingNoteId) return;
        const name = document.getElementById('viewNoteNameInput').value.trim();
        const content = document.getElementById('viewNoteContentInput').value.trim();
        if (!name) { alert('Введите название'); return; }
        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: viewingNoteId, name, content })
            });
            if ((await res.json()).success) { closeViewNoteModal(); loadDB(); }
        } catch (e) {}
    }

    async function saveNote(e) {
        e.preventDefault();
        if (!checkPermission('notes')) { alert('У вас нет прав на сохранение заметок'); return; }
        const name = document.getElementById('noteNameInput').value.trim();
        const content = document.getElementById('noteContentInput').value.trim();
        if (!name) { alert('Введите название'); return; }
        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, content, folderId: currentFolderId || null })
            });
            if ((await res.json()).success) { closeModals(); loadDB(); }
        } catch (e) {}
    }

    async function deleteItem(id) {
        if (!checkPermission('upload') && !checkPermission('notes')) { alert('У вас нет прав на удаление элементов'); return; }
        if (!confirm('Удалить элемент?')) return;
        try {
            const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
            if ((await res.json()).success) loadDB();
        } catch (e) {}
    }

    function closeModals() { document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none'); }

    function updateNavUI() {
        ['doc', 'image', 'note', 'admin'].forEach(t => {
            const card = document.getElementById(`nav${t.charAt(0).toUpperCase() + t.slice(1)}`);
            if (card) {
                if (activeTab === t) card.classList.add('active');
                else card.classList.remove('active');
            }
        });

        const welcome = document.getElementById('welcomeScreen');
        const content = document.getElementById('contentSection');
        const adminSec = document.getElementById('adminSection');

        if (!activeTab) {
            if (welcome) welcome.style.display = 'flex';
            if (content) content.style.display = 'none';
            if (adminSec) adminSec.style.display = 'none';
        } else if (activeTab === 'admin') {
            if (localStorage.getItem('currentUserRole') !== 'admin') {
                goHome();
                return;
            }
            if (welcome) welcome.style.display = 'none';
            if (content) content.style.display = 'none';
            if (adminSec) adminSec.style.display = 'flex';
        } else {
            if (welcome) welcome.style.display = 'none';
            if (content) content.style.display = 'flex';
            if (adminSec) adminSec.style.display = 'none';
        }

        const canUpload = checkPermission('upload');
        const canNotes = checkPermission('notes');
        const btnPhoto = document.getElementById('btnUploadPhoto');
        const btnDoc = document.getElementById('btnUploadDoc');
        const btnNewNote = document.getElementById('btnNewNote');

        if (activeTab === 'image') {
            if (btnPhoto) btnPhoto.style.display = canUpload ? 'inline-flex' : 'none';
            if (btnDoc) btnDoc.style.display = 'none';
            if (btnNewNote) btnNewNote.style.display = 'none';
        } else if (activeTab === 'doc') {
            if (btnPhoto) btnPhoto.style.display = 'none';
            if (btnDoc) btnDoc.style.display = canUpload ? 'inline-flex' : 'none';
            if (btnNewNote) btnNewNote.style.display = 'none';
        } else if (activeTab === 'note') {
            if (btnPhoto) btnPhoto.style.display = 'none';
            if (btnDoc) btnDoc.style.display = 'none';
            if (btnNewNote) btnNewNote.style.display = canNotes ? 'inline-flex' : 'none';
        } else {
            if (btnPhoto) btnPhoto.style.display = 'none';
            if (btnDoc) btnDoc.style.display = 'none';
            if (btnNewNote) btnNewNote.style.display = canNotes ? 'inline-flex' : 'none';
        }

        const counts = { doc: 0, image: 0, note: 0 };
        db.items.forEach(item => { if (counts[item.type] !== undefined) counts[item.type]++; });
        document.getElementById('countDoc').textContent = counts.doc;
        document.getElementById('countImage').textContent = counts.image;
        document.getElementById('countNote').textContent = counts.note;
    }

    function render() {
        const query = (document.getElementById('searchInput').value || '').toLowerCase().trim();
        updateNavUI();
        if (query) { renderGlobalSearch(query); return; }
        if (!activeTab || activeTab === 'admin') return;

        const sectionTitle = document.getElementById('sectionTitle');
        const tabNames = { doc: '📄 Документы', image: '🖼️ Фото', note: '📝 Заметки' };
        sectionTitle.textContent = tabNames[activeTab] || 'Элементы';

        const folderBanner = document.getElementById('folderBanner');
        const foldersContainer = document.getElementById('foldersContainer');
        if (currentFolderId) {
            folderBanner.style.display = 'flex';
            const f = db.folders.find(x => x.id === currentFolderId);
            if (f) document.getElementById('folderBannerTitle').textContent = `📁 ${f.name}`;
            foldersContainer.style.display = 'none';
        } else {
            folderBanner.style.display = 'none';
            foldersContainer.style.display = 'grid';
            renderFolders();
        }
        renderItems();
    }

    function renderFolders() {
        const container = document.getElementById('foldersContainer');
        const list = db.folders.filter(f => f.type === activeTab);
        const canFolders = checkPermission('folders');

        if (list.length === 0) { container.innerHTML = `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 12px;">Папок нет.</div>`; return; }
        container.innerHTML = list.map(f => `
            <div class="folder-item" onclick="openFolder('${f.id}')">
                <div class="folder-info">
                    <span>📁</span>
                    <div class="folder-title">${f.name}</div>
                </div>
                ${canFolders ? `<button class="btn" type="button" style="padding: 4px 6px; font-size: 10px; background: var(--danger);" onclick="event.stopPropagation(); deleteFolder('${f.id}')">🗑️</button>` : ''}
            </div>
        `).join('');
    }

    function renderItems() {
        const container = document.getElementById('filesContainer');
        let list = db.items.filter(i => i.type === activeTab && !i.equipmentId);
        if (currentFolderId) list = list.filter(i => i.folderId === currentFolderId);
        else list = list.filter(i => !i.folderId);

        const canUpload = checkPermission('upload');
        const canNotes = checkPermission('notes');

        if (list.length === 0) { container.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; padding: 10px 0;">Элементов нет.</div>`; return; }

        if (activeTab === 'note') {
            container.innerHTML = `<div class="files-list">${list.map(item => `
                <div class="file-row" onclick="openNoteModalView('${item.id}')" style="gap: 6px; cursor: pointer;">
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <div style="font-weight: 700; font-size: 14px; color: var(--primary);">📝 ${item.name}</div>
                        ${canNotes ? `<button class="btn" type="button" style="padding: 4px 6px; font-size: 10px; background: var(--danger);" onclick="event.stopPropagation(); deleteItem('${item.id}')">🗑️</button>` : ''}
                    </div>
                    <div style="font-size: 12px; color: var(--text-main);">${item.content || ''}</div>
                </div>`).join('')}</div>`;
        } else if (activeTab === 'image') {
            container.innerHTML = `<div class="gallery-grid">${list.map(item => `
                <div class="photo-card">
                    <div class="photo-preview" onclick="window.open('${item.filePath}', '_blank')"><img src="${item.filePath}" alt="${item.name}"></div>
                    <div class="photo-content"><div style="font-weight: 600; font-size: 12px;">${item.name}</div></div>
                    <div class="photo-footer"><span style="font-size: 10px; color: var(--text-muted);">${item.date || ''}</span>${canUpload ? `<button class="btn" type="button" style="background: var(--danger); padding: 4px 6px; font-size: 10px;" onclick="deleteItem('${item.id}')">🗑️</button>` : ''}</div>
                </div>`).join('')}</div>`;
        } else if (activeTab === 'doc') {
            container.innerHTML = `<div class="files-list">${list.map(item => `
                <div class="file-row">
                    <div class="file-meta" onclick="window.open('${item.filePath}', '_blank')"><span>📄</span><div class="file-name">${item.name}</div></div>
                    <div class="file-actions"><button class="btn" type="button" onclick="window.open('${item.filePath}', '_blank')">Открыть</button>${canUpload ? `<button class="btn" type="button" style="background: var(--danger);" onclick="deleteItem('${item.id}')">Удалить</button>` : ''}</div>
                </div>`).join('')}</div>`;
        }
    }

    function renderGlobalSearch(q) {
        const welcomeScreen = document.getElementById('welcomeScreen');
        const contentSection = document.getElementById('contentSection');
        const adminSection = document.getElementById('adminSection');

        if (welcomeScreen) welcomeScreen.style.display = 'none';
        if (adminSection) adminSection.style.display = 'none';
        if (contentSection) contentSection.style.display = 'flex';

        const sectionTitle = document.getElementById('sectionTitle');
        sectionTitle.textContent = `🔍 Результаты поиска: "${q}"`;

        const folderBanner = document.getElementById('folderBanner');
        if (folderBanner) folderBanner.style.display = 'none';

        const foldersContainer = document.getElementById('foldersContainer');
        if (foldersContainer) foldersContainer.style.display = 'none';

        const container = document.getElementById('filesContainer');

        const foundEq = equipmentList.filter(eq => 
            (eq.name && eq.name.toLowerCase().includes(q)) ||
            (eq.serialNumber && eq.serialNumber.toLowerCase().includes(q)) ||
            (eq.ownerName && eq.ownerName.toLowerCase().includes(q)) ||
            (eq.location && eq.location.toLowerCase().includes(q)) ||
            (eq.gsiNumber && eq.gsiNumber.toLowerCase().includes(q)) ||
            (eq.notes && eq.notes.toLowerCase().includes(q))
        );

        const foundFolders = db.folders.filter(f => f.name && f.name.toLowerCase().includes(q));

        const foundItems = db.items.filter(i => 
            (i.name && i.name.toLowerCase().includes(q)) ||
            (i.content && i.content.toLowerCase().includes(q))
        );

        let html = '';

        if (foundEq.length > 0) {
            html += `<div style="font-weight: 700; font-size: 13px; color: var(--primary); margin-bottom: 8px;">📊 Оборудование (${foundEq.length}):</div>`;
            html += `<div class="files-list" style="margin-bottom: 16px;">`;
            html += foundEq.map(eq => `
                <div class="file-row" onclick="viewEquipment('${eq.id}')" style="cursor: pointer;">
                    <div class="file-meta">
                        <span>⚖️</span>
                        <div>
                            <div class="file-name">${eq.name || '-'} (Зав. №: ${eq.serialNumber || '-'})</div>
                            <div style="font-size: 11px; color: var(--text-muted);">Владелец: ${eq.ownerName || '-'} | Место: ${eq.location || '-'}</div>
                        </div>
                    </div>
                </div>
            `).join('');
            html += `</div>`;
        }

        if (foundFolders.length > 0) {
            html += `<div style="font-weight: 700; font-size: 13px; color: var(--primary); margin-bottom: 8px;">📁 Папки (${foundFolders.length}):</div>`;
            html += `<div class="folders-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); margin-bottom: 16px;">`;
            html += foundFolders.map(f => `
                <div class="folder-item" onclick="selectTab('${f.type}'); setTimeout(() => openFolder('${f.id}'), 50);">
                    <div class="folder-info">
                        <span>📁</span>
                        <div class="folder-title">${f.name} <span style="font-size: 10px; color: var(--text-muted);">(${f.type === 'doc' ? 'Документы' : f.type === 'image' ? 'Фото' : 'Заметки'})</span></div>
                    </div>
                </div>
            `).join('');
            html += `</div>`;
        }

        if (foundItems.length > 0) {
            html += `<div style="font-weight: 700; font-size: 13px; color: var(--primary); margin-bottom: 8px;">📄 Документы, фото и заметки (${foundItems.length}):</div>`;
            html += `<div class="files-list">`;
            html += foundItems.map(item => {
                let icon = item.type === 'image' ? '🖼️' : (item.type === 'note' ? '📝' : '📄');
                let clickAction = item.type === 'note' ? `openNoteModalView('${item.id}')` : `window.open('${item.filePath}', '_blank')`;
                return `
                    <div class="file-row" onclick="${clickAction}" style="cursor: pointer;">
                        <div class="file-meta">
                            <span>${icon}</span>
                            <div class="file-name">${item.name}</div>
                        </div>
                        <div style="font-size: 11px; color: var(--text-muted);">${item.date || ''}</div>
                    </div>
                `;
            }).join('');
            html += `</div>`;
        }

        if (foundEq.length === 0 && foundFolders.length === 0 && foundItems.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted); padding: 24px; text-align: center;">Ничего не найдено по запросу "${q}".</div>`;
        } else {
            container.innerHTML = html;
        }
    }

    if (localStorage.getItem('isLoggedIn') === 'true') { 
        loadDB(); 
        applyUserRoleUI();
        if (activeTab === 'admin') loadUsers();
    }
</script>
</body>
</html>
