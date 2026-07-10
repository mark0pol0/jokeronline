import Foundation

actor SocketIOTransport {
    private let endpoint = URL(string: "wss://jokeronline.onrender.com/socket.io/?EIO=4&transport=websocket")
    private var socket: URLSessionWebSocketTask?
    private var connectWaiters: [CheckedContinuation<Void, Error>] = []
    private var acknowledgements: [Int: CheckedContinuation<Data, Error>] = [:]
    private var nextAcknowledgementID = 1
    private var connected = false
    private var eventContinuations: [UUID: AsyncStream<SocketEvent>.Continuation] = [:]

    func events() -> AsyncStream<SocketEvent> {
        let id = UUID()
        return AsyncStream { continuation in
            eventContinuations[id] = continuation
            continuation.onTermination = { _ in
                Task { await self.removeEventContinuation(id) }
            }
        }
    }

    func connect() async throws {
        if connected { return }
        if socket == nil {
            guard let endpoint else { throw SocketTransportError.invalidServerURL }
            let newSocket = URLSession.shared.webSocketTask(with: endpoint)
            socket = newSocket
            newSocket.resume()
            Task { await receiveLoop() }
        }

        try await withCheckedThrowingContinuation { continuation in
            connectWaiters.append(continuation)
        }
    }

    func emit<Payload: Encodable & Sendable, Response: Decodable & Sendable>(
        event: String,
        payload: Payload,
        response: Response.Type
    ) async throws -> Response {
        try await connect()
        let acknowledgementID = nextAcknowledgementID
        nextAcknowledgementID += 1

        let payloadData = try JSONEncoder().encode(payload)
        let payloadObject = try JSONSerialization.jsonObject(with: payloadData)
        let packetData = try JSONSerialization.data(withJSONObject: [event, payloadObject])
        guard let packetJSON = String(data: packetData, encoding: .utf8) else {
            throw SocketTransportError.invalidPacket
        }

        let responseData = try await withCheckedThrowingContinuation { continuation in
            acknowledgements[acknowledgementID] = continuation
            Task {
                do {
                    try await send("42\(acknowledgementID)\(packetJSON)")
                } catch {
                    await failAcknowledgement(acknowledgementID, error: error)
                }
            }
        }
        return try JSONDecoder().decode(Response.self, from: responseData)
    }

    func disconnect() {
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        connected = false
        failAll(SocketTransportError.disconnected)
    }

    private func receiveLoop() async {
        guard let socket else { return }
        do {
            while true {
                let message = try await socket.receive()
                switch message {
                case .string(let packet):
                    try await handle(packet)
                case .data(let data):
                    guard let packet = String(data: data, encoding: .utf8) else {
                        throw SocketTransportError.invalidPacket
                    }
                    try await handle(packet)
                @unknown default:
                    throw SocketTransportError.invalidPacket
                }
            }
        } catch {
            self.socket = nil
            connected = false
            failAll(error)
        }
    }

    private func handle(_ packet: String) async throws {
        if packet.hasPrefix("0") {
            try await send("40")
            return
        }
        if packet == "2" {
            try await send("3")
            return
        }
        if packet.hasPrefix("40") {
            connected = true
            let waiters = connectWaiters
            connectWaiters.removeAll()
            waiters.forEach { $0.resume() }
            return
        }
        if packet.hasPrefix("42") {
            try publishEvent(packet)
            return
        }
        guard packet.hasPrefix("43") else { return }

        let remainder = packet.dropFirst(2)
        let digits = remainder.prefix(while: \.isNumber)
        guard let acknowledgementID = Int(digits) else { throw SocketTransportError.invalidPacket }
        let json = remainder.dropFirst(digits.count)
        guard
            let envelopeData = String(json).data(using: .utf8),
            let envelope = try JSONSerialization.jsonObject(with: envelopeData) as? [Any],
            let first = envelope.first
        else {
            throw SocketTransportError.invalidPacket
        }
        let responseData = try JSONSerialization.data(withJSONObject: first)
        acknowledgements.removeValue(forKey: acknowledgementID)?.resume(returning: responseData)
    }

    private func send(_ packet: String) async throws {
        guard let socket else { throw SocketTransportError.disconnected }
        try await socket.send(.string(packet))
    }

    private func publishEvent(_ packet: String) throws {
        let json = packet.dropFirst(2)
        guard
            let envelopeData = String(json).data(using: .utf8),
            let envelope = try JSONSerialization.jsonObject(with: envelopeData) as? [Any],
            let name = envelope.first as? String,
            envelope.count > 1
        else { return }
        let payload = try JSONSerialization.data(withJSONObject: envelope[1])
        let event = SocketEvent(name: name, payload: payload)
        eventContinuations.values.forEach { $0.yield(event) }
    }

    private func removeEventContinuation(_ id: UUID) {
        eventContinuations.removeValue(forKey: id)
    }

    private func failAcknowledgement(_ id: Int, error: Error) {
        acknowledgements.removeValue(forKey: id)?.resume(throwing: error)
    }

    private func failAll(_ error: Error) {
        let waiters = connectWaiters
        connectWaiters.removeAll()
        waiters.forEach { $0.resume(throwing: error) }

        let pending = acknowledgements.values
        acknowledgements.removeAll()
        pending.forEach { $0.resume(throwing: error) }
        eventContinuations.values.forEach { $0.finish() }
        eventContinuations.removeAll()
    }
}
