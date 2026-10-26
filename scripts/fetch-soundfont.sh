#!/bin/sh
# Downloads the default SoundFont (MIT, see NOTICE). It is too large for git.
set -eu
dir="$(dirname "$0")/../public/soundfonts"
base="https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General"
mkdir -p "$dir"
curl -fL --progress-bar -o "$dir/MuseScore_General.sf3" "$base/MuseScore_General.sf3"
curl -fsSL -o "$dir/MuseScore_General_License.md" "$base/MuseScore_General_License.md"
