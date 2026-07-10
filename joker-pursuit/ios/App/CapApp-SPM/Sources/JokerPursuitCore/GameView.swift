import SwiftUI

struct GameView: View {
    let store: GameStore
    @State private var confirmExit = false
    @State private var showingWinner = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        NavigationStack {
            ZStack {
                DesignTokens.felt.ignoresSafeArea()
                VStack(spacing: 12) {
                    turnBanner
                    BoardView(
                        players: store.players,
                        currentPlayerIndex: store.currentPlayerIndex
                    )
                    .frame(maxHeight: 430)
                    pegPicker
                    hand
                    statusBar
                }
                .padding(.horizontal)
                .padding(.bottom, 8)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("End Game", systemImage: "xmark") {
                        confirmExit = true
                    }
                    .tint(.white)
                    .confirmationDialog("End this game?", isPresented: $confirmExit, titleVisibility: .visible) {
                        Button("End Game", role: .destructive, action: store.showHome)
                        Button("Keep Playing", role: .cancel) {}
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Text("Move \(store.moveCount + 1)")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.white.secondary)
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
        }
        .sensoryFeedback(.selection, trigger: store.selectedCardID)
        .sensoryFeedback(.success, trigger: store.moveCount)
        .alert("Game Over", isPresented: $showingWinner) {
            Button("Return Home", action: store.showHome)
        } message: {
            Text("\(store.winnerName ?? "Player") won the game.")
        }
        .onChange(of: store.winnerName) { _, winnerName in
            showingWinner = winnerName != nil
        }
    }

    private var turnBanner: some View {
        HStack {
            if let player = store.currentPlayer {
                Image(systemName: "circle.fill")
                    .foregroundStyle(player.color.color)
                    .accessibilityHidden(true)
                Text("\(player.name)'s Turn")
                    .font(.headline)
            }
            Spacer()
            Label("Local", systemImage: "iphone")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .foregroundStyle(.white)
        .glassPanel()
    }

    private var pegPicker: some View {
        HStack(spacing: 8) {
            if let player = store.currentPlayer {
                ForEach(player.pegs.enumerated(), id: \.element.id) { index, peg in
                    Button {
                        withAnimation(reduceMotion ? .none : .spring(duration: 0.34, bounce: 0.12)) {
                            store.movePeg(peg.id)
                        }
                    } label: {
                        Text(index + 1, format: .number)
                            .font(.headline.bold())
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .background(player.color.color.gradient)
                    .foregroundStyle(.white)
                    .clipShape(.circle)
                    .accessibilityLabel("Move peg \(index + 1)")
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var hand: some View {
        HStack(spacing: 7) {
            if let player = store.currentPlayer {
                ForEach(player.hand) { card in
                    Button {
                        withAnimation(reduceMotion ? .none : .spring(duration: 0.28, bounce: 0)) {
                            store.selectCard(card)
                        }
                    } label: {
                        CardFaceView(card: card, isSelected: store.selectedCardID == card.id)
                    }
                    .buttonStyle(.plain)
                    .accessibilityInputLabels(["\(card.rank.rawValue) of \(card.suit.rawValue)", "card"])
                }
            }
        }
        .frame(maxHeight: 112)
    }

    private var statusBar: some View {
        HStack {
            Text(store.status)
                .font(.footnote)
                .foregroundStyle(.white)
                .lineLimit(2)
            Spacer()
            Button("Discard", systemImage: "arrow.down.to.line", action: store.discardSelectedCard)
                .buttonStyle(.bordered)
                .tint(.white)
                .disabled(store.selectedCardID == nil)
        }
    }
}
