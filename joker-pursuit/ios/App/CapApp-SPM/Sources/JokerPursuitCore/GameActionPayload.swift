struct GameActionPayload: Encodable, Sendable {
    let type: String
    let phase: String?
    let nextGameState: OnlineGameState
}
