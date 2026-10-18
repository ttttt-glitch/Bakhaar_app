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
            cashSales: JSON.parse(JSON.stringify(cashSales))
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
            let badgeColor = '#64748b';
            
            if (t.type === 'deyn') {
                name = `📒 Deyn: ${t.data.customerName || 'Macmiil'} - ${t.data.desc}`;
                amount = money(toCents(t.data.amount));
                badgeColor = '#e11d48';
            } else if (t.type === 'iib') {
                name = `🛒 Iib: ${t.data.customer} - ${t.data.description}`;
                amount = money(toCents(t.data.amount));
                badgeColor = '#059669';
            } else if (t.type === 'iibsasho') {
                name = `📥 Iibsasho: ${t.data.item} (${t.data.supplier})`;
                amount = money(toCents(t.data.total));
                badgeColor = '#4c1d95';
            } else if (t.type === 'bixin') {
                name = `💵 Bixin: ${t.data.vendor}`;
                amount = money(toCents(t.data.amount));
                badgeColor = '#0369a1';
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

            return array.some(entry =>
                entry &&
                entry.id != null &&
                String(entry.id) === String(id)
            );
        }

        // Restore customer debt.
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

        // Restore cash sale.
        else if (item.type === 'iib') {
            if (!Array.isArray(cashSales)) {
                await uiAlert('Khalad: Liiska iibka lama heli karo.');
                return;
            }

            // Never restore a sale twice.
            if (hasExistingId(cashSales, data.id)) {
                await uiAlert(
                    'Iibkan hore ayuu u jiraa. Lacag kale laguma darin.'
                );
                return;
            }

            const amount = Number(data.amount);

            if (!Number.isFinite(amount)) {
                await uiAlert('Khalad: Lacagta iibka sax ma aha.');
                return;
            }

            // Restore the original sale.
            cashSales.push({ ...data });

            // Restore its revenue contribution.
            totalRevenue = Math.max(0, Number(totalRevenue) || 0) + amount;

            // Restore inventory sold quantity when applicable.
            if (data.stockKey && Number(data.qty) > 0) {
                const stockItem = stock[data.stockKey];

                if (stockItem) {
                    stockItem.sold = r3(
                        (Number(stockItem.sold) || 0) + Number(data.qty)
                    );
                }
            }

            restored = true;
        }

        // Restore purchase.
        else if (item.type === 'iibsasho') {
            if (!hasExistingId(purchases, data.id)) {
                purchases.push({ ...data });
                restored = true;
            }
        }

        // Restore vendor payment.
        else if (item.type === 'bixin') {
            if (!hasExistingId(vendorPayments, data.id)) {
                vendorPayments.push({ ...data });
                restored = true;
            }
        }

        // Remove the restored item from trash.
        const currentTrash = getTrash();
        const actualIndex = currentTrash.length - 1 - index;

        if (actualIndex >= 0 && actualIndex < currentTrash.length) {
            currentTrash.splice(actualIndex, 1);
            saveTrash(currentTrash);
        }

        // Persist and refresh.
        saveData();
        updateUI();

        if (restored) {
            await uiAlert('✅ Waa la soo celiyay!');
        } else {
            await uiAlert('Xogtan hore ayay u jirtay.');
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
