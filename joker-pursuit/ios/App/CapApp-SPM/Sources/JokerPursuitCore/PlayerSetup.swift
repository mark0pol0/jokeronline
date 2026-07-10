import Foundation

public struct PlayerSetup: Identifiable, Sendable {
    public let id: UUID
    public var name: String
    public var color: PlayerColor

    public init(id: UUID = UUID(), name: String, color: PlayerColor) {
        self.id = id
        self.name = name
        self.color = color
    }
}
