import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, useTheme } from '@seleva/ui';
import type { LibraryPage } from '@seleva/photo-engine';
import { Thumbnail } from './Thumbnail';

type Asset = LibraryPage['assets'][number];

interface LibraryGridItemProps {
  asset: Asset;
  selected: boolean;
  onOpen: (asset: Asset) => void;
  onToggle: (id: string) => void;
}

function LibraryGridItemComponent({
  asset,
  selected,
  onOpen,
  onToggle,
}: LibraryGridItemProps) {
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = createStyles(colors);
  const open = useCallback(() => onOpen(asset), [asset, onOpen]);
  const toggle = useCallback(() => onToggle(asset.id), [asset.id, onToggle]);

  return (
    <View style={[styles.tile, selected && styles.selected]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('openPreview')}
        style={styles.openTarget}
        onPress={open}
      >
        <Thumbnail asset={asset} />
        <View style={styles.caption}>
          <Text style={styles.captionText}>
            {t(asset.mediaType === 'video' ? 'filter_videos' : 'filter_photos')}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={t(selected ? 'deselectPhoto' : 'selectPhoto')}
        accessibilityState={{ checked: selected }}
        onPress={toggle}
        style={styles.selectionTarget}
      >
        <View
          style={[
            styles.selectionCircle,
            {
              backgroundColor: selected
                ? colors.accent
                : 'rgba(255,255,255,0.15)',
              borderColor: selected ? colors.accent : '#FFFFFF',
            },
          ]}
        >
          {selected && <Icon name="check" color={colors.primary} size={15} />}
        </View>
      </Pressable>
    </View>
  );
}

export const LibraryGridItem = memo(LibraryGridItemComponent);

const createStyles = (colors: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    tile: {
      flex: 1,
      maxWidth: '50%',
      aspectRatio: 0.87,
      padding: 2,
      borderWidth: 2,
      borderColor: 'transparent',
      borderRadius: 22,
      justifyContent: 'center',
    },
    selected: { borderColor: colors.selectionBorder },
    openTarget: { flex: 1 },
    caption: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 12,
      paddingTop: 22,
      backgroundColor: 'rgba(0,0,0,0.22)',
    },
    captionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
    selectionTarget: {
      position: 'absolute',
      top: 2,
      right: 2,
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectionCircle: {
      width: 25,
      height: 25,
      borderRadius: 13,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
