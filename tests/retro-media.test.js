const assert = require("node:assert/strict")
const Model = require("../RetroMediaModel.js")

// 1. Markup neutralization regression tests for shared tooltip sink
{
  const maliciousTitle = '<img src="https://example.invalid/tracker"><script>alert(1)</script>Song\nTitle'
  const maliciousArtist = '<b>Artist</b>\t<a href="http://evil">Link</a>'
  const player = {
    isPlaying: true,
    trackTitle: maliciousTitle,
    trackArtist: maliciousArtist,
    identity: "<Player>"
  }

  const tooltip = Model.formatTooltip(player, "Click to open <Player>")
  assert.equal(tooltip.includes("<"), false, "Tooltip must not contain raw '<'")
  assert.equal(tooltip.includes(">"), false, "Tooltip must not contain raw '>'")
  assert.equal(tooltip.includes("‹img"), true, "Angle brackets should be neutralized to single guillemets")
}

// 2. Disappears when nothing is playing
{
  assert.equal(Model.selectPlayingPlayer([], {}), null)
  assert.equal(
    Model.selectPlayingPlayer([
      { isPlaying: false, trackTitle: "Paused Song", identity: "Spotify" },
      { isPlaying: false, trackTitle: "Another Paused", identity: "Firefox" }
    ], {}),
    null,
    "Should return null when all players are paused/stopped"
  )

  const active = Model.selectPlayingPlayer([
    { isPlaying: false, trackTitle: "Paused Song", identity: "Spotify" },
    { isPlaying: true, trackTitle: "Around the World", trackArtist: "Daft Punk", identity: "Mozilla Firefox", dbusName: "org.mpris.MediaPlayer2.firefox" }
  ], {})
  assert.ok(active)
  assert.equal(active.trackTitle, "Around the World")
  assert.equal(Model.formatSongLabel(active, false), "Around the World")
  assert.equal(Model.formatSongLabel(active, true), "Around the World · Daft Punk")
}

// 3. Equalizer stepping & peak-hold behavior
{
  let eq = Model.createEqualizerState(5, 7)
  assert.equal(eq.levels.length, 5)
  assert.equal(eq.peaks.length, 5)
  for (let i = 0; i < 20; i++) {
    eq = Model.stepEqualizer(eq)
    for (let c = 0; c < 5; c++) {
      assert.ok(eq.levels[c] >= 1 && eq.levels[c] <= 7, "Level stays within 1..7")
      assert.ok(eq.peaks[c] >= eq.levels[c] && eq.peaks[c] <= 7, "Peak hold stays >= level and <= 7")
    }
  }
}

// 4. Window matching for apps, web-apps, and browser tabs
{
  const clients = [
    {
      address: "0x1111",
      class: "firefox",
      initialClass: "firefox",
      title: "Docs — Mozilla Firefox",
      initialTitle: "Mozilla Firefox",
      pid: 1001,
      focusHistoryID: 1
    },
    {
      address: "0x2222",
      class: "chrome-youtube.com__-Default",
      initialClass: "chrome-youtube.com__-Default",
      title: "Synthwave 90s Mix - YouTube",
      initialTitle: "YouTube",
      pid: 2002,
      focusHistoryID: 3
    },
    {
      address: "0x3333",
      class: "spotify",
      initialClass: "Spotify",
      title: "Spotify Premium",
      initialTitle: "Spotify",
      pid: 3003,
      focusHistoryID: 2
    }
  ]

  // Matches YouTube web-app by song title
  assert.equal(
    Model.matchPlayingWindow(clients, {
      dbusName: "org.mpris.MediaPlayer2.chromium.instance2002",
      desktopEntry: "chromium",
      identity: "Chromium",
      trackTitle: "Synthwave 90s Mix",
      trackArtist: "RetroChannel",
      trackUrl: "https://www.youtube.com/watch?v=12345"
    }),
    "0x2222"
  )

  // Matches YouTube web-app by URL host even when window title is generic
  const genericWebAppClients = [
    clients[0],
    {
      address: "0x2222",
      class: "chrome-youtube.com__-Default",
      initialClass: "chrome-youtube.com__-Default",
      title: "YouTube",
      initialTitle: "YouTube",
      pid: 2002,
      focusHistoryID: 4
    }
  ]
  assert.equal(
    Model.matchPlayingWindow(genericWebAppClients, {
      dbusName: "org.mpris.MediaPlayer2.chromium.instance2002",
      desktopEntry: "chromium",
      identity: "Chromium",
      trackTitle: "Unlisted Track",
      trackUrl: "https://www.youtube.com/watch?v=abc"
    }),
    "0x2222"
  )

  // Matches native Spotify window by desktopEntry / class
  assert.equal(
    Model.matchPlayingWindow(clients, {
      dbusName: "org.mpris.MediaPlayer2.spotify",
      desktopEntry: "spotify",
      identity: "Spotify",
      trackTitle: "Some Song"
    }),
    "0x3333"
  )
}

// 5. Radio Atlas (akshar.radio-atlas) integration & markup safety
{
  const rawState = JSON.stringify({
    running: true,
    paused: false,
    stopped: false,
    muted: false,
    volume: 44,
    title: "Radio Armisa - Romantici Vagabondi - Vino amaro",
    station: {
      uuid: "83dcfac4-b3c3-4731-afc1-a80dd271dffa",
      name: "Radio Armisa",
      country: "Italy",
      countryCode: "IT"
    },
    error: ""
  })
  const radioState = Model.parseRadioAtlasState(rawState)
  assert.ok(radioState)
  assert.equal(Model.isRadioAtlasActivelyPlaying(radioState), true)
  assert.equal(radioState.stationName, "Radio Armisa")

  const radioPlayer = {
    isPlaying: true,
    dbusName: "org.mpris.MediaPlayer2.mpv.radio_atlas.instance176066",
    identity: "Radio Atlas",
    desktopEntry: "",
    trackTitle: "Radio Armisa - Romantici Vagabondi - Vino amaro",
    trackArtist: ""
  }

  assert.equal(Model.isRadioAtlasPlayer(radioPlayer), true)
  // Strips redundant leading station prefix
  assert.equal(Model.formatSongLabel(radioPlayer, false, radioState), "Romantici Vagabondi - Vino amaro")
  // Uses station name when showArtist is enabled and MPRIS trackArtist is empty
  assert.equal(Model.formatSongLabel(radioPlayer, true, radioState), "Romantici Vagabondi - Vino amaro · Radio Armisa")

  // Falls back to station name when stream has no ICY song title
  const stationOnlyPlayer = {
    ...radioPlayer,
    trackTitle: ""
  }
  const stationOnlyState = Model.parseRadioAtlasState(JSON.stringify({
    running: true,
    paused: false,
    stopped: false,
    title: "",
    station: { name: "Listen.Moe JPop Vorbis", country: "Japan", countryCode: "JP" }
  }))
  assert.equal(Model.formatSongLabel(stationOnlyPlayer, false, stationOnlyState), "Listen.Moe JPop Vorbis")

  // Radio Atlas is not penalized against another playing player with trackArtist when started more recently
  const spotifyPlaying = {
    isPlaying: true,
    dbusName: "org.mpris.MediaPlayer2.spotify",
    identity: "Spotify",
    desktopEntry: "spotify",
    trackTitle: "Old Song",
    trackArtist: "Some Artist"
  }
  const selected = Model.selectPlayingPlayer(
    [spotifyPlaying, radioPlayer],
    {
      "org.mpris.MediaPlayer2.spotify": 1,
      "org.mpris.MediaPlayer2.mpv.radio_atlas.instance176066": 2
    },
    radioState
  )
  assert.equal(selected, radioPlayer, "Most recently started player (Radio Atlas) should win")

  // Tooltip includes station & country and neutralizes any markup from untrusted stream titles
  const maliciousRadioState = Model.parseRadioAtlasState(JSON.stringify({
    running: true,
    paused: false,
    stopped: false,
    title: "<img src=x>Track",
    station: { name: "<b>Station</b>", country: "<Italy>", countryCode: "IT" }
  }))
  const tip = Model.formatTooltip({ ...radioPlayer, trackTitle: "<img src=x>Track" }, "Click to open <Radio Atlas>", maliciousRadioState)
  assert.equal(tip.includes("<"), false)
  assert.equal(tip.includes(">"), false)
  assert.equal(tip.includes("‹b›Station‹/b› (‹Italy›)"), true)
}

console.log("All retro-media tests passed.")
