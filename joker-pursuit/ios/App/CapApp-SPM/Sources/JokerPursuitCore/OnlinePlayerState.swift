struct OnlinePlayerState: Codable, Identifiable, Sendable {
    let id: String
    var name: String
    var color: String
    var hand: [OnlineCard]
    var pegs: [String]
    var isComplete: Bool
    var teamId: Int
}
