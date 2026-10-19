/*
 =====================================================================
  features/trash.js — Recycle Bin (Qashinka) for "Xisaabta Ganacsigaaga"
 =====================================================================
*/
(function () {
    'use strict';

    const TRASH_KEY = 'ganacsi_trash';
    let previousState = null;

    // Helper to get/save trash
    function getTrash() {
        const t = loadJSON(TRASH_KEY, []);
        return Array.isArray(t) ? t : [];
    }
    function saveTrash(trash) {
        localStorage.setItem(TRASH_KEY, JSON.stringify(trash));
    }

    // Change 1: Track financial state in snapshot (ChatGPT fix)
    function snapshotState() {
        previousState = {
            customers: JSON.parse(JSON.stringify(customers)),
            cashSales: JSON.parse(JSON.stringify(cashSales)),
            
            // Track financial state so we can distinguish individual
            // deletions from Clear Sales operations.
            totalRevenue: Number(totalRevenue) || 0,
            cashCarryCents: Number(cashCarryCents) || 0
        };
    }

    // Compare old snapshot to current data to find deletions
    function catchDeletions() {
        if (!previousState) return;
        let newItems = [];

        // 1. Check Customers (Debts)
        const prevCustKeys = Object.keys(previousState.customers);
        const liveCustKeys = Object.keys(customers);

        prevCustKeys.forEach(key => {
            if (!liveCustKeys.includes(key)) {
                const cust = previousState.customers[key];
                (cust.items || []).forEach(item => {
                    newItems.push({ type: 'deyn', data: Object.assign({}, item, { customerName: cust.name }), date: new Date().toISOString() });
                });
            } else {
                const prevItems = previousState.customers[key].items || [];
                const liveItems = customers[key].items || [];
                prevItems.forEach(pItem => {
                    if (!liveItems.find(lItem => lItem.id === pItem.id)) {
                        newItems.push({ type: 'deyn', data: Object.assign({}, pItem, { customerName: previousState.customers[key].name }), date: new Date().toISOString() });
                    }
                });
            }
        });

        // 2. Check Cash Sales (Iibka) — Change 2: Detect Clear Sales (ChatGPT fix)
        const previousRevenue = Number(previousState.totalRevenue) || 0;
        const previousCarry = Number(previousState.cashCarryCents) || 0;
        const currentRevenue = Number(totalRevenue) || 0;
        const currentCarry = Number(cashCarryCents) || 0;

        const carryIncrease = currentCarry - previousCarry;
        const revenueWasTransferredToCarry =
            previousRevenue > 0 &&
            Math.abs(currentRevenue) < 0.005 &&
            Math.abs(carryIncrease - Math.round(previousRevenue * 100)) <= 1;

        (previousState.cashSales || []).forEach(cItem => {
            const stillExists = cashSales.some(lItem => String(lItem.id) === String(cItem.id));
            if (stillExists) return;

            const alreadyInTrash =
                getTrash().some(t => t.type === 'iib' && t.data && String(t.data.id) === String(cItem.id)) ||
                newItems.some(t => t.type === 'iib' && t.data && String(t.data.id) === String(cItem.id));

            if (!alreadyInTrash) {
                newItems.push({
                    type: 'iib',
                    data: cItem,
                    date: new Date().toISOString(),
                    revenueWasTransferredToCarry: revenueWasTransferredToCarry
                });
            }
        });

        // Save new items to trash
        if (newItems.length > 0) {
            const trash = getTrash().concat(newItems);
            saveTrash(trash);
        }
    }

    // Hook into updateUI to catch items right before the screen refreshes
    const originalUpdateUI = window.updateUI;
    window.updateUI = function () {
        catchDeletions(); 
        const result = originalUpdateUI.apply(this, arguments);
        snapshotState(); 
        renderTrashCard(); 
        return result;
    };

    // --- UI RENDERING ---
    function renderTrashCard() {
        let card = document.getElementById('trash-card');
        if (!card) return;

        const trash = getTrash().slice().reverse(); // Newest first
        if (trash.length === 0) {
            card.innerHTML = `
                <h2><span>🗑️ Qashinka (Recycle Bin)</span></h2>
                <p class="text-center">Qashinku waa madhan yahay.</p>`;
            return;
        }

        let listHtml = '';
        trash.forEach((t, index) => {
            let name = '';
            let amount = '';
            let badgeColor = '#64748b';
            
            if (t.type === 'deyn') {
                name = `📒 Deyn: ${t.data.customerName || 'Macmiil'} - ${t.data.desc}`;
                amount = money(toCents(t.data.amount));
                badgeColor = '#e11d48';
            } else if (t.type === 'iib') {
                name = `🛒 Iib: ${t.data.customer} - ${t.data.description}`;
                amount = money(toCents(t.data.amount));
                badgeColor = '#059669';
            }

            listHtml += `
                <div class="ap-row" style="background:#f8fafc; border-color:#cbd5e1;">
                    <div>
                        <div class="n" style="color:${badgeColor}; white-space: normal; line-height: 1.2;">${escapeHtml(name)}</div>
                        <div class="s">${amount} • ${t.date.slice(0, 10)}</div>
                    </div>
                    <button type="button" class="mini-btn" onclick="window.restoreTrashItem(${index})">↩️ Soo Celi</button>
                </div>
            `;
        });

        card.innerHTML = `
            <h2>
                <span>🗑️ Qashinka (Recycle Bin)</span>
                <button type="button" class="mini-btn" style="color:#e11d48; border-color:#e11d48;" onclick="window.emptyTrash()">Tirtir Dhammaan</button>
            </h2>
            <div style="max-height: 20rem; overflow-y: auto;">${listHtml}</div>
            <p class="x-note">Halkan waxaa ku jira waxyaalihii la tirtiray. Waxaad ku soo celin kartaa badhanka "Soo Celi".</p>
        `;
    }

    // --- ACTIONS ---
    window.restoreTrashItem = async function (index) {
        const trash = getTrash().slice().reverse();
        const item = trash[index];

        if (!item || !item.data) return;

        const ok = await uiConfirm(
            'Ma rabtaa inaad soo celiso xogtan?',
            {
                okText: 'Soo Celi',
                cancelText: 'Jooji'
            }
        );

        if (!ok) return;

        const data = item.data;
        let restored = false;

        function hasExistingId(array, id) {
            if (!Array.isArray(array) || id == null) return false;
            return array.some(entry => entry && entry.id != null && String(entry.id) === String(id));
        }

        // Restore customer debt.
        if (item.type === 'deyn') {
            const customerName = data.customerName || 'Macmiil';
            const key = normalize(customerName);

            if (!customers[key]) {
                customers[key] = { name: customerName, items: [] };
            }

            if (!Array.isArray(customers[key].items)) {
                customers[key].items = [];
            }

            const cleanItem = { ...data };
            delete cleanItem.customerName;

            if (!hasExistingId(customers[key].items, cleanItem.id)) {
                customers[key].items.push(cleanItem);
                restored = true;
            }
        }

        // Restore cash sale.
        else if (item.type === 'iib') {
            if (!Array.isArray(cashSales)) {
                await uiAlert('Khalad: Liiska iibka lama heli karo.');
                return;
            }

            // Do not insert a duplicate sale or credit it twice.
            if (hasExistingId(cashSales, data.id)) {
                await uiAlert('Iibkan hore ayuu u jiraa. Lacag kale laguma darin.');
                return;
            }

            const amount = Number(data.amount);

            if (!Number.isFinite(amount) || amount < 0) {
                await uiAlert('Khalad: Lacagta iibka sax ma aha.');
                return;
            }

            // Restore the sale record.
            cashSales.push({ ...data });

            // If Clear Sales moved the original revenue into cash carry,
            // reverse that transfer instead of counting the money twice.
            if (item.revenueWasTransferredToCarry === true) {
                const amountCents = toCents(amount);

                if (!Number.isFinite(Number(cashCarryCents)) || Number(cashCarryCents) < amountCents) {
                    // Roll back the insertion rather than corrupting the financial state.
                    cashSales.pop();
                    await uiAlert('Khalad: Cash carry kuma filna in iibkan dib loo soo celiyo. Xisaabta lama beddelin.');
                    return;
                }

                cashCarryCents -= amountCents;
                totalRevenue = (Number(totalRevenue) || 0) + amount;
            } else {
                // An individually deleted sale had its revenue subtracted.
                // Restore its contribution once, alongside its record.
                totalRevenue = (Number(totalRevenue) || 0) + amount;
            }

            // Restore inventory sold quantity when applicable.
            if (data.stockKey && Number(data.qty) > 0) {
                const stockItem = stock[data.stockKey];
                if (stockItem) {
                    stockItem.sold = r3((Number(stockItem.sold) || 0) + Number(data.qty));
                }
            }

            restored = true;
        }

        // Reject unknown trash types (like iibsasho/bixin) without removing their records.
        else {
            await uiAlert('Nooca xogtan lama aqoonsan.');
            return;
        }

        // Remove only the selected trash entry.
        const currentTrash = getTrash();
        const actualIndex = currentTrash.length - 1 - index;

        if (actualIndex < 0 || actualIndex >= currentTrash.length) {
            await uiAlert('Xogta qashinka way is beddeshay. Fadlan dib u fur Qashinka.');
            return;
        }

        currentTrash.splice(actualIndex, 1);
        saveTrash(currentTrash);

        // Persist the restored financial state and refresh the UI.
        saveData();
        updateUI();

        if (restored) {
            await uiAlert('✅ Waa la soo celiyay!');
        } else {
            await uiAlert('Xogtan hore ayay u jirtay. Nuqul cusub lama darin.');
        }
    };

    window.emptyTrash = async function () {
        if (getTrash().length === 0) return;
        const ok = await uiConfirm('⚠️ Digniin!\n\nMa hubtaa inaad tirtirto QASHINKA OO DHAN? Tani dib looma soo celin karo.', { danger: true, okText: 'Tirtir', cancelText: 'Jooji' });
        if (!ok) return;
        saveTrash([]);
        updateUI();
    };

    // --- INIT ---
    function init() {
        const card = document.createElement('div');
        card.className = 'card';
        card.id = 'trash-card';
        document.getElementById('tab-acct').appendChild(card);

        snapshotState();
        renderTrashCard();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();
