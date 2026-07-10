struct OnlineGameState: Codable, Sendable {
    let id: String
    var phase: String
    var players: [OnlinePlayerState]
    var currentPlayerIndex: Int
    var board: OnlineBoardState
    var drawPile: [OnlineCard]
    var discardPile: [OnlineCard]
    var moves: [String]
    var winner: OnlineWinner?
}
