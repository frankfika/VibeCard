import SwiftUI
import AppKit

@main
struct VibeCardDesktopApp: App {
    @StateObject private var store = VibeStore()

    var body: some Scene {
        WindowGroup(id: "main") { ContentView().environmentObject(store) }
        MenuBarExtra("VibeCard", systemImage: "sparkles") { MenuBarView().environmentObject(store) }
        Settings { Text("VibeCard 使用本地 Core 存储。服务端连接可在后续设置中配置。").padding(30) }
    }
}
