import Foundation

struct DesktopMemory: Codable, Identifiable, Hashable {
    let id: String
    var content: String
    var visibility: String = "private"
    var confirmed: Bool = false
}

struct DesktopMessage: Codable, Identifiable, Hashable {
    let id: UUID
    let role: String
    let text: String
}

struct DesktopArchive: Codable {
    var cardName: String
    var memories: [DesktopMemory]
    var messages: [DesktopMessage]
    var nowText: String
}
