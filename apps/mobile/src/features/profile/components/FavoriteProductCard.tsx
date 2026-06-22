import { Image, Stack, Text, YStack } from 'tamagui';

import { userPageColors, userPageRadius } from '../../../shared/theme/tokens';
import type { FavoriteProductPreview } from '../../../shared/types/userPage';

interface FavoriteProductCardProps {
  product: FavoriteProductPreview;
}

const formatPrice = (price: number) => {
  return `${price.toLocaleString('ko-KR')}원`;
};

export const FavoriteProductCard = ({ product }: FavoriteProductCardProps) => {
  return (
    <YStack flex={1} gap={10} minWidth={0}>
      <Stack
        aspectRatio={1}
        borderColor={userPageColors.borderSubtle}
        borderRadius={6}
        borderWidth={1}
        overflow="hidden"
        position="relative"
      >
        <Image height="100%" source={{ uri: product.imageUrl }} width="100%" />

        <Text
          bottom={8}
          color={userPageColors.accent}
          fontSize={22}
          fontWeight="700"
          lineHeight={22}
          position="absolute"
          right={8}
        >
          {product.isLiked ? '♥' : '♡'}
        </Text>
      </Stack>

      <YStack gap={6}>
        <Text color={userPageColors.textMuted} fontSize={14} fontWeight="600">
          {product.brandName}
        </Text>
        <Text color={userPageColors.textMuted} fontSize={14} lineHeight={19}>
          {product.productName}
        </Text>
        <Text color={userPageColors.text} fontSize={17} fontWeight="800">
          {formatPrice(product.price)}
        </Text>
      </YStack>
    </YStack>
  );
};
