document.addEventListener('DOMContentLoaded', () => {
    checkAuthUI();
    if (getCurrentUser()) {
        loadEquipment();
    }

    // Ищем форму входа
    const loginForm = document.getElementById('login-form') || 
                      document.getElementById('login') || 
                      document.querySelector('form');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await performLogin(loginForm);
        });
    }

    // Если кнопка входа вне формы или форма отправляется кликом
    const submitButton = document.getElementById('login-btn') || 
                         document.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.addEventListener('click', async (e) => {
            e.preventDefault();
            const form = submitButton.closest('form') || document;
            await performLogin(form);
        });
    }
});

async function performLogin(context = document) {
    // Ищем поля строго внутри формы или на странице по стандартным именам и ID
    const usernameInput = context.querySelector('#username') || 
                          context.querySelector('input[name="username"]') || 
                          context.querySelector('input[type="text"]');
                          
    const passwordInput = context.querySelector('#password') || 
                          context.querySelector('input[name="password"]') || 
                          context.querySelector('input[type="password"]');

    if (!usernameInput || !passwordInput) {
        alert('Не удалось найти поля логина или пароля');
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
            throw new Error(data.error || 'Неверный логин или пароль');
        }

        // Успешный вход
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        
        usernameInput.value = '';
        passwordInput.value = '';
        
        checkAuthUI();
        loadEquipment();
    } catch (err) {
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
    
    const authPanel = document.getElementById('auth-panel') || 
                      document.getElementById('login-section') || 
                      document.getElementById('login-container') ||
                      document.querySelector('.login-container');

    const appContent = document.getElementById('app-content') || 
                       document.getElementById('equipment-section') || 
                       document.getElementById('main-app') ||
                       document.querySelector('.app-content');

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
