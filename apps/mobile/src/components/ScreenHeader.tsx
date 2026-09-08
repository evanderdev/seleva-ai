import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Icon, IconButton, layout, useTheme } from '@seleva/ui';
export function ScreenHeader({
  title,
  home = false,
  onSearch,
}: {
  title?: string;
  home?: boolean;
  onSearch?: () => void;
}) {
  const { t } = useTranslation();
  const colors = useTheme();
  return (
    <View
      style={[
        layout.content,
        layout.row,
        { height: 80, justifyContent: 'space-between' },
      ]}
    >
      {home ? (
        <View style={layout.row}>
          <View
            style={{
              backgroundColor: colors.primary,
              borderRadius: 12,
              padding: 7,
            }}
          >
            <Icon name="sparkles" color={colors.accent} />
          </View>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
            {t('brand')}
          </Text>
        </View>
      ) : (
        <>
          <IconButton
            name="back"
            label={t('back')}
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/')
            }
          />
          <Text
            style={{
              color: colors.text,
              fontSize: onSearch ? 14 : 20,
              fontWeight: '600',
              flex: onSearch ? undefined : 1,
            }}
          >
            {title}
          </Text>
        </>
      )}
      {home ? (
        <IconButton
          name="settings"
          label={t('settings')}
          onPress={() => router.push('/settings')}
        />
      ) : onSearch ? (
        <IconButton name="search" label={t('search')} onPress={onSearch} />
      ) : (
        <View style={{ width: 44 }} />
      )}
    </View>
  );
}
