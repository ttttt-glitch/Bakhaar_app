/*
 =====================================================================
  features/extras.js  —  Extra features for "Xisaabta Ganacsigaaga"
 =====================================================================
*/
(function () {
    'use strict';

    // =================================================================
    //  SHARED HELPERS
    // =================================================================

    const MONTHS_SO = ['Janaayo', 'Febraayo', 'Maarso', 'Abriil', 'Maajo', 'Juun',
                       'Luuliyo', 'Ogosto', 'Sebtembar', 'Oktoobar', 'Nofembar', 'Desembar'];

    const features = [];
    function register(name, feature) { features.push(Object.assign({ name: name }, feature)); }

    function newId() { return '_' + Math.random().toString(36).slice(2, 11); }

    function activeSubscription() {
        return (typeof subscriptionActive === 'undefined') ? true : subscriptionActive;
    }

    function injectStyle(id, css) {
        if (document.getElementById(id)) return;
        const s = document.createElement('style');
        s.id = id;
        s.textContent = css;
        document.head.appendChild(s);
    }

    function makeCard(id, html) {
        const d = document.createElement('div');
        d.className = 'card';
        d.id = id;
        d.innerHTML = html;
        return d;
    }

    let lastPlaced = null;
    function placeCard(card) {
        const tab = document.getElementById('tab-acct');
        if (!tab) return false;
        if (!lastPlaced) {
            const pl = document.getElementById('pl-card');
            lastPlaced = pl ? pl.closest('.card') : null;
        }
        if (lastPlaced) lastPlaced.insertAdjacentElement('afterend', card);
        else tab.appendChild(card);
        lastPlaced = card;
        return true;
    }

    function toAscii(s) {
        return String(s)
            .replace(/[\u0660-\u0669]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); })
            .replace(/[\u06F0-\u06F9]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); });
    }

    let dateOrder = null;
    function localeOrder() {
        if (dateOrder) return dateOrder;
        dateOrder = { m: 0, d: 1, y: 2 };
        try {
            const nums = (toAscii(new Date(2001, 10, 22).toLocaleDateString()).match(/\d+/g) || []).map(Number);
            if (nums.length === 3) {
                const y = nums.findIndex(function (n) { return n === 2001 || n === 1; });
                const d = nums.findIndex(function (n) { return n === 22; });
                if (y !== -1 && d !== -1 && y !== d) {
                    dateOrder = { y: y, d: d, m: [0, 1, 2].find(function (i) { return i !== y && i !== d; }) };
                }
            }
        } catch (e) { }
        return dateOrder;
    }

    function parseAppDate(str) {
        if (!str) return null;
        const s = toAscii(str).trim();

        const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
        if (iso) {
            const di = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
            return isNaN(di.getTime()) ? null : di;
        }

        const nums = (s.match(/\d+/g) || []).map(Number);
        if (nums.length >= 3) {
            const o = localeOrder();
            let y = nums[o.y];
            const m = nums[o.m];
            const d = nums[o.d];
            if (y < 100) y += 2000;
            if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000) {
                const dt = new Date(y, m - 1, d);
                if (dt.getMonth() === m - 1) return dt;
            }
        }

        const t = Date.parse(s);
        return isNaN(t) ? null : new Date(t);
    }

    function safe(label, fn) {
        try { if (typeof fn === 'function') fn(); }
        catch (e) { console.error('[extras] ' + label + ':', e); }
    }

    function costOf(rec) {
        if (typeof itemCostCents === 'function') return itemCostCents(rec) || 0;
        return (rec && typeof rec.cogs === 'number') ? rec.cogs : 0;
    }
    function debtCostOf(item) {
        if (typeof debtCostCents === 'function') return debtCostCents(item) || 0;
        return costOf(item);
    }
    function costAtSale() {
        return (typeof COGS_ON_CREDIT_AT_SALE === 'undefined') ? true : COGS_ON_CREDIT_AT_SALE;
    }
    function custBalanceC(c) {
        return (c.items || []).reduce(function (s, i) {
            return s + Math.max(toCents(i.amount) - toCents(i.paid), 0);
        }, 0);
    }
    function fmtDiff(c) { return (c > 0 ? '+' : '') + moneySigned(c); }

    // ----- Cash on hand calculation (BUG FIX APPLIED) -----
    function expensesTotalCents() {
        return expenses.reduce(function (s, e) { return s + toCents(e.amount); }, 0);
    }

    function cashFlowParts() {
        const baseC = openingCashCents || 0;
        
        // BUG FIX: Read directly from the Archive to prevent double-counting
        let inC = 0;
        if (typeof allCashSalesForReports === 'function') {
            allCashSalesForReports().forEach(tx => { inC += toCents(tx.amount); });
        } else {
            inC = toCents(totalRevenue) + cashCarryCents; 
        }

        const expC = expensesTotalCents();                    
        const supplierC = journalTotals().cashPaidNet;        
        return { baseC, inC, expC, supplierC, cashC: baseC + inC - expC - supplierC };
    }

    function cashOnHandCents() { return cashFlowParts().cashC; }

    async function confirmCashAvailable(outC, what) {
        if (openingCashCents === null) return true;
        const cashC = cashOnHandCents();
        if (outC <= cashC) return true;

        const msg = '⚠️ Cash-ka kuma filna!\n\nCash hadda: ' + moneySigned(cashC) +
            '\n' + what + ': ' + money(outC) +
            '\nKadib waxaa hadhi doona: ' + moneySigned(cashC - outC);

        if (typeof BLOCK_PAYMENT_IF_NO_CASH !== 'undefined' && BLOCK_PAYMENT_IF_NO_CASH) {
            await uiAlert(msg + '\n\nBixinta lama kaydin.');
            return false;
        }
        return await uiConfirm(msg + '\n\nWeli ma sii wadaysaa?', { danger: true, okText: 'Haa, sii wad', cancelText: 'Jooji' });
    }

    function monthStats(year, monthIndex) {
        const st = { salesC: 0, cogsC: 0, purchasesC: 0, opexC: 0, payC: 0, netC: 0, skipped: 0, byCat: {} };
        function inMonth(d) { return !!d && d.getFullYear() === year && d.getMonth() === monthIndex; }

        allCashSalesForReports().forEach(function (tx) {
            const d = parseAppDate(tx.date);
            if (!d) { st.skipped++; return; }
            if (inMonth(d)) { st.salesC += toCents(tx.amount); st.cogsC += costOf(tx); }
        });

        const atSale = costAtSale();
        Object.values(customers).forEach(function (c) {
            (c.items || []).forEach(function (item) {
                const created = parseAppDate(item.date);
                if (!created) st.skipped++;
                const paidC = toCents(item.paid);
                const paidD = paidC > 0 ? (parseAppDate(item.paidDate) || created) : null;
                if (paidC > 0 && inMonth(paidD)) st.salesC += paidC;
                const costD = atSale ? created : (paidD || created);
                if (inMonth(costD)) st.cogsC += debtCostOf(item);
            });
        });

        expenses.forEach(function (e) {
            const d = parseAppDate(e.date);
            if (!d) { st.skipped++; return; }
            if (!inMonth(d)) return;
            const c = toCents(e.amount);
            if (e.category === 'salary') st.payC += c; else st.opexC += c;
            st.byCat[e.category] = (st.byCat[e.category] || 0) + c;
        });

        purchases.forEach(function (p) {
            if (p.opening) return;
            const d = parseAppDate(p.date);
            if (!d) { st.skipped++; return; }
            if (inMonth(d)) st.purchasesC += toCents(p.total);
        });

        st.netC = st.salesC - (st.cogsC + st.opexC + st.payC);
        return st;
    }

    function allTimeStats() {
        let revC = 0;
        let cogsC = 0;
        if (typeof allCashSalesForReports === 'function') {
            allCashSalesForReports().forEach(tx => { 
                revC += toCents(tx.amount); 
                cogsC += costOf(tx);
            });
        } else {
            revC = (typeof totalRevenue === 'number') ? toCents(totalRevenue) : 0;
            cogsC = (typeof computeCogsCents === 'function') ? computeCogsCents() : 0;
        }
        
        let opexC = 0, payC = 0, purchasesC = 0;
        expenses.forEach(function (e) {
            if (e.category === 'salary') payC += toCents(e.amount); else opexC += toCents(e.amount);
        });
        purchases.forEach(function (p) { if (!p.opening) purchasesC += toCents(p.total); });
        return { salesC: revC, cogsC: cogsC, opexC: opexC, payC: payC, purchasesC: purchasesC,
                 netC: revC - (cogsC + opexC + payC) };
    }

    const LS_ARCHIVE = 'ganacsi_cash_archive';
    const X_ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

    function readCashArchive() {
        const v = loadJSON(LS_ARCHIVE, []);
        return Array.isArray(v) ? v : [];
    }
    function writeCashArchive(list) { localStorage.setItem(LS_ARCHIVE, JSON.stringify(list)); }

    function syncCashArchive() {
        const archive = readCashArchive();
        const byId = new Map(archive.map(function (r) { return [r.id, r]; }));
        const liveIds = new Set(cashSales.map(function (t) { return t.id; }));
        const carryNow = (typeof cashCarryCents === 'number') ? cashCarryCents : 0;
        let changed = false;

        const gone = archive.filter(function (r) { return r._live && !liveIds.has(r.id); });
        gone.forEach(function (r) {
            r._live = false;
            changed = true;
        });

        cashSales.forEach(function (tx) {
            const r = byId.get(tx.id);
            if (!r) {
                archive.push(Object.assign({}, tx, { _live: true, _carry: carryNow }));
                changed = true;
            } else if (!r._live || r._carry !== carryNow) {
                r._live = true;
                r._carry = carryNow;
                changed = true;
            }
        });

        if (changed) writeCashArchive(archive);
    }

    function allCashSalesForReports() {
        const out = [];
        const seen = new Set();
        cashSales.forEach(function (t) { 
            if (seen.has(t.id)) return;
            seen.add(t.id); 
            out.push(t); 
        });
        readCashArchive().forEach(function (r) {
            if (seen.has(r.id)) return;
            seen.add(r.id);
            out.push(r);
        });
        return out;
    }

    function cashOnHandCentsAt(iso) {
        const now = cashOnHandCents();
        if (!X_ISO_DAY.test(iso) || iso >= todayISO()) return now;

        function after(str) {
            const d = parseAppDate(str);
            return !!d && toISODate(d) > iso;
        }

        let inAfter = 0;
        allCashSalesForReports().forEach(function (tx) {
            if (after(tx.date)) inAfter += toCents(tx.amount);
        });
        Object.values(customers).forEach(function (c) {
            (c.items || []).forEach(function (item) {
                if (toCents(item.paid) > 0 && after(item.paidDate || item.date)) inAfter += toCents(item.paid);
            });
        });

        let outAfter = 0;
        expenses.forEach(function (e) {
            if (after(e.date)) outAfter += toCents(e.amount);
        });
        journalLog.forEach(function (l) {
            if (l.account === 'Cash' && typeof l.date === 'string' && l.date.slice(0, 10) > iso) {
                outAfter += toCents(l.credit) - toCents(l.debit);
            }
        });

        return now - inAfter + outAfter;
    }

    // =================================================================
    //  STYLES
    // =================================================================

    injectStyle('x-extras-style', [
        '.x-btn { font-size: 0.7rem; background: #fff; border: 1px solid #059669; color: #047857; border-radius: 0.4rem; padding: 0.25rem 0.55rem; cursor: pointer; white-space: nowrap; }',
        '.x-btn:disabled { opacity: 0.5; cursor: not-allowed; }',
        '.x-row { display: grid; grid-template-columns: 1.7fr 1fr 1fr; gap: 0.4rem; align-items: center; font-size: 0.8rem; padding: 0.4rem 0; border-bottom: 1px dashed #e2e8f0; color: #334155; }',
        '.x-row > :nth-child(n+2) { text-align: right; }',
        '.x-head { font-size: 0.68rem; color: #64748b; font-weight: 600; border-bottom: 1px solid #cbd5e1; }',
        '.x-total { font-weight: 800; border-bottom: 2px solid #cbd5e1; }',
        '.x-muted { color: #64748b; font-size: 0.74rem; }',
        '.x-pos { color: #047857; }',
        '.x-neg { color: #be123c; }',
        '.x-note { font-size: 0.7rem; color: #64748b; margin-top: 0.6rem; line-height: 1.5; }',
        '.x-live { margin-top: 0.4rem; font-weight: 700; }',
        '.x-close-row { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 0.5rem; padding: 0.55rem 0.7rem; margin-top: 0.5rem; font-size: 0.8rem; }',
        '.x-close-row.bad { background: #fff1f2; border-color: #fecdd3; }',
        '.x-close-row .d { font-weight: 700; color: #065f46; }',
        '.x-close-row.bad .d { color: #9f1239; }',
        '.x-close-row .s { font-size: 0.68rem; color: #64748b; margin-top: 0.1rem; }',
        '.x-close-row .f { font-size: 0.72rem; font-weight: 700; margin-top: 0.15rem; }',
        '.x-close-row .r { display: flex; align-items: center; gap: 0.3rem; flex-shrink: 0; }'
    ].join('\n'));

    // =================================================================
    //  FEATURES
    // =================================================================

    register('monthly-summary', {
        init: function () {
            placeCard(makeCard('x-month-card',
                '<h2><span id="x-month-title">📅 Xisaabta Bisha</span></h2>' +
                '<div id="x-month-body"></div>'));
        },
        render: function () {
            const body = document.getElementById('x-month-body');
            if (!body) return;
            const now = new Date();
            const m = monthStats(now.getFullYear(), now.getMonth());
            const a = allTimeStats();
            document.getElementById('x-month-title').textContent =
                '📅 Xisaabta Bisha — ' + MONTHS_SO[now.getMonth()] + ' ' + now.getFullYear();

            function row(label, mc, ac, cls) {
                return '<div class="x-row ' + (cls || '') + '"><span>' + label + '</span><b>' + mc + '</b><b>' + ac + '</b></div>';
            }
            function sign(c) { return c >= 0 ? 'x-pos' : 'x-neg'; }

            body.innerHTML =
                '<div class="x-row x-head"><span></span><span>Bishan</span><span>Wadarta guud</span></div>' +
                row('Iibka', money(m.salesC), money(a.salesC)) +
                row('− Kharashka alaabta (COGS)', money(m.cogsC), money(a.cogsC)) +
                row('− Kharashka shaqada', money(m.opexC), money(a.opexC)) +
                row('− Mushaharka', money(m.payC), money(a.payC)) +
                '<div class="x-row x-total"><span>Faa\'iidada saafiga</span>' +
                    '<b class="' + sign(m.netC) + '">' + moneySigned(m.netC) + '</b>' +
                    '<b class="' + sign(a.netC) + '">' + moneySigned(a.netC) + '</b></div>' +
                row('Iibsashada (macluumaad)', money(m.purchasesC), money(a.purchasesC), 'x-muted') +
                '<p class="x-note">Iibsashada lama jaro faa\'iidada: kharashka alaabta la iibiyay (COGS) ayaa la jaraa marka alaabta la iibiyo. ' +
                'Lacagaha deynta la ururiyay waxaa loo tiriyaa bisha bixintii ugu dambeysay.' +
                (m.skipped ? ' ⚠️ ' + m.skipped + ' diiwaan taariikh aan la akhrin karin lama tirin.' : '') +
                '</p>';
        }
    });

    function buildSummaryText() {
        const now = new Date();
        const m = monthStats(now.getFullYear(), now.getMonth());
        const a = allTimeStats();
        const L = [];

        L.push('📊 Xisaabta Ganacsigaaga');
        L.push('Taariikh: ' + todayISO());
        L.push('');

        L.push('📅 BISHAN — ' + MONTHS_SO[now.getMonth()] + ' ' + now.getFullYear());
        L.push('Iibka: ' + money(m.salesC));
        L.push('Kharashka alaabta (COGS): ' + money(m.cogsC));
        L.push('Kharashka shaqada: ' + money(m.opexC));
        L.push('Mushaharka: ' + money(m.payC));
        L.push('Faa\'iidada saafiga: ' + moneySigned(m.netC));
        L.push('Iibsashada: ' + money(m.purchasesC));
        L.push('');

        L.push('📈 WADARTA GUUD');
        L.push('Iibka guud: ' + money(a.salesC));
        L.push('Faa\'iidada saafiga guud: ' + moneySigned(a.netC));
        L.push('');

        const debtors = Object.values(customers)
            .map(function (c) { return { name: c.name, bal: custBalanceC(c) }; })
            .filter(function (x) { return x.bal > 0; })
            .sort(function (x, y) { return y.bal - x.bal; });
        const debtTotal = debtors.reduce(function (s, x) { return s + x.bal; }, 0);
        L.push('📒 DEYNTA MACMIILKA — ' + money(debtTotal));
        if (!debtors.length) L.push('Deyn ma jirto.');
        debtors.slice(0, 10).forEach(function (d) { L.push('• ' + d.name + ': ' + money(d.bal)); });
        if (debtors.length > 10) L.push('… iyo ' + (debtors.length - 10) + ' kale');
        L.push('');

        const owed = Object.values(vendorLedger)
            .filter(function (v) { return v.balanceCents > 0; })
            .sort(function (x, y) { return y.balanceCents - x.balanceCents; });
        const owedTotal = owed.reduce(function (s, v) { return s + v.balanceCents; }, 0);
        L.push('🏭 DEYNTA ALAAB-QEYBIYAYAASHA — ' + money(owedTotal));
        if (!owed.length) L.push('Deyn ma jirto.');
        owed.slice(0, 10).forEach(function (v) { L.push('• ' + v.name + ': ' + money(v.balanceCents)); });
        if (owed.length > 10) L.push('… iyo ' + (owed.length - 10) + ' kale');
        L.push('');

        L.push('🧾 KHARASHKA BISHAN — ' + money(m.opexC + m.payC));
        const cats = Object.keys(m.byCat);
        if (!cats.length) L.push('Kharash ma jiro.');
        cats.forEach(function (k) {
            const label = (typeof EXP_CATS !== 'undefined' && EXP_CATS[k]) ? EXP_CATS[k] : k;
            L.push('• ' + label + ': ' + money(m.byCat[k]));
        });
        L.push('');

        L.push('💰 CASH HADDA: ' + (openingCashCents === null ? 'lama dejin' : moneySigned(cashOnHandCents())));

        const closes = readCloses();
        if (closes.length) {
            const last = closes.slice().sort(function (x, y) { return x.date.localeCompare(y.date); }).pop();
            L.push('🧾 Xiritaankii ugu dambeeyay (' + last.date + '): ' +
                (last.diffCents === 0 ? 'waa sax' : 'farqi ' + fmtDiff(last.diffCents)));
        }
        return L.join('\n');
    }

    function legacyCopy(text) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return !!ok;
        } catch (e) { return false; }
    }

    let sharing = false;
    async function shareSummary() {
        if (sharing) return;
        sharing = true;
        try {
            const text = buildSummaryText();

            if (navigator.share) {
                try {
                    await navigator.share({ title: 'Xisaabta Ganacsigaaga', text: text });
                    return;
                } catch (err) {
                    if (err && err.name === 'AbortError') return; 
                }
            }

            let copied = false;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                    copied = true;
                }
            } catch (err) { }

            if (!copied) copied = legacyCopy(text);

            if (copied) {
                await uiAlert('✅ La koobiyeeyay!\n\nXisaabta waa la koobiyeeyay. Hadda ku dheji (paste) WhatsApp ama meel kale.');
            } else {
                await uiAlert('⚠️ Koobiyeynta lama samayn karin.\n\nKu koobiyee gacanta:\n\n' + text);
            }
        } finally {
            sharing = false;
        }
    }

    register('share-export', {
        init: function () {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'x-btn';
            btn.id = 'x-share-btn';
            btn.textContent = '📤 Wadaag';
            btn.addEventListener('click', shareSummary);

            const host = document.querySelector('#x-month-card h2');
            if (host) {
                host.appendChild(btn);
            } else {
                const card = makeCard('x-share-card', '<h2><span>📤 Wadaag Xisaabta</span></h2>');
                card.querySelector('h2').appendChild(btn);
                placeCard(card);
            }
        },
        render: function () { }
    });

    const LS_CLOSE = 'ganacsi_daily_close';
    function readCloses() {
        const v = loadJSON(LS_CLOSE, []);
        return Array.isArray(v) ? v : [];
    }
    function writeCloses(list) { localStorage.setItem(LS_CLOSE, JSON.stringify(list)); }

    function chosenCloseDate() {
        const el = document.getElementById('x-close-date');
        const v = el ? el.value : '';
        return X_ISO_DAY.test(v) ? v : todayISO();
    }

    function updateLiveDiff() {
        const live = document.getElementById('x-close-live');
        const input = document.getElementById('x-close-counted');
        if (!live || !input) return;
        const v = parseFloat(input.value);
        if (openingCashCents === null || !(v >= 0)) { live.textContent = ''; return; }
        const diffC = toCents(v) - cashOnHandCentsAt(chosenCloseDate());
        live.className = 'x-live ' + (diffC === 0 ? 'x-pos' : 'x-neg');
        live.textContent = diffC === 0 ? '✅ Waa sax' : '⚠️ Farqi: ' + fmtDiff(diffC);
    }

    async function submitClose(e) {
        e.preventDefault();
        if (!activeSubscription()) {
            await uiAlert('⛔ Isdiiwaangelintii waa dhammaatay.\n\nDhaqaaji koodhka bisha si aad wax cusub u kaydiso.');
            return;
        }
        if (openingCashCents === null) {
            await uiAlert('⚠️ Cash-ka weli lama dejin.\n\nMarka hore taabo "✏️ Hagaaji" oo geli cash-ka hadda gacanta kugu jira.');
            return;
        }

        const counted = parseFloat(document.getElementById('x-close-counted').value);
        if (!(counted >= 0)) {
            await uiAlert('⚠️ Fadlan geli cash-ka aad tiriyay (0 ama ka badan).');
            return;
        }

        const date = chosenCloseDate();
        if (date > todayISO()) {
            await uiAlert('⚠️ Digniin!\n\nTaariikhda xiritaanka ma noqon karto mustaqbal.');
            return;
        }
        const countedC = toCents(counted);
        const expectedC = cashOnHandCentsAt(date);

        const existing = readCloses().find(function (c) { return c.date === date; });
        if (existing) {
            const ok = await uiConfirm(
                'Taariikhdan (' + date + ') hore ayaa loo xiray.\n\nLa tiriyay: ' + money(existing.countedCents) +
                '\n\nMa beddelaysaa xiritaankii hore?',
                { okText: 'Beddel', cancelText: 'Jooji' }
            );
            if (!ok) return;
        }

        const rec = {
            id: newId(),
            date: date,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            countedCents: countedC,
            expectedCents: expectedC,
            diffCents: countedC - expectedC,
            note: document.getElementById('x-close-note').value.trim()
        };
        writeCloses(readCloses().filter(function (c) { return c.date !== date; }).concat([rec]));

        document.getElementById('x-close-form').reset();
        document.getElementById('x-close-date').value = todayISO();
        renderClose();

        if (rec.diffCents !== 0) {
            await uiAlert('⚠️ Farqi ayaa jira!\n\nTaariikh: ' + date +
                '\nLa tiriyay: ' + money(countedC) +
                '\nLa filayay: ' + moneySigned(expectedC) +
                '\nFarqi: ' + fmtDiff(rec.diffCents));
        }
    }

    async function deleteClose(id) {
        const rec = readCloses().find(function (c) { return c.id === id; });
        if (!rec) return;
        const ok = await uiConfirm(
            '⚠️ Digniin!\n\nWaxaad tirtirayaa xiritaankii ' + rec.date + ':\nLa tiriyay: ' + money(rec.countedCents) +
            '\n\nMa hubtaa?',
            { danger: true, okText: 'Tirtir', cancelText: 'Jooji' }
        );
        if (!ok) return;
        writeCloses(readCloses().filter(function (c) { return c.id !== id; }));
        renderClose();
    }

    function renderClose() {
        const exp = document.getElementById('x-close-expected');
        const listEl = document.getElementById('x-close-list');
        const dateEl = document.getElementById('x-close-date');
        if (!exp || !listEl) return;
        if (dateEl) {
            dateEl.max = todayISO();
            if (!dateEl.value) dateEl.value = todayISO();
        }

        const day = chosenCloseDate();
        exp.textContent = (openingCashCents === null)
            ? '⚠️ Cash-ka weli lama dejin. Taabo "✏️ Hagaaji" si aad u dejiso.'
            : (day === todayISO() ? 'Cash la filayo hadda: ' : 'Cash la filayay dhammaadkii ' + day + ': ') +
                moneySigned(cashOnHandCentsAt(day));
        updateLiveDiff();

        const all = readCloses().slice().sort(function (x, y) {
            return x.date.localeCompare(y.date) || (x.time || '').localeCompare(y.time || '');
        });
        if (!all.length) {
            listEl.innerHTML = '<p class="text-center">Wali xiritaan lama gelin.</p>';
            return;
        }

        const flagged = all.filter(function (c) { return c.diffCents !== 0; }).length;
        let html = '<p class="x-note">' + all.length + ' maalmood la xiray • ' +
            (flagged ? '⚠️ ' + flagged + ' maalmood oo farqi leh' : '✅ dhammaan waa sax') + '</p>';

        all.map(function (c, i) { return { c: c, opening: i > 0 ? all[i - 1].countedCents : null }; })
            .reverse()
            .slice(0, 14)
            .forEach(function (x) {
                const c = x.c;
                const bad = c.diffCents !== 0;
                const status = !bad ? '✅ Waa sax'
                    : (c.diffCents < 0 ? '⚠️ Wuu ka yar yahay ' : '⚠️ Wuu ka badan yahay ') + fmtDiff(c.diffCents);
                html +=
                    '<div class="x-close-row ' + (bad ? 'bad' : '') + '">' +
                        '<div>' +
                            '<div class="d">' + escapeHtml(c.date) + ' • ' + escapeHtml(c.time || '') + '</div>' +
                            '<div class="s">' + (x.opening !== null ? 'Furitaan: ' + money(x.opening) + ' • ' : '') +
                                'La filayay: ' + moneySigned(c.expectedCents) + '</div>' +
                            '<div class="f ' + (bad ? 'x-neg' : 'x-pos') + '">' + status + '</div>' +
                            (c.note ? '<div class="s">' + escapeHtml(c.note) + '</div>' : '') +
                        '</div>' +
                        '<div class="r"><b>' + money(c.countedCents) + '</b>' +
                            '<button type="button" class="del-btn" data-x-del-close="' + escapeHtml(c.id) + '">✕</button></div>' +
                    '</div>';
            });
        listEl.innerHTML = html;
    }

    register('daily-close', {
        init: function () {
            const card = makeCard('x-close-card',
                '<h2><span>🧾 Xiritaanka Maalinta (Daily Close)</span></h2>' +
                '<form id="x-close-form">' +
                    '<p class="hint info" id="x-close-expected"></p>' +
                    '<div><label>Taariikhda xiritaanka</label>' +
                        '<input type="date" id="x-close-date"></div>' +
                    '<div><label>Cash-ka aad tiriyay (USD)</label>' +
                        '<input type="number" step="any" min="0" id="x-close-counted" placeholder="0.00" required>' +
                        '<p class="x-live" id="x-close-live"></p></div>' +
                    '<div><label>Faahfaahin (ikhtiyaari)</label>' +
                        '<input type="text" id="x-close-note" autocomplete="off"></div>' +
                    '<button type="submit" class="save-btn" id="x-close-save">Xir maalinta</button>' +
                '</form>' +
                '<p class="jr-head">Xiritaannadii hore</p>' +
                '<div id="x-close-list"></div>');
            placeCard(card);

            const closeDateEl = card.querySelector('#x-close-date');
            closeDateEl.max = todayISO();
            closeDateEl.value = todayISO();
            closeDateEl.addEventListener('change', renderClose);

            card.querySelector('#x-close-form').addEventListener('submit', submitClose);
            card.querySelector('#x-close-counted').addEventListener('input', updateLiveDiff);
            card.querySelector('#x-close-list').addEventListener('click', function (e) {
                const b = e.target.closest('button[data-x-del-close]');
                if (b) deleteClose(b.getAttribute('data-x-del-close'));
            });

            if (!activeSubscription()) {
                card.querySelectorAll('#x-close-form input').forEach(function (el) { el.disabled = true; });
                const btn = card.querySelector('#x-close-save');
                btn.disabled = true;
                btn.textContent = '🔒 Xiran — Dhaqaaji si aad u kaydiso';
            }
        },
        render: renderClose
    });

    // =================================================================
    //  BOOT
    // =================================================================

    function renderAll() {
        safe('cash-archive', syncCashArchive);
        features.forEach(function (f) { safe(f.name + ':render', f.render); });
    }

    function wrapUpdateUI() {
        if (typeof updateUI !== 'function' || updateUI.__xExtras) return;
        const original = updateUI;
        const wrapped = function () {
            const result = original.apply(this, arguments);
            renderAll();
            return result;
        };
        wrapped.__xExtras = true;
        updateUI = wrapped;
    }

    function boot() {
        features.forEach(function (f) { safe(f.name + ':init', f.init); });
        wrapUpdateUI();
        renderAll();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
