struct SubmitActionPayload: Encodable, Sendable {
    let roomCode: String
    let sessionToken: String
    let baseVersion: Int
    let action: GameActionPayload
}
