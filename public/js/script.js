document.addEventListener('DOMContentLoaded', () => {
    checkAuthUI();
    if (getCurrentUser()) {
        loadEquipment();
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');

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

                if (!response.ok) {
                    throw new Error(data.error || 'Ошибка входа');
                }

                localStorage.setItem('currentUser', JSON.stringify(data.user));
                loginForm.reset();
                checkAuthUI();
                loadEquipment();
            } catch (err) {
                alert(err.message);
            }
        });
    }
});

function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem('currentUser') || 'null');
    } catch (e) {
        return null;
    }
}

function checkAuthUI() {
    const user = getCurrentUser();
    const authPanel = document.getElementById('auth-panel');
    const appContent = document.getElementById('app-content') || document.getElementById('equipment-section');

    if (user) {
        if (authPanel) authPanel.style.display = 'none';
        if (appContent) appContent.style.display = 'block';
    } else {
        if (authPanel) authPanel.style.display = 'block';
        if (appContent) appContent.style.display = 'none';
    }
}

function logout() {
    localStorage.removeItem('currentUser');
    checkAuthUI();
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
        renderEquipment(data);
    } catch (err) {
        console.error(err);
    }
}

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
            <td><button onclick="deleteEquipment(${item.id})">🗑️</button></td>
        `;
        tableBody.appendChild(row);
    });
}

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
