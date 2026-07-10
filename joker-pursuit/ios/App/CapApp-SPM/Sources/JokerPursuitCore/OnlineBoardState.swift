struct OnlineBoardState: Codable, Sendable {
    let id: String
    var sections: [BoardSectionState]
    var allSpaces: [String: BoardSpaceState]
}
