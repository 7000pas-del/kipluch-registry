// Переменные состояния
let currentUser = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupAuthForm();
});

// Проверка авторизации и применение прав
function checkAuth() {
    const savedUser = localStorage.getItem('user');
    if (!savedUser) {
        showAuthOverlay(true);
    } else {
        currentUser = JSON.parse(savedUser);
        showAuthOverlay(false);
        applyUserPermissions(currentUser);
    }
}

// Применение прав доступа к интерфейсу
function applyUserPermissions(user) {
    if (!user) return;

    // Отображение имени пользователя внизу меню
    const badge = document.getElementById('currentUserBadge');
    if (badge) {
        badge.innerText = `👤 ${user.login} (${user.role === 'admin' ? 'Администратор' : 'Пользователь'})`;
    }

    // 1. Скрытие вкладки "Админ" для простых пользователей
    const adminTab = document.getElementById('navAdmin');
    if (adminTab) {
        adminTab.style.display = (user.role === 'admin') ? 'flex' : 'none';
    }

    // 2. Обработка режима "view_only" (Только просмотр)
    const permissions = user.permissions || [];
    const isViewOnly = permissions.includes('view_only');

    // Кнопки добавления/редактирования
    const actionButtons = [
        document.getElementById('btnCreateFolder'),
        document.getElementById('btnUploadDoc'),
        document.getElementById('btnUploadPhoto'),
        document.getElementById('btnCreateEq'),
        document.getElementById('btnAddMaintenance'),
        document.getElementById('btnEditFromView'),
        document.getElementById('btnUpdateNote')
    ];

    actionButtons.forEach(btn => {
        if (btn) {
            btn.style.display = isViewOnly ? 'none' : '';
        }
    });

    // Скрытие элементов с классом защиты прав
    const writeActions = document.querySelectorAll('.action-btn-write');
    writeActions.forEach(el => {
        el.style.display = isViewOnly ? 'none' : '';
    });
}

// Настройка формы входа
function setupAuthForm() {
    const authForm = document.getElementById('authForm');
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const loginInput = document.getElementById('authLogin').value.trim();
            const passInput = document.getElementById('authPassword').value.trim();
            const errorDiv = document.getElementById('authError');

            try {
                // Проверка дефолтного администратора
                if (loginInput === 'admin' && passInput === 'admin123') {
                    const defaultAdmin = { 
                        login: 'admin', 
                        role: 'admin', 
                        permissions: ['view_only', 'equipment', 'doc', 'image', 'note'] 
                    };
                    localStorage.setItem('user', JSON.stringify(defaultAdmin));
                    showAuthOverlay(false);
                    location.reload();
                    return;
                }

                // Запрос к базе данных Supabase за данными пользователя
                const { data, error } = await supabaseClient
                    .from('users')
                    .select('*')
                    .eq('login', loginInput)
                    .single();

                if (error || !data || data.password !== passInput) {
                    if (errorDiv) {
                        errorDiv.style.display = 'block';
                        errorDiv.innerText = 'Неверный логин или пароль';
                    }
                    return;
                }

                // Успешный вход
                localStorage.setItem('user', JSON.stringify(data));
                currentUser = data;
                showAuthOverlay(false);
                applyUserPermissions(currentUser);
                location.reload();
            } catch (err) {
                console.error('Ошибка входа:', err);
                if (loginInput === 'admin' && passInput === 'admin123') {
                    const defaultAdmin = { 
                        login: 'admin', 
                        role: 'admin', 
                        permissions: ['view_only', 'equipment', 'doc', 'image', 'note'] 
                    };
                    localStorage.setItem('user', JSON.stringify(defaultAdmin));
                    showAuthOverlay(false);
                    location.reload();
                } else if (errorDiv) {
                    errorDiv.style.display = 'block';
                    errorDiv.innerText = 'Ошибка соединения с сервером';
                }
            }
        });
    }
}

// Управление чекбоксами в модальном окне пользователя
function getSelectedPermissions() {
    const checkboxes = document.querySelectorAll('.perm-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function setPermissionsCheckboxes(permissionsArray = []) {
    const checkboxes = document.querySelectorAll('.perm-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = permissionsArray.includes(cb.value);
    });
}

function onRoleChangeSelect() {
    const roleSelect = document.getElementById('userRoleInput');
    const permGroup = document.getElementById('permissionsGroup');
    if (roleSelect && permGroup) {
        const isAdmin = roleSelect.value === 'admin';
        const checkboxes = permGroup.querySelectorAll('.perm-checkbox');
        checkboxes.forEach(cb => {
            if (isAdmin) cb.checked = true;
        });
    }
}

// Функция отображения модального окна входа
function showAuthOverlay(show) {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.style.display = show ? 'flex' : 'none';
}

function logoutSystem() {
    localStorage.removeItem('user');
    location.reload();
}

// Переключение вкладок приложения
function selectTab(tabName) {
    const tabs = ['doc', 'image', 'note', 'admin'];
    tabs.forEach(t => {
        const el = document.getElementById('nav' + t.charAt(0).toUpperCase() + t.slice(1));
        if (el) el.classList.remove('active');
    });

    const activeEl = document.getElementById('nav' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
    if (activeEl) activeEl.classList.add('active');

    const contentSec = document.getElementById('contentSection');
    const adminSec = document.getElementById('adminSection');
    const welcomeScreen = document.getElementById('welcomeScreen');

    if (tabName === 'admin') {
        if (contentSec) contentSec.style.display = 'none';
        if (welcomeScreen) welcomeScreen.style.display = 'none';
        if (adminSec) adminSec.style.display = 'flex';
    } else {
        if (adminSec) adminSec.style.display = 'none';
        if (contentSec) contentSec.style.display = 'flex';
        if (welcomeScreen) welcomeScreen.style.display = 'block';
    }
}
