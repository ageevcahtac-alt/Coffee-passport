import type { Lot } from '@/lib/types/coffee';

// LOT-XO-ETH-001 is the primary demo lot — the one the demo QR resolves to.
// A couple of extra lots exist so the shop/brew/tasting flow can be tested
// against more than one coffee.
export const LOTS: Lot[] = [
  {
    id: 'LOT-XO-ETH-001',
    roasterId: 'roaster-xo',
    name: 'Ethiopia Guji',
    country: 'Ethiopia',
    region: 'Guji',
    process: 'Washed',
    cropYear: '2025/2026',
    qGrade: 87.0,
    roastProfile: 'Pure Roast®',
    roastType: 'filter',
    descriptors: ['Peach', 'Jasmine', 'Citrus', 'Honey'],
    roasterFlavorProfile: {
      acidity: 4,
      sweetness: 5,
      body: 3,
      bitterness: 1,
    },
    producer: {
      farmerName: 'Kochere Cooperative',
      farmName: 'Guji Hambela Washing Station',
      altitude: '1900–2100 м',
      story:
        'Кооператив из зоны Гуджи собирает вишню на высоте выше 1900 м и обрабатывает ' +
        'её мытым способом в течение 48 часов после сбора. Долгая ферментация в чистой ' +
        'горной воде даёт ту самую чистую персиково-жасминовую чашку, за которую мы ' +
        'выбрали этот лот.',
    },
  },
  {
    id: 'LOT-XO-COL-004',
    roasterId: 'roaster-xo',
    name: 'Colombia Huila',
    country: 'Colombia',
    region: 'Huila',
    process: 'Natural',
    cropYear: '2024/2025',
    qGrade: 85.5,
    roastProfile: 'Pure Roast®',
    roastType: 'omni',
    descriptors: ['Red apple', 'Caramel', 'Cocoa'],
    roasterFlavorProfile: {
      acidity: 3,
      sweetness: 4,
      body: 4,
      bitterness: 2,
    },
    producer: {
      farmerName: 'Diego Samboní',
      farmName: 'Finca El Mirador',
      altitude: '1700–1850 м',
      story:
        'Диего выращивает Castillo и Caturra на семейной ферме в Уиле уже третье ' +
        'поколение. Натуральная обработка на приподнятых грядках даёт плотное тело ' +
        'и карамельную сладость, которая одинаково хорошо раскрывается и в фильтре, ' +
        'и в эспрессо.',
    },
  },
  {
    id: 'LOT-NS-KEN-002',
    roasterId: 'roaster-north',
    name: 'Kenya Nyeri',
    country: 'Kenya',
    region: 'Nyeri',
    process: 'Washed',
    cropYear: '2024/2025',
    qGrade: 88.5,
    roastProfile: 'Light Filter',
    roastType: 'filter',
    descriptors: ['Blackcurrant', 'Tomato', 'Brown sugar'],
    roasterFlavorProfile: {
      acidity: 5,
      sweetness: 3,
      body: 3,
      bitterness: 1,
    },
    producer: {
      farmerName: 'Tekangu Farmers Cooperative',
      farmName: 'Tekangu Factory',
      altitude: '1750–1900 м',
      story:
        'Мелкие фермеры кооператива сдают вишню на фабрику Текангу в тот же день ' +
        'сбора. Двойная ферментация и мытая обработка — фирменный почерк региона ' +
        'Ньери, дающий ту самую ягодную яркость и томатную кислотность в чашке.',
    },
  },
];

export function getLotById(id: string): Lot | undefined {
  return LOTS.find((lot) => lot.id === id);
}
