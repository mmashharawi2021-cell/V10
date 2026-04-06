(function () {
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  if (!currentUser) {
    window.location.href = 'login.html';
    return;
  }

  window.currentUser = currentUser;

  function normalizeArabic(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[أإآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/\s+/g, ' ');
  }

  const governorateAliasMap = new Map([
    ['الشمال', 'شمال غزة'],
    ['شمال غزة', 'شمال غزة'],
    ['north gaza', 'شمال غزة'],
    ['northgaza', 'شمال غزة'],
    ['gaza', 'غزة'],
    ['غزه', 'غزة'],
    ['غزة', 'غزة'],
    ['deir al-balah', 'الوسطى'],
    ['deiralbalah', 'الوسطى'],
    ['الوسطي', 'الوسطى'],
    ['الوسطى', 'الوسطى'],
    ['khan yunis', 'خانيونس'],
    ['khanyunis', 'خانيونس'],
    ['خان يونس', 'خانيونس'],
    ['خانيونس', 'خانيونس'],
    ['rafah', 'رفح'],
    ['رفح', 'رفح']
  ]);

  function canonicalGovernorateName(value) {
    const raw = String(value || '').trim();
    const normalized = normalizeArabic(raw);
    return governorateAliasMap.get(raw) || governorateAliasMap.get(normalized) || raw;
  }

  function getDisplayName(user) {
    return user?.name || user?.fullName || user?.username || user?.email || 'مستخدم';
  }

  function getAssignedGovernorateRaw() {
    if (!currentUser || currentUser.role === 'admin') return 'all';
    return currentUser.governorate || currentUser.governorates || 'all';
  }

  function getAssignedGovernoratesList() {
    const assigned = getAssignedGovernorateRaw();
    if (!assigned || assigned === 'all') return [];
    if (Array.isArray(assigned)) {
      return assigned.map(canonicalGovernorateName).filter(Boolean);
    }
    return String(assigned)
      .split(/[,،]/)
      .map((item) => canonicalGovernorateName(item))
      .filter(Boolean);
  }

  function extractGovernorate(featureOrProps) {
    const props = featureOrProps && featureOrProps.properties ? featureOrProps.properties : (featureOrProps || {});
    const candidates = [
      props.Gov,
      props.gov,
      props.governorat,
      props.governorate,
      props.Governorate,
      props.Name_Gov,
      props.name,
      props['المحافظة'],
      props['محافظة']
    ];
    for (const candidate of candidates) {
      if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
        return canonicalGovernorateName(candidate);
      }
    }
    return '';
  }

  function isGovAllowed(governorateValue) {
    const assigned = getAssignedGovernorateRaw();
    if (!assigned || assigned === 'all') return true;
    const allowed = getAssignedGovernoratesList();
    return allowed.includes(canonicalGovernorateName(governorateValue));
  }

  function isFeatureAllowed(feature) {
    return isGovAllowed(extractGovernorate(feature));
  }

  function filterGeoJSONByUser(data) {
    if (!data || !Array.isArray(data.features) || currentUser.role === 'admin') return data;
    return {
      ...data,
      features: data.features.filter((feature) => isFeatureAllowed(feature))
    };
  }

  function hideElement(selector) {
    document.querySelectorAll(selector).forEach((el) => {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    });
  }

  function ensureSessionCard() {
    const existing = document.getElementById('sessionAccessCard');
    if (existing) return;

    const assigned = getAssignedGovernorateRaw();
    const govText = currentUser.role === 'admin'
      ? 'كل المحافظات'
      : (Array.isArray(assigned) ? assigned.join('، ') : assigned || 'غير محدد');

    const wrapper = document.createElement('div');
    wrapper.id = 'sessionAccessCard';
    wrapper.className = 'fixed bottom-4 left-4 z-[9999] glass-panel rounded-2xl shadow-xl border border-white/70 p-3 min-w-[240px] max-w-[90vw]';
    wrapper.innerHTML = `
      <div class="flex items-start gap-3" dir="rtl">
        <div class="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0">
          <i class="fa-solid fa-user-shield"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-extrabold text-gray-800 truncate">${getDisplayName(currentUser)}</div>
          <div class="text-xs text-gray-500 mt-1">${currentUser.role === 'admin' ? 'مسؤول النظام' : 'عرض حسب الصلاحية'}</div>
          <div class="text-xs text-gray-600 mt-1 break-words">المحافظة: ${govText}</div>
        </div>
      </div>
      <button id="logoutBtnFloating" class="mt-3 w-full bg-white/70 hover:bg-white text-red-600 font-bold py-2 rounded-xl transition-all">تسجيل الخروج</button>
    `;
    document.body.appendChild(wrapper);
    wrapper.querySelector('#logoutBtnFloating')?.addEventListener('click', window.logout);
  }

  function applyGovernorateSelectorLock(selector) {
    if (!selector || currentUser.role === 'admin') return;
    const assignedList = getAssignedGovernoratesList();
    if (!assignedList.length) return;

    selector.innerHTML = '';
    if (assignedList.length > 1) {
      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = 'كل المحافظات المسموح بها';
      selector.appendChild(allOption);
    }

    assignedList.forEach((gov) => {
      const option = document.createElement('option');
      option.value = gov;
      option.textContent = gov;
      selector.appendChild(option);
    });

    selector.value = assignedList.length === 1 ? assignedList[0] : 'all';
    selector.disabled = true;
    selector.classList.add('opacity-70', 'cursor-not-allowed');
  }

  function setNavVisibility(id, shouldShow) {
    const el = document.getElementById(id);
    if (!el) return;
    if (shouldShow) {
      el.classList.remove('hidden', 'display-none');
      el.style.display = '';
      el.removeAttribute('aria-hidden');
    } else {
      el.style.display = 'none';
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
    }
  }

  function applyUIPermissions() {
    if (!currentUser) return;

    const isAdmin = currentUser.role === 'admin';
    const permissionValue = (key, defaultValue = true) => {
      if (isAdmin) return true;
      return currentUser[key] === undefined ? defaultValue : currentUser[key] !== false;
    };

    const navMapping = [
      { id: 'nav-home', perm: 'showHome', defaultValue: true },
      { id: 'nav-stats', perm: 'showStats', defaultValue: true },
      { id: 'nav-flow', perm: 'showFlow', defaultValue: true },
      { id: 'nav-style', perm: 'showStyle', defaultValue: true },
      { id: 'nav-personas', perm: 'showPersonas', defaultValue: true },
      { id: 'nav-users', perm: 'canManageUsers', defaultValue: false }
    ];

    navMapping.forEach((item) => {
      setNavVisibility(item.id, permissionValue(item.perm, item.defaultValue));
    });

    const mapToolsMapping = [
      {
        selector: '#btnDrawMarker, #btnDrawLine, #btnDrawPoly, #btnDrawRect, #btnDrawCircle, #btnAddCustomMap',
        perm: 'canDraw'
      },
      {
        selector: '#btnCutMode, #btnDragMode',
        perm: 'canEditGeometry'
      },
      {
        selector: '#btnDeleteMode',
        perm: 'canDeleteGeometry'
      }
    ];

    mapToolsMapping.forEach((item) => {
      if (!permissionValue(item.perm, false)) {
        hideElement(item.selector);
      }
    });

    const canEditData = permissionValue('canEditData', false);
    const canEditStatus = permissionValue('canEditStatus', false);

    if (!canEditData && !canEditStatus) {
      hideElement('#attributesPanel');
      hideElement('#mapEditHint');
    } else {
      const panel = document.getElementById('attributesPanel');
      if (panel) {
        const inputs = panel.querySelectorAll('input');
        inputs.forEach((input) => {
          if (!canEditData) {
            input.disabled = true;
            input.classList.add('opacity-50', 'cursor-not-allowed');
          }
        });

        const statusSelect = panel.querySelector('select');
        if (statusSelect && !canEditStatus) {
          statusSelect.disabled = true;
          statusSelect.classList.add('opacity-50', 'cursor-not-allowed');
        }

        const saveBtn = panel.querySelector('#saveAttributesBtn');
        if (saveBtn && !canEditData && !canEditStatus) {
          saveBtn.style.display = 'none';
        }
      }
    }

    if (!permissionValue('canExport', false)) {
      hideElement('#btnExportPDF');
      hideElement('#btnExportExcel');
    }

    const statsCompareBy = document.getElementById('statsCompareBy');
    if (statsCompareBy) applyGovernorateSelectorLock(statsCompareBy);

    ensureSessionCard();
  }

  window.logout = function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
  };

  window.canEditCurrentUser = function () {
    return currentUser && (currentUser.role === 'admin' || currentUser.canManageUsers === true);
  };
  window.getAssignedGovernorate = function () {
    return getAssignedGovernorateRaw();
  };
  window.getAssignedGovernoratesList = function () {
    return getAssignedGovernoratesList();
  };
  window.normalizeGovernorateName = canonicalGovernorateName;
  window.extractFeatureGovernorate = extractGovernorate;
  window.isGovAllowed = isGovAllowed;
  window.isFeatureAllowed = isFeatureAllowed;
  window.filterGeoJSONByUser = filterGeoJSONByUser;
  window.applyGovernorateSelectorLock = applyGovernorateSelectorLock;
  window.applyUIPermissions = applyUIPermissions;

  document.addEventListener('DOMContentLoaded', () => {
    applyUIPermissions();
  });
})();
