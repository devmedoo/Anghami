const electron = require('electron'),
	app = electron.app,
	Menu = electron.Menu,
	MenuItem = electron.MenuItem,
	autoUpdater = electron.autoUpdater,
	utilities = require('./utilities'),
	logger = require('../helpers/logger')
let sourceUrl = utilities.APP_SOURCE_URL,
	isMac = utilities.isMac(),
	isWindows = utilities.isWindows(),
	autoUpdateFeedURL = utilities.getAutoUpdateUrl(),
	initMenu = () => {
		const e = [
			{
				label: 'Edit',
				submenu: [
					{ role: 'undo' },
					{ role: 'redo' },
					{ type: 'separator' },
					{ role: 'cut' },
					{ role: 'copy' },
					{ role: 'paste' },
					{ role: 'pasteandmatchstyle' },
					{ role: 'delete' },
					{ role: 'selectall' },
				],
			},
			{
				label: 'View',
				submenu: [
					{
						label: 'Reload',
						accelerator: 'CmdOrCtrl+R',
						click(e, t) {
							t && t.reload()
						},
					},
					{ role: 'togglefullscreen' },
				],
			},
			{ role: 'window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
			{
				role: 'help',
				submenu: isWindows
					? [
						{ type: 'normal', label: 'Version ' + app.getVersion() },
						{
							type: 'normal',
							label: 'Check for updates...',
							enabled: !0,
							click: l,
						},
					]
					: [],
			},
		]
		if (isMac) {
			const t = 'Anghami'
			e.unshift({
				label: t,
				submenu: [
					{ role: 'about' },
					{
						type: 'normal',
						label: 'Check for updates...',
						enabled: !0,
						click: l,
					},
					{ type: 'separator' },
					{ role: 'services', submenu: [] },
					{ type: 'separator' },
					{ role: 'hide' },
					{ role: 'hideothers' },
					{ role: 'unhide' },
					{ type: 'separator' },
					{ role: 'quit' },
				],
			}),
			(e[3].submenu = [
				{ label: 'Close', accelerator: 'CmdOrCtrl+W', role: 'close' },
				{ label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
				{ label: 'Zoom', role: 'zoom' },
				{ type: 'separator' },
				{ label: 'Bring All to Front', role: 'front' },
			])
			const a = Menu.buildFromTemplate([
				{
					label: 'Play/Pause',
					type: 'normal',
					click: emitPlayEvent,
					enabled: !0,
				},
				{ label: 'Next', type: 'normal', click: emitNextEvent, enabled: !0 },
				{
					label: 'Previous',
					type: 'normal',
					click: emitPreviousEvent,
					enabled: !0,
				},
			])
			app.dock.setMenu(a)
		}
		let t = Menu.buildFromTemplate(e)
		function l() {
			let e
			isWindows
				? t.items.forEach(function (t, l) {
					'help' == t.role && (e = t.submenu.items[0])
				})
				: (e = t.items[0].submenu.items[1]),
			(e.enabled = !1),
			autoUpdater.setFeedURL(autoUpdateFeedURL),
			autoUpdater.on('update-available', () => {
				emitMessageToWebPlayer('desktop_update_available'),
				logger.logEvent('[Menu] Update available')
			}),
			autoUpdater.on('update-not-available', () => {
				(e.enabled = !0),
				emitMessageToWebPlayer('desktop_update_not_available'),
				logger.logEvent('[Menu] Update not available')
			}),
			autoUpdater.on('error', (t) => {
				e.enabled = !0
			}),
			autoUpdater.checkForUpdates()
		}
		Menu.setApplicationMenu(t)
	}
function emitPlayEvent() {
	emitMessageToWebPlayer('shortcuts-player-action', { action: 'playpause' })
}
function emitNextEvent() {
	emitMessageToWebPlayer('shortcuts-player-action', { action: 'next' })
}
function emitPreviousEvent() {
	emitMessageToWebPlayer('shortcuts-player-action', { action: 'previous' })
}
function emitRepeatEvent() {
	emitMessageToWebPlayer('shortcuts-player-action', { action: 'repeat' })
}
function emitShuffleEvent() {
	emitMessageToWebPlayer('shortcuts-player-action', { action: 'shuffle' })
}
function emitSeekEvent(e) {
	emitMessageToWebPlayer('shortcuts-player-action', {
		action: 'seek',
		percentage: e,
	})
}
function emitMessageToWebPlayer(e, t = {}) {
	global.emitMessageToWebPlayer(e, t)
}
module.exports = initMenu
