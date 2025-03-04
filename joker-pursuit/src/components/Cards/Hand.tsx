import React from 'react';
import { Card as CardModel } from '../../models/Card';
import Card from './Card';
import './Hand.css';

interface HandProps {
  cards: CardModel[];
  selectedCardId: string | null;
  playableCardIds: string[];
  onCardSelect: (cardId: string) => void;
}

const Hand: React.FC<HandProps> = ({
  cards,
  selectedCardId,
  playableCardIds,
  onCardSelect
}) => {
  return (
    <div className="hand-container">
      <div className="hand">
        {cards.map(card => (
          <Card
            key={card.id}
            card={card}
            isSelected={selectedCardId === card.id}
            isSelectable={playableCardIds.includes(card.id)}
            onClick={() => onCardSelect(card.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default Hand; 