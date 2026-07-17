#import <QuartzCore/QuartzCore.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UIKit/UIKit.h>
#import <mach/mach.h>

static NSString *const AURAPerformanceMetricEvent = @"AURAPerformanceMetric";

@interface AURAPerformanceMonitor : RCTEventEmitter <RCTBridgeModule>
@end

@implementation AURAPerformanceMonitor {
  CADisplayLink *_displayLink;
  CFTimeInterval _intervalStartedAt;
  NSTimeInterval _intervalSeconds;
  NSUInteger _frameCount;
  BOOL _hasListeners;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[AURAPerformanceMetricEvent];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

RCT_EXPORT_METHOD(start:(nonnull NSNumber *)intervalMs)
{
  [self stopDisplayLink];

  _intervalSeconds = MAX(0.25, intervalMs.doubleValue / 1000.0);
  _intervalStartedAt = CACurrentMediaTime();
  _frameCount = 0;
  _displayLink = [CADisplayLink displayLinkWithTarget:self selector:@selector(handleDisplayLink:)];

  if (@available(iOS 15.0, *)) {
    NSInteger maximumFramesPerSecond = UIScreen.mainScreen.maximumFramesPerSecond;
    _displayLink.preferredFrameRateRange =
      CAFrameRateRangeMake(30, maximumFramesPerSecond, maximumFramesPerSecond);
  }

  [_displayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
}

RCT_EXPORT_METHOD(stop)
{
  [self stopDisplayLink];
}

- (void)stopDisplayLink
{
  [_displayLink invalidate];
  _displayLink = nil;
  _frameCount = 0;
}

- (void)handleDisplayLink:(CADisplayLink *)displayLink
{
  _frameCount += 1;

  CFTimeInterval now = CACurrentMediaTime();
  CFTimeInterval elapsed = now - _intervalStartedAt;
  if (elapsed < _intervalSeconds) {
    return;
  }

  double maximumFramesPerSecond = UIScreen.mainScreen.maximumFramesPerSecond;
  double framesPerSecond = elapsed > 0 ? _frameCount / elapsed : 0;
  double expectedFrames = elapsed * maximumFramesPerSecond;
  double droppedFrames = MAX(0, expectedFrames - _frameCount);

  if (_hasListeners) {
    [self sendEventWithName:AURAPerformanceMetricEvent
                       body:@{
                         @"timestampMs": @([[NSDate date] timeIntervalSince1970] * 1000.0),
                         @"cpuPercent": @([self processCPUPercent]),
                         @"residentMemoryMb": @([self residentMemoryBytes] / 1024.0 / 1024.0),
                         @"physicalFootprintMb": @([self physicalFootprintBytes] / 1024.0 / 1024.0),
                         @"fps": @(framesPerSecond),
                         @"displayMaxFps": @(maximumFramesPerSecond),
                         @"droppedFrames": @(droppedFrames),
                         @"thermalState": [self thermalStateName],
                         @"lowPowerMode": @(NSProcessInfo.processInfo.lowPowerModeEnabled),
                       }];
  }

  _frameCount = 0;
  _intervalStartedAt = now;
}

- (double)processCPUPercent
{
  thread_act_array_t threadList;
  mach_msg_type_number_t threadCount = 0;
  kern_return_t result = task_threads(mach_task_self(), &threadList, &threadCount);
  if (result != KERN_SUCCESS) {
    return 0;
  }

  double totalCPU = 0;
  for (mach_msg_type_number_t index = 0; index < threadCount; index += 1) {
    thread_basic_info_data_t threadInfo;
    mach_msg_type_number_t threadInfoCount = THREAD_BASIC_INFO_COUNT;
    kern_return_t infoResult = thread_info(
      threadList[index],
      THREAD_BASIC_INFO,
      (thread_info_t)&threadInfo,
      &threadInfoCount
    );
    if (infoResult == KERN_SUCCESS && !(threadInfo.flags & TH_FLAGS_IDLE)) {
      totalCPU += ((double)threadInfo.cpu_usage / (double)TH_USAGE_SCALE) * 100.0;
    }
  }

  vm_deallocate(
    mach_task_self(),
    (vm_address_t)threadList,
    sizeof(thread_t) * threadCount
  );
  return totalCPU;
}

- (uint64_t)residentMemoryBytes
{
  mach_task_basic_info_data_t info;
  mach_msg_type_number_t count = MACH_TASK_BASIC_INFO_COUNT;
  kern_return_t result = task_info(
    mach_task_self(),
    MACH_TASK_BASIC_INFO,
    (task_info_t)&info,
    &count
  );
  return result == KERN_SUCCESS ? info.resident_size : 0;
}

- (uint64_t)physicalFootprintBytes
{
  task_vm_info_data_t info;
  mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
  kern_return_t result = task_info(
    mach_task_self(),
    TASK_VM_INFO,
    (task_info_t)&info,
    &count
  );
  return result == KERN_SUCCESS ? info.phys_footprint : 0;
}

- (NSString *)thermalStateName
{
  if (@available(iOS 11.0, *)) {
    switch (NSProcessInfo.processInfo.thermalState) {
      case NSProcessInfoThermalStateNominal:
        return @"nominal";
      case NSProcessInfoThermalStateFair:
        return @"fair";
      case NSProcessInfoThermalStateSerious:
        return @"serious";
      case NSProcessInfoThermalStateCritical:
        return @"critical";
    }
  }
  return @"unknown";
}

- (void)dealloc
{
  [self stopDisplayLink];
}

@end
