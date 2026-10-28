import type { CSSProperties, ReactNode } from 'react';
import { Forum, Lora, Manrope } from 'next/font/google';
import styles from './FourPhilosophies.module.css';

// Блок «Один лот. Четыре философии» на главной. Раньше — одна картинка с вшитым текстом
// (public/images/coffee-passport-four-philosophies.png), теперь фото и карточка — куски этой картинки
// без букв (scripts/images/split_four_philosophies.py), а весь текст — HTML поверх них.
// Координаты в стилях — пиксели исходника 1672×941, масштаб считает CSS (FourPhilosophies.module.css).

// next/font — шрифты из сборки, отдаются с нашего домена (правило «данные только в России»).
// Подобраны по пропорциям букв исходной картинки (ширина строки к высоте прописной).
const display = Forum({ subsets: ['latin', 'cyrillic'], weight: ['400'], variable: '--fp-display', display: 'swap' });
const text = Lora({ subsets: ['latin', 'cyrillic'], weight: ['400'], variable: '--fp-text', display: 'swap' });
const caps = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600'],
  variable: '--fp-caps',
  display: 'swap',
});

const IMAGES = '/images/four-philosophies';
// Та же граница, что у ленты карточек в FourPhilosophies.module.css.
const MOBILE = '(max-width: 1023.98px)';

type Icon = (props: { className?: string }) => ReactNode;

function svg(children: ReactNode): Icon {
  function SvgIcon({ className }: { className?: string }) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={className}
      >
        {children}
      </svg>
    );
  }
  return SvgIcon;
}

const Cup = svg(
  <>
    <path d="M4 8h12v4.5A5.5 5.5 0 0 1 10.5 18h-1A5.5 5.5 0 0 1 4 12.5z" />
    <path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16" />
    <path d="M3 20.5h15" />
  </>,
);
const icons = {
  cup: Cup,
  dripper: svg(
    <>
      <path d="M3 4.5h18" />
      <path d="M4.5 7.5h15L14 15h-4z" />
      <path d="M9 19.5h6" />
      <path d="M12 15v4.5" />
    </>,
  ),
  drop: svg(<path d="M12 3.5c3 4 6 7.3 6 10.8a6 6 0 0 1-12 0c0-3.5 3-6.8 6-10.8z" />),
  thermometer: svg(
    <>
      <path d="M10 5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z" />
      <path d="M12 9v8" />
    </>,
  ),
  sliders: svg(
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <path d="M9 4v4M15 10v4M10 16v4" />
    </>,
  ),
  bean: svg(
    <>
      <ellipse cx="12" cy="12" rx="6" ry="9" transform="rotate(35 12 12)" />
      <path d="M16.5 5.5c-2.5 2-1.8 5-4 7s-4.2 2.5-5 6" />
    </>,
  ),
  flame: svg(
    <path d="M12 3c1 3.3 5.5 5.3 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.6 1.4-4.3 2.6-5.4.4 2 1.4 3.2 2.6 3.4-.6-3.2.2-6 .3-8.5zM12 20.5c-1.7 0-2.8-1.3-2.8-2.9 0-1.9 1.6-3 2.8-4.6 1.2 1.6 2.8 2.7 2.8 4.6 0 1.6-1.1 2.9-2.8 2.9z" />,
  ),
  gem: svg(
    <>
      <path d="M6.5 4.5h11l3.5 5-9 10.5L3 9.5z" />
      <path d="M3 9.5h18" />
      <path d="M9.5 4.5 8 9.5l4 10.5 4-10.5-1.5-5" />
    </>,
  ),
  score: svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 6.5a7 7 0 0 1 9 9" />
    </>,
  ),
  globe: svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5S9.6 5.9 12 3.5z" />
    </>,
  ),
  home: svg(
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M6 9v11h12V9" />
      <path d="M10 20v-5.5h4V20" />
    </>,
  ),
  people: svg(
    <>
      <circle cx="12" cy="7.5" r="2.5" />
      <circle cx="6" cy="9.5" r="2" />
      <circle cx="18" cy="9.5" r="2" />
      <path d="M8 18.5v-1.5a4 4 0 0 1 8 0v1.5z" />
      <path d="M2.5 18v-1a3.5 3.5 0 0 1 5-3.2M21.5 18v-1a3.5 3.5 0 0 0-5-3.2" />
    </>,
  ),
  gear: svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
      <circle cx="12" cy="12" r="6.5" />
    </>,
  ),
  compass: svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>,
  ),
  heart: svg(<path d="M12 19.5s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 6.8a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10.2-7.5 10.2z" />),
  bookmark: svg(<path d="M7 3.5h10v17l-5-4-5 4z" />),
  bars: svg(
    <>
      <rect x="4" y="15" width="3" height="5" rx=".5" />
      <rect x="10.5" y="11" width="3" height="9" rx=".5" />
      <rect x="17" y="6" width="3" height="14" rx=".5" />
    </>,
  ),
  map: svg(
    <>
      <path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </>,
  ),
  star: svg(<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />),
};

type Column = {
  id: string;
  image: string;
  // Колонка в исходнике: видимая часть (без полосы под карточкой лота) и сдвиг фото слева.
  left: number;
  width: number;
  photoShift: number;
  photoWidth: number;
  title: string[];
  lines: string[];
  // Отступы текста от левого края видимой части и по вертикали — пиксели исходника.
  x: number;
  iconX: number;
  labelX: number;
  titleY: number;
  linesY: number;
  items: [Icon, string][];
  itemsY: number;
  // Телефон: золотая линия к лоту — точка и отрезок линии внутри карточки 353 px шириной.
  dot: number;
  line: [number, number];
};

const PHOTO_TOP = 186;

const COLUMNS: Column[] = [
  {
    id: 'barista',
    image: 'barista.png',
    left: 0,
    width: 353,
    photoShift: 0,
    photoWidth: 353,
    title: ['БАРИСТА'],
    lines: ['Искусство', 'раскрыть потенциал', 'каждого кофе', 'в чашке.'],
    x: 44,
    iconX: 64,
    labelX: 109,
    titleY: 69,
    linesY: 113,
    items: [
      [icons.cup, 'ПРИГОТОВЛЕНИЕ'],
      [icons.dripper, 'РЕЦЕПТ'],
      [icons.drop, 'ЭКСТРАКЦИЯ'],
      [icons.thermometer, 'ТЕМПЕРАТУРА'],
      [icons.sliders, 'ДИСЦИПЛИНА'],
    ],
    itemsY: 535,
    dot: 236,
    line: [236, 353],
  },
  {
    id: 'roaster',
    image: 'roaster.png',
    left: 353,
    width: 328,
    photoShift: 0,
    photoWidth: 356,
    title: ['ОБЖАРЩИКА'],
    lines: ['Подчеркнуть', 'уникальность лота', 'и раскрыть его', 'характер.'],
    x: 43,
    iconX: 61,
    labelX: 106,
    titleY: 70,
    linesY: 113,
    items: [
      [icons.bean, 'ВЫБОР ЛОТА'],
      [icons.flame, 'ПРОФИЛЬ ОБЖАРКИ'],
      [icons.gem, 'КОНТРОЛЬ КАЧЕСТВА'],
      [icons.score, 'Q-SCORE'],
      [icons.globe, 'УНИКАЛЬНЫЙ ХАРАКТЕР'],
    ],
    itemsY: 535,
    dot: 236,
    line: [0, 353],
  },
  {
    id: 'cafe',
    image: 'cafe.png',
    left: 989,
    width: 330,
    photoShift: 26,
    photoWidth: 356,
    title: ['КОФЕЙНИ'],
    lines: ['Создать пространство,', 'где хороший кофе', 'становится', 'открытием.'],
    x: 89,
    iconX: 95,
    labelX: 133,
    titleY: 65,
    linesY: 113,
    items: [
      [icons.home, 'ПОДАЧА'],
      [icons.people, 'АТМОСФЕРА'],
      [Cup, 'КАЧЕСТВО ВОДЫ'],
      [icons.gear, 'ОБОРУДОВАНИЕ'],
      [icons.compass, 'КОМАНДА'],
    ],
    itemsY: 535,
    dot: 111,
    line: [0, 353],
  },
  {
    id: 'enthusiast',
    image: 'enthusiast.png',
    left: 1319,
    width: 353,
    photoShift: 0,
    photoWidth: 353,
    title: ['КОФЕЙНОГО', 'ЭНТУЗИАСТА'],
    lines: ['Пробовать.', 'Запоминать.', 'Понимать.', 'Открывать свой вкус.'],
    x: 50,
    iconX: 84,
    labelX: 126,
    titleY: 70,
    linesY: 154,
    items: [
      [icons.heart, 'ЛИЧНЫЙ ОПЫТ'],
      [icons.bookmark, 'СОХРАНЕНИЕ'],
      [icons.bars, 'СРАВНЕНИЕ'],
      [icons.map, 'РАЗВИТИЕ ВКУСА'],
      [icons.star, 'СВОЯ ИСТОРИЯ'],
    ],
    itemsY: 537,
    dot: 111,
    line: [0, 111],
  },
];

const LOT_ROWS: [string, string][] = [
  ['СТРАНА', 'Ethiopia'],
  ['РЕГИОН', 'Guji'],
  ['УРОЖАЙ', '2026'],
  ['ОБРАБОТКА', 'Washed'],
  ['ПРОФИЛЬ ОБЖАРКИ', 'Pure Roast'],
];
const DESCRIPTORS: [string, number][] = [
  ['Peach', 59],
  ['Jasmine', 124],
  ['Citrus', 189],
  ['Honey', 251],
];

type Vars = CSSProperties & Record<`--${string}`, number | string>;

function PhilosophyColumn({ column }: { column: Column }) {
  const style: Vars = {
    '--left': column.left,
    '--w': column.width,
    '--photo-shift': column.photoShift,
    '--photo-w': column.photoWidth,
    '--x': column.x,
    '--icon-x': column.iconX,
    '--label-x': column.labelX,
    '--title-y': column.titleY,
    '--lines-y': column.linesY,
    '--items-y': column.itemsY,
    '--dot': column.dot,
    '--line-from': column.line[0],
    '--line-to': column.line[1],
  };
  return (
    <article className={styles.column} style={style} aria-labelledby={`fp-${column.id}`}>
      {/* Фото — фон под текстом, смысловой подписи у него нет. На телефоне — копия без вшитой золотой линии:
          у растянутых фото она сползла бы, линию рисует CSS на одной высоте через всю ленту. */}
      <picture>
        <source media={MOBILE} srcSet={`${IMAGES}/${column.image.replace('.png', '-m.png')}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.photo} src={`${IMAGES}/${column.image}`} alt="" width={column.photoWidth} height={755} />
      </picture>
      <h3 className={styles.columnTitle} id={`fp-${column.id}`}>
        <span className={styles.eyebrow}>ФИЛОСОФИЯ</span>
        {column.title.map((line) => (
          <span key={line} className={styles.titleLine}>
            {line}
          </span>
        ))}
      </h3>
      <p className={styles.lines}>
        {column.lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
      <ul className={styles.items}>
        {column.items.map(([ItemIcon, label]) => (
          <li key={label}>
            <ItemIcon className={styles.icon} />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function LotCard() {
  return (
    <div className={styles.lot}>
      <div className={styles.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.cardImage}
          src={`${IMAGES}/lot-card.png`}
          alt="Гравюра: горы и деревья региона Гуджи"
          width={310}
          height={497}
        />
        <p className={styles.cardBrand}>COFFEE PASSPORT</p>
        <p className={styles.cardKind}>CANONICAL LOT</p>
        <p className={styles.cardName}>ETHIOPIA GUJI</p>
        <p className={styles.cardNumber}>LOT #001</p>
        <p className={styles.score}>
          <span className={styles.scoreLabel}>Q-SCORE</span>
          <span className={styles.scoreValue}>87.0</span>
        </p>
        <dl className={styles.facts}>
          {LOT_ROWS.map(([label, value], i) => (
            <div key={label} style={{ '--row': i } as Vars}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.descriptorsLabel}>ВКУСОВЫЕ ДЕСКРИПТОРЫ</p>
        <ul className={styles.descriptors}>
          {DESCRIPTORS.map(([word, x]) => (
            <li key={word} style={{ '--cx': x } as Vars}>
              {word}
            </li>
          ))}
        </ul>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.beans} src={`${IMAGES}/beans.png`} alt="" width={410} height={130} />
      <div className={styles.canonical}>
        <span className={styles.canonicalRule} aria-hidden="true" />
        <h3 className={styles.canonicalTitle}>КАНОНИЧЕСКИЙ ЛОТ</h3>
        <p className={styles.canonicalText}>
          <span>Один и тот же кофе,</span>
          <span>который раскрывается по-разному</span>
          <span>в руках разных людей.</span>
        </p>
      </div>
    </div>
  );
}

export function FourPhilosophies() {
  const [first, second, third, fourth] = COLUMNS;
  return (
    <section
      className={`${styles.root} ${display.variable} ${text.variable} ${caps.variable}`}
      data-four-philosophies=""
      aria-labelledby="fp-title"
      style={{ '--photo-top': PHOTO_TOP } as Vars}
    >
      <header className={styles.header}>
        <p className={styles.brand}>COFFEE PASSPORT</p>
        <h2 className={styles.title} id="fp-title">
          ОДИН LOT. ЧЕТЫРЕ ФИЛОСОФИИ.
        </h2>
        <p className={styles.subtitle}>ОДИН КОФЕ. РАЗНЫЕ ЛЮДИ. РАЗНЫЕ ПОДХОДЫ. РАЗНЫЙ ОПЫТ.</p>
        <p className={`${styles.aside} ${styles.asideLeft}`}>
          <span>БОЛЬШЕ</span>
          <span>ЧЕМ ЧАШКА</span>
          <span>КОФЕ</span>
        </p>
        <p className={`${styles.aside} ${styles.asideRight}`}>
          <span>ЛИЧНАЯ</span>
          <span>ИСТОРИЯ</span>
          <span>ВКУСА</span>
        </p>
      </header>
      {/* На телефоне — лента карточек с прокруткой вбок; tabIndex — чтобы листать с клавиатуры. */}
      <div className={styles.strip} role="region" aria-label="Четыре философии и канонический лот" tabIndex={0}>
        <PhilosophyColumn column={first} />
        <PhilosophyColumn column={second} />
        <div className={styles.lotFrame}>
          <LotCard />
        </div>
        <PhilosophyColumn column={third} />
        <PhilosophyColumn column={fourth} />
      </div>
    </section>
  );
}
