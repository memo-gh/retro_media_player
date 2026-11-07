import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.Mpris
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "RetroMediaModel.js" as Model

BarWidget {
  id: root
  moduleName: "memo.retro-media"

  Commons.Translations {
    id: strings
    directory: Qt.resolvedUrl("i18n")
  }

  readonly property int maxLabelWidth: Math.max(60, Math.min(360, Number(setting("maxLabelWidth", 150)) || 150))
  readonly property bool showArtist: setting("showArtist", false) === true
  readonly property bool showPacmanChomp: setting("showPacmanChomp", true) !== false
  readonly property string colorMode: String(setting("colorMode", "retro90s") || "retro90s")

  readonly property string focusScriptPath:
    decodeURIComponent(Qt.resolvedUrl("focus-playing-app").toString().replace(/^file:\/\//, ""))
  readonly property string radioAtlasStatusPath:
    (Quickshell.env("XDG_RUNTIME_DIR") || ("/run/user/" + Quickshell.env("UID"))) + "/omarchy-radio-atlas/status.json"

  readonly property var players: Mpris.players ? Mpris.players.values : []
  property var playerStartedAt: ({})
  property int playSerial: 0
  property int playerStateRevision: 0
  property var radioAtlasState: null

  FileView {
    id: radioAtlasStatusFile
    path: root.radioAtlasStatusPath
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onLoaded: root.radioAtlasState = Model.parseRadioAtlasState(text())
    onFileChanged: reload()
  }

  function bumpPlayerRevision() {
    playerStateRevision = (playerStateRevision + 1) % 1000000
    radioAtlasStatusFile.reload()
  }

  function syncPlayers() {
    var next = {}
    var serial = playSerial
    var changed = false
    for (var i = 0; i < players.length; i++) {
      var p = players[i]
      var key = Model.playerKey(p)
      if (!key || !p.isPlaying) continue
      if (playerStartedAt[key] === undefined) {
        serial += 1
        next[key] = serial
        changed = true
      } else {
        next[key] = playerStartedAt[key]
      }
    }
    for (var oldKey in playerStartedAt) {
      if (next[oldKey] === undefined) {
        changed = true
        break
      }
    }
    if (changed) {
      playSerial = serial
      playerStartedAt = next
    }
    bumpPlayerRevision()
  }

  Component.onCompleted: Qt.callLater(root.syncPlayers)
  onPlayersChanged: Qt.callLater(root.syncPlayers)

  Instantiator {
    model: root.players
    delegate: Connections {
      required property var modelData
      target: modelData
      ignoreUnknownSignals: true
      function onIsPlayingChanged() { Qt.callLater(root.syncPlayers) }
      function onPlaybackStateChanged() { Qt.callLater(root.syncPlayers) }
      function onTrackTitleChanged() { Qt.callLater(root.bumpPlayerRevision) }
      function onTrackArtistChanged() { Qt.callLater(root.bumpPlayerRevision) }
      function onIdentityChanged() { Qt.callLater(root.bumpPlayerRevision) }
    }
  }

  readonly property var activePlayer: {
    var _rev = root.playerStateRevision
    return Model.selectPlayingPlayer(root.players, root.playerStartedAt, root.radioAtlasState)
  }
  readonly property bool radioFallbackActive: !root.activePlayer && Model.isRadioAtlasActivelyPlaying(root.radioAtlasState)
  readonly property string songLabel: {
    var _rev = root.playerStateRevision
    var p = root.activePlayer
    if (p) {
      var _t = p.trackTitle
      var _a = p.trackArtist
      var _id = p.identity
    }
    return Model.formatSongLabel(p, root.showArtist, root.radioAtlasState)
  }

  readonly property bool isPlaying: ((!!root.activePlayer && !!root.activePlayer.isPlaying) || root.radioFallbackActive) && root.songLabel !== ""
  readonly property color foregroundColor: root.bar ? root.bar.barForeground : Commons.Color.foreground

  property var eqState: Model.createEqualizerState(5, 7)
  property real pacmanMouthAngle: 0.25

  Timer {
    id: retroAnimTimer
    interval: 65
    repeat: true
    running: root.isPlaying && root.visible && !Style.reduceMotion
    onTriggered: {
      root.eqState = Model.stepEqualizer(root.eqState)
      var phase = root.eqState.tick % 6
      root.pacmanMouthAngle = phase === 0 || phase === 5 ? 0.06 : (phase === 1 || phase === 4 ? 0.20 : 0.34)
      eqCanvas.requestPaint()
      if (pacmanCanvas.visible) pacmanCanvas.requestPaint()
    }
  }

  Process {
    id: focusProcess
    command: []
  }

  function focusPlayingApp() {
    var p = root.activePlayer
    if ((!p && !root.radioFallbackActive) || focusProcess.running) return

    var dbusName = p ? Model.singleLineText(p.dbusName || "", 160) : "org.mpris.MediaPlayer2.mpv.radio_atlas"
    var desktopEntry = p ? Model.singleLineText(p.desktopEntry || "", 120) : "akshar.radio-atlas"
    var identity = p ? Model.singleLineText(p.identity || "", 120) : "Radio Atlas"
    var trackTitle = p
      ? Model.singleLineText(p.trackTitle || "", 200)
      : Model.singleLineText(root.radioAtlasState && root.radioAtlasState.title || "", 200)
    var trackArtist = p ? Model.singleLineText(p.trackArtist || "", 160) : ""
    var trackUrl = ""
    if (p && p.metadata && p.metadata["xesam:url"]) {
      trackUrl = Model.singleLineText(String(p.metadata["xesam:url"]), 512)
    }

    focusProcess.command = [
      "python3",
      root.focusScriptPath,
      dbusName,
      desktopEntry,
      identity,
      trackTitle,
      trackArtist,
      trackUrl
    ]
    focusProcess.running = true
  }

  function togglePlayPause() {
    var p = root.activePlayer
    if (!p) return
    if (p.canPause && p.isPlaying) p.pause()
    else if (p.canTogglePlaying) p.togglePlaying()
  }

  function nextTrack() {
    var p = root.activePlayer
    if (p && p.canGoNext) p.next()
  }

  function previousTrack() {
    var p = root.activePlayer
    if (p && p.canGoPrevious) p.previous()
  }

  TextMetrics {
    id: songMetrics
    font.family: root.bar ? root.bar.fontFamily : Style.font.family
    font.pixelSize: Style.font.body
    text: root.songLabel
  }

  readonly property real naturalSongWidth: Math.ceil(songMetrics.advanceWidth)
  readonly property bool isOverflowing: !root.vertical && root.naturalSongWidth > root.maxLabelWidth
  readonly property real viewportWidth: root.vertical ? 0 : Math.min(root.maxLabelWidth, Math.max(16, root.naturalSongWidth))
  readonly property real tunnelGapWidth: root.showPacmanChomp ? Style.space(38) : Style.space(24)
  readonly property real wrapCycleWidth: Math.max(1, primarySongText.implicitWidth + root.tunnelGapWidth)

  visible: root.isPlaying
  implicitWidth: root.isPlaying ? button.implicitWidth : 0
  implicitHeight: root.isPlaying ? button.implicitHeight : 0

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    labelVisible: false
    hasVisualContent: root.isPlaying
    useActiveColor: false
    fixedWidth: root.isPlaying
      ? (root.vertical ? root.barSize : (contentRow.implicitWidth + Style.space(16)))
      : 0
    fixedHeight: root.isPlaying ? root.barSize : 0
    tooltipText: {
      var _rev = root.playerStateRevision
      var p = root.activePlayer
      if (!p && !root.radioFallbackActive) return ""
      var appLabel = p
        ? Model.neutralizeMarkup(p.identity || p.desktopEntry || Model.playerAppToken(p), 60)
        : "Radio Atlas"
      var clickHint = appLabel
        ? strings.t("tooltip.clickToFocus").arg(appLabel)
        : strings.t("tooltip.clickToFocusGeneric")
      return Model.formatTooltip(p, clickHint, root.radioAtlasState)
    }

    onPressed: function(mouseButton) {
      if (!root.activePlayer && !root.radioFallbackActive) return
      if (mouseButton === Qt.RightButton) {
        root.togglePlayPause()
      } else if (mouseButton === Qt.MiddleButton) {
        root.nextTrack()
      } else {
        root.focusPlayingApp()
      }
    }

    onWheelMoved: function(delta) {
      if (!root.activePlayer && !root.radioFallbackActive) return
      if (delta > 0) root.previousTrack()
      else if (delta < 0) root.nextTrack()
    }

    Row {
      id: contentRow
      anchors.centerIn: parent
      spacing: Style.space(6)
      scale: button.pressScale

      // Song name with Pac-Man wrap-around overflow effect
      Item {
        id: songViewport
        visible: !root.vertical && root.songLabel !== ""
        width: root.viewportWidth
        height: Math.max(primarySongText.implicitHeight, Style.space(16))
        clip: true
        anchors.verticalCenter: parent.verticalCenter

        Item {
          id: marqueeTrack
          x: 0
          width: root.isOverflowing ? (primarySongText.implicitWidth * 2 + root.tunnelGapWidth) : primarySongText.implicitWidth
          height: parent.height

          onWidthChanged: if (!root.isOverflowing) marqueeTrack.x = 0

          NumberAnimation on x {
            id: pacmanWrapAnim
            running: root.isOverflowing && root.isPlaying && root.visible && !Style.reduceMotion
            onRunningChanged: if (!running) marqueeTrack.x = 0
            loops: Animation.Infinite
            from: 0
            to: -root.wrapCycleWidth
            duration: Style.duration(Math.max(4200, Math.round(root.wrapCycleWidth * 28)))
            easing.type: Easing.Linear
          }

          Text {
            id: primarySongText
            x: 0
            anchors.verticalCenter: parent.verticalCenter
            textFormat: Text.PlainText
            text: root.songLabel
            color: root.foregroundColor
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.body
            renderType: Text.NativeRendering
          }

          // Pac-Man tunnel separator between the tail and the wrapped head of the overflowing title
          Item {
            id: pacmanTunnel
            visible: root.isOverflowing
            x: primarySongText.implicitWidth
            width: root.tunnelGapWidth
            height: parent.height

            Canvas {
              id: pacmanCanvas
              visible: root.isOverflowing && root.showPacmanChomp
              anchors.centerIn: parent
              width: Style.space(30)
              height: Style.space(12)

              onPaint: {
                var ctx = getContext("2d")
                ctx.clearRect(0, 0, width, height)

                var cy = height / 2
                var r = Math.min(height * 0.42, 5)
                var px = r + 2
                var mouth = root.pacmanMouthAngle * Math.PI

                // Pac-Man facing left (chomping in the direction of the scroll) or right
                // Facing left so it leads the incoming wrapped text across the tunnel:
                ctx.fillStyle = "#FFD700"
                ctx.beginPath()
                ctx.moveTo(px, cy)
                ctx.arc(px, cy, r, Math.PI + mouth, Math.PI - mouth, false)
                ctx.closePath()
                ctx.fill()

                // Power pellets ahead of / behind Pac-Man
                ctx.fillStyle = "#FFB8AE"
                var dotSpacing = (width - px - r - 4) / 3
                for (var d = 1; d <= 3; d++) {
                  var dx = px + r + d * dotSpacing
                  ctx.beginPath()
                  ctx.arc(dx, cy, 1.3, 0, Math.PI * 2)
                  ctx.fill()
                }
              }
            }

            Text {
              visible: root.isOverflowing && !root.showPacmanChomp
              anchors.centerIn: parent
              textFormat: Text.PlainText
              text: "·"
              color: Qt.darker(root.foregroundColor, 1.4)
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.body
            }
          }

          // Wrapped second copy for seamless Pac-Man screen wrap-around
          Text {
            id: wrappedSongText
            visible: root.isOverflowing
            x: root.wrapCycleWidth
            anchors.verticalCenter: parent.verticalCenter
            textFormat: Text.PlainText
            text: root.songLabel
            color: root.foregroundColor
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.body
            renderType: Text.NativeRendering
          }
        }
      }

      // Retro 90s segmented LED equalizer with peak-hold caps
      Canvas {
        id: eqCanvas
        width: Style.space(21)
        height: Style.space(14)
        anchors.verticalCenter: parent.verticalCenter

        onPaint: {
          var ctx = getContext("2d")
          ctx.clearRect(0, 0, width, height)

          var s = root.eqState
          var cols = s ? s.columns : 5
          var rows = s ? s.rows : 7
          var gapX = 1
          var gapY = 1
          var segW = Math.max(2, Math.floor((width - (cols - 1) * gapX) / cols))
          var segH = Math.max(1, Math.floor((height - (rows - 1) * gapY) / rows))
          var totalW = cols * segW + (cols - 1) * gapX
          var totalH = rows * segH + (rows - 1) * gapY
          var startX = Math.floor((width - totalW) / 2)
          var startY = Math.floor((height - totalH) / 2)

          var fg = Qt.color(root.foregroundColor)
          var unlitColor = Qt.rgba(fg.r, fg.g, fg.b, 0.14)
          var isRetro = root.colorMode !== "theme"

          for (var c = 0; c < cols; c++) {
            var level = s && s.levels ? s.levels[c] : 2
            var peak = s && s.peaks ? s.peaks[c] : level
            var x = startX + c * (segW + gapX)

            for (var r = 0; r < rows; r++) {
              // r = 0 is bottom segment, r = rows - 1 is top segment
              var y = startY + (rows - 1 - r) * (segH + gapY)
              var isLit = r < level
              var isPeak = (r === peak - 1) && (peak > level)

              if (isLit) {
                if (isRetro) {
                  if (r >= rows - 2) ctx.fillStyle = "#FF3D00"      // 90s red/orange peak zone
                  else if (r >= rows - 4) ctx.fillStyle = "#FFEA00" // 90s yellow/amber mid zone
                  else ctx.fillStyle = "#00E676"                    // 90s phosphor green base zone
                } else {
                  ctx.fillStyle = r >= rows - 2 ? Commons.Color.accent : root.foregroundColor
                }
              } else if (isPeak) {
                ctx.fillStyle = isRetro ? "#FF6E40" : Commons.Color.accent
              } else {
                ctx.fillStyle = unlitColor
              }

              ctx.fillRect(x, y, segW, segH)
            }
          }
        }
      }
    }
  }
}
