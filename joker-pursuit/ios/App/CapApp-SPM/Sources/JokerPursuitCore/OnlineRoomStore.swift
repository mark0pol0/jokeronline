import Foundation
import Observation

@MainActor
@Observable
final class OnlineRoomStore {
    var playerName = "Player"
    var roomCode = ""
    var players: [RoomPlayer] = []
    var session: RoomSession?
    var isBusy = false
    var errorMessage: String?
    var didStart = false
    var isRestoring = true
    var gameState: OnlineGameState?
    var stateVersion = 0
    var selectedCardID: String?
    var isSubmittingMove = false

    private let transport = SocketIOTransport()
    private var eventTask: Task<Void, Never>?

    init() {
        eventTask = Task { [weak self] in
            await self?.listenForEvents()
        }
        Task { [weak self] in
            await self?.restoreSession()
        }
    }

    func createRoom() async {
        guard !playerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "Enter your name first."
            return
        }
        await perform {
            let response: RoomResponse = try await transport.emit(
                event: "create-room-v2",
                payload: CreateRoomPayload(playerName: playerName),
                response: RoomResponse.self
            )
            try apply(response)
        }
    }

    func joinRoom() async {
        let normalizedCode = roomCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !playerName.isEmpty, !normalizedCode.isEmpty else {
            errorMessage = "Enter your name and room code first."
            return
        }
        await perform {
            let response: RoomResponse = try await transport.emit(
                event: "join-room-v2",
                payload: JoinRoomPayload(roomCode: normalizedCode, playerName: playerName),
                response: RoomResponse.self
            )
            try apply(response)
        }
    }

    func startRoom() async {
        guard let session else { return }
        await perform {
            let response: BasicResponse = try await transport.emit(
                event: "start-game-v2",
                payload: StartRoomPayload(roomCode: session.roomCode, sessionToken: session.sessionToken),
                response: BasicResponse.self
            )
            guard response.success else {
                throw SocketTransportError.server(response.error ?? "Unable to start the room.")
            }
            didStart = true
            if session.isHost {
                let initialState = OnlineGameFactory.make(players: players)
                try await submitInitialGame(initialState, session: session)
            }
        }
    }

    func selectCard(_ cardID: String) {
        selectedCardID = selectedCardID == cardID ? nil : cardID
    }

    func playSelectedCard(on pegID: String) async {
        guard let session, let selectedCardID, var nextState = gameState else { return }
        do {
            try OnlineGameRules.play(
                state: &nextState,
                actorID: session.playerID,
                cardID: selectedCardID,
                pegID: pegID
            )
            try await submitTurn(nextState, type: "play_move", session: session)
            self.selectedCardID = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func discardSelectedCard() async {
        guard let session, let selectedCardID, var nextState = gameState else { return }
        do {
            try OnlineGameRules.discard(state: &nextState, actorID: session.playerID, cardID: selectedCardID)
            try await submitTurn(nextState, type: "discard_hand", session: session)
            self.selectedCardID = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func leaveRoom() async {
        guard let session else { return }
        await perform {
            let response: BasicResponse = try await transport.emit(
                event: "leave-room-v2",
                payload: LeaveRoomPayload(roomCode: session.roomCode, sessionToken: session.sessionToken),
                response: BasicResponse.self
            )
            guard response.success else {
                throw SocketTransportError.server(response.error ?? "Unable to leave the room.")
            }
            SessionVault.clear()
            self.session = nil
            players = []
            roomCode = ""
            didStart = false
            gameState = nil
            stateVersion = 0
        }
    }

    private func perform(_ operation: () async throws -> Void) async {
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        do {
            try await operation()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func apply(_ response: RoomResponse) throws {
        guard response.success else {
            throw SocketTransportError.server(response.error ?? "The room request failed.")
        }
        guard
            let roomCode = response.roomCode,
            let playerID = response.playerID,
            let sessionToken = response.sessionToken
        else {
            throw SocketTransportError.invalidPacket
        }
        self.roomCode = roomCode
        players = response.players ?? []
        let newSession = RoomSession(
            roomCode: roomCode,
            playerID: playerID,
            sessionToken: sessionToken,
            isHost: response.isHost ?? false
        )
        session = newSession
        didStart = response.isGameStarted ?? false
        stateVersion = response.stateVersion ?? stateVersion
        try SessionVault.save(newSession)
    }

    private func restoreSession() async {
        defer { isRestoring = false }
        do {
            guard let savedSession = try SessionVault.load() else { return }
            let response: RoomResponse = try await transport.emit(
                event: "rejoin-room-v2",
                payload: RejoinRoomPayload(
                    roomCode: savedSession.roomCode,
                    sessionToken: savedSession.sessionToken
                ),
                response: RoomResponse.self
            )
            try apply(response)
        } catch {
            SessionVault.clear()
        }
    }

    private func listenForEvents() async {
        let events = await transport.events()
        for await event in events {
            switch event.name {
            case "player-joined-v2":
                if let update = try? JSONDecoder().decode(PlayerListEvent.self, from: event.payload) {
                    players = update.players
                }
            case "game-started-v2":
                didStart = true
            case "room-snapshot-v2":
                if let snapshot = try? JSONDecoder().decode(RoomSnapshot.self, from: event.payload),
                   snapshot.stateVersion >= stateVersion {
                    stateVersion = snapshot.stateVersion
                    players = snapshot.players
                    didStart = snapshot.isStarted
                    gameState = snapshot.gameState
                }
            default:
                continue
            }
        }
    }

    private func submitInitialGame(_ state: OnlineGameState, session: RoomSession) async throws {
        let response: BasicResponse = try await transport.emit(
            event: "submit-action-v2",
            payload: SubmitActionPayload(
                roomCode: session.roomCode,
                sessionToken: session.sessionToken,
                baseVersion: stateVersion,
                action: GameActionPayload(type: "phase_transition", phase: "playing", nextGameState: state)
            ),
            response: BasicResponse.self
        )
        guard response.success else {
            throw SocketTransportError.server(response.error ?? "Unable to initialize the game.")
        }
        stateVersion = response.stateVersion ?? stateVersion
        gameState = state
    }

    private func submitTurn(_ state: OnlineGameState, type: String, session: RoomSession) async throws {
        isSubmittingMove = true
        defer { isSubmittingMove = false }
        let response: BasicResponse = try await transport.emit(
            event: "submit-action-v2",
            payload: SubmitActionPayload(
                roomCode: session.roomCode,
                sessionToken: session.sessionToken,
                baseVersion: stateVersion,
                action: GameActionPayload(type: type, phase: nil, nextGameState: state)
            ),
            response: BasicResponse.self
        )
        guard response.success else {
            if let expectedVersion = response.expectedVersion {
                stateVersion = expectedVersion
            }
            throw SocketTransportError.server(response.error ?? "The move was rejected.")
        }
        stateVersion = response.stateVersion ?? stateVersion
        gameState = state
    }
}
