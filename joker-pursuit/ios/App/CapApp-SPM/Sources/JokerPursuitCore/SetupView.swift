import SwiftUI

struct SetupView: View {
    @Bindable var store: GameStore

    var body: some View {
        NavigationStack {
            Form {
                Section("Players") {
                    ForEach($store.setups) { $player in
                        PlayerSetupRow(player: $player)
                    }
                    playerCountControls
                }

                Section {
                    Button("Start Game", systemImage: "play.fill", action: store.startLocalGame)
                        .frame(maxWidth: .infinity)
                        .bold()
                }
            }
            .scrollContentBackground(.hidden)
            .navigationTitle("Game Setup")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Back", systemImage: "chevron.left", action: store.showHome)
                }
            }
        }
        .tint(DesignTokens.teal)
    }

    private var playerCountControls: some View {
        LabeledContent("Number of players") {
            HStack {
                Button("Remove player", systemImage: "minus", action: store.removePlayer)
                    .labelStyle(.iconOnly)
                    .disabled(store.setups.count <= 2)
                Text(store.setups.count, format: .number)
                    .monospacedDigit()
                    .frame(minWidth: 28)
                Button("Add player", systemImage: "plus", action: store.addPlayer)
                    .labelStyle(.iconOnly)
                    .disabled(store.setups.count >= PlayerColor.allCases.count)
            }
            .buttonStyle(.bordered)
        }
    }
}
