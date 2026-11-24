# Workout Tracker

A minimal, phone-first workout log. Plain HTML/CSS/JS, no build step, no backend, no login.
All data is stored in your browser (localStorage). Units are kg only.

## Features
- **Program**: workout days (Push, Pull, Legs…), each with exercises (name, sets, target reps). Add, edit, reorder (↑ ↓), delete.
- **Log**: pick a day and enter kg and reps for each set. Last time's numbers show as placeholders, and "Copy last time" fills them in. A weight above your best turns orange. The in-progress workout survives a page reload.
- **Progress**: per exercise, top-set weight chart, volume or total-reps chart, history table, with PRs highlighted.
- **Data**: export and import a JSON backup, remove or load the sample data, erase everything.
- Works offline after the first visit (service worker) and can be added to the home screen.

## Run locally
Any static file server works. From this folder:

```sh
python3 -m http.server 8000
# or: npx serve .
```

Open http://localhost:8000. Opening `index.html` directly also works, but offline mode needs a server.

## Deploy for free

**GitHub Pages**
1. Push this repo to GitHub.
2. Go to Settings → Pages → Build and deployment → Source: *Deploy from a branch*. Pick your branch and the `/ (root)` folder, then Save.
3. After a minute the app is live at `https://<user>.github.io/<repo>/`.

**Netlify**
- Drag and drop this folder onto https://app.netlify.com/drop, or connect the repo with no build command and publish directory `.`.

Then open the URL on your phone and choose **Add to Home Screen** (Safari: Share button; Chrome: ⋮ menu). It opens full screen like an app.

> Data lives per browser and per device. Export a backup regularly, and import it to move to a new phone.
