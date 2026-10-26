#!/bin/sh
# Downloads the SoundFonts (see NOTICE). They are too large for git.
set -eu
dir="$(dirname "$0")/../public/soundfonts"
mkdir -p "$dir"

# Default bank: MuseScore_General (MIT).
musescore="https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General"
curl -fL --progress-bar -o "$dir/MuseScore_General.sf3" "$musescore/MuseScore_General.sf3"
curl -fsSL -o "$dir/MuseScore_General_License.md" "$musescore/MuseScore_General_License.md"

# Alternative bank: A320U by Milton Paredes (GNU GPL v2), from the Denemo project.
# Pinned to one Denemo commit so every build gets the same file.
denemo="https://raw.githubusercontent.com/denemo/denemo/276d17350e3a625dd4df19ecb7ff7421c070290d/soundfonts"
curl -fL --progress-bar -o "$dir/A320U.sf2" "$denemo/A320U.sf2"
