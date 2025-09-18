#!/usr/bin/env node

/**
 * Bundle Analysis Script for MindGarden Mobile App
 * 
 * This script analyzes the React Native bundle to identify:
 * - Largest dependencies
 * - Unused code
 * - Optimization opportunities
 * 
 * Usage:
 * npm run analyze-bundle
 * npm run analyze-bundle-ios
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PLATFORM = process.argv[2] || 'android';
const BUNDLE_FILE = `${PLATFORM}-bundle.js`;
const REPORT_FILE = `bundle-report-${PLATFORM}.html`;

console.log(`🔍 Analyzing ${PLATFORM} bundle...`);

try {
  // Step 1: Generate bundle
  console.log('📦 Generating bundle...');
  const bundleCommand = `react-native bundle --platform ${PLATFORM} --dev false --entry-file index.js --bundle-output ${BUNDLE_FILE} --assets-dest ${PLATFORM}-assets`;
  execSync(bundleCommand, { stdio: 'inherit' });

  // Step 2: Analyze bundle
  console.log('📊 Analyzing bundle size...');
  const stats = fs.statSync(BUNDLE_FILE);
  const bundleSizeKB = Math.round(stats.size / 1024);
  const bundleSizeMB = Math.round(bundleSizeKB / 1024 * 100) / 100;

  console.log(`📏 Bundle size: ${bundleSizeMB} MB (${bundleSizeKB} KB)`);

  // Step 3: Generate visual report
  console.log('📈 Generating visual report...');
  const analyzerCommand = `npx react-native-bundle-visualizer --bundle ${BUNDLE_FILE} --out ${REPORT_FILE}`;
  execSync(analyzerCommand, { stdio: 'inherit' });

  // Step 4: Generate summary
  console.log('📋 Generating analysis summary...');
  const summary = generateAnalysisSummary(bundleSizeMB, PLATFORM);
  
  const summaryFile = `bundle-analysis-${PLATFORM}.md`;
  fs.writeFileSync(summaryFile, summary);

  console.log(`✅ Analysis complete!`);
  console.log(`📊 Visual report: ${REPORT_FILE}`);
  console.log(`📋 Summary: ${summaryFile}`);
  console.log(`📦 Bundle file: ${BUNDLE_FILE}`);

  // Cleanup
  console.log('🧹 Cleaning up...');
  if (fs.existsSync(BUNDLE_FILE)) {
    fs.unlinkSync(BUNDLE_FILE);
  }

} catch (error) {
  console.error('❌ Bundle analysis failed:', error.message);
  process.exit(1);
}

function generateAnalysisSummary(bundleSizeMB, platform) {
  const timestamp = new Date().toISOString();
  
  return `# Bundle Analysis Report - ${platform.toUpperCase()}

**Generated:** ${timestamp}
**Bundle Size:** ${bundleSizeMB} MB

## Performance Targets

- **Target Size:** < 15 MB
- **Current Size:** ${bundleSizeMB} MB
- **Status:** ${bundleSizeMB < 15 ? '✅ Good' : '⚠️ Needs Optimization'}

## Optimization Recommendations

### High Priority
1. **Remove unused dependencies** - Check the visual report for large unused libraries
2. **Implement tree shaking** - Ensure dead code elimination is working
3. **Optimize images** - Compress and use appropriate formats
4. **Code splitting** - Already implemented with lazy loading

### Medium Priority
1. **Bundle splitting** - Split vendor and app code
2. **Dynamic imports** - Load heavy features on demand
3. **Remove development dependencies** - Ensure no dev deps in production

### Low Priority
1. **Minification** - Verify ProGuard/Rollup is working optimally
2. **Compression** - Enable gzip/brotli compression
3. **Caching** - Implement proper bundle caching

## Next Steps

1. Open \`${REPORT_FILE}\` in a browser to see the visual breakdown
2. Identify the largest dependencies in the treemap
3. Check for unused code (gray areas in the visualization)
4. Implement optimizations based on findings
5. Re-run analysis to measure improvements

## Commands

\`\`\`bash
# Analyze Android bundle
npm run analyze-bundle

# Analyze iOS bundle  
npm run analyze-bundle-ios

# Clean up generated files
rm -f *-bundle.js *-assets bundle-report*.html bundle-analysis*.md
\`\`\`
`;
}
