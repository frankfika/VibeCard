import SwiftUI

struct MenuBarView: View {
    @EnvironmentObject private var store: VibeStore
    var body: some View {
        Text(store.nowText.isEmpty ? "VibeCard" : String(store.nowText.prefix(30)))
        Divider()
        Button("打开我的 Vibe") { NSApp.activate(ignoringOtherApps: true) }
        Button("退出") { NSApp.terminate(nil) }
    }
}
