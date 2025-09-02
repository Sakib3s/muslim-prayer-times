# Prayer Times — Modern, Responsive Web App

A clean, colorful, and responsive Muslim prayer time website built with HTML, CSS, JavaScript, and jQuery. It detects the user’s location, shows today’s prayer times with start/end windows, a live countdown to the next prayer, weekly and monthly timetables, Qibla direction, and optional desktop notifications.

Times and Qibla data are powered by the public AlAdhan API.

## Features
- Today’s prayers: Fajr, Dhuhr, Asr, Maghrib, Isha with icons
- Start/End windows per prayer and 12‑hour time (AM/PM)
- Live countdown to next prayer
- Automatic location detection with manual override (lat/lng)
- Weekly and monthly timetables
- Qibla direction with compass needle and device orientation support
- Optional desktop notifications at prayer time
- Modern, peaceful UI with Remix Icons and responsive layout

## Demo
Deploy via GitHub Pages (see Deployment). Once deployed, your site is accessible at:

```
https://sakib3s.github.io/muslim-prayer-times/
```

## Quick Start
1. Clone or download this repository.
2. Open `index.html` in your browser, or run a simple static server:
   - Python 3: `python3 -m http.server 8000`
   - Node (serve): `npx serve .`
3. Click “Use My Location” and allow access, or set coordinates via “Set Location”.

Requirements:
- Internet connection (CDN for jQuery/Remix Icons/Google Fonts + AlAdhan API)
- Browser with Geolocation API support for auto detection

## Usage
- Today view: shows each prayer with icon, Start/End times, and a highlight for the next upcoming prayer. The top bar displays “Next: <Prayer> <time>” and a live countdown.
- Timetable: switch between Today / Week / Month tabs to view a schedule table.
- Qibla: the needle points toward the Qibla bearing from North. On iOS, tap the compass to grant device orientation permission so the arrow can adapt to heading.
- Notifications: toggle “Prayer reminders”. Your browser will request permission; a notification fires at the next prayer time.

## Project Structure
```
.
├─ index.html             # App layout
├─ assets/
│  ├─ css/
│  │  └─ styles.css      # Theme, layout, responsive styles
│  └─ js/
│     └─ app.js          # Logic: API, geolocation, countdown, Qibla, notifications
```

## Configuration
- Calculation method: defaults to Muslim World League (MWL, method=2). To change, edit `state.method` in `assets/js/app.js`.
- Colors/theme: adjust CSS variables in `assets/css/styles.css` under `:root` (dark) and the `@media (prefers-color-scheme: light)` block for light mode.
- Icon set: icons come from Remix Icons. You can swap class names in the `iconMap` inside `renderToday()` in `assets/js/app.js`.

## APIs and Libraries
- AlAdhan API (no key required)
  - Timings: `https://api.aladhan.com/v1/timings?latitude=..&longitude=..&method=..`
  - Calendar: `https://api.aladhan.com/v1/calendar?latitude=..&longitude=..&method=..&month=..&year=..`
  - Qibla: `https://api.aladhan.com/v1/qibla/<lat>/<lng>`
- jQuery (CDN)
- Remix Icons (CDN)
- Google Fonts — Inter (CDN)

## Privacy Notes
- Location is requested from the browser and stored locally in `localStorage` for convenience.
- Coordinates are sent directly from the browser to the AlAdhan API to fetch timings and Qibla; there is no server of our own.
- Notifications are scheduled locally on the device; no push service is used.

## Browser Support
- Modern Chromium, Firefox, Safari (desktop and mobile) with Geolocation support.
- Device orientation for compass heading requires user permission on iOS (tap the compass once to grant).

## Deployment (GitHub Pages)
1. Push this repository to GitHub.
2. In your repo settings, enable GitHub Pages and set the source to the `main` branch (root).
3. Visit the published URL. If using a custom domain, set it in Pages settings and configure DNS.

### Tips
- If icons or fonts don’t load, verify you are online and CDNs aren’t blocked by extensions/network policies.
- If “Use My Location” fails, use “Set Location” to enter latitude and longitude manually.
- If times look off, confirm your device time zone and optionally adjust the calculation method in `app.js`.

## Credits
- Prayer data: AlAdhan API — https://aladhan.com/prayer-times-api
- Icons: Remix Icon — https://remixicon.com/
- Font: Inter — https://fonts.google.com/specimen/Inter

