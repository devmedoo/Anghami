const electron = require("electron"),
  { remote: remote, ipcRenderer: ipcRenderer, webFrame: webFrame } = electron,
  { app: app, Menu: Menu } = remote,
  fs = require("fs"),
  path = require("path"),
  os = require("os"),
  storage = require("electron-json-storage"),
  Datastore = require("nedb"),
  { Subject: Subject } = require("rxjs"),
  uploader = require("./helpers/uploader"),
  log = require("electron-log"),
  utilities = require("./helpers/utilities"),
  inputMenuTemplate = require("./helpers/input-menu"),
  downloadActions = require("./enums/download-actions"),
  matchMusicActions = require("./enums/match-music-actions"),
  trayActions = require("./enums/tray-actions"),
  rendererActions = require("./enums/renderer-actions"),
  DownloadManager = require("./_helpers/downloadHelper"),
  NavigationManager = require("./_helpers/navigationHelper"),
  MatchMusicManager = require("./_helpers/matchMusicHelper"),
  GlobalShortcutsManager = require("./_helpers/globalSortcutsHelper"),
  downloadManager = new DownloadManager(),
  navigationManager = new NavigationManager(),
  matchMusicManager = new MatchMusicManager(),
  computerName = utilities.getComputerName(),
  user_db_dir = path.join(app.getPath("userData"), "angh_db"),
  temporaryDirectory = path.join(app.getPath("temp"), ".angh"),
  isWindows = utilities.isWindows(),
  mainWindow = remote.getCurrentWindow(),
  kernelVersion = os.release(),
  LOG_KEY = "N9UX20LXFhxp0k7shWWjD0GDfKrQL0c";
const DiscordRPC = require("discord-rpc");
const { url } = require("inspector");
const clientId = "479068383413927950";
const rpc = new DiscordRPC.Client({ transport: "ipc" });
rpc.login({ clientId }).catch(console.log);

configureLogger(),
  "serviceWorker" in navigator &&
    navigator.serviceWorker.getRegistrations().then((e) => {
      e.forEach((e) => {
        e.active.scriptURL.indexOf("service-worker.js") >= 0 &&
          (e.unregister(),
          log.info("[Main renderer] Unregistering old SW"),
          setTimeout(() => {
            log.info("[Main renderer] Reloading post unregister"),
              window.location.reload();
          }, 100));
      });
    }),
  fs.existsSync(user_db_dir) || fs.mkdirSync(user_db_dir);
const DB = {};
(global.DB = DB),
  (DB.downloads = new Datastore({
    filename: path.join(app.getPath("userData"), "angh_db", "downloads"),
    autoload: !0,
  })),
  (DB.download_queue = new Datastore({
    filename: path.join(app.getPath("userData"), "angh_db", "download_queue"),
    autoload: !0,
  })),
  (DB.preferences = new Datastore({
    filename: path.join(app.getPath("userData"), "angh_db", "preferences"),
    autoload: !0,
  })),
  (DB.register_action_queue = new Datastore({
    filename: path.join(
      app.getPath("userData"),
      "angh_db",
      "register_action_queue"
    ),
    autoload: !0,
  })),
  DB.downloads.ensureIndex(
    { fieldName: "id", unique: !0, dropDups: !0 },
    (e) => {}
  );
let _desktopSource = new Subject(),
  desktopRelay = _desktopSource.asObservable();
function handleIncomingWebMessage(e) {
  switch (e.action) {
    case downloadActions.DOWNLOAD_SONG:
      downloadManager.downloadSong(e.payload.getDownloadObject);
      break;
    case downloadActions.SET_KEY:
      e.payload &&
        e.payload.key &&
        ((global.decKey = e.payload.key),
        storage.set("key", e.payload, (e) => {
          e && console.log("err: ", e);
        }));
      break;
    case downloadActions.DECRYPT_SONG:
      downloadManager.decryptSong(e.payload.song);
      break;
    case downloadActions.REMOVE_SONG:
      downloadManager.removeSongFromDownloads(e.payload.song);
      break;
    case downloadActions.REMOVE_ALL:
      downloadManager.removeAllDownloads();
      break;
    case downloadActions.REMOVE_DECRYPTED_SONGS:
      downloadManager.removeDecryptedSongsExcept(e.payload.song);
      break;
    case downloadActions.UPDATE_QUEUE:
      downloadManager.saveNewDownloadQueue(e.payload.queue);
      break;
    case downloadActions.ABORT:
      downloadManager.abortCurrentDownloadOperation();
      break;
    case downloadActions.PAUSE:
      downloadManager.pauseCurrentDownloadOperation();
      break;
    case downloadActions.RESUME:
      downloadManager.resumeCurrentDownloadOperation();
      break;
    case downloadActions.SET_AUTO_DOWNLOADS_VALUE:
      downloadManager.setAutoDownloadsValue(e.payload.enabled);
      break;
    case matchMusicActions.OPEN_DIALOG:
      matchMusicManager.openDialog();
      break;
    case matchMusicActions.NEW_BATCH:
      matchMusicManager.startNewBatch(e.payload);
      break;
    case matchMusicActions.UPLOAD_SONG:
      matchMusicManager.uploadSong(e.payload.song);
      break;
    case matchMusicActions.BATCH_DONE:
      matchMusicManager.removeCurrentBatch();
      break;
    case matchMusicActions.MATCH_CANCEL:
      matchMusicManager.abortCurrentOperation();
      break;
    case trayActions.TRAY_THEME_INFO:
      ipcRenderer.send("tray-message", {
        action: "theme-info",
        payload: e.payload,
      });
      break;
    case trayActions.TRAY_LANGUAGE:
      ipcRenderer.send("tray-message", {
        action: "language",
        payload: e.payload,
      });
      break;
    case trayActions.TRAY_CURRENT_OPTIONS:
      ipcRenderer.send("tray-message", {
        action: "current-options",
        payload: e.payload,
      }),
        e.payload.currentOptions &&
          (ipcRenderer.send(
            "updateThumbarIcons",
            e.payload.currentOptions.playing
          ),
          e.payload.currentOptions.playing && e.payload.currentOptions.isSod
            ? ipcRenderer.send("power-monitor-state", { active: !0 })
            : ipcRenderer.send("power-monitor-state", { active: !1 }));
      break;
    case trayActions.TRAY_CURRENT_TRACK:
      console.log(e);
      rpc.setActivity({
        details: `Playing ${e.payload.currentTrack.title}`,
        state: `By ${e.payload.currentTrack.artist}`,
        largeImageKey: e.payload.currentTrack.coverArtImage,
        instance: false,
      });
      ipcRenderer.send("tray-message", {
        action: "current-track",
        payload: e.payload,
      });
      break;
    case trayActions.TRAY_CURRENT_QUEUE:
      ipcRenderer.send("tray-message", {
        action: "current-queue",
        payload: e.payload,
      });
      break;
    case trayActions.TRAY_CURRENT_PROGRESS:
      ipcRenderer.send("tray-message", {
        action: "current-progress",
        payload: e.payload,
      });
      break;
    case rendererActions.RENDERER_DEVTOOLS_OPEN:
      ipcRenderer.send("devtools-open");
      break;
    case rendererActions.RENDERER_SHOW_ACCESSIBILITY_PROMPT:
      ipcRenderer.send("prompt-for-accessibility-permission");
      break;
    case rendererActions.RENDERER_CHECK_FOR_UPDATE:
      ipcRenderer.send("check-for-updates");
      break;
    case rendererActions.RENDERER_SWITCH_TO_ONLINE_MODE:
      ipcRenderer.send("switch-to-online-mode", e.payload);
      break;
    case rendererActions.RENDERER_MINIPLAYER_SWITCH:
      ipcRenderer.send("miniplayerSwitch", e.payload);
      break;
    case rendererActions.RENDERER_UPDATE_TOUCHBAR_SLIDER:
      ipcRenderer.send("updateTouchBarSlider", e.payload.progress);
      break;
    case "upload-cancel":
      uploader.cancelUpload();
      break;
    case "user-auth":
      downloadManager.checkAndHandleNewUserData(e.payload);
      break;
    case "navigate":
      navigationManager.handleNavigationAction(e);
      break;
    case "show-notification":
      checkFocusAndShowNotification(e.payload.notification);
      break;
    case "upload-log-file":
      prepareAndUploadLogs();
      break;
    case "user-logged-out":
      downloadManager.handleUserLogout();
      break;
    case "set-media-service-metadata":
      break;
    case "log-line":
      trimAndlogInfoLine(`[Web Player] ${e.payload.line}`);
      break;
    case "offline-register-action":
      DB.register_action_queue.insert(e.payload.record),
        log.info(
          `[Main renderer] Insert song: ${e.payload.record.songid} to register_action_queue collection`
        );
      break;
    case "offline-register-action-clean":
      DB.register_action_queue.remove({}, { multi: !0 }, (e, a) => {
        log.info(
          `[Main renderer] Cleaned register_action_queue collection - Number affected: ${a} - err: ${e}`
        );
      });
  }
}
function emitMessageToWebPlayer(e, a) {
  _desktopSource.next({ action: e, payload: a });
}
function retreiveRegisterActionRecordsAndEmit() {
  DB.register_action_queue.find({}, (e, a) => {
    !e &&
      a.length > 0 &&
      this.emitMessageToWebPlayer("register-action-resume", { documents: a });
  });
}
async function prepareAndUploadLogs() {
  const e = require("archiver");
  e.registerFormat("zip-encryptable", require("archiver-zip-encryptable"));
  let a = await getUserAuth();
  const o = path.dirname(log.transports.file.getFile().path),
    r = `${temporaryDirectory}/log_concat.zip`,
    n = fs.createWriteStream(r),
    t = e("zip-encryptable", { zlib: { level: 9 }, password: LOG_KEY });
  n.on("close", function () {
    log.info("[Logger module] Start with uploading zipped log folder");
    const e = a.user.anid ? a.user.anid + "-logs-c" : "logs-c";
    uploader.uploadFile(e, r, "anghami.androidlogs", function (e, a) {
      emitMessageToWebPlayer("log-file-uploaded", {
        uploadedFileUrl: e,
        uploadedFileUrl1: a,
      }),
        fs.rmdir(r, () => {
          log.info(
            "[Logger module] Temporary encrypted and zipped log folder unlinked"
          );
        });
    });
  }),
    n.on("end", function () {
      console.log("Data has been drained");
    }),
    t.on("warning", function (e) {
      if ("ENOENT" !== e.code) throw e;
    }),
    t.on("error", function (e) {
      throw e;
    }),
    t.directory(o, !1),
    t.pipe(n),
    t.finalize();
}
function checkFocusAndShowNotification(e) {
  if (null == remote.BrowserWindow.getFocusedWindow()) {
    let a = { body: e.message, silent: !0 };
    e.coverArt && (a.icon = e.coverArt);
    let o = new Notification(e.title, a);
    e.notificationDuration &&
      setTimeout(o.close.bind(o), e.notificationDuration),
      (o.onclick = function (e) {
        e.preventDefault(),
          mainWindow.isMinimized() && mainWindow.restore(),
          mainWindow.focus();
      });
  }
}
function getUserAuth() {
  return new Promise(function (e, a) {
    storage.get("user", (a, o) => {
      e(a ? {} : o);
    });
  });
}
function configureLogger() {
  (log.transports.file.appName = "Anghami"),
    (log.transports.file.level = "info"),
    (log.transports.file.maxSize = 4194304),
    (log.transports.console.level = !1);
}
(global._desktopSource = _desktopSource),
  (window.desktopClient = {
    appVersion: require("../package.json").version,
    offlineMode: !1,
    platform: {
      name: isWindows ? "Windows" : "Mac",
      osReleaseVersion: kernelVersion,
      computerName: computerName,
    },
    sharedObservables: { desktopRelay: desktopRelay, webRelay: {} },
    paths: { userTemporaryPath: path.join(app.getPath("temp"), ".angh") },
  }),
  (window.onload = () => {
    downloadManager.runDownloadsMigrationLogic(),
      setTimeout(() => {
        downloadManager.sendDownloadsListToWebPlayer();
      }, 2e3),
      setTimeout(() => {
        window.desktopClient.sharedObservables.webRelay.subscribe((e) => {
          handleIncomingWebMessage(e);
        });
      }, 3e3),
      setTimeout(() => {
        downloadManager.checkForExistingQueueAndEmit();
      }, 3e3),
      setTimeout(() => {
        downloadManager.checkForAutoDownloadsAndEmit(),
          retreiveRegisterActionRecordsAndEmit();
      }, 5e3);
  }),
  ipcRenderer.on("main-to-web", (e, a) => {
    emitMessageToWebPlayer(a.name, a.args);
  }),
  ipcRenderer.on("app-will-quit", (e, a) => {
    downloadManager.removeDecryptedSongsExcept();
  }),
  ipcRenderer.on("offline-mode-setup", (e, a) => {
    setTimeout(() => {
      storage.get("user", (e, a) => {
        a && a.user
          ? ((window.desktopClient.offlineMode = !0),
            emitMessageToWebPlayer("desktop-saved-user", { user: a.user }))
          : emitMessageToWebPlayer("desktop-saved-user", { error: !0 });
      });
    }, 3e3);
  }),
  (global.emitMessageToWebPlayer = emitMessageToWebPlayer),
  setInterval(() => {
    webFrame.clearCache(), log.info("WebFrame cache cleared from interval");
  }, 3e5),
  (window.desktopClient.updateTouchBarProgress = (e) => {
    ipcRenderer.send("updateTouchBarSlider", e);
  });
const _setImmediate = setImmediate,
  _clearImmediate = clearImmediate;
process.once("loaded", () => {
  (global.setImmediate = _setImmediate),
    (global.clearImmediate = _clearImmediate);
});
const InputMenu = Menu.buildFromTemplate(inputMenuTemplate);
function trimAndlogInfoLine(e) {
  getLengthInKB(e) > 20 && (e = e.substring(0, 1e3) + "... [Truncated]"),
    log.info(e);
}
function getLengthInKB(e) {
  return Buffer.byteLength(e, "utf8") / 1e3;
}
window.document.addEventListener("contextmenu", (e) => {
  e.preventDefault(), e.stopPropagation();
  let a = e.target;
  for (; a; ) {
    if (a.nodeName.match(/^(input|textarea)$/i)) {
      InputMenu.popup(mainWindow);
      break;
    }
    a = a.parentNode;
  }
});
