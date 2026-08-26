"""Generates icons/icon16.png, icon48.png, icon128.png using only stdlib."""
import struct, zlib, os

def make_png(size, bg=(79, 142, 247), fg=(255, 255, 255)):
    """Create a simple solid-color square PNG with a white letter P."""
    pixels = [[list(bg)] * size for _ in range(size)]

    # Draw a minimal letter "P" scaled to the icon size
    scale = max(1, size // 16)
    ox = size // 4          # left margin
    oy = size // 6          # top margin
    h  = int(size * 0.7)    # glyph height
    w  = int(size * 0.22)   # stem width
    bh = int(h * 0.48)      # bowl height
    bw = int(size * 0.35)   # bowl width

    def dot(x, y):
        for dy in range(scale):
            for dx in range(scale):
                rx, ry = x + dx, y + dy
                if 0 <= rx < size and 0 <= ry < size:
                    pixels[ry][rx] = list(fg)

    # Stem (vertical bar)
    for row in range(h):
        for col in range(w):
            dot(ox + col, oy + row)

    # Bowl (top half rounded cap) — draw filled rectangle + top rounded rows
    for row in range(bh):
        span = bw
        if row < scale:
            span = bw - scale          # slight indent at very top
        for col in range(w, w + span):
            dot(ox + col, oy + row)

    raw = b""
    for row in pixels:
        raw += b"\x00"
        for px in row:
            raw += bytes(px)

    def chunk(tag, data):
        c = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", c)

    sig  = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(raw, 9))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


os.makedirs("icons", exist_ok=True)
for size in (16, 48, 128):
    path = f"icons/icon{size}.png"
    with open(path, "wb") as f:
        f.write(make_png(size))
    print(f"Created {path}  ({size}x{size})")
