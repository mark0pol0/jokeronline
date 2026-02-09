import { createDeck, createDecks } from './Card';

describe('createDecks', () => {
  test('creates one full deck per requested count', () => {
    const singleDeckSize = createDeck().length;
    const deckCount = 3;
    const combinedDeck = createDecks(deckCount);

    expect(combinedDeck).toHaveLength(singleDeckSize * deckCount);
    expect(new Set(combinedDeck.map(card => card.id)).size).toBe(combinedDeck.length);
  });

  test('returns an empty deck list for non-positive counts', () => {
    expect(createDecks(0)).toEqual([]);
    expect(createDecks(-2)).toEqual([]);
  });
});
