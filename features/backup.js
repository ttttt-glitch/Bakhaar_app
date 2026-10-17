/*
 =====================================================================
  features/backup.js  —  Backup & Restore for "Xisaabta Ganacsigaaga"
 =====================================================================

  WHAT IT DOES
  - 📥 Download: collects EVERY localStorage key that starts with "ganacsi_",
    puts them in one JSON file and downloads it as bakhaar_backup_YYYY-MM-DD.json
  - 📤 Restore: reads such a file, checks it carefully, asks for confirmation,
    then REPLACES the app's data with the file's data and reloads the app.
  - ↩️ Undo: before every restore the current data is kept once, so a wrong
    restore can be undone with one tap (button appears only when possible).

  SAFETY RULES
  - Nothing is touched until the file has been read, parsed and checked.
  - If anything fails while writing (for example the phone is full), the
    old data is put back exactly as it was.
  - Subscription / licence keys (PROTECTED_KEYS below) are saved in the
    backup but are NEVER written back by a restore. Otherwise an old backup
    could be used to re-use a monthly code, undo the clock guard or move
    a subscription / VIP number to another phone. Empty the list only if you
    really want licence data to travel with a backup.
  - Backup and Restore keep working even when the subscription has expired:
    the owner must never feel the data is held hostage.

  This file does not depend on features/extras.js and does not touch updateUI.
  index.html is not edited except for the one <script> tag that loads this file.
 =====================================================================
*/
(function () {
    'use strict';

    // =================================================================
    //  SETTINGS
    // =================================================================

    const PREFIX = 'ganacsi_';

    // Saved in the backup, but never restored (see the note above)
    const PROTECTED_KEYS = [
        'ganacsi_sub_expiry',
        'ganacsi_used_keys',
        'ganacsi_last_seen',
        'ganacsi_phone'
    ];

    // A real backup contains at least one of these
    const REQUIRED_ANY = [
        'ganacsi_cash', 'ganacsi_customers', 'ganacsi_stock',
        'ganacsi_purchases', 'ganacsi_expenses'
    ];

    // Known keys and the kind of value each must hold (checked before restoring)
    const SCHEMA = {
        ganacsi_cash: 'array',
        ganacsi_customers: 'object',
        ganacsi_stock: 'object',
        ganacsi_purchases: 'array',
        ganacsi_expenses: 'array',
        ganacsi_journal: 'array',
        ganacsi_vendor_ledger: 'object',
        ganacsi_vendor_payments: 'array',
        ganacsi_daily_close: 'array',
        ganacsi_cash_archive: 'array',
        ganacsi_revenue: 'number',
        ganacsi_cogs_adj: 'number',
        ganacsi_cash_carry: 'number',
        ganacsi_cash_opening: 'number'
    };

    // Not "ganacsi_": so they are never part of a backup themselves
    const SNAP_KEY = 'bakhaar_prerestore';        // data kept before the last restore (for Undo)
    const LAST_KEY = 'bakhaar_last_backup';       // date of the last download on this phone
    const FLAG_KEY = 'bakhaar_restore_done';      // sessionStorage: message to show after the reload

    const MAX_BYTES = 8 * 1024 * 1024;

    // =================================================================
    //  SMALL HELPERS
    // =================================================================

    function isoToday() {
        if (typeof todayISO === 'function') return todayISO();
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    // Use the app's own pop-ups; fall back to the browser's if they are missing
    function tell(text) {
        if (typeof uiAlert === 'function') return uiAlert(text);
        window.alert(text);
        return Promise.resolve();
    }
    function ask(text, opts) {
        if (typeof uiConfirm === 'function') return uiConfirm(text, opts);
        return Promise.resolve(window.confirm(text));
    }

    // All "ganacsi_" keys on this phone (optionally without the protected ones)
    function dataKeys(includeProtected) {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf(PREFIX) === 0 && (includeProtected || PROTECTED_KEYS.indexOf(k) === -1)) keys.push(k);
        }
        return keys.sort();
    }

    function readData(includeProtected) {
        const out = {};
        dataKeys(includeProtected).forEach(function (k) { out[k] = localStorage.getItem(k); });
        return out;
    }

    function sizeKB(text) { return Math.max(1, Math.round(text.length / 1024)); }

    // =================================================================
    //  BACKUP (download)
    // =================================================================

    let busy = false;

    function downloadBackup() {
        if (busy) return;
        busy = true;
        try {
            const data = readData(true);                     // every ganacsi_ key
            const count = Object.keys(data).length;
            if (!count) {
                tell('⚠️ Xog lama helin.\n\nWali wax xog ah ma jiraan oo la kaydin karo.');
                return;
            }

            const payload = {
                app: 'bakhaar',
                format: 1,
                createdAt: new Date().toISOString(),
                keyCount: count,
                data: data                                   // raw localStorage strings, exactly as stored
            };
            const json = JSON.stringify(payload, null, 1);
            const fileName = 'bakhaar_backup_' + isoToday() + '.json';

            // Blob + <a download>: works in mobile Chrome
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                try { document.body.removeChild(a); } catch (e) { /* already gone */ }
                URL.revokeObjectURL(url);
            }, 4000);

            try { localStorage.setItem(LAST_KEY, isoToday()); } catch (e) { /* not important */ }
            renderStatus();

            tell('✅ Kaydka waa la soo dejiyay!\n\nFayl: ' + fileName +
                '\nXog: ' + count + ' qaybood (' + sizeKB(json) + ' KB)' +
                '\n\nHubi galka Downloads. Ku hay meel ammaan ah (WhatsApp, Google Drive) — ha ku reebin telefoonka oo keliya.');
        } catch (e) {
            console.error('[backup]', e);
            tell('⚠️ Kaydka lama samayn karin.\n\nFadlan mar kale isku day.');
        } finally {
            busy = false;
        }
    }

    // =================================================================
    //  RESTORE (import)
    // =================================================================

    function typeProblem(text, kind) {
        try {
            if (kind === 'number') return !(String(text).trim() !== '' && isFinite(Number(text)));
            const v = JSON.parse(text);
            if (kind === 'array') return !Array.isArray(v);
            return !(v && typeof v === 'object' && !Array.isArray(v));       // 'object'
        } catch (e) {
            return true;
        }
    }

    function countOf(map, key) {
        try {
            const v = JSON.parse(map[key]);
            return Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0);
        } catch (e) { return 0; }
    }

    // Returns { error } or { map, skipped, createdAt }. Never writes anything.
    function parseBackup(text) {
        let obj;
        try { obj = JSON.parse(String(text).replace(/^\uFEFF/, '')); }
        catch (e) { return { error: 'Faylku ma aha JSON sax ah (wuu wasakhsan yahay).' }; }

        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
            return { error: 'Faylkan ma aha kayd Bakhaar ah.' };
        }

        // New files: { app, data: {...} }. Plain files: { ganacsi_cash: ..., ... }
        const raw = (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) ? obj.data : obj;

        const map = {};
        let skipped = 0;
        Object.keys(raw).forEach(function (k) {
            if (k.indexOf(PREFIX) !== 0) return;                              // only ganacsi_ keys
            if (PROTECTED_KEYS.indexOf(k) !== -1) { skipped++; return; }      // licence data stays as it is
            const v = raw[k];
            if (v === null || v === undefined) return;
            map[k] = (typeof v === 'string') ? v : JSON.stringify(v);
        });

        if (!REQUIRED_ANY.some(function (k) { return Object.prototype.hasOwnProperty.call(map, k); })) {
            return { error: 'Faylkan ma laha xogta Bakhaar (iib, macmiil, stock ama kharash).' };
        }

        const keys = Object.keys(SCHEMA);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (Object.prototype.hasOwnProperty.call(map, k) && typeProblem(map[k], SCHEMA[k])) {
                return { error: 'Xogta "' + k + '" way wasakhsan tahay.' };
            }
        }

        return { map: map, skipped: skipped, createdAt: (typeof obj.createdAt === 'string') ? obj.createdAt : '' };
    }

    // Replaces ALL non-protected ganacsi_ data with `map`.
    // If anything goes wrong the old data is put back and false is returned.
    function commitData(map, before) {
        try {
            dataKeys(false).forEach(function (k) { localStorage.removeItem(k); });
            Object.keys(map).forEach(function (k) { localStorage.setItem(k, map[k]); });
            return true;
        } catch (e) {
            try {
                dataKeys(false).forEach(function (k) { localStorage.removeItem(k); });
                Object.keys(before).forEach(function (k) { localStorage.setItem(k, before[k]); });
            } catch (e2) { /* nothing more can be done */ }
            return false;
        }
    }

    function readFileText(file) {
        return new Promise(function (resolve, reject) {
            const r = new FileReader();
            r.onload = function () { resolve(String(r.result)); };
            r.onerror = function () { reject(r.error || new Error('read failed')); };
            r.readAsText(file);
        });
    }

    // After a restore the page reloads at once (so the app can not overwrite the restored
    // data from memory). The success message is shown after the reload.
    function reloadWithNotice(info) {
        try { sessionStorage.setItem(FLAG_KEY, JSON.stringify(info)); } catch (e) { /* optional */ }
        location.reload();
    }

    async function handleRestoreFile(file) {
        if (busy) return;
        busy = true;
        try {
            if (file.size > MAX_BYTES) {
                await tell('⚠️ Kaydka lama soo celin.\n\nFaylku aad buu u weyn yahay, ma aha kayd Bakhaar ah.');
                return;
            }

            let text;
            try { text = await readFileText(file); }
            catch (e) {
                await tell('⚠️ Kaydka lama soo celin.\n\nFaylka lama akhrin karin.');
                return;
            }

            const parsed = parseBackup(text);
            if (parsed.error) {
                await tell('⚠️ Kaydka lama soo celin.\n\n' + parsed.error);
                return;
            }

            const info =
                (parsed.createdAt ? 'Kaydka: ' + parsed.createdAt.slice(0, 10) + '\n' : '') +
                'Macaamiil: ' + countOf(parsed.map, 'ganacsi_customers') +
                ' • Iib kaash: ' + countOf(parsed.map, 'ganacsi_cash') +
                ' • Iibsasho: ' + countOf(parsed.map, 'ganacsi_purchases') +
                ' • Kharash: ' + countOf(parsed.map, 'ganacsi_expenses');

            const ok = await ask(
                '⚠️ Digniin!\n\nTani waxay beddelayso dhammaan xogta hadda jirta. Ma hubtaa inaad soo celiso kaydkan?' +
                '\n\n' + info +
                '\n\nXogta hadda jirta waa la kaydin doonaa, waxaadna ku noqon kartaa "↩️ Dib u celi".',
                { danger: true, okText: 'Soo celi', cancelText: 'Jooji' }
            );
            if (!ok) return;

            // Keep the current data once, so the restore can be undone
            const before = readData(false);
            let hasUndo = false;
            try {
                localStorage.setItem(SNAP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: before }));
                hasUndo = true;
            } catch (e) {
                try { localStorage.removeItem(SNAP_KEY); } catch (e2) { /* ignore */ }
            }

            if (!commitData(parsed.map, before)) {
                try { localStorage.removeItem(SNAP_KEY); } catch (e) { /* ignore */ }
                await tell('⚠️ Soo celintu way fashilantay.\n\nXogtii hore waa la soo celiyay, waxba ma beddelmin. Hubi in telefoonka bannaan yahay.');
                return;
            }

            reloadWithNotice({ count: Object.keys(parsed.map).length, skipped: parsed.skipped, hasUndo: hasUndo });
        } catch (e) {
            console.error('[backup]', e);
            await tell('⚠️ Kaydka lama soo celin.\n\nWax khalad ah ayaa dhacay, xogtaada waa sidii hore.');
        } finally {
            busy = false;
        }
    }

    // =================================================================
    //  UNDO the last restore
    // =================================================================

    function readSnapshot() {
        try {
            const s = JSON.parse(localStorage.getItem(SNAP_KEY));
            if (!s || typeof s !== 'object' || !s.data || typeof s.data !== 'object') return null;
            const data = {};
            Object.keys(s.data).forEach(function (k) {
                if (k.indexOf(PREFIX) === 0 && PROTECTED_KEYS.indexOf(k) === -1 && typeof s.data[k] === 'string') data[k] = s.data[k];
            });
            return { savedAt: String(s.savedAt || ''), data: data };
        } catch (e) { return null; }
    }

    async function undoRestore() {
        if (busy) return;
        busy = true;
        try {
            const snap = readSnapshot();
            if (!snap) { renderUndo(); return; }

            const ok = await ask(
                '⚠️ Digniin!\n\nXogta hadda jirta waxaa lagu beddelayaa xogtii ka horeysay soo celinta' +
                (snap.savedAt ? ' (' + snap.savedAt.slice(0, 10) + ')' : '') + '.\n\nMa hubtaa?',
                { danger: true, okText: 'Dib u celi', cancelText: 'Jooji' }
            );
            if (!ok) return;

            const before = readData(false);
            if (!commitData(snap.data, before)) {
                await tell('⚠️ Dib u celintu way fashilantay.\n\nXogta hadda jirta waa sidii hore.');
                return;
            }
            try { localStorage.removeItem(SNAP_KEY); } catch (e) { /* ignore */ }
            reloadWithNotice({ count: Object.keys(snap.data).length, skipped: 0, hasUndo: false });
        } finally {
            busy = false;
        }
    }

    // =================================================================
    //  UI (a card at the very bottom of the Xisaab tab)
    // =================================================================

    function injectStyle() {
        if (document.getElementById('bk-style')) return;
        const s = document.createElement('style');
        s.id = 'bk-style';
        s.textContent = [
            '.bk-note { font-size: 0.72rem; color: #64748b; line-height: 1.5; margin-bottom: 0.6rem; }',
            '.bk-status { font-size: 0.75rem; font-weight: 600; margin-bottom: 0.7rem; }',
            '.bk-status.ok { color: #047857; }',
            '.bk-status.warn { color: #b45309; }',
            '.bk-actions { display: flex; flex-direction: column; gap: 0.6rem; }',
            '.bk-btn { display: block; width: 100%; box-sizing: border-box; margin: 0; padding: 0.75rem; border-radius: 0.5rem; text-align: center; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: 1px solid #059669; background: #fff; color: #047857; }',
            '.bk-btn:active { opacity: 0.8; }',
            '.bk-primary { background: #059669; color: #fff; }',
            '.bk-restore { border-color: #d97706; color: #b45309; }',
            '.bk-undo { border-color: #7c3aed; color: #5b21b6; }'
        ].join('\n');
        document.head.appendChild(s);
    }

    function renderStatus() {
        const el = document.getElementById('bk-status');
        if (!el) return;
        let last = null;
        try { last = localStorage.getItem(LAST_KEY); } catch (e) { /* ignore */ }

        if (!last) {
            el.className = 'bk-status warn';
            el.textContent = '⚠️ Weli kayd ma soo dejin.';
            return;
        }
        const days = Math.max(0, Math.round((Date.parse(isoToday()) - Date.parse(last)) / 86400000));
        if (days >= 7) {
            el.className = 'bk-status warn';
            el.textContent = '⚠️ Kaydkii ugu dambeeyay: ' + last + ' (' + days + ' maalmood kahor). Soo deji mid cusub.';
        } else {
            el.className = 'bk-status ok';
            el.textContent = days === 0
                ? '✅ Kaydkii ugu dambeeyay: maanta'
                : '✅ Kaydkii ugu dambeeyay: ' + last + ' (' + days + ' maalmood kahor)';
        }
    }

    function renderUndo() {
        const btn = document.getElementById('bk-undo');
        if (btn) btn.hidden = !readSnapshot();
    }

    function showPendingNotice() {
        let raw = null;
        try {
            raw = sessionStorage.getItem(FLAG_KEY);
            sessionStorage.removeItem(FLAG_KEY);
        } catch (e) { /* ignore */ }
        if (!raw) return;

        let info = {};
        try { info = JSON.parse(raw) || {}; } catch (e) { info = {}; }
        tell('✅ Xogta waa la soo celiyay!\n\n' + (info.count || 0) + ' qaybood oo xog ah ayaa la soo celiyay.' +
            (info.skipped ? '\nIsdiiwaangelinta iyo lambarka telefoonka looma beddelin.' : '') +
            (info.hasUndo ? '\n\nHaddii aad khalad sameysay, isticmaal "↩️ Dib u celi xogtii hore" (tabka Xisaab).' : ''));
    }

    function init() {
        const tab = document.getElementById('tab-acct');
        if (!tab || document.getElementById('bk-card')) return;
        injectStyle();

        const card = document.createElement('div');
        card.className = 'card';
        card.id = 'bk-card';
        card.innerHTML =
            '<h2><span>💾 Kaydka Xogta (Backup)</span></h2>' +
            '<p class="bk-note">Xogtaada waxay ku kaydsan tahay telefoonkan oo keliya. Haddii telefoonka lumo ama browser-ka la nadiifiyo, xogta way tagi lahayd. ' +
                'Soo deji kayd si joogto ah, kuna hay meel ammaan ah (WhatsApp, Google Drive).</p>' +
            '<p class="bk-status" id="bk-status"></p>' +
            '<div class="bk-actions">' +
                '<button type="button" class="bk-btn bk-primary" id="bk-download">📥 Soo Deji Kaydka (Download Backup)</button>' +
                '<label class="bk-btn bk-restore" id="bk-restore-label">📤 Soo Celinta Kaydka (Restore Backup)' +
                    '<input type="file" id="bk-file" accept=".json,application/json" hidden></label>' +
                '<button type="button" class="bk-btn bk-undo" id="bk-undo" hidden>↩️ Dib u celi xogtii hore</button>' +
            '</div>';
        tab.appendChild(card);                    // very bottom of the Xisaab tab

        document.getElementById('bk-download').addEventListener('click', downloadBackup);
        document.getElementById('bk-undo').addEventListener('click', undoRestore);
        document.getElementById('bk-file').addEventListener('change', function () {
            const input = document.getElementById('bk-file');
            const file = input.files && input.files[0];
            input.value = '';                     // so the same file can be chosen again
            if (file) handleRestoreFile(file);
        });

        renderStatus();
        renderUndo();
        showPendingNotice();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
