// src/static/admin/inline-editor.js
(function() {
    console.log("🛠️ Veave CMS Manual Edit Mode v2.1 Active");
    
    let pendingChanges = {}; 
    let isDirty = false;

    // 1. Inject Floating Editor Bar
    if (!document.getElementById('cms-editor-bar')) {
        const bar = document.createElement('div');
        bar.id = 'cms-editor-bar';
        bar.innerHTML = `
            <div class="cms-bar-brand">Veave CMS Edit Mode</div>
            <div class="cms-bar-status" id="cms-save-status">All changes saved</div>
            <div class="cms-bar-actions">
                <button class="cms-btn cms-btn-outline" onclick="window.location.reload()">Discard</button>
                <button class="cms-btn cms-btn-primary" id="cms-save-btn" disabled>Save Changes</button>
            </div>
        `;
        document.body.appendChild(bar);
        document.body.style.paddingTop = '60px';
    }

    // 2. Styles
    if (!document.getElementById('cms-editor-styles')) {
        const style = document.createElement('style');
        style.id = 'cms-editor-styles';
        style.innerHTML = `
            #cms-editor-bar {
                position: fixed; top: 0; left: 0; right: 0; height: 60px;
                background: #154d37; color: white; display: flex; align-items: center;
                justify-content: space-between; padding: 0 30px; z-index: 999999;
                font-family: 'Outfit', sans-serif; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            }
            .cms-bar-brand { font-weight: 700; font-size: 18px; }
            .cms-bar-status { font-size: 13px; opacity: 0.8; }
            .cms-bar-actions { display: flex; gap: 10px; }
            .cms-btn { padding: 8px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; font-size: 13px; }
            .cms-btn-primary { background: #2d6a4f; color: white; }
            .cms-btn-primary:not(:disabled):hover { background: #40916c; }
            .cms-btn-primary:disabled { opacity: 0.3; cursor: not-allowed; }
            .cms-btn-outline { background: transparent; border: 1px solid rgba(255,255,255,0.2); color: white; }
            
            .editable { position: relative; cursor: text; transition: 0.2s; outline: none; min-height: 1em; }
            .editable:hover { outline: 2px dashed rgba(21, 77, 55, 0.4) !important; background: rgba(21, 77, 55, 0.05); }
            .editable:focus { outline: 2px solid #154d37 !important; background: white; }
            
            .is-dirty { border-bottom: 2px solid #fbbf24 !important; }
            
            [data-field]::before {
                content: attr(data-field);
                position: absolute; top: -18px; right: 0; background: #154d37; color: white;
                font-size: 8px; padding: 1px 4px; border-radius: 3px; display: none;
                text-transform: uppercase; font-family: sans-serif; letter-spacing: 0.5px;
            }
            [data-field]:hover::before { display: block; }
        `;
        document.head.appendChild(style);
    }

    const setDirty = (dirty) => {
        console.log("Setting dirty state:", dirty);
        isDirty = dirty;
        const btn = document.getElementById('cms-save-btn');
        const status = document.getElementById('cms-save-status');
        if (btn) btn.disabled = !dirty;
        if (status) status.innerText = dirty ? '⚠️ Unsaved changes' : '✅ All changes saved';
        
        window.onbeforeunload = dirty ? () => "Unsaved changes!" : null;
    };

    const trackChange = (el) => {
        const wrap = el.closest('[data-component-id]');
        if (!wrap) {
            console.warn("Could not find parent component-wrap for field:", el);
            return;
        }
        
        const componentId = wrap.getAttribute('data-component-id');
        const field = el.getAttribute('data-field');
        const newValue = el.innerHTML;
        
        console.log(`Tracking: Comp#${componentId} Field:${field} Value:${newValue.substring(0, 20)}...`);
        
        if (!pendingChanges[componentId]) pendingChanges[componentId] = {};
        pendingChanges[componentId][field] = newValue;
        
        el.classList.add('is-dirty');
        setDirty(true);
    };

    const editables = document.querySelectorAll('.editable');
    console.log(`Found ${editables.length} editable elements.`);
    
    editables.forEach(el => {
        el.contentEditable = "true";
        
        // Listen to multiple events to be safe
        el.addEventListener('input', () => trackChange(el));
        el.addEventListener('keyup', () => trackChange(el));
        el.addEventListener('blur', () => trackChange(el));
    });

    document.getElementById('cms-save-btn').onclick = async () => {
        const btn = document.getElementById('cms-save-btn');
        const status = document.getElementById('cms-save-status');
        
        btn.disabled = true;
        status.innerText = '⌛ Saving...';

        try {
            for (const [id, fields] of Object.entries(pendingChanges)) {
                for (const [field, value] of Object.entries(fields)) {
                    const response = await fetch('/admin/api/components/update/' + id, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            field: field,
                            value: value,
                            _csrf: window.CSRF_TOKEN
                        })
                    });
                    if (!response.ok) throw new Error(await response.text());
                }
            }
            
            pendingChanges = {};
            document.querySelectorAll('.is-dirty').forEach(el => el.classList.remove('is-dirty'));
            setDirty(false);
            status.innerText = '✅ Saved!';
            setTimeout(() => { if (!isDirty) status.innerText = 'All changes saved'; }, 2000);
        } catch (e) {
            console.error("Save failure:", e);
            status.innerText = '❌ Error: ' + e.message;
            btn.disabled = false;
        }
    };
})();
