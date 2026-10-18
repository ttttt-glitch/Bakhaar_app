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

    // Deep copy of current arrays to compare later
    function snapshotState() {
        previousState = {
            customers: JSON.parse(JSON.stringify(customers)),
            purchases: JSON.parse(JSON.stringify(purchases)),
            vendorPayments: JSON.parse(JSON.stringify(vendorPayments)),
            cashSales: JSON.parse(JSON.stringify(cashSales)) // Watch sales
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

        // 2. Check Purchases
        (previousState.purchases || []).forEach(pItem => {
            if (!purchases.find(lItem => lItem.id === pItem.id)) {
                newItems.push({ type: 'iibsasho', data: pItem, date: new Date().toISOString() });
            }
        });

        // 3. Check Vendor Payments
        (previousState.vendorPayments || []).forEach(vItem => {
            if (!vendorPayments.find(lItem => lItem.id === vItem.id)) {
                newItems.push({ type: 'bixin', data: vItem, date: new Date().toISOString() });
            }
        });

        // 4. Check Cash Sales (Iibka)
        (previousState.cashSales || []).forEach(cItem => {
            if (!cashSales.find(lItem => lItem.id === cItem.id)) {
                const alreadyInTrash = getTrash().some(t => t.type === 'iib' && t.data.id === cItem.id) ||
                                        newItems.some(t => t.type === 'iib' && t.data.id === cItem.id);
                if (!alreadyInTrash) {
                    newItems.push({ type: 'iib', data: cItem, date: new Date().toISOString() });
                }
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
            let badgeColor = '#64748b'; // default gray
            
            if (t.type === 'deyn') {
                name = `📒 Deyn: ${t.data.customerName || 'Macmiil'} - ${t.data.desc}`;
                amount = money(toCents(t.data.amount));
                badgeColor = '#e11d48'; // Red for debt
            } else if (t.type === 'iib') {
                name = `🛒 Iib: ${t.data.customer} - ${t.data.description}`;
                amount = money(toCents(t.data.amount));
                badgeColor = '#059669'; // Green for sales
            } else if (t.type === 'iibsasho') {
                name = `📥 Iibsasho: ${t.data.item} (${t.data.supplier})`;
                amount = money(toCents(t.data.total));
                badgeColor = '#4c1d95'; // Purple for purchases
            } else if (t.type === 'bixin') {
                name = `💵 Bixin: ${t.data.vendor}`;
                amount = money(toCents(t.data.amount));
                badgeColor = '#0369a1'; // Blue for payments
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

    // Prevent duplicate IDs, including IDs represented as strings/numbers.
    function hasExistingId(array, id) {
        if (!Array.isArray(array) || id == null) return false;

        return array.some(entry =>
            entry &&
            entry.id != null &&
            String(entry.id) === String(id)
        );
    }

    // 1. Restore customer debt.
    if (item.type === 'deyn') {
        const customerName = data.customerName || 'Macmiil';
        const key = normalize(customerName);

        if (!customers[key]) {
            customers[key] = {
                name: customerName,
                items: []
            };
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

    // 2. Restore cash sale.
    else if (item.type === 'iib') {
        if (!Array.isArray(cashSales)) {
            await uiAlert('Khalad: Liiska iibka lama heli karo.');
            return;
        }

        // Only restore the sale if its ID is not already present.
        if (!hasExistingId(cashSales, data.id)) {
            cashSales.push({ ...data });

            // Restore the deleted sale's contribution exactly once.
            const amount = Number(data.amount);

            if (Number.isFinite(amount)) {
                totalRevenue += amount;
            }

            restored = true;
        }
    }

    // 3. Restore purchase.
    else if (item.type === 'iibsasho') {
        if (!hasExistingId(purchases, data.id)) {
            purchases.push({ ...data });
            restored = true;
        }
    }

    // 4. Restore vendor payment.
    else if (item.type === 'bixin') {
        if (!hasExistingId(vendorPayments, data.id)) {
            vendorPayments.push({ ...data });
            restored = true;
        }
    }

    // 5. Remove the selected item from the trash.
    const currentTrash = getTrash();
    const actualIndex = currentTrash.length - 1 - index;

    if (actualIndex >= 0 && actualIndex < currentTrash.length) {
        currentTrash.splice(actualIndex, 1);
        saveTrash(currentTrash);
    }

    // 6. Persist the data and refresh the UI.
    saveData();
    updateUI();

    if (restored) {
        await uiAlert('✅ Waa la soo celiyay!');
    } else {
        await uiAlert(
            'Xogtan hore ayay u jirtay. Nuqul cusub lama darin.'
        );
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
