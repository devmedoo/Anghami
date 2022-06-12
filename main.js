"use strict";
const {
  app,
  BrowserWindow,
  autoUpdater,
  shell,
  ipcMain,
  dialog,
  systemPreferences,
  powerSaveBlocker,
} = require("electron");
require("electron-squirrel-startup") && app.quit();
const fs = require("fs");
const os = require("os");
const rimraf = require("rimraf");
const path = require("path");
const { fork } = require("child_process");
const detect = require("detect-port");
const isOnline = require("is-online");
const DecompressZip = require("decompress-zip");
const initMenu = require("./scripts/helpers/menu");
const initTray = require("./scripts/helpers/tray");
const log = require("electron-log");
const touchBar = require("./scripts/helpers/touchBar");
const initThumbar = require("./scripts/helpers/thumbar");
const utilities = require("./scripts/helpers/utilities");
const GlobalShortcutsManager = require("./scripts/_helpers/globalSortcutsHelper");
const appVersion = require("./package.json").version;
let splash;
let mainWindow;
let trayWindow;
let deeplinkingUrl;
let powerSaveBlockerId;
let canShowMainWindow = !1;
let quitForUpdate = !1;
let realQuit = !1;
let shouldHandleDeeplink = !1;
let deeplinkToHandle = "";
let serverProcess = null;
let offlineMode = !1;
let offlineServerPort = 24e3;
const isMac = utilities.isMac();
const firstRun = utilities.isFirstRun();
const isWindows = utilities.isWindows();
const isDev = utilities.isDevEnviroment();
const is64BitArch = utilities.is64BitArch();
const computerName = utilities.getComputerName();
const sourceUrl = utilities.APP_SOURCE_URL;
const autoUpdateFeedURL = utilities.getAutoUpdateUrl();
const globalShortcutsManager = new GlobalShortcutsManager();
const SHOW_MAIN_WINDOW_DEBOUNCE_VALUE = 2e3;
const AUTO_UPDATER_INITIAL_CHECK_DEBOUNCE_VALUE = 13e3;
const AUTO_UPDATER_INTERVAL_CHECK_DEBOUNCE_VALUE = 12e5;
const SERVER_PROCESS_TERMINATION_TIMEOUT = 2e4;

const DiscordRPC = require("discord-rpc");
const ClientId = "479068383413927950";
const rpc = new DiscordRPC.Client({ transport: "ipc" });

app.setAsDefaultProtocolClient("anghami"), (app.allowRendererProcessReuse = !0);
const instanceLock = app.requestSingleInstanceLock();
function secondInstanceCallback(e, n, o) {
  mainWindow &&
    (isWindows
      ? (deeplinkingUrl = filterForAnghamiDeeplink(n)) &&
        handleDeeplink(deeplinkingUrl)
      : loadAppURL(),
    mainWindow.isMinimized() && mainWindow.restore(),
    mainWindow.focus());
}
function initApp() {
  configureLogger(),
    setUpWindows(),
    setUpMainWindowListeners(),
    loadAppURL(),
    initMenu(),
    initPowerMonitor(),
    isMac &&
      (app.on("before-quit", () => {
        realQuit = !0;
      }),
      mainWindow.on("close", (e) => {
        realQuit ||
          quitForUpdate ||
          (e.preventDefault(),
          mainWindow.isFullScreen() &&
            (mainWindow.setFullScreen(!1),
            setTimeout(() => {
              mainWindow.hide();
            }, 1e3)),
          mainWindow.hide());
      }));
}
function setUpWindows() {
  (splash = new BrowserWindow({
    title: "Anghami",
    icon: isWindows
      ? `${__dirname}/assets/icons/IconAnghami.ico`
      : `${__dirname}/assets/icons/IconAnghami.png`,
    width: 700,
    height: 400,
    resizable: !1,
    transparent: !0,
    show: !1,
    frame: !1,
    webPreferences: {
      backgroundThrottling: !1,
      webSecurity: !0,
      nodeIntegration: !1,
      allowRunningInsecureContent: !1,
      preload: `${__dirname}/scripts/splash_renderer.js`,
    },
  })).loadURL(`file://${__dirname}/assets/views/splash/splash.html`),
    splash.setMenuBarVisibility(!1),
    splash.setMenu(null),
    splash.once("ready-to-show", () => {
      splash.showInactive();
    }),
    (mainWindow = new BrowserWindow({
      title: "Anghami",
      titleBarStyle: isMac ? "hiddenInset" : "default",
      frame: !isMac,
      icon: isWindows
        ? `${__dirname}/assets/icons/IconAnghami.ico`
        : `${__dirname}/assets/icons/IconAnghami.png`,
      width: 1250,
      height: 800,
      minWidth: 510,
      minHeight: 325,
      show: !1,
      transparent: !1,
      autoHideMenuBar: !0,
      webPreferences: {
        backgroundThrottling: !0,
        devTools: 1,
        webSecurity: !1,
        nodeIntegration: !1,
        allowRunningInsecureContent: !1,
        allowDisplayingInsecureContent: !1,
        preload: `${__dirname}/scripts/main_renderer.js`,
        offscreen: !1,
      },
    })).webContents.session.cookies.set(
      cookieFactory("bypassDesktopCheck", "true"),
      (e) => {}
    ),
    mainWindow.webContents.session.cookies.set(
      cookieFactory("desktopClientVersion", appVersion),
      (e) => {}
    ),
    mainWindow.webContents.session.cookies.set(
      cookieFactory("computerName", computerName),
      (e) => {}
    ),
    mainWindow.webContents.session.cookies.set(
      cookieFactory("desktop", "electron"),
      (e) => {}
    ),
    (mainWindow.webContents.userAgent =
      mainWindow.webContents.userAgent + ` anghami/${appVersion}`),
    isMac && mainWindow.setTouchBar(touchBar),
    (trayWindow = new BrowserWindow({
      width: 350,
      height: 500,
      resizable: !1,
      transparent: !0,
      show: !1,
      frame: !1,
      skipTaskbar: !0,
      maximizable: !1,
      fullscreenable: !1,
      closable: !0,
      icon: isWindows
        ? `${__dirname}/assets/icons/IconAnghami.ico`
        : `${__dirname}/assets/icons/IconAnghami.png`,
      hasShadow: !1,
      webPreferences: {
        devTools: !0,
        backgroundThrottling: !0,
        webSecurity: !0,
        nodeIntegration: !1,
        allowRunningInsecureContent: !1,
        preload: `${__dirname}/scripts/tray_renderer.js`,
      },
    })).loadURL(`file://${__dirname}/assets/views/tray/tray.html`),
    trayWindow.setMenuBarVisibility(!1),
    trayWindow.setMenu(null);
}
function setUpMainWindowListeners() {
  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      (canShowMainWindow = !0),
        splash.isFocused() ? mainWindow.show() : mainWindow.showInactive(),
        splash.destroy(),
        initThumbar(mainWindow),
        initTray(trayWindow, mainWindow),
        setUpTrayListeners(),
        isDev || setupAutoUpdate();
    }, SHOW_MAIN_WINDOW_DEBOUNCE_VALUE),
      setTimeout(() => {
        shouldHandleDeeplink &&
          (log.info("shouldHandleDeeplink " + shouldHandleDeeplink),
          log.info("deeplinkToHandle " + deeplinkToHandle),
          handleDeeplink(deeplinkToHandle));
      }, 1200),
      setTimeout(() => {
        globalShortcutsManager.initializeShortcuts(!0);
      }, 2 * SHOW_MAIN_WINDOW_DEBOUNCE_VALUE);
  }),
    mainWindow.webContents.on("new-window", (e, n) => {
      e.preventDefault(),
        log.info(`New window event triggered: ${n}`),
        shell.openExternal(n);
    }),
    mainWindow.webContents.on("did-fail-load", (e, n, o, i, r) => {
      if (
        (log.error(
          `[Main process] did-fail-load event triggered. errorCode: ${n} - errorDescription: ${o}\n    - validatedURL: ${i} - isMainFrame: ${r}`
        ),
        i.indexOf("anghami.com") > -1 && n == -2)
      ) {
        if (isWindows) {
          const e = path.join(app.getPath("userData"), "Service Worker");
          rimraf(e, (n) => {
            n
              ? logger.logEvent(
                  `[Main process] - did-fail-load - Error while cleaning directory: ${e} - Error: ${n}`
                )
              : (logger.logEvent(
                  `[Main process] - did-fail-load - Cleaned ${e} -- will relaunch app`
                ),
                relaunchApp());
          });
        }
      } else {
        i.indexOf("http://127.0.0.1") > -1 &&
          (log.info(
            "[Main process] did-fail-load in offline mode - calling checkForConnectivityAndLoadRelevantUrl"
          ),
          checkForConnectivityAndLoadRelevantUrl().then((e) => {}));
      }
    }),
    mainWindow.webContents.on("crashed", (e, n) => {
      log.error(
        `[Main process] Renderer process has crashed: ${JSON.stringify(
          e
        )} - Killed: ${n}`
      );
    }),
    mainWindow.on("unresponsive", (e) => {
      log.error(
        `[Main process] Webpage has become unresponsive: ${JSON.stringify(e)}`
      ),
        mainWindow.reload();
    }),
    mainWindow.on("closed", () => {
      (mainWindow = null), trayWindow && trayWindow.close(), app.quit();
    }),
    mainWindow.on("focus", () => {
      setTimeout(() => {
        globalShortcutsManager.initializeShortcuts();
      }, 5e3);
    }),
    mainWindow.on("restore", () => {
      setTimeout(() => {
        globalShortcutsManager.initializeShortcuts();
      }, 5e3);
    });
}
function setUpTrayListeners() {
  rpc.login(ClientId).catch(console.error);
  ipcMain.on("tray-message", (e, n) => {
    switch (n.action) {
      case "theme-info":
        trayWindow.webContents.send("tray-theme", n.payload);
        break;
      case "language":
        trayWindow.webContents.send("tray-language", n.payload);
        break;
      case "current-options":
        trayWindow.webContents.send("tray-current-options", n.payload);
        break;
      case "current-track":
        trayWindow.webContents.send("tray-current-track", n.payload);
        break;
      case "current-queue":
        trayWindow.webContents.send("tray-current-queue", n.payload);
        break;
      case "current-progress":
        trayWindow.webContents.send("tray-current-progress", n.payload);
        break;
      case "player-action":
        emitMessageToWebPlayer("shortcuts-player-action", {
          action: n.playeraction,
        });
        break;
      case "play-track":
        emitMessageToWebPlayer("tray-play-track-by-index", n.payload);
        break;
      case "seek":
        emitMessageToWebPlayer("shortcuts-player-action", {
          action: "seek",
          percentage: n.percentage,
        });
        break;
      case "like-track":
        emitMessageToWebPlayer("tray-like-track", n.payload);
        break;
      case "miniplayer-minimize":
        trayWindow.minimize();
        break;
      case "miniplayer-close":
        (global.isMiniPlayer = !1), trayWindow.hide(), mainWindow.show();
        break;
      default:
        console.log("Unsupported action: " + n.action);
    }
  }),
    trayWindow.on("closed", () => {
      (trayWindow = null), mainWindow && mainWindow.close();
    });
}
function initPowerMonitor() {
  const { powerMonitor: e } = require("electron");
  e.on("suspend", () => {
    log.info("[Main process] Power monitor: The system is going to sleep"),
      emitMessageToWebPlayer("power-monitor-status", { type: "suspend" });
  }),
    e.on("resume", () => {
      log.info("[Main process] Power monitor: The system has resumed"),
        emitMessageToWebPlayer("power-monitor-status", { type: "resume" });
    });
}
async function loadAppURL() {
  clearLocalAssets(),
    isWindows && (deeplinkingUrl = filterForAnghamiDeeplink(process.argv)),
    deeplinkingUrl &&
      typeof deeplinkingUrl === "string" &&
      deeplinkingUrl.indexOf("anghami://") != -1 &&
      ((shouldHandleDeeplink = !0),
      (deeplinkToHandle = deeplinkingUrl),
      log.info(`[Main process] deeplinkingUrl ${deeplinkingUrl}`)),
    await checkForConnectivityAndLoadRelevantUrl();
}
async function checkForConnectivityAndLoadRelevantUrl() {
  (await utilities.isConnectedToInternet())
    ? ((offlineMode = !1),
      log.info(`[Main process] Loading ${sourceUrl}`),
      mainWindow.loadURL(`${sourceUrl}`))
    : ((offlineMode = !0),
      log.info("[Main process] Not connected offline mode kicking in."),
      startServerAndLoad());
}
async function startServerAndLoad() {
  const e = path
    .join(__dirname, "assets")
    .replace("app.asar", "app.asar.unpacked");
  const n = path.join(e, "browser.zip");
  const o = path.join(e, "bin");
  fs.existsSync(`${e}/browser`) || (await unzip(n, e)),
    detect(offlineServerPort, (n, i) => {
      n && log.error(`[Server process] ERROR after detection ${n}`),
        offlineServerPort == i
          ? log.info(
              `[Server process] port: ${offlineServerPort} was not occupied`
            )
          : (log.warn(
              `[Server process] port: ${offlineServerPort} was occupied, switching to port: ${i}`
            ),
            (offlineServerPort = i)),
        (serverProcess = fork(
          `${o}/http-server/bin/http-server`,
          [`${e}/browser`, `-p ${offlineServerPort}`, "-c-1"],
          { silent: !0, detached: !1, env: { ELECTRON_RUN_AS_NODE: 1 } }
        )).stdout.on("data", (e) => {}),
        serverProcess.on("close", (e, n) => {
          log.warn(
            `[Server process] child process terminated due to receipt of signal ${n} and code ${e}`
          );
        }),
        serverProcess.stdout.once("data", (e) => {
          let n = `http://127.0.0.1:${offlineServerPort}/`;
          isWindows && (n = `${n}/index.html`),
            mainWindow.loadURL(n),
            log.info(
              `[Server process] Loading http://127.0.0.1:${offlineServerPort}`
            ),
            mainWindow.webContents.once("dom-ready", () => {
              log.info("[Server process] Mainwindow dom-ready event"),
                mainWindow.webContents.send("offline-mode-setup", {});
            }),
            setTimeout(() => {
              serverProcess.kill("SIGHUP"),
                log.info(
                  "[Server process] Server process killed after 20 seconds"
                );
            }, SERVER_PROCESS_TERMINATION_TIMEOUT);
        }),
        serverProcess.stderr.on("data", function (e) {
          log.error("[Server process] STDOUT: " + e);
        });
    });
}
function shouldQuitAndInstall() {
  (quitForUpdate = !0), autoUpdater.quitAndInstall();
}
function cookieFactory(e, n) {
  return {
    path: "/",
    name: e,
    value: n,
    url: `${sourceUrl}`,
    domain: ".anghami.com",
    expirationDate: Date.now() / 1e3 + 31556926,
  };
}
function checkIfAppIsInApplicationsFolderAndPrompt() {
  if (app.isInApplicationsFolder()) return;
  log.warn("[Main process] App is not in Applications folder");
  dialog.showMessageBox(
    {
      type: "info",
      buttons: ["Move", "Later"],
      title: "Move Anghami to Applications",
      message: "Anghami",
      detail:
        "It seems like the Anghami app is not in your Applications folder. Move now ?",
    },
    (e) => {
      e === 0
        ? (log.info(
            "[Main process] User accepted to move Anghami to Applications folder"
          ),
          app.moveToApplicationsFolder())
        : e === 1 &&
          log.info(
            "[Main process] User refused to move Anghami to Applications folder"
          );
    }
  );
}
function sendEventToMainWindowRenderer(e, n = {}) {
  mainWindow && mainWindow.webContents && mainWindow.webContents.send(e, n);
}
function emitMessageToWebPlayer(e, n) {
  sendEventToMainWindowRenderer("main-to-web", { name: e, args: n || {} });
}
function handleDeeplink(e) {
  const n = checkAndGetCleanDeeplinkURL(e);
  const o = {
    deeplink: e,
    cleanedDeeplink: n,
    deeplinkParameters: n.split("/"),
  };
  shouldHandleDeeplinkLocally(o.deeplinkParameters[0])
    ? handleDeeplinkLocally(o)
    : (emitMessageToWebPlayer("deeplink", o),
      mainWindow.focus(),
      log.info(
        `[Main process] Deeplink has been handed over to web: ${deeplinkingUrl}`
      ));
}
function checkAndGetCleanDeeplinkURL(e) {
  let n = e.replace("anghami://", "");
  return (
    (n.indexOf("redirectUrl") == -1 &&
      n.indexOf("file://") == -1 &&
      n.indexOf("http://") == -1 &&
      n.indexOf("https://") == -1) ||
      (n = ""),
    n
  );
}
function setupAutoUpdate() {
  log.info(
    `[Main process] Setting up auto updater: autoUpdateFeedURL: ${autoUpdateFeedURL}`
  );
  const e = { url: autoUpdateFeedURL };
  autoUpdater.setFeedURL(e),
    autoUpdater.on("update-available", () => {
      emitMessageToWebPlayer("desktop_update_available"),
        log.info("[Main process] Update available");
    }),
    autoUpdater.on("update-not-available", () => {
      emitMessageToWebPlayer("desktop_update_not_available"),
        log.info("[Main process] Update not available");
    }),
    autoUpdater.on("update-downloaded", () => {
      log.info("[Main process] Update downloaded - going to show dialog");
      const e = {
        type: "info",
        buttons: ["Restart", "Later"],
        title: "Anghami App Update",
        message: "Anghami",
        detail:
          "A new update has been downloaded. Do you want to restart and install now ?",
      };
      dialog.showMessageBox(e, (e) => {
        e === 0
          ? (log.info(
              "[Main process] [Update dialog] User pressed on restart now"
            ),
            shouldQuitAndInstall())
          : e === 1 &&
            log.info(
              "[Main process] [Update dialog] User pressed on restart later"
            );
      });
    }),
    autoUpdater.on("error", (e) => {
      log.error(`[Main process] Auto updater error: ${e}`);
    }),
    setTimeout(async () => {
      const e = await utilities.isConnectedToInternet();
      !firstRun &&
        e &&
        (autoUpdater.checkForUpdates(),
        log.info("[Main process] Check for updates after 13 seconds"));
    }, AUTO_UPDATER_INITIAL_CHECK_DEBOUNCE_VALUE),
    setInterval(async () => {
      const e = await utilities.isConnectedToInternet();
      !firstRun &&
        e &&
        (autoUpdater.checkForUpdates(),
        log.info("[Main process] Check for updates from interval"));
    }, AUTO_UPDATER_INTERVAL_CHECK_DEBOUNCE_VALUE);
}
function clearLocalAssets() {
  mainWindow.webContents.executeJavaScript(
    "\n    navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(registrationList => {\n        registrationList.forEach(reg=>{\n          if(reg.active.scriptURL.indexOf('service-worker.js') > -1){\n            reg.unregister();\n            setTimeout(()=>{\n              window.location.reload();\n            }, 100);\n          }\n        })\n      });\n  "
  );
  const e = path.join(app.getPath("userData"), "LocalAssets");
  fs.exists(e, (n) => {
    n &&
      (log.info("[Update local assets] Clearing local assets"),
      rimraf(e, function (e) {
        e
          ? log.error(
              "[Update local assets] Error when clearing local assets " +
                JSON.stringify(e)
            )
          : log.info("[Update local assets] Cleared local assets");
      }));
  });
}
function relaunchApp() {
  log.info("[Main process] relaunchApp triggered"), app.relaunch(), app.exit(0);
}
function shouldHandleDeeplinkLocally() {
  return !1;
}
function handleDeeplinkLocally(e) {
  log.info(`[Main process] Deeplink handled locally: ${deeplinkingUrl}`);
}
function logEverywhere(e) {
  console.log(e),
    mainWindow &&
      mainWindow.webContents &&
      mainWindow.webContents.executeJavaScript(`console.log("${e}")`);
}
function filterForAnghamiDeeplink(e) {
  for (var n = 0; n < e.length; n++) {
    if (e[n].indexOf("anghami://") > -1) return e[n];
  }
  return !1;
}
function unzip(e, n) {
  return new Promise((o, i) => {
    const r = new DecompressZip(e);
    r.extract({ path: n }),
      r.on("extract", function (i) {
        log.info(`[Main process] Unzip done: Source: ${e} - Dest: ${n}`), o(!0);
      }),
      r.on("error", function (e) {
        log.error(`[Main process] Unzip error: err: ${e}`), i(!0);
      });
  });
}
function configureLogger() {
  (log.transports.file.appName = "Anghami"),
    (log.transports.file.level = "info"),
    (log.transports.file.maxSize = 4194304),
    (log.transports.console.level = !1);
}
app.once("ready", () => {
  isMac && !isDev && checkIfAppIsInApplicationsFolderAndPrompt(),
    initApp(),
    log.info("[Main process] App ready"),
    log.info("[Main process] Version " + app.getVersion()),
    log.info("[Main process] OS " + (isMac ? "MacOS" : "Windows")),
    log.info("[Main process] OS release version " + os.release()),
    log.info("[Main process] 64-bit arch: " + is64BitArch);
  //   mainWindow.webContents.openDevTools();
}),
  app.on("open-url", function (e, n) {
    e.preventDefault(),
      (deeplinkingUrl = n),
      mainWindow && handleDeeplink(deeplinkingUrl);
  }),
  app.on("window-all-closed", () => {
    isMac || app.quit();
  }),
  app.on("activate", (e, n) => {
    mainWindow === null && initApp(),
      canShowMainWindow && !global.isMiniPlayer && mainWindow.show();
  }),
  app.on("will-quit", () => {
    sendEventToMainWindowRenderer("app-will-quit"),
      serverProcess &&
        (serverProcess.kill("SIGHUP"),
        log.info(
          `[Main process] Server process killed ${serverProcess.killed}`
        )),
      globalShortcutsManager.unregisterAll();
  }),
  instanceLock || app.quit(),
  app.on("second-instance", secondInstanceCallback),
  ipcMain.on("prompt-for-accessibility-permission", (e, n) => {
    systemPreferences.isTrustedAccessibilityClient(!0);
  }),
  ipcMain.on("check-for-updates", (e, n) => {
    autoUpdater.checkForUpdates();
  }),
  ipcMain.on("setLogPath", (e, n) => {}),
  ipcMain.on("devtools-open", (e, n) => {
    mainWindow.toggleDevTools();
  }),
  ipcMain.on("switch-to-online-mode", async (e, n) => {
    (await isOnline())
      ? (loadAppURL(),
        setTimeout(() => {
          emitMessageToWebPlayer("resume-from-offline", n);
        }, 4e3))
      : emitMessageToWebPlayer("desktop-notice", {
          title:
            "You are not connected to the internet, please try again later.",
        });
  }),
  ipcMain.on("power-monitor-state", (e, n) => {
    if (n.active) {
      if (
        powerSaveBlockerId &&
        powerSaveBlocker.isStarted(powerSaveBlockerId)
      ) {
        return;
      }
      (powerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension")),
        log.info(
          `[Main process] power-minitor-state: triggering prevent-app-suspension with id: ${powerSaveBlockerId}`
        );
    } else {
      if (typeof powerSaveBlockerId !== "number") return;
      powerSaveBlocker.stop(powerSaveBlockerId),
        log.info(
          `[Main process] power-minitor-state: stopping prevent-app-suspension with id: ${powerSaveBlockerId}`
        );
    }
  }),
  process.on("uncaughtException", function (e) {
    log.error(`[Main process] Uncaught Exception: ${e}`);
  }),
  process.on("exit", (e) => {
    log.info(`[Main process] About to exit with code: ${e}`);
  }),
  (global.emitMessageToWebPlayer = emitMessageToWebPlayer),
  (global.sendEventToMainWindowRenderer = sendEventToMainWindowRenderer);
