document.addEventListener('DOMContentLoaded', () => {
    // Only run if admin is detected (already handled by the template condition)
    console.log('⬡ CMS Inline Editor active');

    const saveChanges = async (componentId, field, value) => {
        try {
            const res = await fetch('/admin/api/components/save-field', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: componentId, field, value })
            });
            if (res.ok) {
                console.log(`Saved ${field} for component ${componentId}`);
                return true;
            }
        } catch (err) {
            console.error('Save error:', err);
        }
        return false;
    };

    const flash = (el, success) => {
        el.style.transition = 'background 0.3s';
        el.style.backgroundColor = success ? 'rgba(76, 175, 125, 0.2)' : 'rgba(229, 77, 77, 0.2)';
        setTimeout(() => el.style.backgroundColor = '', 500);
    };

    // 1. Textfields (ContentEditable)
    document.querySelectorAll('.edit-textfield').forEach(el => {
        el.setAttribute('contenteditable', 'true');
        el.addEventListener('blur', async () => {
            const compId = el.closest('[data-id]').getAttribute('data-id');
            const field = el.getAttribute('data-field');
            const success = await saveChanges(compId, field, el.innerHTML);
            flash(el, success);
        });
    });

    // 2. Links
    document.querySelectorAll('.edit-link').forEach(el => {
        el.addEventListener('click', async (e) => {
            if (e.shiftKey || e.ctrlKey || e.metaKey) return; // Allow normal following with modifier
            e.preventDefault();
            const currentUrl = el.getAttribute('href');
            const newUrl = prompt('Enter new URL:', currentUrl);
            if (newUrl !== null && newUrl !== currentUrl) {
                const compId = el.closest('[data-id]').getAttribute('data-id');
                const field = el.getAttribute('data-field');
                const success = await saveChanges(compId, field, newUrl);
                if (success) {
                    el.setAttribute('href', newUrl);
                    flash(el, true);
                }
            }
        });
    });

    // 3. Images (URL and Alt)
    document.querySelectorAll('.edit-image').forEach(el => {
        el.addEventListener('click', async (e) => {
            e.preventDefault();
            const currentSource = el.getAttribute('src');
            const newSource = prompt('Enter new Image URL:', currentSource);
            if (newSource !== null && newSource !== currentSource) {
                const compId = el.closest('[data-id]').getAttribute('data-id');
                const field = el.getAttribute('data-field');
                const success = await saveChanges(compId, field, newSource);
                if (success) {
                    el.setAttribute('src', newSource);
                    flash(el, true);
                }
            }
        });
    });

    document.querySelectorAll('.edit-alt').forEach(el => {
        el.addEventListener('contextmenu', async (e) => { // Right click for ALT text
            e.preventDefault();
            const currentAlt = el.getAttribute('alt');
            const newAlt = prompt('Enter new Alt Text:', currentAlt);
            if (newAlt !== null && newAlt !== currentAlt) {
                const compId = el.closest('[data-id]').getAttribute('data-id');
                const field = el.getAttribute('data-field') + '_alt';
                const success = await saveChanges(compId, field, newAlt);
                if (success) {
                    el.setAttribute('alt', newAlt);
                    flash(el, true);
                }
            }
        });
    });
});
