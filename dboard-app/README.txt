DBoard Designer: installable web app
====================================

What is in this folder
  index.html             the whole app
  manifest.webmanifest   name, colours and icons, so phones and computers offer "Install"
  sw.js                  service worker, makes the app open offline after the first visit
  icons/                 app icons
  vendor/                the PDF and Excel libraries, so exports work offline

1. Put it on the web (any ONE of these, all free)
  - Netlify:  go to app.netlify.com/drop and drag this whole folder onto the page.
  - Cloudflare Pages:  Workers & Pages > Create > Pages > Upload assets, upload this folder.
  - GitHub Pages:  put the folder contents in a repository, then Settings > Pages > deploy from branch.
  Use your own domain (for example dboarddesigner.com) if you have one. The address must start with https://
  Files must sit at the top level of the site, with index.html at the root.

2. Install it
  iPhone / iPad (Safari):  open the address, tap Share, then "Add to Home Screen".
  Android (Chrome):        open the address, tap the menu, then "Install app" or "Add to Home screen".
  Windows / Mac / Chromebook (Chrome or Edge):  click the install icon at the right of the address bar.
  It then opens in its own window with its own icon and works with no signal after the first load.

3. Things to know
  - Projects are saved inside the browser on each device. Use Export > Save project to move one to another device.
  - To publish an update, replace the files and change VERSION in sw.js (for example dboard-v2).
  - Saving a PDF or Excel file downloads it to the device's normal downloads folder.
