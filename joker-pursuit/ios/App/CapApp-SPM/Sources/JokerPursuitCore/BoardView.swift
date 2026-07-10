import SwiftUI

struct BoardView: View {
    let players: [PlayerState]
    let currentPlayerIndex: Int

    var body: some View {
        Canvas { context, size in
            let diameter = min(size.width, size.height)
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let trackRadius = diameter * 0.43
            let boardRect = CGRect(
                x: center.x - diameter * 0.48,
                y: center.y - diameter * 0.48,
                width: diameter * 0.96,
                height: diameter * 0.96
            )

            context.fill(Path(ellipseIn: boardRect), with: .color(DesignTokens.paper))
            context.stroke(Path(ellipseIn: boardRect), with: .color(.brown.opacity(0.55)), lineWidth: 3)

            for index in 0..<64 {
                let point = point(index: index, radius: trackRadius, center: center)
                let hole = CGRect(x: point.x - 4.5, y: point.y - 4.5, width: 9, height: 9)
                context.fill(Path(ellipseIn: hole), with: .color(.black.opacity(0.72)))
            }

            for (playerIndex, player) in players.enumerated() {
                for (pegIndex, peg) in player.pegs.enumerated() {
                    let point = pegPoint(
                        peg: peg,
                        pegIndex: pegIndex,
                        playerIndex: playerIndex,
                        playerCount: players.count,
                        trackRadius: trackRadius,
                        center: center
                    )
                    let pegRect = CGRect(x: point.x - 9, y: point.y - 9, width: 18, height: 18)
                    context.fill(Path(ellipseIn: pegRect), with: .color(player.color.color))
                    context.stroke(Path(ellipseIn: pegRect), with: .color(.white), lineWidth: playerIndex == currentPlayerIndex ? 3 : 1)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityLabel("Joker Pursuit board")
    }

    private func point(index: Int, radius: Double, center: CGPoint) -> CGPoint {
        let angle = (Double(index) / 64 * .pi * 2) - (.pi / 2)
        return CGPoint(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius)
    }

    private func pegPoint(
        peg: PegState,
        pegIndex: Int,
        playerIndex: Int,
        playerCount: Int,
        trackRadius: Double,
        center: CGPoint
    ) -> CGPoint {
        if let trackPosition = peg.trackPosition {
            return point(index: trackPosition, radius: trackRadius, center: center)
        }
        if peg.isFinished {
            let playerAngle = (Double(playerIndex) / Double(playerCount) * .pi * 2) - (.pi / 2)
            let castleRadius = trackRadius * (0.48 - Double(pegIndex) * 0.07)
            return CGPoint(
                x: center.x + cos(playerAngle) * castleRadius,
                y: center.y + sin(playerAngle) * castleRadius
            )
        }
        let playerAngle = (Double(playerIndex) / Double(playerCount) * .pi * 2) - (.pi / 2)
        let laneOffset = (Double(pegIndex) - 2) * 15
        return CGPoint(
            x: center.x + cos(playerAngle) * (trackRadius * 0.58) - sin(playerAngle) * laneOffset,
            y: center.y + sin(playerAngle) * (trackRadius * 0.58) + cos(playerAngle) * laneOffset
        )
    }
}
