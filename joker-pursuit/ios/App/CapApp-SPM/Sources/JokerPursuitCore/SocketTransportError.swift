import Foundation

enum SocketTransportError: LocalizedError, Sendable {
    case invalidServerURL
    case disconnected
    case invalidPacket
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidServerURL: "The multiplayer server URL is invalid."
        case .disconnected: "The multiplayer connection closed unexpectedly."
        case .invalidPacket: "The multiplayer server returned an unreadable response."
        case .server(let message): message
        }
    }
}
