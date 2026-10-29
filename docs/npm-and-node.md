# npm, Node and Next.js commands

Reminders of how the commands used in this project work.

## Links

- The site: https://yotasage.github.io/
- npm CLI docs (every command): https://docs.npmjs.com/cli/v11/commands
- NVM for Windows: https://github.com/coreybutler/nvm-windows
- Next.js docs for the Pages Router, which this project uses: https://nextjs.org/docs/pages

## Node versions (NVM for Windows)

NVM for Windows is a Node version manager: it keeps several Node versions installed side by side and switches
between them.

| Command | What it does |
| --- | --- |
| `nvm list` | Installed versions. `*` marks the one in use. |
| `nvm list available` | Versions that can be installed. |
| `nvm install 22` | Installs the newest Node 22. `nvm install lts` and `nvm install latest` also work. |
| `nvm use 22` | Switches to Node 22. Windows may ask for administrator rights. |
| `node -v`, `npm -v` | The Node and npm versions in use. |

GitHub builds the site with Node 22 (set in [.github/workflows/nextjs.yml](../.github/workflows/nextjs.yml)). If
the build works locally but fails on GitHub, try `nvm use 22` and build again.

## Scripts in package.json

`npm run <name>` runs the script with that name from the `scripts` section of [package.json](../package.json).

### `npm run dev`

Runs `next dev -H 0.0.0.0 -p 3000`.

Starts the development server at http://localhost:3000. Pages reload when a file is saved. `-H 0.0.0.0` makes the
server reachable from other devices on the same network, so the site can be tested on a phone at
`http://<the PC's IP address>:3000` (`ipconfig` shows the IP address; Windows Firewall may ask to allow Node the
first time).

In dev mode `getStaticProps` runs on every page load, so changes to [references.bib](../references.bib) show up
after a reload.

### `npm run build`

Runs `next build`.

Generates an optimized version of the site for production: TypeScript is type-checked, every page is rendered to
HTML (this is when `getStaticProps` runs), and the JavaScript and CSS are minified. The build stops on type errors,
so run it before pushing. GitHub runs the same build and does not deploy if it fails.

The output is not the same locally and on GitHub:

- **Locally** the output goes to `.next/`, because the repo has no `next.config` file.
- **On GitHub** the *Setup Pages* step (`actions/configure-pages` with `static_site_generator: next`) creates a
  `next.config.js` with `output: 'export'` and `images.unoptimized` before building. The build then writes plain
  HTML, CSS and JavaScript files to `out/`, and that folder is what GitHub Pages serves.

### `npm run start`

Runs `next start -H 0.0.0.0`.

Serves the build from `npm run build` in production mode at http://localhost:3000 (run the build first). This is
Next's own Node server, so it is close to the real site but not the same: GitHub Pages has no server, and anything
that only works because of the server (API routes, `getServerSideProps`) works here and fails on the real site.

## Installing packages

### `npm install`

Installs every package listed in package.json, and the packages they depend on, into `node_modules/`. Also installs
missing packages and updates package-lock.json when needed.

| Command | What it does |
| --- | --- |
| `npm install <package>` | Adds a package to `dependencies`. |
| `npm install -D <package>` | Adds a package to `devDependencies` (only needed for building). |
| `npm uninstall <package>` | Removes a package. |
| `npm ls <package>` | Which version is installed, and which package needs it. |

After every install, the `postinstall` script runs two scripts:

- [scripts/copy-pdfjs-assets.mjs](../scripts/copy-pdfjs-assets.mjs) copies the pdf.js worker and data files to
  `public/pdfjs/`.
- [scripts/collect-licenses.mjs](../scripts/collect-licenses.mjs) writes the licences of the packages the site uses
  to `lib/generated/third-party-licenses.json`, which the `/licenses` page shows.

Git ignores both outputs. If the build complains that `lib/generated/third-party-licenses.json` is missing, run
`npm install`.

### `npm ci`

Clean install: deletes `node_modules/` and installs exactly the versions in package-lock.json, without changing it.
GitHub uses this. It fails if package.json and package-lock.json do not match; run `npm install` locally and commit
package-lock.json.

## Keeping packages up to date

### `npm outdated`

Checks the registry for installed packages that are outdated. The columns:

- **Current**: installed version.
- **Wanted**: newest version allowed by the range in package.json.
- **Latest**: newest version published.

Red means a newer version within the range exists, so update now. Yellow means the newer version is outside the
range (usually a new major version), so proceed with caution.

### `npm update`

Updates the packages to the newest version allowed by the ranges in package.json (the *Wanted* column), including the
packages they depend on. It also installs missing packages.

By default `npm update` does not change the ranges of direct dependencies in package.json, only package-lock.json.
To also update package.json, run `npm update --save` (or add `save=true` to an `.npmrc` file to make that the
default).

### New major versions

`npm update` never goes past the range, so it never installs a new major version. To upgrade to one, install the
latest version by name, several at once if they belong together:

```
npm install next@latest
npm install react@latest react-dom@latest @types/react@latest @types/react-dom@latest
```

Read the upgrade guide or release notes first, then run `npm run build` to find what broke.

### Version ranges

| Range | Allows |
| --- | --- |
| `^16.4.3` | `16.4.3` up to, but not including, `17.0.0` |
| `^0.8.3` | `0.8.3` up to, but not including, `0.9.0` (for `0.x` the minor version counts as major) |
| `~16.4.3` | `16.4.3` up to, but not including, `16.5.0` |
| `16.4.3` | Only `16.4.3` |

## Running tools from node_modules

`npx <command>` runs a program installed in `node_modules/.bin`, for example:

- `npx tsc --noEmit`: type-checks the whole project in under a second, without building.
- `npx next --help`: lists the Next.js commands and options.
