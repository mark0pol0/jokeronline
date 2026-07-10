import SwiftUI

struct PlayerSetupRow: View {
    @Binding var player: PlayerSetup

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("Player name", text: $player.name)
                .textInputAutocapitalization(.words)
            Picker("Peg color", selection: $player.color) {
                ForEach(PlayerColor.allCases) { option in
                    Label(option.title, systemImage: "circle.fill")
                        .foregroundStyle(option.color)
                        .tag(option)
                }
            }
        }
        .accessibilityElement(children: .contain)
    }
}
