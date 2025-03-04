import React from 'react';
import { Card as CardModel } from '../../models/Card';
import './Card.css';

interface CardProps {
  card: CardModel;
  isSelected: boolean;
  isSelectable: boolean;
  onClick: () => void;
}

const Card: React.FC<CardProps> = ({
  card,
  isSelected,
  isSelectable,
  onClick
}) => {
  // Get the display value for the card
  const getCardValue = (rank: string): string => {
    if (rank === 'ace') return 'A';
    if (rank === 'jack') return 'J';
    if (rank === 'queen') return 'Q';
    if (rank === 'king') return 'K';
    if (rank === 'joker') return 'Joker';
    return rank;
  };
  
  // Get the suit symbol
  const getSuitSymbol = (suit: string | null): string => {
    if (suit === 'hearts') return '♥';
    if (suit === 'diamonds') return '♦';
    if (suit === 'clubs') return '♣';
    if (suit === 'spades') return '♠';
    return '';
  };
  
  // Determine if the card is red
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  
  // CSS classes for the card
  const cardClasses = `
    card 
    ${isSelected ? 'selected' : ''} 
    ${isSelectable ? 'selectable' : ''} 
    ${isRed ? 'red' : ''} 
    ${card.rank === 'joker' ? 'joker' : ''}
  `;
  
  // Card special rules description
  const getCardDescription = (): string => {
    switch (card.rank) {
      case 'ace':
        return 'Move 1 space, out of starting circle, or corner to corner';
      case 'joker':
        return 'Bump any opponent\'s peg, can jump over your own pegs';
      case '7':
        return 'Move 7 spaces or split between two pegs';
      case '8':
        return 'Move 8 spaces backward';
      case '9':
        return 'Move 9 spaces or split with one forward, one backward';
      default:
        return card.isFace 
          ? 'Move 10 spaces or out of starting circle' 
          : `Move ${card.value} spaces`;
    }
  };
  
  return (
    <div className={cardClasses} onClick={onClick}>
      <div className="card-corner top-left">
        <div className="card-value">{getCardValue(card.rank)}</div>
        <div className="card-suit">{getSuitSymbol(card.suit)}</div>
      </div>
      
      {card.rank === 'joker' ? (
        <div className="card-center">
          <div className="joker-face">😀</div>
        </div>
      ) : (
        <div className="card-center">
          <div className="card-suit center-suit">{getSuitSymbol(card.suit)}</div>
        </div>
      )}
      
      <div className="card-corner bottom-right">
        <div className="card-value">{getCardValue(card.rank)}</div>
        <div className="card-suit">{getSuitSymbol(card.suit)}</div>
      </div>
      
      <div className="card-description">{getCardDescription()}</div>
    </div>
  );
};

export default Card; 