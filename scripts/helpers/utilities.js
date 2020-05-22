const isRenderer = require('is-electron-renderer'),
	app = isRenderer ? require('electron').remote.app : require('electron').app,
	os = require('os'),
	dns = require('dns'),
	appVersion = require('../../package.json').version
let utilities = {};
(utilities.appVersion = appVersion),
(utilities.SOURCE_URL = 'https://play.anghami.com'),
(utilities.APP_SOURCE_URL = `${utilities.SOURCE_URL}/home`),
(utilities.APP_MACOS_UPDATE_PATH =
    'https://api.anghami.com/anghmob/desktop_client_update.php'),
(utilities.APP_WINDOWS_UPDATE_URL = 'https://desktop.anghami.com/win64'),
(utilities.isFirstRun = () => '--squirrel-firstrun' == process.argv[1]),
(utilities.is64BitArch = () =>
	'x64' === process.arch ||
    // eslint-disable-next-line no-prototype-builtins
    process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432')),
(utilities.is32BitArch = () => 'ia32' === process.arch),
(utilities.isMac = () => 'darwin' === process.platform),
(utilities.isWindows = () => 'win32' === process.platform),
(utilities.isLinux = () => 'linux' === process.platform),
(utilities.isWindows64Bit = () =>
	utilities.isWindows() && utilities.is64BitArch()),
(utilities.isWindows32Bit = () =>
	utilities.isWindows() && utilities.is32BitArch()),
(utilities.getComputerName = () => os.hostname()),
(utilities.getAutoUpdateUrl = () =>
	utilities.isMac()
		? `${utilities.APP_MACOS_UPDATE_PATH}?v=${utilities.appVersion}`
		: utilities.isWindows()
			? `${utilities.APP_WINDOWS_UPDATE_URL}`
			: null),
(utilities.isDevEnviroment = () => !app.isPackaged),
(utilities.isConnectedToInternet = () =>
	new Promise(function (i) {
		setTimeout(() => {
			i(!1)
		}, 6e3),
		dns.resolve('www.google.com', function (e) {
			i(!e)
		})
	})),
(utilities.getKernelVersion = () => os.release()),
(module.exports = utilities)
