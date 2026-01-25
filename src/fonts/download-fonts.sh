#!/bin/bash
# Download Monaspace Neon and Literata variable fonts
# These fonts are used by the MRMD editor themes
#
# Licenses:
#   - Monaspace: SIL Open Font License 1.1 (https://github.com/githubnext/monaspace)
#   - Literata: SIL Open Font License 1.1 (https://fonts.google.com/specimen/Literata)

set -e

FONTS_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Downloading fonts to: $FONTS_DIR"

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# =============================================================================
# MONASPACE NEON
# =============================================================================
echo ""
echo "Downloading Monaspace Neon..."

MONASPACE_VERSION="v1.101"
curl -L -o "$TEMP_DIR/monaspace.zip" \
  "https://github.com/githubnext/monaspace/releases/download/${MONASPACE_VERSION}/monaspace-${MONASPACE_VERSION}.zip"

unzip -q "$TEMP_DIR/monaspace.zip" -d "$TEMP_DIR/monaspace"

# Find and copy the variable font
VARFONT=$(find "$TEMP_DIR/monaspace" -name "*NeonVarVF*.woff2" | head -1)
if [ -n "$VARFONT" ]; then
  cp "$VARFONT" "$FONTS_DIR/MonaspaceNeon-Variable.woff2"
  echo "  -> MonaspaceNeon-Variable.woff2"
else
  echo "  ERROR: Could not find Monaspace Neon variable font"
  exit 1
fi

# =============================================================================
# LITERATA
# =============================================================================
echo ""
echo "Downloading Literata..."

# From Google Fonts GitHub (reliable source for woff2)
LITERATA_BASE="https://github.com/nicholasrq/fontdata-ru/raw/main/fonts/google-fonts/ofl/literata"

curl -L -o "$FONTS_DIR/Literata-VariableFont.woff2" \
  "${LITERATA_BASE}/Literata%5Bopsz%2Cwght%5D.woff2"
echo "  -> Literata-VariableFont.woff2"

curl -L -o "$FONTS_DIR/Literata-Italic-VariableFont.woff2" \
  "${LITERATA_BASE}/Literata-Italic%5Bopsz%2Cwght%5D.woff2"
echo "  -> Literata-Italic-VariableFont.woff2"

# =============================================================================
# Done
# =============================================================================
echo ""
echo "Fonts downloaded successfully!"
echo ""
ls -lh "$FONTS_DIR"/*.woff2
