import Foundation

struct OnlineCard: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let rank: String
    let suit: String
    let value: Int
    let isFace: Bool

    var isRed: Bool { suit == "hearts" || suit == "diamonds" }

    var symbol: String {
        switch suit {
        case "hearts": "♥"
        case "diamonds": "♦"
        case "clubs": "♣"
        case "spades": "♠"
        default: "★"
        }
    }

    var shortRank: String {
        switch rank {
        case "ace": "A"
        case "jack": "J"
        case "queen": "Q"
        case "king": "K"
        case "joker": "★"
        default: rank
        }
    }

    var movement: Int {
        switch rank {
        case "ace": 1
        case "jack": 11
        case "queen": 12
        case "king": 13
        case "joker": 1
        case "8": -8
        case "10": -1
        default: Int(rank) ?? value
        }
    }

    var canLeaveHome: Bool { rank == "ace" || rank == "king" || rank == "joker" }
}
