/* eslint-disable no-loop-func */
import { BoardSpace } from '../models/BoardModel';
import { Card } from '../models/Card';
import { GameState, Move } from '../models/GameState';
import { Player } from '../models/Player';
import { BoardSection } from '../models/BoardModel';

// Helper function to safely get all spaces as an array
export const getAllSpacesAsArray = (gameState: GameState): BoardSpace[] => {
  // Defensive check to ensure board and spaces exist
  if (!gameState || !gameState.board || !gameState.board.allSpaces) {
    console.warn('Game state, board, or allSpaces is undefined in getAllSpacesAsArray');
    return [];
  }

  if (gameState.board.allSpaces instanceof Map) {
    // If it's a Map (client-side generated)
    return Array.from(gameState.board.allSpaces.values());
  } else {
    // If it's a plain object (from server JSON)
    return Object.values(gameState.board.allSpaces);
  }
};

// Helper function to find the space containing a specific peg
export const findSpaceForPeg = (gameState: GameState, pegId: string): BoardSpace | undefined => {
  const allSpaces = getAllSpacesAsArray(gameState);
  
  for (const space of allSpaces) {
    if (space.pegs.includes(pegId)) {
      return space;
    }
  }
  return undefined;
};

// Helper function to check if a move would pass over player's own pegs
const wouldJumpOverOwnPeg = (
  gameState: GameState, 
  player: Player, 
  fromSpace: BoardSpace, 
  destinationSpace: BoardSpace,
  isJokerMove: boolean
): boolean => {
  // If this is a joker move, we allow jumping over own pegs as per the exception
  if (isJokerMove) {
    return false;
  }

  // Get ordered spaces for board traversal - with sections in order
  const orderedSpaces = getAllSpacesAsArray(gameState)
    .filter(s => s.type === 'normal' || s.type === 'entrance' || s.type === 'corner')
    .sort((a, b) => {
      // Sort by section first, then by index within section
      if (a.sectionIndex !== b.sectionIndex) {
        return a.sectionIndex! - b.sectionIndex!;
      }
      return a.index - b.index;
    });

  // Find start and end indices in the ordered list
  const startIndex = orderedSpaces.findIndex(s => s.id === fromSpace.id);
  const endIndex = orderedSpaces.findIndex(s => s.id === destinationSpace.id);
  
  if (startIndex === -1 || endIndex === -1) {
    return false; // Could not find spaces in the ordered list
  }

  let pathSpaces: BoardSpace[];
  
  // Handle cases where movement wraps around the board
  if (endIndex > startIndex) {
    // Simple forward movement
    pathSpaces = orderedSpaces.slice(startIndex + 1, endIndex);
  } else {
    // Movement that wraps around the board or goes backward
    // Determine if this is a wraparound or a backward move within same section
    const isBackwardInSameSection = fromSpace.sectionIndex === destinationSpace.sectionIndex && 
                                    fromSpace.index > destinationSpace.index;
    
    const isWraparound = fromSpace.sectionIndex! > destinationSpace.sectionIndex! ||
                         isBackwardInSameSection === false;
    
    if (isBackwardInSameSection) {
      // Special case: Backward movement within same section
      // We need spaces between destination and start (in reverse order)
      pathSpaces = [];
      // Find all spaces in the same section between destination and start index
      for (const space of orderedSpaces) {
        if (space.sectionIndex === fromSpace.sectionIndex &&
            space.index > destinationSpace.index && 
            space.index < fromSpace.index) {
          pathSpaces.push(space);
        }
      }
    } else if (isWraparound) {
      // We need to go from start to end of the array, then from start of array to end position
      pathSpaces = [
        ...orderedSpaces.slice(startIndex + 1),
        ...orderedSpaces.slice(0, endIndex)
      ];
    } else {
      // Normal backward movement across sections
      pathSpaces = [...orderedSpaces.slice(endIndex + 1, startIndex)].reverse();
    }
  }

  // Get player's own section
  const playerSection = gameState.board.sections.find(section => 
    section.playerIds?.includes(player.id)
  );
  const playerSectionIndex = playerSection?.index;

  // Check if we're passing the castle entrance
  const passesEntranceSpace = pathSpaces.some(space => 
    space.type === 'entrance' && 
    space.index === 3 && 
    space.sectionIndex === playerSectionIndex
  );

  // Check if any spaces in between have the player's pegs
  return pathSpaces.some(space => {
    // Skip checking for player's pegs on the entrance space
    if (passesEntranceSpace && space.type === 'entrance' && space.index === 3 && space.sectionIndex === playerSectionIndex) {
      // Special case: we don't consider pegs at the castle entrance as "jumping over"
      return false;
    }
    
    return space.pegs.some(existingPegId => {
      const existingPlayerId = existingPegId.split('-peg-')[0];
      return existingPlayerId === player.id;
    });
  });
};

// Helper function to check if slot 8 is blocked
const isSlot8Blocked = (gameState: GameState, playerSection: BoardSection): boolean => {
  const slot8Space = getAllSpacesAsArray(gameState).find(s => {
    const isCorrectSection = s.id.startsWith(playerSection.id);
    const isValidSpace = s.type === 'normal' || s.type === 'entrance';
    const isSlot8 = s.index === 8;
    return isCorrectSection && isValidSpace && isSlot8;
  });

  if (!slot8Space || !slot8Space.pegs) {
    return false;
  }
  
  // Get the player IDs of this section to know who owns it
  const ownerPlayerIds = playerSection.playerIds || [];
  
  // Check if any of the pegs on slot 8 belong to the same player (same color)
  // We only block if our own peg is there. Opponent pegs can be bumped.
  return slot8Space.pegs.some(pegId => {
    const [pegPlayerId] = pegId.split('-peg-');
    return ownerPlayerIds.includes(pegPlayerId);
  });
};

// Helper function to find an available home slot for a player
const findAvailableHomeSlot = (gameState: GameState, playerId: string): BoardSpace | undefined => {
  // Find the player's section
  const playerSection = gameState.board.sections.find(section => 
    section.playerIds?.includes(playerId)
  );
  
  if (!playerSection) return undefined;
  
  // Find all home slots in the player's section
  const homeSlots = Array.from(gameState.board.allSpaces.values()).filter(space => 
    space.sectionIndex === playerSection.index && 
    space.type === 'home'
  );
  
  // Find the first home slot that's empty
  return homeSlots.find(slot => slot.pegs.length === 0);
};

// Helper function to handle joker bump
const handleJokerBump = (gameState: GameState, bumpedPegId: string): BoardSpace | undefined => {
  const [bumpedPlayerId] = bumpedPegId.split('-peg-');
  return findAvailableHomeSlot(gameState, bumpedPlayerId);
};

// Special implementation for Nine - split movement
const getNineMoves = (
  gameState: GameState, 
  player: Player, 
  card: Card, 
  direction: 'forward' | 'backward',
  steps: number,
  isSecondMove = false,
  firstMovePegId?: string
): Move[] => {
  const moves: Move[] = [];
  
  console.log(`[getNineMoves] Called with direction=${direction}, steps=${steps}, isSecondMove=${isSecondMove}`);
  
  // For each of the player's pegs
  player.pegs.forEach(pegId => {
    // If this is the second move and the peg is the same as the first move, skip it
    if (isSecondMove && pegId === firstMovePegId) {
      return;
    }
    
    const pegSpace = findSpaceForPeg(gameState, pegId);
    if (!pegSpace) {
      return;
    }
    
    // Special handling for pegs in castle
    if (pegSpace.type === 'castle') {
      // Get the player's section
      const playerSection = gameState.board.sections.find(section => 
        section.playerIds?.includes(player.id)
      );
      
      if (playerSection) {
        const currentCastleIndex = pegSpace.index;
        let newCastleIndex: number;
        
        // For Nine card, we can only move forward in the castle
        if (direction === 'forward') {
          newCastleIndex = currentCastleIndex + steps;
          
          // Check if the move would exceed the final castle slot (index 4)
          if (newCastleIndex <= 4) {
            // Find the destination castle space
            const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
              s.sectionIndex === playerSection.index && 
              s.type === 'castle' && 
              s.index === newCastleIndex
            );
            
            if (castleDestinationSpace) {
              // Check if this castle space already has a peg of the same color
              const hasSameColorPeg = castleDestinationSpace.pegs.some(existingPegId => {
                const [existingPlayerId] = existingPegId.split('-peg-');
                return existingPlayerId === player.id;
              });
              
              if (!hasSameColorPeg) {
                // Check if move would jump over own pegs in castle
                let wouldJump = false;
                for (let i = currentCastleIndex + 1; i < newCastleIndex; i++) {
                  const intermediateSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
                    s.sectionIndex === playerSection.index && 
                    s.type === 'castle' && 
                    s.index === i
                  );
                  
                  if (intermediateSpace && intermediateSpace.pegs.some(existingPegId => {
                    const [existingPlayerId] = existingPegId.split('-peg-');
                    return existingPlayerId === player.id;
                  })) {
                    wouldJump = true;
                    break;
                  }
                }
                
                if (!wouldJump) {
                  moves.push({
                    playerId: player.id,
                    cardId: card.id,
                    pegId: pegId,
                    from: pegSpace.id,
                    destinations: [castleDestinationSpace.id],
                    metadata: {
                      castleMovement: true,
                      nineCardMove: {
                        direction,
                        steps,
                        isFirstMove: !isSecondMove
                      }
                    }
                  });
                }
              }
            }
          }
        } else if (direction === 'backward') {
          // Backward movement in castle
          newCastleIndex = currentCastleIndex - steps;
          
          if (newCastleIndex >= 0) {
            // Find the destination castle space
            const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
              s.sectionIndex === playerSection.index && 
              s.type === 'castle' && 
              s.index === newCastleIndex
            );
            
            if (castleDestinationSpace) {
              // Check if this castle space already has a peg of the same color
              const hasSameColorPeg = castleDestinationSpace.pegs.some(existingPegId => {
                const [existingPlayerId] = existingPegId.split('-peg-');
                return existingPlayerId === player.id;
              });
              
              if (!hasSameColorPeg) {
                // Check if move would jump over own pegs in castle
                let wouldJump = false;
                for (let i = currentCastleIndex - 1; i > newCastleIndex; i--) {
                  const intermediateSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
                    s.sectionIndex === playerSection.index && 
                    s.type === 'castle' && 
                    s.index === i
                  );
                  
                  if (intermediateSpace && intermediateSpace.pegs.some(existingPegId => {
                    const [existingPlayerId] = existingPegId.split('-peg-');
                    return existingPlayerId === player.id;
                  })) {
                    wouldJump = true;
                    break;
                  }
                }
                
                if (!wouldJump) {
                  moves.push({
                    playerId: player.id,
                    cardId: card.id,
                    pegId: pegId,
                    from: pegSpace.id,
                    destinations: [castleDestinationSpace.id],
                    metadata: {
                      castleMovement: true,
                      nineCardMove: {
                        direction,
                        steps,
                        isFirstMove: !isSecondMove
                      }
                    }
                  });
                }
              }
            }
          }
        }
        return; // No need to process further movement logic for castle pegs
      }
    }
    
    // If peg is on a normal space, entrance, or corner
    if (pegSpace.type === 'normal' || pegSpace.type === 'entrance' || pegSpace.type === 'corner') {
      // Check for special slots
      const isCastleEntrance1 = pegSpace.type === 'entrance' && pegSpace.index === 3;
      
      // Get the player's section - this is where their castle is
      const playerSection1 = gameState.board.sections.find(section => 
        section.playerIds?.includes(player.id)
      );
      
      // Check if this peg is at the castle entrance of its own section
      const isAtCastleEntrance = isCastleEntrance1 && pegSpace.sectionIndex === playerSection1?.index;
      
      console.log(`[getNineMoves] Peg ${pegId} at ${pegSpace.id}, isAtCastleEntrance=${isAtCastleEntrance}, direction=${direction}`);
      
      // Special handling for peg at castle entrance
      if (isAtCastleEntrance && playerSection1) {
        // When at castle entrance, we can potentially enter the castle
        if (direction === 'forward' || direction === 'backward') {
          // Calculate remaining steps for castle move after entering
          const castleSteps = steps - 1; // -1 to account for the step into the castle
          
          console.log(`[getNineMoves] Calculating castle entry for peg ${pegId} with ${castleSteps} steps`);
          
          // Check if this would move to a valid castle position
          if (castleSteps > 0 && castleSteps <= 5) { // Castle has 5 slots (0-4)
            // Calculate the castle index based on direction
            const castleIndex = direction === 'forward' ? castleSteps : 5 - castleSteps;
            
            // Only proceed if the castle index is valid (0-4)
            if (castleIndex >= 0 && castleIndex <= 4) {
              // Find the destination castle space
              const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
                s.sectionIndex === playerSection1.index && 
                s.type === 'castle' && 
                s.index === castleIndex
              );
              
              if (castleDestinationSpace) {
                console.log(`[getNineMoves] Found castle destination: ${castleDestinationSpace.id} for peg ${pegId}`);
                
                // Check if this castle space already has a peg of the same color
                const hasSameColorPeg = castleDestinationSpace.pegs.some(existingPegId => {
                  const [existingPlayerId] = existingPegId.split('-peg-');
                  return existingPlayerId === player.id;
                });
                
                if (!hasSameColorPeg) {
                  console.log(`[getNineMoves] Adding castle entry move for peg ${pegId}`);
                  
                  // Add the castle entry option
                  moves.push({
                    playerId: player.id,
                    cardId: card.id,
                    pegId: pegId,
                    from: pegSpace.id,
                    destinations: [castleDestinationSpace.id],
                    metadata: {
                      castleEntry: true,
                      castleMovement: true,
                      nineCardMove: {
                        direction,
                        steps,
                        isFirstMove: !isSecondMove
                      }
                    }
                  });
                }
              }
            }
          }
        }
      }
      
      // For second move with special handling, use a more direct approach
      if (isSecondMove) {
        console.log(`[getNineMoves] SECOND MOVE: Processing move for peg ${pegId} from ${pegSpace.id} with direction=${direction}, steps=${steps}`);
        
        // We need to check if peg is in a castle space
        // This is a safer way to check without type comparison
        if (pegSpace.id.includes('castle')) {
          // ... existing castle handling code ...
          return; // No need to process regular moves for castle pegs
        }
        
        // First check if castle entry is an option (independent of regular moves)
        // Check if this peg is in player's section with access to castle
        const playerSection = gameState.board.sections.find(section => 
          section.playerIds?.includes(player.id)
        );
        
        
        if (playerSection && pegSpace.sectionIndex === playerSection.index && direction === 'forward') {
          // Only check castle entry for forward movement in player's own section
          // Check if this move would pass by the castle entrance
          if (pegSpace.index < 3 && (pegSpace.index + steps > 3)) {
            console.log(`[getNineMoves] SECOND MOVE: Move could involve castle entrance, checking castle entry option`);
            
            // Calculate castle steps (steps needed after entering the castle)
            const stepsToEntrance = 3 - pegSpace.index;
            const castleSteps = steps - stepsToEntrance - 1; // -1 for the step into the castle
            
            if (castleSteps >= 0 && castleSteps <= 4) {
              // Check if path to castle entrance is blocked
              let pathBlocked = false;
              for (let i = pegSpace.index + 1; i <= 3; i++) {
                const spaceOnPath = Array.from(gameState.board.allSpaces.values()).find(s => 
                  s.sectionIndex === playerSection.index && 
                  s.type !== 'castle' && 
                  s.index === i
                );
                
                if (spaceOnPath && spaceOnPath.pegs.some(id => id.startsWith(player.id))) {
                  pathBlocked = true;
                  console.log(`[getNineMoves] SECOND MOVE: Path to castle entrance blocked at index ${i}`);
                  break;
                }
              }
              
              if (!pathBlocked) {
                const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
                  s.sectionIndex === playerSection.index && 
                  s.type === 'castle' && 
                  s.index === castleSteps
                );
                
                if (castleDestinationSpace && !castleDestinationSpace.pegs.some(id => id.startsWith(player.id))) {
                  console.log(`[getNineMoves] SECOND MOVE: Adding castle entry move to ${castleDestinationSpace.id}`);
                  
                  moves.push({
                    playerId: player.id,
                    cardId: card.id,
                    pegId: pegId,
                    from: pegSpace.id,
                    destinations: [castleDestinationSpace.id],
                    metadata: {
                      castleEntry: true,
                      castleMovement: true,
                      nineCardMove: {
                        direction,
                        steps,
                        isFirstMove: false
                      }
                    }
                  });
                  
                }
              }
            }
          }
        }
        
        // Now process regular moves
        // Get all spaces ordered by section and index for movement calculation
        const allSpaces = Array.from(gameState.board.allSpaces.values())
          .filter(s => s.type === 'normal' || s.type === 'entrance' || s.type === 'corner')
          .sort((a, b) => {
            // Sort by section first, then by index within section
            if (a.sectionIndex !== b.sectionIndex) {
              return a.sectionIndex! - b.sectionIndex!;
            }
            return a.index - b.index;
          });
      
        // Find current space index in the ordered list
        const currentSpaceIndex = allSpaces.findIndex(s => s.id === pegSpace.id);
        
        if (currentSpaceIndex === -1) {
          console.log(`[getNineMoves] SECOND MOVE: Peg space ${pegSpace.id} not found in ordered spaces list`);
          return;
        }
        
        // Calculate target space index based on direction and make sure we wrap around correctly
        let targetSpaceIndex;
        if (direction === 'forward') {
          targetSpaceIndex = (currentSpaceIndex + steps) % allSpaces.length;
          console.log(`[getNineMoves] SECOND MOVE: Forward calculation: ${currentSpaceIndex} + ${steps} = ${targetSpaceIndex} (mod ${allSpaces.length})`);
        } else {
          // When moving backward, we need to handle negative results correctly
          // Add allSpaces.length to ensure we don't end up with a negative number before applying modulo
          targetSpaceIndex = (currentSpaceIndex - steps + allSpaces.length) % allSpaces.length;
          console.log(`[getNineMoves] SECOND MOVE: Backward calculation: ${currentSpaceIndex} - ${steps} = ${targetSpaceIndex} (mod ${allSpaces.length})`);
        }
        
        const destinationSpace = allSpaces[targetSpaceIndex];
        
        if (!destinationSpace) {
          console.log(`[getNineMoves] SECOND MOVE: No destination found at index ${targetSpaceIndex}`);
          return;
        }
        
        console.log(`[getNineMoves] SECOND MOVE: Found potential destination ${destinationSpace.id} at index ${targetSpaceIndex}`);
        
        // Check if destination has same color peg
        const hasSameColorPeg = destinationSpace.pegs.some(existingPegId => {
          const existingPlayerId = existingPegId.split('-peg-')[0];
          return existingPlayerId === player.id;
        });
        
        if (hasSameColorPeg) {
          console.log(`[getNineMoves] SECOND MOVE: Destination has same color peg, skipping`);
          return;
        }
        
        // Check if move would jump over own pegs
        // Enable jump checking for second moves to prevent invalid moves
        const wouldJump = wouldJumpOverOwnPeg(gameState, player, pegSpace, destinationSpace, false);
        
        if (wouldJump) {
          console.log(`[getNineMoves] SECOND MOVE: Would jump over own peg, skipping`);
          // If we already added a castle entry move, we're good
          // Otherwise, we have no valid moves
          return;
        }
        
        // Create the move
        const move = {
          playerId: player.id,
          cardId: card.id,
          pegId: pegId,
          from: pegSpace.id,
          destinations: [destinationSpace.id],
          metadata: {
            nineCardMove: {
              direction,
              steps,
              isFirstMove: false
            }
          }
        };
        
        console.log(`[getNineMoves] SECOND MOVE: Adding move from ${pegSpace.id} to ${destinationSpace.id}`);
        moves.push(move);
        
        return;
      } else {
        // This is the first move
        console.log(`[getNineMoves] FIRST MOVE: Processing move for peg ${pegId} from ${pegSpace.id} with direction=${direction}, steps=${steps}`);
        
        // Get all spaces ordered by section and index for movement calculation
        const allSpaces = Array.from(gameState.board.allSpaces.values())
          .filter(s => s.type === 'normal' || s.type === 'entrance' || s.type === 'corner')
          .sort((a, b) => {
            // Sort by section first, then by index within section
            if (a.sectionIndex !== b.sectionIndex) {
              return a.sectionIndex! - b.sectionIndex!;
            }
            return a.index - b.index;
          });
      
        // Find current space index in the ordered list
        const currentSpaceIndex = allSpaces.findIndex(s => s.id === pegSpace.id);
        
        if (currentSpaceIndex === -1) {
          console.log(`[getNineMoves] FIRST MOVE: Peg space ${pegSpace.id} not found in ordered spaces list`);
          return;
        }
        
        // Get the player's section for castle entrance detection
        const playerFirstSection = gameState.board.sections.find(section => 
          section.playerIds?.includes(player.id)
        );
        const playerSectionIndex = playerFirstSection?.index;
        
        // Check if this move would pass or land on castle entrance
        let willPassCastleEntrance = false;
        let willLandOnCastleEntrance = false;
        
        // Enhanced castle entrance detection that handles cross-section movement
        if (playerSectionIndex !== undefined && direction === 'forward') {
          // If peg is already in its own section before castle entrance
          if (pegSpace.sectionIndex === playerSectionIndex && pegSpace.index < 3) {
            // Check if peg is already at castle entrance
            const isCastleEntranceFirst = pegSpace.type === 'entrance' && pegSpace.index === 3;
            if (isCastleEntranceFirst) {
              willPassCastleEntrance = true;
              console.log(`[getNineMoves] Peg is at castle entrance, will pass it with forward movement`);
            }
            // Check if this move would pass the castle entrance
            else if (pegSpace.index + steps > 3) {
              willPassCastleEntrance = true;
              console.log(`[getNineMoves] Move would pass castle entrance`);
            }
            // Check if this move would land exactly on the castle entrance
            else if (pegSpace.index + steps === 3) {
              willLandOnCastleEntrance = true;
              console.log(`[getNineMoves] Move would land exactly on castle entrance`);
            }
          } 
          // For cross-section movement, we need more elaborate checks
          else if (pegSpace.sectionIndex !== playerSectionIndex) {
            console.log(`[getNineMoves] Cross-section movement detected. Checking for castle entrance crossing.`);
            
            // Calculate the total number of spaces in all sections combined
            const totalBoardSpaces = allSpaces.length;
            
            // Find indices of current peg space and player's castle entrance
            const currentIndex = allSpaces.findIndex(s => s.id === pegSpace.id);
            
            // Find the player's castle entrance space
            const castleEntranceSpace = allSpaces.find(s => 
              s.sectionIndex === playerSectionIndex && 
              s.type === 'entrance' && 
              s.index === 3
            );
            
            if (castleEntranceSpace) {
              const castleEntranceIndex = allSpaces.findIndex(s => s.id === castleEntranceSpace.id);
              
              if (currentIndex !== -1 && castleEntranceIndex !== -1) {
                // Calculate if our move would pass through or land on the castle entrance
                const moveSpan = steps;
                
                // Calculate the lowest and highest space indices our move would touch
                let startIndex = currentIndex;
                let endIndex = (currentIndex + moveSpan) % totalBoardSpaces;
                
                // Check if we'd pass through the castle entrance
                let wouldPass = false;
                
                // For clockwise movement
                if (startIndex < endIndex) {
                  wouldPass = castleEntranceIndex > startIndex && castleEntranceIndex < endIndex;
                } else {
                  // Handle wrap-around case
                  wouldPass = castleEntranceIndex > startIndex || castleEntranceIndex < endIndex;
                }
                
                // Check if we'd land exactly on the castle entrance
                const wouldLand = endIndex === castleEntranceIndex;
                
                if (wouldPass) {
                  willPassCastleEntrance = true;
                  console.log(`[getNineMoves] Cross-section move would pass castle entrance at index ${castleEntranceIndex}`);
                } else if (wouldLand) {
                  willLandOnCastleEntrance = true;
                  console.log(`[getNineMoves] Cross-section move would land exactly on castle entrance at index ${castleEntranceIndex}`);
                }
              }
            }
          }
        }
        
        // Calculate target space index based on direction
        let targetSpaceIndex;
        if (direction === 'forward') {
          targetSpaceIndex = (currentSpaceIndex + steps) % allSpaces.length;
        } else {
          targetSpaceIndex = (currentSpaceIndex - steps + allSpaces.length) % allSpaces.length;
        }
        
        const destinationSpace = allSpaces[targetSpaceIndex];
        
        if (!destinationSpace) {
          console.log(`[getNineMoves] FIRST MOVE: Destination space not found at index ${targetSpaceIndex}`);
          return;
        }
        
        console.log(`[getNineMoves] FIRST MOVE: Found potential destination ${destinationSpace.id}`);
        
        // Check if destination has same color peg
        const hasSameColorPeg = destinationSpace.pegs.some(existingPegId => {
          const existingPlayerId = existingPegId.split('-peg-')[0];
          return existingPlayerId === player.id;
        });
        
        // For castle entry, we'll handle it separately to ensure it's always considered,
        // even if the regular path is blocked
        let canMakeRegularMove = true;
        
        // For castle entry check, we need to know if the player can potentially enter the castle
        // This applies when: it's a forward move, in the player's section, before castle entrance, with enough steps
        const couldEnterCastle = direction === 'forward' && 
          pegSpace.sectionIndex === playerSectionIndex &&
          pegSpace.index < 3 && 
          (pegSpace.index + steps > 3);
        
        if (hasSameColorPeg) {
          console.log(`[getNineMoves] FIRST MOVE: Destination has same color peg, skipping regular move`);
          canMakeRegularMove = false;
        }
        
        // Check if move would jump over own pegs
        const wouldJump = wouldJumpOverOwnPeg(gameState, player, pegSpace, destinationSpace, false);
        if (wouldJump) {
          console.log(`[getNineMoves] FIRST MOVE: Would jump over own peg, skipping regular move`);
          canMakeRegularMove = false;
        }
        
        // If we can make a regular move, add it
        if (canMakeRegularMove) {
          // Create the move
          const move = {
            playerId: player.id,
            cardId: card.id,
            pegId: pegId,
            from: pegSpace.id,
            destinations: [destinationSpace.id],
            metadata: {
              willPassCastleEntrance: willPassCastleEntrance,
              willLandOnCastleEntrance: willLandOnCastleEntrance,
              nineCardMove: {
                direction,
                steps,
                isFirstMove: true
              }
            }
          };
          
          console.log(`[getNineMoves] FIRST MOVE: Adding move from ${pegSpace.id} to ${destinationSpace.id}`);
          console.log(`[getNineMoves] FIRST MOVE: willPassCastleEntrance=${willPassCastleEntrance}, willLandOnCastleEntrance=${willLandOnCastleEntrance}`);
          moves.push(move);
        }
        
        // If this move could potentially enter the castle, add a castle entry move
        // regardless of whether a regular move was added
        if (couldEnterCastle) {
          console.log(`[getNineMoves] FIRST MOVE: Checking for castle entry from ${pegSpace.id}`);
          
          // Calculate steps to castle entrance and remaining steps for castle movement
          const stepsToEntrance = 3 - pegSpace.index;
          const castleSteps = steps - stepsToEntrance - 1; // -1 for the entrance itself
          
          // Check if there's enough steps to enter the castle and move inside it
          if (castleSteps >= 0 && castleSteps <= 4) {
            // Check if path to the castle entrance is blocked
            let pathBlocked = false;
            
            // Check each space between current position and castle entrance
            for (let i = pegSpace.index + 1; i <= 3; i++) {
              const spaceOnPath = Array.from(gameState.board.allSpaces.values()).find(s => 
                s.sectionIndex === playerSectionIndex && 
                s.type !== 'castle' && 
                s.index === i
              );
              
              if (spaceOnPath && spaceOnPath.pegs.some(id => id.startsWith(player.id))) {
                pathBlocked = true;
                console.log(`[getNineMoves] FIRST MOVE: Path to castle entrance blocked at index ${i}`);
                break;
              }
            }
            
            // If path is clear, add the castle entry move
            if (!pathBlocked) {
              console.log(`[getNineMoves] FIRST MOVE: Adding castle entry move from ${pegSpace.id} with ${castleSteps} steps inside castle`);
              
              // Add a fake move that will be replaced with the actual castle move in the controller
              // The important part is to flag it with willPassCastleEntrance
              moves.push({
                playerId: player.id,
                cardId: card.id,
                pegId: pegId,
                from: pegSpace.id,
                destinations: [destinationSpace.id], // This will be replaced with the castle destination
                metadata: {
                  willPassCastleEntrance: true, // This is the key flag the controller looks for
                  willLandOnCastleEntrance: false,
                  nineCardMove: {
                    direction,
                    steps,
                    isFirstMove: true
                  }
                }
              });
            }
          }
        }
        // Handle cross-section castle entry when willPassCastleEntrance is true
        else if (willPassCastleEntrance && direction === 'forward') {
          console.log(`[getNineMoves] FIRST MOVE: Adding cross-section castle entry move option`);
          
          // For cross-section movement, we'll add a castle entry option
          // This will be handled in GameController.tsx which has the complex 
          // cross-section step calculation logic
          moves.push({
            playerId: player.id,
            cardId: card.id,
            pegId: pegId,
            from: pegSpace.id,
            destinations: [destinationSpace.id], // This will be replaced with castle destination in controller
            metadata: {
              willPassCastleEntrance: true,
              willLandOnCastleEntrance: false,
              castleEntry: true, // Use the valid castleEntry property instead of crossSectionCastleEntry
              nineCardMove: {
                direction,
                steps,
                isFirstMove: true
              }
            }
          });
        }
      }
    }
  });
  
  console.log(`[getNineMoves] Generated ${moves.length} possible moves with direction=${direction}, steps=${steps}`);
  return moves;
};

// Special implementation for Seven - split movement
const getSevenSplitMoves = (
  gameState: GameState, 
  player: Player, 
  card: Card, 
  steps: number,
  isSecondMove = false,
  firstMovePegId?: string
): Move[] => {
  const moves: Move[] = [];
  
  console.log(`[getSevenSplitMoves] Called with steps=${steps}, isSecondMove=${isSecondMove}, firstMovePegId=${firstMovePegId}`);
  console.log(`[getSevenSplitMoves] Player ${player.name} has ${player.pegs.length} pegs: ${player.pegs.join(', ')}`);
  
  // Log peg locations for debugging
  player.pegs.forEach(pegId => {
    const pegSpace = findSpaceForPeg(gameState, pegId);
    console.log(`[getSevenSplitMoves] Peg ${pegId} is at space ${pegSpace?.id || 'not found'} (type: ${pegSpace?.type || 'unknown'})`);
  });
  
  // For each of the player's pegs
  player.pegs.forEach(pegId => {
    // If this is the second move and the peg is the same as the first move, skip it
    if (isSecondMove && pegId === firstMovePegId) {
      console.log(`[getSevenSplitMoves] Skipping peg ${pegId} as it was used for first move`);
      return;
    }
    
    const pegSpace = findSpaceForPeg(gameState, pegId);
    if (!pegSpace) {
      console.log(`[getSevenSplitMoves] Peg ${pegId} not found on any space`);
      return;
    }
    
    console.log(`[getSevenSplitMoves] Checking peg ${pegId} at space ${pegSpace.id} (type: ${pegSpace.type})`);
    
    // Special handling for pegs in castle
    if (pegSpace.type === 'castle') {
      // Get the player's section
      const playerSection = gameState.board.sections.find(section => 
        section.playerIds?.includes(player.id)
      );
      
      if (playerSection) {
        const currentCastleIndex = pegSpace.index;
        const newCastleIndex = currentCastleIndex + steps;
        
        // Check if the move would exceed the final castle slot (index 4)
        if (newCastleIndex <= 4) {
          // Find the destination castle space
          const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
            s.sectionIndex === playerSection.index && 
            s.type === 'castle' && 
            s.index === newCastleIndex
          );
          
          if (castleDestinationSpace) {
            // Check if this castle space already has a peg of the same color
            const hasSameColorPeg = castleDestinationSpace.pegs.some(existingPegId => {
              const [existingPlayerId] = existingPegId.split('-peg-');
              return existingPlayerId === player.id;
            });
            
            if (!hasSameColorPeg) {
              // Check if move would jump over own pegs in castle
              let wouldJump = false;
              for (let i = currentCastleIndex + 1; i < newCastleIndex; i++) {
                const intermediateSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
                  s.sectionIndex === playerSection.index && 
                  s.type === 'castle' && 
                  s.index === i
                );
                
                if (intermediateSpace && intermediateSpace.pegs.some(existingPegId => {
                  const [existingPlayerId] = existingPegId.split('-peg-');
                  return existingPlayerId === player.id;
                })) {
                  wouldJump = true;
                  break;
                }
              }
              
              if (!wouldJump) {
                console.log(`[getSevenSplitMoves] Adding valid castle move for peg ${pegId} to ${castleDestinationSpace.id}`);
                
                moves.push({
                  playerId: player.id,
                  cardId: card.id,
                  pegId: pegId,
                  from: pegSpace.id,
                  destinations: [castleDestinationSpace.id],
                  metadata: {
                    castleMovement: true,
                    sevenCardMove: {
                      steps,
                      isFirstMove: !isSecondMove
                    }
                  }
                });
              }
            }
          }
        }
        return; // No need to process further movement logic for castle pegs
      }
    }
    
    // Special handling for home pegs
    if (pegSpace.type === 'home') {
      console.log(`[getSevenSplitMoves] Peg ${pegId} is in home, cannot be moved with 7 card`);
      return; // Skip pegs in home space - they can't be moved with 7 card
    }
    
    // Skip castle pegs
    if (pegSpace.type === 'castle') {
      console.log(`[getSevenSplitMoves] Peg ${pegId} is in castle, cannot be moved with 7 card`);
      return; // Skip pegs in castle - they can't be moved
    }
    
    // If peg is on a normal space, entrance, or corner
    if (pegSpace.type === 'normal' || pegSpace.type === 'entrance' || pegSpace.type === 'corner') {
      let currentSectionIndex = pegSpace.sectionIndex;
      let currentIndex = pegSpace.index;
      let remainingSteps = steps;
      
      // Check if this peg is in the player's own section and should be prompted about entering castle
      let shouldPromptCastleEntry = false;
      let willPassCastleEntrance = false;
      let willLandOnCastleEntrance = false;
      
      // Get the player's section - this is where their castle is
      const playerSection = gameState.board.sections.find(section => 
        section.playerIds?.includes(player.id)
      );
      
      // Find the player's section index (which may be different from current section)
      const playerSectionIndex = playerSection?.index;
      
      // Check if peg is at the castle entrance
      const isCastleEntrance = pegSpace.type === 'entrance' && pegSpace.index === 3 && currentSectionIndex === playerSectionIndex;
      
      // If at castle entrance, any forward move will prompt castle entry
      if (isCastleEntrance) {
        shouldPromptCastleEntry = true;
        // If the peg is already at the castle entrance, it will pass it with any forward movement
        willPassCastleEntrance = true;
        console.log(`[getSevenSplitMoves] Peg is at castle entrance in section ${currentSectionIndex}, will pass it with forward movement`);
      } 
      // If in same section as player's castle but not at entrance
      else if ((pegSpace.type === 'normal' || pegSpace.type === 'entrance') && currentSectionIndex === playerSectionIndex) {
        // Check if the move would pass the castle entrance position (index 3)
        // Castle entrance is at index 3 in the player's section
        const castleEntranceIndex = 3;
        
        // If we're before the castle entrance and would move past it
        if (pegSpace.index < castleEntranceIndex) {
          if (pegSpace.index + remainingSteps > castleEntranceIndex) {
            willPassCastleEntrance = true;
            console.log(`[getSevenSplitMoves] Will pass castle entrance in player's section`);
          } else if (pegSpace.index + remainingSteps === castleEntranceIndex) {
            willLandOnCastleEntrance = true;
            console.log(`[getSevenSplitMoves] Will land exactly on castle entrance in section ${currentSectionIndex}`);
          }
        }
      }
      
      console.log(`[getSevenSplitMoves] Starting movement calculation from section ${currentSectionIndex}, index ${currentIndex} with ${remainingSteps} steps`);
      
      // Calculate final position after steps
      while (remainingSteps > 0) {
        // Find max index in current section
        const maxIndex = Math.max(...Array.from(gameState.board.allSpaces.values())
          .filter(s => s.sectionIndex === currentSectionIndex && s.type === 'normal')
          .map(s => s.index));
        
        console.log(`[getSevenSplitMoves] Max index in section ${currentSectionIndex} is ${maxIndex}`);
        
        // If we can complete the move in current section
        if (currentIndex + remainingSteps <= maxIndex) {
          // Check if we would pass the castle entrance in this section
          if (currentSectionIndex === playerSectionIndex && currentIndex < 3) {
            if (currentIndex + remainingSteps > 3) { // Would move past castle entrance
              console.log(`[getSevenSplitMoves] Will pass castle entrance within section ${currentSectionIndex}`);
              willPassCastleEntrance = true;
            } else if (currentIndex + remainingSteps === 3) { // Would land exactly on castle entrance
              console.log(`[getSevenSplitMoves] Will land exactly on castle entrance within section ${currentSectionIndex}`);
              willLandOnCastleEntrance = true;
            }
          }
          
          currentIndex += remainingSteps;
          remainingSteps = 0;
          console.log(`[getSevenSplitMoves] Move completes in same section at index ${currentIndex}`);
        } else {
          // Check if we pass castle entrance in current section before exiting
          if (currentSectionIndex === playerSectionIndex && currentIndex < 3) {
            console.log(`[getSevenSplitMoves] Will pass castle entrance when exiting section ${currentSectionIndex}`);
            willPassCastleEntrance = true;
          }
          
          // Move to next section
          const stepsInCurrentSection = maxIndex - currentIndex;
          remainingSteps -= (stepsInCurrentSection + 1);
          currentSectionIndex = (currentSectionIndex + 1) % gameState.board.sections.length;
          currentIndex = 0;
          
          // When entering a new section, check if it's the player's section
          if (currentSectionIndex === playerSectionIndex) {
            // If entering player's section with exactly 3 steps, will land on castle entrance
            if (remainingSteps === 3) {
              console.log(`[getSevenSplitMoves] Will land exactly on castle entrance when entering player's section ${currentSectionIndex}`);
              willLandOnCastleEntrance = true;
            }
            // If entering the player's section with more than 3 steps remaining,
            // they'll pass the castle entrance
            else if (remainingSteps > 3) {
              console.log(`[getSevenSplitMoves] Will pass castle entrance when entering player's section ${currentSectionIndex}`);
              willPassCastleEntrance = true;
            }
          }
          
          console.log(`[getSevenSplitMoves] Moving to next section ${currentSectionIndex} with ${remainingSteps} steps remaining`);
        }
      }
      
      console.log(`[getSevenSplitMoves] Final destination calculated as section ${currentSectionIndex}, index ${currentIndex}`);
      console.log(`[getSevenSplitMoves] Will pass castle entrance? ${willPassCastleEntrance}`);
      console.log(`[getSevenSplitMoves] Will land on castle entrance? ${willLandOnCastleEntrance}`);
      
      // Find the destination space
      const destinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
        s.sectionIndex === currentSectionIndex && 
        (s.type === 'normal' || s.type === 'entrance') && 
        s.index === currentIndex
      );
      
      if (destinationSpace) {
        console.log(`[getSevenSplitMoves] Found destination space ${destinationSpace.id}`);
        
        // Check if destination has same color peg
        const hasSameColorPeg = destinationSpace.pegs.some(existingPegId => {
          const [existingPlayerId] = existingPegId.split('-peg-');
          return existingPlayerId === player.id;
        });
        
        if (hasSameColorPeg) {
          console.log(`[getSevenSplitMoves] Destination space already has a peg of same color, skipping`);
          return; // Skip if destination has same color peg
        }
        
        // Check if move would jump over own pegs
        if (wouldJumpOverOwnPeg(gameState, player, pegSpace, destinationSpace, false)) {
          console.log(`[getSevenSplitMoves] Move would jump over own peg, skipping`);
          
          // Add more detailed debugging
          console.log(`[getSevenSplitMoves] From: ${pegSpace.id} (section ${pegSpace.sectionIndex}, index ${pegSpace.index})`);
          console.log(`[getSevenSplitMoves] To: ${destinationSpace.id} (section ${destinationSpace.sectionIndex}, index ${destinationSpace.index})`);
          console.log(`[getSevenSplitMoves] Castle entrance in player section ${player.id} would be at section ${playerSection?.index}, index 3`);
          
          // Log pegs in player's section for debugging
          Array.from(gameState.board.allSpaces.values())
            .filter(s => s.sectionIndex === playerSection?.index && s.pegs.some(pid => pid.startsWith(player.id)))
            .forEach(s => {
              console.log(`[getSevenSplitMoves] Player has peg at ${s.id} (section ${s.sectionIndex}, index ${s.index})`);
            });
          
          // Check if the move would pass the castle entrance
          if (willPassCastleEntrance && playerSection) {
            console.log(`[getSevenSplitMoves] Normal move is blocked, but considering castle entry as alternative because will pass castle entrance`);
            
            // Calculate castle entry steps
            let castleSteps = steps;
            
            // If we're in player's section and before castle entrance
            if (pegSpace.sectionIndex === playerSection.index && pegSpace.index < 3) {
              const stepsToEntrance = 3 - pegSpace.index;
              castleSteps -= stepsToEntrance;
              console.log(`[getSevenSplitMoves] In player's section: steps to castle entrance=${stepsToEntrance}, remaining castle steps=${castleSteps}`);
            } 
            // If we're in a different section (cross-section movement)
            else if (pegSpace.sectionIndex !== playerSection.index) {
              console.log(`[getSevenSplitMoves] Cross-section movement: calculating castle entry steps`);
              let sectionIndex = pegSpace.sectionIndex;
              let indexInSection = pegSpace.index;
              let tempSteps = steps;
              
              while (sectionIndex !== playerSection.index && tempSteps > 0) {
                // Get max index in current section
                const maxIndex = Math.max(...Array.from(gameState.board.allSpaces.values())
                  .filter(s => s.sectionIndex === sectionIndex && s.type === 'normal')
                  .map(s => s.index));
                
                // Calculate steps needed to exit this section
                const stepsToNextSection = (maxIndex - indexInSection) + 1;
                
                if (tempSteps > stepsToNextSection) {
                  // Move to next section
                  tempSteps -= stepsToNextSection;
                  sectionIndex = (sectionIndex + 1) % gameState.board.sections.length;
                  indexInSection = 0;
                  
                  // If we've reached player's section
                  if (sectionIndex === playerSection.index) {
                    // Calculate remaining steps after reaching player's section
                    if (tempSteps > 3) { // If we have more than 3 steps after entering player's section
                      castleSteps = tempSteps - 3; // Steps after passing castle entrance
                      console.log(`[getSevenSplitMoves] Cross-section: would reach castle entrance with ${castleSteps} steps remaining`);
                    } else {
                      // Not enough steps to reach castle after entering player's section
                      castleSteps = 1; // Default to first castle position
                      console.log(`[getSevenSplitMoves] Cross-section: not enough steps to reach castle entrance, using default`);
                    }
                    break;
                  }
                } else {
                  // Not enough steps to reach next section
                  console.log(`[getSevenSplitMoves] Cross-section: not enough steps to reach player's section`);
                  castleSteps = 1; // Default to first castle position
                  break;
                }
              }
            }
            
            // Castle has positions 0-4, so limit to that range
            castleSteps = Math.min(castleSteps, 5);
            castleSteps = Math.max(castleSteps, 1); // Ensure we have at least 1 step
            
            if (castleSteps > 0) {
              const castleIndex = castleSteps - 1; // Convert steps to 0-based index
              console.log(`[getSevenSplitMoves] Castle entry calculation: castleSteps=${castleSteps}, resulting castleIndex=${castleIndex}`);
              
              // Find the castle destination space
              const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
                s.sectionIndex === playerSection.index && 
                s.type === 'castle' && 
                s.index === castleIndex
              );
              
              if (castleDestinationSpace) {
                // Check if this castle space already has a peg of the same color
                const hasCastlePeg = castleDestinationSpace.pegs.some(existingPegId => {
                  const [existingPlayerId] = existingPegId.split('-peg-');
                  return existingPlayerId === player.id;
                });
                
                if (!hasCastlePeg) {
                  console.log(`[getSevenSplitMoves] Adding castle entry move from ${pegSpace.id} to ${castleDestinationSpace.id}`);
                  
                  moves.push({
                    playerId: player.id,
                    cardId: card.id,
                    pegId: pegId,
                    from: pegSpace.id,
                    destinations: [castleDestinationSpace.id],
                    metadata: {
                      castleEntry: true,
                      castleMovement: true,
                      willPassCastleEntrance: true,
                      sevenCardMove: {
                        steps,
                        isFirstMove: !isSecondMove
                      }
                    }
                  });
                } else {
                  console.log(`[getSevenSplitMoves] Castle destination already has a peg, skipping castle entry`);
                }
              }
            }
          } else {
            console.log(`[getSevenSplitMoves] Move does not pass castle entrance, no castle entry option needed`);
          }
          
          return; // Skip the normal path move if it jumps over own peg
        }
        
        console.log(`[getSevenSplitMoves] Adding valid move for peg ${pegId} to ${destinationSpace.id}`);
        
        const move = {
          playerId: player.id,
          cardId: card.id,
          pegId: pegId,
          from: pegSpace.id,
          destinations: [destinationSpace.id],
          metadata: {
            willPassCastleEntrance: willPassCastleEntrance,
            willLandOnCastleEntrance: willLandOnCastleEntrance,
            sevenCardMove: {
              steps,
              isFirstMove: !isSecondMove
            }
          }
        };
        
        moves.push(move);
        
        // If this peg would pass the castle entrance, also add a castle entry move option
        if (willPassCastleEntrance && playerSection) {
          console.log(`[getSevenSplitMoves] Adding castle entry move option`);
          
          // Calculate castle entry steps
          let castleSteps = steps;
          
          // If we're not at the castle entrance, subtract steps needed to reach it
          if (!shouldPromptCastleEntry && willPassCastleEntrance) {
            // If we're in the player's section, calculate steps to castle entrance
            if (pegSpace.sectionIndex === playerSection.index) {
              const stepsToEntrance = 3 - pegSpace.index;
              castleSteps -= stepsToEntrance;
              console.log(`[getSevenSplitMoves] In player's section: steps to castle entrance=${stepsToEntrance}, remaining castle steps=${castleSteps}`);
            } else {
              // More complex calculation for different section
              // (would need to calculate steps to reach player's section then castle entrance)
              console.log(`[getSevenSplitMoves] Complex case: peg in different section than player's castle`);
              // For simplicity, we'll use a basic calculation here
              castleSteps = 1; // Just enter the castle at position 0
            }
          }
          
          // Castle has positions 0-4, so limit to that range
          castleSteps = Math.min(castleSteps, 5);
          
          if (castleSteps > 0) {
            const castleIndex = castleSteps - 1; // Convert steps to 0-based index
            console.log(`[getSevenSplitMoves] Castle entry calculation: castleSteps=${castleSteps}, resulting castleIndex=${castleIndex}`);
            
            // Find the castle destination space
            const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
              s.sectionIndex === playerSection.index && 
              s.type === 'castle' && 
              s.index === castleIndex
            );
            
            if (castleDestinationSpace) {
              console.log(`[getSevenSplitMoves] Found castle destination space: ${castleDestinationSpace.id}`);
              
              // Check if this castle space already has a peg of the same color
              const hasCastlePeg = castleDestinationSpace.pegs.some(existingPegId => {
                const [existingPlayerId] = existingPegId.split('-peg-');
                return existingPlayerId === player.id;
              });
              
              if (!hasCastlePeg) {
                console.log(`[getSevenSplitMoves] Adding castle entry move from ${pegSpace.id} to ${castleDestinationSpace.id}`);
                
                moves.push({
                  playerId: player.id,
                  cardId: card.id,
                  pegId: pegId,
                  from: pegSpace.id,
                  destinations: [castleDestinationSpace.id],
                  metadata: {
                    castleEntry: true,
                    castleMovement: true,
                    willPassCastleEntrance: true,
                    sevenCardMove: {
                      steps,
                      isFirstMove: !isSecondMove
                    }
                  }
                });
              } else {
                console.log(`[getSevenSplitMoves] Castle destination already has a peg, skipping castle entry`);
                console.log(`[getSevenSplitMoves] Castle destination pegs: ${castleDestinationSpace.pegs.join(', ')}`);
              }
            } else {
              console.log(`[getSevenSplitMoves] Could not find castle destination space at index ${castleIndex}`);
            }
          } else {
            console.log(`[getSevenSplitMoves] Not enough steps for castle entry: castleSteps=${castleSteps}`);
          }
        } else if (!willPassCastleEntrance) {
          console.log(`[getSevenSplitMoves] Move does not pass castle entrance, no castle entry option needed`);
        } else if (!playerSection) {
          console.log(`[getSevenSplitMoves] Could not find player's section, skipping castle entry option`);
        }
      } else {
        console.log(`[getSevenSplitMoves] Could not find destination space at section ${currentSectionIndex}, index ${currentIndex}`);
      }
    } else {
      console.log(`[getSevenSplitMoves] Peg ${pegId} is on a space of type ${pegSpace.type}, which is not eligible for movement`);
    }
  });
  
  console.log(`[getSevenSplitMoves] Generated ${moves.length} possible moves`);
  return moves;
};

// Get all possible moves for a player with a given card
export const getPossibleMoves = (
  gameState: GameState,
  playerId: string,
  cardId: string,
  options?: {
    direction?: 'forward' | 'backward';
    steps?: number;
    isSecondMove?: boolean;
    firstMovePegId?: string;
  }
): Move[] => {
  const player = gameState.players.find(p => p.id === playerId);
  const card = player?.hand.find(c => c.id === cardId);
  
  if (!player || !card) {
    return [];
  }
  
  const possibleMoves: Move[] = [];
  
  // Handle different card types and their movement rules
  if (card.rank === 'joker') {
    possibleMoves.push(...getJokerMoves(gameState, player, card));
  } else if (card.rank === 'ace') {
    possibleMoves.push(...getAceMoves(gameState, player, card));
  } else if (card.isFace) {
    possibleMoves.push(...getFaceCardMoves(gameState, player, card));
  } else if (card.rank === '7') {
    if (options?.steps && options.steps <= 7) {
      // For split 7 card
      possibleMoves.push(...getSevenSplitMoves(
        gameState, 
        player, 
        card, 
        options.steps,
        options.isSecondMove || false,
        options.isSecondMove ? options.firstMovePegId : undefined
      ));
    } else {
      // Regular 7 card move
      possibleMoves.push(...getRegularMoves(gameState, player, card));
    }
  } else if (card.rank === '8') {
    possibleMoves.push(...getEightMoves(gameState, player, card));
  } else if (card.rank === '9') {
    // Special nine card handling
    if (options?.direction && options?.steps) {
      possibleMoves.push(...getNineMoves(
        gameState, 
        player, 
        card, 
        options.direction, 
        options.steps,
        options.isSecondMove || false,
        options.isSecondMove ? options.firstMovePegId : undefined
      ));
    }
  } else if (card.rank === '10') {
    // Make sure 10 card is explicitly handled
    possibleMoves.push(...getRegularMoves(gameState, player, card));
  } else {
    // Other regular numbered cards
    possibleMoves.push(...getRegularMoves(gameState, player, card));
  }
  
  return possibleMoves;
};

// Apply a move to the game state
export const applyMove = (gameState: GameState, move: Move): { newState: GameState, bumpMessage?: string } => {
  console.log(`[applyMove] STARTING apply move for player ${move.playerId}, peg ${move.pegId}, card ${move.cardId}`);
  console.log(`[applyMove] Move metadata:`, JSON.stringify(move.metadata, null, 2));
  
  const newState = { ...gameState };
  const player = newState.players.find(p => p.id === move.playerId);
  
  if (!player) {
    console.log(`[applyMove] Player ${move.playerId} not found`);
    return { newState: gameState };
  }
  
  // Find the card that was played
  const cardIndex = player.hand.findIndex(c => c.id === move.cardId);
  if (cardIndex === -1) {
    console.log(`[applyMove] Card ${move.cardId} not found in player's hand`);
    return { newState: gameState };
  }
  
  // Get the destination space
  const destinationId = move.destinations[0];
  const destinationSpace = newState.board.allSpaces.get(destinationId);
  
  if (!destinationSpace) {
    console.log(`[applyMove] Destination space ${destinationId} not found`);
    return { newState: newState };
  }
  
  // Check if destination space already has a peg of the same color
  const hasSameColorPeg = destinationSpace.pegs.some(pegId => {
    const [pegPlayerId] = pegId.split('-peg-');
    return pegPlayerId === move.playerId;
  });
  
  if (hasSameColorPeg) {
    console.log(`[applyMove] Destination space ${destinationId} already has a peg of the same color`);
    return { newState: newState }; // Return without making any changes
  }
  
  // Check if this is the first move of a split (7 card or 9 card)
  const isFirstMoveOfMultiPartMove = move.metadata?.sevenCardMove?.isFirstMove || move.metadata?.nineCardMove?.isFirstMove;
  
  console.log(`[applyMove] Is this the first move of a multi-part move? ${isFirstMoveOfMultiPartMove ? 'YES' : 'NO'}`);
  console.log(`[applyMove] 7 card metadata:`, JSON.stringify(move.metadata?.sevenCardMove, null, 2));
  console.log(`[applyMove] 9 card metadata:`, JSON.stringify(move.metadata?.nineCardMove, null, 2));
  
  // Only remove the card from player's hand and discard it if this is NOT the first move of a multi-part move
  if (!isFirstMoveOfMultiPartMove) {
    // Get the actual card object before removing it from the hand
    const playedCard = player.hand[cardIndex];
    console.log(`[applyMove] Player ${player.name} played ${playedCard.rank} of ${playedCard.suit}`);
    
    // Remove the card from the player's hand
    player.hand.splice(cardIndex, 1);
    
    // Add the card to the discard pile
    newState.discardPile.push(playedCard);
  } else {
    // If it's the first move of a multi-part move, just log that we're keeping the card for now
    const playedCard = player.hand[cardIndex];
    console.log(`[applyMove] Player ${player.name} played ${playedCard.rank} of ${playedCard.suit} (keeping card for second move)`);
  }
  
  // Find the current space for the peg
  const fromSpace = findSpaceForPeg(newState, move.pegId);
  
  if (fromSpace) {
    // Remove peg from its current space
    fromSpace.pegs = fromSpace.pegs.filter(id => id !== move.pegId);
    console.log(`[applyMove] Removing peg ${move.pegId} from space ${fromSpace.id}`);
  } else {
    // If peg not found in any space, search all spaces to be safe
    console.log(`[applyMove] Could not find space for peg ${move.pegId}, scanning all spaces`);
    newState.board.allSpaces.forEach(space => {
      space.pegs = space.pegs.filter(id => id !== move.pegId);
    });
  }
  
  let bumpMessage: string | undefined;
  
  // Special handling for joker moves
  if (player.hand[cardIndex]?.rank === 'joker' && move.metadata?.bumpedPegId && move.metadata?.bumpDestination) {
    const bumpedPegId = move.metadata.bumpedPegId;
    const bumpDestination = move.metadata.bumpDestination;
    
    console.log(`[applyMove] Joker Card: Bumping peg ${bumpedPegId} back to ${bumpDestination}`);
    
    // Get the bumped player info for the message
    const [bumpedPlayerId] = bumpedPegId.split('-peg-');
    const bumpedPlayer = newState.players.find(p => p.id === bumpedPlayerId);
    
    if (bumpedPlayer) {
      console.log(`[applyMove] Bumping ${bumpedPlayer.name}'s peg (${bumpedPegId})`);
    }
    
    // Remove the bumped peg from its current space
    if (destinationSpace.pegs.includes(bumpedPegId)) {
      console.log(`[applyMove] Removing bumped peg ${bumpedPegId} from space ${destinationId}`);
      destinationSpace.pegs = destinationSpace.pegs.filter(id => id !== bumpedPegId);
    } else {
      console.log(`[applyMove] WARNING: Bumped peg ${bumpedPegId} not found in destination space ${destinationId}`);
      console.log(`[applyMove] Destination space pegs: ${destinationSpace.pegs.join(', ')}`);
    }
    
    // Find the home slot space
    const homeSlot = newState.board.allSpaces.get(bumpDestination);
    if (homeSlot) {
      // Add the bumped peg to its home slot
      homeSlot.pegs.push(bumpedPegId);
      console.log(`[applyMove] Added bumped peg ${bumpedPegId} to home slot ${homeSlot.id}`);
      
      // Get player names for the message
      const bumpedPlayer = newState.players.find(p => p.pegs.includes(bumpedPegId));
      if (bumpedPlayer) {
        bumpMessage = `${player.name} used a Joker to bump ${bumpedPlayer.name}'s peg back to their home!`;
        console.log(`[applyMove] ${bumpMessage}`);
      }
    } else {
      console.log(`[applyMove] ERROR: Could not find home slot ${bumpDestination} for bumped peg`);
    }
    
    // Add the moving player's peg to the destination space
    console.log(`[applyMove] Adding player's peg ${move.pegId} to space ${destinationId}`);
    destinationSpace.pegs.push(move.pegId);
  } else {
    // Handle regular bumping for non-joker moves
    if (destinationSpace.pegs.length > 0) {
      const bumpResult = handleBump(newState, destinationSpace, player.id);
      if (bumpResult) {
        bumpMessage = `${bumpResult.bumpingPlayerName} bumped ${bumpResult.bumpedPlayerName}'s peg back to their home!`;
      }
    }
    
    // Add peg to its new space for non-joker moves
    destinationSpace.pegs.push(move.pegId);
    console.log(`[applyMove] Added peg ${move.pegId} to space ${destinationSpace.id}`);
  }
  
  // Check if the player has moved all pegs to castle spaces
  const allPegsInCastle = player.pegs.every(pegId => {
    const pegSpace = findSpaceForPeg(newState, pegId);
    return pegSpace?.type === 'castle';
  });
  
  // Update player's completion status
  player.isComplete = allPegsInCastle;
  
  // Draw a new card if there are cards in the draw pile and this isn't the first part of a multi-part move
  if (newState.drawPile.length > 0) {
    if (!isFirstMoveOfMultiPartMove) {
      const newCard = newState.drawPile.pop()!;
      player.hand.push(newCard);
      console.log(`[applyMove] Player ${player.name} drew a new card: ${newCard.rank} of ${newCard.suit}`);
    } else {
      console.log(`[applyMove] NOT drawing a card yet - this is part 1 of a multi-part move`);
    }
  } else {
    console.log(`[applyMove] Draw pile is empty, no new card for player ${player.name}`);
  }
  
  // Record the move
  newState.moves.push(move);
  
  console.log(`[applyMove] COMPLETED move for player ${player.name}, peg ${move.pegId}`);
  
  return { newState, bumpMessage };
};

// Helper functions for specific card movements
const getJokerMoves = (gameState: GameState, player: Player, card: Card): Move[] => {
  const moves: Move[] = [];
  
  // Log available pegs for debugging
  console.log(`[getJokerMoves] Player ${player.name} (${player.id}) is checking joker moves`);
  console.log(`[getJokerMoves] Player has ${player.pegs.length} pegs to potentially move`);
  
  // For each of the player's pegs (including those in home)
  player.pegs.forEach(pegId => {
    const pegSpace = findSpaceForPeg(gameState, pegId);
    if (!pegSpace) {
      console.log(`[getJokerMoves] Peg ${pegId} not found in any space`);
      return;
    }
    
    // Skip pegs in castle (they can't be moved)
    if (pegSpace.type === 'castle') {
      console.log(`[getJokerMoves] Peg ${pegId} is in castle, cannot be moved with a joker card`);
      return;
    }
    
    console.log(`[getJokerMoves] Checking peg ${pegId} in space ${pegSpace.id} (${pegSpace.type})`);
    
    // Find all opponent pegs that can be bumped
    let opponentPegsFound = 0;
    let spacesWithOpponents: string[] = [];
    
    gameState.board.allSpaces.forEach((space, spaceId) => {
      // Only allow bumping pegs on normal slots or entrance slots
      if (space.type !== 'normal' && space.type !== 'entrance') {
        return;
      }
      
      // Skip if space is empty
      if (space.pegs.length === 0) {
        return;
      }
      
      // Check each peg in the space for opponent's pegs
      let foundOpponentInSpace = false;
      
      space.pegs.forEach(targetPegId => {
        const [targetPlayerId] = targetPegId.split('-peg-');
        
        // Skip if it's the player's own peg
        if (targetPlayerId === player.id) {
          return;
        }
        
        // If we've already found an opponent in this space, don't log it again
        if (foundOpponentInSpace) return;
        
        foundOpponentInSpace = true;
        opponentPegsFound++;
        spacesWithOpponents.push(spaceId);
        
        // Check if there's an available home slot for the bumped peg
        const homeSlot = handleJokerBump(gameState, targetPegId);
        if (!homeSlot) {
          console.log(`[getJokerMoves] No available home slot for ${targetPegId} at space ${spaceId}`);
          return;
        }
        
        // Get opponent's player name for better logs
        const targetPlayer = gameState.players.find(p => p.id === targetPlayerId);
        
        // For joker moves, we allow jumping over own pegs as per the exception
        // Add the move with both the destination and the bump information
        console.log(`[getJokerMoves] Adding joker move: ${pegId} can bump ${targetPegId} (${targetPlayer?.name}) at space ${spaceId}`);
        
        moves.push({
          playerId: player.id,
          cardId: card.id,
          pegId: pegId,
          from: pegSpace.id,
          destinations: [spaceId],
          metadata: {
            bumpedPegId: targetPegId,
            bumpDestination: homeSlot.id
          }
        });
      });
    });
    
    console.log(`[getJokerMoves] Found ${opponentPegsFound} opponent pegs for peg ${pegId} in spaces: ${spacesWithOpponents.join(', ')}`);
  });
  
  // Log detailed info about each generated move
  console.log(`[getJokerMoves] Generated ${moves.length} possible joker moves total`);
  if (moves.length > 0) {
    moves.forEach((move, index) => {
      console.log(`[getJokerMoves] Move ${index + 1}: peg ${move.pegId} from ${move.from} to ${move.destinations[0]}, bump peg ${move.metadata?.bumpedPegId} to ${move.metadata?.bumpDestination}`);
    });
  }
  
  return moves;
};

const getAceMoves = (gameState: GameState, player: Player, card: Card): Move[] => {
  const moves: Move[] = [];
  
  // For each of the player's pegs
  player.pegs.forEach(pegId => {
    const pegSpace = findSpaceForPeg(gameState, pegId);
    if (!pegSpace) return;
    
    // Special handling for pegs already in the castle
    if (pegSpace.type === 'castle') {
      // Get the player's section
      const playerSection = gameState.board.sections.find(section => 
        section.playerIds?.includes(player.id)
      );
      
      if (playerSection) {
        const currentCastleIndex = pegSpace.index;
        const newCastleIndex = currentCastleIndex + 1; // Ace moves 1 space
        
        // Check if the move would exceed the final castle slot (index 4)
        if (newCastleIndex <= 4) {
          // Find the destination castle space
          const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
            s.sectionIndex === playerSection.index && 
            s.type === 'castle' && 
            s.index === newCastleIndex
          );
          
          if (castleDestinationSpace) {
            // Check if this castle space already has a peg of the same color
            const hasSameColorPeg = castleDestinationSpace.pegs.some(existingPegId => {
              const [existingPlayerId] = existingPegId.split('-peg-');
              return existingPlayerId === player.id;
            });
            
            if (!hasSameColorPeg) {
              moves.push({
                playerId: player.id,
                cardId: card.id,
                pegId: pegId,
                from: pegSpace.id,
                destinations: [castleDestinationSpace.id],
                metadata: {
                  castleMovement: true
                }
              });
            }
          }
        }
        return; // No need to process further movement logic for castle pegs
      }
    }
    
    // If peg is in home space, can move to slot 8
    if (pegSpace.type === 'home') {
      // Find the section for this player
      const playerSection = gameState.board.sections.find(section => 
        section.playerIds?.includes(player.id)
      );
      
      if (playerSection) {
        // Check if slot 8 is blocked
        if (isSlot8Blocked(gameState, playerSection)) {
          return;
        }

        // Find slot 8 in the player's section
        const slot8Space = Array.from(gameState.board.allSpaces.values()).find(s => {
          const isCorrectSection = s.id.startsWith(playerSection.id);
          const isValidSpace = s.type === 'normal' || s.type === 'entrance';
          const isSlot8 = s.index === 8;
          return isCorrectSection && isValidSpace && isSlot8;
        });
        
        if (slot8Space) {
          moves.push({
            playerId: player.id,
            cardId: card.id,
            pegId: pegId,
            from: pegSpace.id,
            destinations: [slot8Space.id]
          });
        }
      }
    }
    // If peg is on slot 0, can jump to next section's slot 0 (corner to corner)
    else if ((pegSpace.type === 'normal' || pegSpace.type === 'entrance') && pegSpace.index === 0) {
      // Find next section's slot 0
      const nextSectionIndex = (pegSpace.sectionIndex + 1) % gameState.board.sections.length;
      const cornerSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
        s.sectionIndex === nextSectionIndex && 
        (s.type === 'normal' || s.type === 'entrance') && 
        s.index === 0
      );
      
      if (cornerSpace) {
        // Check if destination has same color peg
        const hasSameColorPeg = cornerSpace.pegs.some(existingPegId => {
          const [existingPlayerId] = existingPegId.split('-peg-');
          return existingPlayerId === player.id;
        });
        
        if (!hasSameColorPeg) {
          moves.push({
            playerId: player.id,
            cardId: card.id,
            pegId: pegId,
            from: pegSpace.id,
            destinations: [cornerSpace.id]
          });
        }
      }
    } 
    // If peg is on a normal space or entrance, move 1 space forward
    else if (pegSpace.type === 'normal' || pegSpace.type === 'entrance') {
      let currentSectionIndex = pegSpace.sectionIndex;
      let currentIndex = pegSpace.index;
      
      // Check if the peg is at its own castle entrance (index 3 in player's section)
      const playerSection = gameState.board.sections.find(section => 
        section.playerIds?.includes(player.id)
      );
      
      const isAtCastleEntrance = playerSection && 
                                 pegSpace.sectionIndex === playerSection.index && 
                                 pegSpace.index === 3;
      
      // Find max index in current section
      const maxIndex = Math.max(...Array.from(gameState.board.allSpaces.values())
        .filter(s => s.sectionIndex === currentSectionIndex && s.type === 'normal')
        .map(s => s.index));
      
      // If at end of section, move to next section's slot 0
      if (currentIndex === maxIndex) {
        currentSectionIndex = (currentSectionIndex + 1) % gameState.board.sections.length;
        currentIndex = 0;
      } else {
        // Move forward one space
        currentIndex++;
      }
      
      // Find the destination space
      const destinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
        s.sectionIndex === currentSectionIndex && 
        (s.type === 'normal' || s.type === 'entrance') && 
        s.index === currentIndex
      );
      
      if (destinationSpace) {
        // Check if destination has same color peg
        const hasSameColorPeg = destinationSpace.pegs.some(existingPegId => {
          const [existingPlayerId] = existingPegId.split('-peg-');
          return existingPlayerId === player.id;
        });
        
        if (!hasSameColorPeg) {
          // Add regular move
          moves.push({
            playerId: player.id,
            cardId: card.id,
            pegId: pegId,
            from: pegSpace.id,
            destinations: [destinationSpace.id]
          });
          
          // If moving from castle entrance, add a castle entry option too
          if (isAtCastleEntrance && playerSection) {
            // Find the castle space at index 0
            const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
              s.sectionIndex === playerSection.index && 
              s.type === 'castle' && 
              s.index === 0
            );
            
            if (castleDestinationSpace) {
              // Check if this castle space already has a peg of the same color
              const hasSameColorPegInCastle = castleDestinationSpace.pegs.some(existingPegId => {
                const [existingPlayerId] = existingPegId.split('-peg-');
                return existingPlayerId === player.id;
              });
              
              // Only add the castle entry move if there's no same-color peg blocking it
              if (!hasSameColorPegInCastle) {
                moves.push({
                  playerId: player.id,
                  cardId: card.id,
                  pegId: pegId,
                  from: pegSpace.id,
                  destinations: [castleDestinationSpace.id],
                  metadata: {
                    castleEntry: true,
                    castleMovement: true
                  }
                });
              }
            }
          }
        }
      }
    }
  });
  
  return moves;
};

const getFaceCardMoves = (gameState: GameState, player: Player, card: Card): Move[] => {
  const moves: Move[] = [];
  
  // For each of the player's pegs
  player.pegs.forEach(pegId => {
    const pegSpace = findSpaceForPeg(gameState, pegId);
    if (!pegSpace) return;
    
    // Special handling for pegs already in the castle
    if (pegSpace.type === 'castle') {
      // Get the player's section
      const playerSection = gameState.board.sections.find(section => 
        section.playerIds?.includes(player.id)
      );
      
      if (playerSection) {
        const currentCastleIndex = pegSpace.index;
        const newCastleIndex = currentCastleIndex + 10; // Face cards move 10 spaces
        
        // Check if the move would exceed the final castle slot (index 4)
        if (newCastleIndex <= 4) {
          // Find the destination castle space
          const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
            s.sectionIndex === playerSection.index && 
            s.type === 'castle' && 
            s.index === newCastleIndex
          );
          
          if (castleDestinationSpace) {
            // Check if this castle space already has a peg of the same color
            const hasSameColorPeg = castleDestinationSpace.pegs.some(existingPegId => {
              const [existingPlayerId] = existingPegId.split('-peg-');
              return existingPlayerId === player.id;
            });
            
            if (!hasSameColorPeg) {
              // Check if move would jump over own pegs in castle
              let wouldJump = false;
              for (let i = currentCastleIndex + 1; i < newCastleIndex; i++) {
                const intermediateSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
                  s.sectionIndex === playerSection.index && 
                  s.type === 'castle' && 
                  s.index === i
                );
                
                if (intermediateSpace && intermediateSpace.pegs.some(existingPegId => {
                  const [existingPlayerId] = existingPegId.split('-peg-');
                  return existingPlayerId === player.id;
                })) {
                  wouldJump = true;
                  break;
                }
              }
              
              if (!wouldJump) {
                moves.push({
                  playerId: player.id,
                  cardId: card.id,
                  pegId: pegId,
                  from: pegSpace.id,
                  destinations: [castleDestinationSpace.id],
                  metadata: {
                    castleMovement: true
                  }
                });
              }
            }
          }
        }
        return; // No need to process further movement logic for castle pegs
      }
    }
    
    // If peg is in home space, can move to slot 8
    if (pegSpace.type === 'home') {
      // Find the section for this player
      const playerSection = gameState.board.sections.find(section => 
        section.playerIds?.includes(player.id)
      );
      
      if (playerSection) {
        // Check if slot 8 is blocked
        if (isSlot8Blocked(gameState, playerSection)) {
          return;
        }

        // Find slot 8 in the player's section
        const slot8Space = Array.from(gameState.board.allSpaces.values()).find(s => {
          const isCorrectSection = s.id.startsWith(playerSection.id);
          const isValidSpace = s.type === 'normal' || s.type === 'entrance';
          const isSlot8 = s.index === 8;
          return isCorrectSection && isValidSpace && isSlot8;
        });
        
        if (slot8Space) {
          moves.push({
            playerId: player.id,
            cardId: card.id,
            pegId: pegId,
            from: pegSpace.id,
            destinations: [slot8Space.id]
          });
        }
      }
    }
    // If peg is on a normal space or entrance, move 10 spaces forward
    else if (pegSpace.type === 'normal' || pegSpace.type === 'entrance') {
      let currentSectionIndex = pegSpace.sectionIndex;
      let currentIndex = pegSpace.index;
      let remainingSteps = 10;
      
      // Calculate final position after 10 steps
      while (remainingSteps > 0) {
        // Find max index in current section
        const maxIndex = Math.max(...Array.from(gameState.board.allSpaces.values())
          .filter(s => s.sectionIndex === currentSectionIndex && s.type === 'normal')
          .map(s => s.index));
        
        // If we can complete the move in current section
        if (currentIndex + remainingSteps <= maxIndex) {
          currentIndex += remainingSteps;
          remainingSteps = 0;
        } else {
          // Move to next section
          const stepsInCurrentSection = maxIndex - currentIndex;
          remainingSteps -= (stepsInCurrentSection + 1);
          currentSectionIndex = (currentSectionIndex + 1) % gameState.board.sections.length;
          currentIndex = 0;
        }
      }
      
      // Find the destination space
      const destinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
        s.sectionIndex === currentSectionIndex && 
        (s.type === 'normal' || s.type === 'entrance') && 
        s.index === currentIndex
      );
      
      if (destinationSpace) {
        // Check if destination has same color peg
        const hasSameColorPeg = destinationSpace.pegs.some(existingPegId => {
          const [existingPlayerId] = existingPegId.split('-peg-');
          return existingPlayerId === player.id;
        });
        
        if (!hasSameColorPeg) {
          // Check if move would jump over own pegs
          if (wouldJumpOverOwnPeg(gameState, player, pegSpace, destinationSpace, false)) {
            return; // Skip this move if it would jump over own peg
          }
          
          moves.push({
            playerId: player.id,
            cardId: card.id,
            pegId: pegId,
            from: pegSpace.id,
            destinations: [destinationSpace.id]
          });
        }
      }
    }
  });
  
  return moves;
};

// Regular number cards (2, 3, 4, 5, 6, 10)
const getRegularMoves = (gameState: GameState, player: Player, card: Card): Move[] => {
  const moves: Move[] = [];
  
  // For each of the player's pegs
  player.pegs.forEach(pegId => {
    const pegSpace = findSpaceForPeg(gameState, pegId);
    if (!pegSpace) return;
    
    // Skip pegs in home
    if (pegSpace.type === 'home') {
      return;
    }
    
    // Special handling for pegs already in the castle
    if (pegSpace.type === 'castle') {
      // Get the player's section
      const playerSection = gameState.board.sections.find(section => 
        section.playerIds?.includes(player.id)
      );
      
      if (playerSection) {
        const currentCastleIndex = pegSpace.index;
        const newCastleIndex = currentCastleIndex + card.value;
        
        // Check if the move would exceed the final castle slot (index 4)
        if (newCastleIndex <= 4) {
          // Find the destination castle space
          const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
            s.sectionIndex === playerSection.index && 
            s.type === 'castle' && 
            s.index === newCastleIndex
          );
          
          if (castleDestinationSpace) {
            // Check if this castle space already has a peg of the same color
            const hasSameColorPeg = castleDestinationSpace.pegs.some(existingPegId => {
              const [existingPlayerId] = existingPegId.split('-peg-');
              return existingPlayerId === player.id;
            });
            
            if (!hasSameColorPeg) {
              // Check if move would jump over own pegs in castle
              let wouldJump = false;
              for (let i = currentCastleIndex + 1; i < newCastleIndex; i++) {
                const intermediateSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
                  s.sectionIndex === playerSection.index && 
                  s.type === 'castle' && 
                  s.index === i
                );
                
                if (intermediateSpace && intermediateSpace.pegs.some(existingPegId => {
                  const [existingPlayerId] = existingPegId.split('-peg-');
                  return existingPlayerId === player.id;
                })) {
                  wouldJump = true;
                  break;
                }
              }
              
              if (!wouldJump) {
                moves.push({
                  playerId: player.id,
                  cardId: card.id,
                  pegId: pegId,
                  from: pegSpace.id,
                  destinations: [castleDestinationSpace.id],
                  metadata: {
                    castleMovement: true
                  }
                });
              }
            }
          }
        }
        return; // No need to process further movement logic for castle pegs
      }
    }
    
    // Regular movement for pegs on the board
    let remainingSteps = card.value;
    let currentIndex = pegSpace.index;
    let currentSectionIndex = pegSpace.sectionIndex;
    
    // Check if this peg is in the player's own section and should be prompted about entering castle
    let shouldPromptCastleEntry = false;
    let willPassCastleEntrance = false;
    let willLandOnCastleEntrance = false; // New flag to track if peg will land exactly on castle entrance
    
    // Get the player's section - this is where their castle is
    const playerSection = gameState.board.sections.find(section => 
      section.playerIds?.includes(player.id)
    );
    
    // Find the player's section index (which may be different from current section)
    const playerSectionIndex = playerSection?.index;
    
    // Check if peg is at the castle entrance
    const isCastleEntrance = pegSpace.type === 'entrance' && pegSpace.index === 3 && currentSectionIndex === playerSectionIndex;
    
    // If at castle entrance, any forward move will prompt castle entry
    if (isCastleEntrance) {
      shouldPromptCastleEntry = true;
      // If the peg is already at the castle entrance, it will pass it with any forward movement
      willPassCastleEntrance = true;
      console.log(`[getRegularMoves] Peg is at castle entrance in section ${currentSectionIndex}, will pass it with forward movement`);
    } 
    // If in same section as player's castle but not at entrance
    else if ((pegSpace.type === 'normal' || pegSpace.type === 'entrance') && currentSectionIndex === playerSectionIndex) {
      // Check if the move would pass the castle entrance position (index 3)
      // Castle entrance is at index 3 in the player's section
      const castleEntranceIndex = 3;
      
      // If we're before the castle entrance and would move past it
      if (pegSpace.index < castleEntranceIndex) {
        if (pegSpace.index + remainingSteps > castleEntranceIndex) {
          willPassCastleEntrance = true;
        } else if (pegSpace.index + remainingSteps === castleEntranceIndex) {
          willLandOnCastleEntrance = true;
          console.log(`[getRegularMoves] Will land exactly on castle entrance in section ${currentSectionIndex}`);
        }
      }
    }
    
    // Calculate path to detect if peg will pass any castle entrance during section transitions
    let pathSteps = remainingSteps;
    let pathIndex = pegSpace.index;
    let pathSectionIndex = pegSpace.sectionIndex;
    
    // Simulate the move step by step to check if we pass the player's castle entrance
    while (pathSteps > 0) {
      // Find max index in current section
      const maxIndex = Math.max(...Array.from(gameState.board.allSpaces.values())
        .filter(s => s.sectionIndex === pathSectionIndex && s.type === 'normal')
        .map(s => s.index));
      
      console.log(`[getRegularMoves] Checking path: section=${pathSectionIndex}, index=${pathIndex}, steps=${pathSteps}, playerSection=${playerSectionIndex}`);
      
      // If we can complete the steps in current section
      if (pathIndex + pathSteps <= maxIndex) {
        // Check if we would pass the castle entrance
        if (pathSectionIndex === playerSectionIndex && pathIndex < 3) { 
          if (pathIndex + pathSteps > 3) { // Would move past castle entrance
            console.log(`[getRegularMoves] Will pass castle entrance within section ${pathSectionIndex}`);
            willPassCastleEntrance = true;
          } else if (pathIndex + pathSteps === 3) { // Would land exactly on castle entrance
            console.log(`[getRegularMoves] Will land exactly on castle entrance within section ${pathSectionIndex}`);
            willLandOnCastleEntrance = true;
            // Do not set willPassCastleEntrance to true here
          }
        }
        pathIndex += pathSteps;
        pathSteps = 0;
      } else {
        // Check if we pass castle entrance in current section
        if (pathSectionIndex === playerSectionIndex && pathIndex < 3) {
          console.log(`[getRegularMoves] Will pass castle entrance when exiting section ${pathSectionIndex}`);
          willPassCastleEntrance = true;
        }
        
        // Move to next section
        const stepsInCurrentSection = maxIndex - pathIndex;
        pathSteps -= (stepsInCurrentSection + 1);
        pathSectionIndex = (pathSectionIndex + 1) % gameState.board.sections.length;
        
        console.log(`[getRegularMoves] Moving to next section: ${pathSectionIndex}, remaining steps: ${pathSteps}`);
        
        // When entering a new section, check if it's the player's section
        if (pathSectionIndex === playerSectionIndex) {
          // If entering player's section with exactly 3 steps, will land on castle entrance
          if (pathSteps === 3) {
            console.log(`[getRegularMoves] Will land exactly on castle entrance when entering player's section ${pathSectionIndex}`);
            willLandOnCastleEntrance = true;
          }
          // If entering the player's section with more than 3 steps remaining,
          // they'll pass the castle entrance
          else if (pathSteps > 3) {
            console.log(`[getRegularMoves] Will pass castle entrance when entering player's section ${pathSectionIndex}`);
            willPassCastleEntrance = true;
          }
        }
        
        pathIndex = 0;
      }
    }
    
    console.log(`[getRegularMoves] Will pass castle entrance? ${willPassCastleEntrance}`);
    console.log(`[getRegularMoves] Will land on castle entrance? ${willLandOnCastleEntrance}`);
    
    // Calculate destination for normal move (without entering castle)
    // Calculate final position after movement
    while (remainingSteps > 0) {
      // Find max index in current section
      const maxIndex = Math.max(...Array.from(gameState.board.allSpaces.values())
        .filter(s => s.sectionIndex === currentSectionIndex && s.type === 'normal')
        .map(s => s.index));
      
      // If we can complete the move in current section
      if (currentIndex + remainingSteps <= maxIndex) {
        currentIndex += remainingSteps;
        remainingSteps = 0;
      } else {
        // Move to next section
        const stepsInCurrentSection = maxIndex - currentIndex;
        remainingSteps -= (stepsInCurrentSection + 1);
        currentSectionIndex = (currentSectionIndex + 1) % gameState.board.sections.length;
        currentIndex = 0;
      }
    }
    
    // Find the destination space for normal move
    let destinationSpace;
    
    // Special handling for landing exactly on castle entrance
    if (willLandOnCastleEntrance && playerSection) {
      console.log(`[getRegularMoves] Looking for entrance space in section ${playerSection.index}`);
      // Find the entrance space in the player's section
      destinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
        s.sectionIndex === playerSection.index && 
        s.type === 'entrance' && 
        s.index === 3
      );
    } else {
      // Find regular destination space
      destinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
        s.sectionIndex === currentSectionIndex && 
        (s.type === 'normal' || s.type === 'entrance') && // Allow entrance spaces
        s.index === currentIndex
      );
    }
    
    if (destinationSpace) {
      console.log(`[getRegularMoves] Found destination space: ${destinationSpace.id}, type: ${destinationSpace.type}`);
      
      // Check if the destination space already has a peg of the same color
      const hasSameColorPeg = destinationSpace.pegs.some(existingPegId => {
        const [existingPlayerId] = existingPegId.split('-peg-');
        return existingPlayerId === player.id;
      });
      
      if (hasSameColorPeg) {
        console.log(`[getRegularMoves] Destination has same color peg, skipping move`);
        // Skip this move if destination has a peg of same color
      }
      // Check if move would jump over own pegs
      else if (wouldJumpOverOwnPeg(gameState, player, pegSpace, destinationSpace, false)) {
        console.log(`[getRegularMoves] Move would jump over own peg, skipping`);
        // Skip this move if it would jump over own peg
      }
      else {
        // For the regular path (not entering castle)
        console.log(`[getRegularMoves] Adding regular move from ${pegSpace.id} to ${destinationSpace.id}`);
        moves.push({
          playerId: player.id,
          cardId: card.id,
          pegId: pegId,
          from: pegSpace.id,
          destinations: [destinationSpace.id],
          metadata: {
            willPassCastleEntrance: willPassCastleEntrance,
            willLandOnCastleEntrance: willLandOnCastleEntrance
          }
        });
      }
    } else {
      console.log(`[getRegularMoves] Could not find destination space for section ${currentSectionIndex}, index ${currentIndex}`);
    }
    
    // If we need to handle castle entry, calculate castle move as an alternative
    // Only if actually passing the castle entrance (not just landing on it)
    if (willPassCastleEntrance && playerSection) {
      console.log(`[getRegularMoves] Calculating castle entry for peg ${pegId}: shouldPromptCastleEntry=${shouldPromptCastleEntry}, willPassCastleEntrance=${willPassCastleEntrance}`);
      
      // Calculate remaining steps for castle move
      let castleSteps = card.value;
      
      // If we're not at the castle entrance, subtract steps needed to reach it
      if (!shouldPromptCastleEntry && willPassCastleEntrance) {
        // If we're in the player's section, calculate steps to castle entrance
        if (pegSpace.sectionIndex === playerSection.index) {
          const stepsToEntrance = 3 - pegSpace.index;
          castleSteps -= stepsToEntrance;
          console.log(`[getRegularMoves] In player's section: steps to castle entrance=${stepsToEntrance}, remaining castle steps=${castleSteps}`);
        } else {
          // We're in a different section, need to calculate total steps to reach castle entrance
          let stepsToPlayerSection = 0;
          let currentSec = pegSpace.sectionIndex;
          let currentIdx = pegSpace.index;
          
          console.log(`[getRegularMoves] In different section: current=${currentSec}, player section=${playerSection.index}`);
          
          // Calculate steps to reach player's section
          while (currentSec !== playerSection.index) {
            // Find max index in current section
            const maxIndex = Math.max(...Array.from(gameState.board.allSpaces.values())
              .filter(s => s.sectionIndex === currentSec && s.type === 'normal')
              .map(s => s.index));
            
            // Steps to end of current section
            const stepsToEndOfSection = maxIndex - currentIdx + 1;
            stepsToPlayerSection += stepsToEndOfSection;
            
            console.log(`[getRegularMoves] Steps to end of section ${currentSec}=${stepsToEndOfSection}, total=${stepsToPlayerSection}`);
            
            // Move to next section
            currentSec = (currentSec + 1) % gameState.board.sections.length;
            currentIdx = 0;
          }
          
          // Add steps to reach castle entrance in player's section
          stepsToPlayerSection += 3;
          
          console.log(`[getRegularMoves] Total steps to castle entrance=${stepsToPlayerSection}`);
          
          // Subtract steps to reach castle entrance
          castleSteps -= stepsToPlayerSection;
          console.log(`[getRegularMoves] Remaining castle steps=${castleSteps}`);
        }
      }
      
      // Check if this would move past the final castle slot
      if (castleSteps <= 5 && castleSteps > 0) { // Castle has 5 slots (0-4) and we need at least 1 step
        console.log(`[getRegularMoves] Valid castle steps (${castleSteps}), finding castle destination`);
        
        // Find a castle space in the player's section with the proper index
        const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
          s.sectionIndex === playerSection.index && 
          s.type === 'castle' && 
          s.index === castleSteps - 1 // Convert to 0-based index
        );
        
        if (castleDestinationSpace) {
          console.log(`[getRegularMoves] Found castle destination: ${castleDestinationSpace.id}`);
          
          // Check if this castle space already has a peg of the same color
          const hasSameColorPeg = castleDestinationSpace.pegs.some(existingPegId => {
            const [existingPlayerId] = existingPegId.split('-peg-');
            return existingPlayerId === player.id;
          });
          
          if (!hasSameColorPeg) {
            console.log(`[getRegularMoves] Adding castle entry move for peg ${pegId} to ${castleDestinationSpace.id}`);
            
            // Add the castle entry option as a second possible move
            moves.push({
              playerId: player.id,
              cardId: card.id,
              pegId: pegId,
              from: pegSpace.id,
              destinations: [castleDestinationSpace.id],
              metadata: {
                castleMovement: true
              }
            });
          } else {
            console.log(`[getRegularMoves] Castle destination ${castleDestinationSpace.id} is blocked by own peg`);
          }
        } else {
          console.log(`[getRegularMoves] Could not find castle destination for index ${castleSteps - 1}`);
        }
      } else {
        console.log(`[getRegularMoves] Invalid castle steps: ${castleSteps} (must be 1-5)`);
      }
    }
  });
  
  console.log(`[getRegularMoves] Generated ${moves.length} possible moves total`);
  
  return moves;
};

// Special implementation for Eight - reverse movement
const getEightMoves = (gameState: GameState, player: Player, card: Card): Move[] => {
  const moves: Move[] = [];
  
  console.log(`[getEightMoves] Processing for player ${player.id} with card ${card.id}`);
  
  // For each of the player's pegs
  player.pegs.forEach(pegId => {
    const pegSpace = findSpaceForPeg(gameState, pegId);
    if (!pegSpace) {
      console.log(`[getEightMoves] No space found for peg ${pegId}`);
      return;
    }
    
    console.log(`[getEightMoves] Processing peg ${pegId} at space ${pegSpace.id} (section ${pegSpace.sectionIndex}, index ${pegSpace.index})`);
    
    // Special handling for pegs in castle - allow backward movement
    if (pegSpace.type === 'castle') {
      // Get the player's section
      const playerSection = gameState.board.sections.find(section => 
        section.playerIds?.includes(player.id)
      );
      
      if (playerSection) {
        const currentCastleIndex = pegSpace.index;
        
        // For Eight card, we move 8 spaces backward
        // If this would move the peg out of the castle, we need special handling
        if (currentCastleIndex - 8 >= 0) {
          // If we can stay within the castle, find that space
          const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
            s.sectionIndex === playerSection.index && 
            s.type === 'castle' && 
            s.index === currentCastleIndex - 8
          );
          
          if (castleDestinationSpace) {
            // Check if this castle space already has a peg of the same color
            const hasSameColorPeg = castleDestinationSpace.pegs.some(existingPegId => {
              const [existingPlayerId] = existingPegId.split('-peg-');
              return existingPlayerId === player.id;
            });
            
            if (!hasSameColorPeg) {
              // Check if move would jump over own pegs in castle
              let wouldJump = false;
              for (let i = currentCastleIndex - 1; i > currentCastleIndex - 8; i--) {
                const intermediateSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
                  s.sectionIndex === playerSection.index && 
                  s.type === 'castle' && 
                  s.index === i
                );
                
                if (intermediateSpace && intermediateSpace.pegs.some(existingPegId => {
                  const [existingPlayerId] = existingPegId.split('-peg-');
                  return existingPlayerId === player.id;
                })) {
                  wouldJump = true;
                  break;
                }
              }
              
              if (!wouldJump) {
                console.log(`[getEightMoves] Adding castle move from ${pegSpace.id} to ${castleDestinationSpace.id}`);
                moves.push({
                  playerId: player.id,
                  cardId: card.id,
                  pegId: pegId,
                  from: pegSpace.id,
                  destinations: [castleDestinationSpace.id],
                  metadata: {
                    castleMovement: true
                  }
                });
              }
            }
          }
        } else {
          // If the peg would move out of the castle, find the entrance space
          const entranceSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
            s.sectionIndex === playerSection.index && 
            s.type === 'entrance' && 
            s.index === 3
          );
          
          if (entranceSpace) {
            // Eight card moves 8 spaces backward, we already counted the castle index + 1 (to get to entrance)
            // So we need to move 7 - currentCastleIndex more spaces backward from the entrance
            let remainingSteps = 7 - currentCastleIndex;
            let currentIndex = 3; // Entrance at index 3
            let currentSectionIndex = playerSection.index;
            
            console.log(`[getEightMoves] Moving out of castle with ${remainingSteps} remaining steps`);
            
            // Calculate final position after backward movement
            while (remainingSteps > 0) {
              // If we can complete the move in current section
              if (currentIndex - remainingSteps >= 0) {
                currentIndex -= remainingSteps;
                remainingSteps = 0;
              } else {
                // Move to previous section
                const stepsInCurrentSection = currentIndex + 1; // +1 because we count the move to previous section
                remainingSteps -= stepsInCurrentSection;
                currentSectionIndex = (currentSectionIndex - 1 + gameState.board.sections.length) % gameState.board.sections.length;
                
                // Find max index in the new section
                const maxIndex = Math.max(...Array.from(gameState.board.allSpaces.values())
                  .filter(s => s.sectionIndex === currentSectionIndex && s.type === 'normal')
                  .map(s => s.index));
                
                currentIndex = maxIndex;
                
                console.log(`[getEightMoves] Moved to previous section ${currentSectionIndex} at index ${currentIndex} with ${remainingSteps} steps left`);
              }
            }
            
            // Find the destination space
            const destinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
              s.sectionIndex === currentSectionIndex && 
              (s.type === 'normal' || s.type === 'entrance') && 
              s.index === currentIndex
            );
            
            if (destinationSpace) {
              console.log(`[getEightMoves] Found destination space ${destinationSpace.id} at section ${destinationSpace.sectionIndex}, index ${destinationSpace.index}`);
              
              // Check if destination has same color peg
              const hasSameColorPeg = destinationSpace.pegs.some(existingPegId => {
                const [existingPlayerId] = existingPegId.split('-peg-');
                return existingPlayerId === player.id;
              });
              
              if (!hasSameColorPeg) {
                console.log(`[getEightMoves] Adding move from castle to ${destinationSpace.id}`);
                moves.push({
                  playerId: player.id,
                  cardId: card.id,
                  pegId: pegId,
                  from: pegSpace.id,
                  destinations: [destinationSpace.id]
                });
              } else {
                console.log(`[getEightMoves] Destination has same color peg, skipping move`);
              }
            } else {
              console.log(`[getEightMoves] No destination space found at section ${currentSectionIndex}, index ${currentIndex}`);
            }
          }
        }
        return; // No need to process further movement logic for castle pegs
      }
    }
    
    // If peg is on a normal space or entrance, move backwards by 8
    if (pegSpace.type === 'normal' || pegSpace.type === 'entrance' || pegSpace.type === 'corner') {
      let remainingSteps = 8;
      let currentIndex = pegSpace.index;
      let currentSectionIndex = pegSpace.sectionIndex;
      
      console.log(`[getEightMoves] Moving backwards ${remainingSteps} steps from section ${currentSectionIndex}, index ${currentIndex}`);
      
      // Calculate final position after backward movement
      while (remainingSteps > 0) {
        // If we can complete the move in current section
        if (currentIndex - remainingSteps >= 0) {
          currentIndex -= remainingSteps;
          remainingSteps = 0;
          console.log(`[getEightMoves] Moved within section to index ${currentIndex}, ${remainingSteps} steps left`);
        } else {
          // Move to previous section
          const stepsInCurrentSection = currentIndex + 1; // +1 because we count the move to previous section
          remainingSteps -= stepsInCurrentSection;
          currentSectionIndex = (currentSectionIndex - 1 + gameState.board.sections.length) % gameState.board.sections.length;
          
          // Find max index in the new section
          const normalSpacesInSection = Array.from(gameState.board.allSpaces.values())
            .filter(s => s.sectionIndex === currentSectionIndex && s.type === 'normal');
          
          if (normalSpacesInSection.length === 0) {
            console.log(`[getEightMoves] No normal spaces found in section ${currentSectionIndex}`);
            return; // Skip this move if we can't find normal spaces in the section
          }
          
          const maxIndex = Math.max(...normalSpacesInSection.map(s => s.index));
          currentIndex = maxIndex;
          
          console.log(`[getEightMoves] Moved to previous section ${currentSectionIndex} at index ${currentIndex} with ${remainingSteps} steps left`);
        }
      }
      
      // Find the destination space
      const destinationSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
        s.sectionIndex === currentSectionIndex && 
        (s.type === 'normal' || s.type === 'entrance' || s.type === 'corner') && 
        s.index === currentIndex
      );
      
      if (destinationSpace) {
        console.log(`[getEightMoves] Found destination space ${destinationSpace.id} at section ${destinationSpace.sectionIndex}, index ${destinationSpace.index}`);
        
        // Check if destination has same color peg
        const hasSameColorPeg = destinationSpace.pegs.some(existingPegId => {
          const [existingPlayerId] = existingPegId.split('-peg-');
          return existingPlayerId === player.id;
        });
        
        if (!hasSameColorPeg) {
          // For 8 card backward movement across sections, we'll be more lenient with jump checks
          // only check for jumps if we're staying in the same section
          let shouldSkipMove = false;
          
          if (pegSpace.sectionIndex === destinationSpace.sectionIndex) {
            // Same section - do normal jump check
            shouldSkipMove = wouldJumpOverOwnPeg(gameState, player, pegSpace, destinationSpace, false);
            console.log(`[getEightMoves] Same section jump check: ${shouldSkipMove}`);
          } else {
            // Different sections - more lenient check
            // This is a special case for backward movement across sections
            // We'll allow it if the move is valid otherwise
            console.log(`[getEightMoves] Cross-section backward move - bypassing normal jump check`);
            shouldSkipMove = false;
          }
          
          if (!shouldSkipMove) {
            console.log(`[getEightMoves] Adding backward move from ${pegSpace.id} to ${destinationSpace.id}`);
            moves.push({
              playerId: player.id,
              cardId: card.id,
              pegId: pegId,
              from: pegSpace.id,
              destinations: [destinationSpace.id]
            });
          } else {
            console.log(`[getEightMoves] Would jump over own peg, skipping move`);
          }
        } else {
          console.log(`[getEightMoves] Destination has same color peg, skipping move`);
        }
      } else {
        console.log(`[getEightMoves] No destination space found at section ${currentSectionIndex}, index ${currentIndex}`);
      }
    }
  });
  
  console.log(`[getEightMoves] Generated ${moves.length} total moves`);
  return moves;
};

// Handle bumping pegs
const handleBump = (gameState: GameState, space: BoardSpace, playerId: string): { bumpedPegId: string, bumpDestination: string, bumpingPlayerName: string, bumpedPlayerName: string } | undefined => {
  // Make a copy of the pegs array to avoid modifying while iterating
  const pegsToProcess = [...space.pegs];
  
  // For each peg in the space
  for (const pegId of pegsToProcess) {
    // Only process pegs that belong to other players
    const [pegPlayerId] = pegId.split('-peg-');
    if (pegPlayerId === playerId) continue; // Skip own pegs
    
    const pegPlayer = gameState.players.find(p => p.id === pegPlayerId);
    const bumpingPlayer = gameState.players.find(p => p.id === playerId);
    if (!pegPlayer || !bumpingPlayer) continue; // Players not found
    
    // Find an available home slot for the bumped peg
    const homeSlot = findAvailableHomeSlot(gameState, pegPlayerId);
    if (!homeSlot) {
      return undefined;
    }
    
    // Remove peg from current space
    space.pegs = space.pegs.filter(id => id !== pegId);
    
    // Add peg to home slot
    homeSlot.pegs.push(pegId);
    
    // Return bump information
    return {
      bumpedPegId: pegId,
      bumpDestination: homeSlot.id,
      bumpingPlayerName: bumpingPlayer.name,
      bumpedPlayerName: pegPlayer.name
    };
  }
  
  return undefined;
}; 