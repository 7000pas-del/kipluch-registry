document.addEventListener('DOMContentLoaded', () => {
    checkAuthUI();
    if (getCurrentUser()) {
        loadEquipment();
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Блокируем стандартную перезагрузку и автозаполнение
            
            const userInput = document.getElementById('username');
            const passInput = document.getElementById('password');

            if (!userInput || !passInput) return;

            await login(userInput.value.trim(), passInput.value.trim());
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

function getAuthHeaders() {
    const user = getCurrentUser() || {};
    return {
        'Content-Type': 'application/json',
        'X-User-Role': user.role || '',
        'X-User-Name': user.username || ''
    };
}

function checkAuthUI() {
    const user = getCurrentUser();
    const authPanel = document.getElementById('auth-panel');
    const userDisplay = document.getElementById('user-display');
    const adminTab = document.getElementById('admin-tab');

    if (user) {
        if (authPanel) authPanel.style.display = 'none';
        if (userDisplay) {
            userDisplay.style.display = 'block';
            userDisplay.textContent = `Пользователь: ${user.username}`;
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

async function login(username, password) {
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

        localStorage.setItem('currentUser', JSON.stringify(data));
        checkAuthUI();
        await loadEquipment();
    } catch (err) {
        alert(`Не удалось войти: ${err.message}`);
    }
}

function logout() {
    localStorage.removeItem('currentUser');
    checkAuthUI();
    renderEquipment([]);
}

async function loadEquipment() {
    try {
        const res = await fetch('/api/equipment', {
            headers: getAuthHeaders()
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
