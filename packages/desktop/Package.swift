// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "VibeCardDesktop",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "VibeCardDesktop", targets: ["VibeCardDesktop"])],
    targets: [.executableTarget(name: "VibeCardDesktop", path: "App")]
)
