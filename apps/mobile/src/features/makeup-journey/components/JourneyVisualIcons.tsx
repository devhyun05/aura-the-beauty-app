import Svg, {Circle, Path} from 'react-native-svg';

type JourneyVisualIconProps = {
  color: string;
  size?: number;
};

export function JourneySparkleIcon({color, size = 24}: JourneyVisualIconProps) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path
        d="M10.9 2.4c.2-.9 1.5-.9 1.7 0 .55 3.46 2.48 5.39 5.94 5.94.9.2.9 1.5 0 1.7-3.46.55-5.39 2.48-5.94 5.94-.2.9-1.5.9-1.7 0-.55-3.46-2.48-5.39-5.94-5.94-.9-.2-.9-1.5 0-1.7 3.46-.55 5.39-2.48 5.94-5.94Z"
        fill={color}
      />
      <Path
        d="M18.1 13.8c.1-.48.8-.48.9 0 .27 1.73 1.24 2.7 2.97 2.97.48.1.48.8 0 .9-1.73.27-2.7 1.24-2.97 2.97-.1.48-.8.48-.9 0-.27-1.73-1.24-2.7-2.97-2.97-.48-.1-.48-.8 0-.9 1.73-.27 2.7-1.24 2.97-2.97Z"
        fill={color}
        opacity={0.62}
      />
      <Circle cx="4" cy="16.4" fill={color} opacity={0.42} r="1.15" />
    </Svg>
  );
}

export function JourneyTargetIcon({color, size = 20}: JourneyVisualIconProps) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Circle cx="12" cy="12" fill={color} opacity={0.12} r="10" />
      <Circle cx="12" cy="12" fill="none" r="6.4" stroke={color} strokeWidth="1.8" />
      <Circle cx="12" cy="12" fill={color} r="2.5" />
    </Svg>
  );
}

export function JourneyCheckIcon({color, size = 20}: JourneyVisualIconProps) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Circle cx="12" cy="12" fill={color} opacity={0.14} r="10" />
      <Path
        d="m7.7 12.2 2.7 2.7 5.9-6"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </Svg>
  );
}

export function JourneyImprovementIcon({color, size = 20}: JourneyVisualIconProps) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Circle cx="12" cy="12" fill={color} opacity={0.14} r="10" />
      <Path
        d="M12 7.3v6.4"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth="2.3"
      />
      <Circle cx="12" cy="17" fill={color} r="1.25" />
    </Svg>
  );
}

export function JourneyTipIcon({color, size = 22}: JourneyVisualIconProps) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path
        d="M8.3 15.1c-1.3-1.08-2.1-2.7-2.1-4.5a5.8 5.8 0 1 1 11.6 0c0 1.8-.8 3.42-2.1 4.5-.72.6-1.08 1.1-1.16 1.72H9.46c-.08-.62-.44-1.12-1.16-1.72Z"
        fill={color}
        opacity={0.16}
      />
      <Path
        d="M8.3 15.1c-1.3-1.08-2.1-2.7-2.1-4.5a5.8 5.8 0 1 1 11.6 0c0 1.8-.8 3.42-2.1 4.5-.72.6-1.08 1.1-1.16 1.72M9.46 16.82h5.08M9.8 20h4.4"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <Path
        d="M10.1 10.7 11.4 12l2.7-3"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </Svg>
  );
}
