struct StartRoomPayload: Encodable, Sendable {
    let roomCode: String
    let sessionToken: String
}
