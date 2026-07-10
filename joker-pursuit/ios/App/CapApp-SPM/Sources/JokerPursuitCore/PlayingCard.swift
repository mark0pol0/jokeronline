import Foundation

public struct PlayingCard: Identifiable, Equatable, Sendable {
    public enum Suit: String, CaseIterable, Sendable {
        case hearts = "♥"
        case diamonds = "♦"
        case clubs = "♣"
        case spades = "♠"
    }

    public enum Rank: String, CaseIterable, Sendable {
        case ace = "A"
        case two = "2"
        case three = "3"
        case four = "4"
        case five = "5"
        case six = "6"
        case seven = "7"
        case eight = "8"
        case nine = "9"
        case ten = "10"
        case jack = "J"
        case queen = "Q"
        case king = "K"
    }

    public let id: UUID
    public let rank: Rank
    public let suit: Suit

    public init(id: UUID = UUID(), rank: Rank, suit: Suit) {
        self.id = id
        self.rank = rank
        self.suit = suit
    }

    var isRed: Bool { suit == .hearts || suit == .diamonds }

    var movement: Int {
        switch rank {
        case .ace: 1
        case .two: 2
        case .three: 3
        case .four: 4
        case .five: 5
        case .six: 6
        case .seven: 7
        case .eight: -8
        case .nine: 9
        case .ten: -1
        case .jack: 11
        case .queen: 12
        case .king: 13
        }
    }

    var canLeaveHome: Bool { rank == .ace || rank == .king }
}
