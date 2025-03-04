// Draw a new card if there are cards in the draw pile
if (newState.drawPile.length > 0) {
  // Skip drawing a card if this is the first move of a split (7 card or 9 card)
  const isFirstMoveOfMultiPartMove = move.metadata?.sevenCardMove?.isFirstMove || move.metadata?.nineCardMove?.isFirstMove;
  
  if (!isFirstMoveOfMultiPartMove) {
    const newCard = newState.drawPile.pop()!;
    player.hand.push(newCard);
    console.log(`[applyMove] Player ${player.name} drew a new card: ${newCard.rank} of ${newCard.suit}`);
  } else {
    console.log(`[applyMove] Not drawing a card yet - this is part 1 of a multi-part move`);
  }
} else {
  console.log(`[applyMove] Draw pile is empty, no new card for player ${player.name}`);
}

// Record the move
newState.moves.push(move);

return { newState, bumpMessage }; 