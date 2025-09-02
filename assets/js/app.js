/* Prayer Times App - HTML/CSS/JS + jQuery
 * Uses AlAdhan API for timings and Qibla.
 */
(function ($) {
  'use strict';

  const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]; // displayed
  const STORAGE_KEYS = {
    coords: 'pt.coords',
    method: 'pt.method',
    notify: 'pt.notify.enabled',
  };

  let state = {
    coords: null, // {lat, lng}
    method: 2, // Muslim World League default
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    country: '',
    city: '',
    todayTimings: null,
    monthData: null, // API calendar for month
    qiblaDeg: null,
    nextPrayer: null, // {name, time: Date}
    countdownTimer: null,
    notifyEnabled: false,
    notifyTimeout: null,
  };

  // Utils
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
  const fmtHM = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  const parseHHmm = (hhmm, baseDate) => {
    const [h, m] = hhmm.split(':').map(Number);
    const dt = new Date(baseDate);
    dt.setHours(h, m, 0, 0);
    return dt;
  };
  const stripTZ = (s) => (s || '').split(' ')[0]; // remove "(CEST)" pieces

  const saveLocal = (key, val) => localStorage.setItem(key, JSON.stringify(val));
  const loadLocal = (key, fallback = null) => {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  };

  // DOM refs
  const $locationText = $('#location-text');
  const $dateText = $('#date-text');
  const $tzText = $('#tz-text');
  const $todayGrid = $('#today-grid');
  const $nextName = $('#next-prayer-name');
  const $nextTime = $('#next-prayer-time');
  const $countdown = $('#countdown-timer');
  const $table = $('#timetable');
  const $tableMeta = $('#timetable-meta');
  const $qDeg = $('#qibla-deg');
  const $needle = $('#qibla-needle');
  const $notifyToggle = $('#notify-toggle');
  const $notifyStatus = $('#notify-status');

  // Initialize
  $(async function () {
    hydrateFromStorage();
    bindUI();
    renderDate();

    if (state.coords) {
      updateAll();
    } else {
      tryGeo();
    }
  });

  function hydrateFromStorage() {
    const coords = loadLocal(STORAGE_KEYS.coords);
    const method = loadLocal(STORAGE_KEYS.method);
    const notify = loadLocal(STORAGE_KEYS.notify);
    if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') state.coords = coords;
    if (method) state.method = method;
    state.notifyEnabled = !!notify;
    $notifyToggle.prop('checked', state.notifyEnabled);
    updateNotifyStatus();
  }

  function bindUI() {
    $('#btn-locate').on('click', tryGeo);
    $('#btn-set-location').on('click', () => {
      const dlg = document.getElementById('location-dialog');
      if (dlg) dlg.showModal();
    });
    $('#save-location').on('click', (e) => {
      e.preventDefault();
      const lat = parseFloat($('#lat').val());
      const lng = parseFloat($('#lng').val());
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        state.coords = { lat, lng };
        saveLocal(STORAGE_KEYS.coords, state.coords);
        closeDialog();
        updateAll();
      }
    });
    function closeDialog() { const dlg = document.getElementById('location-dialog'); if (dlg && dlg.open) dlg.close(); }

    // Tabs
    $('#tab-today').on('click', () => {
      setActiveTab('today');
      renderTimetable('today');
    });
    $('#tab-week').on('click', () => {
      setActiveTab('week');
      renderTimetable('week');
    });
    $('#tab-month').on('click', () => {
      setActiveTab('month');
      renderTimetable('month');
    });

    // Notifications
    $notifyToggle.on('change', async function () {
      if (this.checked) {
        const perm = await ensureNotificationPermission();
        if (perm !== 'granted') {
          this.checked = false;
          state.notifyEnabled = false;
          saveLocal(STORAGE_KEYS.notify, false);
          updateNotifyStatus('Permission denied');
          return;
        }
        state.notifyEnabled = true;
        saveLocal(STORAGE_KEYS.notify, true);
        scheduleNextNotification();
      } else {
        state.notifyEnabled = false;
        saveLocal(STORAGE_KEYS.notify, false);
        clearNotifyTimeout();
      }
      updateNotifyStatus();
    });
  }

  function setActiveTab(which) {
    $('.tab').removeClass('active').attr('aria-selected', 'false');
    const id = which === 'today' ? '#tab-today' : which === 'week' ? '#tab-week' : '#tab-month';
    $(id).addClass('active').attr('aria-selected', 'true');
  }

  function renderDate() {
    const now = new Date();
    const fmt = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $dateText.text(fmt);
    $tzText.text(state.timezone || '');
  }

  function tryGeo() {
    if (!navigator.geolocation) {
      $locationText.text('Geolocation unavailable. Set coordinates manually.');
      return;
    }
    $locationText.text('Requesting location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        saveLocal(STORAGE_KEYS.coords, state.coords);
        updateAll();
      },
      (err) => {
        console.warn('Geolocation error', err);
        $locationText.text('Location blocked. Use Set Location.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  async function updateAll() {
    if (!state.coords) return;
    const { lat, lng } = state.coords;
    $locationText.text(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    try {
      await Promise.all([
        fetchTodayTimings(lat, lng),
        fetchMonthCalendar(lat, lng),
        fetchQibla(lat, lng),
      ]);
      renderToday();
      computeNextPrayerAndCountdown();
      renderTimetable($('.tab.active').attr('id') === 'tab-week' ? 'week' : $('.tab.active').attr('id') === 'tab-month' ? 'month' : 'today');
      if (state.notifyEnabled) scheduleNextNotification();
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchTodayTimings(lat, lng) {
    const url = `https://api.aladhan.com/v1/timings?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&method=${encodeURIComponent(state.method)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json && json.code === 200) {
      state.todayTimings = json.data;
      state.timezone = json.data.meta.timezone || state.timezone;
      $tzText.text(state.timezone);
    } else {
      throw new Error('Failed to fetch today timings');
    }
  }

  async function fetchMonthCalendar(lat, lng) {
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    const url = `https://api.aladhan.com/v1/calendar?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&method=${encodeURIComponent(state.method)}&month=${m}&year=${y}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json && json.code === 200) {
      state.monthData = json.data; // array of days
    } else {
      throw new Error('Failed to fetch month calendar');
    }
  }

  async function fetchQibla(lat, lng) {
    const url = `https://api.aladhan.com/v1/qibla/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json && json.code === 200) {
      state.qiblaDeg = json.data.direction;
      $qDeg.text(`${Math.round(state.qiblaDeg)}°`);
      updateNeedle();
    }
  }

  function updateNeedle(deviceHeadingDeg) {
    // Qibla bearing is from geographic North clockwise. If device heading is available, subtract it.
    const bearing = (state.qiblaDeg ?? 0);
    const rot = (bearing - (deviceHeadingDeg || 0) + 360) % 360;
    $needle.css('--deg', `${rot}deg`);
  }

  // Optional: adjust for device orientation if available
  if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
    // iOS: require user gesture; provide when user taps needle
    $('.compass').on('click', async () => {
      try {
        const perm = await window.DeviceOrientationEvent.requestPermission();
        if (perm === 'granted') {
          window.addEventListener('deviceorientation', (ev) => {
            const heading = ev.webkitCompassHeading || (360 - ev.alpha); // fallback
            if (Number.isFinite(heading)) updateNeedle(heading);
          });
        }
      } catch {}
    });
  } else if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientationabsolute', (ev) => {
      const heading = ev.alpha;
      if (Number.isFinite(heading)) updateNeedle(360 - heading);
    });
  }

  function renderToday() {
    if (!state.todayTimings) return;
    const t = state.todayTimings.timings;
    $todayGrid.empty();
    const now = new Date();
    // Start times for each prayer today
    const starts = PRAYERS.map((name) => {
      const val = stripTZ(t[name]);
      return { name, startStr: val, start: parseHHmm(val, now) };
    });
    // Compute end times (next prayer's start; Isha ends at tomorrow Fajr)
    const ends = starts.map((item, idx) => {
      if (idx < starts.length - 1) return { name: item.name, end: starts[idx + 1].start };
      // Isha end: Fajr tomorrow
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
      let fajrNext = null;
      if (state.monthData && (now.getDate() < state.monthData.length)) {
        const fajrStr = stripTZ(state.monthData[now.getDate()].timings.Fajr);
        fajrNext = parseHHmm(fajrStr, tomorrow);
      } else {
        fajrNext = parseHHmm(stripTZ(t['Fajr']), tomorrow);
      }
      return { name: item.name, end: fajrNext };
    });

    // Determine next upcoming
    const next = starts.find((i) => i.start > now) || null;

    const iconMap = {
      Fajr: 'ri-moon-line',
      Dhuhr: 'ri-sun-line',
      Asr: 'ri-time-line',
      Maghrib: 'ri-moon-line', // filled for better visibility
      Isha: 'ri-moon-clear-line'
    };

    starts.forEach((i, idx) => {
      const endObj = ends[idx];
      const $el = $('<div/>').addClass('prayer-item').attr('data-prayer', i.name).append(
        $('<div/>').addClass('icon').append($('<i/>').addClass(iconMap[i.name] || '')), 
        $('<div/>').addClass('name').text(i.name),
        $('<div/>').addClass('value').text(fmtHM(i.start)),
        $('<div/>').addClass('range').append(
          $('<span/>').addClass('label').text('Start'),
          $('<span/>').addClass('v').text(fmtHM(i.start)),
          $('<span/>').addClass('label').text('End'),
          $('<span/>').addClass('v').text(fmtHM(endObj.end))
        )
      );
      if (next && next.name === i.name) $el.addClass('next');
      $todayGrid.append($el);
    });
  }

  function computeNextPrayerAndCountdown() {
    if (!state.todayTimings) return;
    const now = new Date();
    const t = state.todayTimings.timings;
    const todayItems = PRAYERS.map((name) => {
      const timeStr = stripTZ(t[name]);
      return { name, at: parseHHmm(timeStr, now) };
    });
    let next = todayItems.find((i) => i.at > now);
    if (!next) {
      // Next is Fajr of tomorrow
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
      const monthData = state.monthData;
      if (monthData) {
        // Try use monthData if tomorrow is in same month
        const dayIdx = now.getDate(); // 1-based; tomorrow index = dayIdx (0-based)
        if (dayIdx < monthData.length) {
          const fajrStr = stripTZ(monthData[dayIdx].timings.Fajr);
          next = { name: 'Fajr', at: parseHHmm(fajrStr, tomorrow) };
        }
      }
      if (!next) {
        // Fallback: add 24h to today's Fajr
        const fajr = parseHHmm(stripTZ(t['Fajr']), now);
        fajr.setDate(fajr.getDate() + 1);
        next = { name: 'Fajr', at: fajr };
      }
    }
    state.nextPrayer = next;
    $nextName.text(next.name);
    $nextTime.text(fmtHM(next.at));
    startCountdown(next.at);
  }

  function startCountdown(target) {
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    const tick = () => {
      const now = new Date();
      let diffMs = target - now;
      if (diffMs <= 0) {
        $countdown.text('00:00:00');
        clearInterval(state.countdownTimer);
        // refresh for next prayer
        updateAll();
        return;
      }
      const hh = Math.floor(diffMs / 3600000); diffMs -= hh * 3600000;
      const mm = Math.floor(diffMs / 60000); diffMs -= mm * 60000;
      const ss = Math.floor(diffMs / 1000);
      $countdown.text(`${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`);
    };
    tick();
    state.countdownTimer = setInterval(tick, 1000);
  }

  function renderTimetable(mode) {
    if (!state.monthData || !Array.isArray(state.monthData)) return;
    const now = new Date();
    let rows = [];
    if (mode === 'today') {
      const i = now.getDate() - 1;
      rows = [state.monthData[i]];
      $tableMeta.text('Today');
    } else if (mode === 'week') {
      const start = startOfWeek(now);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      const m = now.getMonth();
      const arr = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getMonth() !== m) continue; // keep within month fetched
        const idx = d.getDate() - 1;
        arr.push(state.monthData[idx]);
      }
      rows = arr;
      const rangeText = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      $tableMeta.text(`Week: ${rangeText}`);
    } else {
      rows = state.monthData;
      const monthLabel = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      $tableMeta.text(monthLabel);
    }

    const $tbody = $table.find('tbody');
    $tbody.empty();
    rows.forEach((day, idx) => {
      const dateStr = `${day.date.readable}`; // e.g., 10 Sep 2023
      const t = day.timings;
      const tr = $('<tr/>');
      const todayReadable = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      if (dateStr.replace(',', '') === todayReadable.replace(',', '')) tr.addClass('highlight');
      tr.append($('<td/>').text(dateStr));
      PRAYERS.forEach((p) => {
        const base = new Date();
        base.setDate(base.getDate() + (mode === 'month' ? (idx - (new Date().getDate() - 1)) : 0));
        const d = parseHHmm(stripTZ(t[p]), base);
        tr.append($('<td/>').text(fmtHM(d)));
      });
      $tbody.append(tr);
    });
  }

  function startOfWeek(d) {
    const day = d.getDay(); // 0 Sun
    const diff = (day === 0 ? -6 : 1) - day; // Monday
    const dt = new Date(d);
    dt.setDate(d.getDate() + diff);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  async function ensureNotificationPermission() {
    if (!('Notification' in window)) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission !== 'denied') {
      try { return await Notification.requestPermission(); } catch { return 'denied'; }
    }
    return 'denied';
  }

  function scheduleNextNotification() {
    clearNotifyTimeout();
    if (!state.notifyEnabled || !state.nextPrayer) return;
    const when = state.nextPrayer.at - new Date();
    if (when <= 0 || when > 2147483647) return; // cap to ~24 days
    state.notifyTimeout = setTimeout(() => {
      try {
        new Notification('Prayer Time', {
          body: `${state.nextPrayer.name} — ${fmtHM(state.nextPrayer.at)}`,
        });
      } catch {}
      // After firing, compute next
      updateAll();
    }, when);
  }

  function clearNotifyTimeout() {
    if (state.notifyTimeout) {
      clearTimeout(state.notifyTimeout);
      state.notifyTimeout = null;
    }
  }

  function updateNotifyStatus(extra) {
    if (!('Notification' in window)) {
      $notifyStatus.text('Notifications unsupported by this browser.');
      return;
    }
    const base = state.notifyEnabled ? 'Notifications enabled' : 'Notifications disabled';
    $notifyStatus.text(extra ? `${base} — ${extra}` : base);
  }

})(jQuery);
