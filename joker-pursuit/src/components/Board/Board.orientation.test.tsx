import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Board from './Board';
import { createBoard } from '../../models/BoardModel';

const renderBoard = (orientationPlayerId = 'player-1') => {
  const board = createBoard('board-test', 4, {
    player_1: '#FF5733',
    player_2: '#33A1FF',
    player_3: '#33FF57',
    player_4: '#F033FF'
  });

  board.sections.forEach((section, index) => {
    section.playerIds = [`player-${index + 1}`];
  });

  const result = render(
    <Board
      board={board}
      onSpaceClick={jest.fn()}
      selectableSpaceIds={[]}
      selectablePegIds={[]}
      playerColors={{}}
      onPegSelect={jest.fn()}
      selectedPegId={null}
      currentPlayerId="player-1"
      orientationPlayerId={orientationPlayerId}
      zoomLevel={1}
    />
  );

  const boardElement = result.container.querySelector('.board') as HTMLElement;
  return { ...result, boardElement };
};

describe('Board orientation', () => {
  it('defaults the viewing player home area to the south side of the board', () => {
    const { boardElement } = renderBoard('player-1');

    expect(Number(boardElement.dataset.boardRotation)).toBeCloseTo(50);
    expect(boardElement.style.transform).toContain('rotate(');
    expect(boardElement.style.transform).toContain('scale(1)');
  });

  it('lets players rotate and reset the board orientation', () => {
    const { boardElement } = renderBoard('player-1');

    fireEvent.click(screen.getByRole('button', { name: 'Rotate board right' }));
    expect(Number(boardElement.dataset.boardRotation)).toBeCloseTo(95);

    fireEvent.click(screen.getByRole('button', { name: 'Reset board so your home is south' }));
    expect(Number(boardElement.dataset.boardRotation)).toBeCloseTo(50);
  });
});
