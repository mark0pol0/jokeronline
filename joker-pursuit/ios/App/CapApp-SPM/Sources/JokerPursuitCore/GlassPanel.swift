import SwiftUI

struct GlassPanel: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content
                .padding()
                .glassEffect(
                    .regular.tint(.white.opacity(0.08)),
                    in: .rect(cornerRadius: DesignTokens.cornerRadius)
                )
                .shadow(color: .black.opacity(0.16), radius: 24, y: 14)
        } else {
            content
                .padding()
                .background(.regularMaterial)
                .clipShape(.rect(cornerRadius: DesignTokens.cornerRadius))
                .overlay {
                    RoundedRectangle(cornerRadius: DesignTokens.cornerRadius)
                        .stroke(.white.opacity(0.34), lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.16), radius: 24, y: 14)
        }
    }
}

extension View {
    func glassPanel() -> some View {
        modifier(GlassPanel())
    }
}
