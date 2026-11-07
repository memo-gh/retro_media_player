function singleLineText(value, limit) {
  var maxLen = typeof limit === "number" && limit > 0 ? limit : 180
  return String(value === undefined || value === null ? "" : value)
    .replace(/[\r\n\t\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
}

function neutralizeMarkup(value, limit) {
  return singleLineText(value, limit)
    .replace(/</g, "‹")
    .replace(/>/g, "›")
}

function isProxyPlayer(player) {
  var dbusName = String(player && player.dbusName || "").toLowerCase()
  var desktopEntry = String(player && player.desktopEntry || "").toLowerCase()
  return dbusName.indexOf("playerctld") !== -1 || desktopEntry === "playerctld"
}

function isRadioAtlasPlayer(player) {
  if (!player) return false
  var dbusName = String(player.dbusName || "").toLowerCase()
  var identity = singleLineText(player.identity, 80).toLowerCase()
  var desktopEntry = singleLineText(player.desktopEntry, 80).toLowerCase()
  return dbusName.indexOf("radio_atlas") !== -1
    || dbusName.indexOf("radio-atlas") !== -1
    || identity === "radio atlas"
    || desktopEntry === "radio-atlas"
    || desktopEntry === "akshar.radio-atlas"
}

function parseRadioAtlasState(raw) {
  if (typeof raw !== "string" || !raw || raw.length > 65536) return null
  try {
    var state = JSON.parse(raw)
    if (!state || typeof state !== "object") return null
    var station = state.station && typeof state.station === "object" ? state.station : {}
    var vol = Math.round(Number(state.volume === undefined ? 70 : state.volume))
    return {
      running: state.running === true,
      paused: state.paused === true,
      stopped: state.stopped === true,
      muted: state.muted === true,
      volume: isFinite(vol) ? Math.max(0, Math.min(100, vol)) : 70,
      title: singleLineText(state.title, 180),
      stationUuid: singleLineText(station.uuid, 64),
      stationName: singleLineText(station.name, 120),
      country: singleLineText(station.country, 80),
      countryCode: singleLineText(station.countryCode, 8).toUpperCase(),
      error: singleLineText(state.error, 160)
    }
  } catch (e) {
    return null
  }
}

function isRadioAtlasActivelyPlaying(radioState) {
  return !!(radioState && radioState.running && !radioState.stopped && !radioState.paused && !radioState.error)
}

function cleanRadioTrackTitle(rawTitle, stationName) {
  var title = singleLineText(rawTitle, 180).replace(/^[\s:|\-–—·]+/, "").trim()
  var station = singleLineText(stationName, 120)
  if (station && title.toLowerCase().indexOf(station.toLowerCase()) === 0) {
    var rest = title.slice(station.length)
    if (rest === "") {
      title = ""
    } else if (/^(\s+[-–—|·:\/]\s+|\s*[:|·]\s*)/.test(rest)) {
      title = rest.replace(/^[\s:|\-–—·\/]+/, "").trim()
    }
  }
  return title
}

function playerKey(player) {
  if (!player) return ""
  return String(player.dbusName || player.desktopEntry || player.identity || "")
}

function playerAppToken(player) {
  if (!player) return ""
  var dbus = String(player.dbusName || "")
  dbus = dbus.replace(/^org\.mpris\.MediaPlayer2\./i, "")
  dbus = dbus.replace(/\.instance[0-9_]+$/i, "")
  return singleLineText(player.desktopEntry || player.identity || dbus, 80)
}

function hasPlayableLabel(player, radioState) {
  if (!player) return false
  if (isRadioAtlasPlayer(player) && radioState && (radioState.title || radioState.stationName)) {
    return true
  }
  return Boolean(
    singleLineText(player.trackTitle, 180)
    || singleLineText(player.trackArtist, 120)
    || singleLineText(player.identity, 80)
    || singleLineText(player.desktopEntry, 80)
  )
}

function selectPlayingPlayer(players, playOrderMap, radioState) {
  var list = players && typeof players.length === "number" ? players : []
  var orderMap = playOrderMap && typeof playOrderMap === "object" ? playOrderMap : {}
  var best = null
  var bestScore = -Infinity

  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    if (!p || !p.isPlaying || !hasPlayableLabel(p, radioState)) continue

    var score = 0
    if (!isProxyPlayer(p)) score += 1000
    var radioAtlas = isRadioAtlasPlayer(p)
    var hasTitle = singleLineText(p.trackTitle, 180) !== ""
      || (radioAtlas && !!(radioState && (radioState.title || radioState.stationName)))
    var hasArtist = singleLineText(p.trackArtist, 120) !== ""
      || (radioAtlas && hasTitle)
    if (hasTitle) score += 500
    if (hasArtist) score += 100

    var key = playerKey(p)
    var startedOrder = key && typeof orderMap[key] === "number" ? orderMap[key] : (i + 1)
    score += Math.min(90, startedOrder)

    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }

  return best
}

function formatSongLabel(player, showArtist, radioState) {
  if (!player) {
    if (isRadioAtlasActivelyPlaying(radioState)) {
      var fallbackStation = singleLineText(radioState.stationName, 120)
      var fallbackTrack = cleanRadioTrackTitle(radioState.title, fallbackStation)
      if (fallbackTrack && showArtist && fallbackStation) return fallbackTrack + " · " + fallbackStation
      return fallbackTrack || fallbackStation || "Radio Atlas"
    }
    return ""
  }

  if (isRadioAtlasPlayer(player)) {
    var stationName = singleLineText(radioState && radioState.stationName, 120)
    var rawTitle = singleLineText(player.trackTitle || (radioState && radioState.title), 180)
    var cleanedTrack = cleanRadioTrackTitle(rawTitle, stationName)
    var primary = cleanedTrack || stationName || rawTitle
    var secondary = singleLineText(player.trackArtist, 120) || (cleanedTrack && stationName ? stationName : "")

    if (primary && showArtist && secondary && primary.toLowerCase() !== secondary.toLowerCase()) {
      return primary + " · " + secondary
    }
    if (primary) return primary
    return singleLineText(player.identity || "Radio Atlas", 80)
  }

  var title = singleLineText(player.trackTitle, 180)
  var artist = singleLineText(player.trackArtist, 120)
  var fallback = singleLineText(player.identity || player.desktopEntry, 80)

  if (title && showArtist && artist) return title + " · " + artist
  if (title) return title
  if (artist) return artist
  return fallback
}

function formatTooltip(player, clickHintText, radioState) {
  var hint = neutralizeMarkup(clickHintText, 120)
  if (!player && isRadioAtlasActivelyPlaying(radioState)) {
    var rsStation = neutralizeMarkup(radioState.stationName, 120)
    var rsTrack = neutralizeMarkup(cleanRadioTrackTitle(radioState.title, radioState.stationName), 160)
    var rsCountry = neutralizeMarkup(radioState.country || radioState.countryCode, 60)
    var rsContext = rsStation && rsCountry ? (rsStation + " (" + rsCountry + ")") : (rsStation || rsCountry)
    var rsHeader = rsTrack && rsContext ? (rsTrack + " — " + rsContext) : (rsTrack || rsContext || "Radio Atlas")
    return rsHeader && hint ? (rsHeader + "\n" + hint) : (rsHeader || hint)
  }
  if (!player) return ""

  if (isRadioAtlasPlayer(player)) {
    var stName = neutralizeMarkup(radioState && radioState.stationName, 120)
    var rawT = singleLineText(player.trackTitle || (radioState && radioState.title), 180)
    var cleanT = neutralizeMarkup(cleanRadioTrackTitle(rawT, radioState && radioState.stationName), 160)
    var countryLabel = neutralizeMarkup(radioState && (radioState.country || radioState.countryCode), 60)
    var stationDesc = stName && countryLabel ? (stName + " (" + countryLabel + ")") : (stName || countryLabel)
    var radioHeader = cleanT && stationDesc
      ? (cleanT + " — " + stationDesc)
      : (cleanT || stationDesc || neutralizeMarkup(player.identity || "Radio Atlas", 80))
    if (radioHeader && hint) return radioHeader + "\n" + hint
    return radioHeader || hint
  }

  var title = neutralizeMarkup(player.trackTitle, 160)
  var artist = neutralizeMarkup(player.trackArtist, 120)
  var app = neutralizeMarkup(player.identity || player.desktopEntry || playerAppToken(player), 80)

  var header = title && artist ? (title + " — " + artist) : (title || artist || app)
  if (header && hint) return header + "\n" + hint
  return header || hint
}

function createEqualizerState(columns, rows) {
  var cols = columns || 5
  var segs = rows || 7
  var levels = []
  var peaks = []
  var holds = []
  for (var i = 0; i < cols; i++) {
    levels.push(Math.max(1, (i % 3) + 2))
    peaks.push(Math.max(2, (i % 3) + 3))
    holds.push(0)
  }
  return {
    columns: cols,
    rows: segs,
    levels: levels,
    peaks: peaks,
    holds: holds,
    tick: 0
  }
}

function stepEqualizer(state) {
  var s = state || createEqualizerState(5, 7)
  var cols = s.columns || 5
  var rows = s.rows || 7
  var t = (s.tick || 0) + 1
  s.tick = t

  for (var i = 0; i < cols; i++) {
    // Multi-harmonic 90s spectrum wave: bass punch on left, mid melody in middle, hi-hat shimmer on right
    var wave1 = Math.sin(t * (0.34 + i * 0.09) + i * 1.3)
    var wave2 = Math.cos(t * (0.57 - i * 0.05) + i * 2.1)
    var wave3 = Math.sin(t * (0.91 + i * 0.17) + i * 0.7)
    var beat = (i <= 1 && (t % 8 < 2)) ? 0.28 : 0.0
    var normalized = ((wave1 * 0.45 + wave2 * 0.35 + wave3 * 0.20) + 1.0) * 0.5 + beat
    normalized = Math.max(0.12, Math.min(1.0, normalized))

    var target = Math.max(1, Math.min(rows, Math.round(normalized * rows)))
    var prev = s.levels[i] || 1
    // Fast attack, 1-step decay like a classic 90s hardware EQ
    var nextLevel = target >= prev ? target : Math.max(1, prev - 1)
    s.levels[i] = nextLevel

    var prevPeak = s.peaks[i] || nextLevel
    if (nextLevel >= prevPeak) {
      s.peaks[i] = nextLevel
      s.holds[i] = 5
    } else if (s.holds[i] > 0) {
      s.holds[i] = s.holds[i] - 1
    } else {
      s.peaks[i] = Math.max(nextLevel, prevPeak - 1)
    }
  }

  return s
}

function extractUrlHost(url) {
  var raw = singleLineText(url, 512).toLowerCase()
  if (!raw) return ""
  var match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/.exec(raw)
  if (!match) return ""
  var host = match[1].replace(/^.*@/, "").replace(/:[0-9]+$/, "")
  return host.replace(/^www\./, "")
}

function normalizeMatchToken(text) {
  return singleLineText(text, 200).toLowerCase()
}

function matchPlayingWindow(clients, query) {
  var list = Array.isArray(clients) ? clients : []
  if (list.length === 0) return ""

  var q = query || {}
  var trackTitle = normalizeMatchToken(q.trackTitle)
  var trackArtist = normalizeMatchToken(q.trackArtist)
  var desktopEntry = normalizeMatchToken(q.desktopEntry).replace(/\.desktop$/, "")
  var identity = normalizeMatchToken(q.identity)
  var dbusName = normalizeMatchToken(q.dbusName)
    .replace(/^org\.mpris\.mediaplayer2\./, "")
    .replace(/\.instance[0-9_]+$/, "")
  var urlHost = extractUrlHost(q.trackUrl)
  var urlHostUnderscore = urlHost.replace(/\./g, ".")
  var mprisPid = Number(q.mprisPid || 0)

  var browserTokens = ["chromium", "chrome", "google-chrome", "brave", "firefox", "vivaldi", "opera", "msedge", "zen"]
  var isBrowserPlayer = false
  for (var b = 0; b < browserTokens.length; b++) {
    var bt = browserTokens[b]
    if (desktopEntry.indexOf(bt) !== -1 || identity.indexOf(bt) !== -1 || dbusName.indexOf(bt) !== -1) {
      isBrowserPlayer = true
      break
    }
  }

  var webMediaKeywords = [
    "youtube", "spotify", "soundcloud", "tidal", "deezer",
    "bandcamp", "music.apple", "applemusic", "pandora",
    "plex", "jellyfin", "twitch", "netflix", "mixcloud"
  ]

  var bestAddress = ""
  var bestScore = 0
  var bestFocusHistory = 999999

  for (var i = 0; i < list.length; i++) {
    var c = list[i]
    if (!c || !c.address) continue

    var cls = normalizeMatchToken(c.class)
    var initCls = normalizeMatchToken(c.initialClass)
    var title = normalizeMatchToken(c.title)
    var initTitle = normalizeMatchToken(c.initialTitle)
    var pid = Number(c.pid || 0)
    var focusId = typeof c.focusHistoryID === "number" ? c.focusHistoryID : 999999
    var isWebApp = /^(?:chrome|brave|msedge|vivaldi|opera)-/.test(cls) || /^(?:chrome|brave|msedge|vivaldi|opera)-/.test(initCls)

    var score = 0

    // 1. Song title appears in the window title (strongest signal for both web-apps & browser tabs)
    if (trackTitle.length >= 2 && (title.indexOf(trackTitle) !== -1 || initTitle.indexOf(trackTitle) !== -1)) {
      score += 1000
      if (isWebApp) score += 150
    }

    // 2. URL hostname matches Chromium web-app class (e.g. chrome-youtube.com__-Default) or window title
    if (urlHost.length >= 3) {
      var baseDomain = urlHost.split(".")[0]
      if (cls.indexOf(urlHostUnderscore) !== -1 || initCls.indexOf(urlHostUnderscore) !== -1) {
        score += 900
      } else if (isWebApp && baseDomain.length >= 3 && (cls.indexOf(baseDomain) !== -1 || initCls.indexOf(baseDomain) !== -1)) {
        score += 800
      } else if (baseDomain.length >= 3 && (title.indexOf(baseDomain) !== -1 || initTitle.indexOf(baseDomain) !== -1)) {
        score += 450
      }
    }

    // 3. Artist appears in window title
    if (trackArtist.length >= 2 && (title.indexOf(trackArtist) !== -1 || initTitle.indexOf(trackArtist) !== -1)) {
      score += 300
    }

    // 4. Web-app window for a known media service while a browser MPRIS player is active
    if (isBrowserPlayer && isWebApp) {
      for (var w = 0; w < webMediaKeywords.length; w++) {
        var kw = webMediaKeywords[w]
        if (cls.indexOf(kw) !== -1 || initCls.indexOf(kw) !== -1 || title.indexOf(kw) !== -1) {
          score += 500
          break
        }
      }
    }

    // 5. Direct PID match with MPRIS owner process
    if (mprisPid > 0 && pid === mprisPid) {
      score += 400
    }

    // 6. Native app or browser class / title match against desktopEntry, dbusName, or identity
    var tokens = [desktopEntry, dbusName, identity]
    for (var t = 0; t < tokens.length; t++) {
      var tok = tokens[t]
      if (!tok || tok.length < 2) continue
      if (cls === tok || initCls === tok) {
        score += 350
        break
      }
      if (cls.indexOf(tok) !== -1 || initCls.indexOf(tok) !== -1 || tok.indexOf(cls) !== -1 && cls.length >= 3) {
        score += 250
        break
      }
      if (cls === "org.omarchy.agent" && initTitle.indexOf(tok) !== -1) {
        score += 250
        break
      }
    }

    if (score > bestScore || (score > 0 && score === bestScore && focusId < bestFocusHistory)) {
      bestScore = score
      bestFocusHistory = focusId
      bestAddress = String(c.address)
    }
  }

  return bestAddress
}

if (typeof module !== "undefined") {
  module.exports = {
    singleLineText: singleLineText,
    neutralizeMarkup: neutralizeMarkup,
    isProxyPlayer: isProxyPlayer,
    isRadioAtlasPlayer: isRadioAtlasPlayer,
    parseRadioAtlasState: parseRadioAtlasState,
    isRadioAtlasActivelyPlaying: isRadioAtlasActivelyPlaying,
    cleanRadioTrackTitle: cleanRadioTrackTitle,
    playerKey: playerKey,
    playerAppToken: playerAppToken,
    hasPlayableLabel: hasPlayableLabel,
    selectPlayingPlayer: selectPlayingPlayer,
    formatSongLabel: formatSongLabel,
    formatTooltip: formatTooltip,
    createEqualizerState: createEqualizerState,
    stepEqualizer: stepEqualizer,
    extractUrlHost: extractUrlHost,
    matchPlayingWindow: matchPlayingWindow
  }
}
