// freeman-shell.js
// workspaceShell — root Alpine component for workspace.blade.php.
// Owns layout state (sidebarTab, env menus) and proxies shared store data to templates.

document.addEventListener('alpine:init', () => {
    Alpine.data('workspaceShell', () => ({

        // ── Layout state ───────────────────────────────────────────────────
        sidebarTab:  'collections',
        userMenuOpen: false,
        envMenuOpen:  false,
        contextMenu: { open: false, x: 0, y: 0, tabId: null },

        // ── Store proxies (keep templates in workspace.blade.php unchanged) ─
        get tabs()              { return Alpine.store('workspace').tabs; },
        get activeTabId()       { return Alpine.store('workspace').activeTabId; },
        get activeTab()         { return Alpine.store('workspace').activeTab; },
        get collections()       { return Alpine.store('workspace').collections; },
        get collectionsLoading(){ return Alpine.store('workspace').collectionsLoading; },
        get environments()      { return Alpine.store('workspace').environments; },
        get activeEnvironment() { return Alpine.store('workspace').activeEnvironment; },

        // ── Tab method proxies ─────────────────────────────────────────────
        newTab()         { Alpine.store('workspace').newTab(); },
        newRequest()     { Alpine.store('workspace').newTab(); },
        switchTab(id)    { Alpine.store('workspace').switchTab(id); },
        methodColor(m)   { return methodColor(m); },

        _closeTabs(tabIds) {
            const store   = Alpine.store('workspace');
            const targets = store.tabs.filter(t => tabIds.includes(t.id));
            if (!targets.length) return;

            const dirtyCount = targets.filter(t => t.isDirty).length;
            if (dirtyCount > 0) {
                const label = dirtyCount === 1 ? 'tab has' : 'tabs have';
                if (!confirm(`${dirtyCount} ${label} unsaved changes. Close anyway?`)) return;
            }

            targets.forEach(t => {
                // Clean up file input map
                if (window.__fileInputMap) {
                    Object.keys(window.__fileInputMap)
                        .filter(k => k.startsWith(t.id + '_'))
                        .forEach(k => delete window.__fileInputMap[k]);
                }

                // Notify requestBuilderComponent to clean its reactive fileSelectedMap
                window.dispatchEvent(new CustomEvent('freeman:tab-closed', { detail: { tabId: t.id } }));
            });

            store.removeTabs(targets.map(t => t.id));
        },

        closeTab(tabId) { this._closeTabs([tabId]); },

        closeAllTabs() {
            this._closeTabs(this.tabs.map(t => t.id));
            this.closeTabContextMenu();
        },

        closeOtherTabs(tabId) {
            this._closeTabs(this.tabs.filter(t => t.id !== tabId).map(t => t.id));
            this.closeTabContextMenu();
        },

        closeTabsToRight(tabId) {
            const idx = this.tabs.findIndex(t => t.id === tabId);
            if (idx === -1) return;
            this._closeTabs(this.tabs.slice(idx + 1).map(t => t.id));
            this.closeTabContextMenu();
        },

        closeTabsToLeft(tabId) {
            const idx = this.tabs.findIndex(t => t.id === tabId);
            if (idx === -1) return;
            this._closeTabs(this.tabs.slice(0, idx).map(t => t.id));
            this.closeTabContextMenu();
        },

        openTabContextMenu(event, tabId) {
            this.contextMenu = {
                open: true,
                x: Math.min(event.clientX, window.innerWidth - 190),
                y: event.clientY,
                tabId,
            };
        },

        closeTabContextMenu() {
            this.contextMenu.open = false;
        },

        // ── Init ──────────────────────────────────────────────────────────
        init() {
            Alpine.store('workspace').loadCollections();
            Alpine.store('workspace').loadEnvironments();
            Alpine.store('workspace').restoreTabs();

            // Ctrl+S → dispatch to saveModalComponent
            window.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent('freeman:save-request'));
                }
            });
        },

        // ── Environment actions ────────────────────────────────────────────
        async activateEnvironment(id) {
            try {
                await fetch(`/environments/${id}/activate`, {
                    method: 'POST',
                    headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content },
                });
                this.envMenuOpen = false;
                await Alpine.store('workspace').loadEnvironments();
            } catch (e) { console.error('activateEnvironment:', e); }
        },

        async deactivateEnvironment() {
            try {
                await fetch('/environments/deactivate', {
                    method: 'POST',
                    headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content },
                });
                this.envMenuOpen = false;
                await Alpine.store('workspace').loadEnvironments();
            } catch (e) { console.error('deactivateEnvironment:', e); }
        },
    }));
});
