import React from 'react';
import { Card } from '../../models/Card';
import './CardHand.css';

interface CardHandProps {
  cards: Card[];
  selectedCardId: string | null;
  onCardSelect: (cardId: string) => void;
}

const CardHand: React.FC<CardHandProps> = ({ 
  cards, 
  selectedCardId, 
  onCardSelect
}) => {
  // Get card color based on suit
  const getCardColor = (suit: string): string => {
    if (suit === 'hearts' || suit === 'diamonds') {
      return 'red';
    } else if (suit === 'spades' || suit === 'clubs') {
      return 'black';
    } else {
      return 'purple'; // For jokers
    }
  };
  
  // Get suit symbol
  const getSuitSymbol = (suit: string): string => {
    switch (suit) {
      case 'hearts': return '♥';
      case 'diamonds': return '♦';
      case 'clubs': return '♣';
      case 'spades': return '♠';
      default: return '';
    }
  };
  
  // Format rank for display
  const formatRank = (rank: string): string => {
    switch (rank) {
      case 'ace': return 'A';
      case 'jack': return 'J';
      case 'queen': return 'Q';
      case 'king': return 'K';
      case 'joker': return '★';
      default: return rank;
    }
  };
  
  return (
    <div className="card-hand">
      {cards.map(card => (
        <div 
          key={card.id}
          className={`playing-card ${selectedCardId === card.id ? 'selected' : ''}`}
          onClick={() => onCardSelect(card.id)}
          style={{ 
            cursor: 'pointer',
            opacity: selectedCardId && selectedCardId !== card.id ? 0.6 : 1
          }}
        >
          <div 
            className="card-content"
            style={{ color: getCardColor(card.suit) }}
          >
            <div className="card-top">
              <span className="card-rank">{formatRank(card.rank)}</span>
              <span className="card-suit">{getSuitSymbol(card.suit)}</span>
            </div>
            
            {card.rank === 'joker' ? (
              <div className="card-center joker">JOKER</div>
            ) : (
              <div className="card-center">
                {getSuitSymbol(card.suit)}
              </div>
            )}
            
            <div className="card-bottom">
              <span className="card-suit">{getSuitSymbol(card.suit)}</span>
              <span className="card-rank">{formatRank(card.rank)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CardHand; 