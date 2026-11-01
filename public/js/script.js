document.addEventListener('DOMContentLoaded', () => {
    checkAuthUI();
    if (getCurrentUser()) {
        loadEquipment();
    }

    // Универсальный перехват отправки любой формы на странице
    document.addEventListener('submit', async (e) => {
        e.preventDefault();
        await performLogin();
    });

    // Универсальный перехват клика по любой кнопке (если это не форма)
    document.addEventListener('click', async (e) => {
        if (e.target && (e.target.type === 'submit' || e.target.id.includes('login') || e.target.classList.contains('login-btn'))) {
            // Проверяем, что это действительно кнопка входа, а не что-то другое
            const usernameInput = document.getElementById('username') || document.querySelector('input[name="username"]');
            if (usernameInput && usernameInput.offsetParent !== null) {
                e.preventDefault();
                await performLogin();
            }
        }
    });
});

async function performLogin() {
    // Ищем поля ввода по любым возможным ID или атрибутам
    const usernameInput = document.getElementById('username') || 
                          document.querySelector('input[name="username"]') || 
                          document.querySelector('input[type="text"]');
                          
    const passwordInput = document.getElementById('password') || 
                          document.querySelector('input[name="password"]') || 
                          document.querySelector('input[type="password"]');

    if (!usernameInput || !passwordInput) {
        alert('Не удалось найти поля логина или пароля на странице');
        return;
    }

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        alert('Введите логин и пароль!');
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
            // Сервер вернул ошибку (например, неверный пароль) — показываем её пользователю!
            throw new Error(data.error || 'Неверный логин или пароль');
        }

        // Успешный вход
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        
        usernameInput.value = '';
        passwordInput.value = '';
        
        checkAuthUI();
        loadEquipment();
    } catch (err) {
        // Обязательно выводим ошибку на экран
        alert(err.message);
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
    
    // Ищем блоки авторизации и контента по возможным ID или классам
    const authPanel = document.getElementById('auth-panel') || 
                      document.getElementById('login-section') || 
                      document.getElementById('login-container') ||
                      document.querySelector('.login-container') ||
                      document.querySelector('form');

    const appContent = document.getElementById('app-content') || 
                       document.getElementById('equipment-section') || 
                       document.getElementById('main-app') ||
                       document.querySelector('.app-content') ||
                       document.querySelector('table');

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
        renderEquipment(data);
    } catch (err) {
        console.error(err);
    }
}

function renderEquipment(data) {
    const tableBody = document.getElementById('equipment-table-body') || document.querySelector('tbody');
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
