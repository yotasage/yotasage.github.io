This is a starter template for [Learn Next.js](https://nextjs.org/learn).
### `Link to the website`
https://yotasage.github.io/

### `npm docs`
https://docs.npmjs.com/cli/v9/commands/npm-outdated

### `NVM for Windows`
A node version manager.
https://github.com/coreybutler/nvm-windows?tab=readme-ov-file

### `npm run dev`
This runs the command ```next dev```.

Starts the development server.

### `npm update`
This command will update all the packages listed to the latest version (specified by the tag config), respecting the semver constraints of both your package and its dependencies (if they also require the same package).

It will also install missing packages.

Note that by default npm update will not update the semver values of direct dependencies in your project package.json, if you want to also update values in package.json you can run: ```npm update --save``` (or add the ```save=true``` option to a configuration file to make that the default behavior).

### `npm outdated`
This command will check the registry to see if any (or, specific) installed packages are currently outdated.

### `npm install`
This command installs a package and any packages that it depends on.

### `npm run build`
This runs the command ```next build```.

Running ```next build``` generates an optimized version of your application for production. HTML, CSS, and JavaScript files are created based on your pages. JavaScript is compiled and browser bundles are minified using the Next.js Compiler to help achieve the best performance and support all modern browsers.

Next.js produces a standard deployment output used by managed and self-hosted Next.js. This ensures all features are supported across both methods of deployment. In the next major version, we will be transforming this output into our Build Output API specification.

### `npm run start`
This runs the command ```next start```.

```next start``` is used to run the app in production mode, but requires ```next build``` to be run first to generate an optimized production build.