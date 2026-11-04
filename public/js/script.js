// Переменные состояния
let currentUser = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
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

    // Скрытие иконок/кнопок удаления и редактирования в таблицах (CSS класс .action-btn-write)
    const writeActions = document.querySelectorAll('.action-btn-write');
    writeActions.forEach(el => {
        el.style.display = isViewOnly ? 'none' : '';
    });
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
        // Если выбран админ, чекбоксы можно сделать неактивными или автоматически отметить все
        const isAdmin = roleSelect.value === 'admin';
        const checkboxes = permGroup.querySelectorAll('.perm-checkbox');
        checkboxes.forEach(cb => {
            if (isAdmin) cb.checked = true;
        });
    }
}

// Функция входа
function showAuthOverlay(show) {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.style.display = show ? 'flex' : 'none';
}

function logoutSystem() {
    localStorage.removeItem('user');
    location.reload();
}

// Заглушка для смены вкладок
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
