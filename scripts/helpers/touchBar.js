const {
		app: app,
		BrowserWindow: BrowserWindow,
		TouchBar: TouchBar,
		nativeImage: nativeImage,
		ipcMain: ipcMain,
	} = require('electron'),
	{
		TouchBarLabel: TouchBarLabel,
		TouchBarButton: TouchBarButton,
		TouchBarSpacer: TouchBarSpacer,
		TouchBarSlider: TouchBarSlider,
		TouchBarGroup: TouchBarGroup,
		TouchBarSegmentedControl: TouchBarSegmentedControl,
		TouchBarScrubber: TouchBarScrubber,
	} = TouchBar,
	path = require('path'),
	iconsPath = path.join(__dirname, '..', '..', 'assets', 'icons')
let anghamiIconNativeImage = nativeImage.createFromPath(
		path.join(iconsPath, 'trayIconTemplate.png')
	),
	playIconNativeImage = nativeImage.createFromPath(
		path.join(iconsPath, 'touchbar', 'TB_playpauseTemplate.png')
	),
	forwardIconNativeImage = nativeImage.createFromPath(
		path.join(iconsPath, 'touchbar', 'TB_fastforwardTemplate.png')
	),
	rewindIconNativeImage = nativeImage.createFromPath(
		path.join(iconsPath, 'touchbar', 'TB_rewindTemplate.png')
	),
	skipBackIconNativeImage = nativeImage.createFromPath(
		path.join(iconsPath, 'touchbar', 'TB_skipbackTemplate.png')
	),
	skipAheadIconNativeImage = nativeImage.createFromPath(
		path.join(iconsPath, 'touchbar', 'TB_skipaheadTemplate.png')
	)
const anghamiIcon = new TouchBarButton({
		icon: anghamiIconNativeImage,
		backgroundColor: '#8d00f2',
		click: () => {},
	}),
	slider = new TouchBarSlider({
		value: 0,
		minValue: 0,
		maxValue: 100,
		change: (e) => {
			emitSeekEvent(e)
		},
	}),
	rewindBtn = new TouchBarButton({
		icon: rewindIconNativeImage,
		click: emitPreviousEvent,
	}),
	playPauseBtn = new TouchBarButton({
		icon: playIconNativeImage,
		click: emitPlayEvent,
	}),
	forwardBtn = new TouchBarButton({
		icon: forwardIconNativeImage,
		click: emitNextEvent,
	}),
	spacer = new TouchBarSpacer({ size: 'flexible' }),
	touchBar = new TouchBar({
		items: [anghamiIcon, spacer, rewindBtn, playPauseBtn, forwardBtn],
	})
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
function emitMessageToWebPlayer(e, a = {}) {
	global.emitMessageToWebPlayer(e, a)
}
ipcMain.on('updateTouchBarSlider', function (e, a) {
	slider.value = Math.floor(a)
}),
(module.exports = touchBar)
