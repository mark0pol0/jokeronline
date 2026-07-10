import Foundation

enum OnlineGameFactory {
    private static let palette = ["#E83F4B", "#2385E6", "#28B463", "#8E44AD", "#E67E22", "#D94F9D", "#16A6A1", "#E5B80B"]
    private static let ranks = ["ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "jack", "queen", "king"]
    private static let suits = ["hearts", "diamonds", "clubs", "spades"]

    static func make(players roomPlayers: [RoomPlayer]) -> OnlineGameState {
        var deck = makeDeck(count: roomPlayers.count).shuffled()
        let players = roomPlayers.enumerated().map { index, roomPlayer in
            let color = roomPlayer.color.isEmpty ? palette[index % palette.count] : roomPlayer.color
            let hand = Array(deck.prefix(5))
            deck.removeFirst(min(5, deck.count))
            return OnlinePlayerState(
                id: roomPlayer.id,
                name: roomPlayer.name,
                color: color,
                hand: hand,
                pegs: (1...5).map { "\(roomPlayer.id)-peg-\($0)" },
                isComplete: false,
                teamId: index
            )
        }
        var board = makeBoard(players: players)
        placePegsAtHome(players: players, board: &board)
        return OnlineGameState(
            id: "native-game-\(UUID().uuidString)",
            phase: "playing",
            players: players,
            currentPlayerIndex: 0,
            board: board,
            drawPile: deck,
            discardPile: [],
            moves: [],
            winner: nil
        )
    }

    private static func makeDeck(count: Int) -> [OnlineCard] {
        (0..<max(1, count)).flatMap { deckIndex in
            let standard = suits.flatMap { suit in
                ranks.map { rank in
                    OnlineCard(
                        id: "\(rank)_\(suit)_deck\(deckIndex)_\(UUID().uuidString)",
                        rank: rank,
                        suit: suit,
                        value: value(for: rank),
                        isFace: ["jack", "queen", "king"].contains(rank)
                    )
                }
            }
            let jokers = (1...2).map { jokerIndex in
                OnlineCard(
                    id: "joker_\(jokerIndex)_deck\(deckIndex)_\(UUID().uuidString)",
                    rank: "joker",
                    suit: "none",
                    value: 0,
                    isFace: false
                )
            }
            return standard + jokers
        }
    }

    private static func value(for rank: String) -> Int {
        switch rank {
        case "ace": 1
        case "jack", "queen", "king": 10
        default: Int(rank) ?? 0
        }
    }

    private static func makeBoard(players: [OnlinePlayerState]) -> OnlineBoardState {
        var sections: [BoardSectionState] = []
        var allSpaces: [String: BoardSpaceState] = [:]
        let playerCount = players.count
        let radius = 280.0
        let center = 700.0

        for (sectionIndex, player) in players.enumerated() {
            let sectionID = "section\(sectionIndex + 1)"
            let sectionAngle = Double.pi * 2 / Double(playerCount)
            let startAngle = Double(sectionIndex) * sectionAngle
            var spaces: [BoardSpaceState] = []

            for index in 0..<18 {
                let angle = startAngle + sectionAngle * Double(index) / 18
                let x = center + radius * cos(angle)
                let y = center + radius * sin(angle)
                let isCastleEntrance = index == 3
                let isHomeEntrance = index == 8
                let id = isCastleEntrance ? "\(sectionID)_entrance_1" : isHomeEntrance ? "\(sectionID)_entrance_2" : "\(sectionID)_\(index)"
                spaces.append(BoardSpaceState(
                    id: id,
                    type: isCastleEntrance || isHomeEntrance ? "entrance" : "normal",
                    x: x,
                    y: y,
                    index: index,
                    label: String(index),
                    pegs: [],
                    sectionIndex: sectionIndex
                ))

                if isCastleEntrance || isHomeEntrance {
                    let radialX = (x - center) / radius
                    let radialY = (y - center) / radius
                    for laneIndex in 0..<5 {
                        let distance = radius - Double(laneIndex + 1) * (radius / 6)
                        spaces.append(BoardSpaceState(
                            id: "\(sectionID)_\(isCastleEntrance ? "castle1" : "home")_\(laneIndex)",
                            type: isCastleEntrance ? "castle" : "home",
                            x: center + radialX * distance,
                            y: center + radialY * distance,
                            index: laneIndex,
                            label: isCastleEntrance ? "Castle \(laneIndex + 1)" : "Home \(laneIndex + 1)",
                            pegs: [],
                            sectionIndex: sectionIndex
                        ))
                    }
                }
            }

            let startingCircle = BoardSpaceState(
                id: "\(sectionID)_starting",
                type: "starting",
                x: center,
                y: center,
                index: -1,
                label: "Start",
                pegs: [],
                sectionIndex: sectionIndex
            )
            let entrance = spaces.first(where: { $0.id == "\(sectionID)_entrance_1" }) ?? spaces[0]
            let section = BoardSectionState(
                id: sectionID,
                index: sectionIndex,
                label: "Section \(sectionIndex + 1)",
                spaces: spaces,
                corners: [],
                startingCircle: startingCircle,
                castleEntrance: entrance,
                color: player.color,
                playerIds: [player.id]
            )
            sections.append(section)
            spaces.forEach { allSpaces[$0.id] = $0 }
            allSpaces[startingCircle.id] = startingCircle
        }
        return OnlineBoardState(id: "native-board-\(UUID().uuidString)", sections: sections, allSpaces: allSpaces)
    }

    private static func placePegsAtHome(players: [OnlinePlayerState], board: inout OnlineBoardState) {
        for (playerIndex, player) in players.enumerated() {
            for (pegIndex, pegID) in player.pegs.enumerated() {
                let homeID = "section\(playerIndex + 1)_home_\(pegIndex)"
                board.allSpaces[homeID]?.pegs.append(pegID)
            }
        }
        synchronizeSections(board: &board)
    }

    static func synchronizeSections(board: inout OnlineBoardState) {
        for sectionIndex in board.sections.indices {
            for spaceIndex in board.sections[sectionIndex].spaces.indices {
                let id = board.sections[sectionIndex].spaces[spaceIndex].id
                if let canonical = board.allSpaces[id] {
                    board.sections[sectionIndex].spaces[spaceIndex] = canonical
                }
            }
        }
    }
}
