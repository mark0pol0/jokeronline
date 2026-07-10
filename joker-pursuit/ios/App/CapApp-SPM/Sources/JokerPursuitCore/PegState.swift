import Foundation

public struct PegState: Identifiable, Sendable {
    public let id: UUID
    public var trackPosition: Int?
    public var distanceTravelled: Int
    public var isFinished: Bool

    public init(id: UUID = UUID(), trackPosition: Int? = nil, distanceTravelled: Int = 0, isFinished: Bool = false) {
        self.id = id
        self.trackPosition = trackPosition
        self.distanceTravelled = distanceTravelled
        self.isFinished = isFinished
    }
}
