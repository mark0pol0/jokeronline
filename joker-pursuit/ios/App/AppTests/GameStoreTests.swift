import XCTest
@testable import JokerPursuitCore

@MainActor
final class GameStoreTests: XCTestCase {
    func testLocalGameStartsWithFiveCardsPerPlayer() {
        let store = GameStore()

        store.startLocalGame()

        XCTAssertEqual(store.screen, .game)
        XCTAssertEqual(store.players.count, 2)
        XCTAssertTrue(store.players.allSatisfy { $0.hand.count == 5 })
        XCTAssertTrue(store.players.allSatisfy { $0.pegs.count == 5 })
    }

    func testKingMovesPegOutOfHomeAndAdvancesTurn() {
        let store = GameStore()
        store.startLocalGame()
        let king = PlayingCard(rank: .king, suit: .hearts)
        store.players[0].hand = [king]
        let pegID = store.players[0].pegs[0].id

        store.selectCard(king)
        store.movePeg(pegID)

        XCTAssertEqual(store.players[0].pegs[0].trackPosition, 0)
        XCTAssertEqual(store.currentPlayerIndex, 1)
        XCTAssertEqual(store.moveCount, 1)
    }

    func testNumberedCardCannotMovePegOutOfHome() {
        let store = GameStore()
        store.startLocalGame()
        let four = PlayingCard(rank: .four, suit: .clubs)
        store.players[0].hand = [four]
        let pegID = store.players[0].pegs[0].id

        store.selectCard(four)
        store.movePeg(pegID)

        XCTAssertNil(store.players[0].pegs[0].trackPosition)
        XCTAssertEqual(store.currentPlayerIndex, 0)
        XCTAssertEqual(store.status, "Only an ace or king can leave home.")
    }

    func testOnlineFactoryBuildsWebCompatibleGameShape() throws {
        let players = [
            RoomPlayer(id: "host", name: "Host", color: ""),
            RoomPlayer(id: "guest", name: "Guest", color: "")
        ]

        let state = OnlineGameFactory.make(players: players)
        let data = try JSONEncoder().encode(state)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(state.players.count, 2)
        XCTAssertEqual(state.players[0].hand.count, 5)
        XCTAssertEqual(state.players[1].hand.count, 5)
        XCTAssertEqual(state.board.sections.count, 2)
        XCTAssertNotNil(json["board"])
        XCTAssertNotNil(json["drawPile"])
    }

    func testOnlineMoveAdvancesAuthoritativeTurn() throws {
        let players = [
            RoomPlayer(id: "host", name: "Host", color: ""),
            RoomPlayer(id: "guest", name: "Guest", color: "")
        ]
        var state = OnlineGameFactory.make(players: players)
        let ace = OnlineCard(id: "ace", rank: "ace", suit: "hearts", value: 1, isFace: false)
        state.players[0].hand = [ace]
        let pegID = state.players[0].pegs[0]

        try OnlineGameRules.play(state: &state, actorID: "host", cardID: ace.id, pegID: pegID)

        XCTAssertEqual(state.currentPlayerIndex, 1)
        XCTAssertTrue(state.board.allSpaces["section1_entrance_2"]?.pegs.contains(pegID) == true)
        XCTAssertFalse(state.board.allSpaces["section1_home_0"]?.pegs.contains(pegID) == true)
    }

    func testLocalGameCanReachWinnerState() {
        let store = GameStore()
        store.startLocalGame()
        for index in 0..<4 {
            store.players[0].pegs[index].isFinished = true
            store.players[0].pegs[index].trackPosition = nil
            store.players[0].pegs[index].distanceTravelled = 64
        }
        let ace = PlayingCard(rank: .ace, suit: .spades)
        store.players[0].hand = [ace]
        store.players[0].pegs[4].trackPosition = 63
        store.players[0].pegs[4].distanceTravelled = 63

        store.selectCard(ace)
        store.movePeg(store.players[0].pegs[4].id)

        XCTAssertEqual(store.winnerName, "Player 1")
        XCTAssertEqual(store.status, "Player 1 wins!")
    }
}
