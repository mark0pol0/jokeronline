struct BoardSpaceState: Codable, Identifiable, Sendable {
    let id: String
    let type: String
    let x: Double
    let y: Double
    let index: Int
    let label: String
    var pegs: [String]
    let sectionIndex: Int
}
