import SwiftUI

public struct RootView: View {
    @State private var store = GameStore()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init() {}

    public var body: some View {
        ZStack {
            background
            content
                .transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.98)))
        }
        .animation(reduceMotion ? .easeOut(duration: 0.18) : .spring(duration: 0.38, bounce: 0), value: store.screen)
        .preferredColorScheme(.light)
    }

    private var background: some View {
        DesignTokens.background
            .ignoresSafeArea()
            .overlay {
                Image(systemName: "suit.diamond.fill")
                    .font(.system(size: 260))
                    .foregroundStyle(.white.opacity(0.055))
                    .rotationEffect(.degrees(18))
                    .accessibilityHidden(true)
            }
    }

    @ViewBuilder
    private var content: some View {
        switch store.screen {
        case .home:
            HomeView(store: store)
        case .setup:
            SetupView(store: store)
        case .game:
            GameView(store: store)
        case .online:
            OnlineView(store: store)
        }
    }
}
