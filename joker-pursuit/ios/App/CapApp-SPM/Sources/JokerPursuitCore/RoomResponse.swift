struct RoomResponse: Decodable, Sendable {
    let success: Bool
    let error: String?
    let roomID: String?
    let roomCode: String?
    let playerID: String?
    let sessionToken: String?
    let players: [RoomPlayer]?
    let stateVersion: Int?
    let isHost: Bool?
    let isGameStarted: Bool?

    enum CodingKeys: String, CodingKey {
        case success
        case error
        case roomID = "roomId"
        case roomCode
        case playerID = "playerId"
        case sessionToken
        case players
        case stateVersion
        case isHost
        case isGameStarted
    }
}
