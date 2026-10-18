‎/*
‎ =====================================================================
‎  features/extras.js  —  Extra features for "Xisaabta Ganacsigaaga"
‎ =====================================================================
‎
‎  HOW TO ADD A NEW FEATURE (read this first)
‎
‎  1. Go to the section "FEATURES" below and copy the template at its end.
‎  2. Give your feature a unique name and fill in two functions:
‎       init()    runs ONCE when the page loads: build your HTML, add listeners.
‎       render()  runs EVERY time the app refreshes (after updateUI): redraw numbers.
‎  3. Register it:   register('my-feature', { init: ..., render: ... });
‎  4. Use the helpers in "SHARED HELPERS": injectStyle, makeCard, placeCard,
‎     parseAppDate, activeSubscription, newId.
‎  5. Everything the user can see must be written in Somali.
‎  6. Never redeclare an app global (money, toCents, purchases, ...). Just use them.
‎  7. A feature that throws an error is skipped: it can not break the app
‎     or the other features.
‎
‎  How it hooks in: the app calls updateUI() after every change. In "BOOT" at
‎  the bottom we wrap updateUI once, so every feature redraws with the app.
‎  index.html is not edited except for the one <script> tag that loads this file.
‎ =====================================================================
‎*/
‎(function () {
‎    'use strict';
‎
‎    // =================================================================
‎    //  SHARED HELPERS
‎    // =================================================================
‎
‎    const MONTHS_SO = ['Janaayo', 'Febraayo', 'Maarso', 'Abriil', 'Maajo', 'Juun',
‎                       'Luuliyo', 'Ogosto', 'Sebtembar', 'Oktoobar', 'Nofembar', 'Desembar'];
‎
‎    const features = [];
‎    function register(name, feature) { features.push(Object.assign({ name: name }, feature)); }
‎
‎    function newId() { return '_' + Math.random().toString(36).slice(2, 11); }
‎
‎    // False when the monthly subscription has expired (new records are locked)
‎    function activeSubscription() {
‎        return (typeof subscriptionActive === 'undefined') ? true : subscriptionActive;
‎    }
‎
‎    function injectStyle(id, css) {
‎        if (document.getElementById(id)) return;
‎        const s = document.createElement('style');
‎        s.id = id;
‎        s.textContent = css;
‎        document.head.appendChild(s);
‎    }
‎
‎    function makeCard(id, html) {
‎        const d = document.createElement('div');
‎        d.className = 'card';
‎        d.id = id;
‎        d.innerHTML = html;
‎        return d;
‎    }
‎
‎    // Cards are placed on the Xisaab tab, right after the Profit & Loss card,
‎    // in the order the features are registered.
‎    let lastPlaced = null;
‎    function placeCard(card) {
‎        const tab = document.getElementById('tab-acct');
‎        if (!tab) return false;
‎        if (!lastPlaced) {
‎            const pl = document.getElementById('pl-card');
‎            lastPlaced = pl ? pl.closest('.card') : null;
‎        }
‎        if (lastPlaced) lastPlaced.insertAdjacentElement('afterend', card);
‎        else tab.appendChild(card);
‎        lastPlaced = card;
‎        return true;
‎    }
‎
‎    // ----- Reading the dates the app stores -----
‎    // Many records store the date as the phone's local text (toLocaleDateString),
‎    // e.g. "10/1/2026" or "01/10/2026". We learn the phone's order (M/D/Y, D/M/Y
‎    // or Y/M/D) once and use it to read those strings back.
‎    function toAscii(s) {
‎        return String(s)
‎            .replace(/[\u0660-\u0669]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); })
‎            .replace(/[\u06F0-\u06F9]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); });
‎    }
‎
‎    let dateOrder = null;
‎    function localeOrder() {
‎        if (dateOrder) return dateOrder;
‎        dateOrder = { m: 0, d: 1, y: 2 };               // fallback: M/D/Y
‎        try {
‎            const nums = (toAscii(new Date(2001, 10, 22).toLocaleDateString()).match(/\d+/g) || []).map(Number);
‎            if (nums.length === 3) {
‎                const y = nums.findIndex(function (n) { return n === 2001 || n === 1; });
‎                const d = nums.findIndex(function (n) { return n === 22; });
‎                if (y !== -1 && d !== -1 && y !== d) {
‎                    dateOrder = { y: y, d: d, m: [0, 1, 2].find(function (i) { return i !== y && i !== d; }) };
‎                }
‎            }
‎        } catch (e) { /* keep fallback */ }
‎        return dateOrder;
‎    }
‎
‎    // Returns a Date, or null when the text can not be read
‎    function parseAppDate(str) {
‎        if (!str) return null;
‎        const s = toAscii(str).trim();
‎
‎        const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);          // YYYY-MM-DD (newer records)
‎        if (iso) {
‎            const di = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
‎            return isNaN(di.getTime()) ? null : di;
‎        }
‎
‎        const nums = (s.matc
