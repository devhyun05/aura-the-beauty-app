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
- (void)handleUnityMessage:(NSString *)message;
- (UIView *)unityView;
- (void)detachUnityView;
- (void)setPlayerPaused:(BOOL)paused;
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
  BOOL _isRunning;
  BOOL _isPresentingUnityView;
  BOOL _didInstallWindowGuard;
  int _unityArgc;
  char **_unityArgv;
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

  return YES;
}

- (void)prepareHidden
{
  BOOL previousPresentationState = _isPresentingUnityView;
  _isPresentingUnityView = NO;
  [self ensureRunning];
  _isPresentingUnityView = previousPresentationState;

  if (!_isPresentingUnityView) {
    [self concealUnityView];
    [self scheduleConcealUnityView];
  }
}

- (void)handleUnityMessage:(NSString *)message
{
  NSString *safeMessage = message ?: @"";
  BOOL didInitialize = [safeMessage containsString:@"\"type\":\"unity_initialized\""] ||
      [safeMessage containsString:@"unity_initialized"];

  dispatch_async(dispatch_get_main_queue(), ^{
    if (didInitialize) {
      self->_isReady = YES;
    }

    if (!self->_isPresentingUnityView) {
      [self concealUnityView];
      [self scheduleConcealUnityView];
    } else if (didInitialize) {
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
  if (![self ensureRunning]) {
    _isPresentingUnityView = NO;
    return nil;
  }

  UIView *rootView = [self currentUnityRootView];
  if (!rootView) {
    _isPresentingUnityView = NO;
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
  _isPresentingUnityView = NO;
  [self concealUnityView];
  [self scheduleConcealUnityView];
}

- (void)setPlayerPaused:(BOOL)paused
{
  // 표준 UnityFramework pause: — 플레이어(렌더 루프 + AR 세션)를 통째로 멈춰 CPU/
  // 카메라/작업 메모리를 놓는다. ARSession.enabled 토글(setPaused 메시지)과 달리 Unity
  // 내부 상태를 깨지 않아 resume 후 정상 복귀한다. 보고서 카메라처럼 전면 카메라+무거운
  // 파이프라인이 필요할 때 잠시 pause했다가, 나갈 때 resume(false).
  if (_unityFramework == nil) {
    return;
  }
  SEL pauseSelector = NSSelectorFromString(@"pause:");
  if ([_unityFramework respondsToSelector:pauseSelector]) {
    ((void (*)(id, SEL, BOOL))objc_msgSend)(_unityFramework, pauseSelector, paused);
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

RCT_EXPORT_METHOD(hideView)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UnityMakeupRuntime sharedRuntime] detachUnityView];
  });
}

RCT_EXPORT_METHOD(setPlayerPaused:(BOOL)paused)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UnityMakeupRuntime sharedRuntime] setPlayerPaused:paused];
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
  // Re-assert ownership every layout: the shared-singleton Unity view can be
  // concealed / removed from this container by another screen's
  // hideUnityMakeupView() (ARFilterScreen calls it on focus/nav churn), and
  // didMoveToWindow does not fire again to re-mount it — so the container goes
  // black and the makeup renders into a detached view. Re-mounting here (a
  // no-op when already attached) keeps the live Unity view in whichever
  // container is currently on screen.
  if (self.window != nil) {
    [self mountUnityViewIfNeeded];
  }
  _unityView.frame = self.bounds;
}

- (void)mountUnityViewIfNeeded
{
  UIView *unityView = [[UnityMakeupRuntime sharedRuntime] unityView];
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
  [[UnityMakeupRuntime sharedRuntime] detachUnityView];
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
