struct LeaveRoomPayload: Encodable, Sendable {
    let roomCode: String
    let sessionToken: String
}
