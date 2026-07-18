internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
#if DEBUG
    // Fast Refresh stays available, but its blue "Refreshing..." banner must
    // never cover the product UI on a physical-device development build.
    RCTDevLoadingViewSetEnabled(false)
#endif
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func customize(_ rootView: UIView) {
    super.customize(rootView)

    guard !UIAccessibility.isReduceMotionEnabled,
          let splashView = rootView.value(forKey: "loadingView") as? UIView else {
      return
    }

    animateAuraSplash(splashView)
  }

  private func animateAuraSplash(_ splashView: UIView) {
    splashView.layoutIfNeeded()

    let logo = splashView.viewWithTag(4101)
    let tagline = splashView.viewWithTag(4103)
    let accent = splashView.viewWithTag(4102)

    UIView.animate(
      withDuration: 0.36,
      delay: 0,
      options: [.curveEaseOut, .beginFromCurrentState, .allowUserInteraction]
    ) {
      logo?.alpha = 1
    }

    UIView.animate(
      withDuration: 0.28,
      delay: 0.08,
      options: [.curveEaseOut, .beginFromCurrentState, .allowUserInteraction]
    ) {
      tagline?.alpha = 1
      accent?.alpha = 1
    }
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // Prefer the explicit bundle URL in debug builds so a stale bridge URL
    // cannot surface as "No script URL provided" on physical devices.
    bundleURL() ?? bridge.bundleURL
  }

  override func bundleURL() -> URL? {
#if DEBUG
    if let explicitMetroURL = explicitMetroBundleURL() {
      NSLog("[AURA] Using explicit Metro bundle URL: \(explicitMetroURL.absoluteString)")
      return explicitMetroURL
    }

    if let configuredMetroURL = configuredMetroBundleURL() {
      NSLog("[AURA] Using configured Metro bundle URL: \(configuredMetroURL.absoluteString)")
      return configuredMetroURL
    }

    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }

  private func configuredMetroBundleURL() -> URL? {
    let url = RCTBundleURLProvider.sharedSettings().jsBundleURL(
      forBundleRoot: ".expo/.virtual-metro-entry"
    )

    guard
      let host = url?.host,
      host != "localhost",
      host != "127.0.0.1",
      host != "::1"
    else {
      return nil
    }

    return url
  }

  private func explicitMetroBundleURL() -> URL? {
    guard
      let ipPath = Bundle.main.path(forResource: "ip", ofType: "txt"),
      let host = try? String(contentsOfFile: ipPath, encoding: .utf8)
        .trimmingCharacters(in: .whitespacesAndNewlines),
      !host.isEmpty
    else {
      return nil
    }

    return RCTBundleURLProvider.jsBundleURL(
      forBundleRoot: ".expo/.virtual-metro-entry",
      packagerHost: host,
      enableDev: true,
      enableMinification: false,
      inlineSourceMap: false
    )
  }
}
