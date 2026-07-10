struct RoomSnapshot: Decodable, Sendable {
    let roomCode: String
    let stateVersion: Int
    let gameState: OnlineGameState?
    let players: [RoomPlayer]
    let selfPlayerID: String?
    let isStarted: Bool

    enum CodingKeys: String, CodingKey {
        case roomCode
        case stateVersion
        case gameState
        case players
        case selfPlayerID = "selfPlayerId"
        case isStarted
    }
}
