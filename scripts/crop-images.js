import sharp from 'sharp';
import { readdir, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'source-images');
const FRAGMENT_DIR = path.join(ROOT, 'public', 'fragments');
const SQL_OUTPUT = path.join(ROOT, 'supabase', 'seed-questions.sql');

// All 50 subjects with categories and display names
const ALL_SUBJECTS = [
    // suki
    { file: 'jomok13', name: 'Ape tu woi', category: 'suki' },
    { file: 'jomok14', name: 'Mas Amba', category: 'suki' },
    { file: 'jomok15', name: 'Kanaratzu Katsu', category: 'suki' },
    { file: 'jomok16', name: 'Kontol Emosimu Kawan', category: 'suki' },
    { file: 'jomok17', name: 'Awas Gw Lagi Sigma', category: 'suki' },
    { file: 'jomok18', name: 'Sebaiknya Jangan Terlalu Gegabah', category: 'suki' },
    { file: 'jomok19', name: 'Mas Amba😎', category: 'suki' },
    { file: 'jomok23', name: 'Mas Amba😡', category: 'suki' },
    { file: 'jomok21', name: 'Banyak Omong Lu Suki', category: 'suki' },
    { file: 'jomok22', name: 'Nak Ikot', category: 'suki' },
    { file: 'jomok24', name: 'Alamak', category: 'suki' },
    { file: 'jomok25', name: 'Aku Bilangin ke Polisi😡', category: 'suki' },
    { file: 'jomok26', name: 'Duh Ketahuan', category: 'suki' },
    { file: 'jomok27', name: 'Tak Bosan Bosan Aku Menunggumu', category: 'suki' },
    { file: 'jomok28', name: 'Mas Fuad Sparta', category: 'suki' },
    { file: 'jomok29', name: 'Halah Nyocot', category: 'suki' },
    { file: 'jomok30', name: 'Mas Rusdi😎', category: 'suki' },
    { file: 'jomok32', name: 'Ngab Owi', category: 'suki' },
    { file: 'jomok33', name: 'Amba Remaja', category: 'suki' },
    { file: 'jomok34', name: 'AmbaTron', category: 'suki' },


    // jomok
    { file: 'jomok1', name: 'Bersiaplah', category: 'jomok' },
    { file: 'jomok2', name: 'Berotak Kontol', category: 'jomok' },
    { file: 'jomok3', name: 'Rusdi', category: 'jomok' },
    { file: 'jomok4', name: 'Gw Lagi Yang Kena', category: 'jomok' },
    { file: 'jomok5', name: 'Langsung Sigma Gw Bjiir😂😂', category: 'jomok' },
    { file: 'jomok6', name: 'Gk', category: 'jomok' },
    { file: 'jomok7', name: 'Sedang Sibuk', category: 'jomok' },
    { file: 'jomok8', name: 'Aku Nak', category: 'jomok' },
    { file: 'jomok9', name: 'Yang Nanya Siapa😂', category: 'jomok' },
    { file: 'jomok10', name: 'Dikira Lucu😐', category: 'jomok' },
    { file: 'jomok11', name: 'Ada Ada Saja🤣', category: 'jomok' },
    { file: 'jomok12', name: 'Tertawa Tapi Terluka😂', category: 'jomok' },
];

// Color palettes per category (for generating placeholder images)
const CATEGORY_COLORS = {
    suki: { bg: '#2d5016', text: '#a8e063', accent: '#4a7c23' },
    jomok: { bg: '#1a5c3b', text: '#6bffb3', accent: '#27ae60' },
};

async function generatePlaceholder(subject) {
    const colors = CATEGORY_COLORS[subject.category];
    const size = 512;

    // Create a textured placeholder with SVG
    const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${colors.bg}" />
          <stop offset="100%" style="stop-color:${colors.accent}" />
        </linearGradient>
        <pattern id="dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
          <circle cx="16" cy="16" r="2" fill="${colors.text}" opacity="0.15" />
        </pattern>
        <pattern id="grid" x="0" y="0" width="64" height="64" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="64" y2="0" stroke="${colors.text}" stroke-width="0.5" opacity="0.08" />
          <line x1="0" y1="0" x2="0" y2="64" stroke="${colors.text}" stroke-width="0.5" opacity="0.08" />
        </pattern>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#bg)" />
      <rect width="${size}" height="${size}" fill="url(#dots)" />
      <rect width="${size}" height="${size}" fill="url(#grid)" />
      <circle cx="${size * 0.3}" cy="${size * 0.35}" r="${size * 0.18}" fill="${colors.accent}" opacity="0.4" />
      <circle cx="${size * 0.7}" cy="${size * 0.6}" r="${size * 0.22}" fill="${colors.text}" opacity="0.15" />
      <rect x="${size * 0.15}" y="${size * 0.55}" width="${size * 0.7}" height="${size * 0.2}" rx="12" fill="${colors.accent}" opacity="0.3" />
      <text x="${size / 2}" y="${size * 0.48}" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="${colors.text}">${subject.name}</text>
      <text x="${size / 2}" y="${size * 0.58}" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="${colors.text}" opacity="0.6">${subject.category.toUpperCase()}</text>
    </svg>`;

    const outputPath = path.join(SOURCE_DIR, `${subject.file}.png`);
    await sharp(Buffer.from(svg)).png().toFile(outputPath);
    console.log(`  ✨ Generated placeholder: ${subject.file}.png`);
}

async function cropImage(subject) {
    const sourcePath = path.join(SOURCE_DIR, `${subject.file}.png`);
    if (!existsSync(sourcePath)) {
        console.warn(`  ⚠ Missing source: ${subject.file}.png — skipping`);
        return null;
    }

    const image = sharp(sourcePath);
    const metadata = await image.metadata();
    const w = metadata.width;
    const h = metadata.height;

    // 1/4 crop: take a region that is 1/4th of the width and height
    const cropW = Math.floor(w / 4);
    const cropH = Math.floor(h / 4);

    // Random position (ensure we stay within bounds)
    const maxX = w - cropW;
    const maxY = h - cropH;
    const x = Math.floor(Math.random() * maxX);
    const y = Math.floor(Math.random() * maxY);

    const fragmentName = `frag_${subject.file}.webp`;
    const fragmentPath = path.join(FRAGMENT_DIR, fragmentName);

    await sharp(sourcePath)
        .extract({ left: x, top: y, width: cropW, height: cropH })
        .resize(300, 300, { fit: 'cover' })
        .webp({ quality: 85 })
        .toFile(fragmentPath);

    console.log(`  ✅ Cropped: ${subject.file} → ${fragmentName} (${cropW}x${cropH} from ${x},${y})`);

    return {
        ...subject,
        fragment: fragmentName,
    };
}

function generateDistractors(subject, allSubjects) {
    // Pick 3 random distractors from the same category first, then fill from others
    const sameCategory = allSubjects.filter(
        (s) => s.category === subject.category && s.file !== subject.file
    );
    const otherCategory = allSubjects.filter(
        (s) => s.category !== subject.category
    );

    const pool = [...shuffleArray(sameCategory), ...shuffleArray(otherCategory)];
    return pool.slice(0, 3).map((s) => s.name);
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function generateSeedSQL(questions) {
    let sql = `-- Auto-generated by crop-images.js\n`;
    sql += `-- Run this in your Supabase SQL Editor AFTER running schema.sql\n\n`;
    sql += `DELETE FROM questions;\n\n`;
    sql += `INSERT INTO questions (fragment_url, correct_answer, options, category) VALUES\n`;

    const values = questions.map((q) => {
        const distractors = generateDistractors(q, ALL_SUBJECTS);
        const options = shuffleArray([q.name, ...distractors]);
        const optionsArr = `ARRAY[${options.map((o) => `'${o.replace(/'/g, "''")}'`).join(', ')}]`;
        return `  ('/fragments/${q.fragment}', '${q.name.replace(/'/g, "''")}', ${optionsArr}, '${q.category}')`;
    });

    sql += values.join(',\n') + ';\n';
    return sql;
}

async function main() {
    console.log('🖼  TeSiMok Image Crop Pipeline\n');

    // Ensure dirs exist
    if (!existsSync(SOURCE_DIR)) await mkdir(SOURCE_DIR, { recursive: true });
    if (!existsSync(FRAGMENT_DIR)) await mkdir(FRAGMENT_DIR, { recursive: true });

    // Step 1: Generate placeholders for any missing source images
    console.log('📦 Step 1: Checking/generating source images...');
    for (const subject of ALL_SUBJECTS) {
        const sourcePath = path.join(SOURCE_DIR, `${subject.file}.png`);
        if (!existsSync(sourcePath)) {
            await generatePlaceholder(subject);
        } else {
            console.log(`  ✓ Found existing: ${subject.file}.png`);
        }
    }

    // Step 2: Crop each source image into a 1/8 fragment
    console.log('\n✂️  Step 2: Cropping fragments (1/4 scale)...');
    const questions = [];
    for (const subject of ALL_SUBJECTS) {
        const result = await cropImage(subject);
        if (result) questions.push(result);
    }

    // Step 3: Generate seed SQL
    console.log(`\n📄 Step 3: Generating seed SQL (${questions.length} questions)...`);
    const sql = generateSeedSQL(questions);
    await writeFile(SQL_OUTPUT, sql, 'utf8');
    console.log(`  ✅ Written to ${SQL_OUTPUT}`);

    console.log(`\n🎉 Done! ${questions.length} fragments ready in public/fragments/`);
    console.log('   Run the seed SQL in your Supabase SQL Editor to populate questions.\n');
}

main().catch(console.error);
