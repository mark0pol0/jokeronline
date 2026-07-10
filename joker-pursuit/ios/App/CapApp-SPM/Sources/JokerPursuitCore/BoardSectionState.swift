struct BoardSectionState: Codable, Identifiable, Sendable {
    let id: String
    let index: Int
    let label: String
    var spaces: [BoardSpaceState]
    let corners: [BoardSpaceState]
    let startingCircle: BoardSpaceState
    let castleEntrance: BoardSpaceState
    let color: String
    let playerIds: [String]
}
