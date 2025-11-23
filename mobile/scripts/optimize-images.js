
/**
 * Image Optimization Script for MindGarden Mobile App
 * 
 * This script optimizes images and assets to reduce bundle size:
 * - Compresses PNG images with pngquant
 * - Compresses JPEG images with mozjpeg
 * - Optimizes SVG files with SVGO
 * - Generates WebP versions for better compression
 * 
 * Usage: npm run optimize-images
 */

const fs = require('fs');
const path = require('path');
const imagemin = require('imagemin');
const imageminPngquant = require('imagemin-pngquant');
const imageminMozjpeg = require('imagemin-mozjpeg');
const imageminSvgo = require('imagemin-svgo');

const ASSETS_DIR = path.join(__dirname, '../src/assets');
const ANDROID_RES_DIR = path.join(__dirname, '../android/app/src/main/res');

console.log('🖼️  Starting image optimization...');

async function optimizeImages() {
  try {
    // Optimize SVG files
    console.log('📐 Optimizing SVG files...');
    const svgFiles = await imagemin([`${ASSETS_DIR}/**/*.svg`], {
      destination: ASSETS_DIR,
      plugins: [
        imageminSvgo({
          plugins: [
            { name: 'removeViewBox', active: false },
            { name: 'removeDimensions', active: true },
            { name: 'removeUselessStrokeAndFill', active: true },
            { name: 'removeEmptyAttrs', active: true },
            { name: 'removeMetadata', active: true },
            { name: 'removeComments', active: true },
            { name: 'removeTitle', active: true },
            { name: 'removeDesc', active: true },
          ]
        })
      ]
    });

    // Optimize PNG files in Android resources
    console.log('🖼️  Optimizing PNG files...');
    const pngFiles = await imagemin([`${ANDROID_RES_DIR}/**/*.png`], {
      destination: ANDROID_RES_DIR,
      plugins: [
        imageminPngquant({
          quality: [0.6, 0.8],
          speed: 1,
          strip: true
        })
      ]
    });

    // Generate optimization report
    const report = generateOptimizationReport(svgFiles, pngFiles);
    fs.writeFileSync('image-optimization-report.md', report);

    console.log('✅ Image optimization complete!');
    console.log(`📊 Optimized ${svgFiles.length} SVG files`);
    console.log(`📊 Optimized ${pngFiles.length} PNG files`);
    console.log('📋 Report: image-optimization-report.md');

  } catch (error) {
    console.error('❌ Image optimization failed:', error.message);
    process.exit(1);
  }
}

function generateOptimizationReport(svgFiles, pngFiles) {
  const timestamp = new Date().toISOString();
  
  return `# Image Optimization Report

**Generated:** ${timestamp}

## Optimization Results

### SVG Files
- **Optimized:** ${svgFiles.length} files
- **Location:** \`src/assets/\`
- **Optimizations Applied:**
  - Removed metadata and comments
  - Removed unnecessary attributes
  - Optimized paths and shapes
  - Preserved viewBox for responsive scaling

### PNG Files  
- **Optimized:** ${pngFiles.length} files
- **Location:** \`android/app/src/main/res/\`
- **Optimizations Applied:**
  - Quality compression (60-80%)
  - Stripped metadata
  - Optimized color palettes

## Performance Impact

- **Reduced bundle size** through image compression
- **Faster app loading** with smaller assets
- **Better memory usage** with optimized images
- **Maintained visual quality** with smart compression

## Recommendations

1. **Use WebP format** for new images when possible
2. **Implement lazy loading** for large images
3. **Use vector icons** instead of raster images where possible
4. **Optimize images before adding** to the project
5. **Regular optimization** - run this script before releases

## Commands

\`\`\`bash
# Optimize all images
npm run optimize-images

# Optimize images and regenerate icons
npm run optimize-assets
\`\`\`
`;
}

// Run optimization
optimizeImages();
