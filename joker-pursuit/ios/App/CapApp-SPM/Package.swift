// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "JokerPursuitNative",
    platforms: [.iOS(.v26)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["JokerPursuitCore"])
    ],
    targets: [
        .target(
            name: "JokerPursuitCore",
            path: "Sources/JokerPursuitCore"
        )
    ]
)
