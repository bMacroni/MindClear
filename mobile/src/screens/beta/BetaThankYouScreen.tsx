import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing, borderRadius } from '../../themes/spacing';
import { Button } from '../../components/common';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { Calendar01Icon, Task01Icon } from '@hugeicons/core-free-icons';

type BetaThankYouScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'BetaThankYou'>;
};

export default function BetaThankYouScreen({ navigation }: BetaThankYouScreenProps) {
  const handleContinue = () => {
    navigation.replace('Main');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require('../../../assets/icon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Thank You Title */}
          <Text style={styles.title}>Thank You!</Text>
          <Text style={styles.subtitle}>
            We're thrilled to have you as part of our closed beta
          </Text>

          {/* Main Content Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your participation helps us build better</Text>

            {/* Instructions */}
            <View style={styles.instructionContainer}>
              <View style={styles.instructionRow}>
                <View style={styles.iconContainer}>
                  <Icon icon={Calendar01Icon} size={24} color={colors.primary} />
                </View>
                <View style={styles.instructionTextContainer}>
                  <Text style={styles.instructionTitle}>Keep the app installed</Text>
                  <Text style={styles.instructionDescription}>
                    Please keep Mind Clear installed for 14 consecutive days
                  </Text>
                </View>
              </View>

              <View style={styles.instructionRow}>
                <View style={styles.iconContainer}>
                  <Icon icon={Task01Icon} size={24} color={colors.primary} />
                </View>
                <View style={styles.instructionTextContainer}>
                  <Text style={styles.instructionTitle}>Open daily and make one change</Text>
                  <Text style={styles.instructionDescription}>
                    Open the app each day and make at least one change, such as:
                  </Text>
                  <View style={styles.exampleList}>
                    <Text style={styles.exampleItem}>• Mark a task complete</Text>
                    <Text style={styles.exampleItem}>• Complete a brain dump</Text>
                    <Text style={styles.exampleItem}>• Add or update a goal</Text>
                    <Text style={styles.exampleItem}>• Create a new task</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Continue Button */}
          <Button
            title="Get Started"
            onPress={handleContinue}
            style={styles.button}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    paddingTop: spacing.sm,
  },
  logoContainer: {
    marginBottom: spacing.md,
  },
  logo: {
    width: 100,
    height: 100,
  },
  title: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.sm,
    color: colors.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.base,
  },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  cardTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  instructionContainer: {
    gap: spacing.lg,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    flexShrink: 0,
  },
  instructionTextContainer: {
    flex: 1,
  },
  instructionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  instructionDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.sm,
  },
  exampleList: {
    marginTop: spacing.sm,
    paddingLeft: spacing.sm,
  },
  exampleItem: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.sm,
    marginBottom: spacing.xs,
  },
  button: {
    width: '100%',
    maxWidth: 320,
    marginTop: spacing.md,
  },
});

