import AVFAudio
import AVFoundation
import Foundation
import React
import UIKit

#if canImport(AmazonChimeSDK)
import AmazonChimeSDK
#endif

private let auraChimeMeetingEventName = "AURAChimeMeetingEvent"

@objc(AURAChimeMeeting)
final class AURAChimeMeeting: RCTEventEmitter {
  private static weak var sharedEmitter: AURAChimeMeeting?
  private var hasListeners = false

  override init() {
    super.init()
    AURAChimeMeeting.sharedEmitter = self
  }

  override class func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    [auraChimeMeetingEventName]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  @objc
  func isAvailable() -> NSNumber {
    NSNumber(value: AURAChimeMeetingRuntime.shared.isAvailable)
  }

  @objc(initialize:rejecter:)
  func initialize(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    AURAChimeMeetingRuntime.shared.initialize()
    resolve(nil)
  }

  @objc(startMeeting:resolver:rejecter:)
  func startMeeting(_ payloadJson: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    AURAChimeMeeting.requestMediaPermissions { result in
      DispatchQueue.main.async {
        switch result {
        case .success:
          do {
            try AURAChimeMeetingRuntime.shared.startMeeting(payloadJson: payloadJson)
            resolve(nil)
          } catch {
            reject("AURA_CHIME_START_FAILED", error.localizedDescription, error)
            AURAChimeMeeting.emit(type: "meetingError", body: ["error": error.localizedDescription])
          }
        case .failure(let error):
          reject("AURA_CHIME_PERMISSION_DENIED", error.localizedDescription, error)
          AURAChimeMeeting.emit(type: "meetingError", body: ["error": error.localizedDescription])
        }
      }
    }
  }

  private static func requestMediaPermissions(_ completion: @escaping (Result<Void, Error>) -> Void) {
    requestCameraPermission { cameraGranted in
      guard cameraGranted else {
        completion(.failure(AURAChimeMeetingError.permissionDenied("카메라")))
        return
      }

      requestMicrophonePermission { microphoneGranted in
        guard microphoneGranted else {
          completion(.failure(AURAChimeMeetingError.permissionDenied("마이크")))
          return
        }
        completion(.success(()))
      }
    }
  }

  private static func requestCameraPermission(_ completion: @escaping (Bool) -> Void) {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      completion(true)
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video, completionHandler: completion)
    case .denied, .restricted:
      completion(false)
    @unknown default:
      completion(false)
    }
  }

  private static func requestMicrophonePermission(_ completion: @escaping (Bool) -> Void) {
    if #available(iOS 17.0, *) {
      switch AVAudioApplication.shared.recordPermission {
      case .granted:
        completion(true)
      case .undetermined:
        AVAudioApplication.requestRecordPermission(completionHandler: completion)
      case .denied:
        completion(false)
      @unknown default:
        completion(false)
      }
      return
    }

    switch AVAudioSession.sharedInstance().recordPermission {
    case .granted:
      completion(true)
    case .undetermined:
      AVAudioSession.sharedInstance().requestRecordPermission(completion)
    case .denied:
      completion(false)
    @unknown default:
      completion(false)
    }
  }

  @objc(stopMeeting:rejecter:)
  func stopMeeting(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      AURAChimeMeetingRuntime.shared.stopMeeting()
      resolve(nil)
    }
  }

  @objc(setMuted:resolver:rejecter:)
  func setMuted(_ muted: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      AURAChimeMeetingRuntime.shared.setMuted(muted)
      resolve(nil)
    }
  }

  @objc(setLocalVideoEnabled:resolver:rejecter:)
  func setLocalVideoEnabled(_ enabled: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      AURAChimeMeetingRuntime.shared.setLocalVideoEnabled(enabled)
      resolve(nil)
    }
  }

  @objc(switchCamera:rejecter:)
  func switchCamera(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      AURAChimeMeetingRuntime.shared.switchCamera()
      resolve(nil)
    }
  }

  static func emit(type: String, body: [String: Any] = [:]) {
    guard let emitter = sharedEmitter, emitter.hasListeners else {
      return
    }

    var eventBody = body
    eventBody["type"] = type
    emitter.sendEvent(withName: auraChimeMeetingEventName, body: eventBody)
  }
}

@objc(AURAChimeVideoViewManager)
final class AURAChimeVideoViewManager: RCTViewManager {
  override class func requiresMainQueueSetup() -> Bool {
    true
  }

  override func view() -> UIView! {
    AURAChimeVideoContainerView()
  }
}

private final class AURAChimeVideoContainerView: UIView {
  @objc var tileType: NSString = "remote" {
    didSet {
      registerRenderView()
    }
  }

  #if canImport(AmazonChimeSDK)
  private let renderView = DefaultVideoRenderView()
  #else
  private let renderView = UIView()
  #endif

  override init(frame: CGRect) {
    super.init(frame: frame)
    configure()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configure()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    renderView.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      AURAChimeMeetingRuntime.shared.unregisterVideoView(self)
      return
    }
    registerRenderView()
  }

  private func configure() {
    backgroundColor = .black
    clipsToBounds = true
    renderView.frame = bounds
    renderView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(renderView)
  }

  private func registerRenderView() {
    guard window != nil else {
      return
    }
    AURAChimeMeetingRuntime.shared.registerVideoView(self, tileType: tileType as String)
  }

  #if canImport(AmazonChimeSDK)
  var chimeRenderView: DefaultVideoRenderView {
    renderView
  }
  #endif
}

#if canImport(AmazonChimeSDK)
private final class AURAChimeMeetingRuntime: NSObject, AudioVideoObserver, VideoTileObserver, RealtimeObserver {
  static let shared = AURAChimeMeetingRuntime()

  let isAvailable = true

  private let logger = ConsoleLogger(name: "AURAChimeMeeting", level: .ERROR)
  private var meetingSession: MeetingSession?
  private weak var localVideoView: AURAChimeVideoContainerView?
  private weak var remoteVideoView: AURAChimeVideoContainerView?
  private var localTileId: Int?
  private var remoteTileId: Int?
  private var isLocalVideoEnabled = true
  private var didStart = false
  private var lastAudioLevels: [String: String] = [:]

  func initialize() {}

  func registerVideoView(_ containerView: AURAChimeVideoContainerView, tileType: String) {
    if tileType == "local" {
      localVideoView = containerView
      containerView.chimeRenderView.mirror = true
      containerView.chimeRenderView.contentMode = .scaleAspectFill
      if let tileId = localTileId {
        meetingSession?.audioVideo.bindVideoView(videoView: containerView.chimeRenderView, tileId: tileId)
      }
      return
    }

    remoteVideoView = containerView
    containerView.chimeRenderView.mirror = false
    containerView.chimeRenderView.contentMode = .scaleAspectFit
    if let tileId = remoteTileId {
      meetingSession?.audioVideo.bindVideoView(videoView: containerView.chimeRenderView, tileId: tileId)
    }
  }

  func unregisterVideoView(_ containerView: AURAChimeVideoContainerView) {
    if localVideoView === containerView {
      if let tileId = localTileId {
        meetingSession?.audioVideo.unbindVideoView(tileId: tileId)
      }
      localVideoView = nil
    }
    if remoteVideoView === containerView {
      if let tileId = remoteTileId {
        meetingSession?.audioVideo.unbindVideoView(tileId: tileId)
      }
      remoteVideoView = nil
    }
  }

  func startMeeting(payloadJson: String) throws {
    stopMeeting()

    guard let payloadData = payloadJson.data(using: .utf8),
          let payload = try JSONSerialization.jsonObject(with: payloadData) as? [String: Any] else {
      throw AURAChimeMeetingError.invalidPayload("Chime 입장 정보가 올바르지 않습니다.")
    }

    let configuration = try makeMeetingSessionConfiguration(payload: payload)
    let session = DefaultMeetingSession(configuration: configuration, logger: logger)
    meetingSession = session

    try configureAudioSession()
    session.audioVideo.addAudioVideoObserver(observer: self)
    session.audioVideo.addVideoTileObserver(observer: self)
    session.audioVideo.addRealtimeObserver(observer: self)
    try session.audioVideo.start()
    session.audioVideo.startRemoteVideo()
    if isLocalVideoEnabled {
      try session.audioVideo.startLocalVideo(config: LocalVideoConfiguration(maxBitRateKbps: 2500, simulcastEnabled: false))
    }

    didStart = true
    AURAChimeMeeting.emit(type: "meetingStateChanged", body: ["state": "joining"])
  }

  func stopMeeting() {
    guard let session = meetingSession else {
      deactivateAudioSession()
      return
    }

    session.audioVideo.stopLocalVideo()
    session.audioVideo.stopRemoteVideo()
    if let tileId = localTileId {
      session.audioVideo.unbindVideoView(tileId: tileId)
    }
    if let tileId = remoteTileId {
      session.audioVideo.unbindVideoView(tileId: tileId)
    }
    session.audioVideo.removeRealtimeObserver(observer: self)
    session.audioVideo.removeVideoTileObserver(observer: self)
    session.audioVideo.removeAudioVideoObserver(observer: self)
    session.audioVideo.stop()

    meetingSession = nil
    localTileId = nil
    remoteTileId = nil
    didStart = false
    deactivateAudioSession()
    AURAChimeMeeting.emit(type: "meetingStateChanged", body: ["state": "ended"])
  }

  func setMuted(_ muted: Bool) {
    guard let audioVideo = meetingSession?.audioVideo else {
      return
    }
    if muted {
      _ = audioVideo.realtimeLocalMute()
    } else {
      _ = audioVideo.realtimeLocalUnmute()
    }
  }

  func setLocalVideoEnabled(_ enabled: Bool) {
    isLocalVideoEnabled = enabled
    guard let audioVideo = meetingSession?.audioVideo else {
      return
    }
    if enabled {
      do {
        try audioVideo.startLocalVideo(config: LocalVideoConfiguration(maxBitRateKbps: 2500, simulcastEnabled: false))
      } catch {
        AURAChimeMeeting.emit(type: "meetingError", body: ["error": error.localizedDescription])
      }
    } else {
      audioVideo.stopLocalVideo()
    }
  }

  func switchCamera() {
    meetingSession?.audioVideo.switchCamera()
  }

  func audioSessionDidStartConnecting(reconnecting: Bool) {
    AURAChimeMeeting.emit(type: "meetingStateChanged", body: ["state": reconnecting ? "reconnecting" : "connecting"])
  }

  func audioSessionDidStart(reconnecting: Bool) {
    AURAChimeMeeting.emit(type: "meetingStateChanged", body: ["state": reconnecting ? "reconnected" : "connected"])
  }

  func audioSessionDidDrop() {
    AURAChimeMeeting.emit(type: "meetingStateChanged", body: ["state": "reconnecting"])
  }

  func audioSessionDidStopWithStatus(sessionStatus: MeetingSessionStatus) {
    AURAChimeMeeting.emit(type: "meetingStateChanged", body: ["state": "audioStopped", "status": "\(sessionStatus.statusCode)"])
  }

  func audioSessionDidCancelReconnect() {
    AURAChimeMeeting.emit(type: "meetingStateChanged", body: ["state": "reconnectCancelled"])
  }

  func connectionDidRecover() {
    AURAChimeMeeting.emit(type: "meetingStateChanged", body: ["state": "connectionRecovered"])
  }

  func connectionDidBecomePoor() {
    AURAChimeMeeting.emit(type: "meetingStateChanged", body: ["state": "connectionPoor"])
  }

  func videoSessionDidStartConnecting() {
    AURAChimeMeeting.emit(type: "meetingStateChanged", body: ["state": "videoConnecting"])
  }

  func videoSessionDidStartWithStatus(sessionStatus: MeetingSessionStatus) {
    AURAChimeMeeting.emit(type: "meetingStateChanged", body: ["state": "videoStarted", "status": "\(sessionStatus.statusCode)"])
  }

  func videoSessionDidStopWithStatus(sessionStatus: MeetingSessionStatus) {
    AURAChimeMeeting.emit(type: "meetingStateChanged", body: ["state": "videoStopped", "status": "\(sessionStatus.statusCode)"])
  }

  func remoteVideoSourcesDidBecomeAvailable(sources: [RemoteVideoSource]) {
    let subscriptions = Dictionary(uniqueKeysWithValues: sources.map { source in
      let configuration = VideoSubscriptionConfiguration()
      configuration.priority = .highest
      configuration.targetResolution = .videoResolutionHD
      return (source, configuration)
    })
    meetingSession?.audioVideo.updateVideoSourceSubscriptions(
      addedOrUpdated: subscriptions,
      removed: []
    )
  }

  func remoteVideoSourcesDidBecomeUnavailable(sources: [RemoteVideoSource]) {
    meetingSession?.audioVideo.updateVideoSourceSubscriptions(
      addedOrUpdated: [:],
      removed: sources
    )
  }

  func cameraSendAvailabilityDidChange(available: Bool) {
    AURAChimeMeeting.emit(type: "meetingStateChanged", body: ["state": available ? "cameraAvailable" : "cameraUnavailable"])
  }

  func videoTileDidAdd(tileState: VideoTileState) {
    guard !tileState.isContent else {
      return
    }

    if tileState.isLocalTile {
      localTileId = tileState.tileId
      if let renderView = localVideoView?.chimeRenderView {
        renderView.mirror = true
        renderView.contentMode = .scaleAspectFill
        meetingSession?.audioVideo.bindVideoView(videoView: renderView, tileId: tileState.tileId)
      }
    } else {
      remoteTileId = tileState.tileId
      if let renderView = remoteVideoView?.chimeRenderView {
        renderView.mirror = false
        renderView.contentMode = .scaleAspectFit
        meetingSession?.audioVideo.bindVideoView(videoView: renderView, tileId: tileState.tileId)
      }
    }

    AURAChimeMeeting.emit(
      type: "videoTileAdded",
      body: [
        "attendeeId": tileState.attendeeId,
        "tileId": tileState.tileId,
        "isLocal": tileState.isLocalTile,
      ]
    )
  }

  func videoTileDidRemove(tileState: VideoTileState) {
    meetingSession?.audioVideo.unbindVideoView(tileId: tileState.tileId)
    if tileState.tileId == localTileId {
      localTileId = nil
    }
    if tileState.tileId == remoteTileId {
      remoteTileId = nil
    }
    AURAChimeMeeting.emit(
      type: "videoTileRemoved",
      body: [
        "tileId": tileState.tileId,
        "isLocal": tileState.isLocalTile,
      ]
    )
  }

  func videoTileDidPause(tileState: VideoTileState) {}

  func videoTileDidResume(tileState: VideoTileState) {}

  func videoTileSizeDidChange(tileState: VideoTileState) {}

  func volumeDidChange(volumeUpdates: [VolumeUpdate]) {
    for update in volumeUpdates {
      let attendeeId = update.attendeeInfo.attendeeId
      let level = "\(update.volumeLevel)"
      guard lastAudioLevels[attendeeId] != level else {
        continue
      }
      lastAudioLevels[attendeeId] = level
      AURAChimeMeeting.emit(
        type: "audioLevelChanged",
        body: [
          "attendeeId": attendeeId,
          "level": level,
        ]
      )
    }
  }

  func signalStrengthDidChange(signalUpdates: [SignalUpdate]) {}

  func attendeesDidJoin(attendeeInfo: [AttendeeInfo]) {
    emitPresence(attendeeInfo, present: true)
  }

  func attendeesDidLeave(attendeeInfo: [AttendeeInfo]) {
    attendeeInfo.forEach { lastAudioLevels.removeValue(forKey: $0.attendeeId) }
    emitPresence(attendeeInfo, present: false)
  }

  func attendeesDidDrop(attendeeInfo: [AttendeeInfo]) {
    attendeeInfo.forEach { lastAudioLevels.removeValue(forKey: $0.attendeeId) }
    emitPresence(attendeeInfo, present: false, dropped: true)
  }

  func attendeesDidMute(attendeeInfo: [AttendeeInfo]) {
    emitPresence(attendeeInfo, present: true, muted: true)
  }

  func attendeesDidUnmute(attendeeInfo: [AttendeeInfo]) {
    emitPresence(attendeeInfo, present: true, muted: false)
  }

  private func emitPresence(_ attendeeInfo: [AttendeeInfo], present: Bool, dropped: Bool = false, muted: Bool? = nil) {
    for attendee in attendeeInfo {
      var body: [String: Any] = [
        "attendeeId": attendee.attendeeId,
        "externalUserId": attendee.externalUserId,
        "present": present,
        "dropped": dropped,
      ]
      if let muted {
        body["muted"] = muted
      }
      AURAChimeMeeting.emit(type: "attendeePresenceChanged", body: body)
    }
  }

  private func makeMeetingSessionConfiguration(payload: [String: Any]) throws -> MeetingSessionConfiguration {
    let meetingPayload = try dictionary(payload, keys: ["meeting", "Meeting"])
    let attendeePayload = try dictionary(payload, keys: ["attendee", "Attendee"])
    let placementPayload = try dictionary(meetingPayload, keys: ["MediaPlacement", "mediaPlacement"])

    let mediaPlacement = MediaPlacement(
      audioFallbackUrl: try string(placementPayload, keys: ["AudioFallbackUrl", "audioFallbackUrl"]),
      audioHostUrl: try string(placementPayload, keys: ["AudioHostUrl", "audioHostUrl"]),
      signalingUrl: try string(placementPayload, keys: ["SignalingUrl", "signalingUrl"]),
      turnControlUrl: try string(placementPayload, keys: ["TurnControlUrl", "turnControlUrl"]),
      eventIngestionUrl: optionalString(placementPayload, keys: ["EventIngestionUrl", "eventIngestionUrl"])
    )
    let meeting = Meeting(
      externalMeetingId: optionalString(meetingPayload, keys: ["ExternalMeetingId", "externalMeetingId"]),
      mediaPlacement: mediaPlacement,
      mediaRegion: optionalString(meetingPayload, keys: ["MediaRegion", "mediaRegion"]) ?? "ap-northeast-2",
      meetingId: try string(meetingPayload, keys: ["MeetingId", "meetingId"])
    )
    let attendee = Attendee(
      attendeeId: try string(attendeePayload, keys: ["AttendeeId", "attendeeId"]),
      externalUserId: try string(attendeePayload, keys: ["ExternalUserId", "externalUserId"]),
      joinToken: try string(attendeePayload, keys: ["JoinToken", "joinToken"])
    )

    return MeetingSessionConfiguration(
      createMeetingResponse: CreateMeetingResponse(meeting: meeting),
      createAttendeeResponse: CreateAttendeeResponse(attendee: attendee)
    )
  }

  private func configureAudioSession() throws {
    let audioSession = AVAudioSession.sharedInstance()
    try audioSession.setCategory(.playAndRecord, mode: .videoChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP, .defaultToSpeaker])
    try audioSession.setActive(true)
  }

  private func deactivateAudioSession() {
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
#else
private final class AURAChimeMeetingRuntime {
  static let shared = AURAChimeMeetingRuntime()
  let isAvailable = false

  func initialize() {}

  func registerVideoView(_ containerView: AURAChimeVideoContainerView, tileType: String) {}

  func unregisterVideoView(_ containerView: AURAChimeVideoContainerView) {}

  func startMeeting(payloadJson: String) throws {
    throw AURAChimeMeetingError.sdkUnavailable
  }

  func stopMeeting() {}

  func setMuted(_ muted: Bool) {}

  func setLocalVideoEnabled(_ enabled: Bool) {}

  func switchCamera() {}
}
#endif

private enum AURAChimeMeetingError: LocalizedError {
  case invalidPayload(String)
  case missingField(String)
  case permissionDenied(String)
  case sdkUnavailable

  var errorDescription: String? {
    switch self {
    case .invalidPayload(let message):
      return message
    case .missingField(let field):
      return "Chime 입장 정보에 \(field)이(가) 없습니다."
    case .permissionDenied(let mediaType):
      return "\(mediaType) 권한이 없어 Chime 화상상담을 시작할 수 없습니다. 설정에서 권한을 허용해 주세요."
    case .sdkUnavailable:
      return "Amazon Chime iOS SDK가 아직 설치되지 않았습니다. ios에서 pod install을 실행해 주세요."
    }
  }
}

private func dictionary(_ payload: [String: Any], keys: [String]) throws -> [String: Any] {
  for key in keys {
    if let value = payload[key] as? [String: Any] {
      return value
    }
  }
  throw AURAChimeMeetingError.missingField(keys[0])
}

private func string(_ payload: [String: Any], keys: [String]) throws -> String {
  for key in keys {
    if let value = payload[key] as? String, !value.isEmpty {
      return value
    }
  }
  throw AURAChimeMeetingError.missingField(keys[0])
}

private func optionalString(_ payload: [String: Any], keys: [String]) -> String? {
  for key in keys {
    if let value = payload[key] as? String, !value.isEmpty {
      return value
    }
  }
  return nil
}
