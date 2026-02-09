export type FloatingDecorType = 'card' | 'peg';

export interface FloatingDecorElement {
  id: number;
  type: FloatingDecorType;
  color: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  driftX: number;
  driftY: number;
  duration: number;
  delay: number;
}

interface FloatingDecorOptions {
  cardCount?: number;
  pegColors?: string[];
}

const DEFAULT_PEG_COLORS = [
  '#FF5733',
  '#33A1FF',
  '#33FF57',
  '#F033FF',
  '#FFFF33',
  '#FF33A8',
  '#33FFEC',
  '#FF8C33'
];

const randomInRange = (min: number, max: number): number => {
  return min + Math.random() * (max - min);
};

const createDecorElement = (id: number, type: FloatingDecorType, color: string): FloatingDecorElement => {
  const driftX = randomInRange(28, 84) * (Math.random() > 0.5 ? 1 : -1);
  const driftY = randomInRange(24, 74) * (Math.random() > 0.5 ? 1 : -1);

  return {
    id,
    type,
    color,
    x: randomInRange(0, 100),
    y: randomInRange(0, 100),
    rotation: randomInRange(0, 360),
    scale: randomInRange(0.48, 1.02),
    driftX,
    driftY,
    duration: randomInRange(20, 36),
    // Negative delays desynchronize the animation so movement appears continuous on load.
    delay: -randomInRange(0, 24)
  };
};

export const createFloatingDecorElements = (
  options: FloatingDecorOptions = {}
): FloatingDecorElement[] => {
  const cardCount = options.cardCount ?? 10;
  const pegColors = options.pegColors ?? DEFAULT_PEG_COLORS;
  const elements: FloatingDecorElement[] = [];

  for (let index = 0; index < cardCount; index += 1) {
    elements.push(createDecorElement(index, 'card', '#ffffff'));
  }

  pegColors.forEach((color, index) => {
    elements.push(createDecorElement(cardCount + index, 'peg', color));
  });

  return elements;
};
