import Foundation

@MainActor
final class VibeStore: ObservableObject {
    @Published var cardName: String
    @Published var messages: [DesktopMessage]
    @Published var memories: [DesktopMemory]
    @Published var nowText: String

    private let key = "vibecard-desktop-archive-v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let archive = try? JSONDecoder().decode(DesktopArchive.self, from: data) {
            cardName = archive.cardName; messages = archive.messages; memories = archive.memories; nowText = archive.nowText
        } else {
            cardName = "我的 VibeCard"; messages = []; memories = []; nowText = ""
        }
    }

    func persist() {
        let archive = DesktopArchive(cardName: cardName, memories: memories, messages: messages, nowText: nowText)
        if let data = try? JSONEncoder().encode(archive) { UserDefaults.standard.set(data, forKey: key) }
    }

    func exportArchive() -> Data? {
        try? JSONEncoder().encode(DesktopArchive(cardName: cardName, memories: memories, messages: messages, nowText: nowText))
    }

    func confirm(_ memory: DesktopMemory) {
        memories.removeAll { $0.id == memory.id }
        var confirmed = memory; confirmed.confirmed = true
        memories.append(confirmed); persist()
    }
}
