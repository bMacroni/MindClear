import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/Octicons';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing, borderRadius } from '../../themes/spacing';
import { GoalData, GoalMilestone, GoalStep } from '../../types/goal';

interface GoalBreakdownDisplayProps {
  text: string;
  onSaveGoal: (goalData: GoalData) => Promise<void>;
  conversationalText?: string;
  conversationTitle?: string;
}

// Parse goal breakdown from text - extracted to avoid recreating on every render
const parseGoalBreakdown = (breakdownText: string, conversationalText?: string, conversationTitle?: string): GoalData => {
    try {
      // First try to parse standardized JSON format
      const jsonMatch = breakdownText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        const jsonData = JSON.parse(jsonMatch[1]);
        // Case A: { category: 'goal', milestones: [...] } (older schema)
        if (jsonData.category === 'goal' && jsonData.milestones) {
          return {
            title: jsonData.title || '',
            description: jsonData.description || '',
            dueDate: jsonData.due_date || jsonData.dueDate,
            category: jsonData.category || jsonData.priority,
            milestones: jsonData.milestones
          };
        }
        // Case B: { category: 'goal', goal: { ...full goal... } } (current backend schema)
        if (jsonData.category === 'goal' && jsonData.goal) {
          const g = jsonData.goal || {};
          return {
            title: g.title || jsonData.title || '',
            description: g.description || '',
            dueDate: g.target_completion_date || g.due_date || g.dueDate,
            category: g.category || g.priority,
            milestones: Array.isArray(g.milestones) ? g.milestones : [],
          };
        }
        // Case C: read action wrapper { action_type:'read', entity_type:'goal', details: {...} }
        if (jsonData.action_type === 'read' && jsonData.entity_type === 'goal') {
          const details = jsonData.details || {};
          const first = Array.isArray(details?.goals) ? details.goals[0] : (Array.isArray(details) ? details[0] : details);
          const g = first || {};
          if (g && typeof g === 'object') {
            return {
              title: g.title || '',
              description: g.description || '',
              dueDate: g.target_completion_date || g.due_date || g.dueDate,
              category: g.category || g.priority,
              milestones: Array.isArray(g.milestones) ? g.milestones : [],
            };
          }
        }
      }
      
      // Also try to parse if the text is just JSON
      const directJsonMatch = breakdownText.match(/\{[\s\S]*\}/);
      if (directJsonMatch) {
        const jsonData = JSON.parse(directJsonMatch[0]);
        // Mirror the same three cases for direct JSON
        if (jsonData.category === 'goal' && jsonData.milestones) {
          return {
            title: jsonData.title || '',
            description: jsonData.description || '',
            dueDate: jsonData.due_date || jsonData.dueDate,
            category: jsonData.category || jsonData.priority,
            milestones: jsonData.milestones
          };
        }
        if (jsonData.category === 'goal' && jsonData.goal) {
          const g = jsonData.goal || {};
          return {
            title: g.title || jsonData.title || '',
            description: g.description || '',
            dueDate: g.target_completion_date || g.due_date || g.dueDate,
            category: g.category || g.priority,
            milestones: Array.isArray(g.milestones) ? g.milestones : [],
          };
        }
        if (jsonData.action_type === 'read' && jsonData.entity_type === 'goal') {
          const details = jsonData.details || {};
          const first = Array.isArray(details?.goals) ? details.goals[0] : (Array.isArray(details) ? details[0] : details);
          const g = first || {};
          if (g && typeof g === 'object') {
            return {
              title: g.title || '',
              description: g.description || '',
              dueDate: g.target_completion_date || g.due_date || g.dueDate,
              category: g.category || g.priority,
              milestones: Array.isArray(g.milestones) ? g.milestones : [],
            };
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse JSON goal data:', error);
    }
    
    // Fallback to old parsing method for backward compatibility
    const goalData: GoalData = {
      title: '',
      description: '',
      dueDate: undefined,
      category: undefined,
      milestones: []
    };
    
    // Split by lines and look for goal information
    const lines = breakdownText.split('\n');
    let currentMilestone: GoalMilestone | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Extract goal title
      const goalTitleMatch = trimmedLine.match(/^(?:\*\*goal\*\*|goal):\s*(.+)/i);
      if (goalTitleMatch) {
        let fullTitle = goalTitleMatch[1].trim();
        // Check for a due date in parentheses and strip it
        const dueDateInTitle = fullTitle.match(/\((?:due by|due date|due).*?\)/i);
        if (dueDateInTitle) {
          goalData.dueDate = dueDateInTitle[0].replace(/\(|\)/g, '').replace(/due by/i, '').trim();
          fullTitle = fullTitle.replace(dueDateInTitle[0], '').trim();
        }
        goalData.title = fullTitle;
        continue;
      }

      // Extract goal description
      const goalDescMatch = trimmedLine.match(/^(?:\*\*description\*\*|description):\s*(.+)/i);
      if (goalDescMatch) {
        const descText = goalDescMatch[1].trim();
        // Only set description if it's not obviously conversational text
        // Skip if it starts with conversational phrases
        if (!descText.toLowerCase().match(/^(that's|it's|this is|i've|i'm|you're)/i)) {
          goalData.description = descText;
        }
        continue;
      }

      // Extract due date
      const dueDateMatch = trimmedLine.match(/^(?:\*\*due\s*date\*\*|due\s*date):\s*([^\n*]+)/i);
      if (dueDateMatch) {
        goalData.dueDate = dueDateMatch[1].trim();
        continue;
      }

      // Extract category or priority
      const categoryMatch = trimmedLine.match(/^(?:\*\*category\*\*|\*\*priority\*\*|category|priority):\s*([^\n*]+)/i);
      if (categoryMatch) {
        const raw = categoryMatch[1].trim();
        goalData.category = raw.split('(')[0].trim();
        continue;
      }

      // Ignore any explicit "Steps:" label lines
      if (/^([•\-\*]\s*)?\*\*?\s*steps\s*:\s*\*\*?/i.test(trimmedLine)) {
        continue;
      }

      // Skip a plain "Milestones:" header line so it doesn't render as a milestone card
      if (/^([•\-\*]\s*)?\*\*?\s*milestones\s*:\s*\*\*?$/i.test(trimmedLine)) {
        continue;
      }

      // Detect milestone headers in multiple common formats, even without a
      // preceding "Milestones:" section header.
      // Examples handled:
      // * **Milestone 3: React Native Core (Approx. 3–4 months)**
      // * Milestone 1: Fundamentals
      // Milestone 2: Advanced Topics
      const milestoneHeaderRegexes: RegExp[] = [
        /^([•\-\*]\s*)?\*\*(.+?)\*\*:?\s*$/i, // bullet with bold title
        /^([•\-\*]\s*)?\s*(Milestone\s*\d+[^:]*)\s*:?.*$/i, // bullet no bold
        /^\s*(Milestone\s*\d+[^:]*)\s*:?.*$/i, // no bullet
      ];

      let newMilestoneTitle: string | null = null;
      for (const rx of milestoneHeaderRegexes) {
        const m = trimmedLine.match(rx);
        if (m) {
          // If the match captured the whole bold title (case 1), prefer group 2; otherwise group 2 or 1 depending on pattern
          newMilestoneTitle = (m[2] || m[1] || '').trim();
          // Ensure this looks like a milestone title
          if (!/milestone/i.test(newMilestoneTitle)) {
            // In the bold-title case, the bold content might include "Milestone" or not.
            // If it does not, skip; this prevents treating bold regular lines as milestones.
            newMilestoneTitle = null;
          }
        }
        if (newMilestoneTitle) {break;}
      }

      if (newMilestoneTitle) {
        // Save previous milestone if exists
        if (currentMilestone) {
          goalData.milestones.push(currentMilestone);
        }

        currentMilestone = {
          title: newMilestoneTitle.replace(/\*\*/g, '').trim(),
          steps: [],
        };
        continue;
      }

      // Accumulate steps only if within a milestone block
      if (currentMilestone) {
        // Look for step patterns (bullet points with step content)
        const stepPattern = /^[•\-\*]\s*(.+)$/;
        const stepMatch = trimmedLine.match(stepPattern);

        if (stepMatch) {
          const stepText = stepMatch[1].replace(/\*\*/g, '').trim();
          if (
            stepText &&
            !/^steps\s*:/i.test(stepText) &&
            !/^(milestone\s*\d+\b)/i.test(stepText)
          ) {
            currentMilestone.steps.push({ text: stepText });
          }
        }
      }
    }
    
    // Add the last milestone
    if (currentMilestone) {
      goalData.milestones.push(currentMilestone);
    }
    
    // Fallback for title if not found in structured data
    if (!goalData.title) {
      if (conversationalText) {
        // Try to find goal title in conversational text using multiple patterns
        // Pattern 1: "I've created the goal [title]" or "the goal [title]"
        const goalPattern1 = conversationalText.match(/(?:I['']ve\s+created\s+)?(?:the\s+)?goal\s+['"]([^'"]+)['"]/i);
        if (goalPattern1 && goalPattern1[1]) {
          goalData.title = goalPattern1[1].trim();
        }
        
        // Pattern 2: "goal '[title]'" (without "the" or "created")
        if (!goalData.title) {
          const goalPattern2 = conversationalText.match(/goal\s+['"]([^'"]+)['"]/i);
          if (goalPattern2 && goalPattern2[1]) {
            goalData.title = goalPattern2[1].trim();
          }
        }
        
        // Pattern 3: Look for quoted text near goal-related keywords
        if (!goalData.title) {
          const goalContextPattern = conversationalText.match(/(?:goal|created|planning)[^'"]*['"]([^'"]{1,100})['"]/i);
          if (goalContextPattern && goalContextPattern[1]) {
            const candidate = goalContextPattern[1].trim();
            // Only use if it's a reasonable length (not too long, likely a title)
            if (candidate.length > 0 && candidate.length < 100 && !candidate.includes('awesome') && !candidate.includes('incredible')) {
              goalData.title = candidate;
            }
          }
        }
        
        // Pattern 4: Last resort - find any quoted text, but prefer shorter ones (likely titles)
        if (!goalData.title) {
          const allQuotes = conversationalText.matchAll(/['"]([^'"]+)['"]/g);
          let bestMatch: string | null = null;
          let bestLength = Infinity;
          
          // Words/phrases that indicate this is NOT a title (description or conversational text)
          const notTitleIndicators = [
            'awesome', 'incredible', 'experience', 'sounds like', 'adventurous',
            'learning to', 'just for fun', 'months', 'ready to', 'explore',
            'underwater', 'world', 'how about', 'let\'s', 'we start'
          ];
          
          for (const match of allQuotes) {
            const candidate = match[1].trim();
            // Prefer shorter quoted strings (likely titles) over longer ones (likely descriptions)
            if (candidate.length > 0 && candidate.length < 80 && candidate.length < bestLength) {
              // Skip if it contains common conversational words that aren't titles
              const lowerCandidate = candidate.toLowerCase();
              const isNotTitle = notTitleIndicators.some(indicator => lowerCandidate.includes(indicator));
              
              if (!isNotTitle) {
                bestMatch = candidate;
                bestLength = candidate.length;
              }
            }
          }
          
          if (bestMatch) {
            goalData.title = bestMatch;
          }
        }
      }
      if (!goalData.title && conversationTitle && conversationTitle !== 'New Conversation' && conversationTitle !== 'Conversation' && conversationTitle !== 'Goal Planning' ) {
          goalData.title = conversationTitle;
      }
    }
    
    // Final validation: ensure title doesn't contain description-like text
    if (goalData.title) {
      const titleLower = goalData.title.toLowerCase();
      // If title looks like a description (contains conversational phrases), clear it
      if (titleLower.includes('awesome') && titleLower.includes('adventurous') ||
          titleLower.includes('sounds like') ||
          titleLower.includes('incredible experience') ||
          (titleLower.includes('learning to') && titleLower.includes('months'))) {
        goalData.title = '';
        // Try to extract a better title from the description if available
        if (goalData.description) {
          // Look for quoted text in description that might be the actual title
          const descQuoteMatch = goalData.description.match(/['"]([^'"]{1,60})['"]/);
          if (descQuoteMatch && descQuoteMatch[1]) {
            goalData.title = descQuoteMatch[1].trim();
          }
        }
      }
    }
    
    return goalData;
};

export default function GoalBreakdownDisplay({ text, onSaveGoal, conversationalText, conversationTitle }: GoalBreakdownDisplayProps) {
  const [isSaving, setIsSaving] = React.useState(false);
  const [isSaved, setIsSaved] = React.useState(false);

  // Memoize parsing to avoid re-parsing on every render
  const goalData = useMemo(() => {
    return parseGoalBreakdown(text, conversationalText, conversationTitle);
  }, [text, conversationalText, conversationTitle]);

  const handleSave = async () => {
    if (isSaving || isSaved) return;
    setIsSaving(true);
    try {
      await onSaveGoal(goalData);
      setIsSaved(true);
    } catch (error) {
      console.error('Failed to save goal:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred while saving the goal.';
      Alert.alert(
        'Save Failed',
        errorMessage
      );
    } finally {
      setIsSaving(false);
    }
  };

  // If no milestones found, return null to fall back to regular text display
  if (goalData.milestones.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.breakdownTitle}>Goal Breakdown</Text>
      {goalData.title && (
        <View style={styles.goalHeader}>
          <Text style={styles.goalTitle} numberOfLines={0}>
            {goalData.title}
          </Text>
          {(goalData.dueDate || goalData.category) && (
            <View style={styles.metaRow}>
              {goalData.dueDate && (
                <View style={styles.metaItem}>
                  <Icon name="calendar" size={14} color={colors.text.secondary} style={styles.metaIcon} />
                  <Text style={styles.metaText}>{formatDate(goalData.dueDate)}</Text>
                </View>
              )}
              {goalData.category && (
                <View style={styles.metaItem}>
                  <Icon name="tag" size={14} color={colors.text.secondary} style={styles.metaIcon} />
                  <Text style={styles.metaText}>Category: {goalData.category}</Text>
                </View>
              )}
            </View>
          )}
          {goalData.description && (
            <Text style={styles.goalDescription}>{goalData.description}</Text>
          )}
        </View>
      )}
      <View style={styles.milestonesContainer}>
        {goalData.milestones.map((milestone, milestoneIndex) => (
          <View key={milestoneIndex} style={styles.milestoneCard}>
            <View style={styles.leftAccent} />
            <View style={styles.milestoneHeader}>
              <Icon name="milestone" size={16} color={colors.primary} style={styles.milestoneIcon} />
              <Text style={styles.milestoneTitle}>
                {milestone.title}
              </Text>
            </View>
            <View style={styles.stepsContainer}>
              {milestone.steps.map((step, stepIndex) => (
                <View key={stepIndex} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{stepIndex + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>
                    {step.text}
                  </Text>
                </View>
              ))}
            </View>
            {milestoneIndex < goalData.milestones.length - 1 && <View style={styles.separator} />}
          </View>
        ))}
      </View>
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.saveButton, (isSaved || isSaving) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaved || isSaving}
          accessible={true}
          accessibilityLabel={isSaved ? 'Goal saved' : 'Save goal'}
          accessibilityRole="button"
        >
          {isSaving ? (
            <ActivityIndicator color={colors.secondary} size="small" />
          ) : (
            <Text style={styles.saveButtonText}>{isSaved ? 'Goal Saved' : 'Save Goal'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Use explicit pixel line-heights for reliable wrapping on Android
const BASE_LINE_HEIGHT = Math.round(typography.fontSize.base * 1.6);
const SM_LINE_HEIGHT = Math.round(typography.fontSize.sm * 1.6);

// Local date formatting helper
function formatDate(input?: string) {
  if (!input) {return '';}
  try {
    const d = new Date(input);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    return input;
  } catch {
    return input;
  }
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm, // Add some padding for content
    paddingVertical: spacing.sm,
    width: '100%',
    alignSelf: 'stretch', // Ensure it takes full available width
  },
  breakdownTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  goalHeader: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  goalTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: spacing.xs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.md,
    marginBottom: spacing.xs,
  },
  metaIcon: {
    marginRight: spacing.xs,
  },
  metaText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: SM_LINE_HEIGHT,
  },
  goalDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: SM_LINE_HEIGHT,
  },
  milestonesContainer: {
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    overflow: 'hidden',
  },
  milestoneCard: {
    padding: spacing.md,
    paddingLeft: spacing.md + 6,
    width: '100%',
    position: 'relative',
  },
  leftAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: colors.accent?.gold || '#D4AF37',
    borderTopLeftRadius: borderRadius.md,
    borderBottomLeftRadius: borderRadius.md,
  },
  milestoneHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start', // Align to top to allow text wrapping
    marginBottom: spacing.md,
    flex: 1,
    minWidth: 0, // Critical for text wrapping in flex containers
  },
  milestoneIcon: {
    marginRight: spacing.sm,
    marginTop: 2, // Align icon with first line of text
    flexShrink: 0, // Prevent icon from shrinking
  },
  milestoneTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
    flex: 1,
    flexShrink: 1,
    minWidth: 0, // Critical for text wrapping
    flexWrap: 'wrap', // Allow text to wrap
  },
  stepsContainer: {
    marginLeft: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginTop: 2,
  },
  stepNumberText: {
    color: colors.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  stepText: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    flex: 1,
    flexGrow: 1,
    flexBasis: 0,
    flexShrink: 1,
    minWidth: 0, // Critical for text wrapping
    lineHeight: BASE_LINE_HEIGHT,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border.light,
    marginHorizontal: -spacing.md,
  },
  actionsContainer: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
    height: 44,
  },
  saveButtonDisabled: {
    backgroundColor: colors.text.disabled,
  },
  saveButtonText: {
    color: colors.secondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
}); 