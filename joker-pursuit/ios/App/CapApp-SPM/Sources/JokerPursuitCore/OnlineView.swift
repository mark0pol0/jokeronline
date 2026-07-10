import SwiftUI

struct OnlineView: View {
    let store: GameStore
    @State private var roomStore = OnlineRoomStore()
    @State private var showingError = false
    @State private var showingGame = true

    var body: some View {
        @Bindable var roomStore = roomStore

        Group {
            if roomStore.gameState != nil && showingGame {
                OnlineGameView(roomStore: roomStore) {
                    showingGame = false
                }
            } else {
                NavigationStack {
                    Form {
                        if let session = roomStore.session {
                            lobby(session: session)
                        } else {
                            joinForm(roomStore: roomStore)
                        }
                    }
                    .scrollContentBackground(.hidden)
                    .navigationTitle("Play Online")
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Back", systemImage: "chevron.left", action: store.showHome)
                        }
                    }
                    .overlay {
                        if roomStore.isBusy || roomStore.isRestoring {
                            ProgressView("Connecting…")
                                .padding()
                                .background(.regularMaterial)
                                .clipShape(.rect(cornerRadius: 16))
                        }
                    }
                    .alert("Multiplayer Error", isPresented: $showingError) {
                    } message: {
                        Text(roomStore.errorMessage ?? "Unknown error")
                    }
                    .onChange(of: roomStore.errorMessage) { _, message in
                        showingError = message != nil
                    }
                }
            }
        }
        .tint(DesignTokens.teal)
    }

    private func joinForm(roomStore: OnlineRoomStore) -> some View {
        @Bindable var roomStore = roomStore

        return Group {
            Section("Server") {
                Label("Native secure connection", systemImage: "lock.shield.fill")
                    .foregroundStyle(DesignTokens.teal)
                Text("jokeronline.onrender.com")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Section("Your seat") {
                TextField("Player name", text: $roomStore.playerName)
                    .textInputAutocapitalization(.words)
                TextField("Room code", text: $roomStore.roomCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
            }
            Section {
                Button("Create Room", systemImage: "plus.circle") {
                    Task { await roomStore.createRoom() }
                }
                Button("Join Room", systemImage: "arrow.right.circle") {
                    Task { await roomStore.joinRoom() }
                }
                .disabled(roomStore.roomCode.isEmpty)
            }
        }
    }

    private func lobby(session: RoomSession) -> some View {
        Group {
            Section("Room") {
                LabeledContent("Code") {
                    Text(session.roomCode)
                        .font(.title2.bold().monospaced())
                        .textSelection(.enabled)
                }
                Label("Connected", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
            Section("Players") {
                ForEach(roomStore.players) { player in
                    Label(player.name, systemImage: player.id == session.playerID ? "person.crop.circle.fill" : "person.crop.circle")
                }
            }
            if session.isHost {
                Section {
                    Button("Start Game", systemImage: "play.fill") {
                        Task { await roomStore.startRoom() }
                    }
                    .disabled(roomStore.didStart)
                }
            }
            if roomStore.didStart {
                Section {
                    Label("Game started", systemImage: "flag.checkered")
                        .foregroundStyle(DesignTokens.teal)
                } footer: {
                    Text("The room is live on the multiplayer server.")
                }
            }
            if roomStore.gameState != nil {
                Section {
                    Button("Resume Game", systemImage: "play.circle.fill") {
                        showingGame = true
                    }
                }
            }
            Section {
                Button("Leave Room", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                    Task { await roomStore.leaveRoom() }
                }
            }
        }
    }
}
