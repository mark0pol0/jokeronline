import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Board as BoardModel, BoardSpace, BoardSection } from '../../models/BoardModel';
import './Board.css';

interface BoardProps {
  board: BoardModel;
  onSpaceClick: (spaceId: string) => void;
  selectableSpaceIds: string[];
  selectablePegIds: string[];
  playerColors: Record<string, string>;
  onPegSelect: (pegId: string) => void;
  selectedPegId: string | null;
  currentPlayerId: string;
  zoomLevel: number;
}

interface Point {
  x: number;
  y: number;
}

interface BoardTransform {
  scale: number;
  translate: Point;
}

const Board: React.FC<BoardProps> = ({ 
  board, 
  onSpaceClick, 
  selectableSpaceIds,
  selectablePegIds,
  playerColors,
  onPegSelect,
  selectedPegId,
  currentPlayerId,
  zoomLevel
}) => {
  const [transform, setTransform] = useState<BoardTransform>({ scale: 1, translate: { x: 0, y: 0 } });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [boardCenter, setBoardCenter] = useState<Point>({ x: 700, y: 700 }); // Default center point
  const boardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // State for background circle size
  const [backgroundCircleSize, setBackgroundCircleSize] = useState<number>(1300);
  
  // Calculate the true center of the board based on castle positions
  const calculateTrueCenter = useCallback(() => {
    if (!board.allSpaces) return { x: 700, y: 700 }; // Default center
    
    // Find all castle spaces
    const castleSpaces = Array.from(board.allSpaces.values())
      .filter(space => space.type === 'castle');
    
    if (castleSpaces.length === 0) return { x: 700, y: 700 }; // Default if no castles
    
    // Calculate the average position of all castle spaces
    const sumX = castleSpaces.reduce((sum, space) => sum + space.x, 0);
    const sumY = castleSpaces.reduce((sum, space) => sum + space.y, 0);
    
    const center = {
      x: sumX / castleSpaces.length,
      y: sumY / castleSpaces.length
    };
    
    return center;
  }, [board.allSpaces]);

  // Calculate the size for the background circle
  const calculateBackgroundCircleSize = useCallback(() => {
    if (!board.allSpaces) return 1300; // Default size
    
    // Get all spaces except starting spaces
    const spaces = Array.from(board.allSpaces.values())
      .filter(space => space.type !== 'starting');
    
    // Find the maximum distance from center to any space
    let maxDistance = 0;
    const center = boardCenter; // Use the current board center for consistency
    
    for (const space of spaces) {
      // Calculate distance from center to this space
      const distX = space.x - center.x;
      const distY = space.y - center.y;
      const distance = Math.sqrt(distX * distX + distY * distY);
      
      if (distance > maxDistance) {
        maxDistance = distance;
      }
    }
    
    // Double the max distance for diameter and add a small margin
    // The margin is just enough to ensure the slots don't touch the edge
    const margin = 40; // Reduced margin for tighter fit
    const diameter = (maxDistance * 2) + margin;
    
    return diameter;
  }, [board.allSpaces, boardCenter]);

  // Update board center when spaces change
  useEffect(() => {
    const center = calculateTrueCenter();
    setBoardCenter(center);
    
    // After setting the board center, recalculate the circle size
    // This ensures the circle size is calculated based on the updated center
  }, [calculateTrueCenter]);

  // Recalculate the circle size when the board center changes
  useEffect(() => {
    const newSize = calculateBackgroundCircleSize();
    setBackgroundCircleSize(newSize);
  }, [boardCenter, calculateBackgroundCircleSize, board.sections.length]);

  // Center the board on initial load and when zoom changes
  useEffect(() => {
    if (containerRef.current && boardRef.current) {
      const container = containerRef.current;
      const board = boardRef.current;
      
      // Reset transform to initial centered state
      setTransform({
        scale: 1,
        translate: { x: 0, y: 0 }
      });

      // Ensure the board container takes up the full viewport height minus the controls
      container.style.height = 'calc(100vh - 120px)'; // Adjust based on your controls height
      
      // Force a reflow to ensure dimensions are updated
      void container.offsetHeight;
    }
  }, [calculateTrueCenter, zoomLevel, boardCenter]);

  // Update the board ref style with the zoom level from props
  useEffect(() => {
    if (boardRef.current) {
      const board = boardRef.current;
      
      // Apply zoom level while maintaining center focus
      board.style.transform = `translate(-50%, -50%) scale(${zoomLevel})`;
      
      // Ensure the board stays within viewport bounds
      const container = containerRef.current;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const boardRect = board.getBoundingClientRect();
        
        // Calculate the maximum allowed translation to keep board in view
        const maxTranslateX = (containerRect.width - boardRect.width) / 2;
        const maxTranslateY = (containerRect.height - boardRect.height) / 2;
        
        // Update transform if needed to keep board in bounds
        setTransform(prev => ({
          ...prev,
          translate: {
            x: Math.max(Math.min(prev.translate.x, maxTranslateX), -maxTranslateX),
            y: Math.max(Math.min(prev.translate.y, maxTranslateY), -maxTranslateY)
          }
        }));
      }
    }
  }, [zoomLevel]);

  // Handle zooming with focus on the true center
  const handleZoom = useCallback((delta: number) => {
    setTransform(prev => {
      const newScale = Math.max(0.5, Math.min(4, prev.scale + delta));
      return { ...prev, scale: newScale };
    });
  }, []);

  // Calculate dynamic board size based on number of players
  const calculateBoardSize = useCallback(() => {
    const numPlayers = board.sections.length;
    const baseRadius = 600; // Increased base radius for the circular board
    const minSpacing = 80; // Increased minimum space between slots for better visibility
    
    // Calculate required radius based on number of players
    const circumference = numPlayers * minSpacing * 3; // 3 spaces per player section
    const requiredRadius = circumference / (2 * Math.PI);
    
    // Use the larger of base radius or required radius
    const radius = Math.max(baseRadius, requiredRadius);
    
    return radius;
  }, [board.sections.length]);

  // Check for space collisions
  const detectCollisions = useCallback(() => {
    const spaces = Array.from(board.allSpaces.values());
    const collisions: Array<[BoardSpace, BoardSpace]> = [];
    
    for (let i = 0; i < spaces.length; i++) {
      for (let j = i + 1; j < spaces.length; j++) {
        const space1 = spaces[i];
        const space2 = spaces[j];
        
        const distance = Math.sqrt(
          Math.pow(space1.x - space2.x, 2) + 
          Math.pow(space1.y - space2.y, 2)
        );
        
        if (distance < 60) { // Increased minimum distance between spaces
          collisions.push([space1, space2]);
        }
      }
    }
    
    return collisions;
  }, [board.allSpaces]);

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.005; // Increased for more responsive wheel zooming
      handleZoom(delta);
    }
  }, [handleZoom]);

  // Handle mouse events for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only handle left click
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.translate.x, y: e.clientY - transform.translate.y });
  }, [transform.translate]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    setTransform(prev => ({
      ...prev,
      translate: {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }
    }));
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleWheel, handleMouseMove, handleMouseUp]);

  // Check for collisions and adjust board size on mount and when sections change
  useEffect(() => {
    const radius = calculateBoardSize();
    const collisions = detectCollisions();
    
    if (collisions.length > 0) {
      setTransform(prev => ({
        ...prev,
        scale: prev.scale * 1.1
      }));
    }
  }, [calculateBoardSize, detectCollisions]);

  // Get colors of pegs on a space
  const getPegColors = (space: BoardSpace) => {
    return space.pegs.map(pegId => {
      // Format is "player-N-peg-M"
      const playerId = pegId.split('-peg-')[0];
      return playerColors[playerId] || '#CCCCCC';
    });
  };
  
  // Check if a space is selectable
  const isSelectable = (spaceId: string) => {
    return selectableSpaceIds.includes(spaceId);
  };
  
  // Check if a peg is selectable
  const isPegSelectable = (pegId: string) => {
    // Extract player ID from peg ID (format: "player-N-peg-M")
    const playerId = pegId.split('-peg-')[0];
    
    // If selectablePegIds has entries, use that to determine selectability
    if (selectablePegIds.length > 0) {
      const isSelectable = selectablePegIds.includes(pegId);
      return isSelectable;
    }
    
    // Otherwise, just check if it belongs to the current player
    const isSelectable = playerId === currentPlayerId;
    
    return isSelectable;
  };
  
  // Render a peg
  const renderPeg = (pegId: string, pegColor: string, index: number, total: number, space: BoardSpace) => {
    // Calculate offset based on index and total number of pegs
    let offsetX = 0;
    let offsetY = 0;
    
    if (total <= 1) {
      // Center single peg
      offsetX = 0;
      offsetY = 0;
    } else if (total === 2) {
      // Place two pegs side by side
      offsetX = (index % 2) * 16 - 8;
    } else if (total === 3) {
      if (index === 0) {
        // First peg at top
        offsetY = -8;
      } else {
        // Other two at bottom, left and right
        offsetX = (index % 2) * 16 - 8;
        offsetY = 8;
      }
    } else {
      // 4 or more pegs in a grid pattern
      offsetX = (index % 2) * 16 - 8;
      offsetY = Math.floor(index / 2) * 16 - 8;
    }
    
    const isSelected = pegId === selectedPegId;
    const isSelectable = isPegSelectable(pegId);
    
    // Special case: For joker card (when a player peg is already selected), opponent pegs should trigger space click
    const isSpaceSelectable = selectableSpaceIds.includes(space.id);
    const isPegInSelectableSpace = isSpaceSelectable && !isSelectable;
    
    const handlePegClick = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent the click from bubbling to the space
      
      // If this is a selectable opponent peg in a selectable space (for joker card)
      if (isPegInSelectableSpace) {
        // Trigger the space click handler instead
        onSpaceClick(space.id);
        return;
      }
      
      // Normal peg selection
      if (isSelectable) {
        onPegSelect(pegId);
      }
    };
    
    return (
      <div 
        key={pegId}
        className={`peg ${isSelected ? 'selected' : ''} ${isSelectable ? 'selectable' : ''} ${isPegInSelectableSpace ? 'in-selectable-space' : ''}`}
        style={{
          backgroundColor: pegColor,
          transform: `translate(${offsetX}px, ${offsetY}px)`,
          boxShadow: `0 1px 3px rgba(0, 0, 0, 0.3), 0 0 0 2px rgba(255, 255, 255, 0.4) inset`,
          cursor: (isSelectable || isPegInSelectableSpace) ? 'pointer' : 'default'
        }}
        onClick={handlePegClick}
      />
    );
  };
  
  // Get the color for a section
  const getSectionColor = (sectionIndex: number | undefined) => {
    if (sectionIndex === undefined) return '';
    
    const section = board.sections[sectionIndex];
    if (!section) return '';
    
    return section.color || '';
  };
  
  // Get base classes for a space including player count
  const getSpaceClasses = (space: BoardSpace) => {
    const playerCount = board.sections.length;
    let classes = `board-space space-${space.type} players-${playerCount}`;
    if (isSelectable(space.id)) {
      classes += ' selectable';
    }
    return classes;
  };
  
  // Render a space
  const renderSpace = (space: BoardSpace) => {
    // Get pegs on this space
    const pegColors = getPegColors(space);
    
    // Get section color
    const sectionColor = getSectionColor(space.sectionIndex);
    
    // Get player count for classes
    const playerCount = board.sections.length;
    
    // Get classes including player count
    const classes = getSpaceClasses(space);
    
    // Base style with position
    const style: React.CSSProperties = {
      left: `${space.x}px`,
      top: `${space.y}px`,
    };
    
    // Apply section colors to castle, entrance, and home spaces
    if (space.type !== 'starting' && sectionColor && (space.type === 'castle' || space.type === 'home')) {
      style.color = sectionColor;
      style.borderColor = sectionColor;
    }
    
    // Grey border for entrance spaces to distinguish them from castle slots
    if (space.type === 'entrance' && sectionColor) {
      style.color = sectionColor; // Keep the text color
      style.borderColor = '#888888'; // Grey border for entrance slots
    }

    // Check if this is a corner slot (slot 0 of a section)
    const isCornerSlot = space.type === 'normal' && space.index === 0 && space.sectionIndex !== undefined;
    const cornerPillPosition = isCornerSlot ? calculateCornerPillPosition(space) : null;

    // Check if this is a castle entrance slot (entrance with index 3)
    const isCastleEntrance = space.type === 'entrance' && space.index === 3 && space.sectionIndex !== undefined;
    const castlePillInfo = isCastleEntrance ? calculateCastlePillInfo(space) : null;
    
    // Check if this is the center home slot (likely index 0, but we'll find it properly)
    // Only calculate this once per section to avoid duplicate circles
    const isCenterHomeSlot = space.type === 'home' && space.index === 0 && space.sectionIndex !== undefined;
    const homeCircleInfo = isCenterHomeSlot ? calculateHomeCircleInfo(space) : null;

    // Calculate corner label position if this is a corner slot (index 0 of a section)
    // Only show for normal spaces with index 0 that are in a section
    const renderCornerLabel = isCornerSlot;
    const cornerLabelPosition = renderCornerLabel ? calculateCornerLabelPosition(space) : null;
    
    return (
      <>
        {/* Render home area circle if this is the center home slot */}
        {isCenterHomeSlot && homeCircleInfo && (
          <div 
            className="home-area-circle"
            style={{
              position: 'absolute',
              left: `${homeCircleInfo.x}px`,
              top: `${homeCircleInfo.y}px`,
              width: `${homeCircleInfo.diameter}px`,
              height: `${homeCircleInfo.diameter}px`,
              backgroundColor: `${hexToRgba(sectionColor || '#000000', 1.0)}`,
              borderRadius: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1,
              boxShadow: '0 0 8px 1px rgba(0, 0, 0, 0.3)'
            }}
          />
        )}

        {/* Render castle path pill if this is a castle entrance */}
        {isCastleEntrance && castlePillInfo && (
          <div 
            className="castle-path-pill"
            style={{
              position: 'absolute',
              left: `${castlePillInfo.x}px`,
              top: `${castlePillInfo.y}px`,
              width: `${castlePillInfo.width}px`,
              height: `${castlePillInfo.height}px`,
              backgroundColor: `${hexToRgba(sectionColor || '#000000', 1.0)}`,
              borderRadius: `${castlePillInfo.height / 2}px`,
              transform: `translate(-50%, -50%) rotate(${castlePillInfo.angle}rad)`,
              transformOrigin: 'center',
              zIndex: 1,
              boxShadow: '0 0 8px 1px rgba(0, 0, 0, 0.3)'
            }}
          />
        )}

        <div 
          key={space.id}
          className={classes}
          style={style}
          onClick={() => onSpaceClick(space.id)}
        >
          {/* Render pegs */}
          {pegColors.map((color, index) => renderPeg(space.pegs[index], color, index, pegColors.length, space))}
        </div>
        
        {/* Render pill extension for corner slots */}
        {isCornerSlot && cornerPillPosition && (
          <>
            {/* Pill-shaped extension */}
            <div 
              className="corner-pill-rect"
              style={{
                position: 'absolute',
                left: `${cornerPillPosition.rectX}px`,
                top: `${cornerPillPosition.rectY}px`,
                width: `${cornerPillPosition.width}px`,
                height: `${cornerPillPosition.thickness}px`,
                backgroundColor: 'rgb(255, 255, 255)', // Changed from rgba with 0.7 opacity to fully opaque
                borderRadius: `${cornerPillPosition.thickness / 2}px`,
                transform: `translate(-50%, -50%) rotate(${cornerPillPosition.angle}rad)`,
                transformOrigin: 'center',
                zIndex: 2,
                boxShadow: '0 0 8px 1px rgba(0, 0, 0, 0.3)'
              }}
            />
          </>
        )}

        {renderCornerLabel && cornerLabelPosition && (
          <div
            className={`corner-label players-${playerCount}`}
            style={{
              left: cornerLabelPosition.x,
              top: cornerLabelPosition.y,
              backgroundColor: '#FFFFFF', // Added white background to ensure opacity
              color: '#000000', // Ensure text is black for contrast
              fontWeight: 'bold', // Make text bold for better visibility
              opacity: 1, // Ensure full opacity
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)' // Add shadow for better visibility
            }}
          >
            C
          </div>
        )}
      </>
    );
  };

  // Helper function to convert hex color to rgba
  const hexToRgba = (hex: string, alpha: number): string => {
    // Default to black if no hex color
    if (!hex) return `rgba(0, 0, 0, ${alpha})`;
    
    // Remove the hash if it exists
    hex = hex.replace('#', '');
    
    // Parse the hex values to RGB
    const r = parseInt(hex.length === 3 ? hex.charAt(0) + hex.charAt(0) : hex.substring(0, 2), 16);
    const g = parseInt(hex.length === 3 ? hex.charAt(1) + hex.charAt(1) : hex.substring(2, 4), 16);
    const b = parseInt(hex.length === 3 ? hex.charAt(2) + hex.charAt(2) : hex.substring(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Calculate castle pill connector information
  const calculateCastlePillInfo = (entranceSpace: BoardSpace): {
    x: number,
    y: number,
    width: number,
    height: number,
    angle: number,
    borderWidth: number
  } | null => {
    if (entranceSpace.sectionIndex === undefined) return null;
    
    // Find the last castle slot (castle slot 4, which is index 4)
    const lastCastleSlot = Array.from(board.allSpaces.values()).find(space => 
      space.sectionIndex === entranceSpace.sectionIndex && 
      space.type === 'castle' && 
      space.index === 4
    );
    
    if (!lastCastleSlot) return null;
    
    // Calculate vector from entrance to last castle slot
    const dx = lastCastleSlot.x - entranceSpace.x;
    const dy = lastCastleSlot.y - entranceSpace.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Calculate unit vector (normalized direction)
    const unitX = dx / distance;
    const unitY = dy / distance;
    
    // Calculate angle between the points
    const angle = Math.atan2(dy, dx);
    
    // Get the size of the space/slot based on player count
    const playerCount = board.sections.length;
    let spaceSize = 24; // Default size for 2 players
    if (playerCount === 2) spaceSize = 24;
    else if (playerCount === 3) spaceSize = 24;
    else if (playerCount === 4) spaceSize = 16;
    else if (playerCount === 5) spaceSize = 12;
    else spaceSize = 10; // 6-8 players
    
    // Calculate border width based on slot size
    const borderWidth = Math.max(2, Math.round(spaceSize * 0.15)); // Scale with slot size, minimum 2px
    
    // Scale the thickness proportionally to the space size
    // Make it wide enough to fully encompass the slots including their borders
    const thickness = spaceSize * 1.2; // 120% of the slot size for a wider, more encompassing pill
    
    // Calculate the extension distance (how far to extend beyond the center of each slot)
    // This ensures the pill wraps around both slots properly
    const extensionDistance = spaceSize * 0.75; // 75% of slot size gives good overlap
    
    // Extend the pill in both directions beyond the slot centers
    const totalLength = distance + (extensionDistance * 2);
    
    // Adjust the center point to account for the extensions
    // No need to adjust since we're extending equally on both sides
    const centerX = (entranceSpace.x + lastCastleSlot.x) / 2;
    const centerY = (entranceSpace.y + lastCastleSlot.y) / 2;
    
    return {
      x: centerX,
      y: centerY,
      width: totalLength,
      height: thickness,
      angle: angle,
      borderWidth: borderWidth
    };
  };

  // Calculate position and dimensions for corner pill shape
  const calculateCornerPillPosition = (space: BoardSpace): { 
    rectX: number, 
    rectY: number, 
    width: number, 
    thickness: number, 
    angle: number,
    capX: number,
    capY: number
  } | null => {
    // Calculate vector from center to space (reversed from before)
    // This will make the pill point outward instead of inward
    const vectorX = space.x - boardCenter.x;
    const vectorY = space.y - boardCenter.y;
    
    // Normalize the vector
    const length = Math.sqrt(vectorX * vectorX + vectorY * vectorY);
    const normalizedX = vectorX / length;
    const normalizedY = vectorY / length;
    
    // Calculate angle for the rectangle rotation
    const angle = Math.atan2(normalizedY, normalizedX);
    
    // Calculate the distance between slots based on player count
    const playerCount = board.sections.length;
    const baseDistance = 40; // Base distance between slots
    const slotDistance = playerCount <= 4 ? baseDistance : baseDistance * (1 - (playerCount - 4) * 0.1);
    
    // Get the size of the space/slot
    let spaceSize = 24; // Default size for 2 players
    if (playerCount === 2) spaceSize = 24;
    else if (playerCount === 3) spaceSize = 24;
    else if (playerCount === 4) spaceSize = 16;
    else if (playerCount === 5) spaceSize = 12;
    else spaceSize = 10; // 6-8 players
    
    // Thickness of the rectangle (same as the black circle inside each slot)
    const thickness = spaceSize * 0.6; // 60% of the slot size
    
    // Calculate a dynamic length factor that scales with both player count and slot size
    // Enhanced to ensure pills reach the corner labels
    let pillLengthFactor;
    if (playerCount === 2) {
      pillLengthFactor = 1.2; // Even longer for 2 players to reach the label
    } else if (playerCount === 3) {
      pillLengthFactor = 1.1; // Longer for 3 players
    } else if (playerCount === 4) {
      pillLengthFactor = 0.9; // Medium length for 4 players
    } else if (playerCount <= 6) {
      pillLengthFactor = 0.75; // Slightly shorter for 5-6 players
    } else {
      pillLengthFactor = 0.7; // Shortest for 7-8 players
    }
    
    // Adjust the length based on both the slot distance and slot size
    const slotSizeFactor = 24 / spaceSize; // Ratio of default size to actual size
    // Add a slight boost to the factor to ensure pills reach beyond the corner label
    const adjustedPillFactor = pillLengthFactor * Math.sqrt(slotSizeFactor) * 1.2;
    const rectLength = slotDistance * adjustedPillFactor;
    
    // Calculate the position for the rectangle (middle point between the space and the end)
    // Now extending outward from the space toward the corner label
    const rectMidX = space.x + normalizedX * (rectLength / 2);
    const rectMidY = space.y + normalizedY * (rectLength / 2);
    
    // We're keeping these properties for compatibility with the existing interface
    const capX = space.x + normalizedX * rectLength;
    const capY = space.y + normalizedY * rectLength;
    
    return {
      rectX: rectMidX,
      rectY: rectMidY,
      width: rectLength,
      thickness: thickness,
      angle: angle,
      capX: capX,
      capY: capY
    };
  };

  // Calculate position for corner label
  const calculateCornerLabelPosition = (space: BoardSpace): { x: number, y: number } => {
    // Calculate vector from center to space
    const vectorX = space.x - boardCenter.x;
    const vectorY = space.y - boardCenter.y;
    
    // Normalize the vector
    const length = Math.sqrt(vectorX * vectorX + vectorY * vectorY);
    const normalizedX = vectorX / length;
    const normalizedY = vectorY / length;
    
    // Position the label further out from the space
    // Adjust distance based on player count (more players = smaller board spaces)
    const playerCount = board.sections.length;
    const baseDistance = 40;
    const labelDistance = playerCount <= 4 ? baseDistance : baseDistance * (1 - (playerCount - 4) * 0.1);
    
    return {
      x: space.x + normalizedX * labelDistance,
      y: space.y + normalizedY * labelDistance
    };
  };
  
  // Find the starting circle from all spaces
  const findStartingCircle = (): BoardSpace | undefined => {
    if (!board.allSpaces) return undefined;
    const startingSpaces = Array.from(board.allSpaces.values()).filter(space => 
      space.type === 'starting'
    );
    return startingSpaces[0];
  };
  
  // Render starting circle
  const renderStartingCircle = () => {
    const startingCircle = findStartingCircle();
    if (!startingCircle) return null;
    
    // Create a simplified space object for the starting circle pegs
    const startingSpace = {
      id: 'starting-circle',
      type: 'starting' as const,
      x: startingCircle.x,
      y: startingCircle.y,
      index: 0,
      label: 'Start',
      pegs: startingCircle.pegs,
      sectionIndex: -1
    };
    
    return (
      <div 
        className="starting-circle"
        style={{
          left: `${startingCircle.x}px`,
          top: `${startingCircle.y}px`
        }}
      >
        {/* Render pegs in starting circle with better distribution */}
        {startingCircle.pegs.map((pegId: string, index: number) => {
          const [playerId] = pegId.split('-');
          const color = playerColors[playerId] || '#CCCCCC';
          
          // Distribute pegs in a circle within the starting circle
          // Improved calculations for better visual distribution
          const totalPegs = startingCircle.pegs.length;
          const pegRadius = Math.min(65, 30 + totalPegs * 5); // Adjust radius based on number of pegs
          const angle = (index * (360 / totalPegs)) * Math.PI / 180;
          const x = Math.cos(angle) * pegRadius;
          const y = Math.sin(angle) * pegRadius;
          
          return renderPeg(pegId, color, index, totalPegs, startingSpace);
        })}
      </div>
    );
  };
  
  // Get all spaces to render from the board
  const getAllSpaces = (): BoardSpace[] => {
    if (!board.allSpaces) return [];
    return Array.from(board.allSpaces.values())
      .filter(space => space.type !== 'starting');
  };
  
  // Render the true center focal point (more visible for debugging)
  const renderFocalPoint = () => {
    return (
      <div
        style={{
          position: 'absolute',
          left: `${boardCenter.x}px`,
          top: `${boardCenter.y}px`,
          width: '4px',
          height: '4px',
          backgroundColor: 'rgba(255, 0, 0, 0.5)', // More visible red dot for debugging
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 100,
          pointerEvents: 'none'
        }}
      />
    );
  };
  
  // Calculate home circle information
  const calculateHomeCircleInfo = (homeSlot: BoardSpace): {
    x: number,
    y: number,
    diameter: number,
    borderWidth: number
  } | null => {
    if (homeSlot.sectionIndex === undefined) return null;
    
    // Find all home slots in this section
    const homeSlots = Array.from(board.allSpaces.values()).filter(space => 
      space.sectionIndex === homeSlot.sectionIndex && 
      space.type === 'home'
    );
    
    if (homeSlots.length <= 1) return null;
    
    // Find the center-most home slot by calculating the average position of all home slots
    let sumX = 0;
    let sumY = 0;
    
    for (const slot of homeSlots) {
      sumX += slot.x;
      sumY += slot.y;
    }
    
    const centerX = sumX / homeSlots.length;
    const centerY = sumY / homeSlots.length;
    
    // Find the actual home slot closest to this center point
    let centerHomeSlot = homeSlot;
    let minDistance = Number.MAX_VALUE;
    
    for (const slot of homeSlots) {
      const dx = slot.x - centerX;
      const dy = slot.y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < minDistance) {
        minDistance = distance;
        centerHomeSlot = slot;
      }
    }
    
    // Get player count to determine slot size
    const playerCount = board.sections.length;
    let slotSize = 24; // Default size for 2 players
    if (playerCount === 2) slotSize = 24;
    else if (playerCount === 3) slotSize = 24;
    else if (playerCount === 4) slotSize = 16;
    else if (playerCount === 5) slotSize = 12;
    else slotSize = 10; // 6-8 players
    
    // Calculate border width based on slot size
    const borderWidth = Math.max(2, Math.round(slotSize * 0.15)); // Scale with slot size, minimum 2px
    
    // Calculate max distance from center home slot to any other home slot
    let maxDistance = 0;
    
    for (const slot of homeSlots) {
      if (slot.id === centerHomeSlot.id) continue;
      
      const dx = slot.x - centerHomeSlot.x;
      const dy = slot.y - centerHomeSlot.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Add a portion of the slot size to ensure the circle reaches slightly past the edge
      const totalDistance = distance + (slotSize * 0.7);
      if (totalDistance > maxDistance) {
        maxDistance = totalDistance;
      }
    }
    
    // Calculate diameter to be exactly what's needed to encompass the slots with a tiny bit of padding
    const diameter = maxDistance * 2 + 2;
    
    return {
      x: centerHomeSlot.x,
      y: centerHomeSlot.y,
      diameter: diameter,
      borderWidth: borderWidth
    };
  };
  
  return (
    <div 
      ref={containerRef}
      className={`board-container ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <div 
        ref={boardRef}
        className="board"
        style={{
          transform: `translate(-50%, -50%) scale(${transform.scale})`,
          left: `calc(50% + ${transform.translate.x}px)`,
          top: `calc(50% + ${transform.translate.y}px)`
        }}
      >
        {/* Large white background circle - centered precisely at the board center point */}
        <div 
          className="board-background-circle"
          style={{
            width: `${backgroundCircleSize}px`,
            height: `${backgroundCircleSize}px`,
            left: `${boardCenter.x}px`,
            top: `${boardCenter.y}px`,
            transform: 'translate(-50%, -50%)',
            border: '6px solid black',
            backgroundColor: '#FFFFFF'
          }}
        />
        
        {/* Render all spaces (excluding starting circle) */}
        {getAllSpaces().map(renderSpace)}
        
        {/* Render starting circle */}
        {renderStartingCircle()}
        
        {/* Render the focal point at the true center */}
        {renderFocalPoint()}
      </div>
    </div>
  );
};

export default Board; 