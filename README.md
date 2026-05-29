# OtherSide

OtherSide is a cinematic antipode explorer. It asks for your current location, flies from orbit into your position, then lets you cross through Earth to the exact opposite point on the planet.

## Features

- Browser geolocation with a San Francisco preview fallback.
- Smooth scroll-driven Earth fly-in built with Three.js.
- Clickable marker that animates from your location to the antipode.
- Satellite arrival map for land locations.
- Ocean basemap fallback for open-water antipodes.
- Full-screen map canvas rendering to avoid visible tile seams.
- Minimal loading state while destination maps prepare.
- Responsive, minimal interface designed to feel cinematic and polished.

## Run Locally

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```

## Notes

OtherSide uses public Esri map tile services for the arrival map and Three.js for the globe animation. Location access is optional; if permission is denied, the site runs as a preview experience.
