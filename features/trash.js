(function () {
    'use strict';

    // ============================================================
    // GAROWE BUSINESS ACCOUNTING — RECYCLE BIN
    // File: features/trash.js
    //
    // Fixes:
    // 1. Prevents revenue/cash inflation when restoring deleted sales.
    // 2. Handles sales deleted individually.
    // 3. Handles sales removed by clearSales(), which transfers
    //    totalRevenue into cashCarryCents.
    // 4. Prevents duplicate restoration.
    // 5. Restores sold inventory quantities when possible.
    // 6. Tracks deleted customer debt items, purchases and payments.
    // ============================================================

    const TRASH_KEY = 'ganacsi_trash';

    let previousState = null;
    let isUpdating = false;

    // ------------------------------------------------------------
    // GENERAL HELPERS
    // ------------------------------------------------------------

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function toSafeNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function toCentsSafe(amount) {
        return Math.round(toSafeNumber(amount) * 100);
    }

    function roundQuantity(value) {
        return Math.round(toSafeNumber(value) * 1000) / 1000;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatMoney(amount) {
        return '$' + toSafeNumber(amount).toFixed(2);
    }

    function makeId() {
        return 'trash_' +
            Date.now().toString(36) + '_' +
            Math.random().toString(36).slice(2, 10);
    }

    function getTrash() {
        try {
            const value = loadJSON(TRASH_KEY, []);
            return Array.isArray(value) ? value : [];
        } catch (error) {
            console.error('Could not load Recycle Bin:', error);
            return [];
        }
    }

    function saveTrash(trash) {
        try {
            localStorage.setItem(TRASH_KEY, JSON.stringify(trash));
        } catch (error) {
            console.error('Could not save Recycle Bin:', error);
        }
    }

    function notify(title, message) {
        if (typeof window.uiAlert === 'function') {
            return Promise.resolve(window.uiAlert(title, message));
        }

        if (typeof uiAlert === 'function') {
            return Promise.resolve(uiAlert(title, message));
        }

        window.alert((title ? title + '\n\n' : '') + message);
        return Promise.resolve();
    }

    async function confirmAction(title, message) {
        try {
            if (typeof window.uiConfirm === 'function') {
                return Boolean(await window.uiConfirm(title, message));
            }

            if (typeof uiConfirm === 'function') {
                return Boolean(await uiConfirm(title, message));
            }
        } catch (error) {
            console.error('Confirmation dialog failed:', error);
        }

        return window.confirm(
            (title ? title + '\n\n' : '') + message
        );
    }

    function hasExistingId(array, id) {
        if (!Array.isArray(array) || id == null) {
            return false;
        }

        return array.some(function (entry) {
            return entry &&
                entry.id != null &&
                String(entry.id) === String(id);
        });
    }

    function sameId(a, b) {
        return a != null &&
            b != null &&
            String(a) === String(b);
    }

    function getCustomerKey(name) {
        if (typeof normalize === 'function') {
            return normalize(name || '');
        }

        return String(name || '').trim().toLowerCase();
    }

    function itemSignature(item) {
        if (!item) return '';

        return JSON.stringify({
            id: item.id == null ? null : String(item.id),
            desc: item.desc || '',
            amount: toSafeNumber(item.amount),
            paid: toSafeNumber(item.paid),
            date: item.date || '',
            time: item.time || ''
        });
    }

    // ------------------------------------------------------------
    // SNAPSHOTS
    // ------------------------------------------------------------

    function snapshotState() {
        try {
            previousState = {
                customers: clone(customers || {}),
                purchases: clone(purchases || []),
                vendorPayments: clone(vendorPayments || []),
                cashSales: clone(cashSales || []),

                // These two values are essential for the accounting fix.
                totalRevenue: toSafeNumber(totalRevenue),
                cashCarryCents: toSafeNumber(cashCarryCents)
            };
        } catch (error) {
            console.error('Could not snapshot accounting data:', error);
        }
    }

    // ------------------------------------------------------------
    // DELETION DETECTION
    // ------------------------------------------------------------

    function catchDeletions() {
        if (!previousState || isUpdating) {
            return;
        }

        const existingTrash = getTrash();
        const newItems = [];

        function alreadyTracked(type, id, customerKey) {
            const allItems = existingTrash.concat(newItems);

            return allItems.some(function (entry) {
                if (!entry || entry.type !== type || !entry.data) {
                    return false;
                }

                if (type === 'deyn') {
                    return String(entry.data.customerKey || '') ===
                            String(customerKey || '') &&
                        (
                            sameId(entry.data.itemId, id) ||
                            sameId(entry.data.item && entry.data.item.id, id)
                        );
                }

                return sameId(entry.data.id, id);
            });
        }

        // --------------------------------------------------------
        // Detect deleted customer debt items.
        // --------------------------------------------------------

        const oldCustomers = previousState.customers || {};
        const currentCustomers = customers || {};

        Object.keys(oldCustomers).forEach(function (customerKey) {
            const oldCustomer = oldCustomers[customerKey];

            if (!oldCustomer || !Array.isArray(oldCustomer.items)) {
                return;
            }

            const currentCustomer = currentCustomers[customerKey];
            const currentItems =
                currentCustomer && Array.isArray(currentCustomer.items)
                    ? currentCustomer.items
                    : [];

            oldCustomer.items.forEach(function (oldItem) {
                const stillExists = currentItems.some(function (item) {
                    if (oldItem.id != null && item.id != null) {
                        return sameId(item.id, oldItem.id);
                    }

                    return itemSignature(item) === itemSignature(oldItem);
                });

                if (stillExists) return;

                const itemId = oldItem.id == null
                    ? itemSignature(oldItem)
                    : oldItem.id;

                if (alreadyTracked('deyn', itemId, customerKey)) {
                    return;
                }

                newItems.push({
                    trashId: makeId(),
                    type: 'deyn',
                    data: {
                        customerKey: customerKey,
                        customerName: oldCustomer.name || customerKey,
                        itemId: oldItem.id == null ? null : oldItem.id,
                        item: clone(oldItem)
                    },
                    date: new Date().toISOString()
                });
            });
        });

        // --------------------------------------------------------
        // Detect deleted purchases.
        // --------------------------------------------------------

        (previousState.purchases || []).forEach(function (oldItem) {
            const stillExists = (purchases || []).some(function (item) {
                return sameId(item.id, oldItem.id);
            });

            if (stillExists || oldItem.id == null) return;

            if (alreadyTracked('iibsasho', oldItem.id)) {
                return;
            }

            newItems.push({
                trashId: makeId(),
                type: 'iibsasho',
                data: clone(oldItem),
                date: new Date().toISOString()
            });
        });

        // --------------------------------------------------------
        // Detect deleted vendor payments.
        // --------------------------------------------------------

        (previousState.vendorPayments || []).forEach(function (oldItem) {
            const stillExists = (vendorPayments || []).some(function (item) {
                return sameId(item.id, oldItem.id);
            });

            if (stillExists || oldItem.id == null) return;

            if (alreadyTracked('bixin', oldItem.id)) {
                return;
            }

            newItems.push({
                trashId: makeId(),
                type: 'bixin',
                data: clone(oldItem),
                date: new Date().toISOString()
            });
        });

        // --------------------------------------------------------
        // Detect deleted cash sales.
        //
        // CRITICAL ACCOUNTING FIX:
        //
        // Individual deletion:
        //   totalRevenue decreases; cashCarryCents does not increase.
        //
        // clearSales():
        //   cashSales becomes empty;
        //   totalRevenue becomes zero;
        //   previous totalRevenue is transferred to cashCarryCents.
        //
        // We detect the transfer and mark each affected sale so that
        // restoring it reverses the transfer instead of duplicating
        // the cash balance.
        // --------------------------------------------------------

        const previousRevenue =
            toSafeNumber(previousState.totalRevenue);

        const previousCarry =
            toSafeNumber(previousState.cashCarryCents);

        const currentRevenue =
            toSafeNumber(totalRevenue);

        const currentCarry =
            toSafeNumber(cashCarryCents);

        const carryIncrease = currentCarry - previousCarry;

        const expectedTransferCents = toCentsSafe(previousRevenue);

        const revenueWasTransferredToCarry =
            previousRevenue > 0 &&
            Math.abs(currentRevenue) < 0.005 &&
            Math.abs(carryIncrease - expectedTransferCents) <= 1;

        (previousState.cashSales || []).forEach(function (oldSale) {
            const stillExists = (cashSales || []).some(function (sale) {
                return sameId(sale.id, oldSale.id);
            });

            if (stillExists || oldSale.id == null) return;

            if (alreadyTracked('iib', oldSale.id)) {
                return;
            }

            newItems.push({
                trashId: makeId(),
                type: 'iib',
                data: clone(oldSale),
                date: new Date().toISOString(),

                // This flag determines how restoration affects money.
                revenueWasTransferredToCarry:
                    revenueWasTransferredToCarry
            });
        });

        if (newItems.length > 0) {
            saveTrash(existingTrash.concat(newItems));
        }
    }

    // ------------------------------------------------------------
    // RECYCLE BIN UI
    // ------------------------------------------------------------

    function getTypeLabel(type) {
        const labels = {
            iib: 'Cash sale',
            deyn: 'Customer debt item',
            iibsasho: 'Purchase',
            bixin: 'Vendor payment'
        };

        return labels[type] || 'Record';
    }

    function getItemDescription(item) {
        const data = item.data || {};

        if (item.type === 'iib') {
            return (
                (data.customer || 'Cash customer') +
                ' — ' +
                (data.description || 'Sale')
            );
        }

        if (item.type === 'deyn') {
            const debtItem = data.item || {};

            return (
                (data.customerName || data.customerKey || 'Customer') +
                ' — ' +
                (debtItem.desc || 'Debt item')
            );
        }

        if (item.type === 'iibsasho') {
            return (
                (data.item || data.description || data.name || 'Purchase') +
                ' — ' +
                (data.supplier || 'Supplier')
            );
        }

        if (item.type === 'bixin') {
            return (
                (data.vendor || data.supplier || data.name || 'Vendor') +
                ' — Vendor payment'
            );
        }

        return 'Deleted record';
    }

    function getItemAmount(item) {
        const data = item.data || {};

        if (item.type === 'deyn') {
            return toSafeNumber(data.item && data.item.amount);
        }

        return toSafeNumber(data.amount);
    }

    function ensureTrashStyles() {
        if (document.getElementById('ganacsi-trash-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'ganacsi-trash-styles';

        style.textContent = `
            #ganacsi-trash-card {
                margin: 16px 0;
                padding: 16px;
                border: 1px solid #dedede;
                border-radius: 12px;
                background: #fff;
                color: #222;
            }

            #ganacsi-trash-card .trash-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
                margin-bottom: 12px;
            }

            #ganacsi-trash-card .trash-header h3 {
                margin: 0;
                font-size: 1.05rem;
            }

            #ganacsi-trash-card .trash-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }

            #ganacsi-trash-card .trash-btn {
                border: 0;
                border-radius: 7px;
                padding: 8px 11px;
                cursor: pointer;
                font: inherit;
                font-size: .85rem;
            }

            #ganacsi-trash-card .trash-restore {
                background: #e8f5e9;
                color: #176b2c;
            }

            #ganacsi-trash-card .trash-empty {
                background: #ffebee;
                color: #b71c1c;
            }

            #ganacsi-trash-card .trash-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 12px 0;
                border-top: 1px solid #eee;
            }

            #ganacsi-trash-card .trash-description {
                min-width: 0;
                overflow-wrap: anywhere;
            }

            #ganacsi-trash-card .trash-description strong {
                display: block;
                margin-bottom: 4px;
            }

            #ganacsi-trash-card .trash-meta {
                color: #666;
                font-size: .8rem;
                margin-top: 4px;
            }

            #ganacsi-trash-card .trash-empty-message {
                padding: 14px 0;
                text-align: center;
                color: #666;
            }

            @media (max-width: 480px) {
                #ganacsi-trash-card .trash-row {
                    align-items: flex-start;
                }

                #ganacsi-trash-card .trash-header {
                    align-items: flex-start;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function ensureTrashCard() {
        let card = document.getElementById('ganacsi-trash-card');

        if (card) return card;

        ensureTrashStyles();

        card = document.createElement('section');
        card.id = 'ganacsi-trash-card';

        card.innerHTML = `
            <div class="trash-header">
                <h3>🗑️ Recycle Bin</h3>
                <div class="trash-actions">
                    <button
                        type="button"
                        class="trash-btn trash-empty"
                        data-trash-action="empty"
                    >Empty Bin</button>
                </div>
            </div>
            <div id="ganacsi-trash-list"></div>
        `;

        // Prefer placing the card near the end of the main content.
        const main = document.querySelector('main');

        if (main) {
            main.appendChild(card);
        } else {
            document.body.appendChild(card);
        }

        card.addEventListener('click', function (event) {
            const button = event.target.closest('button[data-trash-action]');

            if (!button) return;

            const action = button.dataset.trashAction;

            if (action === 'empty') {
                window.emptyTrash();
            } else if (action === 'restore') {
                const index = Number(button.dataset.index);

                if (Number.isInteger(index) && index >= 0) {
                    window.restoreTrashItem(index);
                }
            }
        });

        return card;
    }

    function renderTrashCard() {
        const card = ensureTrashCard();
        const list = card.querySelector('#ganacsi-trash-list');

        if (!list) return;

        const trash = getTrash();

        if (trash.length === 0) {
            list.innerHTML = `
                <div class="trash-empty-message">
                    The Recycle Bin is empty.
                </div>
            `;
            return;
        }

        // Render newest deleted records first.
        const ordered = trash
            .map(function (item, originalIndex) {
                return {
                    item: item,
                    originalIndex: originalIndex
                };
            })
            .reverse();

        list.innerHTML = ordered.map(function (entry, displayIndex) {
            const item = entry.item || {};
            const date = item.date
                ? new Date(item.date).toLocaleString()
                : 'Date unavailable';

            const description = getItemDescription(item);
            const amount = getItemAmount(item);

            return `
                <div class="trash-row">
                    <div class="trash-description">
                        <strong>${escapeHtml(description)}</strong>
                        <div>${escapeHtml(getTypeLabel(item.type))}</div>
                        <div class="trash-meta">
                            ${escapeHtml(date)}
                            ${amount > 0 ? ' • ' + escapeHtml(formatMoney(amount)) : ''}
                        </div>
                    </div>

                    <button
                        type="button"
                        class="trash-btn trash-restore"
                        data-trash-action="restore"
                        data-index="${displayIndex}"
                    >Restore</button>
                </div>
            `;
        }).join('');
    }

    // ------------------------------------------------------------
    // WRAP updateUI() TO DETECT DELETIONS
    // ------------------------------------------------------------

    const originalUpdateUI = window.updateUI;

    if (typeof originalUpdateUI === 'function') {
        window.updateUI = function () {
            if (isUpdating) {
                return originalUpdateUI.apply(this, arguments);
            }

            isUpdating = true;

            try {
                // Compare the current data with the last snapshot before
                // the original UI refresh saves the new state.
                catchDeletions();

                const result = originalUpdateUI.apply(this, arguments);

                snapshotState();
                renderTrashCard();

                return result;
            } finally {
                isUpdating = false;
            }
        };
    }

    // ------------------------------------------------------------
    // RESTORE HELPERS
    // ------------------------------------------------------------

    function restoreStockQuantity(data) {
        if (!data || !data.stockKey || !(toSafeNumber(data.qty) > 0)) {
            return;
        }

        if (
            typeof stock === 'undefined' ||
            !stock ||
            !stock[data.stockKey]
        ) {
            return;
        }

        const stockItem = stock[data.stockKey];

        stockItem.sold = roundQuantity(
            toSafeNumber(stockItem.sold) + toSafeNumber(data.qty)
        );
    }

    function removeTrashEntry(trash, index) {
        if (!Array.isArray(trash) || index < 0 || index >= trash.length) {
            return false;
        }

        trash.splice(index, 1);
        saveTrash(trash);

        return true;
    }

    function restoreDebtItem(data) {
        if (!data || !data.item) {
            return {
                ok: false,
                message: 'The saved debt item is incomplete.'
            };
        }

        if (typeof customers === 'undefined' || !customers) {
            return {
                ok: false,
                message: 'Customer records are unavailable.'
            };
        }

        const key = String(data.customerKey || '');

        if (!key) {
            return {
                ok: false,
                message: 'The customer key is missing.'
            };
        }

        if (!customers[key]) {
            customers[key] = {
                name: data.customerName || key,
                items: []
            };
        }

        if (!Array.isArray(customers[key].items)) {
            customers[key].items = [];
        }

        const item = clone(data.item);

        if (
            item.id != null &&
            hasExistingId(customers[key].items, item.id)
        ) {
            return {
                ok: false,
                message: 'This debt item already exists.'
            };
        }

        // If an older record has no ID, prevent an identical duplicate.
        if (
            item.id == null &&
            customers[key].items.some(function (existing) {
                return itemSignature(existing) === itemSignature(item);
            })
        ) {
            return {
                ok: false,
                message: 'This debt item already exists.'
            };
        }

        customers[key].items.push(item);

        return { ok: true };
    }

    // ------------------------------------------------------------
    // RESTORE A RECYCLE BIN ITEM
    // ------------------------------------------------------------

    window.restoreTrashItem = async function (displayIndex) {
        const trash = getTrash();

        // The UI displays the list in reverse order.
        const reverseIndex = trash.length - 1 - Number(displayIndex);

        if (
            !Number.isInteger(Number(displayIndex)) ||
            displayIndex < 0 ||
            reverseIndex < 0 ||
            reverseIndex >= trash.length
        ) {
            await notify('Restore failed', 'This Recycle Bin item could not be found.');
            return;
        }

        const entry = trash[reverseIndex];

        if (!entry || !entry.data) {
            await notify('Restore failed', 'The saved record is incomplete.');
            return;
        }

        const ok = await confirmAction(
            'Restore record?',
            'Do you want to restore this record?'
        );

        if (!ok) return;

        const data = entry.data;
        let result = { ok: false, message: 'Unsupported record type.' };

        // --------------------------------------------------------
        // CASH SALE — ACCOUNTING-SAFE RESTORATION
        // --------------------------------------------------------

        if (entry.type === 'iib') {
            if (!Array.isArray(cashSales)) {
                await notify('Restore failed', 'Cash sales are unavailable.');
                return;
            }

            if (data.id == null) {
                await notify(
                    'Restore failed',
                    'This sale has no ID, so it cannot be safely restored.'
                );
                return;
            }

            if (hasExistingId(cashSales, data.id)) {
                await notify(
                    'Already exists',
                    'This cash sale is already in your sales records.'
                );
                return;
            }

            const amount = Number(data.amount);

            if (!Number.isFinite(amount) || amount < 0) {
                await notify(
                    'Restore failed',
                    'The sale amount is invalid. No money was changed.'
                );
                return;
            }

            const amountCents = Math.round(amount * 100);

            const transferredToCarry =
                entry.revenueWasTransferredToCarry === true;

            // For sales removed by clearSales(), revenue was transferred
            // into cashCarryCents. Move it back instead of duplicating it.
            //
            // Refuse restoration if the carry balance cannot cover the
            // reversal. This is safer than creating extra cash.
            if (transferredToCarry) {
                const carry = Number(cashCarryCents);

                if (
                    !Number.isFinite(carry) ||
                    carry < amountCents
                ) {
                    await notify(
                        'Restore stopped',
                        'The cash carry balance is too low to safely reverse this sale. ' +
                        'No sale or money was changed. Check your cash balance before retrying.'
                    );
                    return;
                }
            }

            // Save the old financial values so we can roll back if a
            // restoration step fails.
            const previousRevenueValue = toSafeNumber(totalRevenue);
            const previousCarryValue = toSafeNumber(cashCarryCents);

            try {
                cashSales.push(clone(data));

                if (transferredToCarry) {
                    // Reverse clearSales()'s transfer:
                    // carry decreases; recorded revenue increases.
                    cashCarryCents =
                        previousCarryValue - amountCents;

                    totalRevenue =
                        previousRevenueValue + amount;
                } else {
                    // Individually deleted sale:
                    // deleteCashSale() already subtracted its amount.
                    totalRevenue =
                        previousRevenueValue + amount;
                }

                restoreStockQuantity(data);

                result = { ok: true };
            } catch (error) {
                console.error('Cash sale restoration failed:', error);

                const restoredIndex = cashSales.findIndex(function (sale) {
                    return sameId(sale.id, data.id);
                });

                if (restoredIndex !== -1) {
                    cashSales.splice(restoredIndex, 1);
                }

                totalRevenue = previousRevenueValue;
                cashCarryCents = previousCarryValue;

                result = {
                    ok: false,
                    message: 'The sale could not be restored. Financial values were rolled back.'
                };
            }
        }

        // --------------------------------------------------------
        // CUSTOMER DEBT ITEM
        // --------------------------------------------------------

        else if (entry.type === 'deyn') {
            result = restoreDebtItem(data);
        }

        // --------------------------------------------------------
        // PURCHASE
        // --------------------------------------------------------

        else if (entry.type === 'iibsasho') {
            if (!Array.isArray(purchases)) {
                await notify('Restore failed', 'Purchase records are unavailable.');
                return;
            }

            if (data.id == null) {
                await notify('Restore failed', 'This purchase has no ID.');
                return;
            }

            if (hasExistingId(purchases, data.id)) {
                await notify(
                    'Already exists',
                    'This purchase is already in your records.'
                );
                return;
            }

            purchases.push(clone(data));
            result = { ok: true };
        }

        // --------------------------------------------------------
        // VENDOR PAYMENT
        // --------------------------------------------------------

        else if (entry.type === 'bixin') {
            if (!Array.isArray(vendorPayments)) {
                await notify('Restore failed', 'Vendor payment records are unavailable.');
                return;
            }

            if (data.id == null) {
                await notify('Restore failed', 'This vendor payment has no ID.');
                return;
            }

            if (hasExistingId(vendorPayments, data.id)) {
                await notify(
                    'Already exists',
                    'This vendor payment is already in your records.'
                );
                return;
            }

            vendorPayments.push(clone(data));
            result = { ok: true };
        }

        if (!result.ok) {
            await notify(
                'Restore failed',
                result.message || 'The record could not be restored.'
            );
            return;
        }

        // Remove the item only after restoration has succeeded.
        if (!removeTrashEntry(trash, reverseIndex)) {
            await notify(
                'Warning',
                'The record was restored, but the Recycle Bin could not be updated. ' +
                'Check that the record was not duplicated.'
            );
            return;
        }

        // Persist and refresh the application.
        if (typeof saveData === 'function') {
            saveData();
        }

        if (typeof window.updateUI === 'function') {
            window.updateUI();
        } else {
            snapshotState();
            renderTrashCard();
        }

        await notify(
            'Restored',
            'The record has been restored successfully.'
        );
    };

    // ------------------------------------------------------------
    // EMPTY RECYCLE BIN
    // ------------------------------------------------------------

    window.emptyTrash = async function () {
        const trash = getTrash();

        if (trash.length === 0) {
            await notify('Recycle Bin', 'The Recycle Bin is already empty.');
            return;
        }

        const ok = await confirmAction(
            'Empty Recycle Bin?',
            'This permanently removes all deleted records from the Recycle Bin. ' +
            'It does not restore or change any sales or cash balances.'
        );

        if (!ok) return;

        saveTrash([]);

        renderTrashCard();

        await notify(
            'Recycle Bin emptied',
            'Deleted records have been permanently removed from the Recycle Bin.'
        );
    };

    // ------------------------------------------------------------
    // INITIALIZE
    // ------------------------------------------------------------

    function init() {
        ensureTrashCard();
        snapshotState();
        renderTrashCard();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
