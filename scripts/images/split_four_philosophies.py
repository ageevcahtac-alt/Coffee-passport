# Режет картинку «Один лот. Четыре философии» на фото колонок, карточку лота и горку зёрен
# и стирает вшитые буквы (текст теперь HTML, components/site/FourPhilosophies.tsx).
#
# python scripts/images/split_four_philosophies.py public/images/coffee-passport-four-philosophies.png public/images/four-philosophies
#
# Каждый кусок — прямоугольник исходника без масштабирования. Меняются только пиксели под буквами и
# значками: маска = пиксели в рамках строк (BOXES), которые отличаются от медианы окружения больше
# порога, плюс 2 px вокруг; заливка — cv2.inpaint (Telea) по соседям. Вне маски разница с исходником 0 —
# скрипт это проверяет и печатает отчёт (код выхода 1, если вне маски есть хоть один изменённый пиксель).
# Шапка и нижняя подпись лежат на фоне — их не режем, там только HTML.
import json
import sys
from pathlib import Path

import cv2
import numpy as np

# Куски: имя → (x0, y0, x1, y1) в координатах исходника 1672×941.
SLICES = {
    'barista': (0, 186, 353, 941),
    'roaster': (353, 186, 709, 941),
    'cafe': (963, 186, 1319, 941),
    'enthusiast': (1319, 186, 1672, 941),
    'lot-card': (680, 211, 990, 708),
    'beans': (630, 650, 1040, 780),
}

# Строки текста и значки: (x0, y0, x1, y1, светлые буквы на тёмном?)
LIGHT, DARK = True, False
ROWS = [721, 758, 796, 833, 870]


def column(text_boxes, icon_x, label_x, label_w):
    boxes = [(*b, LIGHT) for b in text_boxes]
    for i, c in enumerate(ROWS):
        boxes.append((icon_x[0], c - 15, icon_x[1], c + 15, LIGHT))
        boxes.append((label_x, c - 11, label_x + label_w[i], c + 11, LIGHT))
    return boxes


BOXES = (
    column([(40, 217, 168, 235), (40, 238, 184, 270), (40, 288, 228, 378)],
           (46, 82), 105, [130, 58, 95, 102, 103])
    + column([(392, 217, 520, 235), (392, 238, 627, 275), (392, 288, 560, 378)],
             (398, 431), 455, [96, 146, 156, 66, 176])
    + column([(1074, 217, 1202, 235), (1075, 236, 1234, 268), (1074, 288, 1262, 378)],
             (1066, 1102), 1118, [64, 90, 118, 117, 74])
    + column([(1365, 218, 1493, 236), (1365, 240, 1627, 308), (1365, 328, 1545, 420)],
             (1386, 1420), 1441, [108, 95, 90, 124, 110])
    + [
        (765, 237, 906, 250, DARK),   # COFFEE PASSPORT
        (780, 255, 891, 269, DARK),   # CANONICAL LOT
        (735, 291, 941, 323, DARK),   # ETHIOPIA GUJI
        (801, 324, 870, 338, DARK),   # LOT #001
        (893, 415, 951, 470, DARK),   # Q-SCORE 87.0
        (709, 466, 840, 609, DARK),   # подписи строк
        (821, 466, 878, 584, DARK),   # значения строк
        (720, 621, 952, 642, DARK),   # дескрипторы
    ]
)
THRESHOLD = 18
GROW = 2


def text_mask(gray):
    mask = np.zeros(gray.shape, np.uint8)
    for x0, y0, x1, y1, light in BOXES:
        pad = 20
        ax0, ay0 = max(x0 - pad, 0), max(y0 - pad, 0)
        ax1, ay1 = min(x1 + pad, gray.shape[1]), min(y1 + pad, gray.shape[0])
        area = gray[ay0:ay1, ax0:ax1]
        around = cv2.medianBlur(area, 31).astype(int)
        # на бумаге карточки буквы и тёмные, и золотые — берём отличие в обе стороны
        diff = area.astype(int) - around if light else np.abs(around - area.astype(int))
        hit = (diff > THRESHOLD).astype(np.uint8)
        inner = hit[y0 - ay0:y1 - ay0, x0 - ax0:x1 - ax0]
        mask[y0:y1, x0:x1] |= inner
    return cv2.dilate(mask, np.ones((2 * GROW + 1, 2 * GROW + 1), np.uint8))


def main(src, out_dir):
    source = cv2.imread(src, cv2.IMREAD_COLOR)
    if source is None or source.shape[:2] != (941, 1672):
        sys.exit(f'{src}: ожидается картинка 1672×941')
    mask = text_mask(cv2.cvtColor(source, cv2.COLOR_BGR2GRAY))
    cleaned = cv2.inpaint(source, mask * 255, 5, cv2.INPAINT_TELEA)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    report, bad = {}, 0
    for name, (x0, y0, x1, y1) in SLICES.items():
        piece = cleaned[y0:y1, x0:x1]
        cv2.imwrite(str(out / f'{name}.png'), piece, [cv2.IMWRITE_PNG_COMPRESSION, 9])
        written = cv2.imread(str(out / f'{name}.png'), cv2.IMREAD_COLOR)
        changed = (written != source[y0:y1, x0:x1]).any(axis=2)
        inside = mask[y0:y1, x0:x1].astype(bool)
        outside_changed = int((changed & ~inside).sum())
        bad += outside_changed
        report[name] = {
            'box': [x0, y0, x1, y1],
            'pixels': int(changed.size),
            'text_mask': int(inside.sum()),
            'changed_under_text': int((changed & inside).sum()),
            'changed_outside_text': outside_changed,
        }
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print(f'Вне маски букв изменено пикселей: {bad}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:3]))
