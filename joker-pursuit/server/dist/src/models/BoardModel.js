"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBoard = exports.createBoardSection = void 0;
// Calculate board dimensions based on number of players
const calculateBoardDimensions = (totalPlayers) => {
    // Base values for 2 players
    const baseRadius = 280;
    const baseSpacing = 45;
    // Calculate spacing reduction based on player count
    let spacing = baseSpacing * 0.8; // 20% reduction for 2 players
    // For 3+ players, reduce by 33% each time
    if (totalPlayers > 2) {
        const reductionFactor = Math.pow(0.67, totalPlayers - 2); // 33% reduction per additional player
        spacing *= reductionFactor;
    }
    // Calculate required radius based on number of players and spacing
    const circumference = totalPlayers * spacing * 18; // 18 spaces per player section
    const requiredRadius = circumference / (2 * Math.PI);
    // Use the larger of base radius or required radius
    const radius = Math.max(baseRadius, requiredRadius);
    // Center coordinates scale with radius but maintain minimum size
    const centerX = Math.max(700, radius * 2.5);
    const centerY = Math.max(400, radius * 1.5);
    return { radius, centerX, centerY };
};
// Create a default board section
const createBoardSection = (sectionId, sectionIndex, totalPlayers, color) => {
    const spaces = [];
    const corners = [];
    // Calculate board dimensions
    const { radius, centerX, centerY } = calculateBoardDimensions(totalPlayers);
    // Calculate the angle for this section
    const sectionAngle = (2 * Math.PI) / totalPlayers;
    const startAngle = sectionIndex * sectionAngle;
    // Create a starting circle in the center
    const startingCircle = {
        id: `${sectionId}_starting`,
        type: 'starting',
        x: centerX,
        y: centerY,
        index: -1,
        label: 'Start',
        pegs: [],
        sectionIndex
    };
    // Create main path (18 spaces in a circular arc)
    for (let i = 0; i < 18; i++) {
        // Calculate angle for this space
        const spaceAngle = startAngle + (sectionAngle * i / 18);
        // Calculate position on the circle
        const x = centerX + radius * Math.cos(spaceAngle);
        const y = centerY + radius * Math.sin(spaceAngle);
        // Determine if this is a castle entrance (3rd or 8th slot)
        const isEntrance1 = i === 3;
        const isEntrance2 = i === 8;
        const spaceType = isEntrance1 || isEntrance2 ? 'entrance' : 'normal';
        const space = {
            id: isEntrance1 ? `${sectionId}_entrance_1` : isEntrance2 ? `${sectionId}_entrance_2` : `${sectionId}_${i}`,
            type: spaceType,
            x,
            y,
            index: i,
            label: isEntrance1 ? 'Castle 1' : isEntrance2 ? 'Home' : i.toString(),
            pegs: [],
            sectionIndex
        };
        spaces.push(space);
        // If this is an entrance, add castle or home spaces pointing inward
        if (isEntrance1 || isEntrance2) {
            const castleId = isEntrance1 ? 'castle1' : 'home';
            const labelPrefix = isEntrance1 ? 'Castle 1' : 'Home';
            const spaceType = isEntrance1 ? 'castle' : 'home';
            // Direction vector from center to entrance (normalized)
            const dirX = (x - centerX) / radius;
            const dirY = (y - centerY) / radius;
            // For home spaces, create a plus shape pattern
            if (spaceType === 'home') {
                // Calculate perpendicular direction for homes 4 and 5
                const perpX = -dirY; // Perpendicular vector
                const perpY = dirX;
                // Calculate the spacing between two adjacent slots on the main circle
                const slotAngle = sectionAngle / 18; // Angle between two slots
                const mainCircleSpacing = 2 * radius * Math.sin(slotAngle / 2); // Distance between two adjacent slots
                // Calculate base positions for homes 1, 2, and 3
                const home1Distance = radius - mainCircleSpacing;
                const home2Distance = radius - (2 * mainCircleSpacing);
                const home3Distance = radius - (3 * mainCircleSpacing);
                // Use the main circle spacing for the perpendicular offset
                const standardSpacing = mainCircleSpacing;
                // Create the home spaces in a plus shape with consistent spacing
                const homePositions = [
                    // Home 1 (closest to entrance)
                    {
                        distanceFromCenter: home1Distance,
                        offsetX: 0,
                        offsetY: 0,
                        index: 0
                    },
                    // Home 2 (middle)
                    {
                        distanceFromCenter: home2Distance,
                        offsetX: 0,
                        offsetY: 0,
                        index: 1
                    },
                    // Home 3 (furthest from entrance)
                    {
                        distanceFromCenter: home3Distance,
                        offsetX: 0,
                        offsetY: 0,
                        index: 2
                    },
                    // Home 4 (left of Home 2)
                    {
                        distanceFromCenter: home2Distance,
                        offsetX: perpX * standardSpacing,
                        offsetY: perpY * standardSpacing,
                        index: 3
                    },
                    // Home 5 (right of Home 2)
                    {
                        distanceFromCenter: home2Distance,
                        offsetX: -perpX * standardSpacing,
                        offsetY: -perpY * standardSpacing,
                        index: 4
                    }
                ];
                // Create the home spaces
                homePositions.forEach(({ distanceFromCenter, offsetX, offsetY, index }) => {
                    const homeX = centerX + dirX * distanceFromCenter + offsetX;
                    const homeY = centerY + dirY * distanceFromCenter + offsetY;
                    const homeSpace = {
                        id: `${sectionId}_${castleId}_${index}`,
                        type: spaceType,
                        x: homeX,
                        y: homeY,
                        index,
                        label: `${labelPrefix} ${index + 1}`,
                        pegs: [],
                        sectionIndex
                    };
                    spaces.push(homeSpace);
                });
            }
            else {
                // Castle spaces remain in a line
                for (let j = 0; j < 5; j++) {
                    const distanceFromCenter = radius - (j + 1) * (radius / 6);
                    const castleX = centerX + dirX * distanceFromCenter;
                    const castleY = centerY + dirY * distanceFromCenter;
                    const castleSpace = {
                        id: `${sectionId}_${castleId}_${j}`,
                        type: spaceType,
                        x: castleX,
                        y: castleY,
                        index: j,
                        label: `${labelPrefix} ${j + 1}`,
                        pegs: [],
                        sectionIndex
                    };
                    spaces.push(castleSpace);
                }
            }
        }
    }
    // Use the first entrance as the "castle entrance" for compatibility
    const castleEntrance = spaces.find(s => s.id === `${sectionId}_entrance_1`) || spaces[0];
    // Create the board section
    const section = {
        id: sectionId,
        index: sectionIndex,
        label: `Section ${sectionIndex + 1}`,
        spaces,
        corners,
        startingCircle,
        castleEntrance,
        color
    };
    return section;
};
exports.createBoardSection = createBoardSection;
// Create a game board with the specified number of sections
const createBoard = (id, numPlayers, playerColors) => {
    const sections = [];
    const allSpaces = new Map();
    // Create sections
    for (let i = 0; i < numPlayers; i++) {
        const sectionId = `section${i + 1}`;
        const playerKey = `player_${i + 1}`;
        const playerColor = playerColors[playerKey] || '#CCCCCC';
        const section = (0, exports.createBoardSection)(sectionId, i, numPlayers, playerColor);
        sections.push(section);
        // Add spaces to allSpaces map
        section.spaces.forEach(space => {
            allSpaces.set(space.id, space);
        });
        // Add starting circle to allSpaces
        allSpaces.set(section.startingCircle.id, section.startingCircle);
    }
    // Create the board
    const board = {
        id,
        sections,
        allSpaces
    };
    return board;
};
exports.createBoard = createBoard;
