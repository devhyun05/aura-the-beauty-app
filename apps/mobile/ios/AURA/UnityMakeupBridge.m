#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTViewManager.h>
#import <TargetConditionals.h>
#import <UIKit/UIKit.h>
#import <mach-o/dyld.h>
#import <objc/message.h>

static NSString *const UnityMakeupEventName = @"UnityMakeupEvent";
static NSString *const UnityMakeupEventNotification = @"AURAUnityMakeupEventNotification";

@interface UnityMakeupNativeCalls : NSObject

- (void)sendMessageToMobileApp:(NSString *)message;

@end

@interface UnityMakeupRuntime : NSObject

+ (instancetype)sharedRuntime;
- (BOOL)isFrameworkAvailable;
- (BOOL)isReady;
- (BOOL)isRunning;
- (BOOL)prepareFramework;
- (BOOL)ensureRunning;
- (void)prepareHidden;
- (void)prepareHiddenAndPauseWhenReady;
- (void)handleUnityMessage:(NSString *)message;
- (UIView *)unityView;
- (UIView *)unityViewForContainer:(UIView *)container;
- (void)detachUnityView;
- (void)detachUnityViewForContainer:(UIView *)container;
- (void)detachUnityViewFromGlobalHide;
- (void)setPlayerPaused:(BOOL)paused;
- (void)acquireHiddenRunLease:(NSString *)leaseId;
- (void)releaseHiddenRunLease:(NSString *)leaseId;
- (void)applyPlayerPaused:(BOOL)paused;
- (void)reconcilePlayerPauseStateForReason:(NSString *)reason force:(BOOL)force;
- (void)requestRuntimeMode:(NSString *)mode reason:(NSString *)reason force:(BOOL)force;
- (BOOL)sendRuntimeModeRequest:(NSString *)mode generation:(NSInteger)generation;
- (void)handleRuntimeModeAck:(NSString *)mode generation:(NSInteger)generation;
- (void)installApplicationLifecycleObserversIfNeeded;
- (void)sendMessageToGameObject:(NSString *)gameObject
                         method:(NSString *)method
                        payload:(NSString *)payload;
- (void)sendMessageToGameObject:(NSString *)gameObject
                         method:(NSString *)method
                        payload:(NSString *)payload
                       metadata:(NSString *)metadata;

@end

@implementation UnityMakeupRuntime {
  NSBundle *_unityBundle;
  id _unityFramework;
  UnityMakeupNativeCalls *_nativeCalls;
  __weak UIWindow *_reactWindow;
  __weak UIViewController *_reactRootViewController;
  BOOL _isReady;
  BOOL _hasCompletedWarmup;
  BOOL _isRunning;
  BOOL _isPresentingUnityView;
  BOOL _hasExplicitHiddenRunLease;
  BOOL _pauseWhenReadyIfHidden;
  __weak UIView *_unityViewOwner;
  NSMutableSet<NSString *> *_hiddenRunLeaseIds;
  BOOL _applicationIsActive;
  BOOL _desiredPlayerPaused;
  BOOL _hasAppliedPlayerPausedState;
  BOOL _lastAppliedPlayerPausedState;
  NSInteger _runtimeModeGeneration;
  NSInteger _pendingRuntimeModeGeneration;
  NSString *_requestedRuntimeMode;
  NSString *_acknowledgedRuntimeMode;
  BOOL _runtimeModeRequestPending;
  BOOL _didInstallApplicationLifecycleObservers;
  BOOL _didInstallWindowGuard;
  int _unityArgc;
  char **_unityArgv;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    _hiddenRunLeaseIds = [NSMutableSet set];
    _applicationIsActive =
        UIApplication.sharedApplication.applicationState == UIApplicationStateActive;
    _desiredPlayerPaused = YES;
    _requestedRuntimeMode = @"live";
    [self installApplicationLifecycleObserversIfNeeded];
  }
  return self;
}

+ (instancetype)sharedRuntime
{
  static UnityMakeupRuntime *runtime = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    runtime = [UnityMakeupRuntime new];
  });
  return runtime;
}

- (BOOL)isFrameworkAvailable
{
#if TARGET_OS_SIMULATOR
  return NO;
#else
  return [[NSFileManager defaultManager] fileExistsAtPath:[self unityFrameworkPath]];
#endif
}

- (BOOL)isReady
{
  return _isReady;
}

- (BOOL)isRunning
{
  return _isRunning && [self unityAppController] != nil;
}

- (BOOL)prepareFramework
{
  if (![self isFrameworkAvailable]) {
    return NO;
  }

  return [self loadUnityFrameworkIfNeeded];
}

- (BOOL)ensureRunning
{
  if (![self isFrameworkAvailable]) {
    return NO;
  }

  if (![self loadUnityFrameworkIfNeeded]) {
    return NO;
  }

  if ([self unityAppController] != nil) {
    _isRunning = YES;
    if (!_isPresentingUnityView) {
      [self scheduleConcealUnityView];
    }
    [self reconcilePlayerPauseStateForReason:@"ensure-running-existing" force:NO];
    return YES;
  }

  [self rememberReactWindowIfNeeded];
  [self installWindowGuardIfNeeded];

  SEL runSelector = NSSelectorFromString(@"runEmbeddedWithArgc:argv:appLaunchOpts:");
  if (![_unityFramework respondsToSelector:runSelector]) {
    return NO;
  }

  int argc = 0;
  char **argv = [self processArgumentsWithArgc:&argc];
  ((void (*)(id, SEL, int, char **, NSDictionary *))objc_msgSend)(
      _unityFramework, runSelector, argc, argv, nil);
  _isRunning = YES;

  if (!_isPresentingUnityView) {
    [self concealUnityView];
    [self scheduleConcealUnityView];
  }

  [self reconcilePlayerPauseStateForReason:@"ensure-running-started" force:NO];

  return YES;
}

- (void)prepareHidden
{
  // Preserve the real visible-owner state while preparing. Temporarily
  // clearing it here used to make ensureRunning() reconcile as hidden and
  // freeze an AR screen that was already mounted.
  [self ensureRunning];

  if (!_isPresentingUnityView) {
    [self concealUnityView];
    [self scheduleConcealUnityView];
  }
}

- (void)prepareHiddenAndPauseWhenReady
{
  // AppRoot 전용 warm-then-freeze 경로. 일반 prepareHidden은 정지영상 분석처럼
  // 화면 없이 Unity 루프가 계속 돌아야 하는 호출도 사용하므로 자동 pause를 섞지
  // 않는다. 이미 준비된 런타임이면 즉시 멈추고, 부팅 중이면 ready 이벤트 직후
  // 멈춘다. 그 사이 AR 화면이나 분석이 명시적으로 resume하면 예약은 취소된다.
  if (_isPresentingUnityView || _hasExplicitHiddenRunLease ||
      _hiddenRunLeaseIds.count > 0) {
    [self ensureRunning];
    NSLog(@"[aura:unity-native] prewarm auto-pause skipped; runtime has an active consumer");
    return;
  }

  _pauseWhenReadyIfHidden = YES;
  [self prepareHidden];
  [self reconcilePlayerPauseStateForReason:@"prewarm" force:NO];
}

- (void)handleUnityMessage:(NSString *)message
{
  NSString *safeMessage = message ?: @"";
  BOOL didCompleteWarmup =
      [safeMessage containsString:@"\"type\":\"unity_initialized\""] ||
      [safeMessage containsString:@"unity_initialized"];
  BOOL didBecomeReady = didCompleteWarmup ||
      [safeMessage containsString:@"\"type\":\"ready\""];

  NSString *runtimeMode = nil;
  NSInteger runtimeGeneration = -1;
  NSData *messageData = [safeMessage dataUsingEncoding:NSUTF8StringEncoding];
  if (messageData.length > 0) {
    NSDictionary *event = [NSJSONSerialization JSONObjectWithData:messageData
                                                            options:0
                                                              error:nil];
    if ([event isKindOfClass:[NSDictionary class]] &&
        [event[@"type"] isEqual:@"unity_runtime_mode_ack"] &&
        [event[@"mode"] isKindOfClass:[NSString class]] &&
        [event[@"generation"] respondsToSelector:@selector(integerValue)]) {
      runtimeMode = event[@"mode"];
      runtimeGeneration = [event[@"generation"] integerValue];
    }
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    if (didBecomeReady) {
      self->_isReady = YES;
    }

    if (didCompleteWarmup) {
      self->_hasCompletedWarmup = YES;
      self->_pauseWhenReadyIfHidden = NO;
      [self reconcilePlayerPauseStateForReason:@"unity-warmup-complete" force:NO];
    }

    if (runtimeMode != nil && runtimeGeneration >= 0) {
      [self handleRuntimeModeAck:runtimeMode generation:runtimeGeneration];
    }

    if (!self->_isPresentingUnityView) {
      [self concealUnityView];
      [self scheduleConcealUnityView];
    } else if (didBecomeReady) {
      // The user entered before the scene was live (reveal was gated on
      // _isReady in unityView). Now that Unity is initialized, reveal the
      // view so the container flips straight from black to the live camera
      // instead of showing the splash / a black pre-camera frame.
      UIView *rootView = [self currentUnityRootView];
      if (rootView) {
        rootView.hidden = NO;
        rootView.userInteractionEnabled = YES;
      }
    }

    [[NSNotificationCenter defaultCenter] postNotificationName:UnityMakeupEventNotification
                                                        object:self
                                                      userInfo:@{@"message": safeMessage}];
  });
}

- (UIView *)unityView
{
  _isPresentingUnityView = YES;
  _hasExplicitHiddenRunLease = NO;
  _pauseWhenReadyIfHidden = NO;
  if (![self ensureRunning]) {
    _isPresentingUnityView = NO;
    return nil;
  }

  // Keep the loaded scene/models in memory, but resume the render loop,
  // ARSession, camera and MediaPipe only while an on-screen container owns it.
  [self reconcilePlayerPauseStateForReason:@"visible-container-claimed" force:NO];

  UIView *rootView = [self currentUnityRootView];
  if (!rootView) {
    _isPresentingUnityView = NO;
    _pauseWhenReadyIfHidden = YES;
    [self reconcilePlayerPauseStateForReason:@"visible-container-root-missing" force:NO];
    return nil;
  }

  rootView.userInteractionEnabled = YES;
  // A container asking for unityView means a screen wants it ON SCREEN NOW, so
  // always reveal. The loading-splash flash is already handled by the app-start
  // offscreen preload (the splash plays while concealed) plus the black
  // container background, so an _isReady gate here is unnecessary — and it in
  // fact left the view permanently hidden whenever unity_initialized was not
  // observed, which is exactly why the AR filter showed no makeup.
  rootView.hidden = NO;
  [self restoreReactWindowIfNeeded];

  return rootView;
}

- (UIView *)unityViewForContainer:(UIView *)container
{
  _unityViewOwner = container;
  UIView *rootView = [self unityView];
  if (!rootView && _unityViewOwner == container) {
    _unityViewOwner = nil;
  }
  return rootView;
}

- (void)scheduleFallbackRevealUnityView
{
  dispatch_after(
      dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.2 * NSEC_PER_SEC)),
      dispatch_get_main_queue(), ^{
        if (!self->_isPresentingUnityView) {
          return;
        }

        UIView *rootView = [self currentUnityRootView];
        if (rootView) {
          rootView.hidden = NO;
          rootView.userInteractionEnabled = YES;
        }
      });
}

- (void)detachUnityView
{
  _unityViewOwner = nil;
  _isPresentingUnityView = NO;
  _hasExplicitHiddenRunLease = NO;
  [self concealUnityView];
  [self scheduleConcealUnityView];

  if (!_hasCompletedWarmup) {
    // If the user leaves before Unity finishes booting, allow initialization
    // to complete offscreen and freeze it as soon as ready arrives.
    _pauseWhenReadyIfHidden = YES;
  }
  [self reconcilePlayerPauseStateForReason:@"visible-container-detached" force:NO];
}

- (void)detachUnityViewForContainer:(UIView *)container
{
  // Navigation can briefly mount the next Unity screen before unmounting the
  // previous one. Only the container that most recently claimed the shared
  // Unity view may conceal/pause it.
  if (_unityViewOwner != container) {
    NSLog(@"[aura:unity-native] ignored stale unity container detach");
    return;
  }

  [self detachUnityView];
}

- (void)detachUnityViewFromGlobalHide
{
  // JS cleanup can run after the next Unity screen has already claimed the
  // singleton view. A caller without an owner token must never tear down that
  // newer visible owner; its native container will detach itself when it
  // actually leaves the window.
  UIView *owner = _unityViewOwner;
  if (owner != nil && owner.window != nil) {
    NSLog(@"[aura:unity-native] ignored global hide while a visible container owns unity");
    return;
  }

  [self detachUnityView];
}

- (void)setPlayerPaused:(BOOL)paused
{
  // 표준 UnityFramework pause: — 플레이어(렌더 루프 + AR 세션)를 통째로 멈춰 CPU/
  // 카메라/작업 메모리를 놓는다. ARSession.enabled 토글(setPaused 메시지)과 달리 Unity
  // 내부 상태를 깨지 않아 resume 후 정상 복귀한다. 보고서 카메라처럼 전면 카메라+무거운
  // 파이프라인이 필요할 때 잠시 pause했다가, 나갈 때 resume(false).
  _hasExplicitHiddenRunLease = !paused;
  if (!paused) {
    // An explicit resume is a lease for AR or still-image analysis. Do not let
    // an earlier AppRoot prewarm callback pause it when the ready event arrives.
    _pauseWhenReadyIfHidden = NO;
  } else if (!_hasCompletedWarmup) {
    _pauseWhenReadyIfHidden = YES;
  }

  [self reconcilePlayerPauseStateForReason:
      paused ? @"legacy-run-lease-released" : @"legacy-run-lease-acquired"
                                      force:NO];
}

- (void)acquireHiddenRunLease:(NSString *)leaseId
{
  if (leaseId.length == 0) {
    return;
  }

  [_hiddenRunLeaseIds addObject:leaseId];
  _pauseWhenReadyIfHidden = NO;
  [self reconcilePlayerPauseStateForReason:@"hidden-analysis-lease-acquired" force:NO];
}

- (void)releaseHiddenRunLease:(NSString *)leaseId
{
  if (leaseId.length == 0) {
    return;
  }

  [_hiddenRunLeaseIds removeObject:leaseId];
  if (!_hasCompletedWarmup && _hiddenRunLeaseIds.count == 0 && !_isPresentingUnityView &&
      !_hasExplicitHiddenRunLease) {
    _pauseWhenReadyIfHidden = YES;
  }
  [self reconcilePlayerPauseStateForReason:@"hidden-analysis-lease-released" force:NO];
}

- (void)reconcilePlayerPauseStateForReason:(NSString *)reason force:(BOOL)force
{
  BOOL hasVisibleOwner = _isPresentingUnityView && _unityViewOwner != nil;
  BOOL hasRunConsumer =
      hasVisibleOwner || _hasExplicitHiddenRunLease || _hiddenRunLeaseIds.count > 0;
  _desiredPlayerPaused = !_applicationIsActive || !hasRunConsumer;

  // Initial offscreen prewarm needs the player loop until Unity emits ready.
  // Once ready, the exact same desired state freezes it without unloading the
  // scene/models. Backgrounding still pauses immediately, even during boot.
  // Never send idle / pause while the first Unity scene and ARFoundation
  // availability check are still booting. Some callers can reach
  // ensureRunning before AppRoot sets the explicit prewarm flag; allowing that
  // early idle request disables ARSession inside its Initialize coroutine and
  // leaves the next visible AR entry at 0 fps. Finish the one-time warmup for
  // every consumer-free startup, then reconcile to idle as soon as
  // unity_initialized arrives.
  BOOL prewarming = _applicationIsActive && !_hasCompletedWarmup && !hasRunConsumer;
  BOOL effectivePaused = _desiredPlayerPaused;
  if (prewarming) {
    effectivePaused = NO;
  }

  if (!_isRunning || _unityFramework == nil) {
    return;
  }

  if (prewarming) {
    if (!_hasAppliedPlayerPausedState || _lastAppliedPlayerPausedState) {
      [self applyPlayerPaused:NO];
    }
    return;
  }

  BOOL wantsLiveRuntime =
      _applicationIsActive && (hasVisibleOwner || _hasExplicitHiddenRunLease);
  NSString *runtimeMode = wantsLiveRuntime
      ? @"live"
      : (_applicationIsActive && _hiddenRunLeaseIds.count > 0 ? @"still" : @"idle");

  // Stable state fast path. In particular, foreground lifecycle callbacks may
  // ask for a forced reassert after UnityAppController changes its own pause
  // flag; do not wake the camera pipeline just to pause it again.
  if (!_runtimeModeRequestPending &&
      [_acknowledgedRuntimeMode isEqualToString:runtimeMode]) {
    [self applyPlayerPaused:effectivePaused];
    NSLog(@"[aura:unity-native] reconciled stable pause desired=%@ effective=%@ mode=%@ reason=%@",
          _desiredPlayerPaused ? @"YES" : @"NO",
          effectivePaused ? @"YES" : @"NO",
          runtimeMode,
          reason ?: @"unknown");
    return;
  }

  // A paused Unity loop cannot process UnitySendMessage. Resume first for any
  // transition, then wait for the matching runtime-mode ACK before pausing.
  if (!_hasAppliedPlayerPausedState || _lastAppliedPlayerPausedState) {
    [self applyPlayerPaused:NO];
  }
  [self requestRuntimeMode:runtimeMode reason:reason force:force];

  if (!effectivePaused && !_runtimeModeRequestPending &&
      [_acknowledgedRuntimeMode isEqualToString:runtimeMode]) {
    [self applyPlayerPaused:NO];
  }

  NSLog(@"[aura:unity-native] reconciled pause desired=%@ effective=%@ mode=%@ reason=%@ owner=%@ leases=%lu",
        _desiredPlayerPaused ? @"YES" : @"NO",
        effectivePaused ? @"YES" : @"NO",
        runtimeMode,
        reason ?: @"unknown",
        hasVisibleOwner ? @"YES" : @"NO",
        (unsigned long)_hiddenRunLeaseIds.count);
}

- (void)requestRuntimeMode:(NSString *)mode reason:(NSString *)reason force:(BOOL)force
{
  (void)force;
  if (mode.length == 0 || !_isRunning || _unityFramework == nil) {
    return;
  }

  if (_runtimeModeRequestPending &&
      [_requestedRuntimeMode isEqualToString:mode]) {
    return;
  }

  if (!_runtimeModeRequestPending &&
      [_acknowledgedRuntimeMode isEqualToString:mode]) {
    if ([mode isEqualToString:@"idle"] && _desiredPlayerPaused) {
      [self applyPlayerPaused:YES];
    }
    return;
  }

  _runtimeModeGeneration += 1;
  NSInteger generation = _runtimeModeGeneration;
  _pendingRuntimeModeGeneration = generation;
  _requestedRuntimeMode = [mode copy];
  _runtimeModeRequestPending = YES;

  if (![self sendRuntimeModeRequest:mode generation:generation]) {
    _runtimeModeRequestPending = NO;
  }

  NSLog(@"[aura:unity-native] runtime mode requested mode=%@ generation=%ld reason=%@",
        mode,
        (long)generation,
        reason ?: @"unknown");

  // A missing/old Unity endpoint must never leave an invisible player burning
  // CPU forever. The new framework normally ACKs within one frame; this is a
  // conservative safety fallback only.
  dispatch_after(
      dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.75 * NSEC_PER_SEC)),
      dispatch_get_main_queue(), ^{
        if (!self->_runtimeModeRequestPending ||
            self->_pendingRuntimeModeGeneration != generation) {
          return;
        }
        self->_runtimeModeRequestPending = NO;
        NSLog(@"[aura:unity-native] runtime mode ack timeout mode=%@ generation=%ld",
              mode,
              (long)generation);
        if ([mode isEqualToString:@"idle"] && self->_desiredPlayerPaused) {
          [self applyPlayerPaused:YES];
        }
      });
}

- (BOOL)sendRuntimeModeRequest:(NSString *)mode generation:(NSInteger)generation
{
  if (_unityFramework == nil || ![self isRunning]) {
    return NO;
  }

  SEL sendSelector = NSSelectorFromString(@"sendMessageToGOWithName:functionName:message:");
  if (![_unityFramework respondsToSelector:sendSelector]) {
    return NO;
  }

  NSString *payload = [NSString stringWithFormat:
      @"{\"mode\":\"%@\",\"generation\":%ld}", mode, (long)generation];
  ((void (*)(id, SEL, const char *, const char *, const char *))objc_msgSend)(
      _unityFramework,
      sendSelector,
      "RNBridge",
      "SetRuntimeModeJson",
      payload.UTF8String);
  return YES;
}

- (void)handleRuntimeModeAck:(NSString *)mode generation:(NSInteger)generation
{
  if (!_runtimeModeRequestPending || generation != _pendingRuntimeModeGeneration ||
      ![_requestedRuntimeMode isEqualToString:mode]) {
    NSLog(@"[aura:unity-native] ignored stale runtime mode ack mode=%@ generation=%ld",
          mode,
          (long)generation);
    return;
  }

  _runtimeModeRequestPending = NO;
  _acknowledgedRuntimeMode = [mode copy];
  NSLog(@"[aura:unity-native] runtime mode ack mode=%@ generation=%ld",
        mode,
        (long)generation);

  if ([mode isEqualToString:@"idle"] && _desiredPlayerPaused) {
    [self applyPlayerPaused:YES];
  }
}

- (void)applyPlayerPaused:(BOOL)paused
{
  if (_unityFramework == nil) {
    return;
  }
  SEL pauseSelector = NSSelectorFromString(@"pause:");
  if ([_unityFramework respondsToSelector:pauseSelector]) {
    ((void (*)(id, SEL, BOOL))objc_msgSend)(_unityFramework, pauseSelector, paused);
    _hasAppliedPlayerPausedState = YES;
    _lastAppliedPlayerPausedState = paused;
    NSLog(@"[aura:unity-native] player paused=%@", paused ? @"YES" : @"NO");
  }
}

- (void)sendMessageToGameObject:(NSString *)gameObject
                         method:(NSString *)method
                        payload:(NSString *)payload
{
  [self sendMessageToGameObject:gameObject method:method payload:payload metadata:nil];
}

- (void)sendMessageToGameObject:(NSString *)gameObject
                         method:(NSString *)method
                        payload:(NSString *)payload
                       metadata:(NSString *)metadata
{
  NSUInteger payloadLength = payload != nil ? payload.length : 0;
  NSLog(
      @"[aura:unity-native] UnitySendMessage prepare gameObject=%@ method=%@ messageLength=%lu frameworkLoaded=%@ runtimeReady=%@ running=%@ metadata=%@",
      gameObject,
      method,
      (unsigned long)payloadLength,
      _unityFramework != nil ? @"true" : @"false",
      _isReady ? @"true" : @"false",
      [self isRunning] ? @"true" : @"false",
      metadata ?: @"none");

  if (![self ensureRunning]) {
    NSLog(
        @"[aura:unity-native] UnitySendMessage skipped reason=ensureRunningFailed gameObject=%@ method=%@ messageLength=%lu metadata=%@",
        gameObject,
        method,
        (unsigned long)payloadLength,
        metadata ?: @"none");
    return;
  }

  SEL sendSelector = NSSelectorFromString(@"sendMessageToGOWithName:functionName:message:");
  if (![_unityFramework respondsToSelector:sendSelector]) {
    NSLog(
        @"[aura:unity-native] UnitySendMessage skipped reason=selectorMissing gameObject=%@ method=%@ messageLength=%lu metadata=%@",
        gameObject,
        method,
        (unsigned long)payloadLength,
        metadata ?: @"none");
    return;
  }

  NSLog(
      @"[aura:unity-native] UnitySendMessage invoke gameObject=%@ method=%@ messageLength=%lu frameworkLoaded=%@ runtimeReady=%@ metadata=%@",
      gameObject,
      method,
      (unsigned long)payloadLength,
      _unityFramework != nil ? @"true" : @"false",
      _isReady ? @"true" : @"false",
      metadata ?: @"none");
  ((void (*)(id, SEL, const char *, const char *, const char *))objc_msgSend)(
      _unityFramework,
      sendSelector,
      gameObject.UTF8String,
      method.UTF8String,
      payload.UTF8String);
  NSLog(
      @"[aura:unity-native] UnitySendMessage invoked gameObject=%@ method=%@ messageLength=%lu metadata=%@",
      gameObject,
      method,
      (unsigned long)payloadLength,
      metadata ?: @"none");
}

- (NSString *)unityFrameworkPath
{
  NSString *privateFrameworksPath = NSBundle.mainBundle.privateFrameworksPath;
  return [privateFrameworksPath stringByAppendingPathComponent:@"UnityFramework.framework"];
}

- (BOOL)loadUnityFrameworkIfNeeded
{
  if (_unityFramework != nil) {
    return YES;
  }

  _unityBundle = [NSBundle bundleWithPath:[self unityFrameworkPath]];
  if (!_unityBundle) {
    return NO;
  }

  NSError *loadError = nil;
  if (![_unityBundle loadAndReturnError:&loadError]) {
    NSLog(@"[aura:unity] Failed to load UnityFramework: %@", loadError);
    return NO;
  }

  Class unityFrameworkClass = NSClassFromString(@"UnityFramework");
  SEL getInstanceSelector = NSSelectorFromString(@"getInstance");
  if (!unityFrameworkClass || ![unityFrameworkClass respondsToSelector:getInstanceSelector]) {
    NSLog(@"[aura:unity] UnityFramework class is not available after bundle load.");
    return NO;
  }

  _unityFramework = ((id (*)(id, SEL))objc_msgSend)(
      unityFrameworkClass, getInstanceSelector);
  if (!_unityFramework) {
    return NO;
  }

  [self configureUnityFramework];
  return YES;
}

- (void)configureUnityFramework
{
  SEL setExecuteHeaderSelector = NSSelectorFromString(@"setExecuteHeader:");
  if ([_unityFramework respondsToSelector:setExecuteHeaderSelector]) {
    const struct mach_header *executeHeader = _dyld_get_image_header(0);
    ((void (*)(id, SEL, const struct mach_header *))objc_msgSend)(
        _unityFramework, setExecuteHeaderSelector, executeHeader);
  }

  SEL setDataBundleSelector = NSSelectorFromString(@"setDataBundleId:");
  if ([_unityFramework respondsToSelector:setDataBundleSelector]) {
    ((void (*)(id, SEL, const char *))objc_msgSend)(
        _unityFramework, setDataBundleSelector, "com.unity3d.framework");
  }

  Class nativeCallsClass = NSClassFromString(@"FrameworkLibAPI");
  SEL registerNativeCallsSelector = NSSelectorFromString(@"registerAPIforNativeCalls:");
  if (nativeCallsClass && [nativeCallsClass respondsToSelector:registerNativeCallsSelector]) {
    if (!_nativeCalls) {
      _nativeCalls = [UnityMakeupNativeCalls new];
    }

    ((void (*)(id, SEL, id))objc_msgSend)(
        nativeCallsClass, registerNativeCallsSelector, _nativeCalls);
  }
}

- (id)unityAppController
{
  if (!_unityFramework) {
    return nil;
  }

  SEL appControllerSelector = NSSelectorFromString(@"appController");
  if (![_unityFramework respondsToSelector:appControllerSelector]) {
    return nil;
  }

  return ((id (*)(id, SEL))objc_msgSend)(_unityFramework, appControllerSelector);
}

- (UIView *)currentUnityRootView
{
  id appController = [self unityAppController];
  if (!appController) {
    return nil;
  }

  SEL rootViewSelector = NSSelectorFromString(@"rootView");
  if (![appController respondsToSelector:rootViewSelector]) {
    return nil;
  }

  return ((UIView *(*)(id, SEL))objc_msgSend)(appController, rootViewSelector);
}

- (UIWindow *)unityWindow
{
  id appController = [self unityAppController];
  if (!appController) {
    return nil;
  }

  SEL windowSelector = NSSelectorFromString(@"window");
  if (![appController respondsToSelector:windowSelector]) {
    return nil;
  }

  return ((UIWindow *(*)(id, SEL))objc_msgSend)(appController, windowSelector);
}

- (UIWindow *)currentAppWindow
{
  for (UIWindow *window in UIApplication.sharedApplication.windows) {
    if (window.isKeyWindow) {
      return window;
    }
  }

  return UIApplication.sharedApplication.windows.firstObject;
}

- (void)rememberReactWindowIfNeeded
{
  UIWindow *currentWindow = [self currentAppWindow];
  UIWindow *unityWindow = [self unityWindow];

  if (currentWindow && currentWindow != unityWindow) {
    _reactWindow = currentWindow;
    _reactRootViewController = currentWindow.rootViewController;
  }
}

- (void)restoreReactWindowIfNeeded
{
  UIWindow *reactWindow = _reactWindow;
  if (!reactWindow) {
    [self rememberReactWindowIfNeeded];
    reactWindow = _reactWindow;
  }

  UIViewController *reactRootViewController = _reactRootViewController;
  if (reactWindow && reactRootViewController &&
      reactWindow.rootViewController != reactRootViewController) {
    reactWindow.rootViewController = reactRootViewController;
  }

  if (reactWindow) {
    reactWindow.hidden = NO;
    [reactWindow makeKeyAndVisible];
  }

  UIWindow *unityWindow = [self unityWindow];
  if (unityWindow && unityWindow != reactWindow && !_isPresentingUnityView) {
    unityWindow.hidden = YES;
  }
}

- (void)concealUnityView
{
  if (_isPresentingUnityView) {
    return;
  }

  UIView *rootView = [self currentUnityRootView];
  if (rootView) {
    rootView.hidden = YES;
    rootView.userInteractionEnabled = NO;
    [rootView removeFromSuperview];
  }

  [self restoreReactWindowIfNeeded];
}

- (void)installApplicationLifecycleObserversIfNeeded
{
  if (_didInstallApplicationLifecycleObservers) {
    return;
  }
  _didInstallApplicationLifecycleObservers = YES;

  NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
  [center addObserver:self
             selector:@selector(handleApplicationWillResignActive:)
                 name:UIApplicationWillResignActiveNotification
               object:nil];
  [center addObserver:self
             selector:@selector(handleApplicationDidEnterBackground:)
                 name:UIApplicationDidEnterBackgroundNotification
               object:nil];
  [center addObserver:self
             selector:@selector(handleApplicationDidBecomeActive:)
                 name:UIApplicationDidBecomeActiveNotification
               object:nil];
}

- (void)handleApplicationWillResignActive:(NSNotification *)notification
{
  (void)notification;
  _applicationIsActive = NO;
  [self reconcilePlayerPauseStateForReason:@"app-will-resign-active" force:YES];
}

- (void)handleApplicationDidEnterBackground:(NSNotification *)notification
{
  (void)notification;
  _applicationIsActive = NO;
  [self reconcilePlayerPauseStateForReason:@"app-entered-background" force:YES];
}

- (void)handleApplicationDidBecomeActive:(NSNotification *)notification
{
  (void)notification;
  _applicationIsActive = YES;

  // UnityAppController also handles this notification and may call
  // UnityPause(0) using its own pre-background snapshot. Re-assert our
  // authoritative state on later main-loop turns so a hidden warm runtime
  // cannot silently resume behind Home/Login.
  dispatch_async(dispatch_get_main_queue(), ^{
    [self reconcilePlayerPauseStateForReason:@"app-became-active" force:YES];
  });
  dispatch_after(
      dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.15 * NSEC_PER_SEC)),
      dispatch_get_main_queue(), ^{
        [self reconcilePlayerPauseStateForReason:@"app-became-active-settled" force:YES];
      });
}

// 예약 conceal(아래 0~2초)은 부트가 느리면 레이스에서 진다 — MediaPipe 모델 로드
// 등으로 Unity가 2초+ 뒤에 자기 윈도우를 띄우면 이미 모든 conceal이 지나가 버려
// 홈 화면 위로 Unity 카메라가 드러난다(사용자에겐 "갑자기 AR 필터에 들어간" 증상).
// 이 가드는 Unity 윈도우가 '보이거나 key가 되는 그 순간' 노티피케이션으로 즉시
// 숨겨서, 부트가 얼마나 오래 걸리든 화면에 나타나지 않게 한다. scene 자체는
// offscreen에서 계속 돌아 AR 진입 시 로딩 없이 라이브 장면이 바로 뜬다.
- (void)installWindowGuardIfNeeded
{
  if (_didInstallWindowGuard) {
    return;
  }
  _didInstallWindowGuard = YES;

  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(handleWindowGuardNotification:)
                                               name:UIWindowDidBecomeVisibleNotification
                                             object:nil];
  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(handleWindowGuardNotification:)
                                               name:UIWindowDidBecomeKeyNotification
                                             object:nil];
}

- (void)handleWindowGuardNotification:(NSNotification *)notification
{
  if (_isPresentingUnityView) {
    return;
  }

  UIWindow *window = notification.object;
  UIWindow *unityWindow = [self unityWindow];
  if (!window || !unityWindow || window != unityWindow || window == _reactWindow) {
    return;
  }

  // 노티피케이션 콜백 안에서 윈도우 계층을 바로 바꾸지 않고 다음 runloop 틱에서
  // 숨긴다 (UIKit 재진입 안전).
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self->_isPresentingUnityView) {
      return;
    }
    NSLog(@"[aura:unity-native] window guard concealed unity window during offscreen boot");
    [self concealUnityView];
  });
}

- (void)scheduleConcealUnityView
{
  NSArray<NSNumber *> *delays = @[@0.0, @0.05, @0.2, @0.5, @1.0, @2.0];

  for (NSNumber *delay in delays) {
    dispatch_after(
        dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delay.doubleValue * NSEC_PER_SEC)),
        dispatch_get_main_queue(), ^{
          if (!self->_isPresentingUnityView) {
            [self concealUnityView];
          }
        });
  }
}

- (char **)processArgumentsWithArgc:(int *)argc
{
  if (_unityArgv != NULL) {
    *argc = _unityArgc;
    return _unityArgv;
  }

  NSArray<NSString *> *arguments = NSProcessInfo.processInfo.arguments;
  _unityArgc = (int)arguments.count;
  _unityArgv = calloc((size_t)_unityArgc + 1, sizeof(char *));

  for (NSUInteger index = 0; index < arguments.count; index += 1) {
    _unityArgv[index] = strdup(arguments[index].UTF8String);
  }

  *argc = _unityArgc;
  return _unityArgv;
}

@end

@implementation UnityMakeupNativeCalls

- (void)sendMessageToMobileApp:(NSString *)message
{
  [[UnityMakeupRuntime sharedRuntime] handleUnityMessage:message];
}

@end

@interface UnityMakeupBridge : RCTEventEmitter <RCTBridgeModule>
@end

@implementation UnityMakeupBridge

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(isFrameworkAvailable)
{
  return @([[UnityMakeupRuntime sharedRuntime] isFrameworkAvailable]);
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(isReady)
{
  return @([[UnityMakeupRuntime sharedRuntime] isReady]);
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(isRuntimeAvailable)
{
  return @([[UnityMakeupRuntime sharedRuntime] isRunning]);
}

RCT_EXPORT_METHOD(prepareFramework)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UnityMakeupRuntime sharedRuntime] prepareFramework];
  });
}

RCT_EXPORT_METHOD(prepareRuntime)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UnityMakeupRuntime sharedRuntime] prepareHidden];
  });
}

RCT_EXPORT_METHOD(prepareRuntimeAndPauseWhenReady)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UnityMakeupRuntime sharedRuntime] prepareHiddenAndPauseWhenReady];
  });
}

RCT_EXPORT_METHOD(hideView)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UnityMakeupRuntime sharedRuntime] detachUnityViewFromGlobalHide];
  });
}

RCT_EXPORT_METHOD(setPlayerPaused:(BOOL)paused)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UnityMakeupRuntime sharedRuntime] setPlayerPaused:paused];
  });
}

RCT_EXPORT_METHOD(acquireHiddenRunLease:(NSString *)leaseId)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UnityMakeupRuntime sharedRuntime] acquireHiddenRunLease:leaseId];
  });
}

RCT_EXPORT_METHOD(releaseHiddenRunLease:(NSString *)leaseId)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UnityMakeupRuntime sharedRuntime] releaseHiddenRunLease:leaseId];
  });
}

RCT_EXPORT_METHOD(postMessage:(NSString *)gameObject
                  method:(NSString *)method
                  payload:(NSString *)payload)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UnityMakeupRuntime sharedRuntime] sendMessageToGameObject:gameObject
                                                         method:method
                                                        payload:payload];
  });
}

RCT_EXPORT_METHOD(postMessageWithMetadata:(NSString *)gameObject
                  method:(NSString *)method
                  payload:(NSString *)payload
                  metadata:(NSString *)metadata)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UnityMakeupRuntime sharedRuntime] sendMessageToGameObject:gameObject
                                                         method:method
                                                        payload:payload
                                                       metadata:metadata];
  });
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[UnityMakeupEventName];
}

- (void)startObserving
{
  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(handleUnityEvent:)
                                               name:UnityMakeupEventNotification
                                             object:nil];
}

- (void)stopObserving
{
  [[NSNotificationCenter defaultCenter] removeObserver:self
                                                  name:UnityMakeupEventNotification
                                                object:nil];
}

- (void)handleUnityEvent:(NSNotification *)notification
{
  NSString *message = notification.userInfo[@"message"] ?: @"";
  [self sendEventWithName:UnityMakeupEventName body:@{@"message": message}];
}

@end

@interface UnityMakeupContainerView : UIView
@end

@implementation UnityMakeupContainerView {
  UIView *_unityView;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  self = [super initWithFrame:frame];
  if (self) {
    self.backgroundColor = UIColor.blackColor;
    self.clipsToBounds = YES;
  }
  return self;
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window != nil) {
    [self mountUnityViewIfNeeded];
  } else {
    [self unmountUnityView];
  }
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  // Layout must never claim ownership or resume Unity. It can run after a
  // screen is hidden, after an explicit pause, and repeatedly during navigation
  // animations. Ownership is acquired only by didMoveToWindow.
  _unityView.frame = self.bounds;
}

- (void)mountUnityViewIfNeeded
{
  UIView *unityView = [[UnityMakeupRuntime sharedRuntime] unityViewForContainer:self];
  if (!unityView) {
    return;
  }

  _unityView = unityView;
  if (_unityView.superview != self) {
    [_unityView removeFromSuperview];
    _unityView.frame = self.bounds;
    _unityView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [self addSubview:_unityView];
    NSLog(@"[aura:unity-native] container re-mounted unity view hidden=%@",
          _unityView.hidden ? @"YES" : @"NO");
  }
}

- (void)unmountUnityView
{
  if (_unityView.superview == self) {
    [_unityView removeFromSuperview];
  }

  _unityView = nil;
  [[UnityMakeupRuntime sharedRuntime] detachUnityViewForContainer:self];
}

- (void)removeFromSuperview
{
  [self unmountUnityView];
  [super removeFromSuperview];
}

@end

@interface UnityMakeupViewManager : RCTViewManager
@end

@implementation UnityMakeupViewManager

RCT_EXPORT_MODULE(AURAUnityMakeupView);

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (UIView *)view
{
  return [UnityMakeupContainerView new];
}

@end
