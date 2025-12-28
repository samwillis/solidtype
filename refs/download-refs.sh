#!/bin/bash
#
# Download and extract reference CAD kernel source code for study.
#
# Usage:
#   ./download-refs.sh          # Download all references
#   ./download-refs.sh occt     # Download only OCCT
#   ./download-refs.sh cgal     # Download only CGAL
#   ./download-refs.sh freecad  # Download only FreeCAD toponaming branch
#   ./download-refs.sh fornjot  # Download only Fornjot
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Version/commit configuration
OCCT_VERSION="V7_8_1"
CGAL_VERSION="v5.6.1"
FREECAD_COMMIT="LinkStage3"  # realthunder's toponaming branch
FORNJOT_VERSION="main"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

download_and_extract() {
    local name="$1"
    local url="$2"
    local extract_dir="$3"
    local archive_name="$4"
    
    if [ -d "$extract_dir" ]; then
        log_warn "$name already exists at $extract_dir - skipping (delete to re-download)"
        return 0
    fi
    
    log_info "Downloading $name..."
    
    if ! curl -L --fail --progress-bar -o "$archive_name" "$url"; then
        log_error "Failed to download $name from $url"
        return 1
    fi
    
    log_info "Extracting $name..."
    
    mkdir -p "$extract_dir"
    
    if [[ "$archive_name" == *.tar.gz ]] || [[ "$archive_name" == *.tgz ]]; then
        tar -xzf "$archive_name" --strip-components=1 -C "$extract_dir"
    elif [[ "$archive_name" == *.zip ]]; then
        # For zip files, we need a different approach
        local temp_dir=$(mktemp -d)
        unzip -q "$archive_name" -d "$temp_dir"
        # Move contents from the extracted folder (usually named after repo-branch)
        mv "$temp_dir"/*/* "$extract_dir"/ 2>/dev/null || mv "$temp_dir"/*/* "$extract_dir"/ 2>/dev/null || true
        rm -rf "$temp_dir"
    fi
    
    rm -f "$archive_name"
    
    log_info "$name extracted to $extract_dir"
}

download_occt() {
    log_info "=== Open CASCADE Technology (OCCT) ==="
    download_and_extract \
        "OCCT $OCCT_VERSION" \
        "https://github.com/Open-Cascade-SAS/OCCT/archive/refs/tags/${OCCT_VERSION}.tar.gz" \
        "occt" \
        "occt.tar.gz"
}

download_cgal() {
    log_info "=== CGAL ==="
    download_and_extract \
        "CGAL $CGAL_VERSION" \
        "https://github.com/CGAL/cgal/archive/refs/tags/${CGAL_VERSION}.tar.gz" \
        "cgal" \
        "cgal.tar.gz"
}

download_freecad() {
    log_info "=== FreeCAD (realthunder's Toponaming Branch) ==="
    download_and_extract \
        "FreeCAD $FREECAD_COMMIT" \
        "https://github.com/realthunder/FreeCAD/archive/refs/heads/${FREECAD_COMMIT}.tar.gz" \
        "freecad" \
        "freecad.tar.gz"
}

download_fornjot() {
    log_info "=== Fornjot ==="
    download_and_extract \
        "Fornjot $FORNJOT_VERSION" \
        "https://github.com/hannobraun/fornjot/archive/refs/heads/${FORNJOT_VERSION}.tar.gz" \
        "fornjot" \
        "fornjot.tar.gz"
}

show_help() {
    echo "Download reference CAD kernel source code"
    echo ""
    echo "Usage: $0 [reference]"
    echo ""
    echo "References:"
    echo "  occt      Open CASCADE Technology - production B-Rep kernel"
    echo "  cgal      CGAL - robust geometry algorithms (especially Arrangement_2)"
    echo "  freecad   FreeCAD toponaming branch - persistent naming implementation"
    echo "  fornjot   Fornjot - modern Rust B-Rep kernel"
    echo "  all       Download all references (default)"
    echo ""
    echo "Examples:"
    echo "  $0           # Download all"
    echo "  $0 occt      # Download only OCCT"
    echo "  $0 cgal      # Download only CGAL"
}

main() {
    local target="${1:-all}"
    
    case "$target" in
        occt)
            download_occt
            ;;
        cgal)
            download_cgal
            ;;
        freecad)
            download_freecad
            ;;
        fornjot)
            download_fornjot
            ;;
        all)
            download_occt
            download_cgal
            download_freecad
            download_fornjot
            echo ""
            log_info "=== All references downloaded ==="
            echo ""
            echo "Key directories:"
            echo "  occt/src/BOPAlgo/              - Boolean algorithms"
            echo "  occt/src/IntTools/             - Intersection algorithms"
            echo "  cgal/Arrangement_on_surface_2/ - DCEL / planar arrangements"
            echo "  freecad/src/Mod/Part/App/      - Toponaming implementation"
            echo "  fornjot/crates/fj-core/        - Core kernel modules"
            echo ""
            echo "See README.md for detailed guidance on what to study."
            ;;
        -h|--help|help)
            show_help
            ;;
        *)
            log_error "Unknown reference: $target"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
