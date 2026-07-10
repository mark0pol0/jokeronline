import Foundation

public struct PlayerState: Identifiable, Sendable {
    public let id: UUID
    public var name: String
    public var color: PlayerColor
    public var hand: [PlayingCard]
    public var pegs: [PegState]

    public init(setup: PlayerSetup) {
        id = setup.id
        name = setup.name
        color = setup.color
        hand = []
        pegs = (0..<5).map { _ in PegState() }
    }
}
