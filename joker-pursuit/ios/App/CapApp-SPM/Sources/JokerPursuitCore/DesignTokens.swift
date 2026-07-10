import SwiftUI

enum DesignTokens {
    static let background = LinearGradient(
        colors: [Color(red: 0.98, green: 0.91, blue: 0.73), Color(red: 0.51, green: 0.27, blue: 0.14)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    static let felt = LinearGradient(
        colors: [Color(red: 0.18, green: 0.07, blue: 0.04), Color(red: 0.08, green: 0.025, blue: 0.02)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    static let teal = Color(red: 0.03, green: 0.43, blue: 0.39)
    static let copper = Color(red: 0.62, green: 0.25, blue: 0.10)
    static let paper = Color(red: 1.0, green: 0.97, blue: 0.88)
    static let ink = Color(red: 0.21, green: 0.11, blue: 0.06)
    static let spacing: Double = 16
    static let cornerRadius: Double = 24
}
