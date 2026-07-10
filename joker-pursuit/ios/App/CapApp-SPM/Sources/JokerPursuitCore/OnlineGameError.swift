import Foundation

enum OnlineGameError: LocalizedError, Sendable {
    case notYourTurn
    case cardNotFound
    case pegNotFound
    case cannotLeaveHome
    case noDestination

    var errorDescription: String? {
        switch self {
        case .notYourTurn: "Wait for your turn."
        case .cardNotFound: "That card is no longer in your hand."
        case .pegNotFound: "That peg is no longer available."
        case .cannotLeaveHome: "Only an ace, king, or joker can leave home."
        case .noDestination: "That peg cannot move with this card."
        }
    }
}
