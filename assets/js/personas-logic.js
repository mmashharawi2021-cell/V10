/**
 * Personas Dashboard Logic - Encapsulated
 */
window.initPersonasDashboard = function() {
    // Prevent double initialization but allow map refresh
    if (window.personasDashboardInitialized) {
        const root = document.getElementById('p-root');
        if (root && window.personasMapInstance) {
            setTimeout(() => window.personasMapInstance.invalidateSize(), 300);
        }
        return;
    }
    
    const root = document.getElementById('p-root');
    if (!root) return;

    // Local selector scoped to p-root
    const p$ = s => root.querySelector(s);
    
    const STATUS_MAP = {
      '1':'لم يتم زيارته',
      '2':'حصر جزئي',
      '3':'تمت اعمال الحصر بالكامل',
      '4':'رفض الحصر',
      '5':'إنتظار قرار اللجنة الفنية',
      'لم يتم زيارته':'لم يتم زيارته',
      'حصر جزئي':'حصر جزئي',
      'تمت اعمال الحصر بالكامل':'تمت اعمال الحصر بالكامل',
      'رفض الحصر':'رفض الحصر',
      'إنتظار قرار اللجنة الفنية':'إنتظار قرار اللجنة الفنية',
    };

    const state = {
      stats: new Map(),
      enrichedZones: null,
      selectedZoneCode: null,
      map: null,
      baseMaps: {},
      zoneLayer: null,
      buildingLayers: [], 
      activeEsriUrl: null,
      esriAbortController: null,
      visibleStatuses: new Set(['تمت اعمال الحصر بالكامل', 'حصر جزئي', 'لم يتم زيارته', 'رفض الحصر', 'إنتظار قرار اللجنة الفنية']),
      isDark: document.body.classList.contains('dark'),
      chart: null,
      editingLayerId: null,
      lastExtentFetch: 0
    };

    const el = {
        buildingsFileInput: p$('#buildingsFile'),
        zonesFileInput: p$('#zonesFile'),
        esriUrlInput: p$('#esriUrl'),
        addEsriBtn: p$('#addEsriBtn'),
        buildingLayersList: p$('#buildingLayersList'),
        zoneField: p$('#zoneField'),
        buildingStatusField: p$('#buildingStatusField'),
        analyzeBtn: p$('#analyzeBtn'),
        exportGeojsonBtn: p$('#exportGeojsonBtn'),
        exportCsvBtn: p$('#exportCsvBtn'),
        statusText: p$('#statusText'),
        progressBar: p$('#progressBar'),
        summary: p$('#summary'),
        zoneDetails: p$('#zoneDetails'),
        zoneDetailsContainer: p$('#zoneDetailsContainer'),
        cardsGrid: p$('#cardsGrid'),
        tableSearch: p$('#tableSearch'),
        satelliteToggle: p$('#satelliteToggle'),
        loadAllForZonesBtn: p$('#loadAllForZonesBtn'),
        targetedActions: p$('#targetedActions')
    };

    function init() {
        console.log("Initializing Personas Dashboard UI...");
        
        // Safe listener attachments
        const safeAddListener = (element, event, handler) => {
            if (element) {
                element.addEventListener(event, handler);
            } else {
                console.warn(`Personas: Element for ${event} listener not found.`);
            }
        };

        safeAddListener(el.analyzeBtn, 'click', analyze);
        safeAddListener(el.exportGeojsonBtn, 'click', () => download('zones_with_spatial_stats.geojson', JSON.stringify(state.enrichedZones, null, 2), 'application/geo+json'));
        safeAddListener(el.exportCsvBtn, 'click', () => download('zones_stats_report.csv', buildCsv(), 'text/csv;charset=utf-8'));
        safeAddListener(el.tableSearch, 'input', renderCards);
        safeAddListener(el.buildingsFileInput, 'change', handleFileUpload);
        safeAddListener(el.zonesFileInput, 'change', handleZonesUpload);
        safeAddListener(el.addEsriBtn, 'click', handleEsriAdd);
        safeAddListener(el.satelliteToggle, 'click', toggleBaseLayer);
        safeAddListener(el.loadAllForZonesBtn, 'click', loadAllBuildingsForZones);

        // Sidebar Tabs Logic
        const tabsContainer = p$('.sidebar-tabs');
        if (tabsContainer) {
            tabsContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.tab-btn');
                if (!btn) return;
                root.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                root.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const target = p$(`#${btn.dataset.tab}`);
                if (target) target.classList.add('active');
                if (state.map) setTimeout(() => state.map.invalidateSize(), 100);
            });
        }

        // Filter Listeners
        const legend = p$('#statusLegend');
        if (legend && typeof legend.addEventListener === 'function') {
            legend.addEventListener('change', (e) => {
                if (e.target.tagName === 'INPUT') {
                    const status = e.target.getAttribute('data-status');
                    if (e.target.checked) state.visibleStatuses.add(status);
                    else state.visibleStatuses.delete(status);
                    applyStatusFilter();
                }
            });
        }

        // Delay map initialization to ensure DOM is fully rendered and visible
        setTimeout(() => {
            try {
                initMap();
            } catch (e) {
                console.error("Personas: Failed to initialize map:", e);
            }
        }, 300);
        
        if (window.lucide) {
            try {
                lucide.createIcons({
                    attrs: { 'stroke-width': 2 },
                    nameAttr: 'data-lucide',
                    root: root
                });
            } catch (e) {
                console.warn("Personas: Lucide icons error:", e);
            }
        }

        window.personasDashboardInitialized = true;
    }

    function initMap() {
        const mapDiv = document.getElementById('p-map');
        if (!mapDiv) {
            console.error("Personas: #p-map element not found during initMap");
            return;
        }

        console.log(`Personas: Initializing map. Container size: ${mapDiv.clientWidth}x${mapDiv.clientHeight}`);

        const cartoPositron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20 });
        const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
        const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

        state.baseMaps = { "Carto": cartoPositron, "OSM": osm, "Satellite": esriSat };
        
        // If map already exists, just invalidate size
        if (state.map) {
            state.map.invalidateSize();
            return;
        }

        state.map = L.map(mapDiv, { zoomControl: false, preferCanvas: true, layers: [cartoPositron] });
        window.personasMapInstance = state.map; // Store globally for invalidation
        L.control.zoom({ position: 'bottomleft' }).addTo(state.map);
        state.map.setView([31.4, 34.33], 11);

        state.map.on('moveend', () => {
            if (state.activeEsriUrl) {
                const now = Date.now();
                if (now - state.lastExtentFetch > 1000) { 
                    state.lastExtentFetch = now;
                    loadEsriByExtent(state.activeEsriUrl);
                }
            }
        });
        
        // Ensure map renders correctly when page is switched
        setTimeout(() => state.map.invalidateSize(), 500);
    }

    function toggleBaseLayer() {
        const isSat = state.map.hasLayer(state.baseMaps["Satellite"]);
        if (isSat) { state.map.removeLayer(state.baseMaps["Satellite"]); state.map.addLayer(state.baseMaps["Carto"]); }
        else { state.map.removeLayer(state.baseMaps["Carto"]); state.map.addLayer(state.baseMaps["Satellite"]); }
    }

    async function handleZonesUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            setStatus('جاري معالجة الزونات...', 20);
            const data = JSON.parse(await file.text());
            state.enrichedZones = data;
            const zField = el.zoneField.value.trim();
            renderMap(data, zField);
            checkTargetedActions();
            setStatus('تم رفع الزونات بنجاح', 100);
        } catch (err) { alert(`خطأ في الزونات: ${err.message}`); }
    }

    async function handleFileUpload(e) {
        state.activeEsriUrl = null; 
        checkTargetedActions();
        for (const file of Array.from(e.target.files)) {
            try {
                setStatus(`قراءة ${file.name}...`, 20);
                addBuildingLayer('file', file.name, JSON.parse(await file.text()));
            } catch (err) { alert(`خطأ: ${err.message}`); }
        }
        el.buildingsFileInput.value = '';
        updateLayersUI();
    }

    function handleEsriAdd() {
        const url = el.esriUrlInput.value.trim();
        if (!url) return;
        state.activeEsriUrl = url.replace(/\/+$/, '');
        checkTargetedActions();
        loadEsriByExtent(state.activeEsriUrl, true);
        el.esriUrlInput.value = '';
    }

    function checkTargetedActions() {
        const isReady = state.activeEsriUrl && state.enrichedZones;
        if (el.targetedActions) el.targetedActions.style.display = isReady ? 'block' : 'none';
    }

    async function loadEsriByExtent(url, fit = false) {
        if (state.esriAbortController) state.esriAbortController.abort();
        state.esriAbortController = new AbortController();
        const signal = state.esriAbortController.signal;

        try {
            setStatus('تحميل النطاق الحالي...', 5);
            const b = state.map.getBounds();
            const geom = `{"xmin":${b.getWest()},"ymin":${b.getSouth()},"xmax":${b.getEast()},"ymax":${b.getNorth()},"spatialReference":{"wkid":4326}}`;
            const qBase = buildEsriQueryUrl(url);

            const countRes = await fetch(`${qBase}?where=1%3D1&geometry=${encodeURIComponent(geom)}&geometryType=esriGeometryEnvelope&returnCountOnly=true&f=json`, { signal });
            const countData = await countRes.json();
            const total = countData.count || 0;

            if (total === 0) { setStatus('لا توجد بيانات.', 100); clearDynamicLayer(); return; }

            let allFeatures = [];
            let offset = 0;
            const limit = 2000;
            const MAX = 1000000; 

            while (offset < total && offset < MAX) {
                setStatus(`جاري جلب النطاق (${offset} / ${total})...`, 10 + (offset/total)*85);
                const res = await fetch(`${qBase}?where=1%3D1&geometry=${encodeURIComponent(geom)}&geometryType=esriGeometryEnvelope&outFields=*&f=geojson&outSR=4326&resultOffset=${offset}&resultRecordCount=${limit}`, { signal });
                const data = await res.json();
                if (data.features) { allFeatures = allFeatures.concat(data.features); offset += data.features.length; } else break;
                if (data.features.length < limit) break;
                await tick();
            }

            updateRecycledLayer(allFeatures, url, fit, false); 
            setStatus(`تم عرض ${allFeatures.length} مبنى بنجاح.`, 100);
        } catch (err) { if (err.name !== 'AbortError') setStatus(`خطأ: ${err.message}`, 0); }
    }

    async function loadAllBuildingsForZones() {
        if (!state.activeEsriUrl || !state.enrichedZones) return;
        
        if (state.esriAbortController) state.esriAbortController.abort();
        state.esriAbortController = new AbortController();
        const signal = state.esriAbortController.signal;

        try {
            setStatus('تحميل شامل لكافة مباني الزونات...', 5);
            
            const allPts = flattenCoords(state.enrichedZones.features.map(f => f.geometry.coordinates));
            const bbox = calcBBox(allPts);
            const geom = `{"xmin":${bbox[0]},"ymin":${bbox[1]},"xmax":${bbox[2]},"ymax":${bbox[3]},"spatialReference":{"wkid":4326}}`;
            const qBase = buildEsriQueryUrl(state.activeEsriUrl);

            const countRes = await fetch(`${qBase}?where=1%3D1&geometry=${encodeURIComponent(geom)}&geometryType=esriGeometryEnvelope&returnCountOnly=true&f=json`, { signal });
            const countData = await countRes.json();
            const total = countData.count || 0;
            
            if (total === 0) return alert('لا توجد مبانٍ ضمن نطاق الزونات المرفوعة.');

            let allFeatures = [];
            let offset = 0;
            const limit = 3000; 

            while (offset < total) {
                setStatus(`جاري جلب كافة البيانات (${offset} / ${total})...`, 5 + (offset/total)*90);
                const res = await fetch(`${qBase}?where=1%3D1&geometry=${encodeURIComponent(geom)}&geometryType=esriGeometryEnvelope&outFields=*&f=geojson&outSR=4326&resultOffset=${offset}&resultRecordCount=${limit}`, { signal });
                const data = await res.json();
                if (data.features) { 
                    allFeatures = allFeatures.concat(data.features); 
                    offset += data.features.length; 
                } else break;
                await tick();
            }

            updateRecycledLayer(allFeatures, state.activeEsriUrl, true, false, "شامل (كافة الزونات)");
            setStatus(`تم تحميل كافة المباني (${allFeatures.length}) بنجاح.`, 100);
            alert(`اكتمل التحميل! تم جلب ${allFeatures.length} مبنى تغطي كامل مساحة الزونات.`);

        } catch (err) { if (err.name !== 'AbortError') alert(`فشل التحميل الشامل: ${err.message}`); }
    }

    function buildEsriQueryUrl(url) {
        let b = url.replace(/\/+$/, '');
        if (b.toLowerCase().endsWith('featureserver') || b.toLowerCase().endsWith('mapserver')) b += '/0';
        return b.includes('/query') ? b : b + '/query';
    }

    function updateRecycledLayer(allFeatures, url, fit, capped, nameTag) {
        const existingLayer = state.buildingLayers.find(l => l.type === 'esri-dynamic');
        if (existingLayer) {
            existingLayer.leafLayer.clearLayers();
            existingLayer.leafLayer.addData({ type: "FeatureCollection", features: allFeatures });
            existingLayer.data.features = allFeatures;
            if (nameTag) existingLayer.name = `البث: ${url.split('/').slice(-2,-1)} (${nameTag})`;
            updateLayersUI();
        } else {
            addBuildingLayer('esri-dynamic', `البث: ${url.split('/').slice(-2,-1)}`, { type: "FeatureCollection", features: allFeatures }, fit);
        }
    }

    function clearDynamicLayer() {
        const l = state.buildingLayers.find(x => x.type === 'esri-dynamic');
        if (l) { l.leafLayer.clearLayers(); l.data.features = []; }
    }

    function addBuildingLayer(type, name, data, fit = true) {
        const id = Date.now() + Math.random().toString(36).substr(2, 5);
        if (!el.buildingStatusField) return id;
        const sField = el.buildingStatusField.value.trim();
        const leafLayer = L.geoJSON(data, {
            pointToLayer: (f, latlng) => {
                const raw = f.properties?.[sField];
                const color = getStatusColor(raw);
                const isVisible = isStatusVisible(raw);
                return L.circleMarker(latlng, { 
                    radius: 6, 
                    fillColor: color, 
                    color: '#fff', 
                    weight: 1.5, 
                    fillOpacity: isVisible ? 0.8 : 0,
                    opacity: isVisible ? 1 : 0,
                    className: isVisible ? 'marker-shadow' : ''
                });
            },
            style: (f) => {
                const raw = f.properties?.[sField];
                const color = getStatusColor(raw);
                const isVisible = isStatusVisible(raw);
                return { 
                    color: color, 
                    weight: 2, 
                    fillColor: color, 
                    fillOpacity: isVisible ? 0.4 : 0,
                    opacity: isVisible ? 1 : 0
                };
            }
        }).addTo(state.map);
        state.buildingLayers.push({ id, name, type, data: { ...data }, visible: true, leafLayer });
        if (fit) { const b = leafLayer.getBounds(); if (b.isValid()) state.map.fitBounds(b.pad(0.1)); }
        updateLayersUI();
        return id;
    }

    function applyStatusFilter() {
        if (!el.buildingStatusField) return;
        const sField = el.buildingStatusField.value.trim();
        state.buildingLayers.forEach(l => {
            l.leafLayer.setStyle(f => {
                const raw = f.properties?.[sField];
                const isVisible = isStatusVisible(raw);
                return { 
                    fillOpacity: isVisible ? 0.35 : 0,
                    opacity: isVisible ? 1 : 0
                };
            });
        });
    }

    function isStatusVisible(raw) {
        const v = STATUS_MAP[normalize(raw)] || normalize(raw);
        return state.visibleStatuses.has(v);
    }

    function updateLayersUI() {
        if (!el.buildingLayersList) return;
        el.buildingLayersList.innerHTML = state.buildingLayers.length ? state.buildingLayers.map(l => `
            <div class="layer-item">
                <div class="layer-info"><i data-lucide="${l.type.startsWith('esri')?'globe':'file'}"></i><span class="layer-name">${l.name}</span></div>
                <div class="layer-actions">
                    <button class="toggle-vis" data-id="${l.id}"><i data-lucide="${l.visible?'eye':'eye-off'}"></i></button>
                    <button class="remove-layer" data-id="${l.id}" style="color:#ef4444"><i data-lucide="trash-2"></i></button>
                </div>
            </div>`).join('') : '<div class="muted" style="text-align:center;padding:10px;">لا توجد طبقات</div>';
        
        if (window.lucide) lucide.createIcons({ root: el.buildingLayersList });

        el.buildingLayersList.querySelectorAll('.toggle-vis').forEach(b => b.onclick = () => toggleLayerVisibility(b.dataset.id));
        el.buildingLayersList.querySelectorAll('.remove-layer').forEach(b => b.onclick = () => removeLayer(b.dataset.id));
    }

    function toggleLayerVisibility(id) {
        const l = state.buildingLayers.find(x => x.id === id);
        if (!l) return;
        l.visible = !l.visible;
        if (l.visible) l.leafLayer.addTo(state.map); else l.leafLayer.remove();
        updateLayersUI();
    }

    function removeLayer(id) {
        const i = state.buildingLayers.findIndex(x => x.id === id);
        if (i === -1) return;
        state.buildingLayers[i].leafLayer.remove();
        if (state.buildingLayers[i].type === 'esri-dynamic') state.activeEsriUrl = null;
        state.buildingLayers.splice(i, 1);
        checkTargetedActions();
        updateLayersUI();
    }

    async function analyze() {
        const zfFile = el.zonesFileInput.files[0];
        const activeLayers = state.buildingLayers.filter(l => l.visible);
        if (!zfFile || !activeLayers.length) return alert('يرجى اختيار ملف المناطق وإضافة طبقة مبانٍ.');

        try {
            setStatus('تحليل المناطق النشطة...', 10);
            const zonesJson = JSON.parse(await zfFile.text());
            const zField = el.zoneField.value.trim();
            const sField = el.buildingStatusField.value.trim();

            const rb = new RBush();
            let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;

            const preparedZones = zonesJson.features.map((f, i) => {
                const code = normalize(f.properties?.[zField]) || `Z_${i+1}`;
                const coords = extractOuterRings(f.geometry);
                const bbox = calcBBox(flattenCoords(coords));
                minX=Math.min(minX, bbox[0]); minY=Math.min(minY, bbox[1]); maxX=Math.max(maxX, bbox[2]); maxY=Math.max(maxY, bbox[3]);
                const item = { minX: bbox[0], minY: bbox[1], maxX: bbox[2], maxY: bbox[3], zone: { f, code } };
                rb.insert(item);
                return item.zone;
            });

            const stats = new Map();
            preparedZones.forEach(z => stats.set(z.code, emptyStats(z.code)));

            const buildings = activeLayers.flatMap(l => l.data.features);
            for (let i=0; i<buildings.length; i+=1000) {
                const chunk = buildings.slice(i, i+1000);
                chunk.forEach(feat => {
                    const pt = featureCentroid(feat.geometry);
                    if (pt && pt[0]>=minX && pt[0]<=maxX && pt[1]>=minY && pt[1]<=maxY) {
                        rb.search({minX:pt[0], minY:pt[1], maxX:pt[0], maxY:pt[1]}).forEach(cand => {
                            if (pointInGeometry(pt, cand.zone.f.geometry)) addStatus(stats.get(cand.zone.code), feat.properties?.[sField]);
                        });
                    }
                });
                setStatus(`تحليل... ${Math.min(i+1000, buildings.length)}`, 20 + (i/buildings.length)*80);
                await tick();
            }

            stats.forEach(s => s.completion_rate = s.total ? Number(((s.full_survey / s.total) * 100).toFixed(1)) : 0);
            state.stats = stats;
            zonesJson.features.forEach(f => Object.assign(f.properties, stats.get(normalize(f.properties?.[zField])) || {}));
            state.enrichedZones = zonesJson;
            renderSummary();
            renderCharts();
            renderCards();
            renderMap(zonesJson, zField);
            if (el.exportGeojsonBtn) el.exportGeojsonBtn.disabled = false;
            if (el.exportCsvBtn) el.exportCsvBtn.disabled = false;
            setStatus('اكتمل التحليل بنجاح', 100);
        } catch (err) { alert(err.message); setStatus('خطأ', 0); }
    }

    function renderSummary() {
        const s = Array.from(state.stats.values()).reduce((a, b) => ({
            t: a.t+b.total, f: a.f+b.full_survey, p: a.p+b.partial_survey, n: a.n+b.not_visited, r: a.r+b.refused_survey, c: a.c+b.committee_pending
        }), { t:0, f:0, p:0, n:0, r:0, c:0 });
        if (el.summary) {
            el.summary.innerHTML = `
                <div class="stat-card"><div class="stat-value">${s.t}</div><div class="stat-label">الإجمالي</div></div>
                <div class="stat-card"><div class="stat-value" style="color:#22c55e">${s.f}</div><div class="stat-label">مكتمل</div></div>
                <div class="stat-card"><div class="stat-value" style="color:#0ea5e9">${s.p}</div><div class="stat-label">جزئي</div></div>
                <div class="stat-card"><div class="stat-value" style="color:#eab308">${s.n}</div><div class="stat-label">لم يزار</div></div>
                <div class="stat-card"><div class="stat-value" style="color:#475569">${s.r}</div><div class="stat-label">مرفوض</div></div>
                <div class="stat-card"><div class="stat-value" style="color:#ef4444">${s.c}</div><div class="stat-label">لجنة</div></div>
            `;
        }
    }

    function renderCharts() {
        const s = Array.from(state.stats.values()).reduce((a, b) => { a[0]+=b.full_survey; a[1]+=b.partial_survey; a[2]+=b.not_visited; a[3]+=b.refused_survey; return a; }, [0, 0, 0, 0]);
        if (state.chart) state.chart.destroy();
        const canvas = p$('#summaryChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        const g1 = ctx.createLinearGradient(0, 0, 0, 400); g1.addColorStop(0, '#22c55e'); g1.addColorStop(1, '#16a34a'); 
        const g2 = ctx.createLinearGradient(0, 0, 0, 400); g2.addColorStop(0, '#0ea5e9'); g2.addColorStop(1, '#0284c7'); 
        const g3 = ctx.createLinearGradient(0, 0, 0, 400); g3.addColorStop(0, '#f59e0b'); g3.addColorStop(1, '#d97706'); 
        const g4 = ctx.createLinearGradient(0, 0, 0, 400); g4.addColorStop(0, '#475569'); g4.addColorStop(1, '#1e293b'); 

        state.chart = new Chart(ctx, { 
            type: 'doughnut', 
            data: { 
                labels: ['مكتمل','جزئي','لم يزار','مرفوض'], 
                datasets: [{ 
                    data:s, 
                    backgroundColor: [g1, g2, g3, g4], 
                    borderWidth:0,
                    hoverOffset: 15,
                    borderRadius: 5
                }] 
            }, 
            options: { 
                responsive:true, 
                maintainAspectRatio:false, 
                cutout: '75%',
                plugins:{ 
                    legend:{ 
                        position:'bottom', 
                        labels:{ 
                            usePointStyle: true,
                            padding: 10,
                            color: document.body.classList.contains('dark')?'#94a3b8':'#1e293b', 
                            font:{ family:'Cairo', size: 10, weight: '600' } 
                        } 
                    }
                },
                animation: { animateScale: true, animateRotate: true }
            } 
        });
    }

    function renderCards() {
        if (!el.cardsGrid) return;
        const q = el.tableSearch ? normalize(el.tableSearch.value).toLowerCase() : '';
        const items = Array.from(state.stats.values()).filter(r => r.total > 0 && (!q || r.zone_code.toLowerCase().includes(q)));
        items.sort((a,b) => b.total - a.total);
        
        el.cardsGrid.innerHTML = items.map(r => {
            const isActive = state.selectedZoneCode === r.zone_code;
            return `
            <div class="data-card ${isActive ? 'active-card' : ''}" data-code="${r.zone_code}">
                <div class="card-header">
                    <span class="card-title">${r.zone_code}</span>
                    <span class="card-completion" style="color:${getCompColor(r.completion_rate)}">${r.completion_rate}%</span>
                </div>
                <div class="card-progress-bar">
                    <div class="card-progress-fill" style="width:${r.completion_rate}%; background:${getCompColor(r.completion_rate)}"></div>
                </div>
                <div class="card-stats-grid">
                    <div class="card-stat-item">
                        <span class="card-stat-val">${r.total}</span>
                        <span class="card-stat-lbl">إجمالي</span>
                    </div>
                    <div class="card-stat-item">
                        <span class="card-stat-val" style="color:#22c55e">${r.full_survey}</span>
                        <span class="card-stat-lbl">مكتمل</span>
                    </div>
                    <div class="card-stat-item">
                        <span class="card-stat-val" style="color:#0ea5e9">${r.partial_survey}</span>
                        <span class="card-stat-lbl">جزئي</span>
                    </div>
                    <div class="card-stat-item">
                        <span class="card-stat-val" style="color:#eab308">${r.not_visited}</span>
                        <span class="card-stat-lbl">لم يزار</span>
                    </div>
                    <div class="card-stat-item">
                        <span class="card-stat-val" style="color:#475569">${r.refused_survey}</span>
                        <span class="card-stat-lbl">مرفوض</span>
                    </div>
                    <div class="card-stat-item">
                        <span class="card-stat-val" style="color:#ef4444">${r.committee_pending}</span>
                        <span class="card-stat-lbl">لجنة</span>
                    </div>
                </div>
            </div>`;
        }).join('') || '<div class="muted-info">لا توجد نتائج مطابقة للبحث</div>';
            
        el.cardsGrid.querySelectorAll('.data-card').forEach(card => card.onclick = () => selectZone(card.dataset.code));
    }

    function renderMap(geojson, zField) {
        if (state.zoneLayer) state.zoneLayer.remove();
        state.zoneLayer = L.geoJSON(geojson, { 
            style: f => ({ 
                color: '#2563eb', 
                weight: 2, 
                fillColor: 'rgba(37, 99, 235, 0.05)', 
                fillOpacity: 0.2, 
                className: state.selectedZoneCode === normalize(f.properties?.[zField]) ? 'pulsing-zone' : '' 
            }), 
            onEachFeature: (f,l) => { 
                const code = normalize(f.properties?.[zField]); 
                l.on('click', () => selectZone(code)); 
                l.bindPopup(`<b>${code}</b><hr/>مباني: ${f.properties.total}<br/>إنجاز: ${f.properties.completion_rate}%`); 
            } 
        }).addTo(state.map);
        state.zoneLayer.bringToBack();
    }

    function selectZone(code) {
        state.selectedZoneCode = code;
        const s = state.stats.get(code); if (!s) return;
        if (el.zoneDetailsContainer) el.zoneDetailsContainer.style.display = 'block';
        if (el.zoneDetails) el.zoneDetails.innerHTML = `<strong>${code}</strong><br/>مجموع: ${s.total}<br/>مكتمل: ${s.full_survey}<br/>الإنجاز: ${s.completion_rate}%`;
        renderCards();
    }

    // Helper functions
    function normalize(v) { return v == null ? '' : String(v).trim(); }
    function emptyStats(zc='') { return { zone_code:zc, total:0, full_survey:0, partial_survey:0, not_visited:0, refused_survey:0, committee_pending:0, completion_rate:0 }; }
    function addStatus(s, r) {
        const v = STATUS_MAP[normalize(r)] || normalize(r); s.total++;
        if (v==='تمت اعمال الحصر بالكامل') s.full_survey++;
        else if (v==='حصر جزئي') s.partial_survey++;
        else if (v==='لم يتم زيارته') s.not_visited++;
        else if (v==='رفض الحصر') s.refused_survey++;
        else if (v==='إنتظار قرار اللجنة الفنية') s.committee_pending++;
    }
    function getCompColor(c) { return c>=80?'#22c55e':(c>=40?'#eab308':'#ef4444'); }
    function getStatusColor(raw) { const v = STATUS_MAP[normalize(raw)] || normalize(raw); if (v==='تمت اعمال الحصر بالكامل') return '#22c55e'; if (v==='حصر جزئي') return '#0ea5e9'; if (v==='لم يتم زيارته') return '#eab308'; if (v==='رفض الحصر') return '#334155'; if (v==='إنتظار قرار اللجنة الفنية') return '#ef4444'; return '#94a3b8'; }
    function setStatus(t, p=0) { if (el.statusText) el.statusText.textContent=t; if (el.progressBar) el.progressBar.style.width=`${p}%`; }
    function download(n, c, t) { const b=new Blob([c],{type:t}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=n; a.click(); }
    function buildCsv() {
        const header = ['كود الزون', 'الإجمالي', 'مكتمل', 'جزئي', 'لم يزار', 'مرفوض', 'لجنة', 'الإنجاز %'];
        const rows = [header];
        const sortedData = Array.from(state.stats.values()).filter(s => s.total > 0).sort((a,b) => b.total - a.total);
        sortedData.forEach(s => { rows.push([s.zone_code, s.total, s.full_survey, s.partial_survey, s.not_visited, s.refused_survey, s.committee_pending, s.completion_rate + '%']); });
        return '\uFEFF' + rows.map(l => l.join(',')).join('\n');
    }
    function tick() { return new Promise(r => setTimeout(r, 0)); }
    function featureCentroid(g) { if (!g) return null; if (g.type==='Point') return g.coordinates; if (g.type==='Polygon') return polyCentroid(g.coordinates); if (g.type==='MultiPolygon') { let b=null, ba=-Infinity; g.coordinates.forEach(p => { const a=Math.abs(ringArea(p[0]||[])); if (a>ba) { ba=a; b=polyCentroid(p); } }); return b; } return null; }
    function polyCentroid(pts) { const r=pts?.[0]; if (!r||r.length<3) return null; let x=0,y=0,a=0; for (let i=0,j=r.length-1; i<r.length; j=i++) { const [x0,y0]=r[j], [x1,y1]=r[i]; const f=(x0*y1-x1*y0); a+=f; x+=(x0+x1)*f; y+=(y0+y1)*f; } return Math.abs(a)<1e-12 ? r[0] : [x/(3*a), y/(3*a)]; }
    function ringArea(r) { let a=0; for (let i=0,j=r.length-1; i<r.length; j=i++) a+=r[j][0]*r[i][1]-r[i][0]*r[j][1]; return a/2; }
    function extractOuterRings(g) { if (g.type==='Polygon') return [g.coordinates[0]||[]]; if (g.type==='MultiPolygon') return g.coordinates.map(p=>p[0]||[]); return []; }
    function flattenCoords(v, acc=[]) { if (!Array.isArray(v)) return acc; if (v.length>=2 && typeof v[0]==='number') { acc.push(v); return acc; } v.forEach(i => flattenCoords(i, acc)); return acc; }
    function calcBBox(pts) { let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity; pts.forEach(p => { x0=Math.min(x0,p[0]); y0=Math.min(y0,p[1]); x1=Math.max(x1,p[0]); y1=Math.max(y1,p[1]); }); return [x0,y0,x1,y1]; }
    function pointInGeometry(pt, g) { if (g.type==='Polygon') return ptInPoly(pt, g.coordinates); if (g.type==='MultiPolygon') return g.coordinates.some(p => ptInPoly(pt, p)); return false; }
    function ptInPoly(pt, poly) { if (!poly?.length || !ptInRing(pt, poly[0])) return false; for (let i=1; i<poly.length; i++) if (ptInRing(pt, poly[i])) return false; return true; }
    function ptInRing(pt, r) { let inside=false; const x=pt[0], y=pt[1]; for (let i=0,j=r.length-1; i<r.length; j=i++) { const xi=r[i][0], yi=r[i][1], xj=r[j][0], yj=r[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-15) + xi)) inside = !inside; } return inside; }

    init();
};
