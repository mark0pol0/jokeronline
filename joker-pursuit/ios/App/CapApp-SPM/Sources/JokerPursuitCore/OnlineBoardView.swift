import SwiftUI

struct OnlineBoardView: View {
    let state: OnlineGameState

    var body: some View {
        Canvas { context, size in
            let boardSize = min(size.width, size.height)
            let origin = CGPoint(x: (size.width - boardSize) / 2, y: (size.height - boardSize) / 2)
            let boardRect = CGRect(origin: origin, size: CGSize(width: boardSize, height: boardSize))
            context.fill(Path(ellipseIn: boardRect), with: .color(DesignTokens.paper))
            context.stroke(Path(ellipseIn: boardRect), with: .color(.brown.opacity(0.55)), lineWidth: 3)

            let spaces = state.board.allSpaces.values.filter { $0.type != "starting" }
            for space in spaces {
                let point = point(for: space, boardRect: boardRect)
                let radius = space.type == "normal" || space.type == "entrance" ? 3.8 : 5.2
                let hole = CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2)
                let holeColor = space.type == "castle" ? Color.brown.opacity(0.62) : Color.black.opacity(0.7)
                context.fill(Path(ellipseIn: hole), with: .color(holeColor))

                for (pegIndex, pegID) in space.pegs.enumerated() {
                    let pegRadius = 8.5
                    let pegCenter = CGPoint(x: point.x + Double(pegIndex) * 3, y: point.y - Double(pegIndex) * 3)
                    let pegRect = CGRect(x: pegCenter.x - pegRadius, y: pegCenter.y - pegRadius, width: pegRadius * 2, height: pegRadius * 2)
                    let ownerColor = color(for: pegID)
                    context.fill(Path(ellipseIn: pegRect), with: .color(ownerColor))
                    context.stroke(Path(ellipseIn: pegRect), with: .color(.white), lineWidth: 2)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityLabel("Shared Joker Pursuit board")
    }

    private func point(for space: BoardSpaceState, boardRect: CGRect) -> CGPoint {
        let normalizedX = (space.x - 400) / 600
        let normalizedY = (space.y - 400) / 600
        return CGPoint(
            x: boardRect.minX + normalizedX * boardRect.width,
            y: boardRect.minY + normalizedY * boardRect.height
        )
    }

    private func color(for pegID: String) -> Color {
        guard let player = state.players.first(where: { $0.pegs.contains(pegID) }) else { return .gray }
        return Color(hex: player.color)
    }
}
