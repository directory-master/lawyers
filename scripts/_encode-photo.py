# Resize + re-encode one listing photo (called by fetch-images.mjs).
# PIL's optimized progressive JPEG is ~35% smaller than sips at the same look.
import sys
from PIL import Image, ImageOps
src, out, maxpx = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src)
im = ImageOps.exif_transpose(im).convert('RGB')
im.thumbnail((maxpx, maxpx))
im.save(out, 'JPEG', quality=62, optimize=True, progressive=True)
