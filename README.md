<p align="center">
  <img src="frontend/public/plant-logo.svg" width="96" height="96" alt="Activity Hub's 8-bit plant mascot" />
</p>

<h1 align="center">Activity Hub</h1>

<p align="center">Your activity log, simple and private. Open source under the MIT license.</p>

<p align="center">
  <a href="https://activity-hub.software-juancho-prego-gundin.workers.dev">Discover Activity Hub</a> ·
  <a href="https://activity-hub.software-juancho-prego-gundin.workers.dev/app/">Open the app</a> ·
  <a href="docs/STATUS.md">Project status</a> ·
  <a href="LICENSE">MIT license</a>
</p>

Activity Hub helps you see what you are working on and how your activity evolves. Organise your projects, studies and hobbies into **focus areas**, then mark the days you spend time on each one.

## Features

- Create focus areas with a name, an icon, an optional link and a status: open, standby or archived.
- Record today's activity or correct past days with one check per focus area and day.
- Use Garden's week selector, focus mode and editable monthly history; the previous design remains available from the header.
- View percentages and calendars for any period, with explicit dates.
- Move focus areas to Trash, restore them or permanently delete them after confirmation.
- Use the same app on mobile and desktop, in English or Spanish, with light and dark themes.

Percentages describe the days recorded within the selected period; they are not a score or a target. An empty day simply means no activity has been recorded.

## Getting started

1. Visit the [website](https://activity-hub.software-juancho-prego-gundin.workers.dev), select **Get started**, then **Create account**.
2. Complete the verification and save your private code in your password manager. Confirm that you have saved it to continue.
3. Personalise the example focus areas or create your own, then mark activity in **Log**. The short guide can be dismissed permanently or opened again when needed.

Use the same code to sign in again. **There is no account recovery: losing your code means losing access to your data.** New accounts start with **Read, Project A, Project B and Learn something**, all editable and without recorded activity. Existing accounts keep their data and receive no examples. Accounts are independent. Activity dates use the `Europe/Madrid` time zone.

## Privacy

Your focus areas and activity are encrypted in your browser before being sent to Cloudflare D1. The decryption key stays in the tab's memory; reloading requires entering your code again. The server stores account and session metadata alongside encrypted data.

This prevents reading your content directly from D1 or its backups. A website deliberately modified to capture your code could compromise it. Your browser can save the code in its password manager if you allow it. See [details and limitations](docs/APP.md#privacidad-y-acceso) (in Spanish).

The public Garden landing is always available at `/`; its interactive example never reads or changes your account. Bookmark `/app/` for direct access. Select **Previous** in the header to use the earlier landing or app.

## Local development

Requires **Node 26** and npm. From the repository root:

```sh
npm ci
npm --prefix backend ci
npm --prefix frontend ci
npm run migrate
npm run dev
```

Open **http://127.0.0.1:8787** for the landing page or **http://127.0.0.1:8787/app/** to sign in. Local D1 is separate from production; migrations are explicit and do not import accounts or history. After changing the frontend, restart `npm run dev` to rebuild it.

The frontend uses React, TypeScript and Vite. The backend uses JavaScript, Cloudflare Workers and D1. The 8-bit plant is a local SVG with a pause control and support for reduced motion. Development and verification do not require Python.

## Verification and deployment

[Local design experiments](experiments/local-lab/README.md): Jardín, Órbita and
Cuaderno explore three visual directions and interactive daily, weekly and
journal views. Run `node experiments/local-lab/run.mjs` and open
<http://127.0.0.1:5174/>. These prototypes use fictional browser-local data
and are not included in the production build.

[Garden with the real app](experiments/jardin-real/README.md) is retained as an isolated local runner for the design now used by the standard build. It preserves code-based
sign-in, encryption, edits, history and Trash. Run
`node experiments/jardin-real/run.mjs` with Node 26 and open
<http://localhost:8791/> for the Garden landing and its link to the real app.
The appearance selector keeps the previous landing and app available; switching
inside the app preserves the account. This experiment uses a
separate persistent local database, initially empty; production data is not imported.

```text
experiments/local-lab/
  src/               # Views, styles and model tests
  index.html
  vite.config.mjs
  run.mjs            # Local servers and experiment build
  browser-check.mjs  # Brave smoke checks and screenshots
  README.md
experiments/jardin-real/
  src/               # Local entry and shared Garden styles
  build.mjs          # Isolated build with local comparison controls
  run.mjs            # Local Worker and persistent local D1
  browser-check.mjs  # Real encrypted journeys in disposable D1/Brave
  README.md
```

```sh
npm test                  # Backend and frontend tests
npm run build             # Type checking and frontend build
npm run verify            # Full local verification, including browser checks
```

Browser checks use locally installed Firefox and Brave on macOS with temporary profiles. See the [backend guide](backend/README.md) for commands and environment details.

Before publishing code, follow the [development workflow](backend/README.md#flujo-de-cambio-pruebas-y-publicación): use a branch, run verification and review the pull request before merging into `main`. Every push to `main`, including documentation changes, triggers a production build and deployment through Cloudflare Builds. The remote build does not run the test suite or apply database migrations.

## Documentation

The detailed project documentation is currently in Spanish:

- [Product and rules](docs/APP.md): behaviour, privacy and contracts.
- [Project status](docs/STATUS.md): published capabilities, verification and remaining work.
- [Changelog](CHANGELOG.md): previous changes and releases.
- [Backend and deployment](backend/README.md): commands, environments, migrations and the GitHub/Cloudflare workflow.
- [Third-party notices](frontend/THIRD_PARTY_NOTICES.md): credits and licenses for bundled components and assets.

## License

Activity Hub is licensed under the [MIT License](LICENSE). You may use, modify and redistribute it, including commercially, provided you retain the copyright and license notice. The software is provided without warranty.

Third-party components and assets retain their own licenses; see [third-party notices](frontend/THIRD_PARTY_NOTICES.md) and the bundled font's [SIL Open Font License](frontend/public/fonts/OFL.txt).
