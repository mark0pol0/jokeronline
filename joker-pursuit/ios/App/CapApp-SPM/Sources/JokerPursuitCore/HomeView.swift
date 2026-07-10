import SwiftUI

struct HomeView: View {
    let store: GameStore
    @State private var emphasized = false

    var body: some View {
        VStack(spacing: DesignTokens.spacing * 1.5) {
            Spacer()
            emblem
            title
            actions
                .glassPanel()
            Spacer()
            Text("A classic card-based board game")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding()
        .task {
            withAnimation(.spring(duration: 0.55, bounce: 0.12)) {
                emphasized = true
            }
        }
    }

    private var emblem: some View {
        Image(systemName: "theatermasks.fill")
            .font(.system(size: 58))
            .symbolRenderingMode(.palette)
            .foregroundStyle(DesignTokens.copper, DesignTokens.teal)
            .scaleEffect(emphasized ? 1 : 0.82)
            .opacity(emphasized ? 1 : 0)
            .accessibilityHidden(true)
    }

    private var title: some View {
        VStack(spacing: 6) {
            Text("Joker Pursuit")
                .font(.largeTitle.bold())
                .fontDesign(.serif)
                .foregroundStyle(DesignTokens.ink)
            Text("Race your pegs. Outsmart the table.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .multilineTextAlignment(.center)
    }

    private var actions: some View {
        VStack(spacing: 12) {
            Button("Local Game", systemImage: "person.2.fill", action: store.showSetup)
                .buttonStyle(.borderedProminent)
                .tint(DesignTokens.teal)
                .controlSize(.large)
            Button("Play Online", systemImage: "network", action: store.showOnline)
                .buttonStyle(.bordered)
                .tint(DesignTokens.ink)
                .controlSize(.large)
        }
        .frame(maxWidth: 360)
    }
}
