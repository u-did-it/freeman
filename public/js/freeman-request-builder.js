// freeman-request-builder.js
// requestBuilderComponent — request/response panel state and logic.
// Mounted on the wrapper div that contains workspace/request-builder.blade.php.

document.addEventListener('alpine:init', () => {
    Alpine.data('requestBuilderComponent', () => ({

        // ── State ──────────────────────────────────────────────────────────
        fileSelectedMap: {},
        urlFocused:      false,
        responseCopied:  false,
        splitPct:        parseFloat(localStorage.getItem('freeman_split_pct') || '42'),
        layoutMenuOpen:  false,
        varTooltip:      { show: false, text: '', x: 0, y: 0, isUndef: false },
        varAc:           { show: false, suggestions: [], x: 0, y: 0, anchor: null, activeIdx: -1 },
        jsonFilterOpen:  false,
        jsonFilter:      '',
        jsonFilterHistory: [],
        jsonPathResult:  null,
        jsonPathError:   '',
        jsonPathCount:   0,
        jsonMatchIndex:  -1,

        // ── Store proxies ──────────────────────────────────────────────────
        get activeTab() { return Alpine.store('workspace').activeTab; },

        get responseDetectedType() {
            if (!this.activeTab?.response?.response_headers) return 'text';
            return detectContentType(this.activeTab.response.response_headers);
        },
        get filledParamCount() {
            return (this.activeTab?.request.params || []).filter(p => p.key.trim()).length;
        },
        get filledHeaderCount() {
            return (this.activeTab?.request.headers || []).filter(h => h.key.trim()).length;
        },

        // ── Init ──────────────────────────────────────────────────────────
        init() {
            // Clean up fileSelectedMap when a tab is closed by the shell
            window.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'f' && this.responseDetectedType === 'json'
                    && this.activeTab?.responseViewMode === 'pretty'
                    && this.activeTab?.response?.success) {
                    e.preventDefault();
                    this.toggleJsonFilter();
                }
            });
            this.$watch('jsonFilter', (q) => {
                if (!q.trim() || q.trim().startsWith('$')) {
                    this.jsonMatchIndex = -1;
                    if (!q.trim()) { this.jsonPathCount = 0; this.jsonPathResult = null; this.jsonPathError = ''; }
                    return;
                }
                // text search mode: count from DOM after x-html renders
                this.$nextTick(() => {
                    this.jsonPathCount  = document.querySelectorAll('.jf-match').length;
                    this.jsonMatchIndex = -1;
                });
            });
            window.addEventListener('freeman:tab-closed', (e) => {
                const tabId   = e.detail.tabId;
                const updated = { ...this.fileSelectedMap };
                Object.keys(updated).filter(k => k.startsWith(tabId + '_')).forEach(k => delete updated[k]);
                this.fileSelectedMap = updated;
            });
        },

        // ── Dirty tracking ─────────────────────────────────────────────────
        markDirty() {
            const tab = this.activeTab;
            if (!tab || tab.savedSnapshot === null) return;
            tab.isDirty = JSON.stringify(tab.request) !== tab.savedSnapshot;
        },

        // ── Save (delegates to saveModalComponent via window event) ────────
        saveRequest() {
            window.dispatchEvent(new CustomEvent('freeman:save-request'));
        },

        // ── Refresh (re-fetches saved request from server) ────────────────
        async refreshRequest() {
            const tab = this.activeTab;
            const id  = tab?.requestId;
            if (!id) return;
            if (tab.isDirty && !confirm('You have unsaved changes. Refresh anyway and lose them?')) return;

            try {
                const res  = await fetch(`/requests/${id}`, { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
                const json = await res.json();
                const d    = json.data;
                const ad   = d.auth_data || {};
                const store = Alpine.store('workspace');

                if (d.collection_id) {
                    await store.loadCollectionVarsForTab(tab, d.collection_id);
                }

                tab.request = {
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
                tab.savedSnapshot = JSON.stringify(tab.request);
                tab.isDirty       = false;
                store.persistTabs();
            } catch (e) {
                console.error('refreshRequest:', e);
            }
        },

        // ── Send ──────────────────────────────────────────────────────────
        async sendRequest() {
            const tab = this.activeTab;
            if (!tab || !tab.request.url.trim() || tab.isLoading) return;

            if (tab.request.body_type === 'form-data') {
                const missingFiles = [];
                tab.request.body_form.forEach((r, i) => {
                    if (r.enabled && r.key.trim() && r.type === 'file') {
                        const mapKey = `${tab.id}_${i}`;
                        if (!(window.__fileInputMap && window.__fileInputMap[mapKey])) {
                            missingFiles.push(r.key);
                        }
                    }
                });
                if (missingFiles.length) {
                    const names = missingFiles.map(n => `"${n}"`).join(', ');
                    tab.response = { success: false, error: `File required for field${missingFiles.length > 1 ? 's' : ''}: ${names}`, status: 0, response_time_ms: 0, response_body: '', response_headers: {} };
                    tab.responseTab = 'body';
                    return;
                }
            }

            tab.isLoading = true;
            tab.response  = null;

            const url = tab.request.url;
            const qp  = tab.request.params.filter(p => p.enabled && p.key.trim());

            let effectiveHeaders = tab.request.headers.filter(h => h.key.trim());
            if (tab.request.body_type === 'raw') {
                const hasContentType = effectiveHeaders.some(h => h.key.toLowerCase() === 'content-type');
                if (!hasContentType) {
                    const ctMap = { text: 'text/plain', json: 'application/json', javascript: 'application/javascript', xml: 'application/xml', html: 'text/html' };
                    const ct = ctMap[tab.request.raw_body_type] ?? 'application/json';
                    effectiveHeaders = [{ key: 'Content-Type', value: ct, enabled: true }, ...effectiveHeaders];
                }
            }

            const hasFileRows = tab.request.body_type === 'form-data' &&
                tab.request.body_form.some(r => r.enabled && r.key.trim() && r.type === 'file');

            try {
                let res;

                if (hasFileRows) {
                    const fd = new FormData();
                    fd.append('method',        tab.request.method);
                    fd.append('url',           url);
                    fd.append('body_type',     'form-data');
                    fd.append('auth_type',     tab.request.auth_type);
                    fd.append('auth_data',     JSON.stringify(tab.request.auth_data));
                    fd.append('request_id',    tab.requestId    ?? '');
                    fd.append('collection_id', tab.request.collection_id ?? '');
                    fd.append('headers',       JSON.stringify(effectiveHeaders));
                    fd.append('params',        JSON.stringify(qp));

                    let formIndex = 0;
                    tab.request.body_form.forEach((row, originalIndex) => {
                        if (!row.enabled || !row.key.trim()) return;
                        fd.append(`body_form[${formIndex}][key]`,  row.key);
                        fd.append(`body_form[${formIndex}][type]`, row.type || 'text');
                        if (row.type === 'file') {
                            const mapKey = `${tab.id}_${originalIndex}`;
                            fd.append(`body_form_files[${formIndex}]`, window.__fileInputMap[mapKey]);
                        } else {
                            fd.append(`body_form[${formIndex}][value]`, row.value || '');
                        }
                        formIndex++;
                    });

                    res = await fetch('/run', {
                        method: 'POST',
                        headers: {
                            'Accept':           'application/json',
                            'X-CSRF-TOKEN':     document.querySelector('meta[name="csrf-token"]').content,
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        body: fd,
                    });
                } else {
                    let body = tab.request.body;
                    if (['form-data', 'x-www-form-urlencoded'].includes(tab.request.body_type)) {
                        body = JSON.stringify(tab.request.body_form.filter(r => r.key.trim()));
                    }

                    res = await fetch('/run', {
                        method: 'POST',
                        headers: {
                            'Content-Type':     'application/json',
                            'Accept':           'application/json',
                            'X-CSRF-TOKEN':     document.querySelector('meta[name="csrf-token"]').content,
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        body: JSON.stringify({
                            method:        tab.request.method,
                            url,
                            headers:       effectiveHeaders,
                            body_type:     tab.request.body_type,
                            body,
                            auth_type:     tab.request.auth_type,
                            auth_data:     tab.request.auth_data,
                            request_id:    tab.requestId,
                            collection_id: tab.request.collection_id,
                            params:        qp,
                        }),
                    });
                }

                const data = await res.json();
                if (!res.ok && data.success === undefined) {
                    const firstError = data.errors ? Object.values(data.errors)[0]?.[0] : null;
                    tab.response = {
                        success: false,
                        error: firstError || data.message || `Request failed (HTTP ${res.status})`,
                        status: res.status,
                        response_time_ms: 0,
                        response_body: '',
                        response_headers: {},
                    };
                } else {
                    tab.response = data;
                }
                tab.responseTab = 'body';
            } catch (e) {
                tab.response = { success: false, error: e.message, status: 0, response_time_ms: 0, response_body: '', response_headers: {} };
            } finally {
                tab.isLoading = false;
                if (tab.requestId === null) {
                    Alpine.store('workspace').persistTabs();
                }
            }
        },

        // ── Split drag ─────────────────────────────────────────────────────
        startSplitDrag(e) {
            const container  = this.$refs.splitContainer;
            const sideBySide = Alpine.store('workspace').layoutMode === 'side-by-side';
            const onMove = (mv) => {
                const rect = container.getBoundingClientRect();
                const pct  = sideBySide
                    ? ((mv.clientX - rect.left) / rect.width)  * 100
                    : ((mv.clientY - rect.top)  / rect.height) * 100;
                this.splitPct = Math.min(Math.max(pct, 15), 80);
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup',  onUp);
                localStorage.setItem('freeman_split_pct', this.splitPct.toFixed(1));
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',   onUp);
        },

        // ── Key-value row helpers ──────────────────────────────────────────
        addParam()       { this.activeTab?.request.params.push({ key: '', value: '', enabled: true }); },
        removeParam(i)   { this.activeTab?.request.params.splice(i, 1); },
        addHeader()      { this.activeTab?.request.headers.push({ key: '', value: '', enabled: true }); },
        removeHeader(i)  { this.activeTab?.request.headers.splice(i, 1); },
        addFormRow()     { this.activeTab?.request.body_form.push({ key: '', value: '', enabled: true, type: 'text' }); },

        removeFormRow(i) {
            const tabId = this.activeTab?.id;
            const len   = this.activeTab?.request.body_form.length ?? 0;
            if (tabId) {
                window.__fileInputMap = window.__fileInputMap || {};
                delete window.__fileInputMap[`${tabId}_${i}`];
                for (let j = i + 1; j < len; j++) {
                    const old = `${tabId}_${j}`;
                    if (window.__fileInputMap[old] !== undefined) {
                        window.__fileInputMap[`${tabId}_${j - 1}`] = window.__fileInputMap[old];
                        delete window.__fileInputMap[old];
                    }
                }
                const updated = { ...this.fileSelectedMap };
                delete updated[`${tabId}_${i}`];
                for (let j = i + 1; j < len; j++) {
                    const old = `${tabId}_${j}`;
                    if (updated[old] !== undefined) {
                        updated[`${tabId}_${j - 1}`] = updated[old];
                        delete updated[old];
                    }
                }
                this.fileSelectedMap = updated;
            }
            this.activeTab?.request.body_form.splice(i, 1);
        },

        storeFile(event, rowIndex) {
            const tabId  = this.activeTab?.id;
            const mapKey = `${tabId}_${rowIndex}`;
            window.__fileInputMap = window.__fileInputMap || {};
            const file = event.target.files[0] || null;
            window.__fileInputMap[mapKey] = file;
            this.fileSelectedMap = { ...this.fileSelectedMap, [mapKey]: !!file };
        },

        clearFileForRow(rowIndex) {
            const tabId  = this.activeTab?.id;
            const mapKey = `${tabId}_${rowIndex}`;
            if (window.__fileInputMap) delete window.__fileInputMap[mapKey];
            const updated = { ...this.fileSelectedMap };
            delete updated[mapKey];
            this.fileSelectedMap = updated;
        },

        // ── URL variable highlight ─────────────────────────────────────────
        highlightUrl(url) {
            if (!url) return '';
            const vars = this.activeTab?.collectionVars ?? {};
            return escHtml(url).replace(/\{\{([^}]*)\}\}/g, (match, key) => {
                const k = key.trim();
                if (k in vars) {
                    return `<mark class="url-var url-var-ok" data-name="${escHtml(k)}" data-val="${escHtml(vars[k])}">{{${escHtml(key)}}}</mark>`;
                }
                return `<mark class="url-var url-var-err" data-name="${escHtml(k)}">{{${escHtml(key)}}}</mark>`;
            });
        },

        highlightVars(text) { return this.highlightUrl(text); },

        // Overlay {{var}} marks onto HTML already produced by a syntax highlighter.
        // Safe because { and } are not HTML special chars, so they survive escHtml unchanged.
        overlayVarMarks(html) {
            if (!html) return html;
            const vars = this.activeTab?.collectionVars ?? {};
            return html.replace(/\{\{([^}]*)\}\}/g, (match, key) => {
                const k = key.trim();
                if (k in vars) {
                    return `<mark class="url-var url-var-ok" data-name="${escHtml(k)}" data-val="${escHtml(vars[k])}">{{${escHtml(key)}}}</mark>`;
                }
                return `<mark class="url-var url-var-err" data-name="${escHtml(k)}">{{${escHtml(key)}}}</mark>`;
            });
        },

        // ── Variable hover tooltip ─────────────────────────────────────────
        onVarHover(event) {
            const wrap  = event.currentTarget;
            const input = wrap.querySelector('input, textarea');
            if (!input) return;

            input.style.pointerEvents = 'none';
            const el = document.elementFromPoint(event.clientX, event.clientY);
            input.style.pointerEvents = '';

            if (el && el.classList && el.classList.contains('url-var')) {
                const isUndef = el.classList.contains('url-var-err');
                const rect    = el.getBoundingClientRect();
                this.varTooltip = {
                    show:    true,
                    text:    isUndef ? '' : (el.dataset.val ?? ''),
                    name:    el.dataset.name ?? '',
                    x:       rect.left + rect.width / 2,
                    y:       rect.top,
                    isUndef,
                };
            } else {
                this.varTooltip.show = false;
            }
        },

        // ── Variable autocomplete ──────────────────────────────────────────
        checkVarAc(event) {
            const el = event.target;
            if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
            const vars = this.activeTab?.collectionVars ?? {};
            if (!Object.keys(vars).length) { this.varAc.show = false; return; }

            const val    = el.value;
            const pos    = el.selectionStart ?? val.length;
            const before = val.slice(0, pos);
            const openAt = before.lastIndexOf('{{');

            if (openAt === -1 || before.slice(openAt + 2).includes('}}')) {
                this.varAc.show = false;
                return;
            }

            const query       = before.slice(openAt + 2).toLowerCase();
            const suggestions = Object.keys(vars).filter(k => k.toLowerCase().includes(query));

            if (!suggestions.length) { this.varAc.show = false; return; }

            const rect     = el.getBoundingClientRect();
            const computed = getComputedStyle(el);
            const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.4;

            const mirror = document.createElement('div');
            mirror.style.cssText = [
                'position:fixed', 'visibility:hidden', 'pointer-events:none', 'overflow:hidden',
                `font:${computed.font}`,
                `letter-spacing:${computed.letterSpacing}`,
                `padding:${computed.padding}`,
                `border:${computed.border}`,
                `box-sizing:${computed.boxSizing}`,
            ].join(';');

            if (el.tagName === 'INPUT') {
                mirror.style.whiteSpace = 'pre';
                mirror.textContent = before;
                document.body.appendChild(mirror);
                const textWidth = mirror.getBoundingClientRect().width;
                this.varAc.x = rect.left + textWidth;
                this.varAc.y = rect.bottom + 4;
                document.body.removeChild(mirror);
            } else {
                mirror.style.whiteSpace    = 'pre-wrap';
                mirror.style.wordBreak     = 'break-word';
                mirror.style.width         = rect.width + 'px';
                mirror.style.top           = rect.top + 'px';
                mirror.style.left          = rect.left + 'px';
                const textNode = document.createTextNode(before);
                const marker   = document.createElement('span');
                marker.textContent = '​';
                mirror.appendChild(textNode);
                mirror.appendChild(marker);
                document.body.appendChild(mirror);
                const mTop       = parseFloat(computed.paddingTop) || 0;
                const markerRect = marker.getBoundingClientRect();
                this.varAc.x = markerRect.left;
                this.varAc.y = markerRect.top + mTop - el.scrollTop + lineHeight + 2;
                document.body.removeChild(mirror);
            }

            this.varAc.suggestions = suggestions;
            this.varAc.anchor      = el;
            this.varAc.activeIdx   = 0;
            this.varAc.show        = true;
        },

        varAcKeydown(event) {
            if (!this.varAc.show) return;
            const len = this.varAc.suggestions.length;
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.varAc.activeIdx = (this.varAc.activeIdx + 1) % len;
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.varAc.activeIdx = (this.varAc.activeIdx - 1 + len) % len;
            } else if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                event.stopImmediatePropagation();
                this.selectVarAc(this.varAc.suggestions[this.varAc.activeIdx]);
            }
        },

        selectVarAc(name) {
            const el = this.varAc.anchor;
            if (!el) return;

            const val    = el.value;
            const pos    = el.selectionStart ?? val.length;
            const before = val.slice(0, pos);
            const openAt = before.lastIndexOf('{{');
            const newVal = val.slice(0, openAt) + '{{' + name + '}}' + val.slice(pos);
            const newPos = openAt + name.length + 4;

            el.value = newVal;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(() => { el.focus(); el.setSelectionRange(newPos, newPos); }, 0);
            this.varAc.show = false;
        },

        // ── Response body rendering ────────────────────────────────────────
        renderResponseBody(body, headers) {
            if (!body) return '<span style="color:var(--color-border-input);">— empty response —</span>';
            const tab  = this.activeTab;
            const type = (tab?.responseForceType !== 'auto' ? tab?.responseForceType : null)
                ?? detectContentType(headers);
            if (type === 'image') {
                const mime = this._getMimeFromHeaders(headers) || 'image/png';
                return `<img src="data:${mime};base64,${body}" class="max-w-full h-auto block" alt="image response" style="border-radius:4px;">`;
            }
            if (type === 'audio') {
                const mime = this._getMimeFromHeaders(headers) || 'audio/mpeg';
                return `<audio controls class="w-full mt-1"><source src="data:${mime};base64,${body}" type="${mime}"></audio>`;
            }
            if (this.jsonFilterOpen && this.jsonFilter.trim() && type === 'json' && tab?.responseViewMode !== 'raw') {
                const q = this.jsonFilter.trim();
                if (q.startsWith('$')) {
                    // JSONPath mode
                    try {
                        const fn      = typeof JSONPath === 'function' ? JSONPath : JSONPath.JSONPath;
                        const results = fn({ path: q, json: JSON.parse(body) });
                        this.jsonPathResult = results;
                        this.jsonPathCount  = results.length;
                        this.jsonPathError  = '';
                        if (results.length === 0) return '<span style="color:var(--color-text-muted-4);font-style:italic;">No matches for this JSONPath.</span>';
                        return renderFoldableJson(results);
                    } catch {
                        this.jsonPathResult = null;
                        this.jsonPathCount  = 0;
                        this.jsonPathError  = 'Invalid JSONPath expression';
                    }
                } else {
                    // Plain text highlight mode — count updated via $watch + $nextTick after DOM renders
                    try {
                        const html = renderFoldableJson(JSON.parse(body), q);
                        this.jsonPathResult = null;
                        this.jsonPathError  = '';
                        return html;
                    } catch { /* fall through */ }
                }
            }
            if (tab?.responseViewMode === 'raw')   return escHtml(body);
            if (type === 'json')                   return this.highlightJson(body);
            if (type === 'xml' || type === 'html') return this.highlightXml(body);
            if (type === 'javascript')             return this.highlightJsEditor(body);
            return escHtml(body);
        },

        _getMimeFromHeaders(headers) {
            if (!headers) return null;
            const entry = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type');
            return entry ? entry[1].split(';')[0].trim() : null;
        },

        async copyResponseBody() {
            const body = this.activeTab?.response?.response_body;
            if (!body) return;
            try {
                await navigator.clipboard.writeText(body);
                this.responseCopied = true;
                setTimeout(() => { this.responseCopied = false; }, 2000);
            } catch {}
        },

        // ── Body content highlight (request editor) ────────────────────────
        highlightBodyContent(text) {
            if (!text) return '';
            const type = this.activeTab?.request.raw_body_type;
            if (type === 'json')                   return this.overlayVarMarks(this.highlightJsonEditor(text));
            if (type === 'xml' || type === 'html') return this.overlayVarMarks(this.highlightXmlEditor(text));
            if (type === 'javascript')             return this.overlayVarMarks(this.highlightJsEditor(text));
            return this.highlightVars(text);
        },

        formatBody() {
            const tab = this.activeTab;
            if (!tab) return;
            const type = tab.request.raw_body_type;
            const src  = tab.request.body ?? '';
            if (type === 'json') {
                try { tab.request.body = JSON.stringify(JSON.parse(src), null, 2); } catch {}
            } else if (type === 'xml' || type === 'html') {
                try {
                    let depth = 0;
                    tab.request.body = src
                        .replace(/>\s*</g, '>\n<')
                        .split('\n')
                        .map(raw => {
                            const line = raw.trim();
                            if (!line) return null;
                            if (/^<\//.test(line) || /^-->/.test(line)) depth = Math.max(0, depth - 1);
                            const out = '  '.repeat(depth) + line;
                            if (/^<[^/?!]/.test(line) && !line.endsWith('/>') && !/<\//.test(line)) depth++;
                            return out;
                        })
                        .filter(l => l !== null)
                        .join('\n');
                } catch {}
            }
        },

        // ── JSON / XML / JS highlighters (request editor) ─────────────────
        highlightJsonEditor(body) {
            if (!body) return '';
            const len = body.length;
            let html = '';
            let i = 0;
            while (i < len) {
                const ch = body[i];
                if (ch === '"') {
                    let j = i + 1;
                    while (j < len) {
                        if (body[j] === '\\') { j += 2; continue; }
                        if (body[j] === '"')  { j++; break; }
                        j++;
                    }
                    const token = body.slice(i, j);
                    let k = j;
                    while (k < len && (body[k] === ' ' || body[k] === '\t' || body[k] === '\n' || body[k] === '\r')) k++;
                    const isKey = body[k] === ':';
                    html += isKey
                        ? `<span class="json-key">${escHtml(token)}</span>`
                        : `<span class="json-str">${escHtml(token)}</span>`;
                    i = j;
                } else if (body.startsWith('true', i)) {
                    html += '<span class="json-bool">true</span>';  i += 4;
                } else if (body.startsWith('false', i)) {
                    html += '<span class="json-bool">false</span>'; i += 5;
                } else if (body.startsWith('null', i)) {
                    html += '<span class="json-null">null</span>';  i += 4;
                } else if (ch === '-' || (ch >= '0' && ch <= '9')) {
                    let j = i;
                    if (body[j] === '-') j++;
                    while (j < len && body[j] >= '0' && body[j] <= '9') j++;
                    if (j < len && body[j] === '.') { j++; while (j < len && body[j] >= '0' && body[j] <= '9') j++; }
                    if (j < len && (body[j] === 'e' || body[j] === 'E')) {
                        j++;
                        if (j < len && (body[j] === '+' || body[j] === '-')) j++;
                        while (j < len && body[j] >= '0' && body[j] <= '9') j++;
                    }
                    html += `<span class="json-num">${body.slice(i, j)}</span>`;
                    i = j;
                } else {
                    html += escHtml(ch);
                    i++;
                }
            }
            return html;
        },

        highlightXmlEditor(body) {
            if (!body) return '';
            const esc = escHtml(body);
            return esc
                .replace(/(&lt;!--[\s\S]*?--&gt;)/g,
                    '<span class="xml-comment">$1</span>')
                .replace(/(&lt;\?[\s\S]*?\?&gt;)/g,
                    '<span class="xml-bracket">$1</span>')
                .replace(
                    /(&lt;\/?)([\w][\w:.-]*)((?:[^&]|&(?!gt;))*?)(\/?&gt;)/g,
                    (_, open, tag, attrs, close) => {
                        const coloredAttrs = attrs
                            .replace(/([\w][\w:.-]*)=/g, '<span class="xml-attr">$1</span>=')
                            .replace(/=("(?:[^"])*")/g,  '=<span class="xml-val">$1</span>');
                        return '<span class="xml-bracket">' + open  + '</span>'
                             + '<span class="xml-tag">'     + tag   + '</span>'
                             + coloredAttrs
                             + '<span class="xml-bracket">' + close + '</span>';
                    }
                );
        },

        highlightJsEditor(body) {
            if (!body) return '';
            const esc = escHtml(body);
            return esc
                .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="xml-comment">$1</span>')
                .replace(/(\/\/[^\n]*)/g,        '<span class="xml-comment">$1</span>');
        },

        // ── JSONPath filter ─────────────────────────────────────────────────
        toggleJsonFilter() {
            this.jsonFilterOpen = !this.jsonFilterOpen;
            if (this.jsonFilterOpen) {
                const rid = this.activeTab?.request?.id ?? 'scratch';
                try { this.jsonFilterHistory = JSON.parse(localStorage.getItem(`freeman_jf_history_${rid}`) || '[]'); }
                catch { this.jsonFilterHistory = []; }
                setTimeout(() => document.getElementById('jf-filter-input')?.focus(), 50);
            } else {
                this.jsonFilter     = '';
                this.jsonPathResult = null;
                this.jsonPathError  = '';
                this.jsonPathCount  = 0;
            }
        },
        nextMatch() {
            const marks = Array.from(document.querySelectorAll('.jf-match'));
            if (!marks.length) return;
            this.jsonPathCount = marks.length;
            if (this.jsonMatchIndex >= 0 && this.jsonMatchIndex < marks.length)
                marks[this.jsonMatchIndex].classList.remove('jf-match-active');
            this.jsonMatchIndex = (this.jsonMatchIndex + 1) % marks.length;
            marks[this.jsonMatchIndex].classList.add('jf-match-active');
            marks[this.jsonMatchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        prevMatch() {
            const marks = Array.from(document.querySelectorAll('.jf-match'));
            if (!marks.length) return;
            this.jsonPathCount = marks.length;
            if (this.jsonMatchIndex >= 0 && this.jsonMatchIndex < marks.length)
                marks[this.jsonMatchIndex].classList.remove('jf-match-active');
            this.jsonMatchIndex = (this.jsonMatchIndex - 1 + marks.length) % marks.length;
            marks[this.jsonMatchIndex].classList.add('jf-match-active');
            marks[this.jsonMatchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        removeHistoryItem(query) {
            const rid = this.activeTab?.request?.id ?? 'scratch';
            const key = `freeman_jf_history_${rid}`;
            this.jsonFilterHistory = this.jsonFilterHistory.filter(h => h !== query);
            try { localStorage.setItem(key, JSON.stringify(this.jsonFilterHistory)); } catch {}
        },
        saveFilterToHistory(query) {
            if (!query.trim()) return;
            const rid = this.activeTab?.request?.id ?? 'scratch';
            const key = `freeman_jf_history_${rid}`;
            let hist  = this.jsonFilterHistory.filter(h => h !== query);
            hist.unshift(query);
            hist = hist.slice(0, 5);
            this.jsonFilterHistory = hist;
            try { localStorage.setItem(key, JSON.stringify(hist)); } catch {}
        },

        // ── JSON / XML highlighters (response viewer) ──────────────────────
        highlightJson(body) {
            try { return renderFoldableJson(JSON.parse(body)); }
            catch { return '<span class="json-punct">' + escHtml(body) + '</span>'; }
        },

        highlightXml(body) {
            let fmt;
            try {
                let depth = 0;
                fmt = body
                    .replace(/>\s*</g, '>\n<')
                    .split('\n')
                    .map(raw => {
                        const line = raw.trim();
                        if (!line) return null;
                        if (/^<\//.test(line) || /^-->/.test(line)) depth = Math.max(0, depth - 1);
                        const out = '  '.repeat(depth) + line;
                        if (/^<[^/?!]/.test(line) && !line.endsWith('/>') && !/<\//.test(line)) depth++;
                        return out;
                    })
                    .filter(l => l !== null)
                    .join('\n');
            } catch { fmt = body; }

            const esc = escHtml(fmt);
            return esc
                .replace(/(&lt;!--[\s\S]*?--&gt;)/g,
                    '<span class="xml-comment">$1</span>')
                .replace(/(&lt;\?[\s\S]*?\?&gt;)/g,
                    '<span class="xml-bracket">$1</span>')
                .replace(
                    /(&lt;\/?)([\w][\w:.-]*)((?:[^&]|&(?!gt;))*?)(\/?&gt;)/g,
                    (_, open, tag, attrs, close) => {
                        const coloredAttrs = attrs
                            .replace(/([\w][\w:.-]*)=/g, '<span class="xml-attr">$1</span>=')
                            .replace(/=("(?:[^"])*")/g,  '=<span class="xml-val">$1</span>');
                        return '<span class="xml-bracket">' + open  + '</span>'
                             + '<span class="xml-tag">'     + tag   + '</span>'
                             + coloredAttrs
                             + '<span class="xml-bracket">' + close + '</span>';
                    }
                );
        },
    }));
});
