import SwiftUI

struct OnlineCardFaceView: View {
    let card: OnlineCard
    let isSelected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(card.shortRank)
                .font(.headline.bold())
            Text(card.symbol)
                .font(.title2)
            Spacer(minLength: 0)
            Text(card.symbol)
                .font(.title3)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .foregroundStyle(card.isRed ? .red : .black)
        .padding(8)
        .frame(maxWidth: .infinity, minHeight: 96)
        .background(DesignTokens.paper)
        .clipShape(.rect(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(isSelected ? DesignTokens.teal : .black.opacity(0.12), lineWidth: isSelected ? 4 : 1)
        }
        .shadow(color: .black.opacity(isSelected ? 0.28 : 0.14), radius: isSelected ? 10 : 4, y: isSelected ? 5 : 2)
        .offset(y: isSelected ? -10 : 0)
        .accessibilityLabel("\(card.shortRank) of \(card.suit)")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
