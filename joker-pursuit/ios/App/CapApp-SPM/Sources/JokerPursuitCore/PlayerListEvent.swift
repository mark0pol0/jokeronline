struct PlayerListEvent: Decodable, Sendable {
    let roomCode: String
    let players: [RoomPlayer]
    let hostPlayerID: String

    enum CodingKeys: String, CodingKey {
        case roomCode
        case players
        case hostPlayerID = "hostPlayerId"
    }
}
