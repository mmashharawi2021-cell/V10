(function () {
  'use strict';

  function qs(id) {
    return document.getElementById(id);
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function showToast(message, type = 'blue') {
    const container = qs('toast-container');
    if (!container) {
      type === 'red' ? alert(message) : console.log(message);
      return;
    }
    const toast = document.createElement('div');
    toast.className = `animate__animated animate__fadeInUp bg-white/90 backdrop-blur-md border-r-4 ${type === 'red' ? 'border-red-500' : 'border-emerald-500'} p-4 rounded-xl shadow-xl flex items-center gap-3 min-w-[250px] z-[20000]`;
    toast.innerHTML = `
      <div class="w-8 h-8 rounded-full ${type === 'red' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'} flex items-center justify-center shrink-0">
        <i class="fa-solid ${type === 'red' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i>
      </div>
      <div class="flex-1 text-sm font-bold text-gray-800">${message}</div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.replace('animate__fadeInUp', 'animate__fadeOutDown');
      setTimeout(() => toast.remove(), 500);
    }, 2500);
  }

  function filterGeoJsonDataForCurrentUser(data) {
    return data;
  }

  function getZoneStyle(feature) {
    const status = feature?.properties?.['حالة الحصر'] || feature?.properties?.['type_statu'] || feature?.properties?.['حالة_الحصر'] || feature?.properties?.Status || '';
    let color = '#94a3b8';
    if (String(status).includes('جديدة')) color = '#3b82f6';
    else if (String(status).includes('الحصر') || String(status).includes('العمل')) color = '#eab308';
    else if (String(status).includes('الانتهاء') || String(status).includes('مكتمل')) color = '#22c55e';
    return { color, weight: 1.5, fillColor: color, fillOpacity: 0.35 };
  }

  document.addEventListener('DOMContentLoaded', () => {
    let layoutMap = null;
    let layoutOverviewMap = null;
    let layoutOverviewRect = null;
    let layoutMapDataLayer = null;
    let layoutOverviewDataLayer = null;
    let isLayoutMapActive = false;

    const pageRoot = qs('style');
    const layoutPaper = qs('layoutPaper');
    const layoutMapOverlay = qs('layoutMapOverlay');
    const layoutMapInstanceDiv = qs('layoutMapInstance');
    const layoutMapActivateText = qs('layoutMapActivateText');
    const layoutCanvasBox = document.querySelector('#style .layout-workspace');
    const layoutLegendContent = qs('layoutLegendContent');

    if (!pageRoot || !layoutPaper) return;

    const PRESETS = {
      'a4-landscape': { width: 1120, height: 793, label: { ar: 'A4 أفقي', en: 'A4 Landscape' } },
      'a4-portrait': { width: 793, height: 1120, label: { ar: 'A4 عمودي', en: 'A4 Portrait' } },
      'a3-landscape': { width: 1320, height: 880, label: { ar: 'A3 أفقي', en: 'A3 Landscape' } },
      'a3-portrait': { width: 930, height: 1320, label: { ar: 'A3 عمودي', en: 'A3 Portrait' } },
      'wide-board': { width: 1500, height: 920, label: { ar: 'لوحة عريضة', en: 'Wide Board' } },
      'custom': { width: 1320, height: 880, label: { ar: 'مخصص', en: 'Custom' } }
    };

    const I18N = {
      ar: {
        navLabel: 'الإخراج الفني',
        pageHeading: 'الإخراج الفني',
        pageSubheading: 'تجهيز الخريطة للطباعة بأسلوب عصري مع جميع ملحقات الإخراج الفني',
        paperTitle: 'خريطة التقسيم الإداري التفصيلية',
        paperSubtitle: 'المرحلة الأولى - دراسة حالة 2026',
        configTitle: 'إعدادات الإخراج الفني',
        configDesc: 'تحكم بأبعاد الورقة والمفتاح وخريطة الموقع العام واللغة.',
        close: 'إغلاق',
        presetLabel: 'مقاس الورقة',
        widthLabel: 'العرض',
        heightLabel: 'الارتفاع',
        applySize: 'تطبيق المقاس',
        overviewSettingsLabel: 'التحكم في خريطة الموقع العام',
        overviewShowMapLabel: 'إظهار الخريطة',
        overviewWidthLabel: 'عرض الخريطة المصغرة',
        overviewHeightLabel: 'ارتفاع الخريطة المصغرة',
        overviewPaddingLabel: 'هامش المشهد حول الإطار',
        overviewExtentLabel: 'إظهار إطار الموقع',
        overviewApply: 'تطبيق إعدادات خريطة الموقع',
        overviewSettingsApplied: 'تم تحديث إعدادات خريطة الموقع العام.',
        languageLabel: 'لغة الصفحة',
        languageHint: 'الترجمة تشمل الواجهة وعناوين عناصر الإخراج الفني.',
        overviewControlLabel: 'عنوان خريطة الموقع العام',
        legendControlLabel: 'عنوان مفتاح الخريطة',
        show: 'إظهار',
        legendItemsLabel: 'عناصر مفتاح الخريطة',
        resetLegendItems: 'إعادة العناصر الافتراضية',
        legendEmpty: 'لا توجد عناصر ظاهرة حاليًا في المفتاح.',
        invalidFile: 'الملف غير صالح.',
        promptUrl: 'أدخل رابط خادم الصور (مثال: https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}):',
        sizeApplied: 'تم تحديث أبعاد الورقة.',
        settingsTitle: 'إعدادات الإخراج الفني',
        northArrow: 'سهم الشمال',
        scaleBar: 'مقياس الرسم',
        legend: 'مفتاح الخريطة',
        resetLayout: 'إعادة الضبط',
        exportImage: 'تصدير صورة PNG',
        uploadGeojson: 'رفع GeoJSON',
        externalXyz: 'إضافة رابط خارجي (XYZ)',
        styleElement: 'تغيير نمط العنصر',
        colorElement: 'تغيير اللون',
        sizeUp: 'تكبير الحجم',
        sizeDown: 'تصغير الحجم',
        rotateElement: 'تدوير العنصر (45 درجة)',
        applyChanges: 'تطبيق التغييرات',
        pageSettings: 'إعدادات الإخراج الفني',
        hideElement: 'إخفاء / حذف',
        zoomIn: 'تكبير',
        zoomOut: 'تصغير',
        fullscreen: 'ملء الشاشة',
        overviewReset: 'إعادة ضبط المشهد',
        mapActivate: 'انقر لتفعيل الخريطة للسحب والتكبير (Pan/Zoom)',
        uploadedLayer: 'طبقة مرفوعة',
        externalLayer: 'طبقة XYZ خارجية',
        paperBadgeCustom: 'مخصص',
      },
      en: {
        navLabel: 'Cartographic Output',
        pageHeading: 'Cartographic Output',
        pageSubheading: 'Prepare the map layout for professional print output with full cartographic elements.',
        paperTitle: 'Detailed Administrative Division Map',
        paperSubtitle: 'Phase One - Case Study 2026',
        configTitle: 'Layout Settings',
        configDesc: 'Control paper size, legend, overview map title, and language.',
        close: 'Close',
        presetLabel: 'Paper Size',
        widthLabel: 'Width',
        heightLabel: 'Height',
        applySize: 'Apply Size',
        overviewSettingsLabel: 'Overview map controls',
        overviewShowMapLabel: 'Show map',
        overviewWidthLabel: 'Overview width',
        overviewHeightLabel: 'Overview height',
        overviewPaddingLabel: 'View padding around extent',
        overviewExtentLabel: 'Show extent frame',
        overviewApply: 'Apply overview settings',
        overviewSettingsApplied: 'Overview map settings updated.',
        languageLabel: 'Page Language',
        languageHint: 'Translation covers the interface and cartographic element titles.',
        overviewControlLabel: 'Overview map title',
        legendControlLabel: 'Legend title',
        show: 'Show',
        legendItemsLabel: 'Legend items',
        resetLegendItems: 'Reset default items',
        legendEmpty: 'No visible items in the legend right now.',
        invalidFile: 'Invalid file.',
        promptUrl: 'Enter an imagery server URL (example: https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}):',
        sizeApplied: 'Paper size updated.',
        settingsTitle: 'Layout Settings',
        northArrow: 'North Arrow',
        scaleBar: 'Scale Bar',
        legend: 'Legend',
        resetLayout: 'Reset layout',
        exportImage: 'Export PNG',
        uploadGeojson: 'Upload GeoJSON',
        externalXyz: 'Add external XYZ layer',
        styleElement: 'Cycle element style',
        colorElement: 'Change color',
        sizeUp: 'Increase size',
        sizeDown: 'Decrease size',
        rotateElement: 'Rotate element (45°)',
        applyChanges: 'Apply changes',
        pageSettings: 'Layout settings',
        hideElement: 'Hide / Delete',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        fullscreen: 'Fullscreen',
        overviewReset: 'Reset overview',
        mapActivate: 'Click to activate map pan and zoom',
        uploadedLayer: 'Uploaded layer',
        externalLayer: 'External XYZ layer',
        paperBadgeCustom: 'Custom',
      }
    };

    const defaultLegendItems = [
      { key: 'new', type: 'swatch', visible: true, colorClasses: 'bg-blue-500 border border-white/50 shadow-sm', label: { ar: 'مناطق حصر جديدة', en: 'New Survey Zones' } },
      { key: 'progress', type: 'swatch', visible: true, colorClasses: 'bg-yellow-500 border border-white/50 shadow-sm', label: { ar: 'قيد الحصر', en: 'In Progress' } },
      { key: 'done', type: 'swatch', visible: true, colorClasses: 'bg-green-500 border border-white/50 shadow-sm', label: { ar: 'تم الانتهاء', en: 'Completed' } },
      { key: 'gov', type: 'swatch', visible: true, colorClasses: 'bg-white border border-gray-900 shadow-sm', label: { ar: 'حدود المحافظات', en: 'Governorate Boundaries' } },
      { key: 'basemap', type: 'icon', visible: true, iconClass: 'fa-solid fa-satellite text-blue-500', label: { ar: 'صورة فضائية أساسية', en: 'Satellite Basemap' } }
    ];

    const state = {
      lang: (localStorage.getItem('site_lang') === 'en' ? 'en' : 'ar'),
      paperWidth: PRESETS['a3-landscape'].width,
      paperHeight: PRESETS['a3-landscape'].height,
      overviewVisible: true,
      overviewWidth: 320,
      overviewHeight: 140,
      overviewPadding: 12,
      overviewExtentVisible: true,
      overviewTitleVisible: true,
      legendTitleVisible: true,
      overviewTitle: { ar: 'خريطة الموقع العام', en: 'Overview Map' },
      legendTitle: { ar: 'مفتاح الخريطة', en: 'Legend' },
      legendItems: deepClone(defaultLegendItems),
      extraLegendItems: []
    };

    const northArrowStyles = [
      `<g id="northArrowShape1"><polygon points="50,5 65,45 50,85 35,45" fill="var(--na-color, #1f2937)" /><polygon points="50,5 50,85 35,45" fill="var(--na-color-light, #9ca3af)" /></g><text x="50" y="98" font-family="'Cairo', sans-serif" font-size="20" font-weight="900" text-anchor="middle" fill="var(--na-color, #1f2937)">N</text>`,
      `<g id="northArrowShape2"><path d="M50 5 L25 45 L40 45 L40 95 L60 95 L60 45 L75 45 Z" fill="var(--na-color, #1f2937)"/></g>`,
      `<g id="northArrowShape3"><circle cx="50" cy="50" r="45" fill="none" stroke="var(--na-color, #1f2937)" stroke-width="3"/><polygon points="50,5 65,50 50,95 35,50" fill="var(--na-color, #1f2937)" /><polygon points="50,5 50,95 35,50" fill="var(--na-color-light, #9ca3af)" /></g>`,
      `<g id="northArrowShape4"><path d="M50 10 L80 85 L50 70 L20 85 Z" fill="var(--na-color, #1f2937)"/><path d="M50 10 L50 70 L20 85 Z" fill="var(--na-color-light, #9ca3af)"/></g><text x="50" y="98" font-family="'Cairo', sans-serif" font-size="16" font-weight="900" text-anchor="middle" fill="var(--na-color, #1f2937)">N</text>`,
      `<text x="50" y="80" font-family="'Times New Roman', serif" font-size="85" font-weight="900" text-anchor="middle" fill="var(--na-color, #1f2937)">N</text>`
    ];

    const refs = {
      navStyleLabel: qs('navStyleLabel'),
      pageHeading: qs('stylePageHeading'),
      pageSubheading: qs('stylePageSubheading'),
      paperTitle: qs('layoutPaperTitle'),
      paperSubtitle: qs('layoutPaperSubtitle'),
      legendTitleText: qs('layoutLegendTitleText'),
      legendHeading: qs('layoutLegendHeading'),
      overviewTitleBar: qs('layoutOverviewTitleBar'),
      overviewTitleText: qs('layoutOverviewTitleText'),
      currentPaperBadge: qs('layoutCurrentPaperBadge'),
      configPanel: qs('layoutConfigPanel'),
      configToggleBtn: qs('layoutConfigToggleBtn'),
      configCloseBtn: qs('layoutConfigCloseBtn'),
      configTitle: qs('layoutConfigTitle'),
      configDesc: qs('layoutConfigDesc'),
      presetLabel: qs('layoutPresetLabel'),
      widthLabel: qs('layoutWidthLabel'),
      heightLabel: qs('layoutHeightLabel'),
      languageLabel: qs('layoutLanguageLabel'),
      languageHint: qs('layoutLanguageHint'),
      overviewControlLabel: qs('layoutOverviewControlLabel'),
      legendControlLabel: qs('layoutLegendControlLabel'),
      showOverviewLabel: qs('layoutShowLabelOverview'),
      showLegendLabel: qs('layoutShowLabelLegend'),
      legendItemsLabel: qs('layoutLegendItemsLabel'),
      legendResetBtn: qs('layoutLegendResetBtn'),
      presetSelect: qs('layoutPresetSelect'),
      paperWidthInput: qs('layoutPaperWidthInput'),
      paperHeightInput: qs('layoutPaperHeightInput'),
      paperWidthRange: qs('layoutPaperWidthRange'),
      paperHeightRange: qs('layoutPaperHeightRange'),
      paperWidthValue: qs('layoutPaperWidthValue'),
      paperHeightValue: qs('layoutPaperHeightValue'),
      applyPaperSizeBtn: qs('applyPaperSizeBtn'),
      overviewTitleInput: qs('layoutOverviewTitleInput'),
      overviewTitleToggle: qs('layoutOverviewTitleToggle'),
      overviewSettingsLabel: qs('layoutOverviewSettingsLabel'),
      overviewToggle: qs('layoutOverviewToggle'),
      overviewShowMapLabel: qs('layoutOverviewShowMapLabel'),
      overviewWidthLabel: qs('layoutOverviewWidthLabel'),
      overviewHeightLabel: qs('layoutOverviewHeightLabel'),
      overviewPaddingLabel: qs('layoutOverviewPaddingLabel'),
      overviewExtentLabel: qs('layoutOverviewExtentLabel'),
      overviewWidthInput: qs('layoutOverviewWidthInput'),
      overviewHeightInput: qs('layoutOverviewHeightInput'),
      overviewPaddingInput: qs('layoutOverviewPaddingInput'),
      overviewPaddingValue: qs('layoutOverviewPaddingValue'),
      overviewExtentToggle: qs('layoutOverviewExtentToggle'),
      overviewApplyBtn: qs('layoutOverviewApplyBtn'),
      legendTitleInput: qs('layoutLegendTitleInput'),
      legendTitleToggle: qs('layoutLegendTitleToggle'),
      legendItemsEditor: qs('layoutLegendItemsEditor'),
      langArBtn: qs('layoutLangArBtn'),
      langEnBtn: qs('layoutLangEnBtn'),
      panelLangArBtn: qs('panelLangArBtn'),
      panelLangEnBtn: qs('panelLangEnBtn'),
      propCycleStyleBtn: qs('propCycleStyleBtn'),
      propColorPicker: qs('propColorPicker'),
      propSizeIncBtn: qs('propSizeIncBtn'),
      propSizeDecBtn: qs('propSizeDecBtn'),
      propRotateBtn: qs('propRotateBtn'),
      propDeleteBtn: qs('propDeleteBtn'),
      propApplyBtn: qs('propApplyBtn'),
      layoutZoomInBtn: qs('layoutZoomInBtn'),
      layoutZoomOutBtn: qs('layoutZoomOutBtn'),
      layoutFullscreenBtn: qs('layoutFullscreenBtn'),
      layoutOverviewResetBtn: qs('layoutOverviewResetBtn'),
      btnAddLayoutNorthArrow: qs('btnAddLayoutNorthArrow'),
      btnAddLayoutScaleBar: qs('btnAddLayoutScaleBar'),
      btnAddLayoutLegend: qs('btnAddLayoutLegend'),
      layoutResetBtn: qs('layoutResetBtn'),
      btnExportPDF: qs('btnExportPDF'),
      layoutGeoJsonInput: qs('layoutGeoJsonInput'),
      layoutUrlBtn: qs('layoutUrlBtn'),
      layoutNorthArrow: qs('layoutNorthArrow'),
      layoutScaleBar: qs('layoutScaleBar'),
      layoutLegend: qs('layoutLegend'),
      layoutOverviewMap: qs('layoutOverviewMap'),
      layoutOverviewWrapper: qs('layoutOverviewWrapper'),
      legendContent: qs('layoutLegendContent'),
      northArrowSvg: qs('northArrowSvg'),
      footerGrid: pageRoot.querySelector('.layout-footer-grid')
    };

    if (refs.layoutOverviewWrapper) {
      state.overviewWidth = refs.layoutOverviewWrapper.offsetWidth || state.overviewWidth;
      state.overviewHeight = refs.layoutOverviewWrapper.offsetHeight || state.overviewHeight;
    }

    function t(key) {
      return I18N[state.lang][key] || key;
    }

    function getLegendLabel(item) {
      if (!item) return '';
      if (typeof item.label === 'string') return item.label;
      return item.label?.[state.lang] || item.label?.ar || item.label?.en || '';
    }

    function escapeHtml(value = '') {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function getCurrentPresetKey() {
      const match = Object.entries(PRESETS).find(([key, preset]) => key !== 'custom' && preset.width === state.paperWidth && preset.height === state.paperHeight);
      return match ? match[0] : 'custom';
    }

    function updatePaperBadge() {
      const key = getCurrentPresetKey();
      const presetLabel = key === 'custom' ? t('paperBadgeCustom') : PRESETS[key].label[state.lang];
      if (refs.currentPaperBadge) {
        refs.currentPaperBadge.textContent = `${presetLabel} · ${state.paperWidth}×${state.paperHeight}`;
      }
      if (refs.presetSelect) refs.presetSelect.value = key;
      if (refs.paperWidthInput) refs.paperWidthInput.value = state.paperWidth;
      if (refs.paperHeightInput) refs.paperHeightInput.value = state.paperHeight;
      if (refs.paperWidthRange) refs.paperWidthRange.value = state.paperWidth;
      if (refs.paperHeightRange) refs.paperHeightRange.value = state.paperHeight;
      if (refs.paperWidthValue) refs.paperWidthValue.textContent = state.paperWidth;
      if (refs.paperHeightValue) refs.paperHeightValue.textContent = state.paperHeight;
    }

    function applyPaperSize(width, height, silent = false) {
      const nextWidth = Math.max(700, Math.min(1800, parseInt(width, 10) || PRESETS['a3-landscape'].width));
      const nextHeight = Math.max(500, Math.min(1500, parseInt(height, 10) || PRESETS['a3-landscape'].height));
      state.paperWidth = nextWidth;
      state.paperHeight = nextHeight;
      pageRoot.style.setProperty('--layout-paper-width', `${nextWidth}px`);
      pageRoot.style.setProperty('--layout-paper-height', `${nextHeight}px`);
      updatePaperBadge();
      setTimeout(() => {
        if (layoutMap) layoutMap.invalidateSize();
        if (layoutOverviewMap) layoutOverviewMap.invalidateSize();
        fitLayoutOverviewToMain();
      }, 120);
      if (!silent) showToast(t('sizeApplied'));
    }

    function ensureOverviewExtentRect() {
      if (!layoutMap || !layoutOverviewMap) return;
      if (!state.overviewExtentVisible) {
        if (layoutOverviewRect && layoutOverviewMap.hasLayer(layoutOverviewRect)) {
          layoutOverviewMap.removeLayer(layoutOverviewRect);
        }
        layoutOverviewRect = null;
        return;
      }
      if (!layoutOverviewRect) {
        layoutOverviewRect = L.rectangle(layoutMap.getBounds(), {
          color: '#dc2626',
          weight: 2,
          fillColor: '#dc2626',
          fillOpacity: 0.15,
          interactive: false
        }).addTo(layoutOverviewMap);
      }
      layoutOverviewRect.setBounds(layoutMap.getBounds());
    }

    function applyOverviewSettings(options = {}, silent = false) {
      if (typeof options.visible === 'boolean') state.overviewVisible = options.visible;
      const maxOverviewWidth = Math.max(220, Math.min(700, Math.floor(state.paperWidth * 0.46)));
      if (options.width !== undefined) state.overviewWidth = Math.max(180, Math.min(maxOverviewWidth, parseInt(options.width, 10) || state.overviewWidth));
      if (options.height !== undefined) state.overviewHeight = Math.max(100, Math.min(360, parseInt(options.height, 10) || state.overviewHeight));
      if (options.padding !== undefined) state.overviewPadding = Math.max(0, Math.min(160, parseInt(options.padding, 10) || state.overviewPadding));
      if (typeof options.extentVisible === 'boolean') state.overviewExtentVisible = options.extentVisible;

      if (refs.layoutOverviewWrapper) {
        refs.layoutOverviewWrapper.classList.toggle('hidden', !state.overviewVisible);
        refs.layoutOverviewWrapper.style.width = `${state.overviewWidth}px`;
        refs.layoutOverviewWrapper.style.flex = `0 0 ${state.overviewWidth}px`;
        refs.layoutOverviewWrapper.style.height = `${state.overviewHeight}px`;
        refs.layoutOverviewWrapper.style.minHeight = `${state.overviewHeight}px`;
        refs.layoutOverviewWrapper.style.maxHeight = `${state.overviewHeight}px`;
      }
      if (refs.footerGrid) {
        refs.footerGrid.style.height = `${Math.max(140, state.overviewHeight)}px`;
        refs.footerGrid.style.minHeight = `${Math.max(140, state.overviewHeight)}px`;
      }
      if (refs.overviewToggle) refs.overviewToggle.checked = state.overviewVisible;
      if (refs.overviewWidthInput) { refs.overviewWidthInput.max = maxOverviewWidth; refs.overviewWidthInput.value = state.overviewWidth; }
      if (refs.overviewHeightInput) refs.overviewHeightInput.value = state.overviewHeight;
      if (refs.overviewPaddingInput) refs.overviewPaddingInput.value = state.overviewPadding;
      if (refs.overviewPaddingValue) refs.overviewPaddingValue.textContent = state.overviewPadding;
      if (refs.overviewExtentToggle) refs.overviewExtentToggle.checked = state.overviewExtentVisible;

      setTimeout(() => {
        if (layoutOverviewMap) layoutOverviewMap.invalidateSize();
        fitLayoutOverviewToMain();
        ensureOverviewExtentRect();
      }, 100);

      if (!silent) showToast(t('overviewSettingsApplied'));
    }

    function renderLegend() {
      if (!layoutLegendContent) return;
      const items = [];

      state.legendItems.filter(item => item.visible).forEach(item => {
        if (item.type === 'icon') {
          items.push(`
            <div class="flex items-center gap-2 mt-1 col-span-2">
              <i class="${item.iconClass}"></i>
              <span class="text-xs font-semibold text-gray-700">${escapeHtml(getLegendLabel(item))}</span>
            </div>
          `);
        } else {
          items.push(`
            <div class="flex items-center gap-2">
              <div class="w-4 h-4 rounded ${item.colorClasses}"></div>
              <span class="text-xs font-semibold text-gray-700">${escapeHtml(getLegendLabel(item))}</span>
            </div>
          `);
        }
      });

      state.extraLegendItems.forEach(item => {
        if (item.type === 'icon') {
          items.push(`
            <div class="flex items-center gap-2 mt-1 col-span-2">
              <i class="${item.iconClass}"></i>
              <span class="text-xs font-semibold text-gray-700">${escapeHtml(getLegendLabel(item))}</span>
            </div>
          `);
        } else {
          items.push(`
            <div class="flex items-center gap-2 ${item.fullWidth ? 'col-span-2' : ''}">
              <div class="w-4 h-4 rounded ${item.colorClasses}"></div>
              <span class="text-xs font-semibold text-gray-700">${escapeHtml(getLegendLabel(item))}</span>
            </div>
          `);
        }
      });

      if (!items.length) {
        layoutLegendContent.innerHTML = `<div class="layout-legend-empty text-xs text-gray-500 w-full col-span-2 text-center py-2">${t('legendEmpty')}</div>`;
      } else {
        layoutLegendContent.innerHTML = items.join('');
      }

      updateLegendTitleDisplay();
    }

    function renderLegendEditor() {
      if (!refs.legendItemsEditor) return;
      refs.legendItemsEditor.innerHTML = state.legendItems.map((item, index) => `
        <div class="layout-legend-row">
          <label class="inline-flex items-center gap-2 shrink-0 text-sm font-semibold text-slate-600">
            <input type="checkbox" data-legend-visible="${index}" ${item.visible ? 'checked' : ''}>
            <span>${t('show')}</span>
          </label>
          <div class="layout-legend-chip ${item.type === 'icon' ? 'layout-legend-chip--icon' : ''}">
            ${item.type === 'icon' ? `<i class="${item.iconClass}"></i>` : `<span class="layout-legend-swatch ${item.colorClasses}"></span>`}
          </div>
          <input type="text" class="layout-config-input" data-legend-label="${index}" value="${escapeHtml(getLegendLabel(item))}">
        </div>
      `).join('');
    }

    function updateOverviewTitleDisplay() {
      if (refs.overviewTitleBar) refs.overviewTitleBar.classList.toggle('hidden', !state.overviewTitleVisible);
      if (refs.overviewTitleText) refs.overviewTitleText.textContent = state.overviewTitle[state.lang];
      if (refs.overviewTitleInput) refs.overviewTitleInput.value = state.overviewTitle[state.lang];
      if (refs.overviewTitleToggle) refs.overviewTitleToggle.checked = state.overviewTitleVisible;
    }

    function updateLegendTitleDisplay() {
      if (refs.legendHeading) refs.legendHeading.classList.toggle('hidden', !state.legendTitleVisible);
      if (refs.legendTitleText) refs.legendTitleText.textContent = state.legendTitle[state.lang];
      if (refs.legendTitleInput) refs.legendTitleInput.value = state.legendTitle[state.lang];
      if (refs.legendTitleToggle) refs.legendTitleToggle.checked = state.legendTitleVisible;
    }

    function applyLocalizedDefaults(force = false) {
      const paperTitleEl = refs.paperTitle;
      const paperSubtitleEl = refs.paperSubtitle;
      const titles = [I18N.ar.paperTitle, I18N.en.paperTitle];
      const subtitles = [I18N.ar.paperSubtitle, I18N.en.paperSubtitle];
      if (paperTitleEl && (force || titles.includes(paperTitleEl.textContent.trim()))) {
        paperTitleEl.textContent = I18N[state.lang].paperTitle;
      }
      if (paperSubtitleEl && (force || subtitles.includes(paperSubtitleEl.textContent.trim()))) {
        paperSubtitleEl.textContent = I18N[state.lang].paperSubtitle;
      }
    }

    function updatePresetOptions() {
      if (!refs.presetSelect) return;
      Array.from(refs.presetSelect.options).forEach(option => {
        const preset = PRESETS[option.value];
        if (preset) option.textContent = preset.label[state.lang];
      });
    }

    function updateToolTitles() {
      const mapping = [
        [refs.layoutGeoJsonInput?.parentElement, 'uploadGeojson'],
        [refs.layoutUrlBtn, 'externalXyz'],
        [refs.btnAddLayoutNorthArrow, 'northArrow'],
        [refs.btnAddLayoutScaleBar, 'scaleBar'],
        [refs.btnAddLayoutLegend, 'legend'],
        [refs.layoutResetBtn, 'resetLayout'],
        [refs.btnExportPDF, 'exportImage'],
        [refs.propCycleStyleBtn, 'styleElement'],
        [refs.propColorPicker, 'colorElement'],
        [refs.propSizeIncBtn, 'sizeUp'],
        [refs.propSizeDecBtn, 'sizeDown'],
        [refs.propRotateBtn, 'rotateElement'],
        [refs.propApplyBtn, 'applyChanges'],
        [refs.configToggleBtn, 'pageSettings'],
        [refs.propDeleteBtn, 'hideElement'],
        [refs.layoutZoomInBtn, 'zoomIn'],
        [refs.layoutZoomOutBtn, 'zoomOut'],
        [refs.layoutFullscreenBtn, 'fullscreen'],
        [refs.layoutOverviewResetBtn, 'overviewReset']
      ];
      mapping.forEach(([el, key]) => {
        if (el) el.title = t(key);
      });
      if (layoutMapActivateText) layoutMapActivateText.innerHTML = `${t('mapActivate')} <i class="fa-solid fa-hand-pointer ml-2"></i>`;
    }

    function applyLanguage(lang) {
      state.lang = lang === 'en' ? 'en' : 'ar';
      pageRoot.dataset.lang = state.lang;

      if (refs.navStyleLabel) refs.navStyleLabel.textContent = t('navLabel');
      if (refs.pageHeading) refs.pageHeading.textContent = t('pageHeading');
      if (refs.pageSubheading) refs.pageSubheading.textContent = t('pageSubheading');
      if (refs.configTitle) refs.configTitle.textContent = t('configTitle');
      if (refs.configDesc) refs.configDesc.textContent = t('configDesc');
      if (refs.configCloseBtn) refs.configCloseBtn.textContent = t('close');
      if (refs.presetLabel) refs.presetLabel.textContent = t('presetLabel');
      if (refs.widthLabel) refs.widthLabel.textContent = t('widthLabel');
      if (refs.heightLabel) refs.heightLabel.textContent = t('heightLabel');
      if (refs.applyPaperSizeBtn) refs.applyPaperSizeBtn.textContent = t('applySize');
      if (refs.languageLabel) refs.languageLabel.textContent = t('languageLabel');
      if (refs.languageHint) refs.languageHint.textContent = t('languageHint');
      if (refs.overviewControlLabel) refs.overviewControlLabel.textContent = t('overviewControlLabel');
      if (refs.overviewSettingsLabel) refs.overviewSettingsLabel.textContent = t('overviewSettingsLabel');
      if (refs.overviewShowMapLabel) refs.overviewShowMapLabel.textContent = t('overviewShowMapLabel');
      if (refs.overviewWidthLabel) refs.overviewWidthLabel.textContent = t('overviewWidthLabel');
      if (refs.overviewHeightLabel) refs.overviewHeightLabel.textContent = t('overviewHeightLabel');
      if (refs.overviewPaddingLabel) refs.overviewPaddingLabel.textContent = t('overviewPaddingLabel');
      if (refs.overviewExtentLabel) refs.overviewExtentLabel.textContent = t('overviewExtentLabel');
      if (refs.overviewApplyBtn) refs.overviewApplyBtn.textContent = t('overviewApply');
      if (refs.legendControlLabel) refs.legendControlLabel.textContent = t('legendControlLabel');
      if (refs.showOverviewLabel) refs.showOverviewLabel.textContent = t('show');
      if (refs.showLegendLabel) refs.showLegendLabel.textContent = t('show');
      if (refs.legendItemsLabel) refs.legendItemsLabel.textContent = t('legendItemsLabel');
      if (refs.legendResetBtn) refs.legendResetBtn.textContent = t('resetLegendItems');
      if (refs.panelLangArBtn) refs.panelLangArBtn.textContent = state.lang === 'ar' ? 'العربية' : 'Arabic';
      if (refs.panelLangEnBtn) refs.panelLangEnBtn.textContent = 'English';

      updatePresetOptions();
      updatePaperBadge();
      applyOverviewSettings({}, true);
      updateOverviewTitleDisplay();
      updateLegendTitleDisplay();
      applyLocalizedDefaults();
      renderLegend();
      renderLegendEditor();
      updateToolTitles();

      [refs.langArBtn, refs.panelLangArBtn].forEach(btn => btn && btn.classList.toggle('active', state.lang === 'ar'));
      [refs.langEnBtn, refs.panelLangEnBtn].forEach(btn => btn && btn.classList.toggle('active', state.lang === 'en'));
    }

    function addExtraLegendItem(item) {
      const exists = state.extraLegendItems.find(entry => entry.key === item.key);
      if (!exists) state.extraLegendItems.push(item);
      renderLegend();
    }

    function syncLayoutOverview() {
      if (!layoutMap || !layoutOverviewMap) return;
      ensureOverviewExtentRect();
    }

    function fitLayoutOverviewToMain() {
      if (!layoutMap || !layoutOverviewMap || !state.overviewVisible) return;
      layoutOverviewMap.fitBounds(layoutMap.getBounds(), { padding: [state.overviewPadding, state.overviewPadding] });
      syncLayoutOverview();
    }

    async function loadLayoutDefaultLayers() {
      if (!layoutMap || layoutMapDataLayer) return;
      try {
        const [govRes, zoneRes] = await Promise.all([fetch('gov.geojson'), fetch('zone.geojson')]);
        let [govData, zoneData] = await Promise.all([govRes.json(), zoneRes.json()]);
        govData = filterGeoJsonDataForCurrentUser(govData, 'gov');
        zoneData = filterGeoJsonDataForCurrentUser(zoneData, 'zone');

        const govStyle = { color: '#2c3e50', weight: 4, fillOpacity: 0.05, interactive: false };
        const zoneLayer = L.geoJSON(zoneData, { style: getZoneStyle });
        const govLayer = L.geoJSON(govData, { style: govStyle });
        layoutMapDataLayer = L.featureGroup([zoneLayer, govLayer]).addTo(layoutMap);

        if (layoutOverviewDataLayer && layoutOverviewMap.hasLayer(layoutOverviewDataLayer)) {
          layoutOverviewMap.removeLayer(layoutOverviewDataLayer);
        }
        layoutOverviewDataLayer = L.featureGroup([
          L.geoJSON(govData, { style: govStyle }),
          L.geoJSON(zoneData, { style: getZoneStyle })
        ]).addTo(layoutOverviewMap);

        const bounds = layoutMapDataLayer.getBounds();
        if (bounds.isValid()) {
          layoutMap.fitBounds(bounds, { padding: [20, 20] });
          layoutOverviewMap.fitBounds(bounds, { padding: [10, 10] });
        }

        ensureOverviewExtentRect();

        renderLegend();
        updateLayoutScaleBar();
        syncLayoutOverview();
      } catch (err) {
        console.error('Layout default layers error:', err);
      }
    }

    function initLayoutMap() {
      if (layoutMap !== null) {
        setTimeout(() => {
          layoutMap.invalidateSize();
          if (layoutOverviewMap) layoutOverviewMap.invalidateSize();
          fitLayoutOverviewToMain();
        }, 150);
        return;
      }

      const layoutMapEl = qs('layoutMapInstance');
      const layoutOverviewEl = qs('layoutOverviewMap');
      if (!layoutMapEl || !layoutOverviewEl) return;

      layoutMap = L.map(layoutMapEl, { zoomControl: false, attributionControl: false }).setView([31.3547, 34.3088], 11);
      layoutOverviewMap = L.map(layoutOverviewEl, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false,
        touchZoom: false
      }).setView([31.3547, 34.3088], 9);

      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
      }).addTo(layoutMap);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(layoutOverviewMap);

      layoutMap.on('zoomend moveend', () => {
        updateLayoutScaleBar();
        syncLayoutOverview();
      });

      loadLayoutDefaultLayers();

      setTimeout(() => {
        layoutMap.invalidateSize();
        layoutOverviewMap.invalidateSize();
        fitLayoutOverviewToMain();
      }, 200);
    }

    function updateLayoutScaleBar() {
      if (!layoutMap) return;
      const centerD = layoutMap.getSize().y / 2;
      const centerPoint = layoutMap.containerPointToLatLng([0, centerD]);
      const rightPoint = layoutMap.containerPointToLatLng([100, centerD]);
      const distanceMeters = centerPoint.distanceTo(rightPoint);
      const scaleTextValue = qs('scaleTextValue');
      const scaleBarLabels = qs('scaleBarLabels');

      if (scaleTextValue && scaleBarLabels) {
        const pixelsToMetersRatio = distanceMeters / 100;
        const mapScale = Math.round((pixelsToMetersRatio * window.devicePixelRatio * 96 * 39.37));
        scaleTextValue.innerText = `1:${mapScale.toLocaleString()}`;

        const visualWidthMeters = distanceMeters * (192 / 100);
        let unit = 'm';
        let displayVal = Math.round(visualWidthMeters);

        if (displayVal > 1000) {
          displayVal = (displayVal / 1000).toFixed(1);
          unit = 'km';
        }

        scaleBarLabels.innerHTML = `
          <span>0</span>
          <span>${(displayVal / 2).toFixed(1)}</span>
          <span>${displayVal} ${unit}</span>
        `;
      }
    }

    function bindLayoutToggle(button, target) {
      if (!button || !target) return;
      button.addEventListener('click', () => {
        const isHidden = target.classList.toggle('hidden');
        button.classList.toggle('ring-2', !isHidden);
        button.classList.toggle('ring-blue-400', !isHidden);
      });
    }

    function setupDraggableLayoutElements() {
      const draggables = document.querySelectorAll('.layout-draggable');
      let activeEl = null;
      let startX = 0;
      let startY = 0;
      let initX = 0;
      let initY = 0;

      draggables.forEach(el => {
        el.addEventListener('mousedown', (e) => {
          document.querySelectorAll('.layout-draggable').forEach(d => d.classList.remove('outline', 'outline-2', 'outline-blue-500'));
          el.classList.add('outline', 'outline-2', 'outline-blue-500');
          activeEl = el;
          startX = e.clientX;
          startY = e.clientY;
          const compStyle = window.getComputedStyle(el);
          initX = parseInt(compStyle.left, 10) || 0;
          initY = parseInt(compStyle.top, 10) || 0;
          el.style.right = 'auto';
          el.style.bottom = 'auto';
          if (el.style.left === 'auto' || el.style.left === '') {
            el.style.left = `${el.offsetLeft}px`;
            initX = el.offsetLeft;
          }
          if (el.style.top === 'auto' || el.style.top === '') {
            el.style.top = `${el.offsetTop}px`;
            initY = el.offsetTop;
          }
          document.addEventListener('mousemove', onDragMove);
          document.addEventListener('mouseup', onDragEnd);
          e.stopPropagation();
        });
      });

      function onDragMove(e) {
        if (!activeEl) return;
        e.preventDefault();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let newX = initX + dx;
        let newY = initY + dy;
        const parentRect = activeEl.parentElement.getBoundingClientRect();

        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        if (newX + activeEl.offsetWidth > parentRect.width) newX = parentRect.width - activeEl.offsetWidth;
        if (newY + activeEl.offsetHeight > parentRect.height) newY = parentRect.height - activeEl.offsetHeight;

        activeEl.style.left = `${newX}px`;
        activeEl.style.top = `${newY}px`;
      }

      function onDragEnd() {
        activeEl = null;
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
      }
    }

    function toggleConfigPanel(force) {
      if (!refs.configPanel) return;
      const shouldOpen = typeof force === 'boolean' ? force : refs.configPanel.classList.contains('hidden');
      refs.configPanel.classList.toggle('hidden', !shouldOpen);
      if (shouldOpen) {
        refs.configPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    function resetLegendItemsToDefault() {
      state.legendItems = deepClone(defaultLegendItems);
      state.extraLegendItems = [];
      renderLegendEditor();
      renderLegend();
    }

    function fullReset() {
      state.overviewVisible = true;
      state.overviewWidth = 320;
      state.overviewHeight = 140;
      state.overviewPadding = 12;
      state.overviewExtentVisible = true;
      state.overviewTitleVisible = true;
      state.legendTitleVisible = true;
      state.overviewTitle = { ar: 'خريطة الموقع العام', en: 'Overview Map' };
      state.legendTitle = { ar: 'مفتاح الخريطة', en: 'Legend' };
      resetLegendItemsToDefault();
      applyPaperSize(PRESETS['a3-landscape'].width, PRESETS['a3-landscape'].height, true);
      applyOverviewSettings({}, true);
      updateOverviewTitleDisplay();
      updateLegendTitleDisplay();
      applyLocalizedDefaults(true);

      if (refs.layoutNorthArrow) {
        refs.layoutNorthArrow.style.left = '';
        refs.layoutNorthArrow.style.top = '';
        refs.layoutNorthArrow.style.right = '20px';
        refs.layoutNorthArrow.style.bottom = 'auto';
        refs.layoutNorthArrow.style.transform = '';
        refs.layoutNorthArrow.style.width = '';
        refs.layoutNorthArrow.style.height = '';
        refs.layoutNorthArrow.classList.remove('hidden');
      }
      if (refs.layoutScaleBar) {
        refs.layoutScaleBar.style.left = '20px';
        refs.layoutScaleBar.style.top = 'auto';
        refs.layoutScaleBar.style.right = 'auto';
        refs.layoutScaleBar.style.bottom = '20px';
        refs.layoutScaleBar.classList.remove('hidden');
      }
      if (refs.layoutLegend) {
        refs.layoutLegend.style.left = '';
        refs.layoutLegend.style.top = '';
        refs.layoutLegend.style.right = '';
        refs.layoutLegend.style.bottom = '';
        refs.layoutLegend.classList.remove('hidden');
      }
      [refs.btnAddLayoutNorthArrow, refs.btnAddLayoutScaleBar, refs.btnAddLayoutLegend].forEach(btn => btn && btn.classList.remove('ring-2', 'ring-blue-400'));
      document.querySelectorAll('.layout-draggable').forEach(d => d.classList.remove('outline', 'outline-2', 'outline-blue-500'));

      if (refs.propColorPicker) refs.propColorPicker.value = '#1f2937';
      if (refs.northArrowSvg) refs.northArrowSvg.innerHTML = northArrowStyles[0];
      currentNaStyleIndex = 0;
      currentNaScale = 1.0;
      currentNaRotation = 0;
      updateNaTransform();

      if (layoutMap && layoutMapDataLayer) {
        const bounds = layoutMapDataLayer.getBounds();
        if (bounds && bounds.isValid()) {
          layoutMap.fitBounds(bounds, { padding: [20, 20] });
          if (layoutOverviewMap) layoutOverviewMap.fitBounds(bounds, { padding: [10, 10] });
        }
      }
      updateLayoutScaleBar();
      syncLayoutOverview();
    }

    let currentNaStyleIndex = 0;
    let currentNaScale = 1.0;
    let currentNaRotation = 0;
    const baseNaWidth = 64;
    const baseNaHeight = 80;

    function updateNaTransform() {
      if (refs.layoutNorthArrow) {
        refs.layoutNorthArrow.style.width = `${baseNaWidth * currentNaScale}px`;
        refs.layoutNorthArrow.style.height = `${baseNaHeight * currentNaScale}px`;
        refs.layoutNorthArrow.style.transform = `rotate(${currentNaRotation}deg)`;
      }
    }

    const navBtnStyle = document.querySelector('button[onclick*="style"]');
    if (navBtnStyle) {
      navBtnStyle.addEventListener('click', () => initLayoutMap());
    }

    if (layoutMapOverlay && layoutMapInstanceDiv && layoutMapActivateText) {
      layoutMapOverlay.addEventListener('click', (e) => {
        initLayoutMap();
        if (!isLayoutMapActive) {
          isLayoutMapActive = true;
          layoutMapOverlay.classList.remove('bg-black/5', 'cursor-pointer');
          layoutMapOverlay.classList.add('pointer-events-none');
          layoutMapInstanceDiv.classList.remove('pointer-events-none');
          layoutMapActivateText.classList.add('hidden');
          setTimeout(() => layoutMap && layoutMap.invalidateSize(), 80);
          e.stopPropagation();
        }
      });
    }

    document.addEventListener('click', (e) => {
      const mapFrame = qs('layoutMapFrame');
      if (isLayoutMapActive && mapFrame && !mapFrame.contains(e.target) && layoutMapOverlay && layoutMapInstanceDiv && layoutMapActivateText) {
        isLayoutMapActive = false;
        layoutMapOverlay.classList.add('bg-black/5', 'cursor-pointer');
        layoutMapOverlay.classList.remove('pointer-events-none');
        layoutMapInstanceDiv.classList.add('pointer-events-none');
        layoutMapActivateText.classList.remove('hidden');
      }
    });

    if (refs.layoutGeoJsonInput) {
      refs.layoutGeoJsonInput.addEventListener('change', (e) => {
        initLayoutMap();
        const file = e.target.files?.[0];
        if (!file || !layoutMap) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const geojsonData = JSON.parse(evt.target.result);
            const addedLayer = L.geoJSON(geojsonData, {
              style: { color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.2 }
            }).addTo(layoutMap);
            if (layoutOverviewMap) {
              L.geoJSON(geojsonData, {
                style: { color: '#ef4444', weight: 1.5, fillColor: '#ef4444', fillOpacity: 0.15 }
              }).addTo(layoutOverviewMap);
            }
            const bounds = addedLayer.getBounds();
            if (bounds.isValid()) {
              layoutMap.fitBounds(bounds, { padding: [20, 20] });
              if (layoutOverviewMap) layoutOverviewMap.fitBounds(bounds, { padding: [10, 10] });
            }
            addExtraLegendItem({
              key: `upload-${file.name}`,
              type: 'swatch',
              colorClasses: 'bg-red-500/20 border-2 border-red-500 shadow-sm',
              fullWidth: false,
              label: { ar: file.name.substring(0, 20), en: file.name.substring(0, 20) }
            });
          } catch (err) {
            console.error('Invalid GeoJSON file:', err);
            alert(t('invalidFile'));
          }
        };
        reader.readAsText(file);
      });
    }

    if (refs.layoutUrlBtn) {
      refs.layoutUrlBtn.addEventListener('click', () => {
        initLayoutMap();
        const url = prompt(t('promptUrl'));
        if (url && layoutMap) {
          L.tileLayer(url, { maxZoom: 20 }).addTo(layoutMap);
          addExtraLegendItem({
            key: 'external-xyz',
            type: 'icon',
            iconClass: 'fa-solid fa-satellite text-blue-500',
            label: { ar: I18N.ar.externalLayer, en: I18N.en.externalLayer }
          });
        }
      });
    }

    setupDraggableLayoutElements();

    if (refs.propColorPicker) {
      refs.propColorPicker.addEventListener('input', (e) => {
        if (refs.northArrowSvg) refs.northArrowSvg.style.setProperty('--na-color', e.target.value);
      });
    }

    if (refs.propCycleStyleBtn && refs.northArrowSvg) {
      refs.propCycleStyleBtn.addEventListener('click', () => {
        currentNaStyleIndex = (currentNaStyleIndex + 1) % northArrowStyles.length;
        refs.northArrowSvg.innerHTML = northArrowStyles[currentNaStyleIndex];
      });
    }

    if (refs.propSizeIncBtn) {
      refs.propSizeIncBtn.addEventListener('click', () => {
        currentNaScale = Math.min(currentNaScale + 0.15, 2.5);
        updateNaTransform();
      });
    }
    if (refs.propSizeDecBtn) {
      refs.propSizeDecBtn.addEventListener('click', () => {
        currentNaScale = Math.max(currentNaScale - 0.15, 0.4);
        updateNaTransform();
      });
    }
    if (refs.propRotateBtn) {
      refs.propRotateBtn.addEventListener('click', () => {
        currentNaRotation = (currentNaRotation + 45) % 360;
        updateNaTransform();
      });
    }
    if (refs.propDeleteBtn) {
      refs.propDeleteBtn.addEventListener('click', () => {
        if (refs.layoutNorthArrow) refs.layoutNorthArrow.classList.add('hidden');
        if (refs.btnAddLayoutNorthArrow) refs.btnAddLayoutNorthArrow.classList.remove('ring-2', 'ring-blue-400');
      });
    }
    if (refs.propApplyBtn) {
      refs.propApplyBtn.addEventListener('click', () => {
        const originalHTML = refs.propApplyBtn.innerHTML;
        refs.propApplyBtn.innerHTML = '<i class="fa-solid fa-check-double text-lg text-emerald-500"></i>';
        setTimeout(() => (refs.propApplyBtn.innerHTML = originalHTML), 900);
      });
    }

    if (refs.layoutZoomInBtn) {
      refs.layoutZoomInBtn.addEventListener('click', () => {
        initLayoutMap();
        if (layoutMap) layoutMap.zoomIn();
      });
    }
    if (refs.layoutZoomOutBtn) {
      refs.layoutZoomOutBtn.addEventListener('click', () => {
        initLayoutMap();
        if (layoutMap) layoutMap.zoomOut();
      });
    }
    if (refs.layoutFullscreenBtn && layoutCanvasBox) {
      refs.layoutFullscreenBtn.addEventListener('click', async () => {
        try {
          if (!document.fullscreenElement) {
            await layoutCanvasBox.requestFullscreen();
            refs.layoutFullscreenBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
          } else {
            await document.exitFullscreen();
            refs.layoutFullscreenBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
          }
          setTimeout(() => {
            if (layoutMap) layoutMap.invalidateSize();
            if (layoutOverviewMap) layoutOverviewMap.invalidateSize();
            fitLayoutOverviewToMain();
          }, 200);
        } catch (err) {
          console.error('Fullscreen error:', err);
        }
      });
    }
    if (refs.layoutOverviewResetBtn) {
      refs.layoutOverviewResetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        initLayoutMap();
        fitLayoutOverviewToMain();
      });
    }

    bindLayoutToggle(refs.btnAddLayoutNorthArrow, refs.layoutNorthArrow);
    bindLayoutToggle(refs.btnAddLayoutScaleBar, refs.layoutScaleBar);
    bindLayoutToggle(refs.btnAddLayoutLegend, refs.layoutLegend);

    if (refs.layoutResetBtn) {
      refs.layoutResetBtn.addEventListener('click', fullReset);
    }

    if (refs.btnExportPDF) {
      refs.btnExportPDF.addEventListener('click', async () => {
        const originalText = refs.btnExportPDF.innerHTML;
        refs.btnExportPDF.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-lg"></i>';
        try {
          if (typeof html2canvas === 'undefined') throw new Error('html2canvas not available');
          const canvas = await html2canvas(layoutPaper, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/png');
          link.download = 'map-layout-export.png';
          link.click();
          refs.btnExportPDF.innerHTML = '<i class="fa-solid fa-check text-lg"></i>';
        } catch (err) {
          console.error('Export error:', err);
          refs.btnExportPDF.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-lg"></i>';
        }
        setTimeout(() => {
          refs.btnExportPDF.innerHTML = originalText;
        }, 2000);
      });
    }

    if (refs.configToggleBtn) refs.configToggleBtn.addEventListener('click', () => toggleConfigPanel());
    if (refs.configCloseBtn) refs.configCloseBtn.addEventListener('click', () => toggleConfigPanel(false));

    if (refs.applyPaperSizeBtn) {
      refs.applyPaperSizeBtn.addEventListener('click', () => {
        applyPaperSize(refs.paperWidthInput?.value, refs.paperHeightInput?.value);
      });
    }

    const syncPaperControls = (live = true) => {
      const width = parseInt(refs.paperWidthInput?.value || refs.paperWidthRange?.value || state.paperWidth, 10);
      const height = parseInt(refs.paperHeightInput?.value || refs.paperHeightRange?.value || state.paperHeight, 10);
      if (refs.paperWidthInput) refs.paperWidthInput.value = width;
      if (refs.paperHeightInput) refs.paperHeightInput.value = height;
      if (refs.paperWidthRange) refs.paperWidthRange.value = width;
      if (refs.paperHeightRange) refs.paperHeightRange.value = height;
      if (refs.paperWidthValue) refs.paperWidthValue.textContent = width;
      if (refs.paperHeightValue) refs.paperHeightValue.textContent = height;
      if (live) applyPaperSize(width, height, true);
    };

    if (refs.paperWidthInput) refs.paperWidthInput.addEventListener('input', () => syncPaperControls(true));
    if (refs.paperHeightInput) refs.paperHeightInput.addEventListener('input', () => syncPaperControls(true));
    if (refs.paperWidthRange) refs.paperWidthRange.addEventListener('input', (e) => {
      if (refs.paperWidthInput) refs.paperWidthInput.value = e.target.value;
      syncPaperControls(true);
    });
    if (refs.paperHeightRange) refs.paperHeightRange.addEventListener('input', (e) => {
      if (refs.paperHeightInput) refs.paperHeightInput.value = e.target.value;
      syncPaperControls(true);
    });

    if (refs.presetSelect) {
      refs.presetSelect.addEventListener('change', (e) => {
        const preset = PRESETS[e.target.value] || PRESETS['a3-landscape'];
        refs.paperWidthInput.value = preset.width;
        refs.paperHeightInput.value = preset.height;
        if (e.target.value !== 'custom') applyPaperSize(preset.width, preset.height);
      });
    }

    const syncOverviewControls = (live = true) => {
      applyOverviewSettings({
        visible: refs.overviewToggle?.checked,
        width: refs.overviewWidthInput?.value,
        height: refs.overviewHeightInput?.value,
        padding: refs.overviewPaddingInput?.value,
        extentVisible: refs.overviewExtentToggle?.checked
      }, !live);
    };

    if (refs.overviewWidthInput) refs.overviewWidthInput.addEventListener('input', () => syncOverviewControls(false));
    if (refs.overviewHeightInput) refs.overviewHeightInput.addEventListener('input', () => syncOverviewControls(false));
    if (refs.overviewPaddingInput) refs.overviewPaddingInput.addEventListener('input', () => syncOverviewControls(false));
    if (refs.overviewToggle) refs.overviewToggle.addEventListener('change', () => syncOverviewControls(false));
    if (refs.overviewExtentToggle) refs.overviewExtentToggle.addEventListener('change', () => syncOverviewControls(false));
    if (refs.overviewApplyBtn) refs.overviewApplyBtn.addEventListener('click', () => syncOverviewControls(true));

    if (refs.overviewTitleInput) {
      refs.overviewTitleInput.addEventListener('input', (e) => {
        state.overviewTitle[state.lang] = e.target.value.trim() || (state.lang === 'ar' ? 'خريطة الموقع العام' : 'Overview Map');
        updateOverviewTitleDisplay();
      });
    }
    if (refs.legendTitleInput) {
      refs.legendTitleInput.addEventListener('input', (e) => {
        state.legendTitle[state.lang] = e.target.value.trim() || (state.lang === 'ar' ? 'مفتاح الخريطة' : 'Legend');
        updateLegendTitleDisplay();
      });
    }
    if (refs.overviewTitleToggle) {
      refs.overviewTitleToggle.addEventListener('change', (e) => {
        state.overviewTitleVisible = e.target.checked;
        updateOverviewTitleDisplay();
      });
    }
    if (refs.legendTitleToggle) {
      refs.legendTitleToggle.addEventListener('change', (e) => {
        state.legendTitleVisible = e.target.checked;
        updateLegendTitleDisplay();
      });
    }

    if (refs.legendResetBtn) {
      refs.legendResetBtn.addEventListener('click', resetLegendItemsToDefault);
    }

    if (refs.legendItemsEditor) {
      refs.legendItemsEditor.addEventListener('input', (e) => {
        const index = Number(e.target.dataset.legendLabel);
        if (Number.isNaN(index) || !state.legendItems[index]) return;
        state.legendItems[index].label[state.lang] = e.target.value;
        renderLegend();
      });
      refs.legendItemsEditor.addEventListener('change', (e) => {
        const index = Number(e.target.dataset.legendVisible);
        if (Number.isNaN(index) || !state.legendItems[index]) return;
        state.legendItems[index].visible = e.target.checked;
        renderLegend();
      });
    }

    [refs.langArBtn, refs.panelLangArBtn].forEach(btn => btn && btn.addEventListener('click', () => { localStorage.setItem('site_lang', 'ar'); applyLanguage('ar'); window.dispatchEvent(new CustomEvent('site-language-change', { detail: { lang: 'ar' } })); }));
    [refs.langEnBtn, refs.panelLangEnBtn].forEach(btn => btn && btn.addEventListener('click', () => { localStorage.setItem('site_lang', 'en'); applyLanguage('en'); window.dispatchEvent(new CustomEvent('site-language-change', { detail: { lang: 'en' } })); }));

    window.addEventListener('site-language-change', (event) => {
      const nextLang = event?.detail?.lang === 'en' ? 'en' : 'ar';
      if (state.lang !== nextLang) applyLanguage(nextLang);
    });

    applyPaperSize(state.paperWidth, state.paperHeight, true);
    applyOverviewSettings({}, true);
    applyLanguage(state.lang);
    renderLegend();
    renderLegendEditor();
    updateOverviewTitleDisplay();
    updateLegendTitleDisplay();

    if (qs('style')?.classList.contains('active')) {
      initLayoutMap();
    }
  });
})();
