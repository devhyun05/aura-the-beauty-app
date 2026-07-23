import React from 'react';
import {ImageBackground, Text, View, type ImageSourcePropType} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import type {FaceReportStorySection} from '../services/reportStoryModel';

declare const require: (moduleName: string) => ImageSourcePropType;

const COVER_IMAGES: Record<FaceReportStorySection['id'], ImageSourcePropType> = {
  summary: require('../assets/covers/summary.jpg'),
  proportion: require('../assets/covers/proportion.jpg'),
  features: require('../assets/covers/features.jpg'),
  'personal-color': require('../assets/covers/personal-color.jpg'),
  body: require('../assets/covers/body-type.jpg'),
  impression: require('../assets/covers/impression.jpg'),
  styling: require('../assets/covers/styling.jpg'),
  skin: require('../assets/covers/skin.jpg'),
};

export function ReportSectionCover({section}: {section: FaceReportStorySection}) {
  return (
    <ImageBackground
      accessibilityIgnoresInvertColors
      accessibilityLabel={`${section.koreanTitle} 섹션 표지`}
      imageStyle={{opacity: 0.94}}
      resizeMode="cover"
      source={COVER_IMAGES[section.id]}
      style={{flex: 1}}>
      <LinearGradient
        colors={['rgba(9,20,25,0.68)', 'rgba(9,20,25,0.12)', 'rgba(9,20,25,0.72)']}
        locations={[0, 0.46, 1]}
        style={{position: 'absolute', inset: 0}}
      />
      <View style={{flex: 1, paddingHorizontal: 27, paddingTop: 31, paddingBottom: 28, justifyContent: 'space-between'}}>
        <View style={{alignItems: 'flex-start'}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 18}}>
            <Text style={{fontFamily: 'Pretendard', fontSize: 11, fontWeight: '800', color: '#FFFFFF', letterSpacing: 2.1}}>
              {section.number}
            </Text>
            <View style={{height: 1, width: 42, backgroundColor: 'rgba(255,255,255,0.75)'}} />
            <Text style={{fontFamily: 'Pretendard', fontSize: 9.5, fontWeight: '700', color: 'rgba(255,255,255,0.84)', letterSpacing: 1.45}}>
              FACE ANALYSIS
            </Text>
          </View>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            numberOfLines={2}
            style={{fontFamily: 'Lora', fontSize: 43, lineHeight: 48, color: '#FFFFFF', letterSpacing: -1.2}}>
            {section.englishTitle}
          </Text>
          <Text style={{fontFamily: 'Pretendard', fontSize: 19, fontWeight: '700', color: '#FFFFFF', marginTop: 8, letterSpacing: -0.2}}>
            {section.koreanTitle}
          </Text>
          <View style={{height: 3, width: 30, borderRadius: 2, backgroundColor: section.accent, marginTop: 18}} />
        </View>
        <View style={{alignSelf: 'flex-start', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.58)', paddingTop: 10, minWidth: 156}}>
          <Text style={{fontFamily: 'Lora', fontSize: 10.5, color: 'rgba(255,255,255,0.9)', letterSpacing: 1.4}}>
            YOUR BEAUTY, DECODED
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
}
