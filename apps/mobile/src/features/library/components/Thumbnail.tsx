import { memo, useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { libraryReader, type LibraryPage } from '@seleva/photo-engine';
import { useTheme } from '@seleva/ui';

type Asset = LibraryPage['assets'][number];

interface ThumbnailProps {
  asset: Asset;
  expanded?: boolean;
}

function ThumbnailComponent({ asset, expanded = false }: ThumbnailProps) {
  const { t } = useTranslation();
  const colors = useTheme();
  const [uri, setUri] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setUri(undefined);
    setLoading(true);
    const timeout = setTimeout(() => {
      if (active) {
        active = false;
        setLoading(false);
      }
    }, 20_000);

    void libraryReader
      .getThumbnail({ id: asset.id, size: expanded ? 512 : 256 })
      .then((result) => {
        if (!active) return;
        clearTimeout(timeout);
        if (result.ok) setUri(result.value);
        setLoading(false);
      })
      .catch(() => {
        clearTimeout(timeout);
        if (active) setLoading(false);
      });

    return () => {
      clearTimeout(timeout);
      active = false;
    };
  }, [asset.id, expanded]);

  const styles = createStyles(colors, expanded);
  return (
    <View style={styles.container}>
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode={expanded ? 'contain' : 'cover'}
          onError={() => setUri(undefined)}
          accessibilityLabel={t(
            asset.mediaType === 'video' ? 'videoThumbnail' : 'photoThumbnail',
          )}
        />
      ) : loading ? (
        <ActivityIndicator />
      ) : (
        <Text style={styles.placeholder}>{t('thumbnailUnavailable')}</Text>
      )}
    </View>
  );
}

export const Thumbnail = memo(ThumbnailComponent);

const createStyles = (colors: ReturnType<typeof useTheme>, expanded: boolean) =>
  StyleSheet.create({
    container: {
      width: expanded ? '100%' : undefined,
      height: expanded ? 400 : undefined,
      flex: expanded ? undefined : 1,
      justifyContent: 'center',
    },
    image: { width: '100%', height: '100%', borderRadius: expanded ? 0 : 18 },
    placeholder: { color: colors.muted, textAlign: 'center', fontSize: 12 },
  });
