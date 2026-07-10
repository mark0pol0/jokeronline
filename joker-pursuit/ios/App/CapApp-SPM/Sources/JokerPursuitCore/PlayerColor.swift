import SwiftUI

public enum PlayerColor: String, CaseIterable, Identifiable, Sendable {
    case red
    case blue
    case green
    case purple
    case orange
    case pink
    case cyan
    case yellow

    public var id: Self { self }

    var color: Color {
        switch self {
        case .red: .red
        case .blue: .blue
        case .green: .green
        case .purple: .purple
        case .orange: .orange
        case .pink: .pink
        case .cyan: .cyan
        case .yellow: .yellow
        }
    }

    var title: String { rawValue.capitalized }
}
