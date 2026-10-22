#!/usr/bin/env python3
"""Generate Zut brand assets from the hand-made mark (Zut.png).

Pure stdlib: decode the source PNG, recolor (black -> white keeping the
anti-aliased alpha), compose the PWA icons (indigo-dark rounded tile), and
re-encode. Run from the repo root after updating `public/zut-mark.png`.

    python3 scripts/make-icons.py
"""
import struct
import sys
import zlib

SRC = 'public/zut-mark.png'
OUT_WHITE = 'public/zut-mark-white.png'
OUT_ICON_512 = 'public/icons/icon-512.png'
OUT_ICON_192 = 'public/icons/icon-192.png'
TILE = (0x14, 0x14, 0x16)

def read_png(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', 'not a PNG'
    pos, idat = 8, b''
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos+4])[0]
        typ = d[pos+4:pos+8]
        if typ == b'IHDR':
            w, h, bit, ctype = struct.unpack('>IIBB', d[pos+8:pos+18])
            assert bit == 8 and ctype == 6, 'need RGBA8'
        elif typ == b'IDAT':
            idat += d[pos+8:pos+8+ln]
        pos += 12 + ln
    raw = zlib.decompress(idat)
    bpp = 4
    stride = w*bpp + 1
    rows, prev = [], bytearray(w*bpp)
    for i in range(h):
        f = raw[i*stride]
        line = bytearray(raw[i*stride+1:(i+1)*stride])
        if f == 1:
            for j in range(bpp, len(line)):
                line[j] = (line[j] + line[j-bpp]) & 255
        elif f == 2:
            for j in range(len(line)):
                line[j] = (line[j] + prev[j]) & 255
        elif f == 3:
            for j in range(len(line)):
                a = line[j-bpp] if j >= bpp else 0
                line[j] = (line[j] + ((a + prev[j]) >> 1)) & 255
        elif f == 4:
            for j in range(len(line)):
                a = line[j-bpp] if j >= bpp else 0
                b, c = prev[j], (prev[j-bpp] if j >= bpp else 0)
                p = a + b - c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                paeth = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[j] = (line[j] + paeth) & 255
        prev = line
        rows.append(bytes(line))
    return w, h, rows

def write_png(path, w, h, flat, color=TILE):
    def chunk(typ, data):
        c = struct.pack('>I', len(data)) + typ + data
        return c + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    body = b''.join(b'\x00' + bytes(flat[y*w*4:(y+1)*w*4]) for y in range(h))
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', zlib.compress(body, 9)))
        f.write(chunk(b'IEND', b''))

def recolor(rows, w, h, rgb):
    out = bytearray(w*h*4)
    for y in range(h):
        for x in range(w):
            o = (y*w+x)*4
            a = rows[y][x*4+3]
            out[o:o+3] = bytes(rgb)
            out[o+3] = a
    return out

def scale(nearest, w, h, nw, nh):
    out = bytearray(nw*nh*4)
    for y in range(nh):
        sy = min(int(y*h/nh), h-1)
        for x in range(nw):
            sx = min(int(x*w/nw), w-1)
            so, s = (y*nw+x)*4, (sy*w+sx)*4
            out[so:so+4] = nearest[s:s+4]
    return out

def compose_tile(mark, mw, mh, tw, tr):
    """Tile with rounded corners + centered mark (padding 18%)."""
    pad = int(tw*0.18)
    sw = tw - 2*pad
    sh = round(sw*mh/mw)
    sm = scale(mark, mw, mh, sw, sh)
    x0, y0 = pad, (tw - sh)//2
    out = bytearray()
    for y in range(tw):
        row = bytearray()
        for x in range(tw):
            dx, dy = min(x, tw-1-x), min(y, tw-1-y)
            cx = min(max(x, tr), tw-1-tr)
            cy = min(max(y, tr), tw-1-tr)
            ink = 0 <= x-x0 < sw and 0 <= y-y0 < sh
            si = ((y-y0)*sw + (x-x0))*4 if ink else None
            if (x-cx)**2 + (y-cy)**2 <= tr*tr:
                if ink and sm[si+3] > 0:
                    a = sm[si+3]/255.0
                    for c in range(3):
                        row += bytes((round(sm[si+c]*a + TILE[c]*(1-a)),))
                    row += bytes((255,))
                else:
                    row += bytes(TILE) + bytes((255,))
            else:
                row += b'\x00\x00\x00\x00'
        out += row
    return out, tw

def main():
    w, h, rows = read_png(SRC)
    white = (255, 255, 255)
    flat_white = recolor(rows, w, h, white)
    write_png(OUT_WHITE, w, h, flat_white)

    for size, path in ((512, OUT_ICON_512), (192, OUT_ICON_192)):
        r = round(size*112/512)  # match the manifest's rounded-corner ratio
        tile, n = compose_tile(flat_white, w, h, size, r)
        write_png(path, size, size, tile)
    print('wrote', OUT_WHITE, OUT_ICON_512, OUT_ICON_192)

if __name__ == '__main__':
    sys.exit(main())
