import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Board as BoardModel, BoardSpace } from '../../models/BoardModel';
import './Board.css';

// Helper function to safely convert different space collections into an array
const getSpacesArray = (spaceCollection: BoardModel['allSpaces'] | undefined): BoardSpace[] => {
  if (!spaceCollection) {
    return [];
  }

  if (spaceCollection instanceof Map) {
    return Array.from(spaceCollection.values());
  }

  return Object.values(spaceCollection);
};

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
  const [boardCenter, setBoardCenter] = useState<Point>({ x: 700, y: 700 }); // Consistent with BoardModel center coordinates
  const boardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Track if this is the initial mount
  const isInitialMount = useRef(true);

  // State for background circle size
  const [backgroundCircleSize, setBackgroundCircleSize] = useState<number>(1300);
  
  // Center and scale the board appropriately on mount and when board dimensions change
  useEffect(() => {
    if (!containerRef.current || !boardRef.current) return;

    // Center the board in the container
    setTransform({
      scale: 1, // Base scale is 1, actual zoom applied in render
      translate: { x: 0, y: 0 } // Center position
    });
  }, [backgroundCircleSize]);
  
  // Calculate the true center of the board based on castle positions
  const calculateTrueCenter = useCallback(() => {
    if (!board.allSpaces) return { x: 700, y: 700 }; // Default center
    
    // Find the starting circle which has the red dot at the center
    const startingSpaces = getSpacesArray(board.allSpaces)
      .filter(space => space.type === 'starting');
    
    if (startingSpaces.length > 0) {
      // Use the first starting circle as the center (the red dot)
      return { x: startingSpaces[0].x, y: startingSpaces[0].y };
    }
    
    // Fallback: Find all castle spaces
    const castleSpaces = getSpacesArray(board.allSpaces)
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
    if (!board.allSpaces || board.allSpaces.size === 0) {
      return 800; // Fallback default size
    }

    // Find the maximum distance from the center to any space
    let maxDistance = 0;
    const spaces = getSpacesArray(board.allSpaces)
      .filter(space => space.type !== 'starting');
    
    for (const space of spaces) {
      if (!space.x || !space.y) continue;
      
      const dx = space.x - boardCenter.x;
      const dy = space.y - boardCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Add the space size to account for the radius
      const totalDistance = distance + 30; // 30px is approx half the space size
      
      if (totalDistance > maxDistance) {
        maxDistance = totalDistance;
      }
    }
    
    // Make the diameter twice the max distance plus a small margin
    const diameter = maxDistance * 2 + 60; // Add 60px margin (30px on each side)
    
    return diameter;
  }, [board.allSpaces, boardCenter]);

  // Add the centerBoard function that was missing
  const centerBoard = useCallback(() => {
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
      
      // Explicitly set the board position to center it
      board.style.left = '50%';
      board.style.top = '50%';
      board.style.transform = `translate(-50%, -50%) scale(${zoomLevel})`;
      
      // Stop any ongoing dragging
      setIsDragging(false);
      
      // Force a reflow to ensure dimensions are updated
      void container.offsetHeight;
    }
  }, [zoomLevel]);

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

  // Center the board only on initial load
  useEffect(() => {
    if (!boardRef.current) return;
    
    // Only center the board on initial mount or when explicitly reset
    if (isInitialMount.current) {
      centerBoard();
      isInitialMount.current = false;
    }
  }, [centerBoard]);

  // Update the board ref style with the responsive scale factor from props
  useEffect(() => {
    if (!boardRef.current) return;
    
    const board = boardRef.current;
    
    // Only apply transform if no pinch-zooming is active
    // This completely avoids conflicts between React state updates and direct DOM manipulation
    if (!document.documentElement.classList.contains('pinch-zooming')) {
      // Important: When zooming, we only update the scale component of the transform
      // but maintain the current position (left/top CSS properties), which preserves
      // the user's current view rather than snapping back to center
      board.style.transform = `translate(-50%, -50%) scale(${zoomLevel})`;
      board.style.transformOrigin = 'center center';
    }
    
    // Handle removal of pinch-zooming class
    const handlePinchEnd = () => {
      // When pinch ends, make sure board transform matches the current zoom level
      requestAnimationFrame(() => {
        board.style.transform = `translate(-50%, -50%) scale(${zoomLevel})`;
      });
    };
    
    // Listen for the removal of the pinch-zooming class
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const classList = document.documentElement.classList;
          if (!classList.contains('pinch-zooming')) {
            handlePinchEnd();
          }
        }
      });
    });
    
    observer.observe(document.documentElement, { attributes: true });
    
    return () => {
      observer.disconnect();
    };
  }, [zoomLevel]);

  // Check for space collisions
  const detectCollisions = useCallback(() => {
    const spaces = getSpacesArray(board.allSpaces);
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

  // Handle mouse events for dragging
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return; // Only handle left click
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.translate.x, y: e.clientY - transform.translate.y });
  }, [transform.translate]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 1) return; // Only handle single touch
    e.preventDefault(); // Prevent default touch actions
    
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - transform.translate.x, y: touch.clientY - transform.translate.y });
  }, [transform.translate]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !boardRef.current) return;
    
    // Calculate new position
    const newTranslateX = e.clientX - dragStart.x;
    const newTranslateY = e.clientY - dragStart.y;
    
    // Update the transform state
    setTransform(prev => ({
      ...prev,
      translate: {
        x: newTranslateX,
        y: newTranslateY
      }
    }));
    
    // Directly update the board's style for immediate feedback
    // ONLY update position (left/top), never touch the transform property during drag
    const board = boardRef.current;
    board.style.left = `calc(50% + ${newTranslateX}px)`;
    board.style.top = `calc(50% + ${newTranslateY}px)`;
    
    // DO NOT update the transform property during drag - let the useEffect handle zoom
  }, [isDragging, dragStart, boardRef]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || e.touches.length !== 1 || !boardRef.current) return;
    e.preventDefault(); // Prevent default touch actions like scrolling
    
    const touch = e.touches[0];
    
    // Calculate new position
    const newTranslateX = touch.clientX - dragStart.x;
    const newTranslateY = touch.clientY - dragStart.y;
    
    // Update the transform state
    setTransform(prev => ({
      ...prev,
      translate: {
        x: newTranslateX,
        y: newTranslateY
      }
    }));
    
    // Directly update the board's style for immediate feedback
    // ONLY update position (left/top), never touch the transform property during drag
    const board = boardRef.current;
    board.style.left = `calc(50% + ${newTranslateX}px)`;
    board.style.top = `calc(50% + ${newTranslateY}px)`;
    
    // DO NOT update the transform property during drag - let the useEffect handle zoom
  }, [isDragging, dragStart, boardRef]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle mouse and touch events for board container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create a wrapper for the mousedown handler that can be attached to DOM events
    const handleMouseDownWrapper = (e: MouseEvent) => {
      handleMouseDown(e);
    };

    const handleTouchStartWrapper = (e: TouchEvent) => {
      handleTouchStart(e);
    };

    const handleTouchMoveWrapper = (e: TouchEvent) => {
      handleTouchMove(e);
    };

    const handleTouchEndWrapper = () => {
      handleTouchEnd();
    };

    // Add mouse event listeners
    container.addEventListener('mousedown', handleMouseDownWrapper);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Add touch event listeners
    container.addEventListener('touchstart', handleTouchStartWrapper, { passive: false });
    document.addEventListener('touchmove', handleTouchMoveWrapper, { passive: false });
    document.addEventListener('touchend', handleTouchEndWrapper);
    
    return () => {
      // Remove mouse event listeners
      container.removeEventListener('mousedown', handleMouseDownWrapper);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Remove touch event listeners
      container.removeEventListener('touchstart', handleTouchStartWrapper);
      document.removeEventListener('touchmove', handleTouchMoveWrapper);
      document.removeEventListener('touchend', handleTouchEndWrapper);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Check for collisions and adjust board scale slightly on mount
  useEffect(() => {
    const collisions = detectCollisions();

    if (collisions.length > 0) {
      setTransform(prev => ({
        ...prev,
        scale: prev.scale * 1.1
      }));
    }
  }, [detectCollisions]);

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

    if (space.type === 'starting') {
      // Spread larger starting-circle stacks in concentric rings.
      const perRing = 12;
      const ringIndex = Math.floor(index / perRing);
      const indexInRing = index % perRing;
      const pegsInThisRing = Math.min(total - ringIndex * perRing, perRing);
      const radius = 14 + ringIndex * 15;
      const angle = (2 * Math.PI * indexInRing) / Math.max(pegsInThisRing, 1) - Math.PI / 2;
      offsetX = Math.cos(angle) * radius;
      offsetY = Math.sin(angle) * radius;
    } else if (total <= 1) {
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
    
    // Handle touch events for mobile devices
    const handlePegTouch = (e: React.TouchEvent) => {
      e.stopPropagation(); // Prevent the touch from bubbling to the space
      e.preventDefault(); // Prevent default behavior
      
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
        onTouchEnd={handlePegTouch}
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
          onTouchEnd={(e) => {
            e.stopPropagation(); // Prevent propagation
            e.preventDefault(); // Prevent default behavior
            onSpaceClick(space.id);
          }}
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
    const lastCastleSlot = getSpacesArray(board.allSpaces).find(space => 
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
    const startingSpaces = getSpacesArray(board.allSpaces).filter(space => 
      space.type === 'starting'
    );
    return startingSpaces[0];
  };
  
  // Render starting circle
  const renderStartingCircle = () => {
    const startingSpaces = getSpacesArray(board.allSpaces).filter(space => space.type === 'starting');
    const startingCircle = findStartingCircle();
    if (!startingCircle || startingSpaces.length === 0) return null;

    // Multiplayer can place pegs in section-specific starting spaces.
    // Aggregate them so the shared center circle shows everyone.
    const allStartingPegs = startingSpaces.flatMap(space => space.pegs || []);
    
    // Create a simplified space object for the starting circle pegs
    const startingSpace = {
      id: 'starting-circle',
      type: 'starting' as const,
      x: startingCircle.x,
      y: startingCircle.y,
      index: 0,
      label: 'Start',
      pegs: allStartingPegs,
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
        {allStartingPegs.map((pegId: string, index: number) => {
          const playerId = pegId.split('-peg-')[0];
          const color = playerColors[playerId] || '#CCCCCC';
          
          // Distribute pegs in a circle within the starting circle
          // Improved calculations for better visual distribution
          const totalPegs = allStartingPegs.length;
          
          return renderPeg(pegId, color, index, totalPegs, startingSpace);
        })}
      </div>
    );
  };
  
  // Get all spaces to render from the board
  const getAllSpaces = (): BoardSpace[] => {
    if (!board.allSpaces) return [];
    
    // Handle both Map objects and plain JSON objects (from server)
    let spaces: BoardSpace[];
    if (board.allSpaces instanceof Map) {
      // Client-side Map object
      spaces = getSpacesArray(board.allSpaces);
    } else {
      // Server-side serialized object
      spaces = getSpacesArray(board.allSpaces);
    }
    
    return spaces.filter(space => space.type !== 'starting');
  };
  
  // Render the true center focal point (more visible for debugging)
  const renderFocalPoint = () => {
    return (
      <div
        style={{
          position: 'absolute',
          left: `${boardCenter.x}px`,
          top: `${boardCenter.y}px`,
          width: '8px',
          height: '8px',
          backgroundColor: 'rgba(255, 0, 0, 0.7)', // More visible red dot
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 100,
          pointerEvents: 'none',
          boxShadow: '0 0 4px rgba(255, 255, 255, 0.9)' // More visible white glow
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
    const homeSlots = getSpacesArray(board.allSpaces).filter(space => 
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
  
  // Add listener for reset position event from the GameController
  useEffect(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    
    const handleResetPosition = () => {
      // When reset is triggered, center the board
      if (boardRef.current) {
        // Reset transform in state
        setTransform({
          scale: 1,
          translate: { x: 0, y: 0 }
        });
        
        // Reset position directly on the DOM elements
        const board = boardRef.current;
        board.style.left = '50%';
        board.style.top = '50%';
        board.style.transform = `translate(-50%, -50%) scale(${zoomLevel})`;
      }
      
      // Force any dragging to stop
      setIsDragging(false);
    };
    
    // Only listen for explicit reset position events
    container.addEventListener('resetposition', handleResetPosition);
    
    return () => {
      container.removeEventListener('resetposition', handleResetPosition);
    };
  }, [zoomLevel]);

  // Listen for custom board position updates from pinch-zoom interactions
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Function to handle custom board movement events dispatched from touch gestures
    const handleBoardMoved = (e: CustomEvent) => {
      if (!boardRef.current) return;
      
      const { x, y } = e.detail;
      
      // Update the transform state to match the new position
      setTransform(prev => ({
        ...prev,
        translate: { x, y }
      }));
      
      // Directly update the board's position for immediate feedback
      // This ensures the board stays visible during pinch zooming
      const board = boardRef.current;
      board.style.left = `calc(50% + ${x}px)`;
      board.style.top = `calc(50% + ${y}px)`;
    };
    
    // Add event listener for custom 'boardmoved' events
    const container = containerRef.current;
    container.addEventListener('boardmoved', handleBoardMoved as EventListener);
    
    return () => {
      container.removeEventListener('boardmoved', handleBoardMoved as EventListener);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`board-container ${isDragging ? 'dragging' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div 
        ref={boardRef}
        className="board"
        style={{
          // Apply scale only, position is handled via left/top
          transform: `translate(-50%, -50%) scale(${zoomLevel})`,
          left: `calc(50% + ${transform.translate.x}px)`,
          top: `calc(50% + ${transform.translate.y}px)`,
          transformOrigin: 'center center', // Ensure zooming happens around the center
          position: 'absolute'
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
            border: '2px solid rgba(0, 0, 0, 0.3)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15), inset 0 1px 3px rgba(255, 255, 255, 0.8)',
            backgroundColor: '#FFFFFF'
          }}
        />
        
        {/* Render all spaces (excluding starting circle) */}
        {getAllSpaces().map(space => (
          <React.Fragment key={space.id}>
            {renderSpace(space)}
          </React.Fragment>
        ))}
        
        {/* Render starting circle */}
        {renderStartingCircle()}
        
        {/* Render the focal point at the true center */}
        {renderFocalPoint()}
      </div>
    </div>
  );
};

export default Board; 
