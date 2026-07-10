import Foundation

struct RoomPlayer: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let color: String
}
