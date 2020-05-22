const electron = require("electron"),
  { remote: remote } = electron,
  { app: app, dialog: dialog } = remote,
  fs = require("fs"),
  path = require("path"),
  moveFile = require("mv"),
  crypto = require("crypto"),
  zlib = require("zlib"),
  storage = require("electron-json-storage"),
  rimraf = require("rimraf"),
  logger = require("../helpers/logger"),
  electronJsonStorageDirPath = path.join(app.getPath("userData"), "storage"),
  userDownloadsDirectory = path.join(app.getPath("userData"), "tempdir"),
  userTemporaryDirectory = path.join(app.getPath("temp"), ".angh"),
  userTemporaryDownloadsDirectory = path.join(userTemporaryDirectory, ".d1"),
  userTemporaryDecryptDirectory = path.join(userTemporaryDirectory, ".q1"),
  userOldDownloadsFilePath = path.join(
    app.getPath("userData"),
    "tempdir",
    "downloads.json"
  );
class DownloadManager {
  constructor() {
    (this.temporaryStorage = path.join(app.getPath("temp"), ".angh")),
      (this.hashAlgorithm = "aes-256-ctr"),
      (this.encKey = ""),
      this.currentDownloadRequest,
      (this.totalSize = 0),
      (this.percentage = 0),
      (this.cumulativeProgress = 0),
      (this.temporaryDownloadWriteStream = ""),
      (this.currentDownloadingSong = {}),
      (this.downloadRetry = { retries: 0 }),
      (this.requestAborted = !1),
      (this.paused = !1),
      this.checkAndCreateEssentialDirectories(),
      this.loadUserKey(),
      this.cleanOldStorageFiles();
  }
  async downloadSong(e) {
    if (!e) return;
    if (0 === this.encKey.length) return void (await this.loadUserKey());
    this.currentDownloadingSong = e;
    const o = global.decKey || this.encKey,
      t = zlib.createGzip(),
      n = crypto.createCipher(this.hashAlgorithm, `${o}${e.id}`);
    let r = 0;
    (this.requestAborted = !1),
      (this.temporaryDownloadWriteStreamPath = path.join(
        userTemporaryDownloadsDirectory,
        `${e.id}.dat`
      )),
      fs.existsSync(this.temporaryDownloadWriteStreamPath) &&
        fs.unlinkSync(this.temporaryDownloadWriteStreamPath),
      (this.temporaryDownloadWriteStream = fs.createWriteStream(
        this.temporaryDownloadWriteStreamPath,
        { autoClose: !0 }
      ));
    const s = require("request");
    (this.currentDownloadRequest = s.get(
      { uri: e.location, timeout: 5e4, pool: { maxSockets: 50 } },
      (e, o, t) => {
        e &&
          logger.logEvent(
            `[Download Engine] Request.get ERROR: ${JSON.stringify(
              e
            )} - esp: ${JSON.stringify(o)} - body: ${t}`
          );
      }
    )),
      this.currentDownloadRequest
        .on("response", (e) => {
          200 === e.statusCode &&
            (this.totalSize = e.headers["content-length"]);
        })
        .on("data", (e) => {
          (this.cumulativeProgress += e.length),
            (this.percentage =
              (100 * this.cumulativeProgress) / this.totalSize),
            this.percentage - r > 3 &&
              (this.emitMessageToWebPlayer("download-request-metrics", {
                metrics: {
                  totalSize: this.totalSize,
                  percentage: this.percentage.toFixed(1),
                  cumulativeProgress: this.cumulativeProgress,
                },
                songId: this.currentDownloadingSong.id,
              }),
              (r = this.percentage));
        })
        .on("abort", this._onDownloadAbort.bind(this))
        .on("error", this._onDownloadError.bind(this))
        .on("end", this._onDownloadEnd.bind(this)),
      this.currentDownloadRequest
        .pipe(t)
        .pipe(n)
        .pipe(this.temporaryDownloadWriteStream);
  }
  _onDownloadResponse(e) {
    200 == e.statusCode
      ? (this.totalSize = e.headers["content-length"])
      : (logger.logEvent(
          `[Download engine] Failure download response received: ${JSON.stringify(
            e
          )}`
        ),
        this.checkAndHandleDownloadRetrial());
  }
  _onDownloadAbort() {
    this.resetDownloadMetrics();
  }
  _onDownloadError(e) {
    this.paused || this.requestAborted
      ? logger.logEvent(
          `[Download engine] On download error - abort status: ${this.requestAborted} - paused status: ${this.paused}`
        )
      : (logger.logEvent(
          `[Download engine] On download error - ${JSON.stringify(e)}`
        ),
        this.checkAndHandleDownloadRetrial());
  }
  async _onDownloadEnd() {
    if (
      (logger.logEvent(
        `[Download engine] Download ended - abort status: ${this.requestAborted} - pause status: ${this.paused}`
      ),
      this.paused)
    )
      return;
    if (this.requestAborted)
      return (
        (this.requestAborted = !1),
        (this.downloadRetry = { retries: 0 }),
        this.checkAndRemoveFileSync(this.temporaryDownloadWriteStreamPath),
        this.emitMessageToWebPlayer("download-aborted", {
          song: this.currentDownloadingSong,
        }),
        void this.resetDownloadMetrics()
      );
    this.emitMessageToWebPlayer("download-request-metrics", {
      metrics: {
        totalSize: this.totalSize,
        percentage: 100,
        cumulativeProgress: this.totalSize,
      },
      songId: this.currentDownloadingSong.id,
    });
    let e = this.temporaryDownloadWriteStreamPath,
      o = path.join(
        userDownloadsDirectory,
        `${this.currentDownloadingSong.id}.dat`
      );
    if (
      Math.abs(this.currentDownloadingSong.size - this.cumulativeProgress) > 50
    )
      return (
        logger.logEvent("[Download engine] File sizes don't match"),
        void this.checkAndHandleDownloadRetrial()
      );
    if (!(await this.testDecryption(this.currentDownloadingSong, e)))
      return (
        logger.logEvent("[Download engine] Error decrypting song"),
        void this.checkAndHandleDownloadRetrial()
      );
    logger.logEvent("[Download engine] File sizes matched - proceeding...");
    const t = { ...this.currentDownloadingSong, createdOn: Date.now() };
    global.DB.downloads.insert(t, (t, n) => {
      t &&
        logger.logEvent(
          `[Download engine] Failed to insert song ${
            this.currentDownloadingSong.id
          } into DB. ERROR: ${JSON.stringify(t)}`
        ),
        (this.downloadRetry = { retries: 0 }),
        moveFile(e, o, (e) => {}),
        this.emitMessageToWebPlayer(
          "download-end",
          this.currentDownloadingSong
        ),
        this.sendDownloadsListToWebPlayer(),
        this.resetDownloadMetrics(!0),
        logger.logEvent(
          "[Download engine] Downloaded song successfully inserted to DB"
        ),
        logger.logEvent("[Download engine] Starting to download song coverart"),
        this.downloadImage(this.currentDownloadingSong);
    });
  }
  removeSongFromDownloads(e) {
    if (!e) return;
    const o = path.join(userDownloadsDirectory, `${e.id}.dat`),
      t = path.join(userTemporaryDecryptDirectory, `${e.id}.m4a`),
      n = path.join(userDownloadsDirectory, "covers", `${e.id}`);
    global.DB.downloads.remove({ id: e.id }, {}, (o, t) => {
      o ||
        (this.emitMessageToWebPlayer("download-removed", e),
        this.sendDownloadsListToWebPlayer(),
        logger.logEvent(
          `[Download engine] Removed downloaded song from DB: ${e.id} - numRemoved: ${t}`
        ));
    }),
      fs.unlink(o, (o) => {
        o ||
          logger.logEvent(
            `[Download engine] Removed downloaded song file: ${e.id}`
          );
      }),
      fs.exists(t, (o) => {
        o &&
          fs.unlink(t, (o) => {
            o ||
              logger.logEvent(
                `[Download engine] Removed downloaded song decrypted file: ${e.id}`
              );
          });
      }),
      fs.exists(n, (o) => {
        o &&
          fs.unlink(n, (o) => {
            o ||
              logger.logEvent(
                `[Download engine] Removed downloaded image: ${e.id}`
              );
          });
      });
  }
  decryptSong(e) {
    if (!e) return;
    const o = global.decKey || this.encKey,
      t = path.join(userDownloadsDirectory, `${e.id}.dat`),
      n = path.join(userTemporaryDecryptDirectory, `${e.id}.m4a`);
    if (!fs.existsSync(t))
      return (
        this.emitMessageToWebPlayer("download-redownload-song", { song: e }),
        void logger.logEvent(
          `[Download engine] Song decryption error - Downloaded song not found - redownloading: ${e.id}`
        )
      );
    const r = { highWaterMark: Math.pow(2, 16), autoClose: !0 },
      s = { highWaterMark: Math.pow(2, 16), autoClose: !0 },
      a = fs.createReadStream(t, r),
      i = fs.createWriteStream(n, s),
      l = zlib.createGunzip(),
      d = crypto.createDecipher(this.hashAlgorithm, `${o}${e.id}`);
    i.on("finish", () => {
      this.emitMessageToWebPlayer("download-song-decrypt-end", { path: n }),
        logger.logEvent(
          `[Download engine] Song decrypted successfully - ${e.id}`
        ),
        i.close(),
        g.close(),
        a.close();
    }),
      a.on("end", () => {});
    let g = a.pipe(d).pipe(l);
    g.on("error", (o) => {
      i.close(),
        g.close(),
        a.close(),
        g.close(),
        this.emitMessageToWebPlayer("download-redownload-song", { song: e }),
        logger.logEvent(
          `[Download engine] Song decryption error - redownloading: ${
            e.id
          } - Error: ${JSON.stringify(o)}`
        );
    }),
      g.pipe(i);
  }
  removeDecryptedSong(e) {
    const o = path.join(userTemporaryDecryptDirectory, `${e.id}.m4a`);
    fs.existsSync(o) &&
      fs.unlink(o, (o) => {
        o
          ? logger.logEvent(
              `[Download engine] Error removing decrypted song file - song: ${
                e.id
              } \n          - ERROR: ${JSON.stringify(o)}`
            )
          : logger.logEvent(
              `[Download engine] Successfully removed decrypted song file - song: ${e.id}`
            );
      });
  }
  testDecryption(e, o) {
    return new Promise((t, n) => {
      e ||
        (logger.logEvent("[Download engine] no song - Test decryption"), t(!1));
      const r = global.decKey || this.encKey;
      (r && r.length > 0) ||
        (logger.logEvent("[Download engine] no enc key - Test decryption"),
        t(!1));
      const s = o,
        a = path.join(userTemporaryDecryptDirectory, `${e.id}.m4a`);
      if (!fs.existsSync(s))
        return (
          t(!1),
          void logger.logEvent(
            "[Download engine] encryptedSongPath doesnt exist - Test decryption"
          )
        );
      const i = { highWaterMark: Math.pow(2, 16), autoClose: !0 },
        l = { highWaterMark: Math.pow(2, 16), autoClose: !0 },
        d = fs.createReadStream(s, i),
        g = fs.createWriteStream(a, l),
        c = zlib.createGunzip(),
        u = crypto.createDecipher(this.hashAlgorithm, `${r}${e.id}`);
      g.on("finish", () => {
        g.close(),
          h.close(),
          d.close(),
          logger.logEvent(
            `[Download engine] Song decrypted successfully - ${e.id}`
          ),
          t(!0),
          fs.unlinkSync(a);
      }),
        d.on("end", () => {});
      let h = d.pipe(u).pipe(c);
      h.on("error", (e) => {
        g.close(),
          h.close(),
          d.close(),
          h.close(),
          t(!1),
          fs.unlinkSync(a),
          logger.logEvent(
            "[Download engine] Song decryption error - Test decryption"
          );
      }),
        h.pipe(g);
    });
  }
  removeDecryptedSongsExcept(e = {}) {
    fs.readdir(userTemporaryDecryptDirectory, (o, t) => {
      let n = t.filter((o) => o !== `${e.id}.m4a`);
      o &&
        logger.logEvent(
          `[Download engine] Error removing decrypted songs - ERROR: ${JSON.stringify(
            o
          )}`
        );
      for (const e of n)
        fs.unlink(path.join(userTemporaryDecryptDirectory, e), (o) => {
          o
            ? logger.logEvent(
                `[Download engine] Error removing decrypted song: ${e}\n            - ERROR: ${JSON.stringify(
                  o
                )}`
              )
            : logger.logEvent(
                `[Download engine] Successfully removed decrypted song: ${e}`
              );
        });
    });
  }
  saveNewDownloadQueue(e) {
    global.DB.download_queue.remove({}, { multi: !0 }, (e, o) => {
      e ||
        logger.logEvent(
          `[Download engine] Cleaned download queue -  numRemoved: ${o}`
        );
    }),
      e.forEach((e) => {
        global.DB.download_queue.insert(e, (e, o) => {});
      });
  }
  checkForExistingQueueAndEmit() {
    global.DB.download_queue.find({}, (e, o) => {
      o.length > 0 &&
        storage.get("download-queue-state", (e, t) => {
          e
            ? ((this.paused = !1),
              logger.logEvent(`Storage module - ERROR: ${e}`),
              this.emitMessageToWebPlayer("download-queue-resume", {
                documents: o,
                paused: !1,
              }))
            : ((this.paused = t.paused),
              this.emitMessageToWebPlayer("download-queue-resume", {
                documents: o,
                paused: t.paused,
              }));
        });
    });
  }
  sendDownloadsListToWebPlayer() {
    global.DB.downloads
      .find({})
      .sort({ createdOn: -1 })
      .exec((e, o) => {
        this.emitMessageToWebPlayer("download-init", o);
      });
  }
  abortCurrentDownloadOperation() {
    this.currentDownloadRequest &&
      ((this.requestAborted = !0), this.currentDownloadRequest.abort());
  }
  pauseCurrentDownloadOperation() {
    this.currentDownloadRequest &&
      ((this.paused = !0),
      this.currentDownloadRequest.end(),
      this.resetDownloadMetrics(),
      storage.set("download-queue-state", { paused: !0 }, (e) => {
        e && console.log("err: ", e);
      }),
      logger.logEvent("[Download engine] Download paused"));
  }
  resumeCurrentDownloadOperation() {
    this.resetDownloadMetrics(),
      (this.paused = !1),
      this.downloadSong(this.currentDownloadingSong),
      storage.set("download-queue-state", { paused: !1 }, (e) => {
        e && console.log("err: ", e);
      }),
      logger.logEvent("[Download engine] Download resumed");
  }
  downloadImage(e) {
    const o = require("request");
    let t = path.join(userDownloadsDirectory, "covers", `${e.id}`),
      n = fs.createWriteStream(t, { autoClose: !0 }),
      r = "";
    const s = e.coverArtImageSmall,
      a = o.get(
        { uri: s, timeout: 5e4, agent: !1, pool: { maxSockets: 100 } },
        (e, o, t) => {
          e &&
            logger.logEvent(
              `[Download Engine - Image download] Request.get ERROR: ${JSON.stringify(
                e
              )} - esp: ${JSON.stringify(o)} - body: ${t}`
            );
        }
      );
    a.on("response", (e) => {
      r = e.headers["content-type"].split("/")[1];
    }),
      a.on("end", () => {
        let o = `${t}.${r}`;
        fs.rename(t, o, function (e) {
          e && console.log("ERROR: " + e);
        }),
          global.DB.downloads.update(
            { id: e.id },
            { $set: { savedCoverArtImage: o } },
            {},
            (e, o) => {
              logger.logEvent(
                `[Download Engine - Image download] Download End - DB Update query result: Err: ${JSON.stringify(
                  e
                )} - numReplaced: ${o}`
              );
            }
          );
      }),
      a.pipe(n);
  }
  checkAndHandleNewUserData(e) {
    remote.getCurrentWindow().webContents.getURL().indexOf("127.0.0.1") > -1 ||
      storage.get("user", (o, t) => {
        o ||
          (t.user && e.user && t.user.anid != e.user.anid
            ? global.DB.downloads
                .find({})
                .sort({ createdOn: -1 })
                .exec((o, t) => {
                  t.length > 0
                    ? this.showUserChangePrompt(e)
                    : this.writeNewAuthDataToDisk(e);
                })
            : this.writeNewAuthDataToDisk(e));
      });
  }
  showUserChangePrompt(e) {
    dialog.showMessageBox(
      {
        type: "info",
        buttons: ["Remove downloads", "Logout"],
        title: "New user login",
        message: "Anghami",
        detail:
          "It seems that you logged in with a new user, if you wish to proceed existing downloads will be cleared.",
      },
      (o) => {
        0 === o
          ? (logger.logEvent(
              "[Main process] User accepted to remove older downloads"
            ),
            this.removeAllDownloads(),
            this.writeNewAuthDataToDisk(e))
          : 1 === o &&
            (logger.logEvent(
              "[Main process] User refused to remove older downloads, will notify web player to logout."
            ),
            this.emitMessageToWebPlayer("downloads-user-changed-logout"));
      }
    );
  }
  removeAllDownloads() {
    this.cleanDirectoryContents(userDownloadsDirectory, () => {
      this.checkAndCreateEssentialDirectories();
    }),
      global.DB.downloads.remove({}, { multi: !0 }, (e, o) => {
        e ||
          (this.emitMessageToWebPlayer("download-removed-all"),
          this.sendDownloadsListToWebPlayer(),
          logger.logEvent(
            `[Download engine] Removed all downloads - numRemoved: ${o}`
          ));
      });
  }
  writeNewAuthDataToDisk(e) {
    storage.set("user", e, (e) => {
      e && console.log("err: ", e);
    });
  }
  async loadUserKey() {
    this.encKey = await this.getUserKey();
  }
  toggleAutoDownloads() {
    storage.get("auto_downloads", (e, o) => {
      let t = "";
      (t = !e && o.enabled),
        storage.set("auto_downloads", { enabled: !t }, (e) => {});
    });
  }
  setAutoDownloadsValue(e) {
    storage.set("auto_downloads", { enabled: e }, (o) => {
      o
        ? logger.logEvent(
            `[Download engine] Auto downloads set new value ERROR: ${JSON.stringify(
              o
            )}`
          )
        : logger.logEvent(
            `[Download engine] Auto downloads set new value: ${e}`
          );
    });
  }
  checkForAutoDownloadsAndEmit() {
    storage.get("auto_downloads", (e, o) => {
      let t = !e && o.enabled;
      this.emitMessageToWebPlayer("download-auto-downloads-state", {
        enabled: !!t,
        init: !0,
      });
    });
  }
  getUserKey() {
    return new Promise((e, o) => {
      storage.get("key", function (o, t) {
        o
          ? (logger.logEvent(`Storage module - ERROR: ${o}`), e("error"))
          : e(t.key);
      });
    });
  }
  handleUserLogout() {
    this.saveNewDownloadQueue([]),
      this.abortCurrentDownloadOperation(),
      storage.remove("key", (e) => {
        logger.logEvent(
          `[Download engine] User key removal result: ERROR: ${e} `
        );
      }),
      storage.remove("download-queue-state", (e) => {
        logger.logEvent(
          `[Download engine] User download-queue-state removal result: ERROR: ${e} `
        );
      }),
      storage.remove("auto_downloads", (e) => {
        logger.logEvent(
          `[Download engine] User auto_downloads removal result: ERROR: ${e} `
        );
      });
  }
  runDownloadsMigrationLogic() {
    const e = {},
      o = this.getUserDownloadsFromDiskSync();
    o.length > 0 &&
      (logger.logEvent("[Downloads Migration] Migration about to start"),
      o.forEach((o) => {
        e[o.id] ||
          ((o = { ...o, createdOn: Date.now() }),
          global.DB.downloads.insert(o, (t, n) => {
            t
              ? logger.logEvent(
                  "[Downloads Migration] Failed to migrate song: " +
                    o.id +
                    " ERROR: " +
                    JSON.stringify(t)
                )
              : (e["item.id"] = !0);
          }));
      }),
      fs.rename(
        userOldDownloadsFilePath,
        path.join(app.getPath("userData"), "tempdir", "downloads_backup.json"),
        function (e) {
          e
            ? logger.logEvent(
                "[Downloads Migration] Error nenaming old downloads file - ERROR: " +
                  JSON.stringify(e)
              )
            : logger.logEvent(
                "[Downloads Migration] Old downloads file renamed successfully"
              );
        }
      ));
  }
  getUserDownloadsFromDiskSync() {
    let e = [];
    return (
      fs.existsSync(userOldDownloadsFilePath) &&
        ((e = fs.readFileSync(userOldDownloadsFilePath)), (e = JSON.parse(e))),
      e
    );
  }
  checkAndCreateEssentialDirectories() {
    fs.existsSync(userDownloadsDirectory) ||
      fs.mkdirSync(userDownloadsDirectory),
      fs.existsSync(path.join(userDownloadsDirectory, "covers")) ||
        fs.mkdirSync(path.join(userDownloadsDirectory, "covers")),
      fs.existsSync(userTemporaryDirectory) ||
        fs.mkdirSync(userTemporaryDirectory),
      fs.existsSync(userTemporaryDownloadsDirectory) ||
        fs.mkdirSync(userTemporaryDownloadsDirectory),
      fs.existsSync(userTemporaryDecryptDirectory) ||
        fs.mkdirSync(userTemporaryDecryptDirectory);
  }
  cleanOldStorageFiles() {
    this.checkAndRemoveFileAsync(
      path.join(electronJsonStorageDirPath, "en.json")
    ),
      this.checkAndRemoveFileAsync(
        path.join(electronJsonStorageDirPath, "userData.json")
      ),
      this.checkAndRemoveFileAsync(
        path.join(electronJsonStorageDirPath, "savedDownloadQueue.json")
      ),
      this.checkAndRemoveFileAsync(
        path.join(electronJsonStorageDirPath, "current_batch.json")
      );
  }
  cleanDirectoryContents(e, o) {
    logger.logEvent(`[Download Engine] - Cleaning directory: ${e}`),
      rimraf(e, (t) => {
        t &&
          logger.logEvent(
            `[Download Engine] - Error while cleaning directory: ${e} - Error: ${t}`
          ),
          o && "function" == typeof o && o();
      });
  }
  resetDownloadMetrics(e = !1) {
    (this.totalSize = 0),
      (this.percentage = 0),
      (this.cumulativeProgress = 0),
      (this.currentDownloadRequest = null),
      e || this.checkAndRemoveFileSync(this.temporaryDownloadWriteStreamPath);
  }
  checkAndHandleDownloadRetrial() {
    logger.logEvent(
      `[Download engine] Starting retrial logic - Song: ${this.currentDownloadingSong.id}`
    ),
      this.abortCurrentDownloadOperation(),
      this.checkAndRemoveFileSync(this.temporaryDownloadWriteStreamPath),
      this.downloadRetry.retries >= 3
        ? (this.emitMessageToWebPlayer("download-retries-exceeded", {
            song: this.currentDownloadingSong,
          }),
          this.resetDownloadMetrics(),
          (this.downloadRetry = { retries: 0 }),
          logger.logEvent(
            "[Download engine] Retries limit exceeded - aborting download"
          ))
        : (this.downloadRetry.retries++,
          this.downloadSong(this.currentDownloadingSong),
          logger.logEvent(
            `[Download engine] Retries limit not exceeded yet - retry number: ${this.downloadRetry.retries}`
          ));
  }
  checkAndRemoveFileAsync(e) {
    fs.exists(e, (o) => {
      o &&
        fs.unlink(e, (o) => {
          o
            ? logger.logEvent(
                `checkAndRemoveFileAsync: Tried to unlink ${e} - ERROR: ${JSON.stringify(
                  o
                )}`
              )
            : logger.logEvent(
                `checkAndRemoveFileAsync: Successfully unlinked Removed ${e}`
              );
        });
    });
  }
  checkAndRemoveFileSync(e) {
    fs.existsSync(e) && fs.unlinkSync(e);
  }
  fileToBase64Buffer(e) {
    const o = fs.readFileSync(e);
    return new Buffer.from(o).toString("base64");
  }
  convertDataURIToBinary(e) {
    for (
      var o = e.indexOf(";base64,") + ";base64,".length,
        t = e.substring(o),
        n = window.atob(t),
        r = n.length,
        s = new Uint8Array(new ArrayBuffer(r)),
        a = 0;
      a < r;
      a++
    )
      s[a] = n.charCodeAt(a);
    return s;
  }
  emitMessageToWebPlayer(e, o) {
    global._desktopSource.next({ action: e, payload: o });
  }
}
module.exports = DownloadManager;
