import type { ComponentType } from 'react';
import { ArrowsClockwise, CloudSlash, CrownSimple, Gauge, ListPlus, Monitor, type IconProps } from 'phosphor-react-native';
import type { ProFeature } from '@drift/core';

export const FEATURE_ICONS: Record<ProFeature, ComponentType<IconProps>> = {
  proWallpapers: CrownSimple,
  unlimitedFrameRate: Gauge,
  multiDisplay: Monitor,
  unlimitedLists: ListPlus,
  sync: ArrowsClockwise,
  offline: CloudSlash,
};
