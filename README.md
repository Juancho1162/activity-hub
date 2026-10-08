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

- Create focus areas with a name, an optional link and a status: open, standby or archived.
- Record today's activity or correct past days with one check per focus area and day.
- View percentages and calendars for any period, with explicit dates.
- Move focus areas to Trash, restore them or permanently delete them after confirmation.
- Use the same app on mobile and desktop, in English or Spanish, with light and dark themes.

Percentages describe the days recorded within the selected period; they are not a score or a target. An empty day simply means no activity has been recorded.

## Getting started

1. Visit the [website](https://activity-hub.software-juancho-prego-gundin.workers.dev), select **Get started**, then **Create account**.
2. Complete the verification and save your private code in your password manager. Confirm that you have saved it to continue.
3. Create your first focus area and mark its activity in **Log**. View its history in **Dashboard**.

Use the same code to sign in again. **There is no account recovery: losing your code means losing access to your data.** Each account starts empty and is independent. Activity dates use the `Europe/Madrid` time zone.

## Privacy

Your focus areas and activity are encrypted in your browser before being sent to Cloudflare D1. The decryption key stays in the tab's memory; reloading requires entering your code again. The server stores account and session metadata alongside encrypted data.

This prevents reading your content directly from D1 or its backups. A website deliberately modified to capture your code could compromise it. Your browser can save the code in its password manager if you allow it. See [details and limitations](docs/APP.md#privacidad-y-acceso) (in Spanish).

The public landing page is always available at `/`. Bookmark `/app/` for direct access to the app.

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

```sh
npm test                  # Backend and frontend tests
npm run build             # Type checking and frontend build
npm run verify            # Full local verification, including browser checks
```

Browser checks use locally installed Firefox and Brave on macOS with temporary profiles. See the [backend guide](backend/README.md) for commands and environment details.

Before publishing code, follow the [development workflow](backend/README.md#flujo-de-cambio-pruebas-y-publicación): use a branch, run verification and review the pull request before merging into `main`. Every push to `main`, including documentation changes, triggers a production build and deployment through Cloudflare Builds. The remote build does not run the test suite or apply database migrations.

## Documentation

The detailed project documentation is currently in Spanish:

- [Product and rules](docs/APP.md): behaviour, privacy, contracts and future plans.
- [Project status](docs/STATUS.md): published capabilities, verification and remaining work.
- [Changelog](CHANGELOG.md): previous changes and releases.
- [Backend and deployment](backend/README.md): commands, environments, migrations and the GitHub/Cloudflare workflow.
- [Third-party notices](frontend/THIRD_PARTY_NOTICES.md): credits and licenses for bundled components and assets.

Email, an AI-maintained wiki, chat, summaries and mental models are future ideas. The available product is the activity log; the project status distinguishes shipped features from planned work.

## License

Activity Hub is licensed under the [MIT License](LICENSE). You may use, modify and redistribute it, including commercially, provided you retain the copyright and license notice. The software is provided without warranty.

Third-party components and assets retain their own licenses; see [third-party notices](frontend/THIRD_PARTY_NOTICES.md) and the bundled font's [SIL Open Font License](frontend/public/fonts/OFL.txt).
