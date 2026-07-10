enum OnlineGameRules {
    static func play(
        state: inout OnlineGameState,
        actorID: String,
        cardID: String,
        pegID: String
    ) throws {
        guard state.players.indices.contains(state.currentPlayerIndex) else {
            throw OnlineGameError.notYourTurn
        }
        guard state.players[state.currentPlayerIndex].id == actorID else {
            throw OnlineGameError.notYourTurn
        }
        guard let cardIndex = state.players[state.currentPlayerIndex].hand.firstIndex(where: { $0.id == cardID }) else {
            throw OnlineGameError.cardNotFound
        }
        guard state.players[state.currentPlayerIndex].pegs.contains(pegID) else {
            throw OnlineGameError.pegNotFound
        }

        let card = state.players[state.currentPlayerIndex].hand[cardIndex]
        guard let currentSpace = state.board.allSpaces.values.first(where: { $0.pegs.contains(pegID) }) else {
            throw OnlineGameError.pegNotFound
        }
        let destinationID: String

        if currentSpace.type == "home" {
            guard card.canLeaveHome else { throw OnlineGameError.cannotLeaveHome }
            destinationID = "section\(state.currentPlayerIndex + 1)_entrance_2"
        } else if currentSpace.type == "castle" {
            let nextCastleIndex = currentSpace.index + card.movement
            guard card.movement > 0, (0..<5).contains(nextCastleIndex) else {
                throw OnlineGameError.noDestination
            }
            destinationID = "section\(state.currentPlayerIndex + 1)_castle1_\(nextCastleIndex)"
        } else {
            let track = orderedTrack(board: state.board)
            guard
                let trackIndex = track.firstIndex(of: currentSpace.id),
                !track.isEmpty
            else { throw OnlineGameError.noDestination }
            let castleEntranceID = "section\(state.currentPlayerIndex + 1)_entrance_1"
            if card.movement > 0,
               let castleEntranceIndex = track.firstIndex(of: castleEntranceID) {
                let distanceToCastle = positiveModulo(castleEntranceIndex - trackIndex, track.count)
                let castleIndex = card.movement - distanceToCastle
                if distanceToCastle > 0, distanceToCastle <= card.movement, (0..<5).contains(castleIndex) {
                    destinationID = "section\(state.currentPlayerIndex + 1)_castle1_\(castleIndex)"
                } else {
                    destinationID = track[positiveModulo(trackIndex + card.movement, track.count)]
                }
            } else {
                destinationID = track[positiveModulo(trackIndex + card.movement, track.count)]
            }
        }

        sendOccupantsHome(destinationID: destinationID, movingPegID: pegID, state: &state)
        remove(pegID: pegID, board: &state.board)
        state.board.allSpaces[destinationID]?.pegs.append(pegID)
        OnlineGameFactory.synchronizeSections(board: &state.board)

        let playedCard = state.players[state.currentPlayerIndex].hand.remove(at: cardIndex)
        state.discardPile.append(playedCard)
        drawCard(for: state.currentPlayerIndex, state: &state)
        let currentPlayer = state.players[state.currentPlayerIndex]
        let completed = currentPlayer.pegs.allSatisfy { pegID in
            state.board.allSpaces.values.first(where: { $0.pegs.contains(pegID) })?.type == "castle"
        }
        if completed {
            state.players[state.currentPlayerIndex].isComplete = true
            state.phase = "gameOver"
            state.winner = OnlineWinner(playerId: currentPlayer.id, teamId: currentPlayer.teamId)
            return
        }
        state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.count
    }

    static func discard(state: inout OnlineGameState, actorID: String, cardID: String) throws {
        guard
            state.players.indices.contains(state.currentPlayerIndex),
            state.players[state.currentPlayerIndex].id == actorID
        else { throw OnlineGameError.notYourTurn }
        guard let cardIndex = state.players[state.currentPlayerIndex].hand.firstIndex(where: { $0.id == cardID }) else {
            throw OnlineGameError.cardNotFound
        }
        state.discardPile.append(state.players[state.currentPlayerIndex].hand.remove(at: cardIndex))
        drawCard(for: state.currentPlayerIndex, state: &state)
        state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.count
    }

    private static func orderedTrack(board: OnlineBoardState) -> [String] {
        board.sections
            .sorted { $0.index < $1.index }
            .flatMap { section in
                section.spaces
                    .filter { $0.type == "normal" || $0.type == "entrance" }
                    .sorted { $0.index < $1.index }
                    .map(\.id)
            }
    }

    private static func sendOccupantsHome(destinationID: String, movingPegID: String, state: inout OnlineGameState) {
        guard let occupants = state.board.allSpaces[destinationID]?.pegs else { return }
        for occupant in occupants where occupant != movingPegID {
            remove(pegID: occupant, board: &state.board)
            guard let ownerIndex = state.players.firstIndex(where: { $0.pegs.contains(occupant) }) else { continue }
            let homePrefix = "section\(ownerIndex + 1)_home_"
            let homeID = state.board.allSpaces.values
                .filter { $0.id.hasPrefix(homePrefix) && $0.pegs.isEmpty }
                .sorted { $0.index < $1.index }
                .first?.id
            if let homeID {
                state.board.allSpaces[homeID]?.pegs.append(occupant)
            }
        }
    }

    private static func remove(pegID: String, board: inout OnlineBoardState) {
        for id in board.allSpaces.keys {
            board.allSpaces[id]?.pegs.removeAll { $0 == pegID }
        }
    }

    private static func drawCard(for playerIndex: Int, state: inout OnlineGameState) {
        if state.drawPile.isEmpty {
            state.drawPile = state.discardPile.shuffled()
            state.discardPile = []
        }
        if let card = state.drawPile.popLast() {
            state.players[playerIndex].hand.append(card)
        }
    }

    private static func positiveModulo(_ value: Int, _ modulus: Int) -> Int {
        ((value % modulus) + modulus) % modulus
    }
}
