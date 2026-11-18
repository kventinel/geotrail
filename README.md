# GeoTrail

Browser geography game with real 360° Wikimedia Commons panoramas, a Leaflet map, five-round journeys, daily routes (Europe/Moscow), optional two-minute timer, server-side scoring, shared route links and a browser-local personal best.

Run: `npm start` (Node 18+, no dependencies). Test: `npm test`.

Deployed to iva-gpu.iva.yp-c.yandex.net:8081 as the user service `geotrail.service`, independent of BOOSTBALL on port 8080. Sources and assets: `~/geotrail`. Restart: `systemctl --user restart geotrail`. Logs: `journalctl --user -u geotrail`.

This version has 41 real panorama viewpoints, including 8 connected walking routes (2–6 viewpoints each). Walking uses previous/next arrows with actual distances and a return-to-start button. It switches between curated photos, rather than offering continuous Google Street View coverage. Scoring always uses the starting viewpoint. The original 16-point overview mode is also available. Solo sessions are in memory and reset on server restart. Scores: round(5000 * exp(-great_circle_distance_km / 2000)). A shared seed reproduces the location sequence for the same dataset.

Panorama credits, original titles, authors, source links and licenses: `public/credits.json` (also shown after each guess). Images are Wikimedia Commons 3840 px thumbnails. Pannellum 2.5.6 and Leaflet 1.9.4 are bundled locally under their MIT and BSD-2-Clause licenses, respectively. Map tiles © OpenStreetMap contributors; these require internet access.

## Friends competition

Choose “Соревнование с друзьями”, enter a nickname, create a room and send the invitation URL to 1–11 friends. Guests can also enter the six-character room code. The host starts each round after results and can start another match with the same players. Each match has five identical starting locations, walking enabled and a common 60/120/180-second server deadline. Answers and newly earned points are withheld until everyone submits or the deadline passes. Ties share the same rank. Missing answers receive zero points. Host privileges transfer when the host leaves. Joining a running match is disabled.

A refresh restores a player's seat from tab-scoped sessionStorage. Room state is atomically saved in `data/rooms.json` (not publicly served) and survives server restarts; rooms expire 24 hours after the last action. Keep this directory when deploying. Clients poll authenticated room snapshots every 1.5 seconds. Player tokens are private; public snapshots expose only player IDs. No accounts or external API keys are needed.

Tests cover full multiplayer matches, hidden answers, duplicate submissions, stale round actions, permissions, validation, deadline expiry, persistence, host transfer, independent HTTP clients, real walking assets and neighboring distances.

## Worldwide streets (v1.2)

Default solo rounds and new multiplayer matches now use the official Panoramax 5.3.1 PhotoViewer, bundled locally. Navigation uses the provider's real street graph, on-panorama arrows, neighboring sequences and click-to-go. It is not limited to the old 2–6-photo routes. The return button restores the exact starting image, and scores always refer to that starting image. Existing rooms with legacy scenes remain compatible.

`streets.json` contains 81 curated connected 360° starting images in 26 countries across Africa, Asia, Europe, North America, South America and Oceania. Each start has a provider-supplied neighboring image within 150 m. Countries were checked against Natural Earth 1:10m country polygons. Seeded games select five different geographic regions; live navigation can continue beyond the starting catalog wherever the provider has imagery. Coverage, image quality, sequence lengths and external availability depend on Panoramax and its hosting instances; coverage is not identical to Google Street View. No Google key, billing or private credentials are used.

Clicking the answer map now submits immediately in both solo and multiplayer. There is no confirmation button. Requests are guarded against double clicks, and the solo answer endpoint is idempotent so retrying a lost response cannot replace an accepted guess or add points twice. Map dragging and zooming do not submit answers. The original offline panorama mode remains available as “Обзор мира”.

Panoramax photos retain their live author/license attribution. Initial-image source links and licenses appear in results. Provider images are fetched directly by the browser rather than copied into this project. The MIT library license is `public/vendor/PANORAMAX-LICENSE`; the CommonJS photo-viewer bundle is wrapped in a local `exports` scope to avoid leaking its minified variables into the app. The provider API is https://api.panoramax.xyz/api and its viewer documentation is https://docs.panoramax.fr/web-viewer/.

## Faster loading (v1.2.1)

The photo viewer now starts with the SD panorama instead of downloading a bandwidth-test image and potentially selecting a full HD base image. Tiled imagery still refines the visible view. The reproducible, checked source transformation is `scripts/optimize-viewer.py` (Panoramax 5.3.1).

Read-only provider metadata goes through `/api/street`: starting metadata and API landing information are seeded locally, subsequent requests share a bounded 20 MB / 256-entry cache for six hours, simultaneous requests are deduplicated, and expired data remains usable if the provider fails. Only the fixed Panoramax metadata API is proxied; images stay on the provider CDN. Two neighboring metadata items are warmed in the background, with two concurrent workers and at most 16 queued requests. Browser metadata is cached for ten minutes.

The native viewer's existing texture preloading remains enabled. After a picture is visible, a delayed, low-priority warmup loads up to two neighboring SD previews, retaining at most four decoded images. Extra warmup is skipped for Save-Data and 2G connections. The same viewer is reused between street rounds, preserving initialized API state and texture caches. Public metadata caching never includes player sessions, room state or answers.
