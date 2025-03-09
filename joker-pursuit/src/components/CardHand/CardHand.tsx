import React from 'react';
import { Card } from '../../models/Card';
import './CardHand.css';

interface CardHandProps {
  cards: Card[];
  selectedCardId: string | null;
  onCardSelect: (cardId: string) => void;
  showCards?: boolean; // New prop to control visibility of cards
  playerColor?: string; // New prop for player color
}

const CardHand: React.FC<CardHandProps> = ({ 
  cards, 
  selectedCardId, 
  onCardSelect,
  showCards = true, // Default to showing cards
  playerColor = '#990000' // Updated to rich crimson red if no player color is provided
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
  
  // Calculate a darker shade of the player color for the card back center
  const getDarkerShade = (color: string): string => {
    try {
      // For hex colors
      if (color && color.startsWith('#')) {
        // Handle 3-digit hex
        if (color.length === 4) {
          const r = color[1];
          const g = color[2];
          const b = color[3];
          color = `#${r}${r}${g}${g}${b}${b}`;
        }
        
        // Handle 6-digit hex
        if (color.length === 7) {
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);
          
          // Make it darker (multiply by 0.7)
          const darkerR = Math.max(0, Math.floor(r * 0.7));
          const darkerG = Math.max(0, Math.floor(g * 0.7));
          const darkerB = Math.max(0, Math.floor(b * 0.7));
          
          // Convert back to hex
          return `#${darkerR.toString(16).padStart(2, '0')}${darkerG.toString(16).padStart(2, '0')}${darkerB.toString(16).padStart(2, '0')}`;
        }
      }
      
      // Fall back to default dark red for any other format or errors
      return '#660000'; // Darker shade of crimson red
    } catch (error) {
      console.error("Error calculating darker shade:", error);
      return '#660000'; // Darker shade of crimson red
    }
  };
  
  return (
    <div className="card-hand">
      {cards.map(card => (
        <div 
          key={card.id}
          className={`playing-card ${selectedCardId === card.id ? 'selected' : ''} ${!showCards ? 'hidden-card' : ''}`}
          onClick={() => showCards && onCardSelect(card.id)}
          style={{ 
            cursor: showCards ? 'pointer' : 'default',
            opacity: (selectedCardId && selectedCardId !== card.id && showCards) ? 0.6 : 1
          }}
        >
          {showCards ? (
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
          ) : (
            <div className="card-back" style={{ backgroundColor: playerColor }}>
              <div className="card-back-pattern">
                <div 
                  className="card-back-circle" 
                  style={{ backgroundColor: getDarkerShade(playerColor) }}
                ></div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default CardHand; 