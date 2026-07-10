import SwiftUI

struct OnlineGameView: View {
    @Bindable var roomStore: OnlineRoomStore
    let close: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            DesignTokens.felt.ignoresSafeArea()
            if let state = roomStore.gameState, let session = roomStore.session {
                VStack(spacing: 10) {
                    header(state: state, session: session)
                    OnlineBoardView(state: state)
                    pegControls(state: state, session: session)
                    hand(state: state, session: session)
                    footer(state: state, session: session)
                }
                .padding()
                if let winner = state.winner,
                   let player = state.players.first(where: { $0.id == winner.playerId }) {
                    VStack(spacing: 14) {
                        Image(systemName: "trophy.fill")
                            .font(.largeTitle)
                            .foregroundStyle(.yellow)
                        Text("\(player.name) Wins!")
                            .font(.title.bold())
                        Button("Back to Room", action: close)
                            .buttonStyle(.borderedProminent)
                    }
                    .glassPanel()
                    .padding()
                }
            } else {
                ProgressView("Synchronizing game…")
                    .tint(.white)
                    .foregroundStyle(.white)
            }
        }
        .sensoryFeedback(.selection, trigger: roomStore.selectedCardID)
        .sensoryFeedback(.success, trigger: roomStore.stateVersion)
    }

    private func header(state: OnlineGameState, session: RoomSession) -> some View {
        HStack {
            Button("Back to Room", systemImage: "chevron.left", action: close)
                .labelStyle(.iconOnly)
            if state.players.indices.contains(state.currentPlayerIndex) {
                let player = state.players[state.currentPlayerIndex]
                Image(systemName: "circle.fill")
                    .foregroundStyle(Color(hex: player.color))
                    .accessibilityHidden(true)
                Text("\(player.name)'s Turn")
                    .font(.headline)
            }
            Spacer()
            Label(session.roomCode, systemImage: "network")
                .font(.footnote.monospaced())
        }
        .foregroundStyle(.white)
        .glassPanel()
    }

    private func pegControls(state: OnlineGameState, session: RoomSession) -> some View {
        let localPlayer = state.players.first(where: { $0.id == session.playerID })
        let isLocalTurn = state.players.indices.contains(state.currentPlayerIndex)
            && state.players[state.currentPlayerIndex].id == session.playerID

        return HStack(spacing: 8) {
            if let localPlayer {
                ForEach(localPlayer.pegs.enumerated(), id: \.element) { index, pegID in
                    Button {
                        Task { await roomStore.playSelectedCard(on: pegID) }
                    } label: {
                        Text(index + 1, format: .number)
                            .font(.headline.bold())
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .background(Color(hex: localPlayer.color).gradient)
                    .foregroundStyle(.white)
                    .clipShape(.circle)
                    .disabled(!isLocalTurn || roomStore.selectedCardID == nil || roomStore.isSubmittingMove)
                    .accessibilityLabel("Move peg \(index + 1)")
                }
            }
        }
    }

    private func hand(state: OnlineGameState, session: RoomSession) -> some View {
        let localHand = state.players.first(where: { $0.id == session.playerID })?.hand ?? []
        return HStack(spacing: 7) {
            ForEach(localHand) { card in
                Button {
                    withAnimation(reduceMotion ? .none : .spring(duration: 0.28, bounce: 0)) {
                        roomStore.selectCard(card.id)
                    }
                } label: {
                    OnlineCardFaceView(card: card, isSelected: roomStore.selectedCardID == card.id)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxHeight: 112)
    }

    private func footer(state: OnlineGameState, session: RoomSession) -> some View {
        let isLocalTurn = state.players.indices.contains(state.currentPlayerIndex)
            && state.players[state.currentPlayerIndex].id == session.playerID
        return HStack {
            Text(isLocalTurn ? "Choose a card, then a peg." : "Waiting for the other player…")
                .font(.footnote)
                .foregroundStyle(.white)
            Spacer()
            Button("Discard", systemImage: "arrow.down.to.line") {
                Task { await roomStore.discardSelectedCard() }
            }
            .buttonStyle(.bordered)
            .tint(.white)
            .disabled(!isLocalTurn || roomStore.selectedCardID == nil || roomStore.isSubmittingMove)
        }
    }
}
