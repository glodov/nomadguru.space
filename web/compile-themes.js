const { spawn } = require('node:child_process');
const { readdirSync, existsSync, watch, promises: fsPromises } = require('node:fs');
const { join, dirname, relative } = require('node:path');
const unzipper = require('unzipper'); // Ensure you've installed this package
const sass = require('sass');
const { minify } = require('terser');
const { ensureDirectory } = require('./src/fs');
const { NANO, RED, OK, FAIL, GREEN, RESET } = require('./src/cli');
const { ROOT_DIR, NWE_DIR } = require('./config');

const NODE_MODULES = [
  './node_modules/bootstrap/dist/js/bootstrap.bundle.min.js',
  './node_modules/ejs/ejs.min.js',
];

const THEMES_DIR = join(__dirname, 'themes');
const ICONS_SOURCE_DIR = './icons';
const SCSS_SOURCE_DIR = './scss'; // Adjust if your SCSS directory name differs
const CSS_OUTPUT_DIR = './public/css'; // Adjust based on your output directory structure
const JS_SOURCE_DIR = './js'; // Assuming this is your JS directory within each theme
const JS_OUTPUT_DIR = './public/js'; // Target directory for JS files
const IS_WATCHING = process.argv.includes('--watch');
const SHOULD_MINIFY = process.argv.includes('--minify');

async function isFileNewer(srcPath, targetPath) {
  try {
    const [srcStats, targetStats] = await Promise.all([
      fsPromises.stat(srcPath),
      fsPromises.stat(targetPath)
    ]);
    return srcStats.mtime > targetStats.mtime;
  } catch (error) {
    // If target does not exist or another error occurs, assume src is newer.
    return true;
  }
}
async function readDirectoryRecursively(directory, basePath = []) {
  let files = [];
  const entries = await fsPromises.readdir(directory, { withFileTypes: true });
  for (let entry of entries) {
    if (entry.isDirectory()) {
      const subFiles = await readDirectoryRecursively(join(directory, entry.name), [...basePath, entry.name]);
      files = files.concat(subFiles);
    } else {
      files.push([...basePath, entry.name]);
    }
  }
  return files;
}

async function copyFile(srcPath, destPath) {
  await ensureDirectory(dirname(destPath));
  return new Promise((resolve, reject) => {
    const cp = spawn('cp', ['-r', srcPath, destPath]);
    cp.on('close', code => code === 0 ? resolve() : reject(`Failed to copy ${srcPath} to ${destPath}`));
  });
}
async function copyJsToPublic(themeName, subdir = '', outputFile = 'index.min.js') {
  let jsSourcePath;
  let jsPublicPath;
  let isThemeFile = false;
  let files = [];
  let minifiedFile = null;
  if (themeName.includes('/') || themeName.includes('\\')) {
    isThemeFile = true;
    jsPublicPath = join(__dirname, JS_OUTPUT_DIR, subdir);
    try {
      const stat = await fsPromises.stat(themeName);
      if (stat.isDirectory()) {
        jsSourcePath = themeName;
        files = await readDirectoryRecursively(jsSourcePath);
        minifiedFile = join(jsPublicPath, outputFile);
      } else {
        jsSourcePath = dirname(themeName);
        files.push(relative(jsSourcePath, themeName));
      }
    } catch (error) {
      console.error(`Error accessing path: ${themeName}`, error);
    }
  } else {
    try {
      jsSourcePath = join(THEMES_DIR, themeName, JS_SOURCE_DIR);
      jsPublicPath = join(__dirname, JS_OUTPUT_DIR, themeName);
      files = await fsPromises.readdir(jsSourcePath);
      minifiedFile = join(jsPublicPath, outputFile);
    } catch (error) {
      console.log(`Error to read dir`, error);
    }
  }

  async function copy(sourceFile) {
    const file = typeof sourceFile === 'string' ? sourceFile : sourceFile.join('/');
    const srcFilePath = join(jsSourcePath, file);
    const destFilePath = join(jsPublicPath, file);
    if (await isFileNewer(srcFilePath, destFilePath)) {
      await fsPromises.mkdir(dirname(destFilePath), { recursive: true }).catch(console.error);
      await copyFile(srcFilePath, destFilePath);
      console.log(` ${NANO} [${themeName}] Copied ${file} to public JS directory.`);
    }
  }

  async function minifyAndSave(files, outputFile) {
    const fileContents = await Promise.all(files.map(async (file) => {
      const filePath = join(jsSourcePath, typeof file === 'string' ? file : file.join('/'));
      return fsPromises.readFile(filePath, 'utf8');
    }));

    let result = { code: fileContents.join('\n') }; // Default to joined content
    if (SHOULD_MINIFY) {
        // If --minify is provided, minify the concatenated file contents
        result = await minify(result.code);
    }
    if (result.code) {
      await fsPromises.mkdir(dirname(outputFile), { recursive: true });
      await fsPromises.writeFile(outputFile, result.code);
      const rel = isThemeFile ? relative(__dirname, themeName) : themeName;
      console.log(` ${NANO} [${rel}] Minified and saved to ${relative(__dirname, outputFile)}`);
    }
  }

  function compile() {
    if (minifiedFile) {
      minifyAndSave(files, minifiedFile);
    } else {
      files.forEach(copy);
    }
  }
  compile();

  if (!IS_WATCHING) return;

  watch(jsSourcePath, async (eventType, filename) => {
    if (filename) {
      const dir = themeName.includes('/') ? relative(__dirname, themeName) : themeName;
      console.log(`[${dir}] Detected change in JS file: ${filename}`);
      compile();
    }
  });
}
async function unzipIcomoon(themeName, fullPath = null) {
  let themeDir = fullPath;
  let icomoonZipPath;
  if (fullPath) {
    icomoonZipPath = join(fullPath, 'icomoon.zip');
  } else {
    themeDir = join(THEMES_DIR, themeName);
    icomoonZipPath = join(themeDir, 'icomoon.zip');
  }
  if (!existsSync(icomoonZipPath)) {
    console.error(` ${RED}${FAIL}${RESET} ${relative(ROOT_DIR, icomoonZipPath)} not found`);
    return false;
  }
  console.log(`${NANO}${themeName}${NANO}\n ${GREEN}${OK}${RESET} Icomoon.zip found`);

  const extractPath = join(themeDir, 'icomoon');
  await unzipper.Open.file(icomoonZipPath)
    .then(d => d.extract({ path: extractPath }))
    .catch(err => console.error('Error unzipping icomoon.zip:', err));

  const icomoonAssets = [
    { src: join(extractPath, 'selection.json'), dest: join(themeDir, ICONS_SOURCE_DIR, 'selection.json') },
    { src: join(extractPath, 'style.css'), dest: join(themeDir, SCSS_SOURCE_DIR, '_icomoon.scss') },
    { src: join(extractPath, 'fonts'), dest: join(CSS_OUTPUT_DIR, themeName, 'fonts') }
  ];

  const result = [];
  icomoonAssets.forEach(({ src, dest }) => {
    ensureDirectory(dirname(dest));
    spawn('cp', ['-r', src, dest]);
    result.push(dest);
    console.log(` ${GREEN}${NANO}${RESET} ${relative(ROOT_DIR, src)} ${NANO} ${relative(ROOT_DIR, dest)}`);
  });

  // Cleanup
  spawn('rm', ['-r', extractPath]);
  spawn('rm', [icomoonZipPath]);
  return result;
}

// compile themes
(() => {
  readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .forEach(theme => {
      const scssSourcePath = join(THEMES_DIR, theme.name, SCSS_SOURCE_DIR);
      const cssOutputPath = join(__dirname, CSS_OUTPUT_DIR, theme.name);
      console.log(`Watching ${scssSourcePath}...`);
  
      unzipIcomoon(theme.name).then((res) => {
        if (res) console.log(` ${GREEN}${OK}${RESET} Icomoon setup completed for theme ${NANO}${theme.name}${NANO}`);
      });
  
      const args = [`${scssSourcePath}:${cssOutputPath}`, '--style', 'compressed'];
      if (IS_WATCHING) args.unshift('--watch');
      const sassProcess = spawn('sass', args);
  
      sassProcess.stdout.on('data', (data) => {
        console.log(`[${theme.name}]: ${data}`);
      });
  
      sassProcess.stderr.on('data', (data) => {
        console.error(`[${theme.name} ERROR]: ${data}`);
      });
  
      copyJsToPublic(theme.name);
    });
})();

// compile nw editor and core modules
(() => {
  for (const file of NODE_MODULES) copyJsToPublic(file);
  
  const themeName = 'nw';
  copyJsToPublic(join(NWE_DIR, 'js', 'api'), themeName, 'api.min.js');
  copyJsToPublic(join(NWE_DIR, 'js', 'types'), themeName, 'types.min.js');
  copyJsToPublic(join(NWE_DIR, 'js', 'editor'), themeName, 'editor.min.js');
  
  const scssSourcePath = join(NWE_DIR, SCSS_SOURCE_DIR);
  const cssOutputPath = join(__dirname, CSS_OUTPUT_DIR, themeName);
  console.log(`Watching ${scssSourcePath}...`);
  
  unzipIcomoon(themeName, NWE_DIR).then(async (res) => {
    if (res) {
      const files = res.filter(f => f.endsWith('_icomoon.scss'));
      for (const file of files) {
        let text = (await fsPromises.readFile(file)).toString();
        text = text.replaceAll('.icon-', '.nwi-');
        text = text.replaceAll('[class^="icon-"], [class*=" icon-"]', '[class^="nwi-"], [class*=" nwi-"]');
        text = text.replaceAll("font-family: 'icomoon'", "font-family: 'nwicon'");
        await fsPromises.writeFile(file, text);
      }
      console.log(` ${GREEN}${OK}${RESET} Icomoon setup completed for theme ${NANO}${themeName}${NANO}`);
    }
  });
  
  const args = [`${scssSourcePath}:${cssOutputPath}`, '--style', 'compressed'];
  if (IS_WATCHING) args.unshift('--watch');
  const sassProcess = spawn('sass', args);
  
  sassProcess.stdout.on('data', (data) => {
    console.log(`[${themeName}]: ${data}`);
  });
  
  sassProcess.stderr.on('data', (data) => {
    console.error(`[${themeName} ERROR]: ${data}`);
  });
})();