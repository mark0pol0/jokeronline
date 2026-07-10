import Foundation
import Security

enum SessionVault {
    private static let service = "com.markcarlson.jokerpursuit.multiplayer"
    private static let account = "active-room"
    private static let simulatorKey = "joker-pursuit.simulator-room-session"

    static func save(_ session: RoomSession) throws {
        let data = try JSONEncoder().encode(session)
#if targetEnvironment(simulator)
        UserDefaults.standard.set(data, forKey: simulatorKey)
#else
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
        var newItem = query
        newItem[kSecValueData as String] = data
        newItem[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(newItem as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw SocketTransportError.server("Unable to securely save the room session.")
        }
#endif
    }

    static func load() throws -> RoomSession? {
#if targetEnvironment(simulator)
        guard let data = UserDefaults.standard.data(forKey: simulatorKey) else { return nil }
        return try JSONDecoder().decode(RoomSession.self, from: data)
#else
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw SocketTransportError.server("Unable to restore the saved room session.")
        }
        return try JSONDecoder().decode(RoomSession.self, from: data)
#endif
    }

    static func clear() {
#if targetEnvironment(simulator)
        UserDefaults.standard.removeObject(forKey: simulatorKey)
#else
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
#endif
    }
}
