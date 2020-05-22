const {
		globalShortcut: globalShortcut,
		systemPreferences: systemPreferences,
	} = require('electron'),
	os = require('os'),
	compareVersions = require('compare-versions'),
	utilities = require('../helpers/utilities'),
	logger = require('../helpers/logger')
let isDev = utilities.isDevEnviroment()
var Player = require('mpris-service')
class GlobalShortcutsManager {
	constructor() {
	}
	initializeLinuxShortcuts(){
		var player = Player({
			name: 'anghami',
			identity: 'Anghami streaming application',
			supportedUriSchemes: [],
			supportedMimeTypes: [],
			supportedInterfaces: ['player']
		})

		// Events
		var events = ['next', 'previous', 'pause', 'playpause', 'stop', 'play']
		var gS = this
		events.forEach(function (eventName) {
			player.on(eventName, function () {
				switch (eventName) {
				case 'next': {
					gS.emitMessageToWebPlayer('shortcuts-player-action', {
						action: 'next',
					})
					break
				}
				case 'previous': {
					gS.emitMessageToWebPlayer('shortcuts-player-action', {
						action: 'previous',
					})
					break
				}
				case 'play':
				case 'pause':
				case 'playpause': {
					gS.emitMessageToWebPlayer('shortcuts-player-action', {
						action: 'playpause',
					})
					break
				}
				case 'stop': {
					gS.emitMessageToWebPlayer('shortcuts-player-action', {
						action: 'stop',
					})
					break
				}
				}
			})
		})
		
	}
	initializeShortcuts(e) {
		if(utilities.isLinux()) {
			this.initializeLinuxShortcuts()
		}
		const t = require('electron-settings')
		let s = os.release(),
			r = utilities.isMac() && compareVersions(s, '18.0.0') >= 0
		if (utilities.isMac() && r && e) {
			systemPreferences.isTrustedAccessibilityClient(!1) ||
        t.has('TrustedAccessibilityClientPrompted') ||
        isDev ||
        (systemPreferences.isTrustedAccessibilityClient(!0),
        t.set('TrustedAccessibilityClientPrompted', Date.now()))
			const e = !systemPreferences.isTrustedAccessibilityClient(!1)
			setTimeout(() => {
				this.emitMessageToWebPlayer('trusted-accessibility-client-state', {
					shouldShow: e,
				})
			}, 2e3)
		}
		const i = globalShortcut.register('MediaPlayPause', () => {
				this.emitMessageToWebPlayer('shortcuts-player-action', {
					action: 'playpause',
				}),
				logger.logEvent('[Global Shortcuts] MediaPlayPause clicked')
			}),
			l = globalShortcut.register('MediaStop', () => {
				this.emitMessageToWebPlayer('shortcuts-player-action', {
					action: 'stop',
				}),
				logger.logEvent('[Global Shortcuts] MediaStop clicked')
			}),
			o = globalShortcut.register('MediaNextTrack', () => {
				this.emitMessageToWebPlayer('shortcuts-player-action', {
					action: 'next',
				}),
				logger.logEvent('[Global Shortcuts] MediaNextTrack clicked')
			}),
			a = globalShortcut.register('MediaPreviousTrack', () => {
				this.emitMessageToWebPlayer('shortcuts-player-action', {
					action: 'previous',
				}),
				logger.logEvent('[Global Shortcuts] MediaPreviousTrack clicked')
			})
		e &&
      (logger.logEvent('[Global Shortcuts] MediaPlayPause regsitered: ' + i),
      logger.logEvent('[Global Shortcuts] MediaStop regsitered: ' + l),
      logger.logEvent('[Global Shortcuts] MediaNextTrack regsitered: ' + o),
      logger.logEvent('[Global Shortcuts] MediaPreviousTrack regsitered: ' + a)
      )
	}
	setMediaServiceMetadata(e) {
		this.mediaService.setMetaData({
			id: e.id,
			title: e.title,
			artist: e.artist,
			duration: e.duration,
			album: e.album,
		})
	}
	unregisterAll() {
		globalShortcut.unregisterAll(),
		logger.logEvent('[Global Shortcuts] Unregistered global shortcuts')
	}
	emitMessageToWebPlayer(e, t) {
		global.emitMessageToWebPlayer(e, t)
	}
}
module.exports = GlobalShortcutsManager
