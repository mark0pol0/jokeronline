import Foundation

struct SocketEvent: Sendable {
    let name: String
    let payload: Data
}
