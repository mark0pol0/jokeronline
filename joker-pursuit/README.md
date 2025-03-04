# Joker Pursuit

A digital implementation of the classic card-based board game where you race your pegs to your castle while blocking opponents.

## Game Overview

Joker Pursuit is a strategic board game for 2-8 players who can be divided into teams. Each player has 4 pegs that start in the center of the board. The goal is to move all your pegs to your castle before the other team does.

### Game Features

- 🎮 Simple, intuitive interface
- 🎲 Strategic gameplay with cards
- 👥 2-8 player support
- 🏰 Team-based play
- 🃏 Special card abilities
- 🔄 Dynamic board layout options

## How to Play

1. **Setup**: Choose the number of players (2-8), configure teams, and start the game.
2. **Movement**: On your turn, select a card from your hand to make a move.
3. **Card Actions**:
   - **Number Cards (2-10)**: Move a peg forward the number of spaces shown.
   - **Face Cards (J, Q, K)**: Move 10 spaces or from starting circle to the main path.
   - **Ace**: Move 1 space or enter the castle from an entrance.
   - **Joker**: Bump any opponent's peg.
   - **7**: Move seven spaces or split between two pegs.
   - **8**: Move eight spaces backward.
   - **9**: Move nine spaces or split with one forward and one backward.
4. **Bumping**: If you land on an opponent's peg, they return to the starting circle. If you land on a teammate's peg, they advance to their castle entrance.
5. **Castles**: Each team has castle entrances at specific points on the board. Moving up the castle requires exact moves.
6. **Winning**: The first team to get all their pegs into their castles wins.

## Game Board

The game board consists of:
- A main path with 18 horizontal spaces
- Two castle entrances (at spaces 10 and 15)
- Two castles with 5 spaces each
- A starting circle in the center

## Technical Details

This project is built with:
- React
- TypeScript
- CSS for styling

## Development

To run the project locally:

1. Clone the repository
2. Install dependencies with `npm install`
3. Start the development server with `npm start`

## Credits

Created by [Your Name] using React and TypeScript.

## License

MIT License
