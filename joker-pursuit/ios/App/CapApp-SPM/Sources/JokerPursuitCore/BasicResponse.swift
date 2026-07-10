struct BasicResponse: Decodable, Sendable {
    let success: Bool
    let error: String?
    let stateVersion: Int?
    let expectedVersion: Int?
}
