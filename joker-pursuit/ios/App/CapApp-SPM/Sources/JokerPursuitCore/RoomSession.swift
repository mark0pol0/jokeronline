struct RoomSession: Codable, Sendable {
    let roomCode: String
    let playerID: String
    let sessionToken: String
    let isHost: Bool
}
