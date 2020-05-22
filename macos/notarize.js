const { notarize } = require('electron-notarize');
const path = require('path');

const appBundleId = 'com.anghami.anghami';
const appPath = path.join(__dirname, '..', '..', 'release', 'macOS', 'Anghami-darwin-x64', 'Anghami.zip');
const appleId = 'pierre_raii_1997@hotmail.com';
const appleIdPassword = `@keychain:AC_PASSWORD`;
const ascProvider = 'Anghami';

async function packageTask () {
  // Package your app here, and code side with hardened runtime
  console.log('Starting with App Notarization');
  await notarize({
    appBundleId,
    appPath,
    appleId,
    appleIdPassword,
    ascProvider
  });
  console.log('Notarized');
}

packageTask();