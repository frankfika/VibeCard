import Foundation

protocol VibeService {
    func reply(to text: String, memories: [DesktopMemory]) async throws -> (reply: String, proposal: DesktopMemory?)
}

/// Local deterministic adapter. A future HTTP adapter can call the existing
/// `/api/v1/owner/vibe/messages` endpoint without changing the view model.
struct LocalVibeService: VibeService {
    func reply(to text: String, memories: [DesktopMemory]) async throws -> (reply: String, proposal: DesktopMemory?) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let proposal = DesktopMemory(id: "desktop-\(UUID().uuidString)", content: trimmed, visibility: "private", confirmed: false)
        return ("我听到了。只有你确认后，这句话才会成为长期记忆。", trimmed.isEmpty ? nil : proposal)
    }
}
