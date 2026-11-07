# Retro 90s Media (`memo.retro-media`)

An Omarchy bar widget that displays the currently playing song with a Pac-Man wrap-around overflow effect and an animated retro 90s segmented LED equalizer next to it. Automatically hides when nothing is playing.

## Features

- **Pac-Man Wrap-Around Marquee**: When a track title exceeds the configured width, it scrolls seamlessly with an animated chomping Pac-Man and power pellets in the wrap-around tunnel.
- **Retro 90s Segmented LED Equalizer**: 5-column, 7-segment LED spectrum analyzer with peak-hold caps (`retro90s` green/yellow/red phosphor colors or `theme` colors).
- **Smart Window Focus**: Left-clicking focuses the currently playing native app, web app, browser tab, or Radio Atlas window on Hyprland.
- **Quick Media Controls**:
  - **Left click**: Focus the playing app or window
  - **Right click**: Toggle play/pause
  - **Middle click**: Next track
  - **Scroll wheel up / down**: Previous / next track

## Install

Install directly from GitHub on any Omarchy machine:

```sh
omarchy plugin add https://github.com/memo-gh/retro_media_player.git --enable
```

To move the widget to a specific bar section (`left`, `centerBegin`, `center`, `centerEnd`, `tray`, or `right`):

```sh
omarchy bar move memo.retro-media --section centerBegin
```

## Settings

Configure settings in `~/.config/omarchy/shell.json` or through the Omarchy bar settings UI:

| Key | Type | Default | Description |
|---|---|---|---|
| `maxLabelWidth` | `integer` | `150` | Max song title width (`60`–`360` px) before Pac-Man overflow |
| `showArtist` | `boolean` | `false` | Show artist name next to the song title |
| `showPacmanChomp` | `boolean` | `true` | Show chomping Pac-Man in the overflow wrap-around gap |
| `colorMode` | `string` | `"retro90s"` | Equalizer color mode (`"retro90s"` or `"theme"`) |

## Update

```sh
omarchy plugin update memo.retro-media
```

## Remove

```sh
omarchy plugin remove memo.retro-media
```

## Validate & Test

```sh
omarchy plugin validate .
node --test tests/retro-media.test.js
```
