#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(E7NativeLipBoundaryProviders, NSObject)

RCT_EXTERN_METHOD(extractLipBoundary:(NSString *)requestJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(saveGeneratedPackage:(NSString *)packageJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(renderLipMaskPreview:(NSString *)packageJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
