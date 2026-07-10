struct JoinRoomPayload: Encodable, Sendable {
    let roomCode: String
    let playerName: String
}
