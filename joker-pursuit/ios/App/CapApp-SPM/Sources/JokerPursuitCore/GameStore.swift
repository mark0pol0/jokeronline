import Foundation
import Observation

@MainActor
@Observable
public final class GameStore {
    public var screen: AppScreen = .home
    public var setups: [PlayerSetup] = [
        PlayerSetup(name: "Player 1", color: .red),
        PlayerSetup(name: "Player 2", color: .blue)
    ]
    public var players: [PlayerState] = []
    public var currentPlayerIndex = 0
    public var selectedCardID: UUID?
    public var status = "Choose a card, then choose a peg."
    public var gameStartedAt: Date?
    public var moveCount = 0
    public var winnerName: String?

    private var drawPile: [PlayingCard] = []
    private var discardPile: [PlayingCard] = []

    public init() {}

    public var currentPlayer: PlayerState? {
        players.indices.contains(currentPlayerIndex) ? players[currentPlayerIndex] : nil
    }

    public func showHome() {
        screen = .home
    }

    public func showSetup() {
        screen = .setup
    }

    public func showOnline() {
        screen = .online
    }

    public func addPlayer() {
        guard setups.count < PlayerColor.allCases.count else { return }
        let index = setups.count
        setups.append(PlayerSetup(name: "Player \(index + 1)", color: PlayerColor.allCases[index]))
    }

    public func removePlayer() {
        guard setups.count > 2 else { return }
        setups.removeLast()
    }

    public func startLocalGame() {
        players = setups.map(PlayerState.init)
        drawPile = Self.makeDeck().shuffled()
        discardPile = []
        currentPlayerIndex = 0
        moveCount = 0
        winnerName = nil
        gameStartedAt = .now
        dealHands()
        status = "\(players[0].name)'s turn"
        screen = .game
    }

    public func selectCard(_ card: PlayingCard) {
        selectedCardID = selectedCardID == card.id ? nil : card.id
        status = selectedCardID == nil ? "Choose a card." : "Now choose a peg to move."
    }

    public func movePeg(_ pegID: UUID) {
        guard
            players.indices.contains(currentPlayerIndex),
            let cardIndex = players[currentPlayerIndex].hand.firstIndex(where: { $0.id == selectedCardID }),
            let pegIndex = players[currentPlayerIndex].pegs.firstIndex(where: { $0.id == pegID })
        else {
            status = "Choose a card before moving a peg."
            return
        }

        let card = players[currentPlayerIndex].hand[cardIndex]
        let position = players[currentPlayerIndex].pegs[pegIndex].trackPosition
        let isFinished = players[currentPlayerIndex].pegs[pegIndex].isFinished

        if isFinished {
            status = "That peg is already safely in the castle."
            return
        }

        if position == nil && !card.canLeaveHome {
            status = "Only an ace or king can leave home."
            return
        }

        let playerOffset = (64 / players.count) * currentPlayerIndex
        if let position {
            let nextDistance = max(0, players[currentPlayerIndex].pegs[pegIndex].distanceTravelled + card.movement)
            if nextDistance > 68 {
                status = "That move would overshoot the castle."
                return
            }
            players[currentPlayerIndex].pegs[pegIndex].distanceTravelled = nextDistance
            if nextDistance >= 64 {
                players[currentPlayerIndex].pegs[pegIndex].trackPosition = nil
                players[currentPlayerIndex].pegs[pegIndex].isFinished = true
            } else {
                players[currentPlayerIndex].pegs[pegIndex].trackPosition = (position + card.movement + 64) % 64
            }
        } else {
            players[currentPlayerIndex].pegs[pegIndex].trackPosition = playerOffset
            players[currentPlayerIndex].pegs[pegIndex].distanceTravelled = 0
        }
        discardPile.append(players[currentPlayerIndex].hand.remove(at: cardIndex))
        drawCard(for: currentPlayerIndex)
        selectedCardID = nil
        moveCount += 1
        if players[currentPlayerIndex].pegs.allSatisfy(\.isFinished) {
            winnerName = players[currentPlayerIndex].name
            status = "\(players[currentPlayerIndex].name) wins!"
            return
        }
        currentPlayerIndex = (currentPlayerIndex + 1) % players.count
        status = "\(players[currentPlayerIndex].name)'s turn"
    }

    public func discardSelectedCard() {
        guard
            players.indices.contains(currentPlayerIndex),
            let cardIndex = players[currentPlayerIndex].hand.firstIndex(where: { $0.id == selectedCardID })
        else { return }

        discardPile.append(players[currentPlayerIndex].hand.remove(at: cardIndex))
        drawCard(for: currentPlayerIndex)
        selectedCardID = nil
        currentPlayerIndex = (currentPlayerIndex + 1) % players.count
        status = "\(players[currentPlayerIndex].name)'s turn"
    }

    private func dealHands() {
        for playerIndex in players.indices {
            for _ in 0..<5 {
                drawCard(for: playerIndex)
            }
        }
    }

    private func drawCard(for playerIndex: Int) {
        if drawPile.isEmpty {
            drawPile = discardPile.shuffled()
            discardPile = []
        }
        guard let card = drawPile.popLast() else { return }
        players[playerIndex].hand.append(card)
    }

    private static func makeDeck() -> [PlayingCard] {
        (0..<2).flatMap { _ in
            PlayingCard.Suit.allCases.flatMap { suit in
                PlayingCard.Rank.allCases.map { rank in
                    PlayingCard(rank: rank, suit: suit)
                }
            }
        }
    }
}
