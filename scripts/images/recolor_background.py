# Перекраска фона картинки в цвет фона сайта по маске фона с мягким краем.
# Разовый инструмент (не часть сборки): pip install pillow numpy scipy
# python scripts/images/recolor_background.py public/images/coffee-passport-four-philosophies-orig.png public/images/coffee-passport-four-philosophies.png <mask.png>
# Результат — RGB PNG без sRGB/iCCP/gAMA; вне маски пиксели совпадают с оригиналом байт в байт.
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

TARGET = np.array([245, 242, 235], float)  # --color-parchment-200 (#f5f2eb)
TOL = 8           # отклонение от бумаги, при котором пиксель — чистый фон (фон гладкий, σ≈0.7)
HOLE_MAX = 40000  # дыры в маске меньше этого — буквы, строки текста и значки внутри фона
FRINGE = 8        # мягкий край: вес сдвига плавно спадает до 0 на этом расстоянии от фона, px
L_INK = 20.0

src, out, mask_out = sys.argv[1:4]
im = Image.open(src)
a = np.asarray(im.convert('RGB')).astype(float)
H, W, _ = a.shape
L = a @ [0.2126, 0.7152, 0.0722]

ref = np.median(a[0:150].reshape(-1, 3)[(L[0:150].reshape(-1) > 200)], axis=0)
near = np.abs(a - ref).max(2) <= TOL
# мостики в 1–2 px (светлые места золотой рамки карточки) не соединяют фон с карточкой
seed = ndi.binary_erosion(near, iterations=2, border_value=1)
lab, _ = ndi.label(seed)
border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
core = near & ndi.binary_dilation(np.isin(lab, border[border > 0]), iterations=2)

holes = ndi.binary_fill_holes(core) & ~core
hl, n = ndi.label(holes)
sizes = ndi.sum(holes, hl, range(1, n + 1))
small = np.isin(hl, 1 + np.flatnonzero(sizes < HOLE_MAX))
print('holes: filled', sorted(int(x) for x in sizes[sizes < HOLE_MAX])[-5:], 'kept', sorted(int(x) for x in sizes[sizes >= HOLE_MAX]))
base = core | small
d = ndi.distance_transform_edt(~base)
x = np.clip(1 - d / FRINGE, 0, 1)
weight = x * x * (3 - 2 * x)  # smoothstep
region = weight > 0

# локальный цвет бумаги — по чистым пикселям фона
w = ndi.gaussian_filter(core.astype(float), 15)
bg = np.stack([ndi.gaussian_filter(a[..., c] * core, 15) for c in range(3)], 2) / np.maximum(w, 1e-6)[..., None]
bg[w < 1e-3] = ref
Lbg = bg @ [0.2126, 0.7152, 0.0722]

t = np.clip((L - L_INK) / np.maximum(Lbg - L_INK, 1), 0, 1)
t[core] = 1.0
t *= weight

# пиксель = t·бумага + (1−t)·краска → бумагу меняем на цвет сайта, краску и фактуру не трогаем
new = a + t[..., None] * (TARGET - bg)
res = np.clip(np.rint(new), 0, 255).astype(np.uint8)

Image.fromarray(res, 'RGB').save(out, optimize=True)  # без sRGB/iCCP/gAMA
Image.fromarray((region * 255).astype(np.uint8)).save(mask_out)

o = a.astype(np.uint8)
print('ref paper', ref, 'core px', int(core.sum()), 'region px', int(region.sum()), f'({region.mean()*100:.1f}%)')
print('outside mask: changed px =', int((res != o).any(2)[~region].sum()), 'max |diff| =', int(np.abs(res.astype(int) - o)[~region].max()))
inside_text = region & ~core & (t < 1e-9)
print('text/photo cores inside soft edge (t=0): changed px =', int((res != o).any(2)[inside_text].sum()))
