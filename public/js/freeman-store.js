// freeman-store.js
// Alpine.store('workspace') — shared state, data loading, and core tab management.
// All components read shared data and call shared methods through this store.

document.addEventListener('alpine:init', () => {
    Alpine.store('workspace', {

        // ── State ──────────────────────────────────────────────────────────
        tabs:               [],
        activeTabId:        null,
        collections:        [],
        collectionsLoading: true,
        environments:       [],
        layoutMode:         localStorage.getItem('freeman_layout') || 'stacked',

        // ── Computed ───────────────────────────────────────────────────────
        get activeTab() {
            return this.tabs.find(t => t.id === this.activeTabId) ?? null;
        },
        get activeEnvironment() {
            return this.environments.find(e => e.is_active) || null;
        },

        // ── Tab blueprints ─────────────────────────────────────────────────
        blankRequest() {
            return {
                collection_id: null,
                name:          'New Request',
                method:        'GET',
                url:           '',
                params:        [{ key: '', value: '', enabled: true }],
                headers:       [{ key: '', value: '', enabled: true }],
                body_type:     'none',
                raw_body_type: 'json',
                body:          '',
                body_form:     [{ key: '', value: '', enabled: true, type: 'text' }],
                auth_type:     'none',
                auth_data:     { token: '', username: '', password: '', key: '', value: '', in: 'header' },
            };
        },

        blankTab() {
            return {
                id:              'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2),
                requestId:       null,
                isDirty:         false,
                savedSnapshot:   null,
                request:         this.blankRequest(),
                response:        null,
                isLoading:       false,
                requestTab:      'params',
                responseTab:     'body',
                responseViewMode:'pretty',
                responseForceType:'auto',
                collectionVars:  {},
            };
        },

        // ── Tab actions ────────────────────────────────────────────────────
        newTab() {
            const tab = this.blankTab();
            this.tabs.push(tab);
            this.activeTabId = tab.id;
        },

        newRequest() { this.newTab(); },

        switchTab(tabId) {
            this.activeTabId = tabId;
        },

        removeTab(tabId) {
            const idx = this.tabs.findIndex(t => t.id === tabId);
            if (idx === -1) return;
            this.tabs.splice(idx, 1);
            if (this.activeTabId === tabId) {
                const next = this.tabs[idx] ?? this.tabs[idx - 1] ?? null;
                this.activeTabId = next?.id ?? null;
            }
            this.persistTabs();
        },

        removeTabs(tabIds) {
            const idSet = new Set(tabIds);
            if (idSet.size === 0) return;
            const activeRemoved = idSet.has(this.activeTabId);
            const oldIdx = this.tabs.findIndex(t => t.id === this.activeTabId);
            this.tabs = this.tabs.filter(t => !idSet.has(t.id));
            if (activeRemoved) {
                const next = this.tabs[oldIdx] ?? this.tabs[oldIdx - 1] ?? this.tabs[0] ?? null;
                this.activeTabId = next?.id ?? null;
            }
            this.persistTabs();
        },

        setLayout(mode) {
            this.layoutMode = mode;
            localStorage.setItem('freeman_layout', mode);
        },

        persistTabs() {
            const ids = this.tabs.filter(t => t.requestId).map(t => t.requestId);
            localStorage.setItem('freeman_open_tabs', JSON.stringify(ids));
            localStorage.setItem('freeman_active_tab', String(this.activeTab?.requestId ?? ''));

            const scratchTabs = this.tabs
                .filter(t => t.requestId === null && t.response !== null)
                .map(({ id, request, response, requestTab, responseTab, responseViewMode, responseForceType, collectionVars, isDirty, savedSnapshot }) =>
                    ({ id, request, response, requestTab, responseTab, responseViewMode, responseForceType, collectionVars, isDirty, savedSnapshot })
                );
            localStorage.setItem('freeman_scratch_tabs', JSON.stringify(scratchTabs));
        },

        async restoreTabs() {
            try {
                const saved       = JSON.parse(localStorage.getItem('freeman_open_tabs') || '[]');
                const activeReqId = localStorage.getItem('freeman_active_tab') || '';

                if (saved.length) {
                    await Promise.all(saved.map(id => this.openRequest(id)));

                    if (activeReqId) {
                        const tab = this.tabs.find(t => String(t.requestId) === activeReqId);
                        if (tab) this.activeTabId = tab.id;
                    }
                }

                const rawScratch = localStorage.getItem('freeman_scratch_tabs');
                if (rawScratch) {
                    const scratchTabs = JSON.parse(rawScratch);
                    for (const stored of scratchTabs) {
                        this.tabs.push({ ...stored, isLoading: false });
                    }
                    if (!this.activeTabId && this.tabs.length) {
                        this.activeTabId = this.tabs[0].id;
                    }
                }
            } catch (e) {
                console.error('restoreTabs:', e);
                localStorage.removeItem('freeman_open_tabs');
                localStorage.removeItem('freeman_active_tab');
                localStorage.removeItem('freeman_scratch_tabs');
            }
        },

        async openRequest(requestId) {
            const existing = this.tabs.find(t => t.requestId === requestId);
            if (existing) { this.activeTabId = existing.id; return; }

            const tab   = this.blankTab();
            const tabId = tab.id;
            tab.requestId = requestId;
            this.tabs.push(tab);
            this.activeTabId = tabId;

            try {
                const res  = await fetch(`/requests/${requestId}`, { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
                const json = await res.json();
                const d    = json.data;
                const ad   = d.auth_data || {};

                const liveTab = this.tabs.find(t => t.id === tabId);
                if (!liveTab) return;

                if (d.collection_id) {
                    await this.loadCollectionVarsForTab(liveTab, d.collection_id);
                }

                liveTab.request = {
                    collection_id: d.collection_id || null,
                    name:          d.name          || 'Untitled',
                    method:        d.method        || 'GET',
                    url:           d.url           || '',
                    params:        Array.isArray(d.params) && d.params.length
                                       ? d.params
                                       : [{ key: '', value: '', enabled: true }],
                    headers:       Array.isArray(d.headers) && d.headers.length
                                       ? d.headers
                                       : [{ key: '', value: '', enabled: true }],
                    body_type:     d.body_type     || 'none',
                    raw_body_type: d.raw_body_type || 'json',
                    body:          d.body          || '',
                    body_form:     Array.isArray(d.body_form) && d.body_form.length
                                       ? d.body_form.map(r => ({ ...r, type: r.type || 'text' }))
                                       : [{ key: '', value: '', enabled: true, type: 'text' }],
                    auth_type:     d.auth_type     || 'none',
                    auth_data: {
                        token:    ad.token    || '',
                        username: ad.username || '',
                        password: ad.password || '',
                        key:      ad.key      || '',
                        value:    ad.value    || '',
                        in:       ad.in       || 'header',
                    },
                };
                liveTab.savedSnapshot = JSON.stringify(liveTab.request);
                liveTab.isDirty       = false;
                this.persistTabs();
            } catch (e) {
                console.error('openRequest:', e);
                this.tabs = this.tabs.filter(t => t.id !== tabId);
                if (this.activeTabId === tabId) {
                    this.activeTabId = this.tabs[this.tabs.length - 1]?.id ?? null;
                }
            }
        },

        // ── Data loading ───────────────────────────────────────────────────
        async loadCollections() {
            this.collectionsLoading = true;
            try {
                const res  = await fetch('/collections', { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
                const json = await res.json();
                this.collections = json.data || [];
            } catch (e) {
                console.error('loadCollections:', e);
                this.collections = [];
            } finally {
                this.collectionsLoading = false;
            }
        },

        async loadEnvironments() {
            try {
                const res  = await fetch('/environments', { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
                const json = await res.json();
                this.environments = Array.isArray(json) ? json : [];
            } catch (e) {
                console.error('loadEnvironments:', e);
                this.environments = [];
            }
        },

        async loadCollectionVarsForTab(tab, collectionId) {
            try {
                const res  = await fetch(`/collections/${collectionId}/variables`, {
                    headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                });
                const json = await res.json();
                const map  = {};
                (json.data || []).forEach(v => { if (v.enabled && v.key) map[v.key] = v.value; });
                tab.collectionVars = map;
            } catch (e) {
                tab.collectionVars = {};
            }
        },

        async loadCurrentCollectionVars(collectionId) {
            if (this.activeTab) {
                await this.loadCollectionVarsForTab(this.activeTab, collectionId);
            }
        },
    });
});
