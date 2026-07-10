struct RejoinRoomPayload: Encodable, Sendable {
    let roomCode: String
    let sessionToken: String
}
